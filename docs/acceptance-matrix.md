# Acceptance matrix

This tracks the approved plan in `docs/plans/palworld-companion-plan.md`; unchecked prose is not a passing-test certificate. Current evidence and artifact disposition are in `docs/implementation-status.md`. All four modules are implemented at runtime checkpoint `5e9e17d8a09243eedd10fad25a6a007ae46d0efe`. Responsive specification review is PASS and independent quality review is APPROVED (`responsive-queue-quality-final.md`), with no critical/important issues. Independent review gates are closed; the final documentation/artifact commit records closure of all local acceptance gates. The recovered full browser run is 82 passed with zero skipped/unexpected/flaky; queue layout and bounded shipped-search measurements now have runtime evidence. Historical review blockers must be read with their superseding reviews.

## Foundation

- Repository-local author identity is river2056 / chen0625tung@gmail.com.
- Desktop and narrow-mobile shell render Today, Craft, and Settings without dead working-looking controls.
- All four implemented modules are accessible; do not retain the obsolete foundation-only “upcoming” status.
- Desktop queue sits beside the working area; mobile has a dedicated queue screen (plan §2). **Implemented and browser-verified:** desktop side-by-side queue and compact (1100px and below) dedicated `#/queue`; draft preservation, deep links and resizing are covered by `responsive-queue-recovery.md`. Independent specification and quality reviews are approved.
- Dependencies are locked; unit tests, typecheck, lint, production build, and browser tests execute.
- Game-data availability and browser-only/manual persistence are explained honestly.

## Catalog gate

- Every shipped game fact has provenance; every redistributed dataset has an explicit reviewed license decision.
- Item IDs are stable and recipe references resolve.
- Counts are positive safe integers; recipe output counts are explicit.
- Craftable-with-missing-recipe is distinct from known raw resource.
- Dataset/game version and coverage are visible; unverified current-patch coverage is never presented as verified.
- Default workspace identity and catalog selection persist; plans resolve exact retained snapshot bytes without silently falling back.
- Catalog migration has coherent before/after preview, explicit acceptance, inert cancellation, transactional revision checks and rollback preserving later personal edits. Missing IDs/bytes remain visibly unresolved.
- Metadata validation includes both actual reference schemas; fresh build plus `VERIFY_CATALOG_DIST=1 npm run validate:catalog` verifies emitted notices. This is not public-release legal clearance.
- Synthetic data remains in test fixtures, not the shipped catalog.

## Crafting

- Exact, prefix, substring, alias, typo, empty/recent, and no-result search cases.
- Accessible keyboard selection and dismissal; pin requires an explicit item selection.
- Desired quantity is finished units; show whole batches, actual output, and surplus.
- Default direct ingredients; expandable dependencies; optional raw-material projection.
- Explicit alternate recipe selection; unknown recipes and cycles remain visible.
- One stock ledger per scope/workspace; priority order decides allocation.
- **Approved craft-more override** (`docs/reviews/crafting-final.md`): existing final-target stock does not cancel a goal. Intermediate stock, raw stock and planned surplus retain separate semantics; do not reintroduce the superseded target-stock acceptance rule.
- Queue goals with the same material never spend physical stock twice.
- Complete/partial progress modifies only progress, not inventory.
- Pins, order, notes, progress, manual inventory, and recent searches survive reload.
- Invalid import cannot partially overwrite state; unknown catalog IDs remain recoverable.
- The craft and Pal/base/route scoped backups **together** preserve persisted personal data and format versions; neither promises export of server-side Guild records. Each restore must preserve the other scope.
- Inventory timestamps survive reload/export/restore; legacy unknown timestamps stay unknown. Show manual-data and stale-stock limitations.
- Completion moves a goal to history; explicit progress-only reopen restores allocation without changing inventory or timestamps.

### Planner invariants to test with labeled synthetic fixtures

- Never mutate caller inputs.
- Allocated physical quantity for any item does not exceed the input stock.
- No negative or nonfinite counts; reject arithmetic overflow rather than returning rounded unsafe integers.
- Dependency order puts ingredients before consumers.
- Direct and raw views are projections, not additive shopping lists.
- Cycle detection uses the active recursion path, not a global visited set that rejects legitimate shared ingredients.
- Inventory consumed to satisfy an earlier goal cannot also satisfy a later intermediate requirement.
- Planned surplus is not confused with owned stock or physically written into inventory.
- Unresolved branches prevent a complete/ready claim.

## Breeding

- Individual instance identity and compatible parents; unknown sex cannot be treated as confirmed compatible.
- Verified rules including special cases, bounded multistep routes, deterministic ranking, loop limits.
- Manual completed steps persist; offspring creation requires explicit user action.
- Candidate route limits are stated; passive inheritance is not simulated without data.
- Ranking explains missing-parent count, steps and depth with deterministic tie-breaks; separate acquisition guidance is not falsely presented as exhaustive ranked routes.
- Roster favorites persist; a route favorite is not an original-plan requirement.
- Exercise target → multistep route → manual step completion → explicit offspring save → reload, including same-tab roster writes and generation-fenced stale saves.

