import { describe, expect, it } from 'vitest';
import craftReference from '../../docs/research/crafting-reference.json';
import palReference from '../../docs/research/pal-reference.json';
import { createBundledCatalogSnapshot, validateCatalogShape, validateSnapshotShape, validateBundledCatalog, canonicalJson, digestCanonicalJson, createCatalogSnapshot, importCatalogSnapshot, bundledSnapshotPayload, normalizeCatalog, resolveRecipe, type CatalogV2 } from './catalog-snapshot';

function alternateFixture(): CatalogV2 {
  const source = { url: 'https://example.test', revision_url: null, attribution: 'Synthetic test', license: 'test-only' };
  return {
    items: [{ id: 'ore', name: 'Ore', kind: 'raw', source }, { id: 'part', name: 'Part', kind: 'craftable', source }],
    recipes: [
      { id: 'normal', outputItemId: 'part', output_count: 1, inputs: [{ item: 'ore', count: 2 }], stations: [], unlock_level: null, source },
      { id: 'alternate', outputItemId: 'part', output_count: 3, inputs: [{ item: 'ore', count: 4 }], stations: [], unlock_level: null, source },
    ], defaultRecipeByItem: { part: 'normal' },
  };
}

describe('shared root/intermediate recipe resolver', () => {
  it('uses explicit persisted defaults, root choice, and intermediate overrides', () => {
    const craft = alternateFixture();
    craft.recipes.reverse();
    expect(resolveRecipe(craft, 'part')).toMatchObject({ status: 'resolved', recipe: { id: 'normal' } });
    expect(resolveRecipe(craft, 'part', { recipeId: 'alternate', recipeOverrides: { part: 'normal' } })).toMatchObject({ recipe: { id: 'alternate' } });
    expect(resolveRecipe(craft, 'part', { recipeOverrides: { part: 'alternate' } })).toMatchObject({ recipe: { id: 'alternate' } });
    expect(resolveRecipe(craft, 'part', { recipeId: 'unknown' })).toMatchObject({ status: 'unresolved', code: 'recipe-missing' });
    expect(resolveRecipe(craft, 'part', { recipeOverrides: { part: '' } })).toMatchObject({ status: 'unresolved', code: 'recipe-missing' });
    craft.recipes[0].outputItemId = 'ore';
    expect(resolveRecipe(craft, 'part', { recipeId: 'alternate' })).toMatchObject({ status: 'unresolved', code: 'recipe-output-mismatch' });
    expect(resolveRecipe(craft, 'ore')).toMatchObject({ status: 'raw' });
    expect(resolveRecipe(craft, 'missing')).toMatchObject({ status: 'unresolved', code: 'item-missing' });
    delete craft.defaultRecipeByItem.part;
    expect(resolveRecipe(craft, 'part')).toMatchObject({ status: 'unresolved', code: 'recipe-missing' });
  });
});

