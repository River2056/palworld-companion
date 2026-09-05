# Palworld Companion

Local-first, unofficial Palworld planning app. The crafting milestone is implemented; this is not a claim that the full product plan is complete. Today shows the real crafting queue and shortages. Craft supports fuzzy recipe search, finished-unit quantities, direct ingredients, raw-material alternatives, priority pins, notes, manual inventory and progress. Breeding and Bases expose the separately implemented personal workspaces; Guild remains upcoming.

## Run locally

Use Node.js 20.19+ and npm 10.

```sh
npm ci
npm run dev
```

Open the loopback URL printed by Vite (normally http://127.0.0.1:5173). No deployment is configured. No service worker or offline installation is provided: keep the local server running to load/reload the app.

## Verify

```sh
npm run validate:catalog
npx vitest run src/domain src/data src/app/App.test.tsx src/features/crafting-recovery.test.tsx
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npx playwright test tests/e2e/crafting.spec.ts tests/e2e/shell.spec.ts
```

`npm test` runs all Vitest suites and `npm run test:e2e` runs all browser suites. Playwright starts a separate loopback Vite server on port 4173, which must be free, and tests desktop Chromium and Pixel 7 mobile emulation. Screenshots and failure traces go to ignored `test-results/`. Direct dependencies are pinned in the lockfile.

## Crafting semantics and data

- Catalog: **10 reference recipes and 7 leaf materials**, mixed source revisions, **game patch compatibility unverified**. Alternate recipes and station construction costs are excluded. Recipe/acquisition source links and warnings are visible in the UI; originals and attribution remain in `docs/research/`.
- Goals mean **craft more**: owned final-target stock never cancels a top-level goal. Finished quantities round up to whole recipe batches. Planned excess can serve later demand, separately from owned inventory.
- Queue order controls shared stock reservations. Owned intermediate stock is consumed before expanding shortages; each unit is reserved once per alternative. Direct and raw lists are alternatives, not additive. This is a deterministic priority plan, not a globally optimal schedule.
- Completion/partial progress never changes inventory automatically. Update physical stock manually; stale stock produces stale estimates.
- Dexie persists one personal crafting workspace atomically in IndexedDB: ordered goals, quantities, progress, notes, inventory and recent pinned selections. Use one editing tab at a time; browser storage can be lost.
- Settings exports crafting JSON and validates an import before explicit replacement confirmation. Unknown recipe/item IDs are retained and shown unresolved. Invalid input does not replace saved data. Reset requires confirmation. **Settings backup/reset covers crafting only**, not the separate Breeding/Base workspace data.
- No game connection, analytics, automatic progress collection, or account is needed for personal features. No affiliation with or endorsement by Pocketpair.

## Layout and remaining scope

- `src/domain/` — catalog validation and pure crafting calculation, with tests
- `src/data/` — versioned crafting backup validation and transactional Dexie store
- `src/features/{Craft,Queue,Shopping,Today,Settings}.tsx` — crafting UI
- `src/features/pals/` — separately maintained breeding/base workspaces
- `src/app/` — responsive shell, navigation and persistence boundary
- `tests/e2e/` — real-browser acceptance checks
- `docs/reviews/crafting-final.md` — scoped review, evidence and remaining limitations

The larger plan still includes richer provenance, catalog migrations/snapshots, dedicated completion history, and shared guild workflows. Do not interpret the reference dataset as complete or current-game verified. Pal reference research and `pal-attribution.md` remain separately maintained.
