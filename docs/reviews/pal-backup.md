# Pal backup safety review

## Integration

Import `PalBackupPanel` from `src/features/pals/BackupPanel.tsx` and render `<PalBackupPanel />` in Settings. Optional `store: PalStore` supports injected storage. No App, Settings, Workspaces, domain or storage files were edited.

## Delivered

- Pure schema-1 export envelope `{schemaVersion, catalogVersion, exportedAt, snapshot:{pals,bases,routes}}`.
- Defensive unknown-input validation: required typed fields, bounded text/arrays/numbers, unique record/slot/step IDs, active unique base-worker cross-references, valid ordered route graphs and checklists.
- Unknown species, pair and target IDs remain intact with explicit unresolved warnings. Missing original owned-parent route references remain intact with warnings. Unsupported work types are rejected, not silently discarded.
- File input is capped at 10 MiB before reading; parser also checks UTF-8 byte length. Export is downloadable JSON and rejects files beyond the import cap.
- Preview does not write. Separate overwrite acknowledgement gates replacement. Cancel does not mutate data. Failed validation or restore retains the previous preview; acknowledgement resets when selecting a new file.
- Import revalidates before one Dexie read-write transaction encompassing only pals/bases/routes clears and bulk puts. Failure rolls back all three stores. Crafting and guild stores are untouched.
- Panel warns to export and verify the existing backup before overwrite; includes pinned upstream MIT-license link. Full distribution notice is maintained separately in root `pal-attribution.md`.

## Verification

- `npx vitest run src/features/pals/backup.test.ts`: **5 passed** (roundtrip including unknown IDs; malformed input unchanged data; transaction rollback; component preview/cancel/no write; failed restore retains preview and retry succeeds).
- `npx vitest run src/features/pals`: **22 passed**.
- Scoped ESLint on all three new source/test files: **no issues**.
- `npm run typecheck` was blocked by existing/in-flight integration errors in `src/app/App.tsx` (GuildWorkspace makeClient/GuildClient arguments) and `src/features/guild/GuildWorkspace.tsx` (ApiError.denied). No backup-file diagnostics appeared. These other-worker files were not changed.
- Component behavior exercised in jsdom. No standalone browser-layout claim; parent owns Settings integration and integrated build verification.
