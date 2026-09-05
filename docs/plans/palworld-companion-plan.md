# Palworld Companion Implementation Plan

> **For Hermes:** Use the subagent-driven-development skill when implementation is explicitly requested; implement this plan task-by-task. This request authorizes planning and saving notes only.

**Goal:** Build a second-screen Palworld companion that connects crafting checklists, breeding routes, base staffing, and guild tasks through a personal Today dashboard.

**Architecture:** Start with a local-first single-page webapp. Keep versioned game catalogs separate from player-owned state and keep calculation engines independent of UI and storage. Add authenticated guild persistence only after the personal workflows work.

**Tech stack (proposed, not yet installed or approved separately):** React + TypeScript + Vite; Fuse.js for fuzzy search; IndexedDB through Dexie for local persistence; Vitest for domain tests; Playwright for browser acceptance tests. Add Supabase Auth/Postgres with row-level security for guild collaboration in the final phase. Pin dependency versions during bootstrap rather than assuming latest versions here.

**Status:** Product decisions captured; no application code, game dataset, or deployment has been created or verified. No existing application repository was supplied or inspected. All source paths below are proposed paths relative to a future repository root.

---

## 1. Agreed decisions

- Include all four modules: Crafting Planner, Breeding Roadmap, Base Foreman, Guild Mission Board.
- Crafting defaults to **direct recipe ingredients**, with expandable intermediate recipes and a full raw-material view.
- Users can fuzzy-search items, set quantities, and pin crafting goals as persistent reminders.
- Multiple pins feed one combined shopping list; inventory must never be counted twice.
- Start with manual inventory and roster entry. No game connection is required.
- Release in this order: crafting → breeding → base planning → guild collaboration.
- A Today dashboard connects the modules as they become available.
- Mobile-friendly, dark by default, usable on a second monitor.
- Personal use does not require an account. Shared features eventually do.

### Not in the first release

Live inventory tracking, save-file imports, mods, in-game overlays, push notifications, AI chat, a full wiki, an interactive world map, exact factory throughput simulation, automatic passive-inheritance optimization, payments, and public social feeds.

A pin is an in-app reminder, not a scheduled notification. The app does not actually craft items, breed Pals, or move resources in the game.

## 2. Main experience

### Navigation

- **Today:** active crafting goals, shopping list, next breeding steps, base warnings, assigned guild work.
- **Craft:** item search, recipe detail, pinned queue, inventory.
- **Pals:** owned roster and breeding plans.
- **Bases:** staffing and production goals.
- **Guild:** shared tasks and activity; introduced in the collaboration phase.
- **Settings:** workspace/world, supported catalog version, export/import, accessibility, and later account controls.

Desktop uses navigation on the left with a pinned-plan panel beside the working area. Mobile uses compact primary navigation and a dedicated queue screen, not an overlay covering recipe details. Unreleased modules should not appear as working controls.

### Workspaces

A personal workspace represents one game world/save context. Inventory, roster, bases, and plans belong to that workspace. Ship a single default workspace first, but include a workspace identifier in persisted records. Later switching worlds must not merge unrelated inventories.

### Daily loop

1. Search for an item and select the desired output quantity.
2. Inspect its direct ingredients and required station.
3. Pin it; Today immediately shows the goal and combined shortages.
4. Expand an intermediate ingredient to inspect its recipe, or switch to raw materials.
5. Update owned quantities after gathering in-game.
6. Record crafting progress or complete the goal.
7. Later: turn a shortage into a guild task, or use base/roster recommendations to address a production gap.

## 3. Crafting Planner specification

### Search

- Search display names and curated aliases; normalize case and whitespace.
- Rank exact names above prefixes, then partial and fuzzy matches.
- Show item name, category, small optional icon, and craftability.
- Support keyboard navigation, Enter to select, Escape to dismiss, and touch selection.
- Empty query shows recent selections; no match offers a clear empty state rather than silently choosing something else.
- Alias support does not imply automatic translation. Start with an English catalog and keep names localizable.
- Select an item before pinning; never create goals from ambiguous raw query text.

