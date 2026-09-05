# Independent final App draft-safety review

## Verdict

**PASS — no concrete production blocker found in `a0efeca` + `dc8ff91`.** The earlier global dirty-clear defect and disconnected-editor revision lock are resolved. This review inspected specification compliance first, then lifecycle/race quality, using actual source and independently executed tests. No production code was edited.

## Specification review

- `App.tsx:71–83` captures the rendered workspace revision and submitting editor before awaiting persistence. Success deletes only that editor's key and computes dirty state from the remaining set; it does not unconditionally clear all drafts. The saved view advances to the exact submitted payload and `expectedRevision + 1`; a follow-up snapshot replaces it directly only at that exact revision. A newer snapshot is not applied over other dirty editors.
- `App.tsx:95–105` removes only disconnected DOM keys. Connected forms remain in the set, so saving/remounting Wood cannot release an unsaved Stone form. Navigation discards unmounted Craft editors and releases their revision locks; it does not globally clear active editors. Explicit review remains the intentional global discard/rebase action.
- Pal/Base input capture is excluded from Craft dirty bookkeeping. Their successful writes refresh App through ordinary draft-aware receipt. Pal workspace roster, catalog snapshots, selected reference and revision are read coherently; generated routes retain their captured provenance.
- Storage CAS remains inside the read/write transaction before the mutation callback (`personal-db.ts:105–112`). New route validation still checks captured revision and selected snapshot exactly (`pals/storage.ts:46–54`). Neither storage implementation changed in these two commits.
- The changed-file diff contains App, Pal Workspaces, the new browser regression and its report only. Guild lazy mounting, hidden/inert retention, opt-in authentication and logout wiring are unchanged; App navigation/opt-in tests pass. This is not a claim of independently rerunning the Guild backend suite.

## Quality and independently executed evidence

- `npx vitest run src/app/App.freshness.test.tsx src/features/pals`: **33 passed**.
- After the authorized test settlement correction below, `npx vitest run src/app/App.test.tsx src/app/App.freshness.test.tsx src/features/pals`: **37 passed**.
- Frozen desktop Chromium and Pixel 7 Chromium: **22 passed**, no retries, two workers. Suites: `pal-same-tab-save`, `app-craft-freshness`, `pal-snapshot-runtime`, `pal-storage-fencing`, `pals-completeness`.
- Browser checks include same-tab Hawk/Hen → Bushi exact generation and owned-parent binding, immediate Arrow pin, navigation cleanup, independent Wood=17 / dirty Stone=23 / peer Stone=9 drafts, zero-write stale rejection (exact backup and revision equality), explicit review, paused route-save fencing and real two-tab catalog migration.
- TypeScript passed; focused ESLint passed for App, Pal Workspaces and the browser regression, and again for the modified App test. `git diff --check` passed.

Browser execution used a newly copied tree at `/var/folders/y1/m4mhk8x543n1ytmrgf9pv41m0000gn/T/app-draft-independent-5e_29zbp`, a dedicated non-reused strict-port Vite server on **4398**, and fresh browser contexts. All 42 non-test, non-temporary source files were byte-compared to the live tree after execution with **zero differences**. Required `docs/research` dependencies were copied before the successful frozen run. An initial incomplete-copy attempt was stopped and is not counted as application failure or successful evidence. Temporary diagnostic tests and configuration remained outside the repository.

Verified SHA-256:

- `src/app/App.tsx`: `3e87faf6fa5ae76e7fac8913ffa2791f3e4f54fa82e5ceb6c5ded541cbd9d9c3`
- `src/features/pals/Workspaces.tsx`: `a497f03cd18b18e5234a4da65517cdaf8a7ea848154cc6f0b5289ffd83b2a21f`

## Parent-reported App completion test failure

The parent reported the full-suite test clicking Complete Arrow immediately after finding `Arrow · 0 / 11`, then failing to find `Arrow · 11 / 11`. Independent frozen repetition reproduced the same line-23 failure **2 of 12** runs (10 passed).

A deterministic isolated diagnostic held the post-save readiness/read boundary after the real IndexedDB save. It established all of the following:

1. `Arrow · 0 / 11` is already visible while Complete Arrow is disabled by the personal fieldset.
2. `user.click` on that disabled button does not submit another save (save-call count stays one).
3. Releasing the follow-up read enables completion; clicking then produces `Arrow · 11 / 11`, with persisted completion 11 and stock still `{}`.

This is an interaction-readiness test race, not a dirty-ref failure: App publishes the successful payload before finishing its coherent recovery read and releasing `busy`.

With explicit parent authorization, `src/app/App.test.tsx` now waits for Complete Arrow to be enabled before clicking. This is a minimal `waitFor(...toBeEnabled())` settlement wait; no sleeps, retries of the action, altered production behavior, or weakened progress/stock assertions. The corrected test passed **12 of 12** repeated frozen runs, and the combined 37-test focused run passed afterward.

## Scope and handoff

Repository changes made by this review: this report and the minimal App test settlement wait. Existing unrelated working-tree edits were left untouched. The reusable gated-read diagnostic lesson was added to the existing `software-debugging-quality` skill. No commits were created. The parent should rerun its final `VERIFY_CATALOG_DIST=1 npm test` gate with the corrected test; this review does not claim that full gate was rerun here.
