begin;
alter table public.guild_tasks
 add column task_type text not null default 'general' check(length(trim(task_type)) between 1 and 80),
 add column description text not null default '' check(length(description)<=10000),
 add column requested_quantity bigint not null default 0 check(requested_quantity between 0 and 9007199254740991),
 add column delivered_quantity bigint not null default 0 check(delivered_quantity between 0 and 9007199254740991 and delivered_quantity<=requested_quantity),
 add column source_requirement_id text check(length(trim(source_requirement_id)) between 1 and 300);
alter table public.guild_tasks drop constraint guild_tasks_status_check;
alter table public.guild_tasks add constraint guild_tasks_status_check check(status in ('open','doing','done','blocked','cancelled'));
create unique index guild_tasks_active_requirement on public.guild_tasks(guild_id,source_requirement_id) where source_requirement_id is not null and status in ('open','doing','blocked');
alter table public.guild_activity add column details jsonb not null default '{}'::jsonb;
create table public.guild_shared_stock(
 guild_id uuid not null references public.guilds on delete cascade,
 item_id text not null check(length(trim(item_id)) between 1 and 200),
 quantity bigint not null check(quantity between 0 and 9007199254740991),
 revision integer not null default 1,
 updated_by uuid not null,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(guild_id,item_id)
);
alter table public.guild_shared_stock enable row level security;
revoke all on public.guild_shared_stock from public,anon,authenticated;
grant select on public.guild_shared_stock to authenticated;
create policy stock_read on public.guild_shared_stock for select to authenticated using(public.is_guild_member(guild_id));
-- Drop the old overload so PostgREST resolves legacy nine-parameter callers unambiguously.
drop function public.mutate_task(uuid,text,uuid,integer,text,text,text,text,uuid);
create function public.mutate_task(
 p_guild uuid,p_action text,p_task uuid,p_revision integer,p_title text,p_status text,p_source text,p_checksum text,p_key uuid,
 p_type text default null,p_description text default null,p_requested bigint default null,p_delivered bigint default null,
 p_source_requirement text default null,p_reconfirm boolean default false
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t guild_tasks; old_task jsonb; previous guild_requests; payload jsonb; result jsonb; requirement text;
begin
 -- Hold membership until commit; remove_member takes FOR UPDATE on this row.
 perform 1 from guild_members where guild_id=p_guild and user_id=auth.uid() for share;
 if not found then raise exception 'Membership required' using errcode='42501';end if;
 if p_key is null then raise exception 'Idempotency key required';end if;
 payload:=jsonb_build_array(p_guild,p_action,p_task,p_revision,p_title,p_status,p_source,p_checksum);
 -- Preserve payloads of persisted pre-005 retry keys.
 if p_type is not null or p_description is not null or p_requested is not null or p_delivered is not null or p_source_requirement is not null or coalesce(p_reconfirm,false) then
 payload:=payload||jsonb_build_array(p_type,p_description,p_requested,p_delivered,p_source_requirement,coalesce(p_reconfirm,false));end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_key::text,0));
 select * into previous from guild_requests where actor=auth.uid() and key=p_key;
 if found then if previous.payload<>payload then raise exception 'Idempotency key payload mismatch';end if;return previous.result;end if;
 if p_requested<0 or p_requested>9007199254740991 or p_delivered<0 or p_delivered>9007199254740991 then raise exception 'Quantity outside safe integer bounds' using errcode='22023';end if;
 -- Guild lock also serializes re-opening historical requirements against new creates.
 perform pg_advisory_xact_lock(hashtextextended('task-requirements:'||p_guild::text,0));
 if p_action='create' then
 if p_source_requirement is not null then
 select * into t from guild_tasks where guild_id=p_guild and source_requirement_id=p_source_requirement and status in ('open','doing','blocked') for update;
 if found then
 if t.snapshot_checksum is distinct from p_checksum then raise exception 'Source checksum changed; explicitly update and reconfirm existing task' using errcode='PT409';end if;
 result:=to_jsonb(t);insert into guild_requests values(auth.uid(),p_key,payload,result);return result;
 end if;end if;
 insert into guild_tasks(guild_id,title,status,source_id,snapshot_checksum,created_by,task_type,description,requested_quantity,delivered_quantity,source_requirement_id)
 values(p_guild,p_title,coalesce(p_status,'open'),p_source,p_checksum,auth.uid(),coalesce(p_type,'general'),coalesce(p_description,''),coalesce(p_requested,0),coalesce(p_delivered,0),p_source_requirement) returning * into t;
 elsif p_action in ('claim','update') then
 select * into t from guild_tasks where id=p_task and guild_id=p_guild for update;
 if not found then raise exception 'Task not found';end if;
 old_task:=to_jsonb(t);
 if p_revision is null or t.revision<>p_revision then raise exception 'Revision conflict' using errcode='PT409';end if;
 if p_action='claim' then
 if t.assignee is not null or t.status in ('done','cancelled') then raise exception 'Task already claimed or closed' using errcode='PT409';end if;
 update guild_tasks set assignee=auth.uid(),status='doing',revision=revision+1,updated_at=clock_timestamp() where id=t.id returning * into t;
 else
 if not is_guild_owner(p_guild) and t.assignee is distinct from auth.uid() then raise exception 'Only owner or assignee can update' using errcode='42501';end if;
 if p_source_requirement is not null and t.source_requirement_id is not null and p_source_requirement<>t.source_requirement_id then raise exception 'Source requirement identity is immutable' using errcode='PT409';end if;
 requirement:=coalesce(p_source_requirement,t.source_requirement_id);
 if requirement is not null and p_checksum is not null and p_checksum is distinct from t.snapshot_checksum and not coalesce(p_reconfirm,false) then raise exception 'Source checksum changed; explicit reconfirmation required' using errcode='PT409';end if;
 if requirement is not null and coalesce(p_status,t.status) in ('open','doing','blocked') and exists(select 1 from guild_tasks where guild_id=p_guild and source_requirement_id=requirement and id<>t.id and status in ('open','doing','blocked')) then raise exception 'Active source requirement already exists' using errcode='PT409';end if;
 update guild_tasks set title=coalesce(p_title,title),status=coalesce(p_status,status),task_type=coalesce(p_type,task_type),description=coalesce(p_description,description),requested_quantity=coalesce(p_requested,requested_quantity),delivered_quantity=coalesce(p_delivered,delivered_quantity),source_requirement_id=requirement,source_id=coalesce(p_source,source_id),snapshot_checksum=coalesce(p_checksum,snapshot_checksum),revision=revision+1,updated_at=clock_timestamp() where id=t.id returning * into t;
 end if;
 else raise exception 'Unknown operation';end if;
 result:=to_jsonb(t);
 insert into guild_activity(guild_id,actor,kind,task_id,details) values(p_guild,auth.uid(),p_action,t.id,jsonb_build_object('actor',auth.uid(),'before',old_task,'after',result,'summary',format('%s: %s [%s], delivered %s/%s',p_action,t.title,t.status,t.delivered_quantity,t.requested_quantity)));
 insert into guild_requests values(auth.uid(),p_key,payload,result);return result;
