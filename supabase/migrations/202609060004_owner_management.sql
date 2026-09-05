begin;
-- Deleting unused invites uses the same tuple lock as redeem_invite FOR UPDATE.
create function public.list_pending_invites(p_guild uuid)
returns table(id uuid,guild_id uuid,expires_at timestamptz,created_by uuid)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not is_guild_owner(p_guild) then raise exception 'Owner required' using errcode='42501'; end if;
 return query select i.id,i.guild_id,i.expires_at,i.created_by from guild_invites i
 where i.guild_id=p_guild and i.redeemed_by is null and i.expires_at>clock_timestamp()
 order by i.expires_at,i.id;
end $$;
create function public.revoke_invite(p_guild uuid,p_invite uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not is_guild_owner(p_guild) then raise exception 'Owner required' using errcode='42501'; end if;
 delete from guild_invites where id=p_invite and guild_id=p_guild and redeemed_by is null;
 if not found then return false; end if;
 insert into guild_activity(guild_id,actor,kind) values(p_guild,auth.uid(),'invite_revoked');
 return true;
end $$;
create function public.remove_member(p_guild uuid,p_user uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare target_role text;
begin
 if not is_guild_owner(p_guild) then raise exception 'Owner required' using errcode='42501'; end if;
 select role into target_role from guild_members where guild_id=p_guild and user_id=p_user for update;
 if not found then return false; end if;
 if target_role='owner' then raise exception 'Cannot remove owner' using errcode='42501'; end if;
 -- Membership lock precedes task locks, matching mutate_task. Active claims only;
 -- completed assignments remain historical attribution, never arbitrary reassignment.
 with released as (
 update guild_tasks set assignee=null,status='open',revision=revision+1,updated_at=clock_timestamp()
 where guild_id=p_guild and assignee=p_user and status in ('open','doing','blocked') returning id
 ) insert into guild_activity(guild_id,actor,kind,task_id)
 select p_guild,auth.uid(),'claim_released',id from released;
 delete from guild_members where guild_id=p_guild and user_id=p_user;
 insert into guild_activity(guild_id,actor,kind) values(p_guild,auth.uid(),'member_removed');
 return true;
end $$;
create function public.rename_guild(p_guild uuid,p_name text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not is_guild_owner(p_guild) then raise exception 'Owner required' using errcode='42501'; end if;
 update guilds set name=trim(p_name) where id=p_guild;
 insert into guild_activity(guild_id,actor,kind) values(p_guild,auth.uid(),'guild_renamed');
end $$;
create or replace function public.mutate_task(p_guild uuid,p_action text,p_task uuid,p_revision integer,p_title text,p_status text,p_source text,p_checksum text,p_key uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t guild_tasks; previous guild_requests; payload jsonb; result jsonb;begin
 -- Hold membership until commit; removal takes FOR UPDATE on this same row.
 perform 1 from guild_members where guild_id=p_guild and user_id=auth.uid() for share;
 if not found then raise exception 'Membership required' using errcode='42501';end if;
 if p_key is null then raise exception 'Idempotency key required';end if;
 payload:=jsonb_build_array(p_guild,p_action,p_task,p_revision,p_title,p_status,p_source,p_checksum);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_key::text,0));
 select * into previous from guild_requests where actor=auth.uid() and key=p_key;
 if found then if previous.payload<>payload then raise exception 'Idempotency key payload mismatch';end if;return previous.result;end if;
 if p_action='create' then
 insert into guild_tasks(guild_id,title,source_id,snapshot_checksum,created_by) values(p_guild,p_title,p_source,p_checksum,auth.uid()) returning * into t;
 elsif p_action in ('claim','update') then
 select * into t from guild_tasks where id=p_task and guild_id=p_guild for update;
 if not found then raise exception 'Task not found';end if;
 if p_revision is null or t.revision<>p_revision then raise exception 'Revision conflict' using errcode='PT409';end if;
 if p_action='claim' then
 if t.assignee is not null or t.status='done' then raise exception 'Task already claimed or done' using errcode='PT409';end if;
 update guild_tasks set assignee=auth.uid(),status='doing',revision=revision+1,updated_at=clock_timestamp() where id=t.id returning * into t;
 else
 if not is_guild_owner(p_guild) and t.assignee is distinct from auth.uid() then raise exception 'Only owner or assignee can update' using errcode='42501';end if;
 update guild_tasks set title=coalesce(p_title,title),status=coalesce(p_status,status),revision=revision+1,updated_at=clock_timestamp() where id=t.id returning * into t;
 end if;
 else raise exception 'Unknown operation';end if;
 insert into guild_activity(guild_id,actor,kind,task_id) values(p_guild,auth.uid(),p_action,t.id);
 result:=to_jsonb(t);insert into guild_requests values(auth.uid(),p_key,payload,result);return result;
end $$;
revoke execute on function public.list_pending_invites(uuid),public.revoke_invite(uuid,uuid),public.remove_member(uuid,uuid),public.rename_guild(uuid,text) from public,anon;
grant execute on function public.list_pending_invites(uuid),public.revoke_invite(uuid,uuid),public.remove_member(uuid,uuid),public.rename_guild(uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;
