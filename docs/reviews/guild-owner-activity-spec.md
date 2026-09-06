# Migration 007 owner activity — independent specification/security review

## Specification verdict: PASS for the scoped backend contract

Reviewed `f4a6cb9`, specifically `supabase/migrations/202609060007_owner_activity.sql` and `scripts/guild/owner-activity-integration.mjs`, against migrations 001–006 and the requirement that owner activity retain exact changes, actor and time. The broader plan requires activity to reflect the exact change and actor (`docs/plans/palworld-companion-plan.md:207`). This is **not** an overall application-quality or full Guild acceptance verdict.

No blocking specification or security defect was identified in migration 007. Invite snapshots intentionally represent exact **public metadata**, not complete secret-bearing database rows. Event time is the existing server-authored top-level `created_at`, not a separately invented timestamp in `details`, and not a claim of commit-time ordering.

### Requirement-by-requirement evidence

Paths abbreviated below: **007** = `supabase/migrations/202609060007_owner_activity.sql`; **suite** = `scripts/guild/owner-activity-integration.mjs`.

| Requirement | Result and source evidence |
| --- | --- |
| Rename exact before/after | **PASS.** 007:8–12 locks the guild before reading it, uses `UPDATE … RETURNING` for the new row and inserts both snapshots transactionally. Trimming and existing name constraints remain. Suite:24–30 compares full snapshots with real table reads. |
| Invite creation/revocation | **PASS.** 007:23–26 records null → allowlisted inserted metadata; :35–38 records deleted metadata → null. Both use the actual returned row. The explicit keys are only `id`, `guild_id`, `expires_at`, `created_by`, matching 004:3–10. Suite:33–47 compares creation/revocation to the pending-invite RPC and checks no duplicate revoke event. |
| Removed membership | **PASS.** 007:46–48 captures the exact locked membership, prohibits owner removal and returns false for absence; :65–67 deletes it and records row → null. Includes the 006 `last_seen_cursor` column through the composite row. Suite:58–63 compares full membership snapshots. |
| Released claims | **PASS.** 007:55–63 locks all assignments before inserting any activity, then captures each active task before its update and obtains the after row from `RETURNING`. Only open/doing/blocked claims are released, with assignee null, status open, revision increment and server update time. Done/cancelled assignments remain unchanged. Suite:50–74 verifies all five statuses, full snapshots, quantities/details retained, and release cursors preceding removal. |
| Authenticated actor and server time | **PASS.** All five event kinds explicitly derive both event actor and details actor from `auth.uid()` (007:11–12,25–26,37–38,62–67). RPCs accept neither actor nor event time. All inserts inherit `guild_activity.created_at DEFAULT clock_timestamp()` from 001:7. Suite:100–104 checks owner identity and parseable timestamps for every new owner event kind. |
| Immutable, readable history | **PASS.** Snapshots are stored JSON values, not joins back to mutable rows. Existing activity grants/RLS remain intact (001:15,20,72–75); 007 makes no table/policy changes. Suite:78–99 verifies removed-member/outsider isolation, denied writes with readback, and unchanged history after rename/rejoin. |
| No automatic invite/credential disclosure | **PASS for the current schema and generated fields.** Invite history never serializes `i` wholesale; raw token is only the authorized create return value and `token_hash` stays in the private invite table. Summaries do not interpolate tokens. Suite:106–111 checks token/hash absence, and independent live checks additionally found no generated stack JWT secret, database password or anonymous JWT anywhere in stored activity. |

## Preservation of migrations 004–006

- **RPC compatibility:** 007:4,16,29,41 preserves names, parameter names/types and returns: `rename_guild(uuid,text) → void`, `create_invite(uuid,integer DEFAULT 24) → text`, `revoke_invite(uuid,uuid) → boolean`, `remove_member(uuid,uuid) → boolean`. Expiry bounds/null rejection, cryptographic token generation and hashing match 001:26–30. Explicit execute grants remain authenticated-only (007:70–72).
- **Membership lock barrier:** 007 retains target membership `FOR UPDATE` before task locks, matching 004:25–35. It does not replace `mutate_task` or `set_shared_stock`; both 005:35 and :82 `FOR SHARE` checks still precede retry-cache access. Live `pg_proc` independently confirmed both bodies retain those locks, only the 15-argument task RPC exists, and stock remains five arguments.
- **Invite races and retries:** 007:35 preserves the same guild-scoped, unredeemed `DELETE` predicate as 004:16, adding only `RETURNING`. It still competes with redemption's tuple `FOR UPDATE` (001:33–38). Repeated revoke/remove returns false without new activity; repeated rename/create is not newly advertised as idempotent. Task/stock advisory locks, request payload matching, revision checks and cached returns in 005 are untouched.
- **Cursor safety:** 007 neither supplies `activity_cursor` nor changes the 006 counter, trigger, digest or acknowledgment RPC. Claim release acquires all affected task locks in deterministic ID order before its first event counter lock (007:51–58), including closed assignments so an overlapping owner reopening cannot slip between the lock and release passes. The unchanged trigger supplies each event cursor transactionally (006:24–34). Live catalog checks confirmed the trigger is enabled and the activity table still has RLS with no authenticated INSERT/UPDATE/DELETE privilege.
- **Definer boundary:** All replaced functions retain `SECURITY DEFINER SET search_path=public,pg_temp` and owner checks. Catalog readback confirmed authenticated execute and denied anonymous execute on these four RPCs and both task/stock RPCs. Migration 007 grants no access to private invites, request cache or cursor counters.

