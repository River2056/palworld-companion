# Catalog snapshot closure Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task, only after the active owners finish. This document is design/preflight, not implementation authorization or a completion claim.

**Goal:** Close approved plan lines 209–229 and gap-audit sections 1/4/5/9 with immutable personal-plan references, recipe selection, safe partial planning, and explicit catalog migration.

**Architecture:** Keep one default personal workspace and the existing public store facades. Move authoritative personal records into one IndexedDB database so catalog selection, craft goals, and breeding plans can change in one transaction. Store content-addressed reference snapshots separately from user records and never silently substitute the bundled catalog for a bound or historical plan.

**Tech Stack:** Existing TypeScript/React, Dexie, Vitest/fake-indexeddb and Playwright; browser Web Crypto for SHA-256. No new production reference facts, catalog expansion, global optimization, multiworld switcher, or Guild schema change is implied.

## 1. Evidence and boundaries

Read the working tree, including uncommitted changes. Source references are symbol/file references because concurrent workers are editing line positions.

- `src/domain/catalog.ts`: `Recipe.id` is also the output item ID; `validateCatalog` rejects missing dependencies/cycles; global `catalog`, `materials`, `itemName` always use the bundle.
- `src/domain/planner.ts`: `Goal` has no binding/recipe selection; `plan` invokes strict validation before any goal; missing top-level recipes enter string `blocked`; unknown nested records otherwise look like leaves. Existing queue-priority ledgers, craft-more semantics, separate direct/raw projections, rounding, surplus and provenance must survive.
- `src/data/workspace.ts`: database `palworld-companion`, row `personal`, payload version 1; active work adds inventory timestamps. Preserve the owner's final freshness/history contract, not this observed intermediate file.
- `src/features/pals/storage.ts`: separate `palworld-companion-pals` database; roster/base/route transactions are atomic only inside that database. `SavedRoute.sourceVersion` is a label, not retained rule contents. `routeWarnings`, search, species labels and suitability currently consult the global reference.
- `src/features/pals/backup.ts`: version-1 scoped backup, useful tolerant unknown-ID retention and transactional replacement; no snapshot bytes. Craft backup is separately scoped. Keep these scope boundaries and preserve the favorite/ranking additions from their owner.
- `src/features/guild/publication.ts` (uncommitted): `personal:v1:` identity encodes `[goal,kind,item]`; `quantity-v1:` checksum misses recipe/catalog changes with unchanged quantity. Publication reads the global catalog. Re-inspect the owner's final implementation before changing it.
- Approved source: `docs/plans/palworld-companion-plan.md` lines 209–229. Gap source: `docs/reviews/full-plan-gap-audit.md` sections 1, 4, 5 and workspace portion of 9. Favorite is owned elsewhere. Scope/disclaimer relief for limited data is not removal of the generic alternate contract.

## 2. Concrete contracts

Proposed types below are design signatures, not installed APIs. Keep numeric quantities, IDs, queue ordering and existing progress fields; add rather than rename existing `Goal.item`, `SavedRoute.sourceVersion`, pair IDs and step IDs.

