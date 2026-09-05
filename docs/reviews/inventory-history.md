# Inventory freshness and completed history recovery review

## Scope and independent spec review — PASS

Reviewed the timed-out worker's persisted implementation before editing, against the delegated inventory/history requirements and the plan's inventory/completion section. This is a recovery review, independent of the original implementation worker; it is not a full-product acceptance declaration.

| Requirement | Evidence / result |
| --- | --- |
| Persist per-entry manual inventory timestamps | `Workspace.stockUpdatedAt` is optional; `Inventory` records canonical UTC ISO time on each valid manual save, including unchanged zero counts. Store save/load/export/import retain it. |
| Legacy timestamps remain unknown | Missing maps and missing entries are not synthesized. UI renders “Unknown — no recorded manual save”; old counts and unknown item IDs round-trip. |
| Validate backup metadata before replacing data | Parser rejects non-object maps, non-string/noncanonical/impossible dates, empty IDs and timestamps without corresponding own stock keys. Invalid imports leave original persisted data intact. Tests include prototype-like IDs. |
| Explain stale/manual inventory | Visible stale-shortage warning explicitly disclaims live sync and distinguishes a manual save from in-game verification. |
| Separate active and completed history | Accessible regions contain filtered goals; completed goals remain persisted but excluded from the planner's allocation ledger. |
| Explicit progress-only reopening | History explains that reopen resets progress to zero at retained queue position. Tests verify quantity, stable IDs, notes, stock and timestamps stay intact; unknown completed recipes reopen as blocked active goals. |
| Recompute allocation and preserve priority | Component/store/planner test verifies two goals' before/completed/reopened reservations. Active reorder skips history slots. |
| Failed persistence retains UI data | Store transaction failure preserves counts/timestamps; rejected-save component tests preserve active/history state and the pending inventory input for retry. App's real update path was inspected: state updates only after save/load succeed and save failures surface an alert. |

### Regressions found and fixed using existing failing browser tests

1. Empty Queue text changed from “No plans yet” to “No active plans”, breaking shell and Today expectations. Restore the established empty-workspace text; retain “No active plans” when history exists.
2. Moving completed goals to history removed their existing explicit Remove action. Restore that action in history without removing records automatically or requiring reopen. Existing crafting backup/reset browser test failed waiting for `Remove Arrow` before this fix and passed afterward.

Only these small compatibility fixes were made to the saved feature. No App, Today, Pal, Guild, catalog, package or public metadata code was edited.

## Verification

- `npm test -- src/data src/features/inventory-history.test.tsx src/features/crafting-completeness.test.tsx src/features/crafting-recovery.test.tsx src/features/today-actions.test.tsx src/app/App.test.tsx` — **39 tests passed across 7 files**.
- `npx eslint src/data/workspace.ts src/data/inventory-freshness.test.ts src/features/Queue.tsx src/features/inventory-history.test.tsx tests/e2e/inventory-history.spec.ts --max-warnings 0` — **passed** (rerun after final browser selector correction).
- `npx playwright test --config /tmp/palworld-inventory-history.config.mts shell.spec.ts crafting.spec.ts crafting-completeness.spec.ts inventory-history.spec.ts` — **12 passed, 0 failed** on desktop Chromium and Pixel 7 Chromium.
- Browser run isolated from other workers: port **4289**, no server reuse, config `/tmp/palworld-inventory-history.config.mts`, output `/tmp/palworld-inventory-history-results`, two workers, zero retries.
- New `tests/e2e/inventory-history.spec.ts` exercises real settings import → unknown legacy timestamp → manual save → completion/history → reload → reopen → reload → downloaded backup. It compares IDs, notes, counts and both edited/unmodified timestamps through public UI/export seams and checks page errors and horizontal overflow.
- `npm run typecheck` — **blocked outside this scope** during parallel catalog work: latest run reported `src/domain/catalog-snapshot.test.ts(4,10): TS2724`, missing exported `createBundledCatalogSnapshot`. Earlier run had several missing exports in the same in-progress module. No unrelated files were changed to suppress this.

## Quality review — PASS for owned scope, after spec pass

- Storage remains backward-compatible without a database-version change; validation precedes writes and uses own-key checks.
- Queue actions use immutable workspace/goal spreads, preserving existing optional metadata rather than constructing a reduced workspace. Upcoming catalog-storage metadata still needs its owning worker's explicit parser validation/round-trip integration; this review does not certify that unfinished feature.
- History state is derived from persisted progress, not duplicated in a second mutable collection. Reordering swaps active slots only.
- Accessible named regions and semantic time elements expose the new state to tests and users. No broad refactor was necessary.
- Known integration-test risk: initial mobile `crafting-completeness.spec.ts` run observed zero reserved stock after its immediate reload following Save; both subsequent complete runs passed. That pre-existing spec does not wait for committed inventory state before reload. The new scoped spec waits for the saved timestamp; the existing crafting spec was left unchanged because it is outside owned paths. Do not interpret the final green run as proof that this timing risk is eliminated.
- Failure UI tests use the component/store seam with a harness matching the inspected App persistence ordering; the new browser case does not inject a native browser storage failure.

## Owned delivery files

- `src/data/workspace.ts`
- `src/features/Queue.tsx`
- `src/data/inventory-freshness.test.ts`
- `src/features/inventory-history.test.tsx`
- `tests/e2e/inventory-history.spec.ts`
- `docs/reviews/inventory-history.md`
