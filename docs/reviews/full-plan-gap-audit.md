# Independent full-plan gap audit

## Verdict and evidence boundary

**Full-plan acceptance is not complete, and the remaining scope is not only Guild.** This is a read-only source/test audit, not another passing-suite certificate. No implementation, migrations, commits, dependency installs, or test execution were performed. Only this report was written.

Audited working tree at HEAD `7282a12`, including uncommitted work. Other workers are active, so citations describe files as inspected, not their eventual merged state. Plan references below mean `docs/plans/palworld-companion-plan.md`; matrix references mean `docs/acceptance-matrix.md`. Plan SHA-256 prefix at final evidence capture: `d25582e912e2af9c`; matrix: `b74690e5b9a8b7fe`. Earlier reported 60 unit / 16 browser passes are neither independently rerun here nor proof of untested requirements. A new ranking regression was visible during inspection; its existence is not evidence of a pass.

Severity: **P1** = blocks an unqualified full-plan/data-safety claim; **P2** = required capability or acceptance evidence still missing; **P3** = smaller explicit contract/UX omission. “Missing” means demonstrable from the inspected implementation. “Unverified” means evidence is absent or incomplete, not that execution is proven broken.

## Required gaps outside the active Guild work

### 1. P1 — Catalog changes silently reinterpret craft plans; migration preview/snapshot retention is missing

- **Requirement:** plan 213–229, 295, 354, 363; persist selected catalog with each plan, retain the old snapshot, preview changes, migrate only on acceptance. Matrix 19, 34–35 covers visibility/recovery but omits the update lifecycle.
- **Evidence:** `src/domain/planner.ts:2` stores only goal ID/item/quantity/completed/notes. `src/data/workspace.ts:4–5,14,18–20` persists version-1 goals/stock/recent with no catalog selection or retained snapshot. `src/domain/catalog.ts:16–17` unconditionally loads the newly bundled reference; `src/features/Craft.tsx:24` and `src/features/Shopping.tsx:7` calculate against it. Craft reference `docs/research/crafting-reference.json:2–5` has schema/coverage information, not a stable dataset identity consumed by plans.
- **Partial credit:** Pal routes retain `sourceVersion` (`src/features/pals/domain.ts:6–7,53`); Pal backup warns on catalog mismatch (`src/features/pals/backup.ts:25`). A warning/backup replacement is not a before/after catalog migration or retention of old rule contents.
- **Smallest closure:** version a default-workspace/catalog envelope, bind craft and breeding plans to an immutable reference snapshot, preview affected quantities/references, retain the prior snapshot on cancel, and switch atomically on acceptance. Test same IDs with changed recipe counts, removed IDs, cancel, accept, rollback, and restored older backups. No larger/current-patch catalog is necessary.

### 2. P2 — Manual inventory freshness metadata and stale-stock warning are missing

- **Requirement:** plan 120, 125, 222, 364. Matrix 33 mentions persistence but drops timestamps/freshness.
- **Evidence:** `src/domain/planner.ts:3` is a numeric stock map; `src/data/workspace.ts:4,12–14` has no update time. `src/features/Queue.tsx:11` saves counts only and says stock is manual/local, but displays neither last-updated time nor stale-data warning. “Saved in this browser” (`src/app/App.tsx:54`) is not inventory freshness.
- **Smallest closure:** add persisted inventory update metadata with legacy “unknown” handling, display manual/last-updated labels and the stale-stock limitation, retain timestamps through backup, and test that progress-only completion does not touch them. Do not fabricate a timestamp for imported legacy quantities.

### 3. P2 — Completed history is missing; reopening exists only indirectly

- **Requirement:** plan 123–124, 306. Matrix 32–33 omits history/reopen.
- **Evidence:** `src/features/Queue.tsx:9` maps all goals into the same pinned queue, including completed goals; there is no history destination/filter or explicit reopen action. `src/features/Today.tsx:21,25` counts completions and renders that same queue. Planner correctly skips completed goals (`src/domain/planner.ts:37`). Editing completed units downward is possible (`src/features/Queue.tsx:5`), so claiming reopening is wholly impossible would be false.
- **Smallest closure:** split active/history projections without losing goal identity, add explicit progress-only reopen, and test completion → history → reload → reopen → allocation recomputation with unchanged inventory.

