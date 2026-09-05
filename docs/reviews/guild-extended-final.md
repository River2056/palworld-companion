# Independent extended guild review

## Scope and spec review (performed before quality/security)

Reviewed GuildWorkspace, TaskDetails, client, scoped tests, the plan's guild requirements and migrations 004–006. Earlier missing detailed task editing, shared-stock form, owner rename/invite revoke/member removal and task before/after activity UI are implemented. The migration-005 contract is preserved: required/delivered quantities, source requirement identity, checksum reconfirmation, membership-first idempotency, and revision CAS; task completion does not mutate shared stock. Migration-006 digest order is acknowledged using the last returned activity ID, not a numeric maximum.

This is acceptance of the extended guild UI, not blanket signoff of every product requirement. The exact earlier plan called for current-vs-proposed conflict diff/reapply; current UI instead disables stale writes and requires explicit reload/re-entry. Owner-management activity from migration 004 has actor/kind/time but no structured before/after payload. Automatic comparison against a changing local source plan and local-planner publication integration are outside this guild-only review; the guild editor supports explicit checksum reconfirmation. Parent should retain these distinctions in final product claims.

## Quality/security findings and fixes

- Added unconditional actor and task identifiers to activity rows; formerly actors were visible only inside structured task-change details.
- Real mobile Chromium exposed an expanded activity JSON overflow that made the stock-conflict reload button unclickable (pointer interception). Wrapped JSON using pre-wrap/overflow-wrap; the identical browser scenario then passed desktop and mobile.
- Existing conservative privacy behavior is preserved: offline state purges private task/stock/digest state; reconnect does not repopulate it until explicit refresh; removed membership causes subsequent refresh to clear private UI. Task and stock uncertain retries preserve the original payload/key and disable competing writes. Owner-only affordances remain gated, with server authorization authoritative.
- No service credentials or private fixture values were added to tracked files. Accounts are generated randomly through GoTrue signup; test code reads the existing ignored local anonymous-key environment file. Local ephemeral test accounts/guilds remain in the disposable backend.

## Real execution evidence

`GUILD_E2E=1 node node_modules/@playwright/test/cli.js test tests/e2e/guild-extended.spec.ts --workers=1 --output=/tmp/palworld-guild-extended-results --reporter=list`:
**2 passed**, desktop and mobile Chromium, latest successful run 7.9 seconds. Two isolated browser contexts and distinct real GoTrue accounts per project. Only account creation uses API fixtures; guild changes and verification all use the normal UI and subsequent UI refreshes. No request mocks.

Verified: create/rename guild; issue/revoke invite and actual rejected redemption; valid invitation acceptance; non-owner controls hidden; create task with details; requested/delivered edits; changed checksum save blocked until reconfirmation; structured activity before/after; stock revision 1→2; stale member stock write rejected with reload required; explicit fresh revision-3 write; offline private purge and explicit-refresh reconnect; owner member removal and former-member refresh clearing task, description, stock, digest, and guild heading. No browser page errors.

`npm test -- src/features/guild`: **16 tests passed**, four files. `npm run typecheck`, scoped ESLint and `git diff --check`: passed after final fixes. Parent's full-suite/build/backend integration evidence is separate and was not substituted for these browser checks.

An intermediate rerun collided with another agent's test server/artifact activity. The final run uses direct Playwright CLI and a separate output directory; port 5173 was not stopped or modified.
