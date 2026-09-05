# Same-tab Pal route save and independent craft drafts

## Outcome

Fixed against `f4060b6`. The real UI now creates male Ragnahawk **Hawk** and female Chikipi **Hen**, saves the two-step Bushi route without reload or explicit-review workaround, and reads back the exact generation snapshot binding and owned-parent IDs. The same session can immediately enter Craft and pin Arrow.

## Diagnosis and changes

- Reproduced the original failure before editing: the new desktop browser regression reached the save button but persisted zero checklist steps; the browser displayed `Data changed; search again before saving route.` and the unrelated App draft banner.
- App's broad input capture treated Pal/Base edits as unsaved craft-workspace inputs. Separate Pal roster and catalog-runtime subscriptions also lacked a common read boundary; post-write roster refresh did not refresh the runtime token with it.
- `src/features/pals/Workspaces.tsx` now reads roster, retained snapshots, selected catalog and metadata revision in one read transaction. Initial load, subscription and own-write refresh all publish that coherent view, with monotonic revision acceptance. Enumeration and its save closure use that view; storage is not consulted to replace provenance at save-click time.
- Pal/Base own-write completion notifies App to settle its workspace revision before subsequent craft work; this uses normal draft-aware receipt, never forced replacement of another draft.
- `src/app/App.tsx` excludes Pal/Base controls from craft dirty capture and tracks actual dirty editor elements. Saving Wood clears only Wood's editor, not an unsaved Stone or goal editor. Own successful saves advance to their exact payload/revision; a racing newer read cannot overwrite other drafts. Explicit review remains the discard/rebase action.
- No storage API, transaction CAS, snapshot-ID or new-route generation guard was changed. A pending save retains its originally captured generation even when a second tab migrates the catalog.

## Verification

- `npx playwright test tests/e2e/pal-same-tab-save.spec.ts tests/e2e/pal-snapshot-runtime.spec.ts tests/e2e/app-craft-freshness.spec.ts tests/e2e/pal-storage-fencing.spec.ts tests/e2e/pals-completeness.spec.ts --workers=2`: **20 passed**, desktop Chromium and Pixel 7 Chromium.
- New `tests/e2e/pal-same-tab-save.spec.ts` verifies the exact same-tab route, stored binding/parents, immediate subsequent craft save, and the actual two-tab Wood=17 / unsaved Stone=23 / peer Stone=9 scenario. Stone stays 23, explicit review appears, attempted stale save preserves the exact exported backup and revision, and review reveals Stone=9 with Wood=17.
- Retained existing UI paused-save and real two-tab catalog-migration tests pass: stale generation rejects and creates no route; exact binding is checked after fresh generation.
- `npx vitest run src/app/App.freshness.test.tsx src/features/pals`: **33 passed**.
- `npm run typecheck`, focused ESLint with `--max-warnings 0`, and `git diff --check`: clean.

## Adjacent reconciliation issue (not hidden)

The separately owned `pals-backup-roundtrip.spec.ts` was also exercised. Its formerly blocked Pal route and subsequent Arrow pin now succeed, but both viewport cases stop at line 90: the test reads `craftBefore.goals` from the obsolete bare-workspace export shape. Current export is a schema-v2 envelope (`workspace.goals`). This test-contract mismatch was not edited in this scope. No reload workaround was introduced.