```ts
type SnapshotId = `sha256:${string}`;
type CatalogBinding =
  | { state: 'bound'; snapshotId: SnapshotId }
  | { state: 'legacy-unbound'; claimedVersion?: string };
interface PersonalMetadata {
  id: string; // crypto.randomUUID(), created once, not the DB row key
  name: string; // default 'Personal workspace'; trimmed, 1–100 chars
  revision: number; // incremented in every personal-data write transaction
  selectedCatalog: SnapshotId;
}
interface CatalogManifest {
  datasetId: string;
  schemaVersion: 2;
  gameVersion: string | null;
  verificationStatus: string;
  sources: { url: string; revisionUrl: string | null;
    attribution: string; license: string; permissionStatus: string }[];
}
interface CatalogSnapshot {
  id: SnapshotId;
  manifest: CatalogManifest;
  craft: CatalogV2;
  pals: PalCatalog; // existing reference species and explicit pair payload
}
interface ItemV2 extends Material { kind: 'raw' | 'craftable' }
interface RecipeV2 {
  id: string; outputItemId: string; output_count: number;
  inputs: { item: string; count: number }[];
  stations: string[]; unlock_level: number | null;
  source: Source; notes?: string; variant?: string;
}
interface CatalogV2 {
  items: ItemV2[]; recipes: RecipeV2[];
  defaultRecipeByItem: Record<string, string>;
}
// Add to Goal:
// catalogBinding: CatalogBinding
// recipeId?: string          // required for a newly bound goal
// recipeOverrides?: Record<string, string> // intermediate output item -> recipe ID
// Add catalogBinding to SavedRoute; retain original sourceVersion as provenance.
```

`PalCatalog` is a named type extracted from the current reference shape, not a new breeding formula. Snapshot encompasses both approved reference slices so one selectedCatalog has a precise meaning. Preserve manifest coverage warnings and source provenance; `gameVersion: null` means unverified, not a newly asserted patch version. Record actual metadata available in the reference/attribution documents; absent historical metadata stays unknown.

Hash canonical UTF-8 JSON of `{manifest, craft, pals}` (recursive object-key sorting, preserved array order, reject non-JSON/nonfinite values). Exclude `id` and local insertion/export times. Version the canonicalization implementation; verify a supplied ID against contents before storing. Snapshot insert is put-if-absent plus byte-equality check, never mutable overwrite. Store only canonical validated data, deep-freeze resolved values in development; digest verification protects imported content, not source trust/licensing.

### Recipe identity and selection

Normalize the existing bundle in an adapter: each existing recipe becomes an item with the **unchanged** old ID and a separate recipe with the same old ID in a different namespace. Set `outputItemId` to that old ID; set the explicit default map. Separate namespaces permit this compatibility mapping without prefixing or rewriting any existing foreign key. Leaf IDs remain unchanged. Do not duplicate the production JSON or manufacture alternatives.

The selector resolves `goal.recipeId` for the root, then `recipeOverrides[item]`, then snapshot default for intermediate outputs. Verify every selection outputs the requested item. Invalid/missing explicit selections are unresolved, never replaced by another available recipe. Defaults are persisted in snapshot bytes, not derived from current array order. New bound goals persist the chosen root ID even when only one choice exists. Intermediate overrides are per goal, not global; no optimal-recipe search. All tree/preview/planning paths use this same resolver.

Search returns output items once, not duplicate entries per recipe. Root and encountered intermediate selectors appear only for items having multiple recipes. Show yield/stations/source/variant for the actual choice. Keep the honest one-reference-recipe disclaimer for the shipped data. Use two-recipe **synthetic test fixtures only**. Duplicate-pin merge is offered only when output, binding, root recipe and overrides match; otherwise preserve separate goals, never erase one selection.

### Snapshot binding and runtime lookup

New goals/routes bind the selected snapshot at save time. Existing bound plans always resolve their own snapshot, even after an application update or scoped restore. Search/new-route enumeration use the selected snapshot. Inject catalog arguments into Pal search/warning/name/suitability helpers; retain temporary bundle defaults only for old tests/new-plan adapters, never saved-plan rendering. Saved routes resolve pair parent constraints, offspring and source from their binding and still check current owned-parent existence/sex. Checklist completion does not prove breeding success.

Default workspace is one stable identity/name, shared by all personal stores through metadata. Existing roster/base rows have implicit scope through their containing database; do not add redundant per-row workspace fields unless a consumer needs them. Inventory freshness is retained unchanged. Selected catalog governs roster/base recommendations, with removed species visible by ID, not deleted. Plan bindings can differ after scoped restore; workspace selection must not override them.

## 3. Typed unresolved planning, without weakening the bundle gate

