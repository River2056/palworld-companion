# Snapshot planner performance remediation

## Outcome and scope

Removed the accumulated-state `structuredClone` and growing contribution-array scans from `planWorkspace`. Whole-goal rollback, output/API shape, queue/traversal caps, recipe selection, physical stock sharing, and selection-local surplus semantics are unchanged. Only `src/domain/snapshot-planner.ts`, its test file, and this report are delivery files. No storage/UI/contracts were edited.

## Transaction and complexity argument

- Planner state remains private to one synchronous invocation. A goal cannot expose partially updated rows to a caller. Snapshot resolution/closure validation happen before its state writes.
- Every ledger/surplus write records the original value **and key presence**. Reverse-order undo handles repeated writes to the same key and deletes newly introduced keys. Both physical ledgers and both hypothetical-surplus ledgers use this setter.
- Each row update records a constant-size shallow row snapshot, a constant-size contribution snapshot, and the prior contribution-array length. It does **not** clone the contribution array. Undo restores partially updated numeric fields even when checked addition throws midway, truncates appended provenance, and removes new entries from the contribution index. New row-map entries are also journaled.
- Steps and goal plans are append-only. Saved array lengths discard all additions on failure without copying earlier history. Undo runs before distinguishing expected diagnostics from propagated programming errors.
- A private `WeakMap<Row, Map<goalId, contribution>>` eliminates both `.find` and `.includes` over accumulated provenance. Public contribution order and historical coalescing behavior remain unchanged; the index never escapes in results.
- For fixed catalog/selection sizes and bounded recipe work per goal, bookkeeping is expected O(total goal writes + initial stock + output), not O(accumulated history × goals). Temporary undo space is O(current-goal writes), discarded after success/failure. Persistent index space is O(output contributions). There is no per-goal copy of the stock map, prior goals, steps, or provenance.

Remaining cost: the shared `resolveRecipe` still searches catalog item/recipe arrays linearly. That is catalog-cardinality-dependent work, not a growing queue-history scan, and is not material in the measured fixed/simple catalog. This fix does not promise constant-time lookup for arbitrarily large catalogs, nor a total-work bound for 10,000 maximally wide graphs. No caps were lowered and no goals are silently skipped.

## Test-first evidence

Before modifying the engine, added two functional tests inserting a late failing goal between committed valid goals, plus the performance guard. The overflow and allocation-phase node-budget tests passed on the old transactional implementation. The performance test failed as intended: **9,210.044 ms exceeds 3,000 ms**; 19 other snapshot-planner tests passed.

Added two further cases consuming **pre-existing root surplus in both projections** before late overflow/budget failure, then reusing it and reserving stock in subsequent valid goals. All four new rollback cases compare `direct`, `raw`, `allocations`, `goals`, and `steps` against omission of the failed goal, check exact result statuses/diagnostic codes, and assert row/provenance conservation. These complement the existing cross-snapshot stock-sharing, selection isolation, aggregate-overflow, diamond, input immutability, and hard-error tests.

The scaling test verifies every goal/result/step is retained, raw totals are exact, every distinct goal ID occurs in ordered provenance, and all row/contribution totals conserve required = reserved + planned + missing. Default test mode runs 2,000 goals with a deliberately broad three-second guard: far above the measured fixed implementation, but below the demonstrated old regression. It does not gate on a noisy timing ratio. Severe host contention can still affect any wall-clock guard.

## Reproducible benchmark and actual measurements

Run from the repository root:

```sh
SNAPSHOT_PLANNER_BENCH=1 npm test -- src/domain/snapshot-planner.test.ts -t '2,000 unique'
```

The checked-in test creates a validated synthetic snapshot with one selected `tool -> 1 ore` recipe, unique goal IDs, quantity 1, completed 0, empty stock, and default planner limits. Catalog has a fixed small number of items; goal IDs, not recipes, are unique. It warms up with 100 goals, then measures 100/500/1,000/2,000 with `performance.now()` around planning **only**, excluding snapshot creation, queue creation, and assertions. Baseline uses planner revision `3e477b2`; the initial command ran the complete snapshot-planner test file with the same benchmark environment variable.

Node **v20.20.2**, Vitest **3.2.7**, this macOS development host. These are measured runs, not extrapolations:

| Goals | Before fix (ms) | After, suite run (ms) | After, isolated repeat (ms) |
| ---: | ---: | ---: | ---: |
| 100 | 17.346 | 1.233 | 1.248 |
| 500 | 522.064 | 5.315 | 5.255 |
| 1,000 | 2,188.658 | 10.136 | 9.481 |
| 2,000 | 9,210.044 | 22.113 | 17.833 |

The 2,000-goal measured improvement is approximately **416×** comparing baseline to the first after-fix suite run. A further full-suite run measured 21.887 ms at 2,000. Timing varies between processes; these measurements support near-linear scaling for this fixture, not universal latency guarantees. Browser responsiveness was not measured.

## Verification executed

```sh
npm test -- src/domain/snapshot-planner.test.ts src/domain/catalog-snapshot.test.ts src/domain/planner.test.ts src/domain/planner-provenance.test.ts
npx tsc --noEmit --target ES2022 --lib ES2022,DOM,DOM.Iterable --module ESNext --moduleResolution Bundler --strict --skipLibCheck --esModuleInterop --resolveJsonModule --isolatedModules --types vite/client,node src/domain/snapshot-planner.ts src/domain/snapshot-planner.test.ts
npx eslint src/domain/snapshot-planner.ts src/domain/snapshot-planner.test.ts --max-warnings 0
git diff --check -- src/domain/snapshot-planner.ts src/domain/snapshot-planner.test.ts docs/reviews/snapshot-planner-performance.md
```

- **PASS: 68 tests across four files**: all 63 existing tests plus five new cases (four rollback cases and one scaling case).
- **PASS: scoped TypeScript compilation and ESLint**, using the repository compiler options without including concurrently changing UI/storage files.
- **PASS: temporary differential harness**, `node /tmp/snapshot-planner-differential.cjs`: 300 deterministic seeded queues, 25 goals each, comparing the entire output with the original planner from Git. Covered mixed roots, alternate selection, missing recipes, completion, shared stock, overflow and varying node budgets. Bundled original/current sources with local esbuild; no production facts or responses synthesized. This exploratory harness is not a committed regression test. The prior review's separate 109-check harness was not rerun or represented as rerun.
- Full application build, persistence/UI tests, browser tests, and independent re-review remain outside this scoped change.
