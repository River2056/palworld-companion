# App crafting freshness closure

## Finding and fix

At `99a4625`, App loaded a workspace once and saved whole replacement payloads without `expectedRevision`. A later tab's inventory, queue or catalog migration could therefore be silently overwritten.

App now subscribes with Dexie `liveQuery` to an atomic read-only transaction over workspace and metadata. The rendered workspace and its revision are one state value. Each user save captures **that rendered revision**, not the latest notification's revision, and passes it to the existing transactional CAS in `WorkspaceStore.save`.

Live and explicit read completions are revision-monotonic. Idle views refresh automatically. Input events mark local forms dirty: newer persisted snapshots are refreshed in memory, but do not remount or overwrite unsaved forms. A rejected save retains the draft and original error, does not retry, and offers **Review latest workspace (discard draft)**. That explicit action applies the latest coherent snapshot and remounts personal editors; the user must reapply the intended edit. This deliberate review step avoids rebasing an old full workspace or old goal binding onto a newer revision.

No storage API changes, automatic save on startup, production data reset, or Guild lifecycle changes. Guild remains outside the personal editor reset boundary; lazy loading, hidden/inert retention, authentication state and logout signals are untouched.

## Executed evidence

- `npx vitest run src/app/App.freshness.test.tsx src/app/App.test.tsx`: 6 passed. Two real Dexie connections verify stale App save arguments, actual CAS rejection, unchanged exported backup and revision, retained draft/error, explicit recovery, and idle refresh without startup saves.
- `npx playwright test --config playwright.app-freshness.config.ts`: 4 passed (desktop and mobile Chromium). Two actual pages in one isolated browser context exercise normal inventory edits and catalog migration while another tab has dirty notes. Actual App save delegates to real IndexedDB; stale attempt leaves the full export and revision unchanged. Drafts survive rejection; explicit review and subsequent save recover without losing the other tab's goal.
- `npm run typecheck`: passed.
- Targeted ESLint: passed.

The standard Playwright port 4173 was already occupied. The dedicated reproducible config uses port 4291 and does not reuse or stop the existing server. Browser storage exists only in fresh Playwright contexts; existing user data was not touched.

## Scope boundary

Settings backup import has its own explicit replacement consent flow and does not call App's update path; it is not changed here. CatalogMigrationPanel is owned by a separate worker and was not edited. Dirty forms intentionally keep the old rendered baseline until the user chooses to discard/review, rather than claiming a conflict was merged automatically.
