# Independent Pal completeness quality review

## Verdict: APPROVED for the narrow completeness scope

Ranked-route explanation, explicit offspring creation, **roster** favorites, assigned-worker context and explicit base-to-breeding handoff meet the reviewed scope. The favorite-off reload assertion is corrected and repeatedly passes real Chromium with actual IndexedDB readback. This is **not merged-tree release approval**: active catalog/storage integration has separate failures/gates below.

Reviewed `docs/reviews/pals-completeness-spec.md`, implementation/report commit `0b68f65b19f601e85dc806792624c4b7ea19a6b7`, and backup browser commit `ab744760c2f8f591a7d38680003c474ca65038d5`. Route favorites were not an original requirement. The existing route-favorite `test.fail` probe is exploratory, is not a completion criterion, and was neither changed nor counted as a passing capability.

## Favorite-save assertion correction

Only `tests/e2e/pals-completeness.spec.ts` was changed. Both favorite-on and favorite-off now wait for:

1. The favorite button's persisted `aria-pressed` value to equal the requested boolean.
2. The button to be enabled, indicating the asynchronous action and post-write snapshot refresh have settled.
3. No visible storage alert.
4. One actual, read-only IndexedDB transaction returning exactly one matching test individual with the explicit expected favorite boolean.

Only then does the test reload and assert persistence again. `Workspaces.tsx:18,34` supports this contract: `state.run` awaits the write and snapshot before clearing busy, and favorite rendering comes from `state.data`, not an optimistic draft. No sleep, retry increase, expected-failure annotation, database reset, or polling of the database was introduced. The readback neither defaults missing flags to false nor opens a nonexistent database. It supports the original separate Pal database and the consolidated personal schema.

The previous favorite-off click immediately followed by reload interrupted an unconfirmed asynchronous save. The supported settled-save contract passes; **immediate navigation during an in-flight write is not certified**. This change does not hide an observed failure after a confirmed save.

## Independent implementation findings

- **Ranked domain/UI — meets scope.** `domain.ts` derives distinct missing active parents, step count, and longest dependency-chain generation depth; ranking ends with deterministic identity. Ranking precedes beam/result truncation. Existing unit cases verify reversed roster ordering, ranked prefix limits and cheaper direct alternatives. `Workspaces.tsx:27,36` exposes metrics and honestly documents the default four-step/40-result bounds and deterministic 200-node ancestry beam. Missing-parent guidance is separate from runnable routes; this is not exhaustive acquisition planning or global optimization. Same-sex actual parents are excluded; unknown and future-offspring genders remain conditional.
- **Offspring — no silent creation.** `RouteView` only offers the action on manually completed steps. Its callback initializes a fresh draft with species, unknown gender and no inherited passives; only Save Pal writes it. Real browser tests check unchanged roster count after completion, unchanged count while drafting, cancel without creation, explicit save, and reload. Completion does not verify gender or automatically complete downstream steps.
- **Roster favorite lifecycle — meets settled-save scope.** Favorite changes are explicit storage actions; readback now verifies both true and false before reload. Legacy favorite normalization and scoped backup preservation are covered by the immutable unit/backup checks. No route-favorite feature is required or implied.
- **Worker assignments — guards remain enforced.** `saveBase` validates active/nonmissing workers, capacity, uniqueness and cross-base exclusivity; `assignWorker` reuses that validation. `analyzeBase` excludes unavailable/elsewhere-assigned replacement candidates and uses one worker per simultaneous slot with priority-aware reassignment. Unit tests exercise guard rejection and matching; the real browser covers uncovered Cooling work, explicit assignment, cleared shortage, suitability/manual-note context and reload. UI disables workers assigned elsewhere. The recommendations do not automatically move individuals and do not claim verified throughput or passive multipliers.
- **Base handoff — explicit write boundary retained.** The app callback only selects the target. Browser acceptance proves no route is saved until Save route checklist, with manual progress initially unchecked.
- **Backup — original contract independently passes.** The unchanged real scoped-roundtrip test verifies nonempty roster/checklist/base recovery, unknown-ID preservation, favorite values, canceled/malformed no-write behavior and unrelated crafting-data preservation. Its original three-table allowed-write oracle must not be presented as acceptance of the new consolidated snapshot contract.

## Real execution and isolation

Temporary evidence root:

`/var/folders/y1/m4mhk8x543n1ytmrgf9pv41m0000gn/T/pal-quality-wzeie2jb`

Two frozen source trees were tested, never a reset/checkout/stash of the shared repository. Strict isolated Vite origins used ports **53467** and **53468**, `reuseExistingServer:false`, two workers, zero retries, desktop Chromium and Pixel 7 Chromium emulation. Each browser test used its own fresh context; reload assertions stayed within that context with no storage reset.

| Frozen source | Command / check | Actual result |
| --- | --- | --- |
| `0b68f65` plus explicit reference fixture and corrected owned test | Playwright `--config ../snapshot.config.mjs --repeat-each=5` | **30 actual passes**, zero failures/flaky/skips |
| Same source, unchanged backup test from `ab74476` | Playwright `--config ../backup.config.mjs --grep 'scoped backup roundtrip'` | **2 actual passes**; exploratory expected-failure test excluded |
| Same immutable source | Vitest `run src/features/pals` | **25 passed** across six files |
| Same immutable source | `tsc --noEmit`; scoped ESLint on owned browser test | Both passed |
| Frozen working-tree copy including in-flight consolidated storage | Playwright `--config ../working.config.mjs --repeat-each=3` | **18 actual passes**, zero failures/flaky/skips |
| Frozen working-tree copy | Vitest `run src/features/pals` | **24 passed, 1 failed**; see integration gate |
| Frozen working-tree copy | `tsc --noEmit` | Passed, explicitly rerun |

Parsed `snapshot-results.json` and `working-results.json` confirm the browser counts and actual result statuses, rather than treating expected failures as passes. `backup-results.json` retains the separate roundtrip run.

The original commit does not track `docs/research/pal-reference.json`; its existing fixture was explicitly copied into the immutable tree, SHA-256 `7720b8726a46371a6c4ab2e8f5bc100983d9e032d2e6d7f3af901cfa749e95b5`. These results do not establish a clean checkout without that fixture. Frozen working-copy storage SHA-256: `566cdd188b27f73a232901dcae9d6083c93935531d40e3dc44ed4224f4a97016`; backup SHA-256: `f481a4335d53c5eff523c5d5330dfa8e794cd6e8f8fbc1be981d69c266b546c0`.

## Separate integration gates / limitations

1. The frozen consolidated-storage copy fails `recovery.test.ts:34`: exact saved-route equality now receives an extra bound `catalogBinding`. This is an observed contract/test integration mismatch, not the favorite reload race. Its owner must reconcile provenance semantics and expectations; this review did not weaken that assertion or modify recovery/storage code.
2. A later typecheck of the moving shared tree failed at `src/domain/snapshot-planner.ts:154` with TS2588 (assignment to const `state`). Both isolated trees typechecked. The shared-tree failure belongs to ongoing snapshot integration and prevents a blanket current-tree typecheck claim.
3. Final consolidated backup/migration semantics and the required reference fixture need owner verification on the eventual merged tree. No current-catalog compatibility, complete plan, authenticated Guild backup, or interrupted-save durability claim is made here.

Only the owned browser test and this report are delivery changes; active production/storage/backup work and the other owner's backup test were preserved.
