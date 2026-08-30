-- Fully server-driven engagement cohort.
--
-- The app does not create state rows, publish activity heartbeats, or expose
-- lifecycle-email settings. The backend derives its own cohort and recent
-- activity from data PlanNplate already writes. Users can still unsubscribe
-- from the email itself; that endpoint writes the opt-out flags here.

create table if not exists public.engagement_settings (
  singleton        boolean primary key default true check (singleton),
  default_timezone text not null default 'Australia/Sydney',
  updated_at       timestamptz not null default now()
);

alter table public.engagement_settings enable row level security;
revoke all on public.engagement_settings from anon, authenticated;

insert into public.engagement_settings (singleton, default_timezone)
values (true, 'Australia/Sydney')
on conflict (singleton) do nothing;

drop trigger if exists update_engagement_settings_updated_at
  on public.engagement_settings;
create trigger update_engagement_settings_updated_at
  before update on public.engagement_settings
  for each row execute function public.engagement_touch_updated_at();

alter table public.user_engagement_state
  add column if not exists timezone_source text not null default 'server_default'
  check (timezone_source in ('server_default', 'imported'));

-- State is backend-owned. Email unsubscribe uses the service-role Edge
-- Function, not Data API access from the app.
drop policy if exists user_engagement_state_owner
  on public.user_engagement_state;
drop policy if exists user_engagement_state_select_own
  on public.user_engagement_state;
drop policy if exists user_engagement_state_insert_own
  on public.user_engagement_state;
drop policy if exists user_engagement_state_update_own
  on public.user_engagement_state;
revoke all on public.user_engagement_state from anon, authenticated;

create or replace function public.engagement_sync_state_cohort()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_timezone text;
  v_rows     integer;
begin
  select s.default_timezone
    into v_timezone
    from public.engagement_settings s
   where s.singleton = true;

  if v_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = v_timezone
  ) then
    v_timezone := 'UTC';
  end if;

  with activity_events as (
    select user_id, max(updated_at) as happened_at
      from public.meal_slots group by user_id
    union all
    select user_id, max(updated_at)
      from public.recipes group by user_id
    union all
    select user_id, max(updated_at)
      from public.grocery_items group by user_id
    union all
    select user_id, max(updated_at)
      from public.saved_grocery_lists group by user_id
    union all
    select user_id, max(created_at)
      from public.planning_events group by user_id
    union all
    select user_id, max(greatest(cooked_at, created_at))
      from public.cooking_logs group by user_id
    union all
    select user_id, max(greatest(rated_at, created_at))
      from public.recipe_ratings group by user_id
  ),
  last_activity as (
    select user_id, max(happened_at) as happened_at
      from activity_events
     group by user_id
  ),
  eligible as (
    select u.id as user_id,
           greatest(u.updated_at, p.updated_at, a.happened_at) as last_active_at
      from public.users u
      join public.user_preferences p on p.user_id = u.id
      left join last_activity a on a.user_id = u.id
     where coalesce(u.account_status, 'active') = 'active'
       and p.has_completed_onboarding = true
  )
  insert into public.user_engagement_state (
    user_id,
    timezone,
    timezone_source,
    last_active_at
  )
  select e.user_id,
         v_timezone,
         'server_default',
         e.last_active_at
    from eligible e
  on conflict (user_id) do update
    set timezone = case
          when public.user_engagement_state.timezone_source = 'server_default'
            then excluded.timezone
          else public.user_engagement_state.timezone
        end,
        last_active_at = greatest(
          public.user_engagement_state.last_active_at,
          excluded.last_active_at
        ),
        updated_at = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$fn$;

revoke all on function public.engagement_sync_state_cohort()
  from public, anon, authenticated;
grant execute on function public.engagement_sync_state_cohort()
  to service_role;

-- Safe backfill: campaigns are disabled and the dispatcher is not scheduled.
select public.engagement_sync_state_cohort();
