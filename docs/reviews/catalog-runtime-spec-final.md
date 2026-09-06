# Crafting catalog runtime — final spec review

## Verdict: PASS (scoped)

The backup-consent blocker in `catalog-runtime-spec.md` is **closed by 44c79bb**. Independently reviewed and executed an unmodified `git archive 44c79bb`, which includes crafting runtime 945e81a and the committed reference-data packaging fix. No substitute reference fixture was needed. Concurrent App/Today/Pals and route-panel edits in the shared working tree are outside this verdict.

## Consent fix re-verification

`src/features/Settings.tsx:6,13-59` now retains the **original source string plus parsed preview and generation**, invalidates consent before a file read or typing, ignores obsolete read completions/errors, prevents preview during reads, and imports `preview.source` rather than mutable text. The synchronous pending-save ref also prevents duplicate in-flight acceptance. A failed save retains the exact reviewed envelope for retry; snapshot bytes are not lost through workspace-only reserialization.

Independently reran the committed browser regressions in fresh Chromium contexts against a dedicated strict-port server:

- Arrow preview followed by delayed nail file: confirmation disappears, preview is disabled, and completing the read does not reinstate consent. IndexedDB workspace and revision remain unchanged before fresh review.
- New typing supersedes an older file read; actual confirmed import contains arrow, not the obsolete nail bytes.
- Out-of-order files: older completion cannot replace the newer reviewed source; actual import contains the newer arrow backup.
- Failed read retains previous text but not consent; reset cancellation remains inert.
- The delayed-file scenario also injects a first import failure, then retries through the real import implementation and verifies persisted nail goals and identical source strings on both attempts.

This is executed browser interaction plus persistence readback, not a claim based on reading browser-test source.

## Runtime acceptance coverage

| Requirement | Evidence and result |
|---|---|
| Exact historical snapshots; no bundled fallback | `catalog-runtime.ts:15-20,33-38` resolves a persisted map by ID. Browser missing-byte fixture preserves the missing hash, shows `snapshot-missing`, uses literal `arrow` rather than bundled `Arrow`, and disables only the unresolved goal's completion. PASS. |
| Selected root and intermediate recipes persist | Browser imports a labeled synthetic snapshot, explicitly selects both alternatives, pins, reloads, and reads saved root ID and intermediate override. PASS. |
| Shared stock and partial results | Browser verifies two resolved goals plus one unresolved goal, wood reservation 4 and ore reservation 1; snapshot-planner tests exercise rollback of unresolved allocations and selection-context surplus. No whole-queue ready claim. PASS. |
| Numeric migration comparisons | Browser verifies first/second goal deltas from complete queue-priority plans, not independent per-goal stock ledgers; historical-unavailable is not zero. PASS. |
| Explicit migration, inert cancellation, rollback | Browser preview/cancel preserves exported workspace and revision; acknowledged legacy adoption and rollback are executed, with later quantity retained. PASS. |
| Transactional acceptance and stale proposals | Migration tests inject final history-write failure, assert all participating records/metadata/snapshot writes roll back, retry the same proposal, reject a second-facade revision change, and retain later stock/progress/notes/timestamps/checklist edits on rollback. PASS under fake IndexedDB. |
| Backup validation and roundtrips | Focused tests cover missing IDs/bytes, malformed IDs, duplicate snapshots, budgets, digest corruption and both scoped roundtrips. PASS. |

## Execution evidence

Temporary archive: `/var/folders/y1/m4mhk8x543n1ytmrgf9pv41m0000gn/T/pal-catalog-final-7pzdmlcr`.

- Focused Vitest: **89 passed, 0 failed across 9 files**. JSON report `/tmp/pal-catalog-final-archive-unit-results.json` was parsed to verify counts. Suites: catalog-snapshot (39), snapshot-planner (22), catalog-migration (8), workspace (2), crafting-completeness (3), IngredientTree (2), crafting-recovery (2), inventory-history (5), Settings-consent (6).
- `npx playwright test --config playwright.backup-consent.config.ts`: **4 passed** in desktop Chromium, strict port 4297, no existing-server reuse.
- `npx playwright test --config playwright.catalog-runtime.config.ts`: initial run **5 passed / 1 failed** because rollback's immediate `page.evaluate` raced the intentional reload. Unmodified rerun: **6 passed**, three scenarios in desktop and Pixel 7 Chromium, strict port 4287. This test synchronization issue is documented in the quality review, not hidden as a product success on the first run.
- `npx tsc --noEmit`: passed on the archive.
- Scoped ESLint over Craft, Queue, Shopping, IngredientTree, catalog-runtime, Settings, Settings-consent and CatalogMigrationPanel: passed.

## Scope and side effects

This approves the crafting runtime and exact backup-consent closure, not full-application concurrent-edit safety or the separately owned App/Today/Pals integration. No production source, tests, configuration, checkout, or user browser data was changed. Only the final review reports were added to the repository. Temporary test outputs remain under the OS temporary directory; Playwright-managed servers exited, and ports 4287/4297 had no listeners after execution.
