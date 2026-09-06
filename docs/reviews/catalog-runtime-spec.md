# Crafting catalog runtime spec review — snapshot 945e81a

## Verdict: CHANGES REQUIRED

Independent review of the crafting runtime, migration panel, and crafting data import at **945e81a**. One reproduced exact-consent defect remains in crafting backup import. The core snapshot planning and migration scenarios passed. This is not a review of concurrent working-tree changes or later route-panel work. App/Today/Pals integration gaps assigned to another worker are deliberately not repeated as scoped defects.

## [BUG] P2 — Asynchronous file loading can replace a different backup than the displayed preview

**Location:** `src/features/Settings.tsx:6-7` (snapshot 945e81a).

The file handler clears `preview` before awaiting `f.text()`, but does not invalidate it when the read completes. `Preview import` remains enabled during that read and parses the previous `text`. Confirmation executes `workspaceStore.import(text)` against the latest mutable text, not the bytes that produced the displayed preview.

**Browser reproduction:**

1. Fill Backup JSON with valid backup A containing an `arrow` goal.
2. Select file B containing a `nail` goal; delay `File.prototype.text()` to deterministically model an outstanding asynchronous read.
3. Click Preview import while B is loading: the preview displays `arrow: 1 · legacy-unbound`.
4. Complete B's read. The preview still displays `arrow: 1 · legacy-unbound`.
5. Click Confirm replace. Read back `workspaceStore.load()` from IndexedDB: imported goal IDs are `["nail"]`.

This is an actual destructive replacement of unpreviewed data, not merely a stale label. The reproduction used an isolated Chromium context and the archived snapshot source, with only the missing reference fixture supplied as described below.

**Recommendation:** Store immutable source bytes together with each import preview and accept those exact bytes. Disable preview/accept during file reads, invalidate previews when a read completes, and use a request generation token so an older read cannot overwrite a newer selection. Add a delayed-file-read regression test asserting confirmation either remains unavailable or imports exactly the previewed backup.

## Verified scoped behavior

- **Exact snapshot lookup / no bundled fallback:** `src/features/catalog-runtime.ts:15-20,33-38` resolves saved bindings from persisted snapshots. Missing IDs remain missing; labels use saved snapshots or literal IDs. The bundle is not substituted for historical bindings.
- **Root and intermediate recipe selections:** Craft pins persist snapshot ID, explicit root recipe ID, and recipe overrides; browser tests select synthetic alternatives and verify them after reload.
- **Shared stock and provenance:** Planning uses one queue-wide physical stock ledger per alternative projection, with per-goal contributions and selection-context-local hypothetical surplus. Unresolved goals roll back their allocation effects. Browser checks confirm shared wood/ore reservations are not duplicated.
- **Partial unresolved results:** Shopping retains resolved goals, exposes diagnostics and resolved-only scope, and makes no whole-queue ready claim. Missing-reference completion buttons are disabled.
- **Migration numeric comparisons:** `src/features/CatalogMigrationPanel.tsx:17-26` computes complete old/new queues first, then extracts contribution rows per goal. This preserves queue-priority stock and surplus effects, rather than planning each goal independently. Lines 31-35 display direct/raw required and missing deltas; unavailable historical calculations are not represented as zero.
- **Migration consent/cancel/accept/rollback:** The migration service retains detached proposals, validates revision/binding conflicts, and commits snapshot/binding/selection/history changes transactionally. Cancellation is inert. Legacy adoption requires acknowledgement. Rollback changes references while preserving later quantity, progress, notes, inventory and timestamps. These migration guarantees do not cure the separate backup-import defect above.
- **Data validation:** Focused tests cover digest corruption, malformed snapshot IDs, duplicate snapshots, import size/count limits, missing-byte identity preservation, and scoped roundtrips.

## Verification evidence and reproducibility limit

The shared worktree contains unrelated modifications, so tests ran against a temporary `git archive 945e81a` extraction with the existing installed dependencies linked in; no source checkout or commit was changed.

**Clean snapshot blocker:** `src/domain/catalog-snapshot.ts:2` imports `docs/research/pal-reference.json`, but that file is absent from the commit tree and exists only as an untracked working-tree file. An unmodified archive failed all eight selected suites during import resolution; no tests executed. This is a standalone snapshot packaging limitation, not attributed to the crafting runtime delta. Ensure the referenced data is included in the eventual integrated delivery.

After copying that actual working-tree reference file into the temporary archive (not inventing fixture data):

- Focused Vitest: **83 passed across 8 files** — `catalog-snapshot`, `snapshot-planner`, `catalog-migration`, `workspace`, `crafting-completeness`, `IngredientTree`, `crafting-recovery`, and `inventory-history`.
- Existing `playwright.catalog-runtime.config.ts`: **6 passed**, covering three scenarios in Desktop Chrome and Pixel 7 Chromium.
- Additional delayed-file-read Chromium inspection reproduced the import mismatch and verified the resulting goal via a direct IndexedDB facade readback. An initial attempt was inconclusive after a locator timeout; a fresh rerun completed and produced the evidence above.

These passing tests are conditional on the supplied untracked reference data; they are not evidence that a clean checkout of 945e81a is independently runnable. No visual screenshot review, full-application acceptance, or later route-panel verification is claimed.

## Files and side effects

Only this report was created in the repository. No code edits or commits. Temporary archived source/test artifacts were created under the operating-system temporary directory; browser tests used isolated contexts and temporary Vite servers, which were stopped. Existing user browser storage was not touched.