### Recipe detail

- Desired quantity means **finished units**, not recipe runs.
- Display recipe output per run, required runs, actual output, and any surplus.
- List every direct ingredient and its scaled quantity by default.
- Show crafting station, known unlock requirement, catalog version, and source attribution where available.
- Expand craftable ingredients recursively; allow a separate raw-material breakdown.
- An uncraftable resource ends the expansion. An unknown recipe is an unresolved requirement, not a known raw material.
- If multiple recipes exist, choose a deterministic default and allow an explicit override. Do not combine their ingredients.
- Reject invalid quantities: negative, zero, fractional item counts, nonnumeric values, and unsafe oversized integers.
- Detect recipe cycles; show the problematic branch without crashing or silently dropping it.

### Pins and combined shopping list

Each pin stores item, recipe selection, desired quantity, fulfilled quantity, queue order, scope, and optional note. Pinning an identical item/recipe in the same scope offers to increase the existing goal instead of creating accidental duplicates.

- Reorder pins to change inventory allocation priority.
- Show required, allocated from owned stock, and missing quantities.
- Keep personal and guild inventory pools separate.
- Aggregate shopping-list rows by stable item identifier, not display name.
- Direct and raw views are two projections of the same plan: never add both together.
- Raw view consumes available intermediate stock before expanding its remaining deficit.
- Preserve provenance so users can see which goals need a material.
- Carry recipe batch surplus forward inside the calculated plan where the same output can satisfy later demand; surface that allocation rather than promising a global optimal schedule.
- Inventory allocation is a planning reservation, not an actual stock mutation.
- Existing stock of the final target can satisfy the outstanding goal. Show that separately from units recorded as newly crafted.

### Calculation contract

Implement a pure planner that receives the catalog, ordered goals, selected recipes, and one inventory snapshot. It returns a dependency plan, ingredient totals, stock allocations, surplus, and unresolved branches without modifying inputs.

1. Traverse goals in their explicit queue order.
2. Allocate each available stock unit at most once from a shared planning ledger.
3. For each remaining craftable deficit, compute the minimum whole recipe runs needed to cover it.
4. Expand the corresponding ingredient demand; keep dependencies and provenance.
5. Reuse planned surplus consistently within the same calculation, distinguishing it from physical inventory.
6. Return a post-order crafting sequence: dependencies before consumers.
7. If missing data or a cycle prevents resolution, return a partial result with a visible warning; never label it complete.

Priority order makes allocation predictable. V1 does not search globally for the cheapest mix of alternate recipes or maximum sharing among independent plans.

### Inventory and completion semantics

- Inventory is manually maintained; display its last update time and a manual-data badge.
- Default completion action is **record progress only**. It updates the goal without silently deducting materials or claiming the game inventory changed.
- If local stock adjustment is added, use a separate explicit action showing the exact deductions/additions and recipe runs. Apply it atomically, reject insufficient stock, and provide undo. It is not required for the first release.
- Partial progress is supported; completed goals move to history and can be reopened.
- A completed goal no longer reserves stock. Recompute the remaining queue immediately.
- Warn users that stale manual stock can make later shortages inaccurate.

### Crafting acceptance criteria

- A tested typo and a partial name both find the intended catalog item.
- Direct ingredients are the default after opening a recipe.
- Quantity changes update requirements, runs, surplus, and shortages.
- Expanding intermediates and raw view produce consistent results.
- Overlapping goals cannot allocate the same owned stock twice.
- A reload preserves pins, order, inventory, and progress.
- Invalid quantities and unresolved recipes have actionable error states.
- Marking a goal complete does not silently mutate inventory.
- JSON export/import restores the workspace and rejects invalid input without damaging current state.

