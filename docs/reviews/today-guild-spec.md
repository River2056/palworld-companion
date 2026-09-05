# Today Guild privacy recovery — scoped PASS

## Findings and changes

- The remaining switch test used an unimplemented `delay` fixture mode, so it did not hold a response at all. Its blanket all-null expectation also rejected legitimate new-guild summaries. The repaired test uses a real pending-response barrier, verifies the request lock rejects switching while busy, then checks that selection clears the previous summary and every subsequent non-null callback has the new guild and authenticated user scope.
- Pending reads after logout, offline and unmount now assert every callback, not merely the final callback, contains no private summary. Callback-identity rerender coverage verifies no cleanup/reset loop or incidental requests.
- GuildWorkspace uses a stable request invalidator with current generation state. Browser-offline guidance explicitly says private selection and uncertain retry payloads were cleared, nothing is automatically resent, and server state must be inspected before explicitly re-entering an uncertain change. Existing exact-retry tests remain passing.
- Added permanent opt-in Today Guild browser tests; the smoke script delegates to Playwright. Existing publication/extended flows now expect offline private-state removal and deliberate reselection rather than retention of disabled private forms.

## Verified

- `npx vitest run src/features/today-guild.test.tsx src/features/guild --reporter=json --outputFile=/tmp/today-guild-recovery-scoped.json`: **54/54 passing**, including 16 Today Guild cases.
- Scoped ESLint for all six owned source/test files: clean. `npm run typecheck`: passed. `git diff --check`: clean before documentation addition.
- Real Chromium + real existing local auth/database, without mocked authentication or backend reset:
  `GUILD_E2E=1 GUILD_E2E_PORT=4298 GUILD_E2E_CONFIG=scripts/guild/.local/pw-guild-today-acceptance/config.json npx playwright test --config=playwright.guild.config.ts --workers=2`
  **8/8 passing**, 20.1 seconds. Includes new Today desktop/mobile flows and existing extended/publication flows. Browser outputs: `/tmp/palworld-guild-e2e-4298`; execution log: `/tmp/today-guild-recovery-browser-isolated.log`. Existing isolated backend was reused; only unique test accounts and their records were created.
- New Today flows cover no requests before opt-in or on navigation, real signup/create/claim, exact assigned-task summary, hidden forms, local/session storage exclusion, offline clearing/recovery, full logout/reload, and no page errors or horizontal overflow.

## Exact residuals, not part of the scoped PASS

- First browser run against default `scripts/guild/.local/config.json`: 4 pass / 4 fail, all failures in publication's before-only revoked-invitation activity expectation (`revoked` undefined). The same unchanged assertion passed on the existing isolated acceptance backend. Neither backend was reset or migrated by this recovery; default-stack owner-activity compatibility remains unverified.
- Wider personal Today run: `today-actions.test.tsx` has 7 pass / 1 fail, also reproduced independently. `read errors show unknown state, retain crafting, and can retry without writing personal data` synchronously expects `Pinned craft queue` while catalog references are still loading (line 95). Report: `/tmp/today-guild-recovery-personal.json`. No App, Today, snapshot runtime, or storage edits were made to address this separate failure.
- `playwright.guild.config.ts` is an existing untracked orchestration-owned dependency used for acceptance, not included among this recovery's owned commits. Integration must retain/commit it separately.
