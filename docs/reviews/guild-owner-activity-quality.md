# Guild owner activity — independent quality review

## Verdict: CHANGES REQUIRED — one important correctness finding

Reviewed commit `f4a6cb9716c10cecf74e616bc28a1b528e9498e6` (`f4a6cb9`) independently for SQL correctness, lock interactions, errors, authorization, secret handling and test quality. Scope is migration 007 and its owner-activity integration suite, with migrations 001 and 004–006 and existing owner/cursor tests as dependency context. This is not a whole-product or UI acceptance verdict.

The prior specification PASS and reported fresh-stack success do not cover the lock inversion below. No other critical/important finding was identified in this bounded review.

## [BUG] Important: rename's new `FOR UPDATE` can deadlock with activity foreign-key validation

**Primary file:** `supabase/migrations/202609060007_owner_activity.sql:8–11`

```sql
select * into old_guild from guilds where id=p_guild for update;
update guilds set name=trim(p_name) where id=p_guild returning * into new_guild;
insert into guild_activity(guild_id,actor,kind,details) values(...);
```

**Problem:** The explicit `FOR UPDATE` introduces a stronger guild-row lock than the previous non-key name update in `202609060004_owner_management.sql:44`. It conflicts with the `FOR KEY SHARE` taken when PostgreSQL validates `guild_activity.guild_id REFERENCES guilds` (`202609060001_guild.sql:7`). The activity's **BEFORE INSERT** trigger first acquires the per-guild counter lock (`202609060006_activity_cursor.sql:24–34`); foreign-key validation follows. Keeping counters in a separate table does not eliminate this implicit guild-row lock.

A legal interleaving using two normal authenticated RPC calls on the same existing guild is:

1. **A: rename** obtains the guild row `FOR UPDATE` at 007:8, then is descheduled before inserting its event.
2. **B: update an existing task** obtains membership/advisory/task locks and updates the task via 005:35–71. Updating ordinary task fields does not change its guild foreign key and need not obtain a fresh guild-row lock first.
3. B inserts task activity at 005:75. The 006 BEFORE trigger updates and holds the existing guild counter row. The activity foreign-key check then requests `FOR KEY SHARE` on the guild row and **waits for A**.
4. A inserts rename activity. Its 006 trigger requests the same counter row and **waits for B**.
5. PostgreSQL detects the cycle and aborts a transaction with `40P01`. A valid concurrent rename or task update fails; transaction rollback prevents partial history, but does not make the operation successful.

The relevant cycle is **guild row → counter** versus **counter → guild row**. Deterministic task ordering in `remove_member` does not address it. This finding is derived from the actual SQL and PostgreSQL lock semantics, not a claimed runtime reproduction.

**Recommendation:** Capture the guild snapshot using `FOR NO KEY UPDATE`, retaining exclusion against concurrent name updates/deletion while allowing the activity foreign-key `KEY SHARE` lock:

```sql
select * into old_guild
from guilds
where id=p_guild
for no key update;
```

The following update changes only `name`, not the guild key, so it need not upgrade that lock. Do not remove snapshot locking entirely or move the counter ahead of all business locks without reviewing the resulting lock graph.

**Required regression:** Add a deterministic two-session barrier test in an explicitly isolated scratch database that holds the rename-equivalent guild lock, starts an authenticated existing-task update, observes the dependency, then attempts rename activity. Establish `40P01` for the current lock mode and successful completion with the weaker mode; assert exact snapshots and committed cursor/digest order after the fix. Also retain a concurrent-rename test proving the second rename snapshots the first committed name. No production migration or fixture should contain timing hooks.

**Why existing green suites miss it:** `scripts/guild/owner-activity-integration.mjs:24–30` renames sequentially. Existing owner races cover revoke/redeem and removal/claim (`scripts/guild/owner-integration.mjs:43–53,88–98`), not rename versus activity. The cursor barrier at `scripts/guild/cursor-integration.mjs:43–61` tests counter serialization using direct activity inserts without a concurrent exclusive guild lock.

**PostgreSQL evidence consulted:**

- [Row-lock compatibility and deadlock handling](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS): `FOR UPDATE` conflicts with `FOR KEY SHARE`; `FOR NO KEY UPDATE` does not.
- [Trigger execution order](https://www.postgresql.org/docs/current/trigger-definition.html): row-level BEFORE triggers precede the insert, while AFTER/constraint triggers run afterward.
- [PostgreSQL foreign-key implementation](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/backend/utils/adt/ri_triggers.c#L359-L389): referenced-row existence query explicitly uses `FOR KEY SHARE OF x`. Retrieved source confirmed both the documented query and generated SQL.

## Other scoped quality conclusions

- **Snapshots and error atomicity:** 007:9–12,23–26,35–38,46–67 takes snapshots from locked/returned rows and writes history in the same transaction. Validation failures and unhandled database errors roll back the operation and its counter changes. Absent revoke/removal returns false before inserting an event. Rename/create preserve their prior non-idempotent repeated-call semantics.
- **Invite security:** 007:26,38 uses only `id`, `guild_id`, `expires_at`, `created_by`; neither invite composite JSON nor token/hash interpolation enters history. Token creation, expiry validation and the guild-scoped unredeemed delete predicate remain compatible with 001/004. Security-definer owner checks, explicit search paths and authenticated-only execution grants are retained (007:4–7,16–21,29–33,41–45,70–72). Existing activity RLS and write restrictions are unchanged.
- **Member/task locking:** 007:46–58 locks target membership before tasks and prelocks all assigned tasks in deterministic ID order before the first activity. This is compatible with 005's member `FOR SHARE` barrier and prevents the loop itself from acquiring an unheld assigned-task lock after its first counter lock. Including closed assignments protects the between-pass owner-reopen case. Only active assignments are mutated; completed/cancelled historical attribution remains intact. The membership row is already held when deletion follows release activity.
- **Maintainability:** Explicit allowlisting is appropriate for secret-bearing invites. Whole-row guild/member/task snapshots preserve the current exact-change contract, but future sensitive schema additions need explicit history review. The keyword scan in the integration suite is fixture-level protection, not sanitization of arbitrary user-provided names/titles.
- **Test strengths:** The new suite compares full snapshots, preserves closed assignments, checks failed/no-op history stability, direct-write denial with readback, actor fields, token/hash exclusion, subsequent-history immutability and digest acknowledgment. Its timestamp assertion establishes parseability only; server authorship is supported by the database default and lack of caller-controlled timestamp parameters. These strengths do not establish deadlock freedom.

## Verification and provenance

Independently executed read-only checks, all exit 0:

```sh
git diff --exit-code f4a6cb9 -- supabase/migrations/202609060007_owner_activity.sql scripts/guild/owner-activity-integration.mjs
node --check scripts/guild/owner-activity-integration.mjs
git diff --check f4a6cb9^ f4a6cb9
```

The reviewed migration and new suite match the commit. Git inspection showed unrelated pre-existing modified/untracked files, including untracked migration 006; lock analysis uses the current 006 dependency supplied for this review. Read the independent specification report and actual dependency SQL/test source rather than treating the implementation report as proof.

The parent reports a fresh isolated seven-migration stack and all five integration suites passing, and the specification report records separate live verification. Those executions are supporting evidence, **not executions performed by this quality reviewer**. This review did not rerun infrastructure, execute the proposed deadlock regression, or modify any database. The finding remains a source-established concurrency defect requiring focused runtime regression during correction.

**Files changed by this review:** only `docs/reviews/guild-owner-activity-quality.md`. No source, active configuration, database, commits or unrelated worktree files changed. No tooling blocker encountered.
