# Guild owner activity — implementation evidence

## Scope and contract

Added migration `202609060007_owner_activity.sql` and the real API regression suite `scripts/guild/owner-activity-integration.mjs`. Existing migrations, lifecycle helpers, RLS policies, task RPC/idempotency implementation and cursor trigger are unchanged. This is implementation verification, **not independent review**.

Every new owner event uses the existing `details` contract `{actor, before, after, summary}`, with server-authored top-level `actor`, `kind`, `created_at` and the 006 trigger-assigned `activity_cursor`:

| Kind | Before | After |
| --- | --- | --- |
| `guild_renamed` | Exact locked guild row | Exact updated guild row |
| `invite_issued` | `null` | Explicit public metadata allowlist |
| `invite_revoked` | Same allowlist from deleted row | `null` |
| `member_removed` | Exact locked membership row | `null` |
| `claim_released` | Exact locked task row | Exact updated task row |

Invite metadata contains **only** `id`, `guild_id`, `expires_at`, `created_by`, matching `list_pending_invites`. No whole-invite JSON conversion, raw tokens, token hashes, credentials or secret columns enter activity. Summaries never interpolate tokens. Historical pre-007 events remain unchanged; missing old snapshots cannot be reconstructed reliably.

Signatures, default invite expiry, validation, authorization and return values remain intact. Repeat revoke/removal returns false without activity. Rename keeps its existing repeated-call behavior (including same-name activity); invite creation still issues a new invite per call. Removal retains membership-before-task locking and releases only open/doing/blocked claims; done/cancelled assignments remain historical attribution. All assigned task locks are acquired in deterministic ID order before the activity-counter lock, including closed assignments to prevent concurrent owner reopening between lock/release passes. No activity cursor is manually assigned.

## Real red → green evidence

Used only newly created named stack `pw-owner-activity-007`, loopback Auth/REST ports 55731/55732. Never started, migrated, stopped or destroyed the user's default/legacy stack.

1. Against migrations 001–006, rename test failed: `rename preserves exact prior row` (actual `undefined`). Added locked rename snapshots; test passed.
2. Added invite issue/revoke test; failed: `invite issue produces activity`. Added allowlisted snapshots; tests passed.
3. Added removal/claim-release tests; failed: `removed membership exact before snapshot` (actual `undefined`). Added locked membership/task snapshots; suite passed.

Intermediate development applied 007 directly only inside this disposable stack. Then destroyed **only that test stack** and rebuilt from empty storage using the unchanged lifecycle helper, verifying ledger-based application of every migration 001–007 from scratch.

## Fresh-stack verification

Commands (all returned exit 0):

```sh
GUILD_LOCAL_PREFIX=pw-owner-activity-007 GUILD_AUTH_PORT=55731 GUILD_REST_PORT=55732 node scripts/guild/local.mjs start
GUILD_LOCAL_PREFIX=pw-owner-activity-007 node scripts/guild/owner-activity-integration.mjs
GUILD_LOCAL_PREFIX=pw-owner-activity-007 node scripts/guild/integration.mjs
GUILD_LOCAL_PREFIX=pw-owner-activity-007 node scripts/guild/owner-integration.mjs
GUILD_LOCAL_PREFIX=pw-owner-activity-007 node scripts/guild/details-integration.mjs
GUILD_DB_CONTAINER=pw-owner-activity-007-db node scripts/guild/cursor-integration.mjs
npx eslint scripts/guild/owner-activity-integration.mjs
```

Observed `READY pw-owner-activity-007: 7 migrations; only 127.0.0.1 bindings.`

New suite passed exact rename and invite snapshots; exact membership removal and three active claim-release snapshots; two closed assignments preserved; owner/outsider/removed-member/anonymous authorization; RLS reads; failed-operation and no-op history stability; direct activity write denial and subsequent readback; immutable history after later rename/rejoin; token and SHA-256 exclusion; actor/time; contiguous cursor order and digest acknowledgement.

Existing suites passed real GoTrue auth, opt-in, invite/claim races, owner/assignee permissions, RLS/protected writes, idempotency, stale revisions, watermark behavior, five revoke/redeem races and five removal/claim races, detailed task/stock/quantity/source contracts. Cursor suite passed full migrations, same-guild concurrent lock barrier, independent guild progress, late lower-ID/older timestamp, equal timestamps, invisible in-flight activity, monotonic acknowledgement, rollback, cross-guild rejection and private counter grants.

Scoped ESLint: `ESLint: No issues found`. Scoped diff whitespace check passed.

Cleanup: `GUILD_LOCAL_PREFIX=pw-owner-activity-007 node scripts/guild/local.mjs destroy --confirm-destroy`; verified no matching containers and absent named volume/network. Test config was removed by the helper. No credentials or test databases committed.

## Frontend coordination / remaining acceptance

The existing details renderer uses `details.after != null` to decide whether to show the structured change. **Frontend worker must include before-only events** (`before != null || after != null`) so invite revocation and member removal are expandable. This backend intentionally uses JSON null for absence rather than fabricated deleted rows. Summary, actor and time already fit the existing rendering contract. Browser/UI acceptance belongs to the frontend worker; no claim of browser verification here.
