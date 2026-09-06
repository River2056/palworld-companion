# Independent final quality review: snapshot planner `5f164de`

## Verdict: APPROVED — scoped pure planner remediation

No remaining blocking defect found. This review **supersedes the quadratic accumulated-state-cloning finding and CHANGES REQUESTED verdict** in `docs/reviews/snapshot-planner-quality.md` for the planner scope. The old regression was independently reproduced from `3e477b2`, and the fix reduced the same 2,000-goal fixture from **5,971.046 ms to 14.105 ms** in an in-memory comparison. Atomic rollback and complete output equivalence passed the checks below.

This is not whole-product, UI, persistence, or release approval. Existing array-based recipe lookup and per-goal traversal limits remain explicit limitations, not a universal user-latency SLA.

## Scope and source identity

Read the actual implementation, tests, previous quality review, and `snapshot-planner-performance.md`; inspected the fix's source diff. `git diff 5f164de -- src/domain/snapshot-planner.ts src/domain/snapshot-planner.test.ts` was empty. Historical and fixed planners were loaded directly from Git with `git show`, bundled through local esbuild using `write:false`, and evaluated in separate CommonJS modules in memory. No checkout, fetch, rebase, worktree, source replacement, or commit was performed. Concurrent unrelated worktree changes were left untouched. Only this report was written.

## Atomicity and aliasing assessment

- **Map restoration — `snapshot-planner.ts:55–61,139–148,159–174,178–183`:** each setter journals both previous value and key presence before writing. Reverse replay restores repeated writes in their original sequence and deletes newly introduced keys. Both physical ledgers and both hypothetical-surplus ledgers use this setter. No unjournaled ledger write was found.
- **Existing rows/contributions — `:119–137`:** shallow row snapshots deliberately alias the contribution array; this is safe under the actual restricted mutation pattern, not a general deep-copy replacement. Row fields are scalars except that array. Each touched contribution has its own scalar snapshot, and each append records the previous array length. Reverse replay restores later updates before earlier updates, restores partial numeric-field changes if checked addition throws, then truncates appended provenance. Existing contributions stay in the index and are restored in place.
- **New rows/index entries — `:122–137`:** the contribution undo is installed before append/index insertion or checked aggregation. New row-map entries are journaled separately after successful aggregation, so reverse replay removes map membership before undoing that row's earlier updates. Newly inserted contribution IDs are deleted on rollback. A discarded new row can remain a WeakMap key only while otherwise referenced; it is not retained by a strong global index or exposed in the result. An existing committed row already has its index. No stale contribution entry or escaping index was found.
- **Append-only history — `:56,150,175–180`:** saved step/goal lengths restore history without copying prior objects. The catch restores state before distinguishing typed unresolved failures from propagated programming errors. All state/index/journals are invocation-local, and snapshot resolution and closure validation precede state writes.
- **Observed rollback:** checked-in tests cover newly created and previously committed rows, late arithmetic overflow, allocation-phase node exhaustion, consumed prior root surplus in both projections, and follow-on stock/surplus use. Independent same-ID retry probes additionally exercise deletion of a failed goal's new contribution-index entries and restoration of already existing contributions. Duplicate IDs here are an internal regression stress probe for historical coalescing behavior, not a relaxation of caller-side unique-ID validation requirements.

## Independent benchmark

Same fixture construction as `snapshot-planner.test.ts:98–118`: validated synthetic snapshot, selected `tool -> 1 ore` recipe with yield 1, fixed small catalog, distinct goal IDs, quantity 1/completed 0, empty stock, default limits. Warmed each implementation with 100 goals. Snapshot creation, queue construction, bundling, and assertions were outside the measured `performance.now()` interval. Each result was checked for completeness, exact goal/step/result counts, ordered provenance, row conservation, and full equality with the fixed implementation.

Node **v20.20.2**, same development host; actual measured values, rounded to three decimals:

| Goals | `3e477b2` in-memory baseline (ms) | `5f164de` in-memory fixed (ms) | Fixed checked-in Vitest benchmark (ms) |
| ---: | ---: | ---: | ---: |
| 100 | 16.624 | 0.771 | 1.248 |
| 500 | 378.357 | 4.337 | 7.239 |
| 1,000 | 1,476.963 | 7.653 | 8.905 |
| 2,000 | 5,971.046 | 14.105 | 19.770 |

These independently corroborate the remediation report's conclusion, not its exact process-dependent timings. Accumulated history is no longer copied per goal; contribution lookup uses an internal Map rather than scanning prior contributions (`:50–51,124`). Goal-local journal space scales with that goal's writes, while the persistent contribution index scales with result provenance. The simple fixed-catalog measurements support near-linear queue bookkeeping, not constant-time planning for arbitrary catalogs or graphs.

## Verification actually executed

1. `SNAPSHOT_PLANNER_BENCH=1 npm test -- src/domain/snapshot-planner.test.ts src/domain/catalog-snapshot.test.ts src/domain/planner.test.ts src/domain/planner-provenance.test.ts` — **PASS: 68 tests across four files**, including 22 snapshot-planner tests; Vitest 3.2.7. The checked-in benchmark's three-second guard passed.
2. Independent ephemeral Node/esbuild harness — **PASS: 300 deterministic seeded queues, 25 goals each**, full deep output comparison against `3e477b2`, including diagnostics/order and all actionable projections. Mixed snapshots, stock, root choices, alternate overrides, missing recipes, completion, diamond/repeated dependency paths, unsafe quantities, repeated IDs, and varying node budgets were included; inputs were recursively frozen and row/provenance conservation checked.
3. Same harness — **PASS: four targeted rollback probes** combining overflow/node-budget failure with new/existing same-ID contribution history. Compared `direct`, `raw`, `allocations`, `goals`, and `steps` against omission of the failed goal; checked exact failure code, baseline equality, frozen inputs, and result isolation across invocations.
4. Scoped TypeScript command from the remediation report — **PASS** (`tsc --noEmit`, ES2022, strict, Bundler resolution, explicit planner source/test inputs).
5. `npx eslint src/domain/snapshot-planner.ts src/domain/snapshot-planner.test.ts --max-warnings 0` — **PASS**.
6. `git diff --check 3e477b2 5f164de -- src/domain/snapshot-planner.ts src/domain/snapshot-planner.test.ts` — **PASS**.

Harness correction: the first exploratory run completed and verified the benchmark, then snapshot validation rejected a synthetic diamond recipe containing duplicate input identities. The fixture was corrected to a valid diamond with repeated demand through separate paths; the differential and targeted rollback checks then passed. This was a harness-input error, not an engine failure. No unexecuted checks or fabricated timings are included; the ephemeral harness was not added as a permanent regression suite.

## Remaining boundaries

`resolveRecipe` still searches item/recipe arrays; lookup is **not O(1)**. Selection serialization, catalog cardinality, large stock inputs, output size, and maximum-width queues can still incur substantial work. Node/depth caps bound traversal per goal, not full workspace runtime or browser responsiveness. Snapshot validation/immutability and queue-shape validation remain caller prerequisites. No full application build, browser measurement, persistence/backup/migration test, or Guild signoff was attempted.

**Blocking:** none found within the requested engine fix and atomic rollback scope. **Non-blocking:** retain the documented scaling boundaries and the permanent rollback/performance regression tests.
