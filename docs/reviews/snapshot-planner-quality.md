# Independent quality review: snapshot planner `3e477b2`

## Verdict

**CHANGES REQUESTED — one important performance issue.** No critical correctness defect found. The selected-recipe, stock/surplus isolation, safe-integer arithmetic and whole-goal rollback implementation withstand source inspection and the checks executed here. However, the synchronous planner takes approximately six seconds for only 2,000 trivial goals, comfortably inside its published caps. Quality approval is withheld for that concrete engine-level scalability problem, not for missing UI/persistence work.

Scope: `src/domain/snapshot-planner.ts`, its tests, the shared snapshot/recipe resolver and the closure specification. Read the prior specification review for contract context, but independently inspected source and executed tests. `git diff 3e477b2 -- src/domain/snapshot-planner.ts src/domain/snapshot-planner.test.ts` was empty. No source, database, configuration or existing reviews were changed; no commits, fetches, rebases or worktrees were made. Concurrent persistence-worker changes were left untouched.

## Important finding

### [PERF] Full accumulated-state cloning causes quadratic synchronous planning time

**Files:** `src/domain/snapshot-planner.ts:45,107,111–113,127,153–154`

```ts
const staged: State = structuredClone(state);
// ...
const contribution = row.contributions.find(c => c.goalId === goal.id) ?? ...;
// ...
staged.goals.push(...);
state = staged;
```

**Problem:** Every successful active goal copies all prior goals, steps, stock maps and all nested row contributions, even when its own recipe has only one raw input. Accumulated state grows with the queue, so total copying is quadratic in queue length. Contribution lookup additionally scans an ever-growing array. The depth/node guards bound selected-graph traversal, not this copying or lookup work. A large initial stock map is likewise copied for each goal, regardless of which stock entries the goal touches.

**Concrete reproduction:** Construct a shape/hash-validated synthetic snapshot through `createCatalogSnapshot`, with craftable `tool`, raw `ore`, and recipe `tool -> 1 ore`, yield 1. Pass distinct goals `g0...gN`, all bound to that snapshot and recipe, each quantity 1/completed 0; stock `{}`; default limits. Each goal uses only three node visits (root/leaf validation plus leaf allocation). Assert all goals resolve and raw required equals N. Run `node /tmp/snapshot-planner-quality.cjs` from this review environment. The harness is a temporary local artifact, not a checked-in regression suite.

| Goals | First execution | Separate repeat |
| ---: | ---: | ---: |
| 100 | 17 ms | 23 ms |
| 500 | 380 ms | 380 ms |
| 1,000 | 1,488 ms | 1,499 ms |
| 2,000 | 6,110 ms | 6,094 ms |

Measured with `performance.now()` around `planWorkspace` alone, excluding snapshot creation; Node v20.20.2 on the review host. First execution overlapped the unit-suite invocation; the separate repeat did not. The queue cap is 10,000, and default node budget is 10,000 **per goal**, so this is not a boundary-abuse fixture. No extrapolated 10,000-goal timing is presented as a measurement. A synchronous call blocks its executing thread for the duration; moving callers to a worker could mitigate UI blocking but does not remove this engine cost. No browser responsiveness claim was tested.

**Recommendation:** Preserve whole-goal atomicity with a transaction overlay/copy-on-write for touched ledger entries and rows, plus per-goal step/goal additions; publish these only after all validation and arithmetic succeeds. Avoid cloning accumulated immutable result history per goal, and index contribution lookups rather than rescanning prior goals. If that refactor is deferred, impose an explicit smaller supported workspace/work budget with a documented failure contract; current traversal caps are not a practical total-work bound. Add a bounded scaling regression/benchmark and keep the existing late-failure rollback tests when changing staging.

## Correctness and contract assessment

- **Rollback is genuinely deep (`:107–154`):** `structuredClone` copies Maps, rows, nested contribution arrays, both physical/surplus projections, steps and goal plans. Only `state = staged` commits. Expected failures discard staging; previous rows cannot be partially changed by an aggregate overflow. This correctness property must survive the performance fix.
- **Arithmetic (`:31–34,55–61,108–114,133–151`):** integer counts are checked, batch ceiling uses exact BigInt division, products and cumulative row/contribution additions are checked, and surplus updates cannot silently exceed safe integers. Remaining quantity is a nonnegative safe-integer subtraction after progress validation. No unchecked arithmetic defect was found.
- **Traversal (`:84–105,128–147`):** the node counter covers validation and allocation together and resets per goal; depth counts edges. Path-local cycle checks allow diamonds; validation checks the full selected closure before stock can hide a broken dependency. These provide finite traversal, not a full runtime/memory guarantee. `resolveRecipe` also performs linear item/recipe array searches (`catalog-snapshot.ts:35,42`); catalog cardinality is not charged to the traversal budget. This is an additional scaling consideration, not a separately measured finding.
- **Selection and isolation (`:68–82,139–151`):** missing/mismatched snapshot IDs do not fall back. Explicit root/override selection uses the shared resolver with output validation. Sorted override entries canonicalize selection context; surplus is segregated by snapshot and policy. Physical stock is shared by item ID across bindings but independently ledgered for direct versus expanded projections. Different explicit policies remain conservatively isolated even if currently equivalent. Root stock is intentionally not consumed for craft-more requests.
- **Error boundary (`:43–47,64–73,156–162`):** invalid stock/limits and resolver exceptions are hard errors; semantic graph failures and unsafe per-goal arithmetic become typed unresolved results. Valid completed goals skip resolution and consumption. One diagnostic reports the first failure, not every issue in a graph. `complete` means structural planning success, not sufficient stock.
- **Caller prerequisites:** snapshot structural/hash validation and immutability are explicitly delegated to the resolver/import boundary (`:36–40`; `catalog-snapshot.ts:91–103`). The typed queue is not a general runtime JSON decoder: callers must validate goal shape and unique goal IDs, retain explicit root choices for new goals, and provide a stable snapshot resolver. Duplicate IDs would coalesce contribution provenance at `:111`; this review does not assert malformed imported queues are supported. Returned results are mutable caller-owned objects, not frozen snapshots. No input mutation was found; frozen-input checks passed.

## Verification actually executed

```sh
npm test -- src/domain/snapshot-planner.test.ts src/domain/catalog-snapshot.test.ts src/domain/planner.test.ts src/domain/planner-provenance.test.ts
```

**PASS: 4 files, 63 tests** (17 snapshot planner, 39 catalog snapshot, 6 planner, 1 provenance).

```sh
node /tmp/snapshot-planner-quality.cjs
```

Executed twice. Independently asserted a failing goal inserted between valid goals leaves all five actionable projections (`direct`, `raw`, `allocations`, `goals`, `steps`) identical to omitting the failed goal; froze queue/goal/binding/stock inputs; checked allocation-phase budget exhaustion leaves no raw rows; checked resolver exceptions and invalid global stock remain hard errors. Both executions passed those assertions and produced the benchmark above. This harness is independent of the prior specification review's 109-case harness; those 109 cases were not claimed as rerun here.

```sh
git diff 3e477b2 -- src/domain/snapshot-planner.ts src/domain/snapshot-planner.test.ts
git diff --check -- src/domain/snapshot-planner.ts src/domain/snapshot-planner.test.ts
```

Both empty/successful. No full application build/typecheck, browser run, persistence/backup/migration/DB test or Guild signoff was attempted. Only this report was added in the repository. The requested pure-engine review is complete; performance remediation remains open.
