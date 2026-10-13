-- Rewarded-ad unlock: watching ~30 seconds of AdMob rewarded video grants
-- Premium access for 7 days.
--
-- The expiry lives on the server, not only on the device, for two reasons:
--   • the iOS share extension imports through an edge function
--     (_shared/share-entitlement.ts) that has no access to device state, and
--   • a device clock can be moved; the server clock decides when it ends.
--
-- One window at a time: grant_ad_unlock() only writes when there is no active
-- window, so repeated calls cannot extend or stack an unlock.

alter table public.user_preferences
  add column if not exists ad_unlock_until timestamptz;

comment on column public.user_preferences.ad_unlock_until is
  'End of the current rewarded-ad Premium window (null or past = none). Written by grant_ad_unlock(); read by the app and by share-entitlement.ts.';

-- Start a 7-day window for the calling user, unless one is already active.
-- Returns the window end (the existing one if still active).
create or replace function public.grant_ad_unlock()
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_until timestamptz;
begin
  if auth.uid() is null then
    raise exception 'grant_ad_unlock requires an authenticated caller';
  end if;

  insert into public.user_preferences (user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  update public.user_preferences
     set ad_unlock_until = now() + interval '7 days'
   where user_id = auth.uid()
     and (ad_unlock_until is null or ad_unlock_until <= now())
  returning ad_unlock_until into v_until;

  if not found then
    select ad_unlock_until into v_until
      from public.user_preferences
     where user_id = auth.uid();
  end if;

  return v_until;
end;
$$;

revoke all on function public.grant_ad_unlock() from public, anon;
grant execute on function public.grant_ad_unlock() to authenticated, service_role;

-- Read the calling user's window end (null if none). Lets the app restore the
-- unlock on a new device or after a reinstall without depending on RLS shape.
create or replace function public.get_ad_unlock_until()
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ad_unlock_until
    from public.user_preferences
   where user_id = auth.uid();
$$;

revoke all on function public.get_ad_unlock_until() from public, anon;
grant execute on function public.get_ad_unlock_until() to authenticated, service_role;
