# Independent Pal/base completeness spec review — 0b68f65

## Verdict and evidence boundary

**The ranked-route, explicit-offspring, roster-favorite and base-context changes meet the narrow gap-audit closure intent on the reviewed snapshot. Scoped browser restore of nonempty Pal/base/checklist data is independently verified. This is not full-plan or merged-tree release approval.**

Reviewed immutable source: `0b68f65b19f601e85dc806792624c4b7ea19a6b7`, extracted with `git archive` into a temporary directory. The commit does not track the required `docs/research/pal-reference.json`; the existing working-tree reference was copied into that isolated snapshot, SHA-256 `7720b8726a46371a6c4ab2e8f5bc100983d9e032d2e6d7f3af901cfa749e95b5`. Consequently this is **commit plus that explicit reference fixture**, not proof the commit alone builds from a clean checkout. Installed dependencies were symlinked read-only; source/storage in the real repository was not edited.

Requirements: `docs/reviews/full-plan-gap-audit.md` items 6, 8, 9 and scoped-backup section; plan lines 143–173. Inspected working plan SHA-256 `d25582e912e2af9c365d5639e4f0cd87e2886d8df2111e5dd8463c5cb2695ad4`. The additional delegated wording requesting a *route favorite* is distinguished below from the plan's explicit **roster** favorite requirement.

## Findings / remaining gates

1. **P2 — Saved-route favorite is absent if the delegated request means a favorite on the route itself.** `domain.ts:7` defines only `completed` beyond the route fields; `Workspaces.tsx:24–27` provides checklist/removal actions but no route-favorite control. `backup.ts:46–55` reconstructs routes without `favorite`. An explicitly synthetic imported route with `favorite:true` exports without that property in both desktop and mobile Chromium. The new test records this as an **expected failure**, not a successful favorite roundtrip. The plan at line 143 and gap-audit item 9 require a roster favorite, which *is* implemented and verified. Do not retroactively describe route favorites as an original-plan requirement; clarify/implement this additional request before claiming it passed.
2. **P2 — Existing favorite reload acceptance is nondeterministic.** The unmodified `pals-completeness.spec.ts:51–53` clicks favorite-off and immediately reloads, without waiting for the asynchronous persisted state. One isolated combined run passed its six existing cases; the next isolated run failed the mobile case with `aria-pressed=true` after reload (five existing cases passed). This reproduces a test/save-settlement race; it does not prove loss after a confirmed save. The new backup test waits for persisted UI state before navigation/export. The original spec should wait for the off state before reload, or product behavior should explicitly guarantee immediate navigation safety. No change was made to that owned file.
3. **Existing catalog/snapshot and cross-module gates remain separate.** Snapshot `storage.ts` uses three personal tables and routes retain a version string, not historical rule contents; the active catalog-persistence worker was changing storage and backup during this review. New snapshot metadata/migration/backups need their own final verification. Recipe-to-staffing integration is not added by this commit; no sourced station/work mapping was invented. The missing tracked reference must also be included by its owner.

## Requirement-by-requirement assessment

| Requirement | Independent assessment |
| --- | --- |
| Ranked alternatives and stable tie-break | `domain.ts:16–60` computes missing distinct active owned parents, steps, then longest offspring chain; comparator uses those fields then code-point-stable node/route identity. Sorting occurs before intermediate pruning and final display limit. Existing unit cases check reversed roster order, ranked-prefix limiting and many cheaper direct parents. |
| Depth/score explanation and honest bounds | `Workspaces.tsx:27,36` shows missing parents, step count and generation depth, and explains the 4-step/40-result default, deterministic 200-node ancestry beam and possible omissions. Missing-parent acquisition guidance is explicitly separate; generated runnable candidates all have zero missing parents. No global-optimality claim. This closes the gap audit's requested clarification, not a new acquisition-route engine. |
| Explicit offspring, cancel, Save Pal | `Workspaces.tsx:27,35–36` only exposes Add offspring for manually checked steps. It prefills species, unknown gender and empty passives; cancel clears the draft; roster writes require Save Pal. The checked step does not itself add a Pal; adding a Pal does not complete later route steps or verify offspring gender. Existing real browser flow verifies draft/cancel/save/reload. |
| Roster favorites | `domain.ts:4`, storage favorite operations, roster buttons and `backup.ts:32` retain true/false and default legacy missing flags to false. New browser test verifies a true favorite, a false record, an unknown-species favorite, full export/import equality and reload. |
| Assigned worker context | `Workspaces.tsx:41` renders every assigned individual's reference suitability, manually recorded modifiers and notes, with explicit no-throughput/no-inheritance-multiplier disclaimer. Existing real browser case covers Cooling gap → explicit assignment → shortage cleared → context and reload. |
| Base handoff confirmation | `Workspaces.tsx:41` and App callback preselect a breeding target; no route/base/roster write occurs merely from navigation. Save route checklist is the required explicit plan creation. Existing browser case verifies no saved routes before Save, then unchecked persisted checklist. A second confirmation dialog on navigation is not necessary. |
| Scoped backup / unknown IDs / no unrelated writes | New real browser test proves the flow detailed below. This covers the snapshot contract, not future catalog-state tables or Guild backup functionality. |

