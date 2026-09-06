# Independent App crafting freshness review

Reviewed `f4060b6bc9b3e3a54fb5aae8389bb936fd7101c3` against its parent, plus the current working-tree integration. Source files were not edited.

## Verdict

CAS and the single-draft conflict/review flow pass independent execution. **One important draft-preservation defect remains:** saving one form clears protection for every other unsaved form.

## [BUG] Saving one editor silently unprotects other drafts

**Location:** `src/app/App.tsx:71–74`, with automatic refresh at `:53` and inventory remount keys at `src/features/Queue.tsx:64`.

`dirty.current=false` clears the workspace-wide dirty flag after any successful save. The page contains independently saved inventory forms and goal editors. Successfully saving Wood does not persist an outstanding Stone edit, but nevertheless makes the entire page eligible for subsequent automatic replacement.

Independent real Chromium reproduction, using two pages in a fresh isolated context on port 4291:

1. In page A, enter Wood `17` and Stone `23` without saving either.
2. Save only Wood. Stone still visibly contains the unsaved `23`.
3. In page B, save Stone `9`.
4. Page A silently replaces Stone `23` with `9`; no explicit-review button is shown.

Actual output:

```text
stone draft immediately after wood save: 23
stone draft after peer save: 9
explicit review visible: 0
```

**Recommendation:** retain dirty status for other unsaved editors after an individual save, using per-editor dirty tracking or an equivalent accurate draft inventory. Do not clear global draft protection merely because one form saved. Add the two-form/two-tab regression above; it should preserve `23` and require explicit review.

## Spec verification

- Workspace data and revision are read within the same read-only IndexedDB transaction; saves capture the revision of the rendered `view`, not the newest live notification.
- Store CAS checks precede the mutation callback, preventing stale full-workspace replacement and catalog binding insertion.
- Existing two-tab tests prove stale inventory and catalog-migration goal edits leave exported backup and revision unchanged, preserve the rejected draft, and recover through explicit review.
- Input capture is **not** click capture. A separate real-browser check selected Arrow without typing, then saved Wood in another tab: the idle page refreshed correctly. Ordinary button clicks do not accidentally dirty the page.
- Draft baseline map: Craft owns controlled selection/query/quantity/overrides; GoalEditor uses uncontrolled quantity/progress/notes keyed by persisted values; Inventory uses uncontrolled stock inputs keyed by persisted stock. Preventing view replacement protects the latter forms until explicit epoch remount. The global dirty-clear defect breaks that protection when multiple forms are edited.
- The synchronous `writing` ref blocks overlapping submissions before React commits the disabled state; no optimistic workspace replacement occurs before save success.
- Read failures use the storage/save error UI. Failed recovery reads preserve the original save error and draft. There is no dedicated initial-load retry control (also absent before this change); fault-injected read-failure recovery was not dynamically tested.
- Guild remains outside the keyed personal fieldset; lazy mounting, hidden/inert retention, authentication and logout wiring are unchanged. Existing App navigation/opt-in test passes.

## Executed checks

- `npx vitest run src/app/App.freshness.test.tsx src/app/App.test.tsx`: **6 passed**.
- `npx playwright test --config playwright.app-freshness.config.ts`: **4 passed**, desktop/mobile Chromium, actual two-tab IndexedDB conflict tests.
- Direct `./node_modules/.bin/tsc --noEmit`, captured through Python subprocess: **exit 0**.
- Additional browser reproduction: `/tmp/review-app-craft.mjs`; confirms the defect above and the non-input-click behavior.

The browser tests use fresh Playwright contexts and port 4291 with a non-reused server. No default user database reset was performed; unit reset calls operate on fake IndexedDB. The supplied final-report path did not exist initially; this review creates it. Existing unrelated working-tree changes were left untouched.
