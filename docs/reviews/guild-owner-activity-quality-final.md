# Guild owner activity — final independent quality review

## Verdict: APPROVED

Reviewed fix `063e3d8c07670d8b93b499da13a13e7a36ae0630` against its parent, the actual current migration dependencies, and the deterministic regression. **The important deadlock finding and CHANGES REQUIRED verdict in `guild-owner-activity-quality.md` are superseded for this scoped owner-activity change.** The defect is fixed, and this reviewer independently reproduced the historical failure and verified the corrected interleaving against real PostgreSQL. No remaining blocking finding was identified in this scope.

This is not whole-app acceptance or a proof of global deadlock freedom. The prior review's other scoped quality conclusions remain applicable; this review focuses on closing its concrete lock-inversion finding.

## Source findings

### [GOOD] Correct lock strength for the current guild schema

**Files:** `supabase/migrations/202609060007_owner_activity.sql:8–14`; `supabase/migrations/202609060001_guild.sql:3,7`; `supabase/migrations/202609060006_activity_cursor.sql:24–34`.

```sql
select * into old_guild from guilds where id=p_guild for no key update;
update guilds set name=trim(p_name) where id=p_guild returning * into new_guild;
```

The guild's key is `id`; `name` is an ordinary checked text column, not a unique key. The UPDATE changes only `name`, so it does not require a key-changing row lock. `NO KEY UPDATE` excludes other renames and deletion while permitting the `KEY SHARE` required by activity foreign-key validation. This removes the reported guild/counter cycle without discarding the snapshot lock, moving activity ahead of the business operation, or weakening owner authorization. Full before/after rows are still written in the same transaction.

The regression also checks the installed catalog for unique indexes involving `name` and for pre-existing noninternal guild triggers before installing its test trigger (`owner-deadlock-integration.mjs:46–50`). This supports the current-schema premise; future key/trigger/schema changes still need review.

### [GOOD] Deterministic reproduction establishes both lock dependencies

**File:** `scripts/guild/owner-deadlock-integration.mjs:22–25,50–72`.

The scratch BEFORE UPDATE trigger pauses the actual authenticated rename RPC after its explicit snapshot lock. The controller's advisory lock establishes that pause. The negative control observes task B blocked by rename A, then independently probes the counter row and observes the probe blocked by B. After controller release, A is observed blocked by B and PostgreSQL returns `40P01`. Both transactions are rolled back and original guild/task rows plus baseline-only digest are checked.

This is not a sleep-based race: each ordering claim requires `pg_blocking_pids` to identify the expected holder. Poll intervals and deadlines bound observation; they do not substitute for lock acquisition evidence. The counter probe is cancelled and rolled back before the cycle is released.

### [GOOD] Green path verifies successful operations, not merely absence of an error

**File:** `scripts/guild/owner-deadlock-integration.mjs:60–65,74–90`.

With unchanged repository migration SQL, B finishes its RPC while A is still paused, retaining its counter lock. The counter probe confirms B owns that row; releasing A creates the expected one-way wait, and committing B allows A to commit. Assertions compare complete task and guild event snapshots to original/committed rows, confirm non-name guild fields are unchanged, and require event kinds and cursors `[1,2,3]` in digest order.

A second, genuinely overlapping rename pair must exhibit a B-to-A row-lock dependency. The second rename's before snapshot must equal the first rename's committed after snapshot; full snapshots and cursors `[1,2,3,4,5]` are checked. Acknowledging the last event empties the digest.

### [GOOD] Scratch-only negative control and automatic regression gate

**Files:** `scripts/guild/owner-deadlock-integration.mjs:7–14,32–44,93–97`; `scripts/guild/owner-activity-integration.mjs:7–10,118–119`.