## Independently executed verification

These are this reviewer's executions, **not** repetition of the implementation report's claimed runs. A new stack was created using the current lifecycle helper; default/legacy services were never started, migrated, stopped or destroyed.

```sh
GUILD_LOCAL_PREFIX=pw-spec-007-review GUILD_AUTH_PORT=55931 GUILD_REST_PORT=55932 node scripts/guild/local.mjs start
GUILD_LOCAL_PREFIX=pw-spec-007-review node scripts/guild/owner-activity-integration.mjs
GUILD_LOCAL_PREFIX=pw-spec-007-review node scripts/guild/owner-integration.mjs
GUILD_LOCAL_PREFIX=pw-spec-007-review node scripts/guild/details-integration.mjs
GUILD_LOCAL_PREFIX=pw-spec-007-review node scripts/guild/integration.mjs
GUILD_DB_CONTAINER=pw-spec-007-review-db node scripts/guild/cursor-integration.mjs
node --check scripts/guild/owner-activity-integration.mjs
git diff --exit-code f4a6cb9 -- supabase/migrations/202609060007_owner_activity.sql scripts/guild/owner-activity-integration.mjs
git diff --check f4a6cb9^ f4a6cb9
```

Results:

- Fresh startup applied migrations 001–007 and returned `READY pw-spec-007-review: 7 migrations; only 127.0.0.1 bindings.`
- Owner-activity suite passed exact rename/invite/member/task snapshots, three active releases and two preserved closed assignments, failed/no-op history stability, actor/time checks, secret exclusion, RLS, immutable history and cursor digest acknowledgment.
- Existing owner suite passed permissions, five revoke/redemption races, five removal/claim races, owner protection, removed-member retry denial and protected writes.
- Details suite passed quantities/delivery constraints, source deduplication/checksum reconfirmation, stock CAS race/idempotency/RLS and readable immutable snapshots.
- Core integration passed real GoTrue signup, opt-in, invite/claim races, payload idempotency, stale revisions, RLS, actor attribution, expiry and watermark protections.
- Cursor suite passed a real same-guild lock barrier, independent guild progress, late lower-ID/older-timestamp insertion, equal timestamps, invisible in-flight writes, monotonic acknowledgment, rollback, cross-guild rejection and private counter grants. It creates/drops its scratch database only inside this review's database container. The notice about the absent old `mark_seen(uuid)` overload is expected, not a test failure.
- Independent additional read-only SQL/Python assertions verified live RPC argument counts, definer/search-path/grant metadata, both membership locks, enabled cursor trigger, activity RLS/write denial, and absence of the generated stack secrets from all activity. No secret values were printed or saved in this report.
- Node syntax, committed-file equality and commit whitespace checks passed. Scoped ESLint was **not independently rerun**.

Cleanup executed with `GUILD_LOCAL_PREFIX=pw-spec-007-review node scripts/guild/local.mjs destroy --confirm-destroy`. Readback asserted all three named containers, the named volume, network and saved configuration directory were absent. No application/test/migration source was edited by this reviewer.

## Evidence limits and nonblocking test gaps

1. **Timestamp test strength:** suite:102 accepts any parseable time; it does not bound timestamps around each RPC or test caller clock skew. Server authorship is established by SQL/default/grant inspection, not that assertion alone. `created_at` is insertion time; use the 006 cursor, not timestamps, for unread ordering.
2. **Concurrency snapshot coverage:** suite:24–74 proves exact snapshots in sequential operations. `owner-integration.mjs:43–53,88–98` exercises real concurrent requests and final-state invariants, but does not force a deterministic row-lock barrier and compare exact competing-update snapshots. The cursor suite's barrier tests cursor ordering, not concurrent rename or owner-reopen versus removal. Source lock analysis supports the scoped PASS; a dedicated barrier regression for those paths would strengthen it.
3. **Secret checks are bounded:** suite:107's keyword scan is a fixture heuristic, not arbitrary-content sanitization. Guild names and task text are user-controlled and intentionally retained exactly. If a user pastes a credential into ordinary text it will appear in its snapshot; the reviewed requirement is that internal invite/auth/service fields are not automatically leaked. Current guild/member/task schemas contain no service credentials. Future sensitive columns require review before retaining whole-row JSON for those entities.
4. **UI is separate:** the implementer's `docs/reviews/guild-owner-activity.md:57` warned about before-only events. The concurrently edited `src/features/guild/GuildWorkspace.tsx:187` now checks `before != null || after != null`, so that specific old renderer condition is not a current source finding. No browser/UI acceptance was performed here.
5. **Working-tree provenance:** migration 006 and several regression/lifecycle files were already untracked or modified at review start. Runtime evidence is for the current full 001–007 working tree; Git equality checks independently confirmed the reviewed 007 migration and new suite match `f4a6cb9`. The implementer's historical red→green runs and prior cleanup remain their claims, not independently reproduced history.

Only `docs/reviews/guild-owner-activity-spec.md` is created by this review. No blocking execution issue was encountered.
