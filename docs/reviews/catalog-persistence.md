# Catalog persistence recovery

## Verified outcome

`npm test -- src/data src/features/pals`: **50 tests passed across 9 files**. `npm run typecheck` and scoped ESLint (`src/data`, Pal storage/backup/backup tests/recovery tests) passed. This includes inventory freshness, favorites, unknown IDs, manual completion, import rejection and rollback regressions.

The old exact-roundtrip assertions represented **new save calls**, not historical imports. New goals/routes intentionally acquire the selected catalog binding; craftable goals also acquire an explicit root recipe ID. Tests now assert those exact additions without weakening quantity, notes, stale-ID or no-automatic-offspring assertions. Version-1 imports remain `legacy-unbound`; claimed Pal source labels are retained verbatim, not treated as historical hashes.

## Integration API (actual implementation)

- `PersonalDatabase(name = 'palworld-companion', legacyName: string | false = productionLegacyName)` in `src/data/personal-db.ts`; production legacy name is `palworld-companion-pals`, isolated named databases do not consolidate automatically.
- `WorkspaceStore extends PersonalDatabase`; `load(): Promise<Workspace>`, `save(data, expectedRevision?)`, `export(): Promise<string>`, `import(text)`, `reset()` retained. Payload `Workspace.version` remains **1**; new backup envelope `schemaVersion` is **2**, `scope: 'craft'`, with `workspace`, `snapshots`, optional provenance `metadata`.
- `PalDatabase extends PersonalDatabase`; existing `PalStore(db)` methods retained. `snapshot()` now additionally returns `catalog: { snapshots, metadata }`; routes have optional `catalogBinding`. To share one explicit injected coordinator: `new PalStore(workspaceStore)` (the subclasses are structurally compatible). Both production facades use the same database name/schema.
- Shared APIs: `ready()`, `personalMetadata()`, `rename(name)`, `resolveSnapshot(snapshotId)`, `write(operation, expectedRevision?)`. Metadata fields: `key:'personal'`, stable `id`, `name`, `revision`, `selectedCatalog`, `consolidated:true`. Default name is `Personal workspace`.
- `previewCatalogMigration(db, candidateSnapshot, decisions = {}): Promise<MigrationPreview>`.
- Decisions: `{ goals?: Record<string,'keep'|'migrate'>, routes?: Record<string,'keep'|'migrate'>, acknowledgeLegacy?: boolean }`.
- Preview: `{ id, expectedRevision, candidateId, references, changes, rollbackOf? }`. A reference has `{ kind:'goal'|'route'|'pal', id, status:'unknown'|'changed'|'unchanged'|'historical-unavailable', references:string[], before, after, decision }`. Goal references include changed intermediate recipe item IDs, not only changed root IDs.
- `cancelCatalogMigration(previewId): void` deletes the memory-only proposal.
- `acceptCatalogMigration(db, previewId, expectedRevision): Promise<string>` returns the durable **history ID**. Uses the private detached proposal, not caller-mutated returned arrays. Revalidates the candidate before the shared write transaction. Successful accept removes the proposal; injected failure leaves it retryable.
- `previewCatalogRollback(db, historyId): Promise<MigrationPreview>` creates a fresh optimistic proposal. Accept through the same acceptance API. Only bindings, adopted root recipe and selection are reversed; later stock, timestamps, progress, notes, roster and checklist changes survive.
- Pal backup functions unchanged: `createPalBackup(snapshot, now?)`, `parsePalBackup(json)`, `validatePalBackup(input)`, `replacePalBackup(store, input)`. New writers emit schema 2; schema 1 remains readable.

## Safety guarantees exercised

One shared IndexedDB transaction commits craft, routes, snapshot registry, selection, revision and history together. Tests inject final history-write failure and legacy-consolidation metadata failure, verify abort, then retry. Legacy source records remain available; committed consolidation markers prevent stale recopy. A second database connection's Pal edit invalidates a migration preview.

Both scoped restores preserve destination identity/name/selection and the other scope. Stored snapshots are immutable. Exports contain available selected and scope-bound snapshot bytes. Missing referenced snapshot bytes are permitted recovery states: retain the exact bound digest without substituting current rules. Present malformed IDs, duplicate IDs or hash-corrupted bytes reject without partial writes.

Budgets run before snapshot hashing: 10 MiB encoded input, at most 100 snapshots, 10,000 entries per array/object, maximum nesting 100. Export also checks the pretty-printed byte size and never truncates. Object-based Pal replacement is bounded, not only uploaded text.

## Explicit remaining limits / integration gates

- Browser multi-tab legacy-upgrade blocking/fencing is **not verified** by fake-indexeddb. Initialization closes a blocked legacy connection, but there is no application recovery/blocked-status UI here. Real-browser startup/fencing acceptance remains required.
- Preview provides reference/binding statuses and changed IDs, **not numeric before/after direct/raw, batch/output/surplus projections, full breeding-rule diffs or recommendation deltas**. Consumers must not claim those details exist in this API.
- Migration history remains durable locally but is **not serialized/restored by scoped backups**. Snapshots referenced only by past migration history (rather than current selection/plan bindings) are not guaranteed in scoped export. This remains a gap against the broader closure plan's historical-backup requirement.
- Snapshot imports' semantic missing IDs/cycles are retained; this layer does not supply UI warning rendering. `resolveSnapshot` returns undefined for absent bytes.
- Full-workspace optimistic save checks are optional (`expectedRevision`); callers must pass their loaded revision for stale-full-document protection. Migration acceptance always requires it.
- No App, UI, planner or Guild edits were made. No real-browser or full-repository gate is claimed by this recovery report.
