# Final shell integration

## Delivered
- All four modules reachable: Craft, Breeding, Bases, lazy-loaded Guild; hash navigation/reload retained.
- Today reads actual PalStore snapshots/reactive updates for active/archived individuals, saved routes, bases, workers and uncovered slots. Action links open personal workspaces; base species suggestions route to the selected breeding target.
- Personal plans remain local. Guild mounts only on its destination and performs no backend request until explicit consent/authentication. Today does not invent guild state or sync summaries.
- Mounted the separately implemented PalBackupPanel alongside crafting Settings, with honest separate backup scopes.
- README and shell tests updated; no domain/backend/guild source modifications.

## Actual verification
- Typecheck, lint and production build passed after final shell/Pal backup mount. Guild emits a separate lazy chunk.
- App.test.tsx: 4 passed (final run).
- Ordinary dedicated integration browser run: 2 passed, guild cases skipped by default (desktop Chromium + Pixel 7 emulation).
- Final `GUILD_E2E=1 npx playwright test tests/e2e/integration.spec.ts`: **2 passed / 2 failed**. Personal desktop/mobile flows passed, including Pal create/edit/reload, persisted base assignment, real Today summaries, craft pin, downloaded Pal backup re-upload, disabled replacement before confirmation, restore and Today readback, no external requests, no page errors, and no Guild horizontal overflow.
- Real Guild browser cases fail at signup before login/create/task readback. **Not verified; not green.** No mocked transport or fabricated results were substituted.
- `git check-ignore scripts/guild/.local/config.json` confirms ignored configuration; it is not staged. Test reads only public endpoint URL fields in Node; no anon/private key enters the browser or bundle. Disposable account credentials are generated only in the opt-in test.

## Blocking browser bug — guild owner must fix
`GuildClient` stores native `fetch` as `this.transport` and invokes `this.transport(...)`. Chromium rejects this receiver with `TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation`. Independently reproduced with real Chromium evaluating `{f:fetch}.f(authHealthURL)` at the running local app. Health returned HTTP200 and CORS preflight HTTP204 in curl, ruling out stopped services. Node smoke tests do not expose browser receiver requirements.

Fix default transport binding (`fetch.bind(globalThis)`) or invoke the extracted transport without a receiver inside GuildClient. This is outside integration worker ownership, so left untouched. Rerun the opt-in integration command after the fix; later task assertions remain unverified.

## Parent follow-up
- Update out-of-scope `tests/e2e/shell.spec.ts`: its old Guild-upcoming assertion is obsolete.
- Qualify Settings' old “No account, telemetry, or cloud sync” sentence as personal/crafting-only and update its old separate-workspaces backup description now that PalBackupPanel is mounted below.
- Separate workers own revoked-session UI, richer membership/revocation, quantities/shared stock/activity; this slice makes no full-spec completion claim.
- Final verification must be repeated after concurrent workers finish. Existing services on 5173/55431/55432 were left running.
