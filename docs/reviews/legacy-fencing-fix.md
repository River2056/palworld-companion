# Legacy writer fencing fix

## Outcome

The original Dexie v1 client cannot reopen and write after consolidation. This is a schema fence, not a marker-only convention. The v1 constructor/schema reproduced in the browser test matches `333c2eb^:src/features/pals/storage.ts` (type annotations omitted).

`personal-db.ts` atomically renames the three source stores to `legacyPals`, `legacyBases`, and `legacyRoutes`, preserving raw rows, unknown fields, keys, and indexes. It reserves native IndexedDB version `Number.MAX_SAFE_INTEGER`: Dexie 4.2.0 otherwise retries VersionError with an unversioned open and repairs missing stores by incrementing the native version. The archive remains readable via a schema-less connection, but the original client cannot recreate its writable stores. Previously consolidated marker-only databases are also repaired without replacing newer destination data.

This archive version is intentionally terminal; future recovery must read the archival stores rather than attempt another version upgrade. This is fencing of the original client, not a security boundary against arbitrary same-origin JavaScript. Browser proof covers Chromium desktop and mobile emulation, not Safari/Firefox.

## Verified behavior

- Original-class explicit reopen followed by existing-record and fresh-record write attempts fails with `TypeError`; no legacy stores are recreated.
- Existing legacy instance auto-reopen/write also fails after consolidation.
- A live connection refusing versionchange leaves destination rows and metadata at zero. After release, retry imports the last pre-release edit.
- An interrupted rename/marker transaction rolls back source schema and data. Marker-only v2 subsequently repairs and imports successfully.
- Destination final-copy failure commits no partial destination and preserves archive data for a fresh-instance retry. Later authoritative edits survive reopening.
- Unknown raw fields and legacy indexes remain recoverable in the source archive.
- Migration acceptance rollback/retry, later personal edits, and history-only snapshot exclusion from both scoped exports remain covered.

## Final verification

- `npm run typecheck`: passed.
- `npx eslint src/data/personal-db.ts src/data/personal-db-fencing.test.ts src/data/catalog-migration.test.ts tests/e2e/catalog-persistence.spec.ts --max-warnings 0`: passed.
- `npm test -- src/data/personal-db-fencing.test.ts src/data/catalog-migration.test.ts`: 10 passed.
- `node node_modules/@playwright/test/cli.js test tests/e2e/catalog-persistence.spec.ts --workers=1 --repeat-each=5`: 50 passed, across the repository's desktop/mobile Chromium projects. No Playwright retries were used. Execution log: `/tmp/pal-fence-final-browser.log`.
- `git diff --check`: passed before commit.

Repeated browser runs exposed transient `blocked` events while just-closed connections drained. The fix allows a bounded 100ms grace, clears its timer on completion/error/upgrade, and still rejects noncooperating connections before any copy. A request abandoned after this deadline aborts if its upgrade later becomes available. The final repeated run includes the live noncooperating-connection assertion in both projects.

The broader `npm test -- src/data src/features/pals` first passed all 52 tests. A subsequent run during concurrent changes failed three `Workspaces.test.tsx` cases with `speciesName` receiving an invalid catalog via `Array.map`; `src/features/pals/domain.ts` was concurrently modified outside this task's ownership. That broader suite is not claimed green at completion and was not modified here.

## Scope and cleanup

Owned changes: `src/data/personal-db.ts`, `src/data/catalog-migration.test.ts`, new `src/data/personal-db-fencing.test.ts`, new `tests/e2e/catalog-persistence.spec.ts`, and this report. Browser fixtures use unique named databases and delete only those exact names; Playwright contexts and its owned Vite server close after execution. No default database reset or unrelated worktree cleanup was performed. Unit cleanup closes all tracked connections before deleting unique database names.
