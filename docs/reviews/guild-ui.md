# Guild workspace UI — verified standalone delivery

## Integration

```tsx
import { GuildWorkspace } from '../features/guild';
// No props required. CSS imports with the component and is scoped to .guild-workspace.
<GuildWorkspace />
// Optional explicit publication surface (never auto-publishes):
<GuildWorkspace draft={{ title: 'Gather wood', source: 'item:wood', checksum: 'snapshot-checksum' }} />
```

Only `src/features/guild/**` and this report are owned by this delivery. No App, package, global stylesheet or backend edits. No game imagery or external assets added.

## Functional surface

- Explicit trust/consent before any network request; independently configured Auth and REST URLs. HTTP allowed only for literal loopback hosts; remote endpoints require HTTPS. URL userinfo, query strings and fragments rejected. Fetch omits cookies and refuses redirects.
- Real GoTrue signup/password login/logout via direct fetch. No service-role key, hardcoded account/password, or cloud dependency.
- Guild list/create/select; owner-only invitation issuance (24-hour expiry); explicit checkbox required to redeem an invitation.
- Shared task creation, unclaimed task claim, owner/assignee title/status editing, revision-aware conflict reload. One immutable task payload/key retained across network, timeout, 5xx, 408 and 429 failures; new task writes and guild selection blocked until resolved. No automatic mutation retry.
- Manual refresh and digest; `mark_seen` sends `{p_guild, p_through_id}` from the last currently displayed digest entry. There is no pre-mark refetch. Re-read the updated SQL signature and exercised it against the actual backend.
- Optional draft title/source/checksum only leaves the planner after separate publication consent and the Publish button. Manual tasks do not include personal source data.

## Privacy and limitations

Only nonsecret endpoint URLs persist in localStorage. Access tokens, password form values, invitation tokens and pending task payloads remain in component memory. Reloading/unmounting/signing out drops that session and any unresolved retry; the UI warns to keep the page open during an unknown task outcome. Local sign-out clears the session even if server revocation fails, reporting that failure explicitly. Expired sessions require a fresh login; no refresh-token persistence or automatic token renewal.

`create_guild`, `create_invite`, and `redeem_invite` have no idempotency-key parameter in the real backend. The client preserves their exact signatures and never automatically retries them. After uncertain failure the error explicitly instructs refresh/checking server state before repeating a non-task action. Do not claim those RPCs offer task-style exactly-once retry. Configuring remote endpoints assumes compatible GoTrue/PostgREST exposed directly without an additional gateway API-key requirement.

## Verification

- `npx vitest run src/features/guild`: **6 passed, 0 failed**. Boundary tests cover URL validation, authenticated request options, exact frozen task replay across offline/503, and definitive conflict clearing. Component DOM tests cover opt-in/no startup requests, login error, login success, guild creation/display, owner invitation visibility and displayed digest watermark.
- `npm run typecheck`: passed (full project).
- `npx eslint src/features/guild --max-warnings 0`: passed.
- Actual exported `GuildClient` transpiled with the installed TypeScript compiler and exercised against `http://127.0.0.1:55431` and `http://127.0.0.1:55432`: **PASS real signup, authenticated create/list guild, mutate_task, displayed digest watermark, logout**. Generated random ephemeral credentials; none printed or persisted. One isolated `UI client smoke` guild/account/task remains in the local development database.
- Parent owns shell integration, rendered-browser/mobile visual checks, and backend security tests. No browser/visual verification claimed here.

Files: `client.ts`, `client.test.ts`, `GuildWorkspace.tsx`, `GuildWorkspace.test.tsx`, `guild.css`, `index.ts` under `src/features/guild/`, plus this report.