## 4. Breeding Roadmap specification

### Owned roster

Store individual Pals rather than just species: local ID, species ID, nickname, sex where relevant, manually entered passive traits, favorite flag, and current base assignment. A species-level availability view is derived from those records.

### Planning

- Select a target species and search supported breeding relationships from the owned roster.
- Show parent pairs, prerequisite offspring, generation depth, and missing parents.
- Rank by fewer missing parents, then fewer breeding steps, then shallower depth; explain the score.
- Present bounded candidate routes rather than claiming exhaustive or globally optimal results.
- Handle special breeding rules through catalog data, not a guessed universal formula.
- Detect loops and enforce search depth/result limits. Distinguish “no route within limits” from “impossible.”
- Verify compatible owned parent instances before labeling a first step ready; missing sex information must be shown as unknown.
- Users mark a breeding step complete manually and may add the offspring to the roster.
- Basic species planning only at first. Passive traits are recorded but inheritance odds and ideal-trait optimization are deferred until supported by validated data.

### Acceptance criteria

Known catalog pairs produce their documented offspring; compatible owned parents seed ready routes; special rules are respected; loops terminate; missing data is visible; completed steps survive reload. A test must exercise a target reachable through intermediate offspring, not only direct pairs.

## 5. Base Foreman specification

- Create a base, select production goals or work types, and assign owned Pal instances.
- Display each worker's catalog work suitability and manually recorded relevant modifiers.
- Flag uncovered required work types, incompatible assignments, and a Pal instance assigned to multiple bases simultaneously.
- Suggest replacements from unassigned owned Pals; explain the relevant suitability difference.
- Offer a link to plan acquisition/breeding for an unowned candidate, requiring user confirmation before creating a plan.
- A crafting recipe can identify its required station/work type; that supports a staffing suggestion, not a promise that staffing alone removes a resource shortage.
- Label recommendations as rule-based. Layout, pathfinding, uptime, transport bottlenecks, and actual production rates are outside the first model.

### Acceptance criteria

A known uncovered work type is flagged; a compatible worker clears it; duplicate assignments are rejected; suggestions reference actual owned instances; unavailable or unknown suitability data does not generate confident recommendations.

## 6. Guild Mission Board specification

### Collaboration model

- Signed-in users create or join a guild through a revocable, expiring invite.
- Roles: owner, member. Owner manages membership and guild settings; members collaborate on tasks.
- A task has type, title, description, optional item/Pal/plan reference, requested quantity, reported delivered quantity, assignee, status, and activity history.
- Statuses: open, claimed, in progress, done, cancelled.
- Members can claim unassigned work; reassignment and status changes are logged.
- Shared crafting pins belong to guild scope. Publishing a personal pin explicitly copies its selected goal; it does not expose the whole personal workspace.
- Personal inventory is never silently pooled. Shared inventory is a separate manually maintained ledger.

### Task integration

- Create a gathering task from an ingredient shortage with its item ID and quantity.
- Link the task to the originating plan, but preserve the task as a historical record.
- If the plan changes, show a stale-quantity prompt; do not silently rewrite claimed work.
- Prevent accidental duplicate active tasks for the same originating requirement, or ask whether to increase the existing task.
- Completing a gathering task reports delivery; it does not automatically change personal stock. Any shared-ledger adjustment must be explicit and transactional.
- Capture and breeding tasks can link to roadmap targets; base tasks can link to staffing warnings.

### Activity and safety

- “Since your last visit” is a chronological event digest, not an AI-generated summary.
- Enforce guild membership with server-side row-level security on every shared table.
- Use atomic claims or optimistic revision checks to prevent simultaneous claims overwriting each other.
- V1 shared editing requires connectivity. Offline users see cached/read-only data and a clear offline status; no silent conflict-prone write queue.
- Revoked members lose remote access. Clear cached guild data on logout/revocation detection; previously viewed/exported data cannot be recalled.
- Never ship service-role credentials to the browser.