describe('content-addressed immutable snapshots', () => {
  it('creates the strictly validated bundled snapshot through a public factory', async () => {
    expect(await createBundledCatalogSnapshot()).toEqual(await createCatalogSnapshot(bundledSnapshotPayload()));
  });
  it.each(['manifest', 'pals'] as const)('covers %s bytes and validates ID format without normalization', async field => {
    const snapshot = JSON.parse(JSON.stringify(await createCatalogSnapshot(bundledSnapshotPayload())));
    if (field === 'manifest') snapshot.manifest.datasetId += '-edited';
    else snapshot.pals.species[0].name += '-edited';
    await expect(importCatalogSnapshot(snapshot)).rejects.toThrow(/digest/i);
    snapshot.id = snapshot.id.toUpperCase();
    await expect(importCatalogSnapshot(snapshot)).rejects.toThrow(/ID/);
  });
  it('canonicalizes recursively, preserves array order and hashes UTF-8 bytes', async () => {
    expect(canonicalJson({ z: [3, 1], a: '雪' })).toBe('{"a":"雪","z":[3,1]}');
    expect(canonicalJson({ z: { b: 2, a: 1 } })).toBe('{"z":{"a":1,"b":2}}');
    expect(await digestCanonicalJson({ z: [3, 1], a: '雪' })).toBe('sha256:5a84b5bc749ffa4bb5135a770172033cec65b904e88239fbfa8335b6615ebd63');
  });
  it('clones before async hashing, freezes deeply, verifies imports and keeps provenance', async () => {
    const payload = bundledSnapshotPayload();
    const expected = await createCatalogSnapshot(payload);
    const pending = createCatalogSnapshot(payload);
    payload.craft.recipes[0].inputs[0].count = 999;
    const snapshot = await pending;
    expect(snapshot.id).toBe(expected.id);
    expect(snapshot.manifest.gameVersion).toBeNull();
    expect(snapshot.pals).toEqual(palReference);
    expect(snapshot.manifest.notes).toContain(craftReference.notes[0]);
    expect(Object.isFrozen(snapshot.craft.recipes[0].inputs[0])).toBe(true);
    expect(() => { (snapshot.craft.recipes[0].inputs[0] as { count: number }).count = 88; }).toThrow();
    const imported = await importCatalogSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(imported).toEqual(snapshot);
    expect(imported).not.toBe(snapshot);
    const tampered = JSON.parse(JSON.stringify(snapshot));
    tampered.craft.recipes[0].inputs[0].count++;
    await expect(importCatalogSnapshot(tampered)).rejects.toThrow(/digest/i);
    const reordered = { pals: snapshot.pals, craft: snapshot.craft, manifest: snapshot.manifest };
    expect((await createCatalogSnapshot(reordered)).id).toBe(snapshot.id);
    const differentOrder = bundledSnapshotPayload();
    differentOrder.craft.recipes.reverse();
    expect((await createCatalogSnapshot(differentOrder)).id).not.toBe(snapshot.id);
  });
  it.each([undefined, NaN, Infinity, 1n, () => 1, new Date(), { a: undefined }, Array(2), JSON.parse('{"__proto__":{}}'), Object.defineProperty({}, 'x', { get: () => 1, enumerable: true }), { [Symbol('x')]: 1 }])('rejects unsafe/non-JSON input %#', value => {
    expect(() => canonicalJson(value)).toThrow();
  });
  it('rejects custom array prototypes without executing inherited serialization methods', () => {
    let invoked = false;
    const value = Object.setPrototypeOf([1], {
      map() { invoked = true; return ['999']; },
    });
    expect(() => canonicalJson(value)).toThrow(/Non-JSON object/);
    expect(invoked).toBe(false);
  });
  it('rejects cyclic objects', () => {
    const cycle: { self?: unknown } = {}; cycle.self = cycle;
    expect(() => canonicalJson(cycle)).toThrow();
  });
});

