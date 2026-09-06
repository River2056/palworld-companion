# Independent specification review: snapshot planner `3e477b2`

## Verdict

**PASS — isolated pure planning engine.** No important allocation or partial-planning defect was found in the reviewed source or the independently executed checks. This is **not** approval of the complete catalog-snapshot closure, persistence, UI, migration, backup, or Guild integration.

Reviewed `src/domain/snapshot-planner.ts` and its actual tests against `docs/plans/catalog-snapshot-closure.md`, especially recipe selection (lines 74–80), runtime binding/partial planning (82–114), and acceptance cases 1–4 (188–191). Read the shared `resolveRecipe` and snapshot construction/validation boundary in `src/domain/catalog-snapshot.ts`, and compared allocation semantics with `src/domain/planner.ts`.

`git diff 3e477b2 -- src/domain/snapshot-planner.ts src/domain/snapshot-planner.test.ts` was empty at review time. The working tree contains concurrent unrelated changes; no source, tests, package configuration, or existing review was edited by this review. No commits were made.

## Contract findings

| Requirement | Evidence and conclusion |
| --- | --- |
| Bound snapshot, no bundled fallback | `snapshot-planner.ts:68–74` resolves the saved ID and rejects absent or mismatched snapshots. Legacy-unbound is a typed failure. The planner does not consult a selected workspace catalog or substitute the bundle. Snapshot bytes are assumed already shape/hash validated by the resolver boundary (`:36–40`); `catalog-snapshot.ts:91–103` supplies copying, freezing and digest verification. |
| Separate item/recipe identity; explicit selections | `snapshot-planner.ts:77–82,103–105` delegates root and intermediate choices to the same resolver. `catalog-snapshot.ts:34–45` gives explicit root, then per-item override, then persisted default precedence, and rejects missing/wrong-output explicit choices without fallback. Actual selected recipe IDs appear in steps/goals. Existing tests exercise alternate root/intermediate recipes and reversed recipe arrays. |
| Direct versus raw alternatives | Separate physical ledgers are created at `:48` and selected at `:120–125`; `direct` is not additive with `raw`. Expanded `allocations` carries intermediate and raw provenance. Raw rows are recorded at the actual snapshot-context allocation, not by reclassifying an aggregate using one catalog. |
| Shared physical stock, no double spend | `:116–125` withdraws physical stock from one item-ID ledger per alternative across all snapshot/selection contexts. Each withdrawal decreases the available balance. Independent checks covered the same item being raw in snapshot A and craftable in B, in both queue orders; total expanded reservations never exceeded physical stock and raw contributions retained the correct context. |
| Craft-more and completed history | Root requests consume only compatible planned surplus, not physical target stock (`:139–143`). Owned intermediates are used before expansion (`:120–133`). Completed valid goals exit before binding/resolver access or staging (`:64–67`). Independent completed-goal cases used an unbound goal with a missing item/recipe and verified no resolver call, reservation, step or contribution. |
| Isolated hypothetical surplus | `:75–76` keys surplus by snapshot ID, explicit root selection and sorted override entries, then item ID. Both direct and expanded surplus use this key. Existing tests confirm identical-policy sharing, different-snapshot/different-policy isolation, and override insertion-order equivalence. An explicit override equivalent to a default is intentionally a separate policy; that conservative behavior matches the documented contract. |
| Whole-goal atomic rollback | Selected closure failures happen before staging (`:90–105`). Allocation uses a deep clone including prior rows/contributions, both stock ledgers, both surplus ledgers, goals and steps (`:107`); the sole commit is `state = staged` at `:154`. Expected failures only append diagnostics/results (`:156–159`). Late arithmetic and late allocation-budget failures therefore cannot leak reservations, surplus, rows or steps. Independent checks compared every actionable projection with a queue omitting the failed goal, including a failure between already committed and subsequent valid goals. |
| Partial errors, not whole-plan loss | `:50–161` processes subsequent goals after typed failures. `complete` is false when any active goal is unresolved and scope is explicitly `resolved-goals-only` (`:162`). Unexpected resolver/programming errors propagate (`:157`); invalid global stock is a hard input error (`:46–47`). One first-failure diagnostic per unresolved goal is reported; this is not an exhaustive graph diagnosis. |
| Unknown items and cycles | `resolveRecipe` accepts only explicitly raw items as leaves. The planner validates the entire selected closure even when stock/surplus would hide a branch. Path-local ancestors detect cycles while allowing diamonds (`:90–101`). Unknown or recipe-less craftable items never become gatherable resources. |
| Finite traversal and arithmetic | Depth defaults to and cannot exceed 40 edges; node visits default to 10,000 and cannot exceed 100,000 per goal; queue is capped at 10,000 (`:43–45,84–88`). The node budget covers closure inspection and allocation traversal and resets per goal. Safe-integer checks cover input counts, aggregate/contribution additions, products, batches and surplus (`:55–61,108–114,133–151`); BigInt division makes batch ceiling exact before safe conversion. |
| Provenance conservation and immutability | Each recorded delta has `required = reserved + planned + missing`; row and per-goal additions are checked (`:108–114`). Independent checks verified all four contribution sums against each direct/raw/allocation row, safe nonnegative integers, physical-stock upper bounds, and no failed/completed goal provenance. Frozen inputs, byte-equivalence checks and deterministic replay passed. |