### Acceptance criteria

Two accounts see the same task state; only one wins a simultaneous claim; nonmembers cannot read or mutate guild records; revoked invites fail; deleted memberships cannot access remote data; changing a personal inventory does not alter guild stock; activity reflects the exact change and actor.

## 7. Data contracts and persistence

### Versioned catalog entities

- CatalogManifest: dataset ID, game version, schema version, source URLs, attribution/license status, verification status.
- Item: stable ID, localized names/aliases, category, optional licensed asset reference.
- Recipe: ID, output item ID, output count, ingredient item/count pairs, station, optional unlock metadata.
- PalSpecies: stable ID, names, work suitability, supported metadata.
- BreedingRule: parent species/rule constraints, offspring, exceptions, source reference.

### Player and collaboration entities

- Workspace: ID, name, selected catalog version.
- InventoryEntry: workspace/scope, item ID, owned quantity, updated time.
- CraftGoal: ID, scope, item/recipe IDs, target/fulfilled quantities, order, state, note.
- OwnedPal: ID, workspace, species ID, nickname, sex, traits, base assignment.
- BreedingPlan and BreedingStep: target, chosen route, parent references, progress.
- Base and BaseGoal: workspace, name, work requirements; assignments reference OwnedPal IDs.
- Guild, Membership, Invite, GuildTask, ActivityEvent: remote collaboration records.

Persist catalog version with each plan. On catalog updates, validate references and offer migration with a preview; preserve the old snapshot until the user accepts. Unknown IDs remain visible as unresolved instead of deleting goals. Use IndexedDB schema migrations, transactional writes, export format versioning, and import validation. Never use display names as foreign keys.

### Proposed module boundaries

```text
src/app/                         routing, navigation, Today
src/catalog/                     schema, loading, validation, provenance
src/domain/crafting/             pure planning and inventory allocation
src/domain/breeding/             route search and ranking
src/domain/bases/                suitability checks and suggestions
src/features/craft/              search, detail, pins, shopping list
src/features/pals/               roster and breeding UI
src/features/bases/              base UI
src/features/guild/              shared tasks and activity
src/storage/                     IndexedDB repositories, migrations, backup
src/services/guild/              authenticated remote adapter
src/test/fixtures/               explicitly synthetic domain fixtures
public/data/                     validated versioned game catalog
scripts/validate-catalog.ts      graph/schema/provenance checks
supabase/migrations/             shared schema and access policies
supabase/tests/                  authorization and concurrency tests
tests/e2e/                      browser acceptance tests
```

UI components must not implement recursive ingredient math, breeding rules, or authorization logic. Derive requirements from goals and inventory instead of persisting duplicate calculated totals.

## 8. Game-data readiness gate

No live game database, recipe values, current patch support, asset rights, or public API availability was researched or verified for this planning note. Those are implementation prerequisites, not established facts.

Before releasing game-facing functionality:

1. Identify a usable catalog source and verify licensing/redistribution terms for data separately from images.
2. Record the supported game version and source URLs; identify stale/incomplete areas.
3. Check recipe outputs, ingredient quantities, stations, breeding exceptions, and work suitability against reliable references.
4. Build an importer or reviewed manual catalog with repeatable validation.
5. Reject duplicate IDs, dangling references, nonpositive quantities, and unexplained graph cycles.
6. Use text placeholders when image rights are unclear.
7. Publish the supported catalog version and limitations in the app; do not claim support for every game item unless completeness is checked against a defined source inventory.

Synthetic recipes are acceptable for unit tests only. Label them clearly and never pass them off as real Palworld content. If data permission or accuracy is blocked, deliver a clearly labeled development prototype, not a supposedly verified companion.

## 9. Delivery plan and implementation handoff

### Common execution loop

