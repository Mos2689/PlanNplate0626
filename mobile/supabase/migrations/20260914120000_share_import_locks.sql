-- Stop the same link being imported twice at once.
--
-- `share-import` guards duplicates by selecting from `recipes` on the normalized
-- source URL and inserting if nothing comes back. That is check-then-act, and
-- nothing backs it: two invocations for the same URL inside the extraction
-- window (5-10 seconds) both see an empty result, both call the model, and both
-- insert. The user gets two copies of one recipe and is charged twice.
--
-- It is reachable in ordinary use — a user who thinks the first share didn't
-- work and shares the post again.
--
-- WHY A LOCK TABLE RATHER THAN A UNIQUE INDEX ON recipes
--
-- A partial unique index on `recipes (user_id, source_url)` is the better
-- long-term answer: smaller, and it would fix the paste flow's identical race
-- for free. But creating it FAILS if production already holds duplicate pairs
-- from before any of this existed, and de-duplicating live recipe rows is
-- destructive and not a migration's business.
--
-- This table adds the same atomicity with no risk to existing data. Move to the
-- index once this returns nothing:
--
--   select user_id, source_url, count(*) from public.recipes
--    where source_url is not null group by 1,2 having count(*) > 1;

create table if not exists public.share_import_locks (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The NORMALIZED url — whatever `normalizeRecipeSourceUrl` produced — so the
  -- lock and the duplicate gate key on the same string.
  source_url text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, source_url)
);

comment on table public.share_import_locks is
  'Short-lived claims held while a share import runs, so the same link cannot be imported concurrently. Rows are deleted on completion; a stale row is taken over after a timeout.';

alter table public.share_import_locks enable row level security;

-- No policies on purpose. Only the `share-import` edge function touches this,
-- under the service role, which bypasses RLS. There is nothing here a client
-- should read or write, and RLS-with-no-policies denies everyone else by default.

/**
 * Claim the right to import this URL, or report that someone else already has.
 *
 * Atomic by construction: two concurrent callers both run the INSERT, one wins
 * and the other is routed into DO UPDATE, whose WHERE clause fails because the
 * winner's `claimed_at` is `now()`. A failed DO UPDATE returns no row, so the
 * loser gets false. There is no window between the check and the write, because
 * they are the same statement.
 *
 * Stale claims are taken over rather than waited on: an edge function that dies
 * mid-import never releases its lock, and without a timeout that URL would be
 * permanently un-importable. The timeout only has to exceed a normal import.
 */
create or replace function public.claim_share_import(
  p_user_id uuid,
  p_source_url text,
  p_stale_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claimed boolean;
begin
  insert into public.share_import_locks (user_id, source_url)
  values (p_user_id, p_source_url)
  on conflict (user_id, source_url) do update
     set claimed_at = now()
   where share_import_locks.claimed_at < now() - make_interval(secs => p_stale_seconds)
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_share_import(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_share_import(uuid, text, integer) to service_role;

/**
 * Release a claim. Called on every exit path, successful or not.
 *
 * Deleting rather than marking released keeps the table at roughly the number of
 * imports in flight — normally zero. A row that survives is one whose function
 * died, and the staleness takeover in `claim_share_import` handles that.
 */
create or replace function public.release_share_import(
  p_user_id uuid,
  p_source_url text
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.share_import_locks
   where user_id = p_user_id
     and source_url = p_source_url;
$$;

revoke all on function public.release_share_import(uuid, text) from public, anon, authenticated;
grant execute on function public.release_share_import(uuid, text) to service_role;
