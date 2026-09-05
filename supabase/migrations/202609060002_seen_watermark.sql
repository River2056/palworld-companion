begin;
drop function if exists public.mark_seen(uuid);
create or replace function public.mark_seen(p_guild uuid,p_through_id bigint) returns void language plpgsql security definer set search_path=public,pg_temp as $$ declare observed_at timestamptz; begin
 if not is_guild_member(p_guild) then raise exception 'Membership required' using errcode='42501';end if;
 select created_at into observed_at from guild_activity where guild_id=p_guild and id=p_through_id;
 if not found then raise exception 'Observed activity must belong to guild';end if;
 update guild_members set last_seen=greatest(last_seen,observed_at) where guild_id=p_guild and user_id=auth.uid();end $$;
revoke execute on function public.mark_seen(uuid,bigint) from public,anon;
grant execute on function public.mark_seen(uuid,bigint) to authenticated;
notify pgrst, 'reload schema';
commit;
