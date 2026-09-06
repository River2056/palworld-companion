# Guild backend recovery / security review

Status: backend recovery verified locally; frontend not implemented by this worker. No full-guild completion claim.

Scope: `supabase/**`, `scripts/guild/**`, and this requested review. Existing local containers only; no database reset or duplicate startup. Runtime verification results will be appended after execution.

## Source review

Six tables have RLS enabled. Authenticated clients can SELECT only guilds, guild_members, guild_tasks, guild_activity, constrained to membership. Invite hashes and request cache are not client-readable. All mutations are security-definer RPCs with fixed public,pg_temp search paths; PUBLIC/anon execution revoked. Actors and creators come from auth.uid(), never request parameters. Owners alone create invites; authenticated explicit acceptance is required. Invite tokens use 32 random bytes, stored as SHA-256 hashes, with expiry and row locking for single use. Task updates require owner or assignee; claims lock task rows, check revision, and set assignee server-side. Request idempotency is per actor/key, serialized by transaction advisory lock, and rejects changed payloads.

## REST contracts

Use authenticated bearer access token from GoTrue/Supabase Auth. Never use a service-role key in a browser. Local REST base: http://127.0.0.1:55432; local Auth base: http://127.0.0.1:55431. Hosted Supabase REST base is /rest/v1. POST JSON to `rpc/<name>`:

- `create_guild({p_name: text})` → UUID JSON string; creates caller as owner.
- `create_invite({p_guild: uuid, p_hours?: integer = 24})` → one-time plaintext token string. Hours 1–168; owner only. Do not log/persist token outside invite sharing.
- `redeem_invite({p_token: text, p_accept: boolean})` → guild UUID string. Requires true and authenticated nonmember; invalid/expired/used rejected.
- `mutate_task({p_guild: uuid, p_action: 'create'|'claim'|'update', p_task: uuid|null, p_revision: integer|null, p_title: text|null, p_status: 'open'|'doing'|'done'|null, p_source: text|null, p_checksum: text|null, p_key: uuid})` → task object. All parameters required (nullable as shown). Create uses title/source/checksum, revision starts 1, status open. Claim uses task/revision and sets caller as assignee/status doing. Update uses task/revision/title/status, null preserves existing values. Source/checksum immutable after creation. Every successful mutation increments revision except creation. Reuse exact same key+payload for retries; new logical operation gets new UUID. Claim/update require current revision. Irrelevant parameters are ignored by operation but remain part of idempotency payload.
- `guild_digest({p_guild: uuid})` → activity array after caller last_seen, ordered id.
- `mark_seen({p_guild: uuid, p_through_id: bigint})` → void; requires an existing activity ID in this guild and advances caller last_seen monotonically to that observed row timestamp. Pass the last rendered digest activity ID; skip when digest empty. One-argument overload removed deliberately to prevent unsafe blanket acknowledgement.
- `is_guild_member({p_guild: uuid})`, `is_guild_owner({p_guild: uuid})` → caller-specific boolean.

GET table endpoints (standard PostgREST select/filter/order):

- `guilds`: id uuid, name text (trimmed length 1–100), created_at timestamptz. Filter `id=eq.<uuid>`.
- `guild_members`: guild_id uuid, user_id uuid, role owner/member, last_seen timestamptz (initial `-infinity`). Filter `guild_id=eq.<uuid>`.
- `guild_tasks`: id uuid, guild_id uuid, title text (trimmed length 1–200), status open/doing/done, assignee uuid|null, revision integer, source_id text|null (max 200), snapshot_checksum text|null (max 128), created_by uuid, updated_at timestamptz.
- `guild_activity`: id bigint, guild_id uuid, actor uuid, kind text (guild_created/member_joined/create/claim/update), task_id uuid|null, created_at timestamptz.
- `guild_invites` and `guild_requests`: private; no direct client access. No direct writes to any guild table.

Errors: PostgREST JSON `{code, message, details, hint}`. Permission failures use SQLSTATE 42501, revision/claim conflicts PT409 (verified HTTP 409), explicit business errors P0001, constraints standard SQLSTATE. Authenticated permission denial verified HTTP 403. Other business errors use normal PostgREST mapping.

## Known boundaries

No member removal, role transfer, task delete/unclaim, invite revocation/listing, or realtime publication is implemented. Digest is timestamp-based, not an exactly-once inbox: observed-row watermark preserves activity created after the displayed watermark, but an earlier-timestamp transaction committing late can still be missed. Equal-timestamp events are another cursor limitation. Local stack enables email autoconfirm for development only. Deployment to hosted Supabase has not been verified. Source IDs/checksums are opaque client data, not verified against an item catalog.

## Runtime verification

- `npx eslint scripts/guild/*.mjs`: PASS, no issues. Per-file globals and allowed empty catches only; shared lint configuration untouched.
- `node scripts/guild/integration.mjs`: PASS twice consecutively after final test additions, using actual GoTrue signup, PostgREST, PostgreSQL; no fabricated responses.
- Verified: member/owner/outsider reads; anonymous mutation rejection; direct inserts/PATCH/DELETE denied; role escalation denied; invite/request tables private; explicit opt-in; invite single-use concurrent redemption; SHA-256 stored hash (32 bytes), actual expired invite denial; concurrent identical request deduplication and changed-payload denial; one-winner claim race; stale revisions; HTTP 409 conflict; HTTP 403 outsider and unassigned member update denial; valid owner and member-assignee status updates; server-authored creator/activity actors; digest and explicit watermark preserving later activity; null/cross-guild/outsider watermark denial.
- Read back live signatures: `mark_seen(uuid,bigint)` only; `mutate_task(uuid,text,uuid,integer,text,text,text,text,uuid)`. All six guild tables have RLS enabled.
- Existing bindings verified: DB has no published port; Auth 127.0.0.1:55431 and REST 127.0.0.1:55432 only. `.local/config.json` and `.local/auth.env` verified git-ignored.
- Initial integration hung on claim conflicts using SQLSTATE 40001, with aborted REST transactions observed. Replaced application-level conflict code with PostgREST PT409, applied additive migration and restarted existing REST container; full tests then passed. Exact provider retry root cause not conclusively diagnosed.
- Added safe startup guard: reject unknown arguments or an existing named stack before regenerating credential files. Fresh stack startup was not rerun; existing DB was never reset. SQL fixtures only expired the newly generated test invite.

## Changed artifacts

`supabase/migrations/202609060001_guild.sql` (fresh schema), `202609060002_seen_watermark.sql` (existing-stack upgrade), `202609060003_task_conflict.sql` (existing-stack upgrade); `scripts/guild/local.mjs`, `scripts/guild/integration.mjs`, ignored-local directory rule. Apply migrations in order. No frontend files changed by this worker.
