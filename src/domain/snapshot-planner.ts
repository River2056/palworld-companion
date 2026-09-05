import { resolveRecipe, type CatalogBinding, type CatalogSnapshot, type RecipeSelection, type SnapshotId } from './catalog-snapshot';
import type { Goal, Row, Stock } from './planner';

/** Adapter seam: add retained binding/selection to existing Goal; never infer a binding. */
export interface SnapshotGoal extends Goal, RecipeSelection { catalogBinding: CatalogBinding }
export type SnapshotResolver = (id: SnapshotId) => CatalogSnapshot | undefined;
export type DiagnosticCode = 'snapshot-missing' | 'legacy-unbound' | 'item-missing' | 'recipe-missing' | 'recipe-output-mismatch' | 'cycle' | 'depth-limit' | 'node-limit' | 'unsafe-quantity';
export interface PlanDiagnostic { goalId: string; code: DiagnosticCode; itemId?: string; recipeId?: string; path: string[] }
export type GoalResult = { id: string; status: 'resolved' | 'completed' } | { id: string; status: 'unresolved'; diagnostics: PlanDiagnostic[] };
export interface SnapshotStep { goalId: string; snapshotId: SnapshotId; selectionKey: string; item: string; recipeId: string; batches: number; output: number }
export interface SnapshotGoalPlan { id: string; snapshotId: SnapshotId; recipeId: string; selectionKey: string; batches: number; output: number; surplus: number }
export interface SnapshotPlan {
  complete: boolean;
  scope: 'resolved-goals-only';
  /** These are alternative projections, not additive shopping lists. */
  defaultView: 'direct';
  direct: Row[]; raw: Row[]; allocations: Row[];
  goals: SnapshotGoalPlan[]; steps: SnapshotStep[];
  goalResults: GoalResult[]; diagnostics: PlanDiagnostic[];
}
export interface PlannerLimits { maxDepth?: number; maxNodesPerGoal?: number }
interface State {
  ledger: Map<string, number>; directLedger: Map<string, number>;
  surplus: Map<string, number>; directSurplus: Map<string, number>;
  direct: Map<string, Row>; allocations: Map<string, Row>; raw: Map<string, Row>;
  steps: SnapshotStep[]; goals: SnapshotGoalPlan[];
}
class Unresolved extends Error {
  constructor(readonly diagnostic: PlanDiagnostic) { super(diagnostic.code); }
}
const validInteger = (n: number, minimum = 0) => Number.isSafeInteger(n) && n >= minimum;
function bounded(n: number, max: number, name: string) {
  if (!validInteger(n, 1) || n > max) throw new Error(`Invalid ${name}`);
  return n;
}
/**
 * Pure synchronous planning over already shape/hash-validated snapshots. Semantic gaps are
 * per-goal failures, not global validation errors. Resolver/programming exceptions propagate.
 * Physical stock is shared across bindings; hypothetical surplus is selection-context local.
 * Completed goals do not resolve snapshots or consume resources. Input stock errors are hard.
 */
