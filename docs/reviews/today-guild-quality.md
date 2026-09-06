# Today Guild privacy integration — quality BLOCKED

## Scope

Independent read-only production-code review of recovery commit `30e7c91859d38728f8b69bc7f7cb2f3d17a33136`, including `today-guild-spec.md`, actual summary callbacks, request generations, component lifecycle, logout/offline purge, retry handling, App/Today integration, and focused unit/browser-test source. No production code, backend records, migrations, or default-stack configuration were changed.

## Blocking finding

### [BUG][SECURITY] An in-flight guild creation can publish private summaries after offline purge or unmount

**Locations:** `src/features/guild/GuildWorkspace.tsx:68-70,100-102,123-126,148-151,208-209`.

The generation fence protects a `load()` or `refresh()` that was already entered before invalidation, but does not protect the *whole operation* that starts those helpers after an earlier await. The create handler is:

```tsx
const id = await client().rpc<string>('create_guild', { p_name: name.trim() });
setName('');
await refresh(client(), '');
await select(id);
```

If offline or unmount occurs while `create_guild` is pending, cleanup increments the epoch and emits a null summary. When the old RPC resolves, this handler nevertheless enters `refresh()`, which captures the **new** epoch. It then calls `select()`, which sets a guild scope again. `load()` consequently considers the old continuation current and emits a non-null private summary. Offline retains the account scope intentionally; unmount increments the epoch but also leaves that ref available to the old closure. Both boundaries are bypassed.

**Independently reproduced, not merely inferred:** temporary Vitest tests use a pending `create_guild` response barrier, dispatch offline or unmount, clear recorded callbacks, and release the response. Both tests fail the assertion that post-boundary non-null callbacks must be empty, receiving a summary for guild `h`. For offline this also reselects a guild without the deliberate refresh/reselection promised by the copy. The fixture's resolving requests model an already in-flight response completing across a connectivity boundary; it does not require a new user action.

The invitation acceptance handler at line 209 has the same unguarded `RPC → refresh → select` structure; its analogous risk was inspected, not independently executed.

**Recommendation:** preserve operation-level lifetime/user/guild identity across the initial RPC and check it before every subsequent state update, follow-up request, and selection. Do not allow an obsolete operation to acquire a fresh generation merely by entering another helper. Account for legitimate explicit selection invalidation separately. Add permanent delayed-create and delayed-redeem tests for offline/unmount/logout boundaries, asserting every callback and absence of obsolete follow-up requests. Re-run the existing read-fence and exact-retry suites. This is a blocking privacy/lifecycle defect within the requested scope; quality is **not APPROVED**.

## Verified strengths and coverage limits

- `GuildWorkspace.tsx:59-70`: stable invalidator and latest-callback refs avoid callback-identity cleanup/reset loops. Existing tests explicitly verify no incidental fetches and callbacks that update parent state.
- `GuildWorkspace.tsx:100-119`: already-entered reads fence generation/user/guild before publication, prioritize authoritative denials across parallel results, verify membership, and project only the current user's nonterminal task id/title/status plus scoped digest count.
- `GuildWorkspace.tsx:75-82,171-175`: purge removes selected private collections/forms and replaces retry holders; logout clears in-memory session/password/consent and summary. App keeps the opt-in workspace hidden/inert off-route, and Today data is held in React state rather than persisted.
- `client.ts:4-10,65-75`: uncertain task/stock failures retain immutable payloads and keys; definitive rejections clear them. Browser offline intentionally drops those holders and requires manual recovery rather than automatic resend. Existing request-failure/read-only and exact-retry tests pass. However, honest offline copy alone does not cover the pending-create continuation above.
- `today-guild.test.tsx:77-120` tests pending **reads**, including every callback after boundaries, but does not exercise a pending mutation that starts a fresh read/selection after invalidation. This is why the current 54-test PASS does not establish the stronger lifecycle guarantee.

## Execution evidence

1. `npx vitest run src/features/today-guild.test.tsx src/features/guild --reporter=json --outputFile=/tmp/today-guild-quality-tests.json`
   - **54 passed, 0 failed**, including **16 Today Guild tests**. Counts read from the JSON report.
2. `npx eslint src/features/guild/GuildWorkspace.tsx src/features/today-guild.test.tsx src/features/guild/today-guild-smoke.mjs tests/e2e/today-guild.spec.ts tests/e2e/guild-extended.spec.ts tests/e2e/guild-publication.spec.ts --max-warnings 0`
   - **PASS**, no issues.
3. `git diff --check`
   - **PASS** at initial review snapshot.
4. `npx vitest run --config /private/tmp/today-guild-quality-race/vitest.config.mts --reporter=json --outputFile=/tmp/today-guild-quality-race-result.json`
   - **2 failed / 2 executed**, demonstrating post-offline and post-unmount non-null summary publication from delayed creation. Temporary fixture/config are outside the repository and import the actual production component. No backend calls were made; fetch is mocked solely for these deterministic unit reproductions.
5. `npm run typecheck`
   - **FAILED on the evolving shared worktree**: concurrent publication-v2 work changed `publicationSources()` to return a Promise, while `GuildWorkspace.tsx:23,215,223` and `publication.test.ts:11,14` still expected an array at execution time. `git diff` confirmed the publication helper was concurrently modified while GuildWorkspace remained unchanged. This is an integration-worker handoff, not an additional Today-specific finding; do not reuse the earlier spec report's typecheck PASS as a claim about this later snapshot.

## Browser/backend boundaries

No new browser execution was performed in this review. Inspected `tests/e2e/today-guild.spec.ts` covers opt-in/no navigation requests, real signup/create/claim, hidden/inert forms, local/session-storage exclusion, ordinary offline recovery, logout/reload, page errors, and overflow. It does not delay creation across purge/unmount. The spec report's isolated-backend 8/8 browser result is prior evidence, not an independent rerun here. Its default-backend owner-activity incompatibility remains outside this verdict; no default backend writes or migration 007 application occurred. Existing untracked `playwright.guild.config.ts` remains parent-owned integration work.

## Deliverable

Only repository file created by this review: `docs/reviews/today-guild-quality.md`. Temporary reproduction source/config and JSON outputs are under `/private/tmp/today-guild-quality-race/` and `/tmp/today-guild-quality-*.json`. Production changes were neither made nor committed.
