# Pals / bases standalone final review

## Spec review

Reviewed `docs/plans/palworld-companion-plan.md` sections 4–5 and persistence requirements against the standalone modules. Individual roster create/edit/archive/delete, persisted saved route checklists, explicit-pair bounded breeding, base capacity/exclusive membership and simultaneous slot matching are implemented. Actual owned parents retain distinct instance IDs; known same-sex parents cannot generate a route. Unknown/offspring genders remain conditional. Missing recipes mean unsupported, not impossible.

This is a deliberately limited standalone implementation, NOT full application acceptance. It uses the pinned 12-species / 6-pair historical reference. No current-game verification or full optimizer claim is made. `docs/research/pal-reference.json` and `pal-attribution.md` (including its full MIT notice) were inspected and left unchanged.

Remaining spec/integration gaps: no configurable route-ranking controls, passive optimization, offspring-instance attachment, or automatic confirmed-success transition. Checkboxes are explicitly manual progress, not proof of gender, successful offspring acquisition, or completion of the in-game objective. Real browser/App integration is parent-owned.

## Quality review

Fixed three independently reproduced defects:

- `PalStore.saveRoute` previously persisted forward/self-linked malformed graphs. New exported `validateRoute` rejects duplicate IDs, self/forward/unresolved step links, identical parent references, missing graph fields, more than six steps, target mismatch and duplicate/unknown checklist IDs before the write. Legacy catalog IDs and missing owned-parent IDs remain preservable; warnings expose incompatibility rather than silently rewriting history.
- `routeWarnings` previously treated unknown saved pair/target IDs as compatible. It now warns for unsupported/changed pairs, unknown targets, invalid graphs and changed intermediate species. Every intermediate-parent dependency explicitly reminds users that manual completion does not verify offspring gender.
- Nonfinite/fractional/zero search bounds were accepted. Search now requires positive integers, caps depth at six and rejects alternative limits over 1000.

Moved the existing domain/storage tests into owned `src/features/pals` files instead of importing uncommitted external `tests/unit` files. Regression tests exercise exported domain functions and real Dexie operations with fake IndexedDB, not mocked successful persistence.

Verified existing augmenting-path slot matching avoids double-counting one worker across simultaneous jobs and can reassign a flexible worker. Recommendations remain labeled independent alternatives and omit workers reserved at other bases; no global optimality claim.

## Verification

- Before fixes: new recovery tests produced three expected failures (malformed graph persisted, missing unsupported-ID warning, invalid bounds accepted).
- Final `npm test -- src/features/pals`: **4 files / 16 tests passed** (5 domain, 2 storage, 5 recovery, 4 component).
- `npm run typecheck`: passed.
- `npx eslint src/features/pals --max-warnings 0`: passed.
- `git diff --check -- src/features/pals`: passed.
- Components cover accessible roster create/edit/archive, base creation/slot persistence, manual checklist persistence across remount, and an honest storage-error screen.
- No real-browser/full-app acceptance is claimed.

## Exported interfaces and integration

Import from `src/features/pals/index.ts`:

- `PalWorkspace`, `BaseWorkspace`.
- `WorkspaceProps`: optional `store?: PalStore` and `onNavigate?: (workspace: 'pals' | 'crafting', speciesId?: string) => void`.
- `PalWorkspaceProps`: additionally `initialTargetSpeciesId?: string`.
- `PalDatabase`, `PalStore`, singleton `palStore`; `PalSnapshot` is `{ pals: Pal[], bases: Base[], routes: SavedRoute[] }`.
- Domain types: `Gender`, `Pal`, `RouteStep`, `BreedingRoute`, `SavedRoute`, `WorkSlot`, `Base`.
- Domain values/functions: `catalog`, `speciesName`, `enumerateRoutes`, `validateRoute`, `routeWarnings`, `validatePal`, `validateBase`, `analyzeBase`.

`Pal` IDs identify owned individuals, not species. Species IDs are exact case-sensitive upstream IDs. `RouteStep.parents` references `owned:<individual-id>` or `step:<earlier-step-id>`. `SavedRoute.completed` contains manual step IDs. Base worker IDs refer to owned individuals; each configured `WorkSlot` means one simultaneous job.

Mount `<PalWorkspace />` and `<BaseWorkspace />`; their module imports `pals.css`. Use the same `PalStore` throughout integration. The default Dexie database is `palworld-companion-pals`, schema version 1, tables `pals`, `bases`, `routes`. Snapshot reads and archive/delete assignment release are transactional. Use save/remove methods instead of writing raw tables when editing domain records.

Handle Base workspace `onNavigate('pals', speciesId)` by navigating to Pals and passing `initialTargetSpeciesId`. Parent owns navigation state and shared crafting integration. To refresh after external imports, remount the workspace; it loads on mount/store changes and its own writes rather than subscribing to cross-tab changes.

## Parent follow-up / ownership boundaries

- Backup validation/import is outside this owned module and not verified here. Unknown Pal species already in storage display their ID, but `savePal` intentionally only accepts the current catalog; do not silently substitute a species when importing/editing legacy records. Preserve raw backup IDs and expose unresolved references. `validateRoute` preserves legacy catalog identifiers but is not a complete unknown-JSON schema validator.
- Reference JSON is a statically imported trusted artifact. Runtime corruption recovery/schema validation and full license presentation in the built UI remain integration concerns; do not claim these are covered by the route checks.
- Fully malformed raw-table/import payloads must be validated before rendering, not passed straight into typed component/domain seams.
- Unknown species/base records must not be converted into invented work suitability. Verify settings import, catalog rejection, App routing and browser/mobile behavior in parent acceptance.
- Commit contains only explicitly named `src/features/pals` source/tests/styles. This report remains uncommitted for the parent to include. Preexisting `.hermes-tmp*` files are excluded and untouched.