Separate `validateCatalogShape` from `validateBundledCatalog` (keep `validateCatalog` as a strict compatibility export until callers migrate). Shape validates unique IDs, kinds, numbers, sources and unambiguous serialization. Strict bundled validation additionally checks all item references, default/recipe output alignment, every possible alternate dependency graph for cycles and all Pal explicit-pair references. Both reference slices must participate in `validate:catalog`; invalid production catalog still fails tests/build initialization.

Runtime resolver does **not** call strict global graph validation. Imported well-shaped snapshots may contain semantic gaps/cycles and carry diagnostics; duplicate identities/unsafe structural data are still rejected at the import boundary.

```ts
type DiagnosticCode = 'snapshot-missing' | 'legacy-unbound' |
  'item-missing' | 'recipe-missing' | 'recipe-output-mismatch' |
  'cycle' | 'depth-limit' | 'unsafe-quantity';
interface PlanDiagnostic {
  goalId: string; code: DiagnosticCode;
  itemId?: string; recipeId?: string; path: string[];
}
// Existing aggregate rows/steps/provenance remain.
// Add diagnostics: PlanDiagnostic[], complete: boolean,
// goalResults: ({id:string; status:'resolved'} |
//               {id:string; status:'unresolved'; diagnostics:PlanDiagnostic[]})[].
```

Introduce `planWorkspace(resolver, goals, stock)`; retain `plan(catalog, goals, stock)` as a fixture/compatibility wrapper while moving production callers. Distinguish only an explicit `kind:'raw'` item as a gatherable leaf. Unknown/craftable-without-recipe is not raw and cannot acquire fabricated acquisition text. Use a path-local recursion guard and a documented depth cap (40 matches the tree); a shared subtree is not a cycle.

**Safe partial contract:** stage an entire active goal against cloned direct/raw ledgers, surplus, rows and steps. Commit its staged state only if all needed branches resolve and calculations are safe. On any failure discard *all* staged allocations/surplus/steps for that goal, retain typed path diagnostics, then continue the next goal against the previous committed state. Do not catch arbitrary programming/storage errors as unresolved; return typed expected failures. Invalid global stock shape remains a hard input error. Resolved siblings of a blocked goal may appear in the structural tree, but not in actionable aggregate reservations. This deliberately conservative goal-level boundary retains independent valid plans without asserting craftability from an incomplete branch.

Across different snapshot IDs/root-selection contexts, physical stock stays one item-ID ledger in queue order; planned surplus is keyed by snapshot ID **and canonical per-goal recipe-selection context** plus output item. Do not reuse hypothetical production from a different snapshot or alternate policy to bypass the selected recipe. Direct/raw alternatives remain separate ledgers, never summed. A blocked goal reserves nothing and cannot starve a later valid goal. Completed goals remain history and consume nothing.

`complete` is false if any active goal is unresolved. Never show whole-queue ready/empty-success or publish a blocked pin/shortage. Valid rows explicitly say “resolved goals only”; tree diagnostics use the same selection rules. Remove `Shopping`'s unsafe-quantity catch-all and non-null unknown-material assertion. Missing snapshot lookup never falls through to the bundle.

## 4. Storage migration and atomicity

**Critical constraint:** Dexie transactions cannot span the current two databases. A sequential workspace-save then Pal-save is not an atomic catalog migration. Use the existing `palworld-companion` DB with a new schema version containing `workspaces`, `metadata`, `catalogSnapshots`, `pals`, `bases`, `routes`, `migrationHistory`. Keep row key `personal`; stable public identity lives in metadata. `WorkspaceStore` and `PalStore` facades delegate to this one database; preserve injection of isolated test databases.

One-time storage consolidation is distinct from accepting a catalog upgrade:

