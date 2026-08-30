-- ============================================================================
-- Engagement dispatch schedule.
--
-- SEPARATE MIGRATION ON PURPOSE. The schema migration is pure DDL and safe to
-- apply anywhere. This one turns on a recurring outbound job, and it depends on
-- two extensions plus two secrets that a fresh environment may not have. Split
-- like this, `db push` on a preview branch can't accidentally start emailing.
--
-- ── PREREQUISITES (Supabase dashboard, once per project) ────────────────────
--
--   1. Database → Extensions → enable `pg_cron` and `pg_net`.
--
--   2. Store the shared secret and the function base URL in Vault:
--
--        select vault.create_secret(
--          '<the same value as the ENGAGEMENT_DISPATCH_SECRET function secret>',
--          'engagement_dispatch_secret'
--        );
--        select vault.create_secret(
--          'https://<project-ref>.supabase.co/functions/v1',
--          'engagement_functions_base_url'
--        );
--
--      Vault rather than a literal in this file because a migration is
--      committed to git, and a service secret in git is a secret you have to
--      rotate.
--
--   3. Apply this migration.
--
-- Nothing happens even then: every campaign ships `enabled = false`. The
-- schedule runs hourly, finds no enabled campaigns, and returns.
--
-- If pg_cron / pg_net cannot be enabled, skip this file entirely and drive
-- `engagement-dispatch` from any external scheduler with the same header. The
-- rest of the system is unchanged.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- The job body.
--
-- Wrapped in a function rather than inlined into cron.schedule so the secret
-- lookup lives in one place and so it can be invoked by hand while testing:
--
--   select public.engagement_dispatch_tick();
-- ---------------------------------------------------------------------------
create or replace function public.engagement_dispatch_tick()
returns bigint
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_secret   text;
  v_base_url text;
  v_request  bigint;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'engagement_dispatch_secret'
   limit 1;

  select decrypted_secret into v_base_url
    from vault.decrypted_secrets
   where name = 'engagement_functions_base_url'
   limit 1;

  if v_secret is null or v_base_url is null then
    -- Warn, don't raise. A cron job that throws every hour fills the logs with
    -- noise and buries whatever the real problem turns out to be later.
    raise warning '[engagement] dispatch secrets not configured in Vault — skipping tick';
    return null;
  end if;

  -- Fire and forget. pg_net is async by design; the dispatcher's own lock and
  -- the unique constraint on engagement_sends make an overlapping or repeated
  -- call harmless, so there is nothing to wait for.
  select net.http_post(
           url     := rtrim(v_base_url, '/') || '/engagement-dispatch',
           headers := jsonb_build_object(
                        'Content-Type', 'application/json',
                        'x-engagement-secret', v_secret
                      ),
           body    := '{}'::jsonb,
           timeout_milliseconds := 60000
         )
    into v_request;

  return v_request;
end;
$$;

revoke all on function public.engagement_dispatch_tick() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Hourly, on the hour, UTC.
--
-- Hourly because sends are anchored to each user's LOCAL morning and users are
-- spread across timezones — a daily job could only ever be correct for one of
-- them. Each run picks up whichever zones have just entered their window.
--
-- The campaign send windows are 90 minutes wide, so a single missed tick (a
-- deploy, a restart) still leaves a later tick inside the window.
-- ---------------------------------------------------------------------------
select cron.unschedule('engagement-dispatch-hourly')
 where exists (
   select 1 from cron.job where jobname = 'engagement-dispatch-hourly'
 );

select cron.schedule(
  'engagement-dispatch-hourly',
  '0 * * * *',
  $$ select public.engagement_dispatch_tick(); $$
);