### 4. P2 — Alternate-recipe contract is absent, not merely missing reference data

- **Requirement:** plan 85, 91, 106, 215, 223, 303; matrix 28 explicitly requires selection. Global alternate optimization is explicitly excluded by plan 116.
- **Evidence:** `src/domain/catalog.ts:3–5,9` combines recipe identity with output-item identity and rejects duplicates across recipes/materials. `src/domain/planner.ts:2,9,38` has no selected recipe ID per output; `src/features/Craft.tsx:27` honestly says alternates are not included. The small catalog adjustment (plan 5) permits limited data and unverified patch coverage; it does not by itself demonstrate acceptance of removing the generic selection contract.
- **Classification:** demonstrably missing engine/persistence/UI capability; **not** evidence that the UI falsely promises shipped alternate support. `docs/research/crafting-attribution.md:14–15` explicitly excludes alternative data. Do not require researching every rarity to close this.
- **Smallest closure:** separate recipe IDs from output-item IDs, deterministic default and persisted override, with labeled synthetic two-recipe tests. Expose the selector only where alternatives actually exist. Alternatively obtain an explicit product-scope amendment, rather than treating the coverage disclaimer as that amendment.

### 5. P2 — Unresolved/cyclic planner branches do not return the specified partial result

- **Requirement:** plan 84, 87, 106, 114, 303; matrix 18, 28, 47.
- **Evidence:** `src/domain/catalog.ts:11–14` rejects all dangling dependencies/cycles; `src/domain/planner.ts:7` calls that validator before planning. Thus one bad branch prevents independent valid goals from producing partial allocations. `src/features/Shopping.tsx:7` labels every thrown error unsafe quantities. `src/features/IngredientTree.tsx:7–10` does render branch warnings, but that isolated tree is not the planner contract. Missing top-level goal recipes are correctly retained/blocked (`src/domain/planner.ts:38`).
- **Smallest closure:** keep strict build-time catalog rejection, but distinguish runtime unresolved craftable records from known leaves and return typed branch diagnostics plus safe independent results. Test a valid goal alongside a missing/cyclic branch and prohibit ready claims. Preserve the already-approved duplicate/tree/provenance implementation; this is a separate engine contract gap, not a reversal of its review.

### 6. P2 — Breeding ranking/score and route completion integration remain incomplete

- **Requirement:** plan 148–150, 154, 318–321; matrix 52–54.
- **Evidence:** `src/features/pals/domain.ts:18–35` emits traversal-order candidates and slices without sorting by missing parents, steps, or generation depth. `src/features/pals/Workspaces.tsx:27,36` displays steps/conditional warnings but no depth/score explanation. Missing-parent acquisition guidance exists (`domain.ts:71–77`), but missing-parent candidate routes are not represented. The newly present `src/features/pals/recovery.test.ts:21–25` asks for fewer-step ranking; no execution result is asserted here.
- **Partial credit:** documented multistep routes, limits, sex warnings, explicit saved-checklist progress, and generic manual roster creation exist (`Workspaces.tsx:27,35–36`). There is no route-step offspring action/pre-filled handoff. The plan permits manually adding offspring; it does **not** require automatic successful breeding or automatic gender verification.
- **Smallest closure:** implement/explain deterministic bounded ranking with depth and stable tie-breaks; disclose how missing-parent guidance differs from ranked routes. Add an explicit step-to-roster action or prove the generic manual-add flow meets the intended UX. Browser-test target → route → complete step → explicitly add offspring → reload. Current component test `Workspaces.test.tsx:44–52` stops at checkbox persistence; browser `tests/e2e/integration.spec.ts:5–55` contains no breeding-route completion flow.

