# Guild publication recovery — verified scope

## Delivered

Recovered the existing publication projection/picker, source-change prompt, conflict comparison/reapply helpers and tests rather than rebuilding them. App supplies the local workspace to Guild without publishing it. A user chooses one goal or allocated shortage, previews the projection, and consents. The RPC projection contains only explicit task fields; personal notes, workspace and inventory are not exported.

Changed-source duplicate creation receives backend PT409, reloads the authoritative task and offers **Review existing active task**, focusing that task without creating or overwriting it. Same-checksum duplicate publication resolves to the existing active task under the backend's existing deduplication contract (not a rejection).

Task/stock confirmed conflicts show current/proposed values. Explicit reapply uses the fresh revision and a new idempotency key; a second race demands another reload and confirmation. Quantity-change reconciliation changes only source/request fields and preserves claimed status, assignee, delivered progress and task title. Removed sources preserve shared history.

Owner activity details now render if **before OR after is non-null**, including revocation/removal events. App footer adds the local `Data sources and licenses` link to `/attribution.html`, with no eager external request.

## Actual verification

- `npm test -- src/features/guild`: **20 passed**, eight files.
- `npx eslint src/app/App.tsx src/features/guild --ignore-pattern '*smoke.mjs' tests/e2e/guild-publication.spec.ts`: **no issues**.
- Real Playwright Chromium with real Auth/PostgREST/PostgreSQL: **2 passed, 0 failed**, desktop 1280px goal and mobile 390px shortage. Final run: 11890 ms.
- Browser assertions: consent-disabled publication; exact payload key allowlist and private-note exclusion; no shell requests outside local Vite origin before consent; password/token absent from local/session storage; same-snapshot deduplication; changed-snapshot rejection and existing-task focus; task conflict, further race and fresh-key/revision reapply; stock conflict/reapply; actual claimed-task quantity reconciliation; removed-source preservation; offline read-only/no added mutations and reconnect; real invitation revocation with visible before-only activity details; real member removal and private task/stock purge; sign-out; no page errors or horizontal overflow; accessible attribution link.
- `npm run typecheck` was attempted repeatedly. At the final run it was blocked only by the concurrent snapshot worker's unfinished `validateCatalogShape`, `validateSnapshotShape`, and `validateBundledCatalog` exports in `src/domain/catalog-snapshot.test.ts`. Earlier recovery typecheck passed before that worker entered its red stage. No whole-build success is claimed; rerun after snapshot integration.

## Isolated execution / reproduction

The run created only `pw-guild-publication-recovery`, with Auth port 55641, REST port 55642, and seven migrations including 007. No default legacy database migration was run. Vite used **4187**, not the shared default 4173. Temporary Playwright output was `/tmp/pw-guild-publication-results`.

The committed spec is opt-in and skips unless `GUILD_BROWSER_CONFIG` points at an isolated stack config. For a fresh run, start a uniquely named stack using `GUILD_LOCAL_PREFIX`, `GUILD_AUTH_PORT`, and `GUILD_REST_PORT` as documented in `scripts/guild/README.md`. Create a temporary repository-root `playwright.publication.local.ts` containing:

```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'guild-publication.spec.ts',
  outputDir: '/tmp/pw-guild-publication-results', workers: 1, reporter: 'list',
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --port 4187 --strictPort',
    url: 'http://127.0.0.1:4187', reuseExistingServer: false,
  },
});
```

Run:

```sh
GUILD_BROWSER_CONFIG=scripts/guild/.local/<your-prefix>/config.json npx playwright test --config playwright.publication.local.ts
```

`GUILD_BROWSER_URL` can override the spec URL; update the temporary config to the same port. The runner stops its Vite server. Destroy only the test stack with its explicit prefix and `destroy --confirm-destroy`, then remove the temporary config. Scratch predecessor smoke scripts are deliberately excluded from the commit; the production acceptance lives in `tests/e2e/guild-publication.spec.ts`.

## Explicit follow-up gap

**`quantity-v1` is a quantity fingerprint, not a semantic catalog/recipe checksum.** Equal-quantity recipe/catalog changes are not detected. The narrow `publicationSources` projection is the follow-up integration seam for the separate snapshot/domain contract worker's semantic-v2 fingerprint. Do not infer a complete source-change guarantee from these tests. No snapshot API or storage contract was added in this recovery.
