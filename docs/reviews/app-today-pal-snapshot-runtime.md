# App / Today / Pal snapshot runtime integration

Implemented selected snapshot metadata in App (actual recipe/raw counts, dataset/hash/verification metadata, no current-patch claim); Today uses planRuntimeWorkspace, exactly as Shopping does, and explicitly labels partial totals. Existing Guild memory/privacy callbacks are unchanged.

Pal new-route search, names and guidance use selected snapshot. Saved checklists resolve only their binding; legacy and absent snapshots show migration-required warnings and disable completion without falling back to bundle. Existing saved routes remain visible even when selected bytes are unavailable. Base analysis/suitability uses the selected snapshot and explicitly states assignments have no saved binding.

Migration preview now exposes route keep/migrate decisions and concrete before/after route warnings, base slot coverage/gaps/worker suitability alongside craft deltas. Base behavior is honestly a global selected analysis-context change, not a fabricated per-base binding. Existing preview/cancel/accept transaction API retained.

Verification:
- npm run typecheck: pass.
- Targeted ESLint on changed production files and new integration test: pass (before final alert-only fix; typecheck and regression tests rerun after it).
- npm test -- src/features/pals src/features/today-guild.test.tsx: 8 files, 85 tests pass, including 2 new synthetic integration cases.
- npx playwright test --config playwright.pal-snapshot.config.ts: 1 Chromium test passes, dedicated strict port 4293, fresh Playwright context; no real database reset. App counts change for synthetic selected data; Today missing-type count matches rendered Shopping direct list while a changed recipe remains bound to retained snapshot.
- New integration tests prove same-ID changed parent rules expose warnings after explicit migration while saved graph/checklist remain byte-equivalent except binding; keep preserves old behavior; cancel leaves metadata unchanged; legacy adoption needs acknowledgment; unknown hash remains preserved; selected suitability affects base coverage without assignment writes.

Residual integration boundaries:
- Resolved by storage commit `379b741`: savePal/saveBase validate the transaction-selected snapshot, with unchanged retained-ID allowances. Storage files remain outside this runtime commit.
- Resolved by `379b741` plus this runtime handoff: Workspaces captures `{snapshotId, revision}` alongside enumeration and passes it as the second saveRoute argument. The new full-App browser regression observes that exact argument, pauses the real UI save before the storage transaction, migrates in another tab, verifies rejection with unchanged metadata/no saved route, then reloads and verifies a successful save binds the accepted snapshot.
- Migration comparison capture reads personal records after preview creation; accept remains revision-fenced, but preview display can briefly describe a newer roster if another tab edits between reads.
- Browser verification covers App/Today/Shopping; Pal migration UI comparisons are exercised through domain/storage + mounted component integration, not a full browser migration-panel route decision journey.
