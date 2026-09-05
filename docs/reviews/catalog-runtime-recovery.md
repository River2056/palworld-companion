# Craft snapshot runtime recovery

Recovered the timed-out crafting UI slice without modifying App, Today, Pals, Guild, storage, or planner sources.

## Verified

- `npm test -- src/features/crafting-completeness.test.tsx src/features/IngredientTree.test.tsx src/features/crafting-recovery.test.tsx src/features/inventory-history.test.tsx`: 12 passed.
- `npx playwright test --config playwright.catalog-runtime.config.ts`: 6 passed (three scenarios each in Desktop Chrome and Pixel 7 Chromium).
- Owned-file ESLint: clean.
- Last whole-project typecheck: blocked by concurrent/unowned `tests/e2e/catalog-persistence.spec.ts:117-120` (`result` is unknown). No owned-file diagnostics.

Browser scenarios use isolated Playwright contexts on strict port 4287, output `/tmp/palworld-catalog-runtime-results`; no normal browser profile or user database was reset.

Acceptance covers selected-snapshot pin and reload, synthetic root and intermediate alternative persistence, partial unknown diagnostics with shared stock allocation, explicit local candidate import, queue-priority numeric migration deltas, cancel preserving exported data and revision, acknowledged legacy adoption, rollback preserving later quantity edits, and missing snapshot bytes blocking only the affected goal without bundled fallback. Alternate-recipe fixtures are explicitly synthetic, not game facts.

## Integration seams remaining outside ownership

- `src/app/App.tsx:56-57`: replace hardcoded recipe/material counts and blanket alternate-excluded text with selected runtime manifest/catalog information. Runtime hook is `useCatalogRuntime()` in `src/features/catalog-runtime.ts`; it exposes `runtime.selected`, metadata, exact `resolve`, and loading error. App currently loads workspace data once; migration/import panels reload after successful writes to keep its data coherent.
- `src/features/Today.tsx:79`: replace `plan(catalog,...)` with `planRuntimeWorkspace(runtime,data)`; consume `diagnostics`, `goalResults`, and `complete` rather than old `blocked`. Labels must use `goalItemName(runtime,goal)`, not the current bundle. Today route/base projections still reference module-level Pal catalog.
- Pals: selected snapshot `runtime.selected.pals` supplies new searches/plans. Saved routes/bases must resolve each record's exact bound snapshot through `runtime.resolve(binding.snapshotId)` and pass its Pal catalog through analysis/validation/naming; legacy/missing references remain diagnostic, not latest fallback. CatalogMigrationPanel currently exposes keep/migrate decisions only for goals; route/base-specific decision and comparison UI belongs to the Pal integration.

## Remaining limitations

No claim of full application acceptance, visual screenshot review, or complete Pal/base migration UX. Existing components are compact and would benefit from formatting/refactoring separately. Shared working tree has concurrent changes; only the crafting runtime, scoped tests/config, and this evidence note are included in this commit.