1. Gate application startup before either UI/store accepts writes. Ask old tabs to close using `versionchange`/`blocked` handling; display actionable blocked-upgrade status. All new-version writes must check readiness. Do not proceed with a live legacy writer.
2. Open the old Pal database at a schema upgrade that fences legacy connections (blocked upgrade must stop); install an upgrade listener/read-only compatibility marker. Read its three tables in one read transaction. Keep it untouched as recovery evidence thereafter; do not delete automatically. New code never resumes writes there.
3. Validate/copy craft and Pal payloads and preserve all fields finalized by other owners. Compute the bundled snapshot digest before opening the target write transaction (do not await Web Crypto inside an IndexedDB transaction).
4. In one target transaction, insert the snapshot, metadata, copied Pal records, version-2 craft payload and a consolidation completion marker. Existing plans receive `legacy-unbound`, not fabricated bindings. New metadata selects the current bundle **for new plans only**. Empty/new installs may bind immediately because there is no old history to infer.
5. On crash before commit, old data is still intact and startup retries. After commit, marker makes consolidation idempotent and prevents a second copy overwriting new data. Failed validation/quota leaves legacy data intact and UI in recovery/export mode. Verify both source database fencing and retry behavior in a real browser, not only fake-indexeddb.

Payload and DB schema version numbers are independent. Craft payload v2 adds binding fields; backup envelope gets its own discriminator. Preserve `load/save/export/import/reset`, but route all writers (including scoped restores and Pal mutations) through the shared transaction coordinator, increment metadata revision and validate expected revision when replacing a stale full workspace. Reload after commit. App-only `writing.current` does not protect another tab or Pal writes.

## 5. Explicit catalog update preview/cancel/accept

Proposed new `src/data/catalog-migration.ts` APIs:

```ts
previewCatalogMigration(store, candidateSnapshot): Promise<MigrationPreview>
acceptCatalogMigration(store, previewId, expectedRevision): Promise<void>
cancelCatalogMigration(previewId): void
```

Preview is memory-only and read-only (candidate bytes may be kept in memory until accept). Capture a consistent personal read transaction, revision, selected snapshot, every affected goal/route and exact proposed bytes. Hash candidate outside transactions. Preview tokens identify immutable proposal data, not caller-edited form objects. For each active/history goal show old/new binding, recipe choice, batch/output/surplus, direct/raw delta and typed unresolved IDs. Old unknown values display “historical calculation unavailable”, not zero. Show changed rule parents/child/source for every saved step, roster/base removed-species warnings and recommendation changes. Inventory timestamps/quantities, progress, notes, favorites, ordering, route IDs/step IDs/parent links remain unchanged.

Preserve recipe IDs/overrides on migration; retain removed IDs and report them unresolved. Never auto-pick a replacement ID or map by name. Unchanged breeding rules can rebind. Changed/removed rules default to **keep that saved route on its old binding**; users may explicitly mark it bound-but-unresolved in the candidate, but do not regenerate routes or transplant completion onto a new route. Explicit route replacement uses the existing new-route save flow. Allow per-plan keep-old/migrate decisions; selectedCatalog updates for future plans on accept. Legacy-unbound plan adoption requires an explicit acknowledgment that current rules are being applied, not recovered history.

Cancel or closing preview performs no durable writes. Accept revalidates proposal/hash/shape and rereads metadata revision inside **one shared `rw` transaction** over metadata/workspaces/routes/catalogSnapshots/migrationHistory (and roster/base tables if proposal modifies them; preferred proposal does not). Revision mismatch fails with “data changed; preview again”, with zero writes. Atomically insert candidate, change approved bindings and selectedCatalog, increment revision, and record minimal before/after binding/selection history. Keep every old snapshot, removed IDs and original legacy labels. Avoid unbounded duplication of all roster/stock data in history.

A revert is another explicit preview and transaction, not restoring stale quantities/progress: revert bindings and selection from migration history while preserving subsequent player edits. If a plan's binding changed again, treat as conflict and re-preview. After reload, plan evaluation uses exactly the accepted/reverted contents. Do not prune snapshots in this closure; quota failures must abort the whole operation.

