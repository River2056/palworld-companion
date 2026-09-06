# Crafting catalog runtime — independent quality review

## Verdict: APPROVED (scoped)

No important new defect found in the crafting runtime introduced at 945e81a or the backup-consent correction at 44c79bb. The previously reproduced destructive unpreviewed-backup replacement is closed. Review and primary execution used an unmodified archive of **44c79bb**, excluding concurrent shared-tree App/Today/Pals and route-panel changes. The exact crafting runtime/persistence files inspected have no delta between 945e81a and 44c79bb, apart from Settings' separately reviewed consent correction.

## Findings

### Nonblocking test reliability — rollback readback races reload

**Location:** `tests/e2e/catalog-runtime.spec.ts:24-26`.

The first independent run failed one of six cases with `page.evaluate: Execution context was destroyed, most likely because of a navigation`. After clicking Accept, the visibility assertion can match the pre-reload heading before `window.location.reload()` begins; the ensuing IndexedDB read then loses its page context. The unchanged suite passed all six cases on immediate rerun.

Recommendation: arm a navigation/load wait together with acceptance (as the backup-consent tests already do), then assert the new page is ready before persistence readback. This is a concrete harness flake, not evidence of failed rollback or a reason to reopen the consent blocker. No test source was changed for this review.

## Quality assessment

- **Snapshot boundaries:** the runtime fetches metadata and snapshot bytes in one read transaction; the resolver closes over that coherent map. Historical goal names and recipe calculations use the goal's exact saved binding. Missing references remain absent, with literal-ID labels, rather than falling through to selected or bundled rules. Inventory is intentionally unbound physical stock and uses selected labels while retaining unknown stored IDs.
- **Action paths:** Craft constructs a pin carrying the actual displayed snapshot ID, root recipe ID and intermediate overrides before awaiting the supplied updater. Queue actions use the existing goal rather than resolving against a new selected catalog mid-action. No new asynchronous resolver read was inserted ahead of those workspace writes. A boolean update result is respected for Craft's success-only UI cleanup; existing goal/inventory components depend on App's save/error handling.
- **Consent lifetime:** Settings separates mutable input from immutable reviewed source, fences stale read success and failure by generation, and uses synchronous refs in addition to disabled UI. Acceptance cannot be redirected by a newer file read; failed acceptance retries the reviewed schema-2 envelope unchanged. Full digest verification remains in the persistence layer before writes, accurately disclosed by the preview.
- **Recipe identity:** duplicate pin compatibility compares snapshot, root recipe and normalized override entries, preventing same-item goals with different rule choices from being silently merged. IngredientTree receives an explicit snapshot; its legacy `catalog` parameter is only an explicit caller seam, not a bundled fallback. Root/override persistence was executed in Chromium, not inferred from types.
- **Migration atomicity:** private detached proposals bind acceptance to candidate bytes, expected revision and original bindings/root IDs. Candidate, workspace/route bindings, selected reference and history share one write transaction. Last-write failure retains the proposal for retry and rolls back writes. Cancellation deletes the proposal; rollback reverses references rather than overwriting later personal edits. Fake IndexedDB tests exercise failure injection, detached-preview mutation and second-facade revision conflicts; browser tests exercise successful accept/cancel/rollback with actual persistence.
- **Partial-result honesty:** unresolved goals are shown separately, resolved stock is allocated once per alternative projection, and affected completion is blocked. Both missing-goal and valid-goal controls are asserted together in Chromium. Numeric comparisons derive per-goal contributions from whole-queue plans.

## Explicit ownership boundaries (not new findings)

This is **not** blanket approval of App-level stale workspace writes. At the reviewed archive, `App.tsx:30-35` saves a whole supplied Workspace without an expected revision; its data load is separate from the live runtime metadata stream. `WorkspaceStore.save` supports an expected revision, but App does not pass it. Accordingly, a live resolver refresh is not proof that a stale App workspace payload is safe against another tab. This pre-existing App integration responsibility is intentionally left with the separately assigned reviewer rather than duplicated as a new crafting delta blocker.

Likewise, migration comparison rendering reads workspace data after proposal creation. Acceptance is revision-fenced, but display freshness across concurrent edits is not guaranteed by that fence alone; the App/Pals integration report already records this boundary. This review does not claim to have executed a two-real-tab stale-write test, Pal/base migration UI acceptance, visual screenshot review, or full-application acceptance.

## Verified checks

- Archived focused Vitest: **89/89 passed, 9 files**; exact suite counts and JSON evidence are in `catalog-runtime-spec-final.md`.
- Backup-consent Playwright: **4/4 passed**, fresh desktop Chromium contexts, strict port 4297.
- Catalog-runtime Playwright: first run **5/6**, navigation-race harness failure above; unchanged second run **6/6**, desktop and Pixel 7 Chromium, strict port 4287.
- Archived TypeScript: no errors. Scoped ESLint: no issues.
- An additional focused run against the shared working tree also completed successfully, but is not substituted for the archived-snapshot evidence.

Only `docs/reviews/catalog-runtime-spec-final.md` and this report were written in the repository. No production code, configuration, tests, git history or user browser storage was modified. No new release blocker found within this scope.