end $$;
create function public.set_shared_stock(p_guild uuid,p_item text,p_quantity bigint,p_revision integer,p_key uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s guild_shared_stock; before_stock jsonb; previous guild_requests; payload jsonb; result jsonb;
begin
 -- Hold membership until commit; remove_member takes FOR UPDATE on this row.
 perform 1 from guild_members where guild_id=p_guild and user_id=auth.uid() for share;
 if not found then raise exception 'Membership required' using errcode='42501';end if;
 if p_key is null then raise exception 'Idempotency key required';end if;
 payload:=jsonb_build_array('set_shared_stock',p_guild,p_item,p_quantity,p_revision);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_key::text,0));
 select * into previous from guild_requests where actor=auth.uid() and key=p_key;
 if found then if previous.payload<>payload then raise exception 'Idempotency key payload mismatch';end if;return previous.result;end if;
 if p_quantity is null or p_quantity<0 or p_quantity>9007199254740991 then raise exception 'Quantity outside safe integer bounds' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('shared-stock:'||p_guild::text||':'||p_item,0));
 select * into s from guild_shared_stock where guild_id=p_guild and item_id=p_item for update;
 if p_revision is null or p_revision<>(case when s.guild_id is not null then s.revision else 0 end) then raise exception 'Stock revision conflict' using errcode='PT409';end if;
 if s.guild_id is not null then before_stock:=to_jsonb(s);end if;
 insert into guild_shared_stock(guild_id,item_id,quantity,updated_by) values(p_guild,p_item,p_quantity,auth.uid())
 on conflict(guild_id,item_id) do update set quantity=excluded.quantity,revision=guild_shared_stock.revision+1,updated_by=auth.uid(),updated_at=clock_timestamp() returning * into s;
 result:=to_jsonb(s);
 insert into guild_activity(guild_id,actor,kind,details) values(p_guild,auth.uid(),'stock_set',jsonb_build_object('actor',auth.uid(),'before',before_stock,'after',result,'summary',format('Shared stock %s: %s → %s',p_item,coalesce(before_stock->>'quantity','0'),p_quantity)));
 insert into guild_requests values(auth.uid(),p_key,payload,result);return result;
end $$;
revoke execute on function public.mutate_task(uuid,text,uuid,integer,text,text,text,text,uuid,text,text,bigint,bigint,text,boolean),public.set_shared_stock(uuid,text,bigint,integer,uuid) from public,anon;
grant execute on function public.mutate_task(uuid,text,uuid,integer,text,text,text,text,uuid,text,text,bigint,bigint,text,boolean),public.set_shared_stock(uuid,text,bigint,integer,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