## 6. Legacy and backup policy

- Old craft v1 has no historical catalog ID/bytes: keep goals as `legacy-unbound` with original item/quantities/progress and display an adoption action. Do not claim old calculations are reproducible. Optional candidate calculations are explicitly “preview using currently available reference”, never current authoritative shopping/ready/publication.
- Old Pal v1 `catalogVersion`/route `sourceVersion` is a claimed string, not a content digest. Preserve it verbatim, preserve saved graph/checklist as viewable user facts and label rules unavailable until adoption. Equality with today's catalog label alone is not proof of historical bytes. If a future explicitly verified archived-snapshot registry exists, exact provenance may permit binding; do not add one by guessing now.
- Missing referenced snapshot in a v2 import is a typed `snapshot-missing` recovery state, retaining the binding ID; never replace it with selectedCatalog. Corrupt snapshot bytes/hash mismatch, duplicate IDs and malformed quantities reject the whole import. Well-shaped semantic missing references/cycles import with warnings and partial planning.
- Craft v2 scoped export contains metadata identity/name provenance, selected snapshot reference, craft data, and full snapshots needed by those craft bindings plus the selected snapshot. Pal v2 includes roster/base/routes, route bindings and full referenced/selected snapshots. Include retained snapshot records needed for the exported scope's migration history. Keep v1 readers; new writers emit v2. Old applications may reject v2 safely; do not claim old applications can restore new metadata.
- Scoped restore replaces only that scope and atomically adds validated snapshot records to the shared registry. Never clear the registry or other-scope records. Do not overwrite the destination workspace identity/name/selection from a scoped backup; show source identity/name as provenance. Missing referenced data remains unresolved. A blank installation also keeps its destination identity; original source identity is not a second selectable world. This prevents a Pal import from silently migrating craft plans and avoids making imported Guild source IDs collide with another installation.
- Existing freshness/favorite/history fields must round-trip. No fabricated update/export-origin timestamps for legacy stock. Export time describes the export only. Preserve nonempty roster/base/route cross-links and removed IDs. Extend bounded input-size validation to craft backups and snapshot payload counts; never silently truncate to fit the existing Pal 10 MiB cap. Export itself must detect a cap violation before claiming a recoverable file was created.
- Settings reset remains scoped. Do not reset shared identity or delete snapshots used by the other scope; expose any broader factory reset as separate future work.

## 7. Shared Guild source/checksum risk and handoff

Coordinate this integration **after** the publication owner stabilizes `publication.ts`, `SourceChangePrompt` and App/Guild props. Personal migration must not mutate remote tasks, send snapshots/notes/stock/roster, or auto-update task requested quantity.

1. Replace global `plan(catalog, ...)` publication with the bound resolver's safe projection; blocked/legacy-unbound goals yield no publishable source. Treat formerly published blocked goals as unavailable with explanatory UI, not as evidence they were deleted from personal storage.
2. Add a versioned canonical source checksum over only public-safe semantic fields: algorithm version, snapshot digest, selected root recipe ID, sorted overrides, source kind, output/ingredient ID, requested quantity and public requirement definition. Snapshot digest is an opaque reference, not reference bytes. Exclude notes, owned quantities, nicknames and roster; only the already-consented resulting shortage quantity is shareable. A changed snapshot must mark stale even if the shortage number is identical. Snapshot/source metadata changes may conservatively mark stale; document this rather than pretending exact behavioral equivalence.
3. New identities may use `personal:v2:` and `[workspaceId,goalId,kind,itemId]`; keep stable identity independent of snapshot digest so upgrades are “changed”, not “removed + new”. Respect backend length constraints; do not truncate opaque identifiers into collisions. If over limit, disable publication with a clear explanation or use a versioned digest identity plus local exact mapping.
4. Parse v1 and v2 identities. For v1 quantity-only checksums, render “legacy source fingerprint; verify/re-publish” rather than claiming unchanged when version provenance is unknowable. Do not reinterpret a v1 task as proven linked to this workspace solely from a goal ID; require explicit user confirmation for legacy linkage. No silent bulk server migration.
5. Calculate SHA-256 outside DB transactions; async projection must carry workspace revision. Recheck the revision before publishing and before applying an accepted source-change prompt. Discard stale computations from a prior render. A successful remote update still requires existing server revision/conflict handling and readback. Snapshot acceptance changes only personal state; Guild prompts remain explicit.

