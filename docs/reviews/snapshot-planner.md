# Snapshot-aware partial planner — isolated delivery

## Exported API and adapter seam

`src/domain/snapshot-planner.ts` exports `planWorkspace(resolveSnapshot, queue, stock, limits?)` and the types `SnapshotGoal`, `SnapshotResolver`, `DiagnosticCode`, `PlanDiagnostic`, `GoalResult`, `SnapshotStep`, `SnapshotGoalPlan`, `SnapshotPlan`, `PlannerLimits`.

- `SnapshotGoal` extends the existing `Goal` and stable `RecipeSelection`, adding required `catalogBinding`. Existing persisted records must be explicitly adapted to `legacy-unbound` when historical binding is unavailable; never infer a binding from the current bundle. Newly bound goal creation should persist its explicit root recipe ID.
- The synchronous resolver takes the bound `SnapshotId` and returns that exact immutable, already shape/hash-validated `CatalogSnapshot`, or `undefined`. A mismatched returned ID is also `snapshot-missing`. Fetch snapshots before invoking this pure API; storage exceptions propagate, rather than being converted into plausible planning results.
- This is an isolated module: existing `planner.ts`, source/package files, storage, UI, publication, migrations, and production reference JSON are untouched. No production caller has been migrated and no integration completion is claimed.

## Behavior and invariants

Recipe identity is independent of output identity. All selected branches use the shared `resolveRecipe`: explicit root recipe, intermediate per-item override, then persisted snapshot default. Missing or wrong-output explicit choices never fall back. Only declared raw items are raw requirements; raw root craft requests are unresolved (`recipe-missing`).

Selected dependency closure is checked before allocation, including branches that existing stock or planned surplus might otherwise hide. This is deliberately conservative: known stock does not certify an invalid selected recipe graph. The first expected failure per goal carries its exact item path. Shared subtrees are not cycles. Unknown/cyclic/missing branches do not affect valid queue neighbors.

Each active goal stages a deep clone of both projection ledgers, rows/contributions, surplus, goals, and steps. Only full success commits. Arithmetic failures after earlier successful branches discard tentative stock reservations and newly produced surplus. Unexpected errors propagate. Invalid stock shape/counts are hard input errors; invalid goal quantities/progress are typed per-goal `unsafe-quantity` failures.

Physical stock uses one item-ID ledger across all queue goals, independent of snapshot, for each alternative projection. Direct and expanded raw views use separate ledgers and are **not additive**; the return value explicitly identifies `direct` as default. `allocations` contains the expanded intermediate and raw provenance. `raw` records raw contributions at allocation time, avoiding incorrect classification if an item's kind differs across snapshots.

Hypothetical surplus keys include snapshot ID, root selection, sorted intermediate override entries, and item ID. Different snapshot or explicit selection policies never reuse each other's hypothetical production. Override insertion order does not affect sharing. Including the full explicit context is intentionally conservative: an explicit override equivalent to a default is still a different policy. Physical finished-item stock never cancels a craft-more target; compatible planned surplus can satisfy later target demand. Completed goals consume nothing and return `status: 'completed'` without resolving a snapshot.

Every aggregate row has per-goal contributions; steps and goal calculations carry snapshot ID, selected recipe ID and canonical selection key. `required = reserved + planned + missing`, and contribution fields sum to their row fields. `complete` means no active goal is unresolved, **not** that all material shortages are zero. Consumers must retain `scope: 'resolved-goals-only'` and must not publish unresolved goals.

## Bounds

All quantities, additions, multiplication and resulting output must be nonnegative safe integers (positive recipe counts/yields and goal quantities). Batch ceiling uses exact BigInt division before conversion to avoid floating-point division rounding at the safe-integer boundary. Output overflow remains a typed failure even if requested units themselves are safe.

Default maximum dependency depth is 40 edges; callers may lower, not raise, it. The default per-goal node budget is 10,000, configurable from 1 through 100,000. It counts both selected-closure inspection and allocation traversal, so an expensive DAG or a late allocation limit cannot evade rollback. Each goal has a fresh budget so a blocked goal does not exhaust later goals' traversal allowance. Queue length is capped at 10,000. Invalid limit configuration is a hard error. This bounds graph work, not a benchmark or global optimality claim; snapshot shape/import size validation remains the caller's boundary responsibility.

## Verification actually run

Test-first run failed because the new module did not exist. After implementation:

- `npm test -- src/domain/snapshot-planner.test.ts src/domain/planner.test.ts src/domain/planner-provenance.test.ts src/domain/catalog-snapshot.test.ts`: **4 files, 63 tests passed**, including **17 new planner tests**.
- `npm run typecheck`: passed on the observed combined working tree.
- `npx eslint src/domain/snapshot-planner.ts src/domain/snapshot-planner.test.ts --max-warnings 0`: passed.

New tests use explicitly labeled synthetic alternatives and malformed semantic graphs. They exercise root/intermediate selection, recipe-array order independence, missing bindings, wrong-output/missing selections, mixed valid plus unknown/cycle/missing-recipe queues, late allocation/surplus rollback, aggregate and batch overflow, same output with different A/B recipes, physical-stock sharing, context-local surplus, canonical override order, craft-more/owned-intermediate semantics, nonadditive projections, completed goals, immutable inputs, conservation/provenance, reversed queues, mixed-depth siblings, diamonds, exact depth paths, node-budget isolation, and uncaught resolver failures.

No full application test/build, storage round-trip, browser, or UI integration gate is represented by these isolated results.