## Bases

- Work-type coverage, missing data, incompatible workers, duplicate instance assignments.
- Suggestions refer to unassigned owned instances and explain suitability.
- Breeding/acquisition handoff requires confirmation.
- Rule-based recommendations make no layout or throughput guarantees.

## Guild

- Real authenticated backend, owner/member/nonmember policy tests.
- Invites expire and revoke; claims are atomic under two concurrent accounts.
- Personal data is isolated from shared stock and published goals.
- Linked tasks do not silently change when originating goals change.
- Task completion does not implicitly mutate personal inventory.
- Offline writes are disabled; revocation/logout clears recoverable local guild cache.
- Activity events record the actual actor/change and drive the last-visit digest.
- Explicit selected-source publication/reconfirmation preserves historical task identity and detects semantic source changes; conflict review shows current/proposed values and reapply remains revision-guarded.
- Owner membership/settings events include safe before/after detail; real concurrent owner/claim operations cannot deadlock.
- Today Guild summaries require explicit opt-in/authentication, stay in memory, and clear after logout/offline/revocation. Stale mutation continuations cannot restore them (**closed by 531e5eb**, independently verified in `today-guild-mutation-fix.md`; do not carry the old privacy blocker forward).

## Cross-module and final release gates

| Gate | Current assessment |
| --- | --- |
| Actionable personal Today | Implemented: next incomplete breeding step and named base/work warnings; exact saved references and missing-data states. See `today-personal.md` and `app-pal-snapshot-final.md`. |
| Base journey and confirmation | Implemented and scoped browser-reviewed: uncovered work → compatible owned assignment → warning cleared; base-to-breeding navigation does not save until explicit confirmation. Recovered full suite: 82 passed; independent specification and quality reviews are approved. |
| Backup/data safety | Scoped schema-v2 roundtrips, immutable import consent, storage/CAS fencing and coherent migration reviews exist. See `pals-backup-schema2-final.md`, `catalog-runtime-spec-final.md`, `migration-preview-final.md`, `app-draft-safety-final.md`. |
| Keyboard/narrow mobile | Existing keyboard and overflow browser cases are evidence for those scenarios, not all-app accessibility certification. Recovered aggregate and dedicated responsive runs are green, including explicit queue placement/navigation. Independent specification and quality reviews are approved. |
| Measured responsiveness (plan final release checks) | **Measured:** 30 samples/project after five warmups; desktop median/p95 34.00/37.50 ms, Pixel 7 emulation 33.60/38.20 ms (`responsive-queue-recovery.md`). Mounted Craft/Fuse measurements include two-frame scheduling/render opportunity, not isolated CPU, physical-mobile, production-bundle or full-catalog performance. Synthetic planner evidence remains separate; no current evidence requires a Web Worker. |
| Final merged unit/build/catalog | Parent reran typecheck/lint/build, `VERIFY_CATALOG_DIST=1 npm test` (320/320, zero skips), and catalog/distribution checks (100/100) at the runtime checkpoint. `npm audit`: 0 vulnerabilities. Later runtime changes require affected checks to rerun; this matrix auditor did not execute those commands. |
| Real backend lifecycle/security | Parent reports fresh isolated seven-migration lifecycle, all backend suites, deadlock regression, durable restart and cleanup green. No default-stack migration/reset is implied. |
| Full browser acceptance | **Runtime green:** `/tmp/pal-full-responsive-recovery.json`: 82 passed, zero skipped/unexpected/flaky; real Guild, desktop Chromium and Pixel 7 emulation. Separate `/tmp/pal-responsive-recovery.json`: 4 passed, zero skipped/unexpected/flaky. Both statistics independently parsed for this reconciliation; do not add focused passes to the full-suite total. Old 65/78, origin and save-readiness blockers are superseded. Independent specification and quality reviews are approved. |
| Attribution/storage/disclosure | Notices shipped and App footer linked; manual/browser-eviction, unofficial-project and limited-reference disclosures remain. Public legal clearance/current-patch verification are not claimed by this local build. |
| Final artifact delivery | Responsive specification review PASS; independent quality review APPROVED, with no critical/important issues (`responsive-queue-quality-final.md`). Review gates are closed; the final documentation/artifact commit records closure of all local acceptance gates. Canonical Obsidian progress note synchronized to this runtime checkpoint with local acceptance complete. Parent retained seven obsolete development artifacts outside the repo and retains `playwright.guild.config.ts` as a supported isolated runner; see implementation status. |

Recipe-to-staffing shortcut is absent but not established as a mandatory exit criterion by the plan’s softer station/work wording. Do not invent sourced mappings or reopen explicit exclusions (public deployment, multi-world switching, automatic stock deduction, passive optimization, global recipe optimization).

## Release evidence

Record exact commands, exit status, test reports, catalog provenance, known blockers, local commit hashes, and launch URL in `docs/implementation-status.md`. A milestone stays incomplete if any required gate is unverified.
