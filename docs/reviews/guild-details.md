# Guild task details API (migration 005)

Contract for UI integration (backend only): `mutate_task` retains its nine existing named parameters and appends optional `p_type text`, `p_description text`, `p_requested bigint`, `p_delivered bigint`, `p_source_requirement text`, `p_reconfirm boolean DEFAULT false`. All other new parameters default NULL (preserve existing on update). New columns: `task_type` (default general), `description` (default empty), `requested_quantity`/`delivered_quantity` (default zero), `source_requirement_id`. Quantity bounds: integer 0..9007199254740991, delivered <= requested. Status: open/doing/done/blocked/cancelled; doing is the legacy claimed/in-progress representation.

Use `p_source` for item/Pal/plan reference and **`p_source_requirement` for the stable originating requirement identity** (e.g. plan UUID + ingredient ID). Legacy `p_source='item:wood'` is not a requirement identity and stays compatible. Active requirement IDs are unique per guild (open/doing/blocked). Duplicate creation with matching checksum returns the existing task without a second event; differing checksum returns HTTP 409 / PT409. To accept a changed plan, update the existing task with current revision, new checksum/quantities, and `p_reconfirm:true`; no silent rewrite. Completed/cancelled historical rows remain. Requirement identity is immutable once assigned.

`set_shared_stock(p_guild uuid,p_item text,p_quantity bigint,p_revision integer,p_key uuid)` sets exact quantity, not a delta. Expected revision 0 creates; subsequent writes require the returned revision. Returns row `{guild_id,item_id,quantity,revision,updated_by,updated_at}`. Member authentication required, actor is server-derived, stale revisions return PT409. Read `guild_shared_stock` using member RLS. No direct writes. Stock changes are independent of task completion and personal browser state.

Both RPCs keep actor/key payload-matching idempotency and serialize retries. Activity `details` stores immutable before/after snapshots plus server actor and readable summary in the same transaction. Existing digest returns these details; legacy events default to `{}`. Existing timestamp-based digest receipt behavior is unchanged: no claim of a late-commit cursor fix.

## Verified execution

- Applied 005 transactionally to the existing local database without reset; initial SQL parse failure rolled back and was corrected before successful application.
- `node scripts/guild/details-integration.mjs` — PASS over real GoTrue/PostgREST: details, JS-safe quantity boundaries, delivered constraints, independent-key concurrent source creation, checksum conflict/reconfirmation, historical rows, cancelled claim denial, stock CAS race/member/anonymous denial/idempotency/RLS, and immutable readable snapshots.
- `node scripts/guild/integration.mjs` — PASS unchanged legacy nine-argument clients, source `item:wood`, claim/idempotency races, revision 409, watermark, owner/assignee permissions, invite and RLS regression.
- Live database readback after reconciliation: exactly `mutate_task|15|t`, `set_shared_stock|5|t` (`t` confirms membership `FOR SHARE` lock in function body); `remove_member` is present. Both suites passed again after this lock update.

### Migration ordering / remaining scope

Apply fresh deployments in sorted order 001–005. 004 replaces the old nine-argument function; 005 drops it and creates the fifteen-argument defaulted replacement. On this already-migrated local database, the 005 function definitions/grants were re-applied with `CREATE OR REPLACE` and `DROP FUNCTION IF EXISTS` for the old signature, **without repeating table alterations or resetting data**. If another worker subsequently applies 004 again, remove its recreated old overload and restore the extended definitions before testing. Both task and stock RPCs retain 004's membership-row lock through commit.

No frontend files changed. UI must send `p_source_requirement` for requirement deduplication and render `details`. No late-commit digest cursor fix or browser offline acceptance claimed. New task/stock mutation events have detailed snapshots; unrelated legacy/owner-management activity events may still have empty details.
