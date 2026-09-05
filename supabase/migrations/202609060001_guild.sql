begin;
create extension if not exists pgcrypto;
create table public.guilds(id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 100), created_at timestamptz not null default now());
create table public.guild_members(guild_id uuid references public.guilds on delete cascade, user_id uuid not null references auth.users on delete cascade, role text not null check(role in ('owner','member')), last_seen timestamptz not null default '-infinity', primary key(guild_id,user_id));
create table public.guild_invites(id uuid primary key default gen_random_uuid(),guild_id uuid not null references public.guilds on delete cascade,token_hash bytea not null unique,expires_at timestamptz not null,redeemed_by uuid,created_by uuid not null);
create table public.guild_tasks(id uuid primary key default gen_random_uuid(),guild_id uuid not null references public.guilds on delete cascade,title text not null check(length(trim(title)) between 1 and 200),status text not null default 'open' check(status in ('open','doing','done')),assignee uuid,revision integer not null default 1,source_id text check(length(source_id)<=200),snapshot_checksum text check(length(snapshot_checksum)<=128),created_by uuid not null,updated_at timestamptz not null default now());
create table public.guild_activity(id bigint generated always as identity primary key,guild_id uuid not null references public.guilds on delete cascade,actor uuid not null,kind text not null,task_id uuid,created_at timestamptz not null default clock_timestamp());
create table public.guild_requests(actor uuid not null,key uuid not null,payload jsonb not null,result jsonb not null,primary key(actor,key));
create function public.is_guild_member(p_guild uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from guild_members where guild_id=p_guild and user_id=auth.uid()) $$;
create function public.is_guild_owner(p_guild uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select exists(select 1 from guild_members where guild_id=p_guild and user_id=auth.uid() and role='owner') $$;
alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_invites enable row level security;
alter table public.guild_tasks enable row level security;
alter table public.guild_activity enable row level security;
alter table public.guild_requests enable row level security;
create policy guild_read on public.guilds for select to authenticated using(public.is_guild_member(id));
create policy member_read on public.guild_members for select to authenticated using(public.is_guild_member(guild_id));
create policy task_read on public.guild_tasks for select to authenticated using(public.is_guild_member(guild_id));
create policy activity_read on public.guild_activity for select to authenticated using(public.is_guild_member(guild_id));
create function public.create_guild(p_name text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$ declare g uuid; begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 insert into guilds(name) values(p_name) returning id into g;
 insert into guild_members(guild_id,user_id,role) values(g,auth.uid(),'owner');
 insert into guild_activity(guild_id,actor,kind) values(g,auth.uid(),'guild_created');return g;end $$;
create function public.create_invite(p_guild uuid,p_hours integer default 24) returns text language plpgsql security definer set search_path=public,pg_temp as $$ declare token text; begin
 if not is_guild_owner(p_guild) then raise exception 'Owner required' using errcode='42501';end if;
 if p_hours is null or p_hours<1 or p_hours>168 then raise exception 'Expiry must be 1–168 hours';end if;
 token:=encode(gen_random_bytes(32),'hex');
 insert into guild_invites(guild_id,token_hash,expires_at,created_by) values(p_guild,digest(token,'sha256'),clock_timestamp()+make_interval(hours=>p_hours),auth.uid());return token;end $$;
create function public.redeem_invite(p_token text,p_accept boolean) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$ declare i guild_invites;begin
 if auth.uid() is null or p_accept is distinct from true then raise exception 'Authenticated explicit acceptance required' using errcode='42501';end if;
 select * into i from guild_invites where token_hash=digest(p_token,'sha256') for update;
 if not found or i.redeemed_by is not null or i.expires_at<=clock_timestamp() then raise exception 'Invalid, used, or expired invite';end if;
 if is_guild_member(i.guild_id) then raise exception 'Already a member';end if;
 insert into guild_members(guild_id,user_id,role) values(i.guild_id,auth.uid(),'member');
 update guild_invites set redeemed_by=auth.uid() where id=i.id;
 insert into guild_activity(guild_id,actor,kind) values(i.guild_id,auth.uid(),'member_joined');return i.guild_id;end $$;
create function public.mutate_task(p_guild uuid,p_action text,p_task uuid,p_revision integer,p_title text,p_status text,p_source text,p_checksum text,p_key uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
create function public.guild_digest(p_guild uuid) returns setof public.guild_activity language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if not is_guild_member(p_guild) then raise exception 'Membership required' using errcode='42501';end if;
 return query select a.* from guild_activity a join guild_members m on m.guild_id=a.guild_id and m.user_id=auth.uid() where a.guild_id=p_guild and a.created_at>m.last_seen order by a.id;end $$;
create function public.mark_seen(p_guild uuid,p_through_id bigint) returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare observed_at timestamptz; begin
 if not is_guild_member(p_guild) then raise exception 'Membership required' using errcode='42501';end if;
 select created_at into observed_at from guild_activity where guild_id=p_guild and id=p_through_id;
 if not found then raise exception 'Observed activity must belong to guild';end if;
 update guild_members set last_seen=greatest(last_seen,observed_at) where guild_id=p_guild and user_id=auth.uid();end $$;
revoke all on public.guilds,public.guild_members,public.guild_tasks,public.guild_activity,public.guild_invites,public.guild_requests from anon,authenticated;
grant select on public.guilds,public.guild_members,public.guild_tasks,public.guild_activity to authenticated;
revoke execute on function public.is_guild_member(uuid),public.is_guild_owner(uuid),public.create_guild(text),public.create_invite(uuid,integer),public.redeem_invite(text,boolean),public.mutate_task(uuid,text,uuid,integer,text,text,text,text,uuid),public.guild_digest(uuid),public.mark_seen(uuid,bigint) from public,anon;
grant execute on function public.is_guild_member(uuid),public.is_guild_owner(uuid),public.create_guild(text),public.create_invite(uuid,integer),public.redeem_invite(text,boolean),public.mutate_task(uuid,text,uuid,integer,text,text,text,text,uuid),public.guild_digest(uuid),public.mark_seen(uuid,bigint) to authenticated;
commit;
