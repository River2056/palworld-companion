# Today: exact snapshot fixtures and async readiness

## Outcome

Personal Today tests pass without changing production `Today.tsx` or weakening exact-reference lookup. The original eight scenarios remain, with one additional explicit legacy-unbound regression.

## Root cause

The old helper inserted routes directly without catalog bindings. A matching `sourceVersion` label is not historical provenance, so expecting bundled species names and clean checklist completion from those rows was incorrect. Independently, the personal-data subscription can finish before catalog runtime initialization; its empty/error UI does not establish crafting or base-analysis readiness.

## Fixture contract

- Create the real bundled snapshot with `createBundledCatalogSnapshot`, register it with `putSnapshot`, explicitly select its digest ID, and read back the registered snapshot.
- Seed ordinary routes through `PalStore.saveRoute` with the actual selected snapshot and current revision captured after preceding fixture writes. Read back the resulting exact binding.
- Read the persisted route for checklist updates and verify its historical binding survives the live write.
- Use raw route insertion only for deliberately corrupt graphs/checklists and explicit legacy-unbound records. Corrupt routes have a registered binding so graph failure is not confused with missing provenance.
- Raw Pal/base assignment rows intentionally retain archived, missing, or unsupported IDs for conservative-display tests; these are not examples of valid new user writes.
- Await the named base or crafting UI whose readiness matters (`findByText`/`findByRole`). Do not use sleeps, mocked-ready runtime, or bundled fallback.

## Safety coverage

- Named next action and slot gaps, manual completion versus verified offspring, and Dexie live updates remain asserted.
- Mixed known/unknown references resolve the known target from the bound snapshot while preserving unknown child/pair and missing parent/worker warnings. A subsequent stored edit retains the original unknown-target assertion and exact binding.
- Corrupt step/checklist records stay visible and unknown without auto-repair or hidden base warnings; reading leaves the snapshot unchanged.
- Explicit legacy-unbound records retain migration warnings and raw species/pair IDs even when their version label matches the bundle. Rendering/navigation neither adopts the snapshot nor writes personal metadata.
- Archived references, unsupported work, and the configured-slots-only coverage qualification remain asserted.
- Read failure retains crafting, retries successfully, and performs no personal write: the write spy, unchanged metadata, and empty stored personal collections are checked.

## Verification

Final working-tree execution:

- `npx vitest run src/features/today-actions.test.tsx`: **9 passed, 0 failed**.
- `npm test`: **36 test files passed; 317 tests passed, 1 skipped** (318 total).
- `npm run typecheck`: passed.
- `npx eslint src/features/today-actions.test.tsx`: passed.
- `git diff --check -- src/features/today-actions.test.tsx`: passed.

Full-suite log: `/tmp/today-snapshot-full-tests.log`; targeted log: `/tmp/today-snapshot-tests.log`.

An intermediate full-suite run exposed one remaining synchronous `Pinned craft queue` lookup in the read-error scenario; changing it to an awaited named heading removed that race. No production defect or unrelated failing test remained in the final run. Other workers' production changes were read-only in this task; verification describes the shared working tree, not an isolated production commit.
