# Crafting milestone recovery — final review

## Verdict

**Scoped crafting verification is green.** Spec review preceded targeted fixes; code-quality review followed. This is a reference-catalog crafting milestone, not completion of the entire product plan. The latest explicit craft-more instruction overrides the older plan sentence allowing existing final-target stock to satisfy a goal.

## Spec review and fixes

- Confirmed actual files live directly under `src/features/`, not `src/features/crafting/`.
- Confirmed fuzzy typo/partial/alias search, explicit selection, finished-unit quantities, default direct ingredients, stations, source/license links and visible unverified-patch warnings. Added missing explicit output-per-run text, retained curated aliases, normalized query whitespace, and corrected recent selections to newest-first.
- Confirmed pins can be edited, reordered, removed, partially fulfilled and completed. Completion leaves manual inventory untouched. Today derives its active/completed/blocked/missing summary from real state.
- Confirmed separate direct/raw planning ledgers, shared owned-stock allocation once per projection, intermediate stock before expansion, reuse of batch excess and dependency-before-consumer steps. Added a synthetic mixed-depth sibling-demand test with both ingredient orders. Both produce the same leaf demand and one intermediate batch; the amount labeled planned reuse appropriately differs by allocation order. No planner rewrite was needed.
- Confirmed safe integer validation, arithmetic overflow rejection, cycle validation, completed-goal exclusion and unresolved target blocking.
- Confirmed Dexie stores the complete personal crafting state in a transaction, validates persisted/imported data and preserves unknown IDs. Import remains preview-then-confirm replacement, never silent merge.
- Fixed import ambiguity: a known leaf material used as a goal is still an unresolved recipe and is now disclosed in the preview instead of misleadingly reporting no unknown records.
- Fixed failed-save UX: App updates return explicit success; failed import/reset retains its preview or confirmation and input for retry instead of dismissing as if successful. Added component regression coverage.
- Repaired two stale browser assertions: note text also exists in a textarea, and unknown inventory uses the actual `Unknown: ...` accessible name. These were test-selector failures, not broken persistence.
- Updated README from the obsolete foundation-only description to actual commands, state, semantics and limitations.

## Shell integration (explicit mid-task authorization)

Mounted exported `PalWorkspace` and `BaseWorkspace` components at Breeding and Bases hash destinations. Guild alone remains upcoming. Changed obsolete shell assertions and exercised both new routes, their rendered content and reload on desktop/mobile. No Pal or Guild implementation files were edited. Settings now explicitly says its backup/reset covers crafting only, avoiding an accidental all-module-backup claim.

## Code-quality review

Reviewed pure planner boundaries, mutation avoidance, separate owned/planned ledgers, validation before writes, async UI error propagation and accessible controls. Scoped ESLint reports no issues and TypeScript/build passes. Single-tab editing is explicitly documented; this store is not a multi-tab conflict-resolution design. Native buttons, labels and details support keyboard/touch use; browser tests cover focus and horizontal overflow.

The inherited UI files are densely formatted. They would benefit from a dedicated readability refactor, but a broad rewrite was deliberately avoided during timeout recovery. No evidence-backed calculation defect remained after the added mixed-depth case.

## Real execution evidence

Final successful command sequence:

```sh
npx vitest run src/domain src/data src/app/App.test.tsx src/features/crafting-recovery.test.tsx
npm run validate:catalog
npm run build
npx eslint src/domain src/data src/app src/features/Craft.tsx src/features/Queue.tsx src/features/Settings.tsx src/features/Shopping.tsx src/features/Today.tsx src/features/crafting-recovery.test.tsx tests/e2e/crafting.spec.ts tests/e2e/shell.spec.ts --max-warnings 0
npx playwright test tests/e2e/crafting.spec.ts tests/e2e/shell.spec.ts
```

Results: **16 unit/component tests passed**, catalog validation **2 tests passed** (a repeated subset of the 16), TypeScript and Vite production build passed, scoped ESLint clean, **8 browser tests passed** across desktop Chromium and Pixel 7 emulation. Build transformed 49 modules. Browser flows include pin/edit/reorder/remove, inventory reload, progress-only completion, export/download/import round-trip, reset/cancel, invalid inputs, unresolved retained records, keyboard selection, Today summary and mobile overflow. Generated screenshots remain under ignored `test-results/`.

Initial execution had 13 unit/component tests green and four crafting browser failures caused by the two stale selectors. After shell integration the old upcoming-route assertions failed and were corrected. The mixed-depth test initially incorrectly expected identical surplus-allocation labeling for both traversal orders; corrected the expectation while keeping equal raw demand, single batch and stock-once checks. Final results above are rerun results, not inferred successes.

## Remaining scope / cautions

- Limited 10-recipe/7-leaf mixed-revision reference data is accepted; no fresh game-data research or current-patch claim. Original research and Pal attribution were preserved.
- Larger-plan features not claimed here: per-goal material provenance, interactive recursive recipe trees (the current view is a flattened raw/dependency alternative), duplicate-pin merge offers, inventory timestamps, catalog snapshot migrations, dedicated completed history and shared guild workflows.
- Unknown recipes block; catalog cycles fail validation rather than rendering a partial cyclic branch. This is safe for the validated bundled catalog but less capable than the full future catalog contract.
- Settings is a crafting-only backup; separate Pal/Base stores are not included.
- Other workers' Guild scripts and Pal internals were out of scope. Earlier unrelated failures were reported by the parent; this review does not assert that every concurrent repository suite/lint target is green. The full production build did pass with the integrated shell.
- Port 5173 was left alone. Playwright managed its own temporary server on 4173.
