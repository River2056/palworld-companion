# Backup import exact-consent fix

## Outcome

Fixed the Settings backup race reported in `docs/reviews/catalog-runtime-spec.md`: a delayed file read can no longer turn an arrow preview into an unreviewed nail import.

- Each preview retains its immutable original source string, parsed display workspace, and input generation. Confirmation imports that source string, never the mutable textarea value. Original schema-2 envelopes and snapshot bytes are preserved; backup APIs are unchanged.
- File selection immediately invalidates import/reset consent and disables preview while reading. Successful current reads update the input without authorizing import. Failures retain the previous input and saved workspace, but require fresh preview.
- Generation guards discard superseded file completions and errors, including reads overtaken by typing, another file, reset, or unmount.
- Typed changes invalidate consent. Reset and import confirmations do not carry into one another. Cancel performs no write. Import controls are disabled during save and duplicate confirmation is guarded synchronously. Failed saves preserve the reviewed payload for exact retry.

## Verification

All commands ran against the shared working tree, not an isolated commit archive:

- `npx vitest run src/features/Settings-consent.test.tsx src/features/crafting-recovery.test.tsx src/data/workspace.test.ts` — **10 passed**, including six new consent tests. The schema-2 retry test retains a real bundled catalog snapshot and its binding, asserting byte-for-byte identical import arguments across failures.
- `npx playwright test --config playwright.backup-consent.config.ts` — **4 passed**, isolated Desktop Chromium contexts and dedicated temporary Vite server on port 4297.
- `npx eslint src/features/Settings.tsx src/features/Settings-consent.test.tsx tests/e2e/backup-consent.spec.ts playwright.backup-consent.config.ts --max-warnings 0` — passed, no issues.
- `npm run typecheck` — passed.
- `git diff --check -- src/features/Settings.tsx` — passed.

Browser tests deterministically defer native `File.text()` without sleeps, release actual uploaded file bytes, and verify persisted workspace data through `workspaceStore.load()` after real imports/reloads:

1. Arrow preview → pending nail file: preview disabled and confirm absent; completing the file still leaves confirm absent. IndexedDB data and revision remain unchanged until nail is separately reviewed. Cancel remains inert. An injected first-save failure leaves data unchanged; retry passes the exact reviewed nail bytes to the actual importer and readback contains only nail.
2. Pending nail file → typed arrow preview → old file completion: input and consent remain arrow; actual import/readback contains only arrow.
3. Older nail file → newer arrow file completes and is reviewed → older file completes: actual import/readback contains only arrow.
4. Read failure retains prior input without confirmation. Reset clears import consent; cancel reset leaves IndexedDB data and revision unchanged.

## Scope and limitations

Only Settings, its focused unit/browser tests, the dedicated browser config, and this report were changed. No App, catalog panel, storage, or backup API edits. Tests use disposable browser storage; user browser data was not touched. These results do not claim full application or mobile acceptance.

The first browser run exposed an exact-label locator issue after React updates textarea contents, not an application crash: the DOM retained the textbox and expected value. Tests now use the textbox's exact accessible role/name. An initial lint finding in the deferred native-read helper was also corrected; the final complete rerun passed.
