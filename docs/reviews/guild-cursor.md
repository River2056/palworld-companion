# Guild digest commit-safe cursor

## Outcome

`202609060006_activity_cursor.sql` replaces timestamp unread filtering with a transactional, monotonic per-guild cursor. Every activity insert receives `activity_cursor` from a private counter row through a `BEFORE INSERT` trigger. The row lock is held until transaction end: a second writer in the same guild cannot obtain/commit a higher cursor before the first writer commits or rolls back. Other guilds have independent counters.

An identity sequence alone is insufficient: IDs can be reserved before a competing transaction commits. Timestamps also cannot encode visibility/commit order, including equal timestamps and transactions committing an older timestamp later.

`guild_digest(uuid)` now filters `activity_cursor > last_seen_cursor` and orders by cursor. `mark_seen(uuid,bigint)` retains its existing **activity ID** argument, validates the ID belongs to the guild, resolves its cursor, and advances the member watermark with `greatest`. Callers must acknowledge the **last returned event**, not `max(id)`; the current workspace already does this. `created_at` and member `last_seen` remain for compatibility/display, not unread correctness.

## Migration / security

- Activity writes are locked during backfill. Existing history gets deterministic per-guild cursors ordered by ID.
- Every existing member starts at cursor zero. This intentionally replays history once: a timestamp watermark cannot safely reconstruct a seen prefix after historical late commits. No events are silently discarded during cutover.
- New guild counter rows are created lazily by the trigger; all existing/future activity producers are covered without replacing task/member RPCs or their membership locks.
- Counter table has RLS, no client grants, and no direct trigger-function execution grants. Existing digest/acknowledgement membership checks and RPC privileges are preserved.
- Same-guild activity-producing transactions serialize at allocation. Avoid long transactions after activity insertion. Multi-guild writes should acquire counters in consistent guild order to avoid deadlocks; current RPCs are single-guild.

## Deterministic verification

Run against the existing local PostgreSQL container:

```sh
node scripts/guild/cursor-integration.mjs
npx eslint scripts/guild/cursor-integration.mjs
```

Optional `GUILD_DB_CONTAINER` changes the container name. The script creates a uniquely named scratch database, applies the entire sorted migration stack, and drops only that database in `finally`. It does not migrate or reset the application's live database. It uses real PostgreSQL connections and authenticated SQL role/claims with a minimal `auth.users`/`auth.uid` fixture; it does not claim GoTrue or HTTP coverage.

The concurrency test does not rely on sleeps to establish ordering: independent psql connections hold explicit transactions; `pg_blocking_pids` must show the second writer blocked by the first before the first may commit. Bounded polling only observes that lock barrier.

Verified assertions:

- Populated pre-cursor migration backfill and conservative historical replay.
- Preallocated lower identity commits after a higher ID was acknowledged, with an older timestamp, and remains unread.
- Same-guild second allocation actually blocks until first transaction ends.
- An unrelated guild can write while that lock is held.
- Uncommitted activity is invisible while acknowledgement of an earlier event succeeds.
- First transaction can be read/acknowledged while second remains uncommitted; the second event, with the exact same timestamp, appears after its commit.
- Older acknowledgement does not regress the cursor.
- Rollback also rolls back allocation; the subsequent older-timestamp event remains readable.
- Cross-guild activity IDs are rejected, and clients cannot update counters or execute the trigger directly.

Execution: integration passed twice consecutively after adding the legacy-backfill assertions; ESLint reported `No issues found`; `git diff --check` passed. The expected base-stack notice is `function public.mark_seen(uuid) does not exist, skipping`.

## Remaining deployment step

The additive migration was exercised in scratch databases only. Apply it through the normal migration path to the live/local application database before relying on the new digest semantics. No frontend change is required for the existing last-returned-event acknowledgement.