## New browser acceptance

Created only `tests/e2e/pals-backup-roundtrip.spec.ts` as the new test deliverable. Fresh contexts and an isolated Vite origin are used, never the user's normal browser profile or any default Guild database.

- Create three actual reference-species individuals through UI, toggle a roster favorite, generate/save a real two-step Bushi route and manually complete only its first step.
- Create a base through UI, assign the owned Cooling worker and configure a covered Cooling slot.
- Pin a real Arrow craft goal and manually save Wood stock through UI. Export the separate craft backup as the exact unchanged-data oracle, including its inventory timestamp.
- Export Pal JSON through the real download control. Add only **clearly labeled synthetic recovery IDs** for an unsupported species, unsupported target/pair and missing owned-parent link. These are recovery fixtures, not claimed game data.
- Preview and cancel: assert warning text, disabled Replace until confirmation, zero IndexedDB mutation calls and unchanged exported Pal snapshot.
- Malformed JSON and malformed favorite type: assert visible error, no Replace action, zero IndexedDB mutation calls and unchanged exported Pal snapshot.
- Explicitly restore the recovery fixture; download it; replace with empty Pal scope in the same fresh context; restore the actual downloaded content. Compare the complete three-store snapshot and craft backup before/after, then reload and verify both again. Check favorite buttons, checked/unchecked real route steps and assigned base coverage.
- Instrument actual IndexedDB `add`/`put`/`delete`/`clear` calls without substituting persistence. During import only `palworld-companion-pals` tables `pals`, `bases`, `routes` mutate. Block and record all off-origin requests; assert none occurred, no mutating HTTP requests, and no page errors. This proves no Guild writes were attempted by this local workflow, not authenticated server backup/recovery acceptance.
- Separate narrow expected-failure probe records unsupported saved-route favorite import/export. Its `test.fail` marker sits immediately before the single favorite assertion, so setup/import failures are not treated as expected successes.

## Executed results

Isolated config, strict port `53356`, `reuseExistingServer:false`, independent output, two workers, zero retries; desktop Chromium and Pixel 7 Chromium emulation. Temporary root:

`/var/folders/y1/m4mhk8x543n1ytmrgf9pv41m0000gn/T/pal-backup-review-d6vsiefz`

- Immutable snapshot `npx vitest run src/features/pals`: **25 passed, 0 failed**.
- Immutable snapshot `npx tsc --noEmit`: **no errors**.
- Scoped ESLint on the new browser spec: **no issues**.
- Combined immutable browser run: one invocation completed with no unexpected failures; a subsequent raw-CLI run had **7 actual passes, 2 expected failures (route favorite), 1 unexpected failure (existing mobile favorite-off immediate reload)**. `completeness-rerun.json` preserves the latter result. Do not report that as ten independently passing capabilities.
- Final new-spec-only run, `--repeat-each=3`: **6 actual roundtrip passes** (three per device), **6 expected route-favorite failures**, **0 unexpected failures**, **0 flaky results**. Parsed `results.json` confirms actual versus expected statuses; Playwright's headline says “12 passed” because expected failures count as successful test outcomes.

Reproduction against the isolated snapshot:

```sh
node node_modules/@playwright/test/cli.js test \
  --config /var/folders/y1/m4mhk8x543n1ytmrgf9pv41m0000gn/T/pal-backup-review-d6vsiefz/playwright.config.mjs \
  pals-backup-roundtrip.spec.ts --repeat-each=3
```

The first attempt against the actively changing real working tree was discarded as snapshot acceptance evidence: the test harness initially used Playwright `check()` for an asynchronously controlled checklist and failed its immediate postcondition; changed only the new test to click plus retried checked-state assertion. That live attempt also saw seven unit failures while another worker introduced catalog snapshot shape changes. Isolation then reproduced 25/25 against the actual reviewed source. Neither the transient live failures nor the isolated pass certifies the final merged catalog implementation.

## Handoff

Commit only the verified new browser spec, leaving this review uncommitted as requested. No Pal implementation/storage, existing tests, app, shared configuration or Guild files were edited. The new test intentionally asserts the reviewed three-table contract; the catalog owner must extend fixture expectations and the explicit allowed-write scope when introducing snapshot metadata, then rerun on the final tree. Close/clarify the requested route-favorite extension and fix the original reload race before an unqualified acceptance claim. No blanket release signoff.
