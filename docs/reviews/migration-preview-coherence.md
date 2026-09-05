# Migration preview coherence — verified

## Scope and behavior

`CatalogMigrationPanel.tsx` captures metadata, retained snapshots, craft workspace, roster, routes and bases in one read-only transaction. Its revision must equal the migration proposal's `expectedRevision`; otherwise it cancels the proposal, clears legacy consent and displays no comparison. Selected-before, queue-priority numeric deltas, route warnings and base suitability/coverage therefore share one revision. Candidate-only snapshot bytes are resolved in memory, without persisting them during preview.

A metadata subscription invalidates displayed comparisons and acceptance after a later revision, clears legacy acknowledgement and cancels the stale proposal. Acceptance still uses the storage-layer revision CAS. Generation tokens discard superseded candidate-file and comparison completions. No storage-layer or other application component was changed in this scope.

Browser acceptance helpers wait for the actual reload event and loaded settings heading before inspecting committed rows or requesting rollback; a successful click alone is not settlement.

## Browser evidence

Executed from `/tmp/palworld-migration-recovery-frozen`, copied from the worktree with dependencies symlinked. Sources were frozen during each run. Dedicated configuration `playwright.migration-preview.config.ts` uses strict port 4398 and refuses server reuse; `MIGRATION_PREVIEW_PORT` can select another isolated port. This avoids the unrelated worker's server on 4287.

Final command:

```sh
node node_modules/@playwright/test/cli.js test --config playwright.migration-preview.config.ts --repeat-each=2
```

**24 passed**: six scenarios, desktop Chromium and Pixel 7 emulation, each repeated twice.

- Legacy cancellation/adoption and rollback retain later quantities and historical binding.
- Synthetic alternate recipes survive reload; unresolved goals do not double-consume stock.
- Exact queue-priority numeric before/after deltas use shared stock; cancellation preserves export and revision; missing retained bytes do not fall back.
- Controlled pause after proposal capture, before comparison transaction: a real second tab edits quantity/stock. Comparison rejects, consent clears, fresh preview matches the new revision. Another tab edit invalidates visible comparison/acceptance; exports and history remain unchanged until explicit repreview and accept.
- Fresh imported candidate changes an actual route pair and a positive worker suitability. Explicit route migration displays changed-pair warnings and base coverage changes from 1/1 to 0/1. Cancel does not retain candidate bytes or change revision/routes. Adopt and rollback preserve route checklist/graph and all base data. Missing retained bytes yield historical/analysis-unavailable text, not bundled fallback.
- Deferred native file read is superseded by bundled-candidate selection. Old completion cannot restore the imported candidate or review; preview/cancel leaves export, revision and history unchanged.

## Regression evidence

From the same frozen copy:

- `npm run typecheck`: passed.
- `npm run build`: passed (non-blocking Vite mixed static/dynamic import notices).
- Scoped ESLint over panel, browser test and dedicated config: passed.
- Full Vitest run: **37 files passed; 319 tests passed, 1 skipped**.
- Targeted migration/planner run: **30 passed**.

## Recovery findings

The timed-out worker left valid application code but stale test copy assertions and a base fixture selecting the first suitability key, whose level was zero. The recovery aligned assertions with actual unavailable-state copy and selected a positive suitability, then strengthened the route fixture to exercise a real changed-pair warning. The original shared-port run also targeted another worker's frozen server; all reported final evidence uses this scope's isolated server.

This is scoped migration-preview verification, not a claim that every unrelated browser or remote-service suite ran.
