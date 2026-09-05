# Pal snapshot storage closure

## Outcome / API seam

- `savePal` and `saveBase` resolve the exact selected snapshot inside `PersonalDatabase.write`; no bundled validation fallback. Missing selected bytes fail atomically.
- Unchanged species IDs on existing/imported Pals and unchanged `(slot ID, work)` references on existing bases remain editable. New unsupported references still reject. Gender, text limits, capacity, worker ownership/exclusivity and slot numeric constraints remain enforced. The retained-ID catalog projection is validation-only and never supplies analysis facts or names.
- New `saveRoute(route, {snapshotId, revision})` calls require context captured alongside enumeration. The write transaction checks both selected snapshot identity and metadata revision, including selection ABA and unrelated personal writes; rejected saves do not increment revision or insert a route.
- Existing route edits retain the one-argument API and exact historical/legacy-unbound binding. Graph and source label are not recalculated under current rules. Existing structural graph/checklist validation remains in force.
- `Workspaces.tsx` now captures `generation` immediately after enumeration and passes it to new-route saves. Existing saved checklist edits remain one-argument. The previously reported `.map(speciesName)` second-argument problem was already absent in the inspected runtime/domain worker changes.

## Verification

- `npx vitest run src/data src/features/pals`: 58 passed, including four new storage-fencing cases and the runtime worker's two tests.
- `npm run typecheck`: passed.
- Targeted ESLint for storage, fencing unit test, Playwright test and config: passed.
- `npx playwright test --config playwright.pal-storage-fencing.config.ts`: 1 passed in real Chromium. A second browser tab accepts a catalog migration; the first tab's captured old generation is rejected without changing metadata or routes.
- Full `npm test`: 312 passed, 4 failed, 1 skipped (317 total). Failures are in `src/features/today-actions.test.tsx`: old unbound fixtures expect resolved route names/next-step/completion copy, plus an assertion before asynchronous base context is loaded. These Today tests are outside this worker's scope and were not changed.

## Handoff / scope

Owned storage, recovery/migration storage fixture tests, new fencing unit/browser tests and their config are committed with this report. `src/features/pals/Workspaces.tsx` and `src/features/pals/snapshot-runtime.test.tsx` contain the minimal context-passing changes but remain uncommitted with the preceding runtime worker's work; include them when committing that worker's changes. Do not revert those seams: a new route without explicit generation context now intentionally rejects. No App, Today, CatalogMigrationPanel, personal-db, or Guild implementation changes were made here.

Snapshot schema fixes work-suitability keys, so the valid base-selection regression fixture uses a structurally valid empty species catalog versus a catalog supporting the normal work keys, rather than inventing an unsupported schema field.
