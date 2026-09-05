# Today Guild summary — verified opt-in memory lifecycle

## Delivered

Today starts without mounting Guild, authentication, or remote requests. After opening Guild, explicitly trusting both endpoints, signing in, and selecting a guild, successful authorized reads emit an in-memory projection: exact guild ID/name and authenticated user ID, only that user's active assigned tasks (excluding done/cancelled), and the server's since-last-seen unread digest count. This is a last-loaded snapshot, not live authorization monitoring. Refresh links navigate to Guild; only an explicit Guild refresh requests data.

Guild remains mounted while navigating, with `hidden`, `inert`, and `display:none` preventing hidden forms from remaining accessible. No polling is introduced. Today provides full sign-out; local private state and summary clear immediately, with a deliberate server logout attempt. Reload starts unauthenticated. Existing endpoint-only persistence is unchanged; no session, token, or private summary is written to storage or backups. Parent notices/footer remain unchanged.

Summary clears on selected-guild changes, logout, unmount, browser offline, membership removal, 401/403, empty membership, and failed reads. Generation plus exact user/guild checks reject late successful reads after invalidation, before state publication. Existing uncertain-request read-only/retry behavior is retained. Browser offline clears selected private state and requires deliberate refresh/reselection. Server-side revocation cannot be discovered while idle without a request; copy explicitly says this.

## Real verification

- `npm run typecheck`: passed.
- Targeted Guild/App/Today Vitest run: **12 files, 60 tests passed**, including ten new Today privacy lifecycle cases and unchanged revocation/uncertain-write tests.
- Targeted ESLint: zero errors; one exhaustive-deps warning in GuildWorkspace's lifecycle effect.
- `node src/features/guild/today-guild-smoke.mjs`: **real Chromium + existing explicitly opted local backend**, desktop 1440×1000 and mobile 390×844 passed. Unique signup accounts/guilds were created; no backend reset or existing records modified.
- Browser assertions cover zero default-Today backend requests, endpoint approval, signup/login, create and claim task, Today active-task/digest summary, zero navigation refresh requests, hidden Guild form, private storage exclusion, offline purge/recovery, Today full logout, reload without authentication, no horizontal overflow, and zero page errors.
- Dedicated Vite port: 4289. Screenshot output: `/tmp/palworld-today-guild-4289/{1440,390}-summary.png`. Unit output: `/tmp/today-guild-unit.log`.

## Scope / integration notes

Only App/Today and minimal Guild session/summary plumbing changed. Publication/conflict internals, snapshot persistence, and future-adapter work are not part of this delivery. Quantity-v1 fingerprint remains deferred to catalog integration.

The existing personal Today test's old blanket “Guild data is not loaded on Today” assertion now checks the accurate guarantee “Today never signs in or refreshes Guild automatically.” No privacy assertion was removed. An initial personal live-write test failure during concurrent storage changes disappeared on the final run; that storage implementation was not modified here.
