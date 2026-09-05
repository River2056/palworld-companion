# Guild mutation continuation privacy fix

## Outcome

Fixed the reproduced create/join race: a mutation completing after an offline purge or unmount cannot start a new refresh/selection generation or republish a private Today summary. The same fence covers logout, endpoint changes, task/stock completion and conflict continuations, invitation issuance/revocation, member removal, rename, mark-seen, and asynchronous source verification before publication/update.

`captureContinuation` captures mounted lifecycle, request epoch, selected guild, user, session token, and endpoint identity. `awaitCurrent` checks both fulfilled and rejected asynchronous work; mutation handlers check their original capture before subsequent reads or UI continuations. Existing read-generation/denial aggregation checks remain intact. Cleanup invalidates the epoch and marks the component unmounted; no generation is reset. Pending mutations still lock guild selection (including synthetic selection attempts), rather than silently retargeting an in-flight mutation. Stale conflicts cannot restore discarded retry proposals.

## Deterministic evidence

- Before the fix: the eight new create/join cases (offline, unmount, logout, endpoint change following logout) all failed; existing sixteen Today tests passed. Machine-readable evidence: `/tmp/today-guild-mutation-red.json`.
- After the fix: `npx vitest run src/features/today-guild.test.tsx src/features/guild --reporter=json --outputFile=/tmp/today-guild-mutation-green.json` passed **100/100 tests**, including **58 Today/Guild tests**.
- Added deferred-promise regressions inspect **every non-null summary callback**, every positive session callback, and the fetch call count after invalidation. This rejects even transient publication and any stale follow-up read, not only the final screen state.
- Additional cases cover seven mutation families across offline, unmount, logout, and stale 409-conflict settlement; selection locking while each mutation is pending; create/join invalidation during the follow-up guild-list read; and successful non-invalidated create/join controls.
- Endpoint-change tests intentionally sign out first, since endpoint editing is disabled for active sessions. They do not claim that a normal user can edit endpoints while signed in.
- These race regressions use mocked transport and are **not backend integration evidence**.

## Real browser and checks

- `GUILD_E2E=1 GUILD_E2E_PORT=4318 npx playwright test --config=playwright.guild.config.ts today-guild.spec.ts`: **2 passed**, desktop Chromium and mobile Chromium, against the configured real local Auth/PostgREST services. Existing browser assertions cover explicit account/guild creation, shared task assignment, Today memory scope, inert navigation, offline purge/recovery, logout and reload. No backend reset and no mocked browser responses. These browser checks validate the normal lifecycle, not artificially delayed mutation timing.
- Scoped ESLint: clean.
- `npm run typecheck`: passed.
- Scoped `git diff --check`: clean.

## Ownership / coordination

Changed only `src/features/guild/GuildWorkspace.tsx`, `src/features/today-guild.test.tsx`, and this report. GuildWorkspace already contained the incoming semantic-source hook integration when this task began; its `assertCurrent()` calls are now wrapped in the same continuation fence before publication or source-update mutation. No publication component/helper files or snapshot/storage/runtime files were modified. If the semantic-source worker changes its asynchronous publication callback API, retain this original-operation fence before dispatching a mutation and before invoking any completion callback. No callback API change was required for the hook currently present.

The fix intentionally does not cancel or undo a mutation already accepted by the server. After interrupted operations, the user must explicitly reconnect/refresh and inspect server state; no stale continuation or automatic resend is permitted.
