# Independent legacy writer fencing re-review — 112956a

## Verdict: APPROVED, scoped to the original Dexie client on Chromium

The P1 original-client fencing finding in `catalog-persistence-spec.md:5-9` is superseded by commit `112956ac700755592f38d9bf70526a189c5d5052`. No blocking safety regression was found in the reviewed fix. This does not supersede that report's separate history-only backup portability limitation.

Compared the original constructor and write implementation from `333c2eb^:src/features/pals/storage.ts`, reviewed the commit and current source, and confirmed no working-tree differences in the four reviewed production/test files relative to the fix.

## Safety and recovery

- `src/data/personal-db.ts:28-48`: terminal native version plus atomic store rename defeats Dexie 4.2.0's unversioned retry/schema repair. Version alone would not suffice. Renaming retains raw data and indexes; schema-less archive reads remain possible.
- `:32-56`: blocked readiness rejects after a bounded grace. Timer cleanup exists on upgrade/error/success. The abandoned upgrade handler must remain installed until the pending native request is delivered so it can abort; detaching it on timeout would be unsafe. A late success closes its connection and cannot resolve abandoned readiness. No event listeners are added to external live connections by this helper. A blocker that never closes necessarily leaves the uncancellable native open pending; this is not a claim of immediate request disposal.
- Independently released a blocker after readiness rejected, deliberately did not retry, and inspected the source after 200 ms: native version remained 10, original stores remained, destination Pals/metadata remained zero. A subsequent retry copied successfully. Thus late delivery does not silently complete the abandoned fence or half-copy.
- Missing-store failure rolls back source version/schema/rows; marker-only v2 repair succeeds. Final destination metadata failure aborts destination writes while retaining the archive, and fresh-instance retry is covered. Existing destination metadata does not bypass source repair or replace newer destination edits.
- Independent browser reads through `legacyPals.speciesId` and `legacyRoutes.targetId` retained original rows, unknown nested fields and keys after old-client write attempts. All three recovery stores remained; no writable original stores were recreated.

## Original-client regression evidence and test precision

The committed browser test's explicit `open()` rejects with `TypeError`. An additional independent fixture kept the original Dexie instance live across consolidation, then attempted an existing-record put, fresh-record put, and fresh-instance auto-open put: all rejected with `DatabaseClosedError`; archive and destination remained unchanged. Error class depends on explicit versus implicit opening; the acceptance criterion is failed writes and retained data, not universally `TypeError`.

Nonblocking test maintenance note: `tests/e2e/catalog-persistence.spec.ts:38-51` is titled “existing or fresh writes” but its two iterations perform the same explicit-open/setFavorite path. Its explicit-open failure still proves the fence, but it does not literally exercise fresh puts or live-instance auto-reopen. The temporary independent tests close that evidence gap for this review; promoting those cases into the permanent suite would improve regression coverage.

## Reproduced verification

- `npm test -- src/data/personal-db-fencing.test.ts src/data/catalog-migration.test.ts`: **10 passed**.
- Committed browser suite: **30 passed**, five cases × desktop/mobile Chromium × three repetitions, no retries.
- Additional independent browser cases: **12 passed**, two cases × desktop/mobile Chromium × three repetitions, no retries.
- Scoped ESLint on the four reviewed source/test files: exit 0. `git diff --check 112956a^ 112956a`: exit 0.
- Browser server used isolated port 57109, `reuseExistingServer: false`, disposable contexts and labeled fixture databases. No user profile or user database was accessed.

Reproduction artifacts: `/var/folders/y1/m4mhk8x543n1ytmrgf9pv41m0000gn/T/legacy-independent-wkwvig3d/`. Run the repository's direct Playwright CLI with `--config` pointing to `playwright.config.cjs` for the committed suite or `independent.config.cjs` for added cases. Final independent output is `independent-final.log`.

Initial independent fixture runs failed because my synthetic route had an invalid empty graph, then because I incorrectly expected the explicit-open error class for implicit-open operations. Corrected only the temporary fixture and its assertion; these were not production failures.

## Boundaries and changes

This is original-client fencing, not protection from arbitrary same-origin native IndexedDB writes/deletion. Terminal version intentionally prevents future upgrades; recovery must read archival stores. Safari/Firefox and application-level recovery messaging were not verified. No whole-worktree test/typecheck claim is made during concurrent Pal/UI work.

Created this report and temporary review fixtures/configurations/logs only. No production code, committed tests, other review reports, or concurrent workers' files were changed; no commit was created.
