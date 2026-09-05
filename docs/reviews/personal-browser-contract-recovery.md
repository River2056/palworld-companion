# Personal browser contract recovery

## Outcome

Recovered the import-preview disclosure regression without changing the immutable source bytes, read-generation fencing, consent invalidation, import transaction, or retry behavior introduced in `44c79bb`.

`Settings.tsx` now lists raw stock IDs and quantities, manual timestamps, recent selection IDs, and retained goal metadata (identity, progress, notes, recipe choices, bindings and claimed legacy version). An explicit warning says unknown IDs are retained rather than dropped or replaced. These are saved-ID projections, not compatibility claims against whichever catalog happens to be selected.

## Fixture reconciliation

- `catalog-persistence.spec.ts`: the route fixture supplies the captured snapshot ID and current metadata revision required by `saveRoute`; rollback, retry, history retention and legacy fencing assertions remain intact.
- `crafting.spec.ts`: selectors follow the scoped crafting reset/import controls and current empty-search wording. The unknown-import assertion was **not removed**: it now checks stock/recent IDs, quantities, timestamps, goal metadata and the warning before acceptance, disabled completion both before and after reload, and exact retained workspace contents inside the exported schema-2 envelope. A legacy-unbound goal is described as unresolved rather than borrowing current rules to call it an unknown recipe.
- `inventory-history.spec.ts`: explicitly acknowledges and accepts legacy adoption before expecting runnable Arrow behavior. Schema-2 export assertions retain identity, notes, progress, quantities and both old/new stock timestamps, and verify the adopted snapshot binding.
- `crafting-completeness.spec.ts`: unchanged; current source passes duplicate-pin, branch expansion and per-goal allocation assertions on both devices.

## Verification

Dedicated frozen source tree: `/tmp/palworld-personal-recovery-frozen`; dedicated Vite port **4397**, `reuseExistingServer: false`, three workers, no retries. Compared all five scoped product/test files byte-for-byte with the repository after execution: all equal.

```sh
node node_modules/@playwright/test/cli.js test --config playwright.personal.config.ts catalog-persistence crafting.spec crafting-completeness inventory-history backup-consent
```

**26 passed; 0 skipped, failed or flaky**, desktop Chromium and Pixel 7 Chromium:

| Suite | Passed |
| --- | ---: |
| catalog-persistence | 10 |
| crafting | 4 |
| crafting-completeness | 2 |
| inventory-history | 2 |
| backup-consent (unchanged regression coverage) | 8 |

Machine-readable evidence: `/tmp/palworld-personal-recovery-results.json`; artifacts: `/tmp/palworld-personal-recovery-artifacts`. This final direct-CLI run also reverified the earlier 18-test personal batch and eight-test consent batch.

```sh
node node_modules/vitest/vitest.mjs run src/features/Settings-consent.test.tsx src/features/crafting-recovery.test.tsx src/features/inventory-history.test.tsx src/data/workspace.test.ts
```

**15 tests passed in four files**, including all six immutable-consent/read-generation unit cases.

## Limitations / encountered issues

The first frozen copy omitted `docs/research` JSON imported by production code, causing module-fetch/test-start failures. Copying the real reference directory repaired the harness; the passing results above are from complete frozen sources, not a product workaround. The shell's `npx playwright` wrapper suppressed the configured JSON reporter; direct Node CLI execution produced the parsed final evidence.

Frozen-tree full typecheck is not green: five implicit-any errors occur in the concurrently owned `tests/e2e/pal-same-tab-save.spec.ts` (lines 17, 36, 37). No scoped-file errors remained after reference data was included. That unrelated test was not modified. No App, Pals, Guild or catalog-runtime product code was changed.