For each coding task below: write its focused failing test; run it and confirm the intended failure; implement the smallest passing change; rerun the focused test; run related regression tests; review; commit locally only when authorized by the implementation workflow. Each numbered substep is a separate action; the feature groups are milestones, not promises of five-minute completion.

Proposed package scripts must be defined during bootstrap:

- `npm run test -- <test-file>`: Vitest run for a selected test.
- `npm run test`: all domain/component tests.
- `npm run typecheck`: TypeScript checking without emission.
- `npm run lint`: configured lint checks.
- `npm run build`: production build.
- `npm run test:e2e -- <test-file>`: Playwright acceptance tests.
- `npm run validate:catalog`: catalog validation.

These are future verification commands, not commands executed for this note. A passing test run must be reported from actual tool output during implementation.

### Phase 0 — foundation and data gate

1. Create the repository only after implementation is authorized and its location is confirmed; create `package.json`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, and `playwright.config.ts`.
2. Add `src/app/App.tsx` and `tests/e2e/shell.spec.ts`; verify the mobile/desktop shell and Today empty state.
3. Define catalog schemas in `src/catalog/schema.ts`; add `src/catalog/schema.test.ts` for invalid counts, duplicate IDs, and dangling references.
4. Create `scripts/validate-catalog.ts` and `public/data/manifest.json` after selecting a lawful, verified source; record unresolved coverage explicitly.
5. Add `src/storage/db.ts` and `src/storage/db.test.ts`; verify transaction rollback, a migration, and workspace isolation.

Exit gate: runnable shell, reproducible tests/build, and a documented catalog decision. Do not substitute invented game content if data sourcing fails.

### Phase 1 — crafting vertical slice

1. Add `src/features/craft/search.ts` and `search.test.ts`; test exact/prefix/fuzzy ranking, aliases, and empty queries.
2. Add `src/domain/crafting/quantities.ts` and `quantities.test.ts`; test recipe-run rounding, surplus, and invalid input.
3. Add `src/domain/crafting/expand.ts` and `expand.test.ts`; test direct ingredients, nested recipes, unknown branches, alternate selections, and cycles.
4. Add `src/domain/crafting/allocate.ts` and `allocate.test.ts`; test queue priority, shared stock, intermediate stock, and planned surplus reuse.
5. Add `src/domain/crafting/plan.ts` and `plan.test.ts`; test multiple goals together and consistent direct/raw projections.
6. Add `src/storage/craft-goals.ts` and its tests; test pin merge, reorder, partial completion, reopening, and persistence.
7. Add `src/features/craft/ItemSearch.tsx`, `RecipeDetail.tsx`, and focused component tests; cover keyboard and accessible error states.
8. Add `CraftQueue.tsx`, `ShoppingList.tsx`, and `InventoryEditor.tsx`; verify live derived totals and explicit manual inventory updates.
9. Add `src/storage/backup.ts` and `backup.test.ts`; test export/import, invalid formats, future-version rejection, and atomic restore.
10. Add `tests/e2e/crafting.spec.ts`; run search → quantity → pin → inventory → reload → partial progress → completion, checking default direct view and unchanged stock on completion.

Exit gate: crafting acceptance criteria pass using verified game samples plus labeled synthetic edge-case fixtures. Today displays active pins and shortages.

### Phase 2 — roster and breeding

1. Add `src/storage/owned-pals.ts` and tests for individual identity and persistence.
2. Add `src/domain/breeding/rules.ts` and tests for documented normal/special rules.
3. Add `src/domain/breeding/routes.ts` and tests for multistep search, bounds, cycles, parent compatibility, and deterministic ranking.
4. Add `src/features/pals/Roster.tsx` and `BreedingRoadmap.tsx` with component tests.
5. Add `tests/e2e/breeding.spec.ts`; verify selecting a target, choosing a route, completing a step, adding an offspring, and reload persistence.
6. Add next-step cards to Today without making passive-trait success claims.

Exit gate: a documented real breeding route works end-to-end, and search limitations are visible.