An explicit non-default container name is mandatory. Each run generates a UUID database name. All fixtures, migrations, SQL sessions and temporary trigger/function installation target that database explicitly with `psql -d`; only CREATE/DROP DATABASE and the absence check use the maintenance database. The negative control changes a migration string in memory before applying it to the scratch database. It neither writes source nor replaces functions in the default/application database. Current migration inputs contain no cross-database connection escape.

The finally block closes sessions, force-drops the exact generated database and queries `pg_database` to verify absence. This is normal/finally cleanup, not a guarantee under process kill or infrastructure loss. The explicit container guard is a targeting safeguard, not an independent proof that any arbitrary user-supplied non-default container is disposable; this review used a newly created container exclusively.

The ordinary owner-activity suite synchronously invokes the green regression using its validated isolated prefix, explicitly overriding `GUILD_DB_CONTAINER`. Child failure propagates; callers cannot silently switch the child to the negative control through this invocation.

### [GOOD] No secret exposure introduced

The new regression needs no application credentials: it uses fabricated UUID identities and scratch-only authenticated role/claims. Its SQL/output contain no live invite tokens, passwords or JWTs. The fix leaves invite metadata allowlisting and authorization unchanged (`202609060007_owner_activity.sql:16–40,72–74`). Existing owner-activity assertions retain raw-token/hash exclusion checks (`owner-activity-integration.mjs:108–113`). Those fixture checks are not a claim of sanitizing arbitrary user-entered text.

## Independent execution evidence

This reviewer ran the following successfully, rather than relying on the implementation report:

- `git diff --exit-code 063e3d8 --` for migration 007 and both owner-activity/deadlock scripts: reviewed files match the commit, including a repeat check after execution.
- `git diff --check 063e3d8^ 063e3d8`.
- `node --check` for both touched integration scripts.
- Negative-control and green regression modes against a fresh UUID-named `postgres:15-alpine` container with `--network none`, no published ports, and only the required scratch-test roles. No application stack start, migration, credential loading or default-database write was performed.

Actual regression output:

```text
BARRIER rename holds guild snapshot lock and waits at BEFORE UPDATE barrier: dependency observed
BARRIER task activity FK KEY SHARE waits on rename guild UPDATE: dependency observed
BARRIER counter row is held by task transaction: dependency observed
BARRIER rename activity waits on task counter: dependency observed
RED CONFIRMED 40P01: guild UPDATE -> counter / counter -> guild KEY SHARE; full rollback
CLEANUP scratch database absence verified
BARRIER rename holds guild snapshot lock and waits at BEFORE UPDATE barrier: dependency observed
BARRIER counter row is held by task transaction: dependency observed
BARRIER rename activity waits on task counter: dependency observed
BARRIER concurrent rename serializes snapshot: dependency observed
PASS NO KEY UPDATE: both RPCs commit, exact task/guild snapshots, cursor/digest order, serialized concurrent renames, acknowledgement
CLEANUP scratch database absence verified
VERIFIED both modes leave maintenance database functions and database inventory unchanged
VERIFIED isolated container removed; default container IDs/start times/status unchanged
```

In addition to each regression's cleanup check, this reviewer compared the isolated maintenance database's database inventory and public/auth function-definition inventory before and after each mode. Both matched. The disposable container was removed with its anonymous volume and container absence was checked. Before/after read-only inspection of default db/auth/rest container IDs, start times and status matched. No secrets were printed.

The full HTTP owner-activity suite and other backend suites were not rerun by this final reviewer. Automatic regression inclusion is source-verified; direct red/green execution and their SQL/snapshot assertions are independently runtime-verified. The broader suite results in `guild-owner-deadlock-fix.md` remain attributed to their author. Approval assumes the supplied unshipped-migration context; changing already deployed migration checksums would require a deployment-specific migration strategy.

## Review scope and changes

Only `docs/reviews/guild-owner-activity-quality-final.md` was created by this review. No source, existing review, active configuration, default/live database, unrelated worktree file or commit was changed. Existing unrelated modifications were left intact. No tooling blocker was encountered.