## 8. File ownership and implementation order

No source changes until all current owners have finished and their combined tests have been rerun. Re-read changed files then; do not overwrite freshness/history, publication, favorites/ranking, or Today cards with versions from this preflight.

For each step: write the named failing regression, run it, implement the smallest change, rerun targeted tests. No commits are requested by this task.

| Order / owner | Exact files / narrow work | Test-first evidence |
| --- | --- | --- |
| 1: catalog/contract owner | Create `src/domain/catalog-snapshot.ts`; modify `src/domain/catalog.ts`; extract Pal reference type without changing data | Create `src/domain/catalog-snapshot.test.ts`; adapter IDs, canonical hashes, strict/shape validation |
| 2: planner owner | Modify `src/domain/planner.ts`; central selector shared with `src/features/IngredientTree.tsx` | Extend `src/domain/planner.test.ts`, `src/domain/planner-provenance.test.ts`; create `src/domain/planner-unresolved.test.ts` |
| 3: persistence owner, exclusive shared files | Create `src/data/personal-database.ts`, `src/data/catalog-migration.ts`; modify `src/data/workspace.ts`, `src/features/pals/storage.ts`, `src/features/pals/backup.ts` | Create `src/data/catalog-migration.test.ts`; extend `src/data/workspace.test.ts`, `src/features/pals/backup.test.ts`, `src/features/pals/storage.test.ts` |
| 4: craft/Pal feature owner | Modify `src/features/Craft.tsx`, `Shopping.tsx`, `IngredientTree.tsx`, `Queue.tsx`, `src/features/pals/domain.ts`, `Workspaces.tsx`; pass snapshot resolvers through existing facades/props | Extend `src/features/crafting-completeness.test.tsx`, `src/features/IngredientTree.test.tsx`, `src/features/pals/Workspaces.test.tsx` |
| 5: App/settings integrator | Create `src/features/CatalogMigration.tsx`; modify `src/features/Settings.tsx`, `src/features/pals/BackupPanel.tsx`, `src/app/App.tsx`, `src/features/Today.tsx` only to share ready/revision/snapshot context | Create `src/features/CatalogMigration.test.tsx`; extend `src/app/App.test.tsx` |
| 6: Guild owner/integrator | Modify `src/features/guild/publication.ts`, `PublicationPicker.tsx`, `SourceChangePrompt.tsx`, `GuildWorkspace.tsx` only as final owner API requires | Extend `src/features/guild/publication.test.ts`, `SourceChangePrompt.test.tsx`, `PublicationPicker.test.tsx` |
| 7: acceptance integrator | Create `tests/e2e/catalog-migration.spec.ts`; extend `package.json` catalog gate; update acceptance/status docs in a later authorized implementation task | Run full merged-tree gates below |

Do not implement storage/type and UI layers concurrently against unfrozen contracts. Freeze stages 1–3 signatures first; App/Guild and Pal owners must agree on resolver/context and shared DB facade before stage 4. The database consolidation is the highest-risk required change; skipping it requires explicitly narrowing atomicity to independent per-scope migrations, which is **not** the workspace-wide contract proposed here.

## 9. Acceptance cases (10)

