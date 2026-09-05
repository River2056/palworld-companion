import { describe, expect, test } from 'vitest';
import { bundledSnapshotPayload, createCatalogSnapshot, type CatalogSnapshot, type CatalogV2, type RecipeV2 } from './catalog-snapshot';
import { planWorkspace, type SnapshotGoal } from './snapshot-planner';

// All alternatives and broken graphs here are SYNTHETIC, not production reference facts.
const source = { url: 'https://example.invalid/synthetic', revision_url: null, attribution: 'Synthetic test fixture', license: 'Test only' };
const recipe = (id: string, outputItemId: string, inputs: [string, number][], output_count = 1): RecipeV2 => ({ id, outputItemId, inputs: inputs.map(([item, count]) => ({ item, count })), output_count, stations: [], unlock_level: null, source });
async function fixture(recipes = [recipe('make-tool', 'tool', [['bar', 2]]), recipe('make-bar', 'bar', [['ore', 3]], 2), recipe('alt-bar', 'bar', [['wood', 1]], 3)], extra: string[] = []) {
  const craft: CatalogV2 = { items: ['tool', 'bar', ...extra].map(id => ({ id, name: id, kind: 'craftable', source })), recipes, defaultRecipeByItem: Object.fromEntries(recipes.map(r => [r.outputItemId, r.id])) };
  craft.items.push(...['ore', 'wood'].map(id => ({ id, name: id, kind: 'raw' as const, source })));
  craft.defaultRecipeByItem.bar = 'make-bar';
  return createCatalogSnapshot({ ...bundledSnapshotPayload(), craft });
}
const goal = (snapshot: CatalogSnapshot, id: string, overrides: Partial<SnapshotGoal> = {}): SnapshotGoal => ({ id, item: 'tool', quantity: 1, completed: 0, notes: '', catalogBinding: { state: 'bound', snapshotId: snapshot.id }, recipeId: 'make-tool', ...overrides });
const resolver = (...snapshots: CatalogSnapshot[]) => (id: string) => snapshots.find(s => s.id === id);
function conservation(p: ReturnType<typeof planWorkspace>) {
  for (const row of [...p.direct, ...p.raw, ...p.allocations]) {
    expect(row.required).toBe(row.reserved + row.planned + row.missing);
    for (const key of ['required', 'reserved', 'planned', 'missing'] as const) expect(row.contributions.reduce((n, c) => n + c[key], 0)).toBe(row[key]);
  }
}
describe('snapshot-aware partial planner', () => {
  test('separate recipe identity, deterministic default and intermediate/root overrides', async () => {
    const a = await fixture();
    const b = await createCatalogSnapshot({ ...bundledSnapshotPayload(), craft: { ...a.craft, items: [...a.craft.items], recipes: [...a.craft.recipes].reverse(), defaultRecipeByItem: { ...a.craft.defaultRecipeByItem } } });
    for (const s of [a, b]) {
      expect(planWorkspace(resolver(s), [goal(s, 'g')], {}).raw).toMatchObject([{ item: 'ore', required: 3 }]);
      const p = planWorkspace(resolver(s), [goal(s, 'g', { recipeOverrides: { bar: 'alt-bar' } })], {});
      expect(p.raw).toMatchObject([{ item: 'wood', required: 1 }]);
      expect(p.steps.map(s => s.recipeId)).toEqual(['alt-bar', 'make-tool']);
      expect(planWorkspace(resolver(s), [goal(s, 'g', { item: 'bar', recipeId: 'alt-bar' })], {}).raw[0].item).toBe('wood');
    }
  });
  test.each(['unknown', 'cycle', 'missing'])('rolls back every branch for %s while preserving queue order', async failure => {
    const dependency = failure === 'unknown' ? 'ghost' : failure === 'cycle' ? 'bad' : 'empty';
    const a = await fixture([recipe('make-tool', 'tool', [['bar', 2]]), recipe('make-bar', 'bar', [['ore', 3]], 2), recipe('make-bad', 'bad', [['ore', 2], [dependency, 1]])], ['bad', 'empty']);
    const queue = [goal(a, 'bad', { item: 'bad', recipeId: 'make-bad' }), goal(a, 'first'), goal(a, 'second')];
    const p = planWorkspace(resolver(a), queue, { ore: 4 });
    expect(p.complete).toBe(false);
    expect(p.goalResults.map(r => r.status)).toEqual(['unresolved', 'resolved', 'resolved']);
    expect(p.diagnostics[0].code).toBe(failure === 'unknown' ? 'item-missing' : failure === 'cycle' ? 'cycle' : 'recipe-missing');
    expect(p.raw[0]).toMatchObject({ required: 6, reserved: 4, missing: 2, contributions: [{ goalId: 'first', reserved: 3 }, { goalId: 'second', reserved: 1 }] });
    expect(p.steps.some(s => s.goalId === 'bad')).toBe(false);
    expect(p.direct).toEqual(planWorkspace(resolver(a), queue.slice(1), { ore: 4 }).direct);
    conservation(p);
  });
  test('a late arithmetic failure rolls back reservations AND hypothetical surplus', async () => {
    const a = await fixture([recipe('make-tool', 'tool', [['bar', 2]]), recipe('make-bar', 'bar', [['ore', 3]], 3), recipe('bad', 'bad', [['bar', 1], ['wood', Number.MAX_SAFE_INTEGER]])], ['bad']);
    const p = planWorkspace(resolver(a), [goal(a, 'bad', { item: 'bad', recipeId: 'bad', quantity: 2 }), goal(a, 'good')], { ore: 3 });
    const only = planWorkspace(resolver(a), [goal(a, 'good')], { ore: 3 });
    expect(p.diagnostics[0].code).toBe('unsafe-quantity');
    expect(p.raw).toEqual(only.raw); expect(p.direct).toEqual(only.direct); expect(p.steps).toEqual(only.steps);
    conservation(p);
  });
  test.each(['overflow', 'budget'] as const)('late %s after committed history leaves every projection unchanged', async failure => {
    const a = await fixture([
      recipe('make-tool', 'tool', [['bar', 1]], 2),
      recipe('make-bar', 'bar', [['ore', 1]], 3),
      recipe('bad', 'bad', [['bar', 2], ['wood', Number.MAX_SAFE_INTEGER]]),
    ], ['bad']);
    const first = goal(a, 'first');
    const last = goal(a, 'last', { quantity: 3 });
    // Validation visits four nodes. Allocation crafts bar (and records its step)
    // before visiting wood exceeds six; overflow instead fails on wood's product.
    const bad = goal(a, 'bad', { item: 'bad', recipeId: 'bad', quantity: failure === 'overflow' ? 2 : 1 });
    const stock = { bar: 1, ore: 4, wood: 3 };
    const limits = failure === 'budget' ? { maxNodesPerGoal: 6 } : {};
    const before = JSON.stringify({ a, first, last, bad, stock });
    const only = planWorkspace(resolver(a), [first, last], stock, limits);
    const p = planWorkspace(resolver(a), [first, bad, last], stock, limits);
    expect(p.diagnostics.map(d => d.code)).toEqual([failure === 'overflow' ? 'unsafe-quantity' : 'node-limit']);
    expect(p.goalResults.map(g => g.status)).toEqual(['resolved', 'unresolved', 'resolved']);
    for (const projection of ['direct', 'raw', 'allocations', 'goals', 'steps'] as const) expect(p[projection]).toEqual(only[projection]);
    expect(JSON.stringify({ a, first, last, bad, stock })).toBe(before);
    conservation(p);
  });
  test.each(['overflow', 'budget'] as const)('late %s restores consumed prior surplus in both projections', async failure => {
    const a = await fixture([
      recipe('make-tool', 'tool', [['bar', 1], ['wood', failure === 'budget' ? 1 : 4_503_599_627_370_495]], 3),
      recipe('make-bar', 'bar', [['ore', 1]], 3),
    ]);
    const first = goal(a, 'first');
    const bad = goal(a, 'bad', { quantity: 9 });
    const reuse = goal(a, 'reuse', { quantity: 2 });
    const follow = goal(a, 'follow', { item: 'bar', recipeId: 'make-bar' });
    const stock = { bar: 1, ore: 4, wood: 3 };
    const limits = failure === 'budget' ? { maxNodesPerGoal: 6 } : {};
    // Budget mode must reach the allocation visit, not overflow while multiplying wood.
    const failing = failure === 'budget' ? { ...bad, quantity: 6 } : bad;
    const only = planWorkspace(resolver(a), [first, reuse, follow], stock, limits);
    const p = planWorkspace(resolver(a), [first, failing, reuse, follow], stock, limits);
    expect(p.diagnostics.map(d => d.code)).toEqual([failure === 'overflow' ? 'unsafe-quantity' : 'node-limit']);
    expect(p.goalResults.map(g => g.status)).toEqual(['resolved', 'unresolved', 'resolved', 'resolved']);
    for (const projection of ['direct', 'raw', 'allocations', 'goals', 'steps'] as const) expect(p[projection]).toEqual(only[projection]);
    expect(p.goals.find(g => g.id === 'reuse')?.batches).toBe(0);
    conservation(p);
  });
  test('2,000 unique simple goals retain complete provenance within a generous runtime budget', async () => {
    const a = await fixture([recipe('make-tool', 'tool', [['ore', 1]])]);
    const sizes = process.env.SNAPSHOT_PLANNER_BENCH ? [100, 500, 1000, 2000] : [2000];
    planWorkspace(resolver(a), Array.from({ length: 100 }, (_, i) => goal(a, `warm-${i}`)), {});
    for (const size of sizes) {
      const queue = Array.from({ length: size }, (_, i) => goal(a, `g${i}`));
      const start = performance.now();
      const p = planWorkspace(resolver(a), queue, {});
      const elapsed = performance.now() - start;
      if (process.env.SNAPSHOT_PLANNER_BENCH) console.log(JSON.stringify({ goals: size, milliseconds: elapsed }));
      expect(p.complete).toBe(true);
      expect(p.goalResults).toHaveLength(size);
      expect(p.goals).toHaveLength(size);
      expect(p.steps).toHaveLength(size);
      expect(p.raw[0]).toMatchObject({ required: size, reserved: 0, planned: 0, missing: size });
      expect(p.raw[0].contributions.map(c => c.goalId)).toEqual(queue.map(g => g.id));
      conservation(p);
      // Deliberately broad: catches the measured six-second regression, not micro-timing.
      expect(elapsed).toBeLessThan(3000);
    }
  }, 30_000);
  test('same item across A/B uses bound recipes and one physical stock ledger', async () => {
    const a = await fixture();
    const b = await fixture([recipe('b-tool', 'tool', [['bar', 2]]), recipe('make-bar', 'bar', [['ore', 7]], 2)]);
    const p = planWorkspace(resolver(a, b), [goal(a, 'a'), goal(b, 'b', { recipeId: 'b-tool' })], { ore: 5 });
    expect(p.raw[0]).toMatchObject({ required: 10, reserved: 5, missing: 5, contributions: [{ goalId: 'a', required: 3, reserved: 3 }, { goalId: 'b', required: 7, reserved: 2 }] });
    expect(p.steps.map(s => s.snapshotId)).toEqual([a.id, a.id, b.id, b.id]); conservation(p);
  });
  test('surplus shares only identical snapshot AND canonical selection contexts', async () => {
    const a = await fixture([recipe('make-tool', 'tool', [['bar', 1]], 2), recipe('make-bar', 'bar', [['ore', 3]], 2)]);
    const b = await fixture([recipe('make-tool', 'tool', [['bar', 1]], 2), recipe('make-bar', 'bar', [['ore', 4]], 2)]);
    const same = planWorkspace(resolver(a), [goal(a, 'a'), goal(a, 'b')], {});
    expect(same.goals.map(g => g.batches)).toEqual([1, 0]);
    const mixed = planWorkspace(resolver(a, b), [goal(a, 'a'), goal(b, 'b')], {});
    expect(mixed.goals.map(g => g.batches)).toEqual([1, 1]);
    const policy = planWorkspace(resolver(a), [goal(a, 'a'), goal(a, 'b', { recipeOverrides: { bar: 'make-bar' } })], {});
    expect(policy.goals.map(g => g.batches)).toEqual([1, 1]);
    const canonical = planWorkspace(resolver(a), [goal(a, 'a', { recipeOverrides: { bar: 'make-bar', unused: 'unused' } }), goal(a, 'b', { recipeOverrides: { unused: 'unused', bar: 'make-bar' } })], {});
    expect(canonical.goals.map(g => g.batches)).toEqual([1, 0]); conservation(mixed);
  });
  test('craft-more ignores target stock, uses owned intermediates, and alternatives are nonadditive', async () => {
    const a = await fixture();
    const p = planWorkspace(resolver(a), [goal(a, 'g')], { tool: 99, bar: 1, ore: 2 });
    expect(p.goals[0].batches).toBe(1);
    expect(p.direct).toMatchObject([{ item: 'bar', required: 2, reserved: 1, missing: 1 }]);
    expect(p.raw).toMatchObject([{ item: 'ore', required: 3, reserved: 2, missing: 1 }]); conservation(p);
  });
  test('missing bindings and explicit invalid selections never fall back', async () => {
    const a = await fixture();
    const p = planWorkspace(resolver(a), [goal(a, 'legacy', { catalogBinding: { state: 'legacy-unbound' } }), goal(a, 'absent', { catalogBinding: { state: 'bound', snapshotId: 'sha256:absent' } }), goal(a, 'bad-root', { recipeId: 'alt-bar' }), goal(a, 'bad-intermediate', { recipeOverrides: { bar: 'absent' } }), goal(a, 'good')], {});
    expect(p.diagnostics.map(d => d.code)).toEqual(['legacy-unbound', 'snapshot-missing', 'recipe-output-mismatch', 'recipe-missing']);
    expect(p.goals.map(g => g.id)).toEqual(['good']);
  });
  test('bounds depth and traversal work without confusing shared subtrees for cycles', async () => {
    const a = await fixture();
    expect(planWorkspace(resolver(a), [goal(a, 'g')], {}, { maxDepth: 1 }).diagnostics[0].code).toBe('depth-limit');
    expect(planWorkspace(resolver(a), [goal(a, 'g')], {}, { maxNodesPerGoal: 2 }).diagnostics[0].code).toBe('node-limit');
    const diamond = await fixture([recipe('make-tool', 'tool', [['bar', 1], ['other', 1]]), recipe('make-bar', 'bar', [['ore', 1]]), recipe('other', 'other', [['bar', 1]])], ['other']);
    expect(planWorkspace(resolver(diamond), [goal(diamond, 'g')], {}).complete).toBe(true);
  });
  test('aggregate overflow cannot corrupt earlier valid goals', async () => {
    const a = await fixture([recipe('make-tool', 'tool', [['ore', Number.MAX_SAFE_INTEGER]])]);
    const p = planWorkspace(resolver(a), [goal(a, 'first'), goal(a, 'overflow')], {});
    expect(p.raw[0].required).toBe(Number.MAX_SAFE_INTEGER);
    expect(p.goalResults.map(g => g.status)).toEqual(['resolved', 'unresolved']); conservation(p);
  });
  test('batch multiplication overflow, fractional/negative progress and invalid global stock', async () => {
    const a = await fixture([recipe('make-tool', 'tool', [['ore', 1]], 2)]);
    for (const overrides of [{ quantity: Number.MAX_SAFE_INTEGER }, { quantity: 1.5 }, { completed: -1 }, { completed: 2 }]) expect(planWorkspace(resolver(a), [goal(a, 'g', overrides)], {}).diagnostics[0].code).toBe('unsafe-quantity');
    for (const n of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(() => planWorkspace(resolver(a), [], { ore: n })).toThrow();
    expect(() => planWorkspace(() => { throw new Error('storage broke'); }, [goal(a, 'g')], {})).toThrow('storage broke');
  });
  test('a budget-exhausted wide goal cannot starve a later small goal', async () => {
    const a = await fixture([recipe('make-tool', 'tool', [['ore', 1]]), recipe('wide', 'wide', [['left', 1], ['right', 1]]), recipe('left', 'left', [['ore', 1]]), recipe('right', 'right', [['wood', 1]])], ['wide', 'left', 'right']);
    const p = planWorkspace(resolver(a), [goal(a, 'wide', { item: 'wide', recipeId: 'wide' }), goal(a, 'good')], { ore: 1 }, { maxNodesPerGoal: 4 });
    expect(p.diagnostics[0].code).toBe('node-limit');
    expect(p.raw).toMatchObject([{ item: 'ore', required: 1, reserved: 1, missing: 0 }]);
    expect(p.goalResults[1].status).toBe('resolved'); conservation(p);
  });
  test('mixed-depth sibling demand conserves stock and surplus in either order', async () => {
    for (const inputs of [[['bar', 2], ['other', 1]], [['other', 1], ['bar', 2]]] as [string, number][][]) {
      const a = await fixture([recipe('make-tool', 'tool', inputs), recipe('make-bar', 'bar', [['ore', 2]], 2), recipe('other', 'other', [['bar', 1]])], ['other']);
      const p = planWorkspace(resolver(a), [goal(a, 'g')], { bar: 1 });
      expect(p.raw).toMatchObject([{ item: 'ore', required: 2, missing: 2 }]);
      expect(p.steps.filter(s => s.item === 'bar')).toHaveLength(1);
      expect(p.allocations.find(r => r.item === 'bar')).toMatchObject({ required: 3, reserved: 1, planned: inputs[0][0] === 'bar' ? 1 : 0 }); conservation(p);
    }
  });
  test('queue reversal changes reservation provenance, not aggregate conservation', async () => {
    const a = await fixture();
    for (const ids of [['first', 'second'], ['second', 'first']]) {
      const p = planWorkspace(resolver(a), ids.map(id => goal(a, id)), { ore: 4 });
      expect(p.raw[0].contributions.map(c => [c.goalId, c.reserved])).toEqual([[ids[0], 3], [ids[1], 1]]); conservation(p);
    }
  });
  test('default depth cap rejects a deep chain with an exact diagnostic path', async () => {
    const ids = Array.from({ length: 42 }, (_, i) => `chain-${i}`);
    const a = await fixture([recipe('make-tool', 'tool', [['ore', 1]]), ...ids.map((id, i) => recipe(id, id, [[ids[i + 1] ?? 'ore', 1]]))], ids);
    const p = planWorkspace(resolver(a), [goal(a, 'deep', { item: ids[0], recipeId: ids[0] }), goal(a, 'good')], {});
    expect(p.diagnostics[0]).toMatchObject({ code: 'depth-limit', path: ids });
    expect(p.goals.map(g => g.id)).toEqual(['good']);
  });
  test('completed goals consume nothing and inputs are unchanged', async () => {
    const a = await fixture(); const queue = [goal(a, 'g'), goal(a, 'done', { completed: 1 })]; const stock = { ore: 2 };
    const before = JSON.stringify({ a, queue, stock });
    const p = planWorkspace(resolver(a), queue, stock);
    expect(p.goalResults.map(g => g.status)).toEqual(['resolved', 'completed']);
    expect(JSON.stringify({ a, queue, stock })).toBe(before);
    conservation(p);
  });
});
