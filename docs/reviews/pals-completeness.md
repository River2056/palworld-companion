# Pal completeness acceptance

## Outcome

Recovered the previous worker's persisted implementation rather than replacing it. Narrow acceptance passes against the actual Vite application in Chromium: **6/6 browser executions** (three scenarios on desktop Chrome and Pixel 7 emulation), **25/25 Pal unit/component tests**, and scoped ESLint without warnings.

## Implemented and verified

- Deterministic bounded explicit-pair route search ranks before display limiting by missing active owned parents, step count, generation depth, then stable identity. Unit tests cover reversed roster ordering, a one-result limit matching the ranked prefix, and many early intermediate candidates not hiding later cheaper parents.
- UI explains default four-step / 40-display bounds, the 200-node ancestry beam, missing parents, longest offspring chain, conditional gender, and lack of global-optimality guarantees. New runnable routes use owned parents; acquisition guidance is separate.
- Saving a route creates only a checklist. Manually completing step 1 creates no Pal. Explicit Add offspring prefills the species, unknown gender and empty passives; cancel creates nothing; Save Pal creates the individual. Reload retains the individual and manual completion, without implying gender verification.
- Favorite true/false toggles survive browser reload. Storage/backup tests cover legacy default false, backup true retention, imported unknown species, explicit false persistence, and invalid flag rejection.
- Base worker context shows source suitability plus manually entered modifiers/notes, explicitly not calculated speed or inherited passives. Browser acceptance creates a Cooling gap, assigns a compatible worker explicitly, verifies warning clearance and context, then reloads.
- Browser acceptance uses the real App callback from a base Cooling minimum-2 gap to Penking breeding. Navigation prefills the target but saves nothing; explicit Save route creates a one-step checklist that survives reload unchecked.

## Browser test repairs during recovery

The saved spec was not executable evidence by itself: it referenced unnamed regions and an outdated passive label. Added accessible roster/checklist region names and corrected exact selectors. Initial execution exposed `getByLabel` exact matching on a wrapped select; use the rendered combobox role/name instead. Persisted route completion is asynchronous, so the test clicks then retries the checked-state assertion rather than using Playwright's immediate `check()` postcondition. No assertion was removed to obtain a pass.

## Reproduction and evidence

- `npx vitest run src/features/pals` → `PASS (25) FAIL (0)`.
- `npx eslint src/features/pals tests/e2e/pals-completeness.spec.ts --max-warnings 0` → `ESLint: No issues found`.
- `npx playwright test --config /tmp/pals-completeness-52776.config.mjs` → `PASS (6) FAIL (0)`, 3497 ms.
- Isolated temporary config uses port 52776 with strictPort/reuseExistingServer:false, two Chromium device projects, zero retries, only `pals-completeness.spec.ts`, and `/tmp/pals-completeness-52776-results` output. Tests use fresh Playwright browser contexts; no real user's databases were reset.
- Durable spec also runs with repository config: `npx playwright test tests/e2e/pals-completeness.spec.ts` (default port 4173; this exact default-port invocation was not used during concurrent work).

## Limits and integration ownership

This is narrow Pal acceptance, not a repository-wide build/typecheck or whole-app acceptance claim. Snapshot contract/type errors and Today integration are other workers' ownership and were not repaired here. App, Queue, Guild, workspace data, package files and shared Playwright configuration were not modified.

The historical partial catalog (`docs/research/pal-reference.json`) is already imported by the Pal module but remains outside this worker's owned commit paths; the parent must include its catalog/reference delivery. No claim is made of complete game coverage, globally optimal routes, capture availability, perfect-passive breeding, or real production throughput. Browser backup import/export was not exercised here; backup behavior is covered by the Pal test suite.
