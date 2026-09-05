begin;
-- Snapshot while holding the row lock, not by re-reading after the mutation.
-- Activity retains its existing read-only grants/RLS and 006 cursor trigger.
create or replace function public.rename_guild(p_guild uuid,p_name text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare old_guild guilds; new_guild guilds;
begin
 if not is_guild_owner(p_guild) then raise exception 'Owner required' using errcode='42501'; end if;
 -- Name is not a key: exclude concurrent renames without blocking activity FK
 -- KEY SHARE after its counter lock (UPDATE would invert guild/counter order).
 select * into old_guild from guilds where id=p_guild for no key update;
 update guilds set name=trim(p_name) where id=p_guild returning * into new_guild;
 insert into guild_activity(guild_id,actor,kind,details) values(p_guild,auth.uid(),'guild_renamed',
 jsonb_build_object('actor',auth.uid(),'before',to_jsonb(old_guild),'after',to_jsonb(new_guild),'summary',format('Guild renamed: %s → %s',old_guild.name,new_guild.name)));
end $$;
-- Explicit allowlist matches list_pending_invites. Never serialize an invite row:
-- neither token_hash nor a future secret column may enter readable history.
create or replace function public.create_invite(p_guild uuid,p_hours integer default 24) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare token text; i guild_invites;
begin
 if not is_guild_owner(p_guild) then raise exception 'Owner required' using errcode='42501';end if;
 if p_hours is null or p_hours<1 or p_hours>168 then raise exception 'Expiry must be 1–168 hours';end if;
 token:=encode(gen_random_bytes(32),'hex');
 insert into guild_invites(guild_id,token_hash,expires_at,created_by)
 values(p_guild,digest(token,'sha256'),clock_timestamp()+make_interval(hours=>p_hours),auth.uid()) returning * into i;
 insert into guild_activity(guild_id,actor,kind,details) values(p_guild,auth.uid(),'invite_issued',
 jsonb_build_object('actor',auth.uid(),'before',null,'after',jsonb_build_object('id',i.id,'guild_id',i.guild_id,'expires_at',i.expires_at,'created_by',i.created_by),'summary','Invite issued'));
 return token;
end $$;
create or replace function public.revoke_invite(p_guild uuid,p_invite uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare i guild_invites;
begin
 if not is_guild_owner(p_guild) then raise exception 'Owner required' using errcode='42501';end if;
 -- DELETE retains the same row lock / redemption race semantics as 004.
 delete from guild_invites where id=p_invite and guild_id=p_guild and redeemed_by is null returning * into i;
 if not found then return false;end if;
 insert into guild_activity(guild_id,actor,kind,details) values(p_guild,auth.uid(),'invite_revoked',
 jsonb_build_object('actor',auth.uid(),'before',jsonb_build_object('id',i.id,'guild_id',i.guild_id,'expires_at',i.expires_at,'created_by',i.created_by),'after',null,'summary','Invite revoked'));
 return true;
end $$;
create or replace function public.remove_member(p_guild uuid,p_user uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare m guild_members; old_task guild_tasks; new_task guild_tasks;
begin
 if not is_guild_owner(p_guild) then raise exception 'Owner required' using errcode='42501';end if;
 select * into m from guild_members where guild_id=p_guild and user_id=p_user for update;
 if not found then return false;end if;
 if m.role='owner' then raise exception 'Cannot remove owner' using errcode='42501';end if;
 -- Membership before tasks, as in 004/005: an overlapping member mutation
 -- completes before this snapshot, or observes revoked membership afterward.
 -- Lock ALL affected tasks before the first activity counter lock; deterministic
 -- task order avoids introducing counter -> task lock inversion between writers.
 -- Include closed assignments in the lock set so an owner cannot reopen one
 -- between the lock pass and release pass. Closed rows are never changed here.
 perform 1 from guild_tasks where guild_id=p_guild and assignee=p_user order by id for update;
 for old_task in
  select * from guild_tasks where guild_id=p_guild and assignee=p_user
  and status in ('open','doing','blocked') order by id for update
 loop
  update guild_tasks set assignee=null,status='open',revision=revision+1,updated_at=clock_timestamp()
  where id=old_task.id returning * into new_task;
  insert into guild_activity(guild_id,actor,kind,task_id,details) values(p_guild,auth.uid(),'claim_released',old_task.id,
  jsonb_build_object('actor',auth.uid(),'before',to_jsonb(old_task),'after',to_jsonb(new_task),'summary',format('Claim released: %s (member %s removed)',old_task.title,p_user)));
 end loop;
 delete from guild_members where guild_id=p_guild and user_id=p_user;
 insert into guild_activity(guild_id,actor,kind,details) values(p_guild,auth.uid(),'member_removed',
 jsonb_build_object('actor',auth.uid(),'before',to_jsonb(m),'after',null,'summary',format('Member removed: %s',p_user)));
 return true;
end $$;
-- CREATE OR REPLACE preserves ACLs; make the existing contract explicit too.
revoke execute on function public.rename_guild(uuid,text),public.create_invite(uuid,integer),public.revoke_invite(uuid,uuid),public.remove_member(uuid,uuid) from public,anon;
grant execute on function public.rename_guild(uuid,text),public.create_invite(uuid,integer),public.revoke_invite(uuid,uuid),public.remove_member(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
