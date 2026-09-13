-- A server-readable free-tier import meter.
--
-- Until now every paywall counter lived only on the device: store.ts folds
-- `lifetimeFeatureUsage` back in from local storage on every rehydrate and
-- `upsertUserPreferences` never writes it to the database. That was fine while
-- the only way to import a recipe was through a screen the client controls.
--
-- The iOS share extension changes that. It imports through an edge function
-- with no React state anywhere near it, so without a counter the server can read
-- and spend atomically, sharing a link would be a free bypass of the import
-- allowance. This adds the smallest thing that closes it.
--
-- Not a new table: `user_preferences` is already one row per user, already the
-- home of the other quota-ish fields, and already loaded on every launch.

alter table public.user_preferences
  add column if not exists imports_used integer not null default 0;

comment on column public.user_preferences.imports_used is
  'Lifetime count of successful recipe imports (paste + share). Spent atomically by spend_import_allowance(); mirrored into preferences.lifetimeFeatureUsage.importRecipe on the client.';

-- Check-and-increment in one statement.
--
-- The check and the increment MUST NOT be two round trips: a user sharing two
-- links in quick succession runs two edge function invocations concurrently, and
-- a read-then-write would let both observe the same count and both pass. The
-- UPDATE ... WHERE imports_used < p_limit makes the limit part of the write
-- predicate, so exactly one of them changes a row.
--
-- SECURITY DEFINER because the caller is the edge function acting for a user it
-- resolved from a share-import token, not from a JWT — there is no auth.uid()
-- for RLS to match. search_path is pinned, matching the engagement functions.
create or replace function public.spend_import_allowance(
  p_user_id uuid,
  p_limit integer
)
returns table (allowed boolean, used integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used integer;
begin
  -- Ensure the row exists; a user who has never saved preferences still has an
  -- allowance to spend.
  insert into public.user_preferences (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  update public.user_preferences
     set imports_used = imports_used + 1
   where user_id = p_user_id
     and imports_used < p_limit
  returning imports_used into v_used;

  if found then
    return query select true, v_used;
  else
    select imports_used into v_used
      from public.user_preferences
     where user_id = p_user_id;
    return query select false, coalesce(v_used, p_limit);
  end if;
end;
$$;

revoke all on function public.spend_import_allowance(uuid, integer) from public, anon, authenticated;
grant execute on function public.spend_import_allowance(uuid, integer) to service_role;

-- Give back an allowance that was spent but did not produce a recipe.
--
-- The meter is spent BEFORE extraction so two concurrent shares can't both pass
-- the check. When extraction then fails, the user must not be charged for a
-- recipe they never got. Floors at zero so a double refund can't mint credit.
create or replace function public.refund_import_allowance(p_user_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.user_preferences
     set imports_used = greatest(imports_used - 1, 0)
   where user_id = p_user_id;
$$;

revoke all on function public.refund_import_allowance(uuid) from public, anon, authenticated;
grant execute on function public.refund_import_allowance(uuid) to service_role;

-- Raise the server's count to match a client that has been metering locally.
--
-- Existing users have a local `lifetimeFeatureUsage.importRecipe` the server has
-- never seen. Without this, everyone who has already spent their ten imports
-- would silently get ten more the first time they share. Monotonic: it only ever
-- raises, so a reinstall (local count back to zero) cannot clear the server's.
create or replace function public.sync_import_allowance(p_count integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used integer;
begin
  if auth.uid() is null then
    raise exception 'sync_import_allowance requires an authenticated caller';
  end if;

  insert into public.user_preferences (user_id, imports_used)
  values (auth.uid(), greatest(p_count, 0))
  -- The conflicting row is addressed by the UNQUALIFIED table name inside
  -- ON CONFLICT DO UPDATE; `public.user_preferences.imports_used` is not a
  -- valid reference there.
  on conflict (user_id) do update
     set imports_used = greatest(user_preferences.imports_used, greatest(p_count, 0))
  returning imports_used into v_used;

  return v_used;
end;
$$;

revoke all on function public.sync_import_allowance(integer) from public, anon;
grant execute on function public.sync_import_allowance(integer) to authenticated, service_role;
