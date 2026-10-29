-- Rewarded-ad unlock, v2: renewals and a lifetime unlock count.
--
-- • A new 7-day week may start once fewer than 48 hours of the current one
--   remain (or it has ended). If it is still running, the new week is added to
--   its end, so renewing early never loses time. Outside that window the call
--   is refused and the current end is returned — no open-ended stacking.
-- • ad_unlock_count counts unlocks; the app leads with the subscription from
--   the 3rd unlock onward.
--
-- Replaces grant_ad_unlock() / get_ad_unlock_until() from 20261005120000 with
-- versions that return { until, count } as JSON.

alter table public.user_preferences
  add column if not exists ad_unlock_count integer not null default 0;

comment on column public.user_preferences.ad_unlock_count is
  'Lifetime number of rewarded-ad Premium weeks granted. Written by grant_ad_unlock().';

drop function if exists public.grant_ad_unlock();
drop function if exists public.get_ad_unlock_until();

create or replace function public.grant_ad_unlock()
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_until timestamptz;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'grant_ad_unlock requires an authenticated caller';
  end if;

  insert into public.user_preferences (user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  update public.user_preferences
     set ad_unlock_until = greatest(coalesce(ad_unlock_until, now()), now()) + interval '7 days',
         ad_unlock_count = ad_unlock_count + 1
   where user_id = auth.uid()
     and (ad_unlock_until is null or ad_unlock_until <= now() + interval '48 hours')
  returning ad_unlock_until, ad_unlock_count into v_until, v_count;

  if not found then
    select ad_unlock_until, ad_unlock_count into v_until, v_count
      from public.user_preferences
     where user_id = auth.uid();
  end if;

  return json_build_object('until', v_until, 'count', coalesce(v_count, 0));
end;
$$;

revoke all on function public.grant_ad_unlock() from public, anon;
grant execute on function public.grant_ad_unlock() to authenticated, service_role;

create or replace function public.get_ad_unlock()
returns json
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select json_build_object('until', ad_unlock_until, 'count', ad_unlock_count)
    from public.user_preferences
   where user_id = auth.uid();
$$;

revoke all on function public.get_ad_unlock() from public, anon;
grant execute on function public.get_ad_unlock() to authenticated, service_role;