1. **Immutable same-ID change:** bind craft and a saved route to snapshot A; load B with same recipe/pair IDs but changed counts/parents. Reload preserves A calculations/rule warnings and checklist; new plans use selected A until accept. Mutating an in-memory candidate cannot mutate stored A.
2. **Alternate identity:** synthetic two-recipe output with different yields and an intermediate override; deterministic default independent of recipe array order, persisted selection after reload/export/import, selector only when alternatives exist, no wrong-output fallback, duplicate pins do not merge unlike policies. Production reference bytes unchanged.
3. **Partial missing/cycle/depth:** valid goal beside each synthetic unresolved case; typed goal/path code, valid goal rows/provenance remain exact, bad goal reservations and surplus roll back, unknown item never becomes raw, whole queue never ready. Strict bundled validator rejects the same graph.
4. **Existing allocation safety:** run existing rounding/craft-more/intermediate/surplus/provenance cases unchanged; two snapshot/selection contexts share physical stock once but not hypothetical surplus; overflow in one goal cannot discard another valid goal or leave tentative reservations.
5. **Legacy upgrade:** real v1 craft plus nonempty v1 roster/base/routes, freshness/favorite metadata as applicable; consolidate once, preserve IDs/cross-links/history, stable default identity/name, unbound warning and no historical digest fabrication. Reload/retry does not recopy stale legacy rows.
6. **Preview/cancel/atomic accept:** changed counts, removed item/pair and old/new quantity diffs; cancel leaves persistent state byte-equivalent; accept updates selected catalog/approved bindings together, keeps removed IDs/old snapshots and preserves stock/progress; injected failure aborts all writes. Revert restores bindings, not later inventory edits.
7. **Concurrency/fencing:** second tab edits a goal/Pal during preview, accept rejects stale revision; blocked legacy DB upgrade cannot continue into copying; crash before/after consolidation commit is recoverable without split authority. Verify with browser IndexedDB, not only mocks.
8. **Backups:** nonempty craft and Pal v2 round-trip with retained A/B snapshots, favorites/timestamps/checklist; scoped restore leaves other scope and destination identity/selection untouched. v1 import requires adoption, missing digest retains unresolved binding, mismatched digest/malformed envelope rejects without writes, over-size export/import clearly fails without truncation.
9. **Migration UI:** keyboard-accessible preview and explicit cancel/accept; legacy values labeled unavailable; removed IDs and rule changes shown; changed routes default keep-old; reload shows accepted snapshot. No multiworld selector, fabricated alternative or automatic offspring/progress change.
10. **Guild checksum/privacy:** equal-quantity snapshot/recipe change triggers changed prompt; v1 checksum treated unverified; blocked source cannot publish; no notes/stock/roster/snapshot payload in projection; stable v2 identity and revision-check discard stale async projection. Cancel/accept personal migration does not write remote tasks.

## 10. Verification commands and remaining gates

Run from `/Users/tungchinchen/projects/palworld-companion` after implementation, not during this preflight:

```sh
npm test -- src/domain/catalog-snapshot.test.ts src/domain/planner-unresolved.test.ts src/data/catalog-migration.test.ts
npm test -- src/domain/planner.test.ts src/domain/planner-provenance.test.ts src/data/workspace.test.ts src/features/pals/backup.test.ts src/features/guild/publication.test.ts
npm run test:e2e -- tests/e2e/catalog-migration.spec.ts
npm test
npm run typecheck
npm run lint
npm run validate:catalog
npm run build
npm run test:e2e
```

Expected acceptance: all commands exit zero; record actual test counts/results and browser fencing evidence in the later implementation report. No test passes, implementation completion, performance measurements or permission approvals are claimed here. Risks remaining for implementation review: old-tab fencing across the two legacy databases, snapshot backup size/quota growth, every saved-plan consumer abandoning implicit globals, preserving worker-added fields through parsers, and Guild legacy-source identity ambiguity. Source-license/public distribution approval remains its existing separate gate, not solved by hashing the approved small catalog.
