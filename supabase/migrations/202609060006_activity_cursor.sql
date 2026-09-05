begin;
-- Freeze writers before backfill. Timestamps/identity allocation do not order commits.
lock table public.guild_activity in access exclusive mode;
alter table public.guild_activity add column activity_cursor bigint;
alter table public.guild_members add column last_seen_cursor bigint not null default 0 check(last_seen_cursor>=0);
-- Dedicated rows avoid taking the guild metadata lock after task/member locks.
create table public.guild_activity_counters(
 guild_id uuid primary key references public.guilds on delete cascade,
 last_cursor bigint not null check(last_cursor>=0)
);
alter table public.guild_activity_counters enable row level security;
revoke all on public.guild_activity_counters from public,anon,authenticated;
with numbered as (
 select id,row_number() over(partition by guild_id order by id) as cursor from public.guild_activity
) update public.guild_activity a set activity_cursor=n.cursor from numbered n where n.id=a.id;
insert into public.guild_activity_counters(guild_id,last_cursor)
 select g.id,coalesce(max(a.activity_cursor),0) from public.guilds g
 left join public.guild_activity a on a.guild_id=g.id group by g.id;
alter table public.guild_activity alter column activity_cursor set not null;
alter table public.guild_activity add constraint guild_activity_cursor_positive check(activity_cursor>0);
create unique index guild_activity_guild_cursor on public.guild_activity(guild_id,activity_cursor);
-- All producers (including future RPCs) serialize allocation until transaction end.
-- Unlike a sequence, an UPDATE cannot expose a later cursor before an earlier commit.
create function public.assign_guild_activity_cursor() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into guild_activity_counters(guild_id,last_cursor) values(new.guild_id,1)
 on conflict(guild_id) do update set last_cursor=guild_activity_counters.last_cursor+1
 returning last_cursor into new.activity_cursor;
 return new;
end $$;
revoke all on function public.assign_guild_activity_cursor() from public,anon,authenticated;
create trigger guild_activity_assign_cursor before insert on public.guild_activity
 for each row execute function public.assign_guild_activity_cursor();
-- Conservative cutover: replay history once, never infer a safe prefix from timestamps.
-- last_seen stays available to old readers, but no longer controls unread membership.
create or replace function public.guild_digest(p_guild uuid) returns setof public.guild_activity
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not is_guild_member(p_guild) then raise exception 'Membership required' using errcode='42501';end if;
 return query select a.* from guild_activity a join guild_members m
 on m.guild_id=a.guild_id and m.user_id=auth.uid()
 where a.guild_id=p_guild and a.activity_cursor>m.last_seen_cursor order by a.activity_cursor;
end $$;
-- Preserve the public RPC: callers still acknowledge the last returned activity ID,
-- not max(id) or a timestamp. IDs need not have the same ordering as cursors.
create or replace function public.mark_seen(p_guild uuid,p_through_id bigint) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare observed public.guild_activity;
begin
 if not is_guild_member(p_guild) then raise exception 'Membership required' using errcode='42501';end if;
 select * into observed from guild_activity where guild_id=p_guild and id=p_through_id;
 if not found then raise exception 'Observed activity must belong to guild';end if;
 update guild_members set last_seen_cursor=greatest(last_seen_cursor,observed.activity_cursor),
 last_seen=greatest(last_seen,observed.created_at) where guild_id=p_guild and user_id=auth.uid();
end $$;
revoke execute on function public.guild_digest(uuid),public.mark_seen(uuid,bigint) from public,anon;
grant execute on function public.guild_digest(uuid),public.mark_seen(uuid,bigint) to authenticated;
notify pgrst, 'reload schema';
commit;