describe('shape boundary versus strict bundle gate', () => {
  it('accepts real references and validates every alternate, not only the default', async () => {
    expect(() => validateBundledCatalog(bundledSnapshotPayload())).not.toThrow();
    const payload = bundledSnapshotPayload(); payload.craft = alternateFixture();
    validateBundledCatalog(payload);
    payload.craft.recipes[1].inputs[0].item = 'part';
    expect(() => validateCatalogShape(payload.craft)).not.toThrow();
    expect(() => validateSnapshotShape(payload)).not.toThrow();
    expect(() => validateBundledCatalog(payload)).toThrow(/cycle/i);
    expect(await importCatalogSnapshot(await createCatalogSnapshot(payload))).toEqual(await createCatalogSnapshot(payload));
    payload.craft.recipes[1].inputs[0].item = 'missing';
    expect(() => validateSnapshotShape(payload)).not.toThrow();
    expect(() => validateBundledCatalog(payload)).toThrow(/missing/i);
  });
  it.each(['items', 'recipes'] as const)('rejects duplicate %s at import and adapter boundaries', async key => {
    const payload = bundledSnapshotPayload(); payload.craft = alternateFixture();
    if (key === 'items') payload.craft.items.push(payload.craft.items[0]);
    else payload.craft.recipes.push(payload.craft.recipes[0]);
    expect(() => validateCatalogShape(payload.craft)).toThrow(/duplicate/i);
    await expect(createCatalogSnapshot(payload)).rejects.toThrow(/duplicate/i);
    await expect(importCatalogSnapshot({ ...payload, id: await digestCanonicalJson(payload) })).rejects.toThrow(/duplicate/i);
    const legacy = structuredClone(craftReference); legacy.recipes.push(legacy.recipes[0]);
    expect(() => normalizeCatalog(legacy)).toThrow(/duplicate/i);
  });
  it.each(['missing-default', 'wrong-output', 'raw-output', 'missing-pal', 'missing-source', 'missing-chain'] as const)('retains semantic %s but rejects it in strict bundles', kind => {
    const p = bundledSnapshotPayload();
    if (kind === 'missing-default') delete p.craft.defaultRecipeByItem.ingot;
    if (kind === 'wrong-output') p.craft.defaultRecipeByItem.ingot = 'nail';
    if (kind === 'raw-output') p.craft.recipes[0].outputItemId = 'ore';
    if (kind === 'missing-pal') p.pals.breedingPairs[0].childId = 'absent';
    if (kind === 'missing-source') p.pals.species[0].sourceId = 'absent';
    if (kind === 'missing-chain') p.pals.exampleChains[0].stepPairIds[0] = 'absent';
    expect(() => validateSnapshotShape(p)).not.toThrow();
    expect(() => validateBundledCatalog(p)).toThrow();
  });
  it.each(['quantity', 'kind', 'source', 'pal-shape', 'duplicate-pal', 'duplicate-pair', 'duplicate-source', 'duplicate-chain', 'manifest', 'extra-envelope'] as const)('rejects malformed %s', kind => {
    const p = bundledSnapshotPayload();
    if (kind === 'quantity') p.craft.recipes[0].inputs[0].count = 1.5;
    if (kind === 'kind') Object.assign(p.craft.items[0], { kind: 'unknown' });
    if (kind === 'source') Object.assign(p.craft.items[0].source, { url: null });
    if (kind === 'pal-shape') Object.assign(p.pals.species[0], { workSuitability: {} });
    if (kind === 'duplicate-pal') p.pals.species.push(p.pals.species[0]);
    if (kind === 'duplicate-pair') p.pals.breedingPairs.push(p.pals.breedingPairs[0]);
    if (kind === 'duplicate-source') p.pals.sources.push(p.pals.sources[0]);
    if (kind === 'duplicate-chain') p.pals.exampleChains.push(p.pals.exampleChains[0]);
    if (kind === 'manifest') Object.assign(p.manifest, { schemaVersion: 3 });
    if (kind === 'extra-envelope') Object.assign(p, { id: 'not-allowed-in-payload' });
    expect(() => validateSnapshotShape(p)).toThrow();
  });
});

describe('catalog adapter', () => {
  it('retains IDs in separate item/recipe namespaces and explicit defaults', () => {
    const craft = normalizeCatalog(craftReference);
    expect(craft.items.map(i => i.id)).toEqual([...craftReference.recipes, ...craftReference.leaf_materials].map(i => i.id));
    expect(craft.recipes.map(r => r.id)).toEqual(craftReference.recipes.map(r => r.id));
    for (const recipe of craft.recipes) {
      expect(recipe.outputItemId).toBe(recipe.id);
      expect(craft.defaultRecipeByItem[recipe.outputItemId]).toBe(recipe.id);
      expect(craft.items.find(i => i.id === recipe.outputItemId)?.kind).toBe('craftable');
    }
    expect(craft.items.find(i => i.id === 'ore')?.kind).toBe('raw');
    expect(palReference.compatibility.gamePatch).toBeNull();
  });
});