### 7. P2 — Today is a counts/links summary, not the planned actionable cross-module dashboard

- **Requirement:** plan 42, 321, 331, 343, 377.
- **Evidence:** `src/features/Today.tsx:23` reports total route count and aggregate uncovered-slot count with generic links; no next breeding step or named base warning is rendered. Lines 24–25 explicitly defer Guild loading and show a link rather than assigned work/digest.
- **Smallest closure:** render the next incomplete saved step and concrete base/work-slot warnings linked to their context. For Guild, retain explicit authentication/consent and add the agreed authenticated Today view or obtain a documented scope adjustment; do not restore sensitive cached data just to satisfy a dashboard bullet. The active Guild workers' publication/conflict/event work does not automatically close Today integration.

### 8. P2 — Base handoff exists, but required base/browser acceptance and staffing context are incomplete

- **Requirement:** plan 164, 167–168, 330–331; matrix 58–61.
- **Evidence:** `src/features/pals/Workspaces.tsx:41` offers reference species for a work gap; `src/app/App.tsx:59–60` navigates with the selected target. Saving a checklist remains an explicit action (`Workspaces.tsx:27`), so absence of a confirmation dialog on navigation is **not** proof of unconfirmed plan creation. `Workspaces.tsx:41–42` shows assignment names and recommendation suitability, but not each assigned worker's suitability levels and recorded modifiers. Craft stations are text only (`src/features/Craft.tsx:27`); there is no recipe/work-type-to-staffing handoff.
- **Evidence gap:** browser `tests/e2e/integration.spec.ts:21–27` saves a base with zero slots; it does not exercise uncovered work → compatible assignment → warning cleared or base → breeding target → confirmed save. Domain coverage is real source evidence (`src/features/pals/pals.test.ts:24–29`), not replacement for those browser acceptance paths.
- **Smallest closure:** add those narrow browser paths and render assigned-worker suitability/modifier context. For the plan's softer “can identify” recipe/staffing integration wording, either implement one sourced station/work mapping and explicit handoff or record its agreed deferral; do not invent work requirements absent from the approved reference.

### 9. P3 — Default-workspace metadata and roster favorite flag are missing

- **Requirement:** plan 53, 143, 221–226. Multiple selectable worlds are explicitly later; default persisted identity is required now.
- **Evidence:** crafting uses a hard-coded `personal` database row (`src/data/workspace.ts:19–20`); Pal tables (`src/features/pals/storage.ts:3–6`) have no shared workspace metadata. `src/features/pals/domain.ts:4` and `Workspaces.tsx:35` have no favorite flag. Base assignment is correctly represented through worker IDs; do not duplicate it unnecessarily on Pal records.
- **Smallest closure:** add a shared default-workspace identity/name/catalog selection with a migration/isolation test, and a persisted favorite toggle. No world-switcher UI, cloud account, or multi-world migration product is needed.

## Data/release gates: distinguish missing implementation from unverified permission

### 10. P2 — Repeatable catalog permission/provenance gate and built-distribution notices need closure

- **Requirement:** plan 213, 259–269, 294, 356; matrix 15, 19.
- **Evidence supporting the current local build:** `docs/research/crafting-attribution.md:7–9` identifies CC-BY-SA-4.0 and licenses the adaptation; `pal-attribution.md:71–82` reproduces the full upstream MIT notice. `docs/reviews/reference-data-review.md:3,7,21` accepts the limited reference, records source verification, and separates public redistribution/legal review. **Do not assert unlicensed data or demand current-patch verification contrary to plan 5.**
- **Demonstrably narrow automated gate:** `package.json:7` validates only `src/domain/catalog.test.ts`; that file's lines 3–10 checks counts/references, not source/license presence. `src/domain/catalog.ts:7–14` does not validate provenance. Pal rules/suitability do not enter this named gate.
- **Unverified release artifact:** UI links source licenses (`src/features/pals/BackupPanel.tsx:55`, `Workspaces.tsx:21`), while full notices live in repository Markdown. No `public/` directory exists; `vite.config.ts:3` has no explicit notice-copy step. I did not inspect a freshly built distribution, so absence of required notices in a release bundle is **not** claimed as a reproduced distribution failure.
- **Smallest closure:** extend the catalog validation command to both reference schemas and source/license metadata; preserve reviewed permission decisions. Before distributing a static build, include accessible full adaptation/license notices and verify the actual emitted artifact. Record release approval/remaining legal uncertainty honestly; no public deployment is required by plan 355.

