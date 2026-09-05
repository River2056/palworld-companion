# Owner management increment

## Public API contract (migration 004)

All RPCs require an authenticated user; actor is derived from `auth.uid()`.

- `list_pending_invites(p_guild uuid)` → rows `{id, guild_id, expires_at, created_by}`. Owner only. No token or hash; excludes used/expired invites.
- `revoke_invite(p_guild uuid, p_invite uuid)` → boolean. Owner only; deletes an unused invite in that guild, true if deleted, false if absent/already used/revoked. A committed successful revoke prevents redemption.
- `remove_member(p_guild uuid, p_user uuid)` → boolean. Owner only; removes a nonowner, true if removed, false if absent. Removing any owner (including self) is forbidden. Releases active claims to `assignee=null,status=open`, increments revision and emits `claim_released` per task plus `member_removed`.
- `rename_guild(p_guild uuid, p_name text)` → void. Owner only; trimmed name, 1–100 characters via existing constraint; emits `guild_renamed`.
- List members through existing RLS: `GET guild_members?guild_id=eq.<uuid>` (member-readable, outsider-hidden).

No direct table-write permissions are added. No optional leave endpoint. Migration also strengthens task mutation with a membership row lock so removal cannot race with a new claim or mutation by that member.

Startup integration: parent must make local.mjs apply sorted migrations, not just 001. This worker only owns migration 004, owner-integration.mjs, and this report; existing local data must not be reset.

## Verification completed

- Applied 004 to the existing local database through `podman exec -i pw-guild-local-db psql -U postgres -v ON_ERROR_STOP=1`, without restart/reset or credential output. Existing data preserved; tests create isolated UUID-named accounts/guilds.
- `node scripts/guild/owner-integration.mjs`: PASS real GoTrue owner/member/outsider/anonymous permissions, hidden hashes, successful committed revoke prevents redemption, five concurrent revoke/redeem races, cross-guild denial, rename rights/validation, owner protection, removal hides RLS data and denies RPCs/retries, claim release revision/activity, direct-write denial, and five concurrent remove/claim races.
- `node scripts/guild/integration.mjs`: PASS existing real integration suite.
- `npx eslint scripts/guild/owner-integration.mjs --max-warnings 0`: PASS.
- Test correction: anonymous denied RPC is HTTP 401 (authenticated denial is 403); empty PATCH is a PostgREST no-op, so write-denial tests now send actual protected field changes.

## Concurrent migration coordination

004 was applied before the other worker applied 005. The first integrated remove/claim race exposed 005 replacing the membership lock. The task worker has now preserved `FOR SHARE` membership locks in both 005 mutation RPCs (confirmed from its source). For live verification this worker read `pg_proc` (only 15-argument `mutate_task`, 5-argument `set_shared_stock`) and replaced their definitions preserving those signatures, adding the same membership locks; no old 9-argument overload was recreated. Tests above passed against live 004+005 after this correction. The 004 remove function was also updated live to release only `open/doing/blocked` tasks, preserving closed `done/cancelled` history. Parent should rerun final integrated checks after all concurrent edits and ensure sorted startup application 001→005.

This is the owner-management increment, not a claim that all independent-review specification gaps are closed.