### Phase 3 — base planning

1. Add `src/domain/bases/evaluate.ts` and tests for suitability coverage, missing data, and duplicate assignments.
2. Add `src/domain/bases/recommend.ts` and tests for unassigned-owned candidates and explanation text.
3. Add `src/features/bases/BasePlanner.tsx` with persistence and component tests.
4. Add `tests/e2e/bases.spec.ts`; verify missing work → compatible assignment → warning cleared, plus breeding handoff requiring confirmation.
5. Add actionable base warnings to Today.

Exit gate: recommendations are correct within the declared rule-based model; no unvalidated production-rate claims.

### Phase 4 — guild collaboration

1. Define `supabase/migrations/001_guild.sql` and authorization tests in `supabase/tests/guild_access.sql`; test owner/member/nonmember isolation before UI.
2. Add migrations and tests for expiring/revocable invites and atomic task claims.
3. Add `src/services/guild/client.ts`, `tasks.ts`, and integration tests with explicit authenticated sessions.
4. Add `src/features/guild/GuildBoard.tsx` and `ActivityDigest.tsx` with task state and conflict handling.
5. Add explicit personal-goal publication and shortage-to-task linking; test duplicate prevention and stale quantity warnings.
6. Add `tests/e2e/guild.spec.ts` using two isolated browser contexts; verify claim conflicts, permissions, revocation, offline read-only behavior, and stock separation.
7. Add assigned guild work and last-visit activity to Today.

Exit gate: shared workflows and security tests pass against an actual test backend, not only mocked responses.

### Final release checks

- Run all tests, typecheck, lint, production build, and catalog validation.
- Test keyboard-only use and a narrow mobile viewport; status is not color-only.
- Measure fuzzy-search responsiveness on the shipped catalog and inspect expensive planning operations; move work to a Web Worker only if measurements justify it.
- Verify local data persists after reload and backups restore correctly.
- Explain that browser storage can be cleared/evicted and offer export visibly.
- Verify stale catalogs, missing records, failed storage, and network outages produce honest states.
- Verify production hosting URL and HTTPS after deployment; no deployment was requested here.
- Provide attribution, unofficial-fan-project disclosure, privacy/storage explanation, and supported-data version.

## 10. Risks and decisions still requiring discovery

| Risk / unknown | Chosen response |
| --- | --- |
| Catalog accuracy and redistribution rights | Mandatory data gate before real-content release. |
| Game updates invalidate plans | Versioned catalogs and explicit migration preview. |
| Manual inventory becomes stale | Last-updated labels, easy correction, no implied live sync. |
| Recursive calculations double-count materials | Shared allocation ledger, pure engine, overlapping-goal regression tests. |
| Batch surplus and alternate recipes complicate optimization | Deterministic queue order and explicit recipe choice; no global-optimality claim. |
| Breeding search grows rapidly | Bounded route search and visible limits. |
| Base advice omits physical simulation | Explain rules and exclusions alongside recommendations. |
| Guild race conditions or data exposure | Server-side policies, atomic claims, multi-account tests. |
| Browser data loss | Versioned export/import; no false guarantee of permanent local storage. |
| Scope expands before daily utility exists | Ship crafting first; keep later modules as staged milestones. |

Defaults are sufficient to start technical discovery without another product questionnaire. Before implementation, confirm the repository location and review the proposed stack. Before the guild phase, choose hosting/account policy and backend configuration. Notifications, save imports, passive optimization, and localization beyond the initial catalog require separate scope decisions.

## 11. Definition of done

The complete product is done only when all four modules meet their acceptance criteria and their cross-module flows are exercised. The first useful release is deliberately smaller: verified item search, direct recipe requirements, expandable/raw breakdowns, persistent quantity-aware pins, shared-stock-safe shopping lists, manual inventory, and backup/restore. Shipping that release does not mean the breeding, base, or guild phases are complete.