## Scoped backups: what is already present, what is not

**Do not reopen the obsolete “Pal/Base backup missing” claim.** `src/features/Settings.tsx:7` labels the crafting scope, exports current goals/stock/recent, and explicitly excludes Guild. `src/features/pals/backup.ts:5,26–59,65–75` separately exports/restores all three Pal stores with versioning, unknown-ID recovery and one atomic replacement. `src/features/pals/backup.test.ts:12–29` covers complete snapshots, malformed imports and rollback; `src/data/workspace.test.ts:4–13` covers crafting round-trip and invalid import protection. `tests/e2e/integration.spec.ts:37–48` exercises the Pal backup panel, but its exported fixture has zero routes.

**Remaining closure:** current scoped records are covered by implementation; end-to-end completeness across a nonempty craft queue/stock plus roster/base/route/checklist, and preservation of the *other* scope during each restore, is unverified here. Add that combined browser acceptance case. Catalog snapshots/selection and newly required timestamps/favorites/history metadata must join the relevant backups when implemented. A single all-in-one file and export of Guild server records are not explicit plan requirements; do not label their absence data loss. A durable backend volume is not itself tested backup/restore, but an operational Guild backup product should not be invented as an original v1 acceptance criterion.

## Scope guardrails and matrix repair

- Keep the approved small reference catalog, patch-unverified warnings, no bundled artwork, and explicit-pair breeding. Do not reopen duplicate-pin choice, ingredient-tree rendering, or material provenance already independently approved.
- Craft-more semantics are an approved override: `docs/reviews/crafting-final.md:5` supersedes plan 102. Existing final-target stock not cancelling a goal is not a new defect.
- Not required now: live inventory/save import/mods/notifications, full wiki/map, passive inheritance optimization, exact factory throughput, automatic stock deduction/undo, global recipe optimization, multi-world switching, public deployment, configurable breeding-ranking controls or automatic successful offspring transitions (plan 32–36, 53, 116, 122, 155, 169, 355). Fixed deterministic route ranking is required; configurable ranking controls are not.
- Inventory timestamps, history/reopen, workspace/catalog migrations, next-step Today cards and the explicit phase-2/3 browser flows were lost in matrix compression; add traceable rows. Matrix 52's “deterministic ranking” must mean the plan's ordering/score contract, not merely repeatable array traversal. Matrix 35's “complete local workspace” should state how both scoped backups together cover persisted personal data.
- Guild frontend publication/staleness/conflict diff/reapply and NEW migration007 owner snapshots are owned elsewhere. This audit neither edits those files nor certifies their final state. Preserve their existing open gates separately from this report.
- Final release performance measurement remains **unverified**, not proven slow: plan 351 requires measured shipped-catalog search/planning responsiveness. Record a bounded measurement rather than implementing an unnecessary worker. Final all-tests/typecheck/lint/build/catalog/browser rerun and exact evidence remain required after concurrent work settles (plan 349–354; matrix 73–75).

## Recommended closure order

1. Resolve catalog/snapshot identity, migration, and scoped metadata first; these determine future persistence and backup contracts.
2. Close inventory freshness/history and the alternate/unresolved planner contracts, or obtain explicit narrowly worded scope amendments.
3. Complete breeding ranking, actionable Today/base context and the missing cross-module browser acceptance cases.
4. Verify both scoped backups with nonempty interrelated data, the source/license gate and emitted notices, then run final merged-tree validation. Report a bounded milestone instead of “whole plan complete” until these gates are satisfied.
