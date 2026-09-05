begin;
create or replace function public.mutate_task(p_guild uuid,p_action text,p_task uuid,p_revision integer,p_title text,p_status text,p_source text,p_checksum text,p_key uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t guild_tasks; previous guild_requests; payload jsonb; result jsonb;begin
 if not is_guild_member(p_guild) then raise exception 'Membership required' using errcode='42501';end if;
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
notify pgrst, 'reload schema';
commit;
