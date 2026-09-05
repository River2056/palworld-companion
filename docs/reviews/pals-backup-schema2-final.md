# Pal backup schema-v2 final verification

## Result

PASS: desktop Chromium and Pixel 7 mobile Chromium each completed the full scoped backup roundtrip twice: **4 passed (6.5s), zero retries, skips, or expected failures**. No production changes were needed.

## Fixture corrections

- Craft export reads now use the schema-v2 `scope: 'craft'` envelope and `workspace.goals`, `workspace.stock`, and `workspace.stockUpdatedAt`, with explicit schema/scope assertions.
- Assert a nonempty catalog snapshot and equality of Pal/craft exported catalog snapshots and personal metadata.
- Synthetic unknown-route recovery data explicitly carries its schema-v2 legacy-unbound binding. Exact snapshot comparisons remain intact; the fixture does not discard or normalize actual exported records.
- Successful replacement audits now target the consolidated `palworld-companion` database and permit only `pals`, `bases`, `routes`, and `metadata`. Exactly three metadata writes accompany the three successful replacements. Workspace, catalog snapshot, and migration-history writes are forbidden in this same-snapshot fixture.
- Preserve the prior removal of the unsupported saved-route-favorite expected-failure test. Roster favorites remain covered; route favorites are not claimed as supported or counted as passing coverage.

## Verified behavior

- UI-created roster of three Pals, roster favorite true/false values, a two-step route with exactly one completed step, and a base with assigned cooling worker.
- Preview and cancel cause no IndexedDB writes and preserve the exact original Pal snapshot.
- Both malformed JSON and an invalid favorite value reject without a replacement button or any IndexedDB writes; exact data remains unchanged.
- Unknown species, child, pair, and missing owned-parent IDs survive import/export, destructive empty replacement, downloaded-backup restore, and reload.
- Catalog snapshots and recovery bindings survive the roundtrip.
- Complete schema-v2 craft export equality before/after replacement and reload preserves the craft goal, stock, stock timestamp, snapshots, and exported metadata, rather than comparing only counts.
- Reloaded favorite/checklist/base UI retains saved state. No external requests, HTTP mutations, or page errors occurred.

## Reproducible isolation and evidence

Frozen runtime: `dc8ff914c363b68a7bb7685c02922b35b473ab77` in detached worktree `/tmp/pal-backup-schema2-final`, with only the working test copied in. No moving production sources were served. Dependencies were linked from the original repository.

Dedicated Vite port: `4297`, strict port, `reuseExistingServer: false`. Temporary configuration: `/tmp/pal-backup-schema2-final/playwright.backup-final.config.ts`; output directory: `/tmp/pal-backup-schema2-final-results`.

Executed from the frozen worktree:

```sh
./node_modules/.bin/playwright test --config playwright.backup-final.config.ts
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint tests/e2e/pals-backup-roundtrip.spec.ts --max-warnings 0
git diff --check
```

All exited successfully. Playwright used `repeatEach: 2`, both desktop/mobile projects, two workers, and `retries: 0`.

Test SHA-256 matched in frozen and original worktrees: `3977b53ce3882e6772173cd42a71917f1759af769c4efedf0cc08e2b36fc26a6`.

Scope is this backup fixture against the frozen runtime, not an assertion that every repository E2E suite passes. No runtime bug was masked and unrelated working changes were left untouched.