## Verification actually executed

From `/Users/tungchinchen/projects/palworld-companion`:

```sh
npm test -- src/domain/snapshot-planner.test.ts src/domain/catalog-snapshot.test.ts src/domain/planner.test.ts src/domain/planner-provenance.test.ts
```

**4 test files, 63 tests passed:** 17 snapshot-planner, 39 catalog-snapshot, 6 existing planner, 1 existing provenance. This independently reruns the tests rather than relying on the parent/author's reported results.

```sh
node /tmp/snapshot-planner-spec-independent.cjs
```

**PASS, 109 independent cases**, comprising:

- Two queue orders with the same physical item classified raw in A and craftable in B, including completed unbound/missing-item history; exact expected reservations and raw-context provenance asserted.
- Six failures inserted between valid goals: late multiplication overflow, cycle, unknown dependency, missing explicit recipe, legacy-unbound, and missing snapshot. Every actionable projection was compared with planning only the valid goals.
- One node-budget failure during allocation, after closure validation and an earlier tentative stock withdrawal, followed by a valid goal; exact rollback verified.
- 100 deterministic generated mixed-snapshot queues varying yields, quantities, progress, alternate policies, stock and bindings; safe row/per-goal conservation, stock bounds, frozen-input immutability and deterministic replay verified.

The independent harness loads the actual TypeScript source via the installed TypeScript transpiler and uses Node strict assertions. It constructs explicitly synthetic snapshots through `createCatalogSnapshot`; it does not fabricate production reference facts or modify checked-in tests. The harness is a temporary local review artifact, not an added repository regression suite. Generated conservation checks complement, rather than replace, the exact expected-output cases and source inspection.

```sh
npx eslint src/domain/snapshot-planner.ts src/domain/snapshot-planner.test.ts --max-warnings 0
git diff --check -- src/domain/snapshot-planner.ts src/domain/snapshot-planner.test.ts
```

Both passed; ESLint reported no issues.

## Scope boundaries and remaining acceptance work

- This module deliberately remains a separate pure API; the unchanged legacy planner tests passing does not establish that production consumers have migrated to the snapshot planner.
- `RecipeSelection.recipeId` remains optional and the engine can use a persisted snapshot default when absent. **New-goal creation/storage must enforce saving the explicit chosen root ID**, as required by the closure plan; this report does not sign off that boundary or its reload/export/import behavior.
- `complete` means all active goals resolved structurally/arithmetic-safely, **not** that stock covers every shortage. Consumers must honor shortages, per-goal unresolved status and `resolved-goals-only`; readiness/publication UI was not reviewed.
- Snapshot immutability/hash validity is a resolver/import precondition, not something this synchronous planner rehashes. Retention, put-if-absent storage, scoped restore and missing-snapshot recovery require their own integration tests.
- Finite node/depth limits are verified, not a performance/service-level guarantee. Snapshot size limits and whole-workspace scaling remain separate boundaries; cloning committed state and array-based recipe lookup were not benchmarked.
- No full application typecheck/build/test suite, browser test, database transaction/fencing test, migration preview/accept/revert test, backup round-trip, or Guild publication test was run for this review. Those broader closure acceptance gates remain unapproved here.
