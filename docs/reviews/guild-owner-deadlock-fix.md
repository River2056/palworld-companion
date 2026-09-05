# Guild owner activity: reproduced deadlock and verified fix

## Outcome

The quality review's guild-row/cursor inversion was reproduced against the original migration 007 **before changing its source**, using real PostgreSQL transactions and authenticated `rename_guild` / existing-task `mutate_task` calls. PostgreSQL returned SQLSTATE `40P01`. Changing only rename's snapshot lock to `FOR NO KEY UPDATE` permits both calls to commit, preserves exact before/after rows, and still serializes overlapping renames.

All five backend integration suites were independently executed successfully on a fresh, uniquely named seven-migration backend. This is a bounded backend verification, not a whole-product/UI acceptance claim.

## Deterministic regression

`scripts/guild/owner-deadlock-integration.mjs` requires an explicit non-default `GUILD_DB_CONTAINER`. It creates a UUID-named scratch database, installs all repository migrations and a minimal `auth.uid` fixture, and sets the authenticated role and claims for application RPCs. It does not add timing hooks to migrations or the stack's application database.

A scratch-only BEFORE UPDATE trigger on `guilds` waits on a controller transaction's advisory lock **after rename has acquired its snapshot row lock**. All ordering barriers poll `pg_blocking_pids`; polling delays are not used as evidence that a lock was acquired.

Observed red barriers:

1. Rename A waits on the controller advisory lock, after acquiring the guild snapshot `FOR UPDATE` lock.
2. Existing-task update B waits on A during activity insertion: activity's guild FK requests `FOR KEY SHARE`, which conflicts with A's guild `FOR UPDATE`.
3. A third session's `SELECT ... FROM guild_activity_counters ... FOR UPDATE` waits on B. This independently establishes that B already holds the counter row, rather than merely assuming trigger ordering. The probe is cancelled and rolled back.
4. Releasing the advisory barrier lets A continue to activity insertion; A is observed waiting on B's counter. Together with step 2, this proves the cycle.
5. PostgreSQL returns `40P01`; explicit rollback of both test transactions restores exact original guild/task rows and baseline-only history.

Actual red output, before the source fix (exit 0 means the expected negative control was established):

```text
BARRIER rename holds guild snapshot lock and waits at BEFORE UPDATE barrier: dependency observed
BARRIER task activity FK KEY SHARE waits on rename guild UPDATE: dependency observed
BARRIER counter row is held by task transaction: dependency observed
BARRIER rename activity waits on task counter: dependency observed
RED CONFIRMED 40P01: guild UPDATE -> counter / counter -> guild KEY SHARE; full rollback
CLEANUP scratch database absence verified
```

The exact lock graph is **A: guild UPDATE → counter UPDATE; B: counter UPDATE → guild KEY SHARE**. PostgreSQL may expose the blocking dependency as a transaction-ID wait; `pg_blocking_pids` establishes the owning backend, and the counter probe establishes the specific counter row independently.

The fixed/default run uses repository migration SQL unchanged. B completes its RPC while A remains paused, retains its uncommitted counter lock, and is independently probed. Releasing A's barrier makes A wait only on B; committing B then lets A finish. Assertions cover:

- Both authenticated RPCs succeed and commit.
- Full task before/after JSON matches original and committed task rows.
- Full guild before/after JSON matches original and committed guild rows.
- Only guild `name` changes; id and creation time remain identical.
- Digest order is baseline, task update, rename, with exact cursors 1, 2, 3.
- A further overlapping rename pair exhibits a real row-lock dependency; the second event's before row equals the first rename's committed after row, with exact cursors 4 and 5.
- Acknowledging the last committed event empties the digest.

Catalog guards establish that `name` is absent from unique indexes and that there are no application guild triggers before installing the scratch barrier. Migration 007's business UPDATE changes only `name`; it therefore does not need a key-changing UPDATE lock. `NO KEY UPDATE` still excludes other name updates and deletion while remaining compatible with the FK's `KEY SHARE`. No snapshot lock was removed and no event/cursor ordering was changed.

## Reproduction commands

Use your own isolated stack prefix and free loopback ports. The exact stack used here was `pw-deadlock-verify-6047`, auth 56471 / REST 56472. It was destroyed after verification.

```sh
GUILD_LOCAL_PREFIX=pw-deadlock-verify-6047 GUILD_AUTH_PORT=56471 GUILD_REST_PORT=56472 node scripts/guild/local.mjs start
GUILD_DB_CONTAINER=pw-deadlock-verify-6047-db node scripts/guild/owner-deadlock-integration.mjs --expect-deadlock
GUILD_DB_CONTAINER=pw-deadlock-verify-6047-db node scripts/guild/owner-deadlock-integration.mjs
```

`--expect-deadlock` restores the historical strong lock **only in the scratch migration input**, so the red control remains reproducible after the fix. The initial reproduction ran before source editing; the final red-control mode was also rerun successfully. Default mode never rewrites migration input and fails if the current migration regresses.

`owner-activity-integration.mjs` now invokes the default deterministic test against `${GUILD_LOCAL_PREFIX}-db`. Thus existing lifecycle execution of the owner-activity suite includes the regression without editing the parent-owned lifecycle runner.

## Independent live verification

After changing source 007, the disposable backend containing the old migration was destroyed and recreated, rather than bypassing its checksum ledger. Fresh start applied migrations 001–007. Actual results, all exit 0:

| Suite | Verified result |
| --- | --- |
| owner-activity | Exact owner snapshots, safe invite history, active releases/closed attribution, authorization, immutable history, cursor digest, plus new deterministic lock regression |
| owner | Permissions, pending-invite security, revoke/redeem races, remove/claim races, revision and membership revocation |
| standard (`integration.mjs`) | Real GoTrue signup, RLS, invite/claim races, retries, revisions, protected writes and digest/watermark |
| details | Task bounds, source dedup/reconfirmation, readable snapshots, stock CAS race/idempotency/RLS |
| cursor | Full migrations, same-guild lock barrier, independent guild, late lower IDs/older/equal timestamps, in-flight invisibility, rollback, monotonic acknowledgement and counter grants |

The final owner-activity suite (including the final regression's optional negative-control support) was rerun successfully. `node --check` for both touched integration scripts and `git diff --check` passed. Self-review checked the scoped diff and failure/cleanup path. No additional lock cycle surfaced in these executions; this is not a proof of global deadlock freedom. Independent final code review remains the parent reviewer's responsibility.

## Cleanup and scope

Each regression run dropped its exact scratch database with FORCE and read `pg_database` back to assert absence. Final isolated-stack destruction was followed by `podman ... exists` checks: its db/auth/rest containers, data volume and network were absent; its saved configuration/credentials directory was absent. Before/after default legacy stack inspection matched byte-for-byte for container IDs, start times and status. The default legacy stack was not modified, restarted or migrated. No credentials were printed.

Only migration 007, the owner-activity integration suite, the new owner-deadlock regression and this report are part of this change. Source 007 is amended because the parent established it is unshipped and had only been applied to removed disposable stacks; no git commit is amended. Existing unrelated worktree changes are excluded from the commit.