export function planWorkspace(resolveSnapshot: SnapshotResolver, queue: readonly SnapshotGoal[], stock: Readonly<Stock>, limits: PlannerLimits = {}): SnapshotPlan {
  const maxDepth = bounded(limits.maxDepth ?? 40, 40, 'depth limit');
  const maxNodes = bounded(limits.maxNodesPerGoal ?? 10_000, 100_000, 'node limit');
  if (queue.length > 10_000) throw new Error('Goal queue limit exceeded');
  if (stock === null || typeof stock !== 'object' || Array.isArray(stock)) throw new Error('Invalid stock');
  for (const n of Object.values(stock)) if (!validInteger(n)) throw new Error('Stock counts must be safe nonnegative integers');
  let state: State = { ledger: new Map(Object.entries(stock)), directLedger: new Map(Object.entries(stock)), surplus: new Map(), directSurplus: new Map(), direct: new Map(), raw: new Map(), allocations: new Map(), goals: [], steps: [] };
  const goalResults: GoalResult[] = [], diagnostics: PlanDiagnostic[] = [];
  for (const goal of queue) {
    let path = [goal.item];
    const fail = (code: DiagnosticCode, itemId = path[path.length - 1], recipeId?: string): never => {
      throw new Unresolved({ goalId: goal.id, code, itemId, ...(recipeId === undefined ? {} : { recipeId }), path: [...path] });
    };
    const integer = (n: number, minimum = 0): number => validInteger(n, minimum) ? n : fail('unsafe-quantity');
    const add = (a: number, b: number) => integer(a + b);
    const mul = (a: number, b: number) => integer(a * b);
    // Exact integer division avoids floating rounding at MAX_SAFE_INTEGER boundaries.
    const batchesFor = (count: number, yieldCount: number) => {
      integer(count); integer(yieldCount, 1);
      return integer(Number((BigInt(count) + BigInt(yieldCount) - 1n) / BigInt(yieldCount)));
    };
    try {
      integer(goal.quantity, 1); integer(goal.completed);
      if (goal.completed > goal.quantity) fail('unsafe-quantity');
      const remaining = goal.quantity - goal.completed;
      if (!remaining) { goalResults.push({ id: goal.id, status: 'completed' }); continue; }
      if (!goal.catalogBinding || goal.catalogBinding.state === 'legacy-unbound') fail('legacy-unbound');
      // Narrowing is explicit because fail is a local closure.
      if (goal.catalogBinding.state !== 'bound') fail('legacy-unbound');
      const snapshotId = (goal.catalogBinding as Extract<CatalogBinding, { state: 'bound' }>).snapshotId;
      const snapshot = resolveSnapshot(snapshotId);
      if (!snapshot || snapshot.id !== snapshotId) fail('snapshot-missing');
      const craft = snapshot!.craft;
      const selectionKey = JSON.stringify([snapshotId, goal.recipeId ?? null, Object.entries(goal.recipeOverrides ?? {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)]);
      const key = (item: string) => JSON.stringify([selectionKey, item]);
      const select = (item: string, root = false) => {
        const selection: RecipeSelection = { recipeOverrides: goal.recipeOverrides };
        if (root && Object.hasOwn(goal, 'recipeId')) selection.recipeId = goal.recipeId;
        const r = resolveRecipe(craft, item, selection);
        if (r.status === 'unresolved') return fail(r.code, r.itemId, r.recipeId);
        return r;
      };
      let visited = 0;
      function visit(nextPath: string[]) {
        path = nextPath;
        if (path.length - 1 > maxDepth) fail('depth-limit');
        if (++visited > maxNodes) fail('node-limit');
      }
      // Validate the selected closure even if stock/surplus would hide an invalid branch.
      // Path-local guards allow diamonds; work is bounded even for exponentially wide DAGs.
      function validate(item: string, ancestors: string[], root = false): void {
        visit([...ancestors, item]);
        if (ancestors.includes(item)) fail('cycle');
        const r = select(item, root);
        if (r.status === 'raw') return;
        integer(r.recipe.output_count, 1);
        for (const input of r.recipe.inputs) {
          path = [...ancestors, item, input.item]; integer(input.count, 1);
          validate(input.item, [...ancestors, item]);
        }
      }
      validate(goal.item, [], true); path = [goal.item];
      const root = select(goal.item, true);
      if (root.status !== 'resolved') { fail('recipe-missing'); continue; }
      // No mutable map/row/contribution/step escapes this transaction until success.
      const staged: State = structuredClone(state);
      const record = (rows: Map<string, Row>, item: string, count: number, reserved: number, planned: number) => {
        const row = rows.get(item) ?? { item, required: 0, have: Object.hasOwn(stock, item) ? stock[item] : 0, reserved: 0, planned: 0, missing: 0, contributions: [] };
        const delta = { required: count, reserved, planned, missing: integer(count - reserved - planned) };
        const contribution = row.contributions.find(c => c.goalId === goal.id) ?? { goalId: goal.id, required: 0, reserved: 0, planned: 0, missing: 0 };
        if (!row.contributions.includes(contribution)) row.contributions.push(contribution);
        for (const field of ['required', 'reserved', 'planned', 'missing'] as const) { row[field] = add(row[field], delta[field]); contribution[field] = add(contribution[field], delta[field]); }
        rows.set(item, row);
      };
      const take = (ledger: Map<string, number>, item: string, count: number) => {
        const used = Math.min(ledger.get(item) ?? 0, count);
        ledger.set(item, (ledger.get(item) ?? 0) - used); return used;
      };
      const allocate = (item: string, count: number, direct: boolean, rawLeaf = false) => {
        const reserved = take(direct ? staged.directLedger : staged.ledger, item, count);
        const planned = take(direct ? staged.directSurplus : staged.surplus, key(item), count - reserved);
        record(direct ? staged.direct : staged.allocations, item, count, reserved, planned);
        if (rawLeaf) record(staged.raw, item, count, reserved, planned);
        return count - reserved - planned;
      };
      const step = (item: string, recipeId: string, batches: number, output: number) => staged.steps.push({ goalId: goal.id, snapshotId, selectionKey, item, recipeId, batches, output });
      function requireItem(item: string, count: number, ancestors: string[]) {
        visit([...ancestors, item]);
        const r = select(item);
        const missing = allocate(item, count, false, r.status === 'raw');
        if (!missing || r.status === 'raw') return;
        const batches = batchesFor(missing, r.recipe.output_count), output = mul(batches, r.recipe.output_count);
        for (const input of r.recipe.inputs) { path = [...ancestors, item, input.item]; requireItem(input.item, mul(input.count, batches), [...ancestors, item]); }
        path = [...ancestors, item];
        staged.surplus.set(key(item), add(staged.surplus.get(key(item)) ?? 0, output - missing));
        step(item, r.recipe.id, batches, output);
      }
      const reused = take(staged.surplus, key(goal.item), remaining);
      const batches = batchesFor(remaining - reused, root.recipe.output_count), output = mul(batches, root.recipe.output_count);
      const directReused = take(staged.directSurplus, key(goal.item), remaining);
      const directBatches = batchesFor(remaining - directReused, root.recipe.output_count);
      const directOutput = mul(directBatches, root.recipe.output_count);
      for (const input of root.recipe.inputs) {
        path = [goal.item, input.item];
        if (directBatches) allocate(input.item, mul(input.count, directBatches), true);
        if (batches) requireItem(input.item, mul(input.count, batches), [goal.item]);
      }
      path = [goal.item];
      staged.directSurplus.set(key(goal.item), add(staged.directSurplus.get(key(goal.item)) ?? 0, directOutput - (remaining - directReused)));
      staged.surplus.set(key(goal.item), add(staged.surplus.get(key(goal.item)) ?? 0, output - (remaining - reused)));
      if (batches) step(goal.item, root.recipe.id, batches, output);
      staged.goals.push({ id: goal.id, snapshotId, recipeId: root.recipe.id, selectionKey, batches, output, surplus: output - (remaining - reused) });
      state = staged;
      goalResults.push({ id: goal.id, status: 'resolved' });
    } catch (error) {
      if (!(error instanceof Unresolved)) throw error;
      diagnostics.push(error.diagnostic);
      goalResults.push({ id: goal.id, status: 'unresolved', diagnostics: [error.diagnostic] });
    }
  }
  return { complete: diagnostics.length === 0, scope: 'resolved-goals-only', defaultView: 'direct', direct: [...state.direct.values()], raw: [...state.raw.values()], allocations: [...state.allocations.values()], goals: state.goals, steps: state.steps, goalResults, diagnostics };
}
