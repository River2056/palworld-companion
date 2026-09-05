# Palworld Companion

A local-first, unofficial Palworld companion foundation. Dark, responsive React/TypeScript shell with Today, Craft, and Settings destinations. No game data is shipped.

## Run locally

Use Node.js 20.19+ (verified with 20.20.2) and npm 10.

```sh
npm ci
npm run dev
```

Open the loopback URL printed by Vite (normally http://127.0.0.1:5173). Development and preview bind to `127.0.0.1`, not the LAN. No deployment or remote service is configured.

## Verify

```sh
npm run test
npm run typecheck
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Vitest uses jsdom and Testing Library; fake-indexeddb is configured for future persistence tests. Playwright starts its own loopback Vite server on port 4173 and exercises desktop Chromium and mobile Chromium emulation, including navigation, history/reload, keyboard focus, no external requests, and horizontal overflow. Screenshots and failure traces are written under ignored `test-results/`.

Direct dependencies are pinned, with the npm lockfile committed. Dexie and Fuse.js are installed for subsequent persistence/search work, but no storage schema or crafting domain is implemented here.

## Scope and privacy

- Today is an honest empty state. Craft is a clearly labeled, unimplemented workspace. Settings explains data/privacy limitations.
- Breeding, Base, and Guild are upcoming text labels, not interactive destinations.
- No account, analytics, cloud sync, game APIs, save-file access, external fonts, or automatic progress collection.
- This shell currently persists no user progress. Future data entry is manual and browser-local; clearing browser storage may lose it.
- No service worker or offline installation is provided yet. Keep the local server running to load/reload the app.
- Catalog validation (`validate:catalog`) is deliberately deferred until an actual catalog and validator exist. There is no placeholder success script.
- No affiliation with or endorsement by Pocketpair.

## Layout

- `src/app/App.tsx` — shell and hash-based destinations (supports history and reload)
- `src/app/styles.css` — responsive dark dashboard
- `src/app/App.test.tsx` — user-visible shell tests
- `tests/e2e/shell.spec.ts` — real-browser checks
- Root config files — Vite, TypeScript, Vitest, ESLint, and Playwright
