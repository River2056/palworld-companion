# Palworld Companion

Local-first, unofficial Palworld planning app. Craft, Breeding, Bases and optional Guild are reachable from the shell; this is not a claim that the full product plan is complete. Today shows the real crafting queue, shortages, Pal roster counts and base assignments. Craft supports fuzzy recipe search, finished-unit quantities, direct ingredients, raw-material alternatives, priority pins, notes, manual inventory and progress. Base gap targets link to Breeding. Guild loads only when opened, with no backend request before explicit consent and authentication.

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

`npx playwright test tests/e2e/integration.spec.ts` verifies personal multi-module persistence and opt-in Guild without a backend. Real guild signup/login/create/task/readback checks are opt-in: `GUILD_E2E=1 npx playwright test tests/e2e/integration.spec.ts`, with local guild services already running. Tests read endpoint URLs from ignored `scripts/guild/.local/config.json` in Node only and generate disposable test credentials; no configuration file or private key is bundled. They leave disposable accounts/guilds in the local test database. See [integration review](docs/reviews/integration-final.md) for exact results and browser blockers.

Guild users enter trusted Auth and REST endpoints at runtime and explicitly consent before authentication. Passwords/session tokens are memory-only; leaving Guild clears the session. Only endpoint URLs persist. Personal plans are never published automatically, and Today does not fetch or invent a guild sync summary. Never supply service-role or private keys to the browser.

## Crafting semantics and data

- Catalog: **10 reference recipes and 7 leaf materials**, mixed source revisions, **game patch compatibility unverified**. Alternate recipes and station construction costs are excluded. Recipe/acquisition source links and warnings are visible in the UI; originals and attribution remain in `docs/research/`.
- Goals mean **craft more**: owned final-target stock never cancels a top-level goal. Finished quantities round up to whole recipe batches. Planned excess can serve later demand, separately from owned inventory.
- Queue order controls shared stock reservations. Owned intermediate stock is consumed before expanding shortages; each unit is reserved once per alternative. Direct and raw lists are alternatives, not additive. This is a deterministic priority plan, not a globally optimal schedule.
- Completion/partial progress never changes inventory automatically. Update physical stock manually; stale stock produces stale estimates.
- Dexie persists one personal crafting workspace atomically in IndexedDB: ordered goals, quantities, progress, notes, inventory and recent pinned selections. Use one editing tab at a time; browser storage can be lost.
- Settings exports crafting JSON and validates an import before explicit replacement confirmation. Unknown recipe/item IDs are retained and shown unresolved. Invalid input does not replace saved data. Crafting reset requires confirmation. A separate **Pal, base and route backup** panel exports/downloads JSON and requires validated preview plus explicit replacement confirmation; neither backup includes Guild.
- No game connection, analytics, automatic progress collection, or account is needed for personal features. No affiliation with or endorsement by Pocketpair.

## Layout and remaining scope

- `src/domain/` — catalog validation and pure crafting calculation, with tests
- `src/data/` — versioned crafting backup validation and transactional Dexie store
- `src/features/{Craft,Queue,Shopping,Today,Settings}.tsx` — crafting UI
- `src/features/pals/` — separately maintained breeding/base workspaces
- `src/app/` — responsive shell, navigation and persistence boundary
- `tests/e2e/` — real-browser acceptance checks
- `docs/reviews/crafting-final.md` — scoped review, evidence and remaining limitations

The larger plan still includes richer provenance, catalog migrations/snapshots, dedicated completion history, and expanded guild workflows. Guild implementation and backend acceptance gates are reviewed separately. Do not interpret the reference dataset as complete or current-game verified. Pal reference research and `pal-attribution.md` remain separately maintained.
