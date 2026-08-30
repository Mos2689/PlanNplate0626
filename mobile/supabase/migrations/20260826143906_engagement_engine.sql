-- ============================================================================
-- Engagement engine — weekly & monthly lifecycle EMAIL.
--
-- This is a SECOND layer, additive to the existing daily notifications. Those
-- are client-scheduled LOCAL notifications (src/lib/notifications.ts) and are
-- not touched by anything here. The point of this system is the cohort that
-- declined the OS notification prompt: today they receive nothing at all,
-- because every daily reminder is a local notification behind that permission.
--
-- Everything is namespaced `engagement_*` and lives in its own tables. No
-- column is added to `users`, `recipes`, `meal_slots` or any other existing
-- table, so a bug in here cannot regress auth, subscription or planning.
--
-- Idempotent — safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- CAMPAIGN CONFIG
--
-- The server-driven surface. Copy, thresholds, timing, priority, cooldowns,
-- activation, block composition and CTA target are all rows here — changing
-- them is an UPDATE, never an app release.
--
-- The honest boundary: signal COMPUTATION and block TEMPLATES are code (the
-- functions below and the edge function). You can retune "3 planned meals" to
-- "4" from this table; you cannot invent a new signal without a deploy.
-- ---------------------------------------------------------------------------
create table if not exists public.engagement_campaigns (
  campaign_id        text primary key,
  name               text not null,
  period             text not null check (period in ('weekly', 'monthly')),
  enabled            boolean not null default false,

  -- Higher wins. Exactly one campaign becomes the email's hero.
  priority           int not null default 0,

  -- 0=Sun .. 6=Sat, matching Postgres `extract(dow)`.
  send_dow           int not null check (send_dow between 0 and 6),
  -- Monthly only: "the Nth <send_dow> of the month". Null for weekly.
  send_nth_of_month  int,

  -- Local wall-clock window. The dispatcher only considers a user whose OWN
  -- local time falls inside this.
  send_window_start  time not null default '09:00',
  send_window_end    time not null default '10:30',

  -- Declarative thresholds, read by the dispatcher. Shape is per-campaign and
  -- documented in the seeds at the bottom of this file.
  min_data           jsonb not null default '{}'::jsonb,
  eligibility        jsonb not null default '{}'::jsonb,
  suppression        jsonb not null default '{}'::jsonb,

  subject_template   text not null,
  preheader_template text not null default '',

  -- Ordered hero + supporting block keys. The dispatcher drops any supporting
  -- block whose own threshold fails.
  body_blocks        jsonb not null default '[]'::jsonb,

  -- An ALLOWLIST KEY, never a URL. Resolved server-side in engagement-click.
  cta_route          text not null,
  cta_label          text not null default 'Open PlanNplate',

  variant            text not null default 'default',
  start_date         date,
  end_date           date,
  updated_at         timestamptz not null default now()
);

alter table public.engagement_campaigns enable row level security;

-- Config is service-role only. No client ever reads or writes it; RLS with no
-- permissive policy denies `anon` and `authenticated` outright, while the
-- service role used by the dispatcher bypasses RLS entirely.
revoke all on public.engagement_campaigns from anon, authenticated;

-- ---------------------------------------------------------------------------
-- SEND LOG
--
-- Three jobs at once: duplicate protection, suppression history, and the
-- analytics funnel. The unique constraint is the load-bearing part — see the
-- comment on it.
-- ---------------------------------------------------------------------------
create table if not exists public.engagement_sends (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  campaign_id         text not null,
  variant             text not null default 'default',

  -- '2026-W35' (ISO week) for weekly, '2026-08' for monthly. Derived from the
  -- user's LOCAL date, so a timezone change cannot produce a second row.
  period_key          text not null,

  subject             text,
  blocks              text[] not null default '{}',
  -- Everything the decision was made from. Invaluable when someone asks "why
  -- did it say that?" three weeks later.
  signals             jsonb not null default '{}'::jsonb,

  status              text not null check (status in ('sent', 'failed', 'suppressed', 'would_send')),
  suppression_reason  text,
  error               text,

  resend_message_id   text,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  opened_at           timestamptz,
  clicked_at          timestamptz,
  bounced_at          timestamptz,
  complained_at       timestamptz,
  created_at          timestamptz not null default now(),

  -- THE duplicate-send guarantee. The dispatcher inserts BEFORE it sends; a
  -- conflict here means this user already has a decision recorded for this
  -- campaign in this period, so the run aborts. Makes scheduler reruns,
  -- overlapping invocations and retry storms harmless by construction rather
  -- than by careful coding.
  unique (user_id, campaign_id, period_key)
);

create index if not exists engagement_sends_user_sent_idx
  on public.engagement_sends (user_id, sent_at desc nulls last);
create index if not exists engagement_sends_campaign_idx
  on public.engagement_sends (campaign_id, created_at desc);
create index if not exists engagement_sends_resend_idx
  on public.engagement_sends (resend_message_id) where resend_message_id is not null;

alter table public.engagement_sends enable row level security;
revoke all on public.engagement_sends from anon, authenticated;

-- ---------------------------------------------------------------------------
-- SUPPRESSION LIST
--
-- Hard bounces and spam complaints, keyed by address rather than user so a
-- bad address stays dead even if it is later attached to another account.
-- Checked before every single send.
-- ---------------------------------------------------------------------------
create table if not exists public.email_suppressions (
  email       text primary key,
  reason      text not null check (reason in ('bounced', 'complained', 'unsubscribed', 'manual')),
  detail      text,
  created_at  timestamptz not null default now()
);

alter table public.email_suppressions enable row level security;
revoke all on public.email_suppressions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- PER-USER ENGAGEMENT STATE
--
-- Deliberately a NEW table rather than columns on `users`. `users` is on the
-- auth and subscription paths; this system must not be able to break those.
--
-- `timezone` is the gap that made server-driven sending impossible before —
-- nothing in the codebase stored one.
-- ---------------------------------------------------------------------------
create table if not exists public.user_engagement_state (
  user_id            uuid primary key references auth.users(id) on delete cascade,

  -- IANA zone from Intl.DateTimeFormat().resolvedOptions().timeZone.
  -- 'UTC' is the fallback for a client that somehow reports nothing; it means
  -- the user gets a defensible hour rather than being excluded entirely.
  timezone           text not null default 'UTC',
  last_active_at     timestamptz,

  weekly_opt_out     boolean not null default false,
  monthly_opt_out    boolean not null default false,

  -- Opaque. Goes in the unsubscribe URL so no email address is ever in a link
  -- (email addresses in URLs leak through referrers, proxies and logs).
  unsubscribe_token  uuid not null default gen_random_uuid(),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists user_engagement_state_token_idx
  on public.user_engagement_state (unsubscribe_token);

alter table public.user_engagement_state enable row level security;

-- The app writes its own row (timezone, activity, preference toggles) and
-- nobody else's. The dispatcher uses the service role and bypasses this.
drop policy if exists "user_engagement_state_owner" on public.user_engagement_state;
create policy "user_engagement_state_owner"
  on public.user_engagement_state
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep updated_at honest.
--
-- This owns its own trigger function rather than reusing
-- `public.update_updated_at_column()` from supabase-schema.sql, because that
-- function DOES NOT EXIST on the live database — verified 2026-08-26: the
-- public schema has zero triggers, so the ones that file declares were never
-- applied and `updated_at` on users/recipes/meal_slots is maintained by the
-- app. Depending on it would make this migration fail on a fresh deploy, which
-- is exactly what happened on the first attempt.
create or replace function public.engagement_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_user_engagement_state_updated_at on public.user_engagement_state;
create trigger update_user_engagement_state_updated_at
  before update on public.user_engagement_state
  for each row execute function public.engagement_touch_updated_at();

-- ---------------------------------------------------------------------------
-- DISPATCH LOCK
--
-- Stops two dispatch runs overlapping. Postgres advisory locks are the obvious
-- tool and the wrong one here: they are session-scoped, and every edge-function
-- call reaches the database as a separate PostgREST request, so the lock would
-- be released before the run it is meant to protect had started. A row with a
-- TTL survives across invocations and self-heals if a run dies mid-flight.
--
-- The unique constraint on engagement_sends is still the real safety net. This
-- is here to stop two runs doing redundant work and racing on the cooldown
-- check, not to prevent duplicates.
-- ---------------------------------------------------------------------------
create table if not exists public.engagement_dispatch_lock (
  id            int primary key default 1 check (id = 1),
  locked_until  timestamptz,
  locked_by     text
);

insert into public.engagement_dispatch_lock (id, locked_until)
values (1, null)
on conflict (id) do nothing;

alter table public.engagement_dispatch_lock enable row level security;
revoke all on public.engagement_dispatch_lock from anon, authenticated;

create or replace function public.engagement_acquire_lock(
  p_holder  text,
  p_seconds int default 600
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  update public.engagement_dispatch_lock
     set locked_until = now() + make_interval(secs => p_seconds),
         locked_by    = p_holder
   where id = 1
     and (locked_until is null or locked_until < now())
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

create or replace function public.engagement_release_lock(p_holder text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.engagement_dispatch_lock
     set locked_until = null, locked_by = null
   where id = 1 and locked_by = p_holder;
$$;

revoke all on function public.engagement_acquire_lock(text, int) from public, anon, authenticated;
revoke all on function public.engagement_release_lock(text) from public, anon, authenticated;
grant execute on function public.engagement_acquire_lock(text, int) to service_role;
grant execute on function public.engagement_release_lock(text) to service_role;

-- ============================================================================
-- SIGNAL COMPUTATION
--
-- These are the "why now / why this user" engine. They deliberately mirror the
-- definitions already used in the app (src/lib/behavior-insights.ts and
-- src/lib/nudge-engine.ts) so an email can never contradict what the user sees
-- on screen — weeks are Monday-anchored, "planned" means a slot with a
-- recipe_id, "cooked" means a cooking_log with status='cooked'.
--
-- Both take the user's LOCAL date. The dispatcher supplies it; the functions
-- never call now(), which also makes them trivially testable.
-- ============================================================================

-- Cuisine vocabulary, kept identical to CUISINE_VOCAB in behavior-insights.ts.
-- Narrow on purpose: broad enough for the major lanes, narrow enough that the
-- signal stays clean.
create or replace function public.engagement_cuisine_vocab()
returns text[]
language sql
immutable
as $$
  select array[
    'Italian', 'Indian', 'Mediterranean', 'Asian', 'Mexican',
    'Thai', 'American', 'French', 'Middle Eastern', 'Japanese'
  ];
$$;

-- ---------------------------------------------------------------------------
-- WEEKLY SIGNALS
--
-- `p_local_date` is the user's own today. "Next week" is the Monday-anchored
-- week AFTER the one containing it — which on the Saturday send day is the
-- week starting in two days, i.e. exactly the week they are about to shop for.
-- ---------------------------------------------------------------------------
create or replace function public.compute_weekly_signals(
  p_user_id    uuid,
  p_local_date date,
  p_timezone   text default 'UTC'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_this_monday   date;
  v_next_monday   date;
  v_next_sunday   date;
  v_result        jsonb;
  v_planned_ids   uuid[];
  v_planned_count int;
  v_typical       int;
  v_first_name    text;
  v_tz            text;
begin
  -- `meal_slots.date` is a plain DATE and needs no conversion, but
  -- cooking_logs.cooked_at, recipes.created_at and planning_events.created_at
  -- are all timestamptz. Casting those with a bare ::date uses the SERVER's
  -- zone, which for a user west of UTC turns Saturday evening into Sunday and
  -- silently shifts every window by a day. Validated once here rather than
  -- inside the subqueries, so a retired or malformed IANA name costs one
  -- exception per call instead of one per row.
  begin
    perform now() at time zone p_timezone;
    v_tz := p_timezone;
  exception when others then
    v_tz := 'UTC';
  end;

  -- date_trunc('week') is ISO — Monday-anchored, matching mondayOfWeek() in
  -- behavior-insights.ts.
  v_this_monday := date_trunc('week', p_local_date)::date;
  v_next_monday := v_this_monday + 7;
  v_next_sunday := v_next_monday + 6;

  select coalesce(nullif(split_part(coalesce(u.name, ''), ' ', 1), ''), null)
    into v_first_name
    from public.users u
   where u.id = p_user_id;

  -- Recipes planned for next week. Lunch and dinner only: breakfast and snack
  -- slots are used far more sporadically and would make "your week is
  -- incomplete" fire against people whose week is, for them, complete.
  select array_agg(distinct ms.recipe_id), count(*)
    into v_planned_ids, v_planned_count
    from public.meal_slots ms
   where ms.user_id = p_user_id
     and ms.recipe_id is not null
     and ms.meal_type in ('lunch', 'dinner')
     and ms.date between v_next_monday and v_next_sunday;

  v_planned_ids   := coalesce(v_planned_ids, '{}');
  v_planned_count := coalesce(v_planned_count, 0);

  -- What a "full" week looks like FOR THIS USER — the median of the last four
  -- completed weeks. A fixed target would tell someone who plans four dinners
  -- a week that they are perpetually three short.
  select coalesce(
           percentile_cont(0.5) within group (order by wk.cnt)::int,
           0
         )
    into v_typical
    from (
      select date_trunc('week', ms.date)::date as wk_start, count(*) as cnt
        from public.meal_slots ms
       where ms.user_id = p_user_id
         and ms.recipe_id is not null
         and ms.meal_type in ('lunch', 'dinner')
         and ms.date >= v_this_monday - 28
         and ms.date <  v_this_monday
       group by 1
    ) wk;

  select jsonb_build_object(
    'first_name',        v_first_name,
    'week_start',        v_next_monday,
    'week_end',          v_next_sunday,
    'week_name',         to_char(v_next_monday, 'FMMonth DD'),

    'planned_count',     v_planned_count,
    'typical_count',     v_typical,
    'planned_recipe_ids', to_jsonb(v_planned_ids),

    -- Days in next week with nothing planned at all.
    'unplanned_day_count', (
      7 - (
        select count(distinct ms.date)
          from public.meal_slots ms
         where ms.user_id = p_user_id
           and ms.recipe_id is not null
           and ms.date between v_next_monday and v_next_sunday
      )
    ),

    -- Has this user ever finished a week? Without one we have no idea what
    -- "unfinished" means for them, so W1 must not fire.
    'has_complete_prior_week', exists (
      select 1
        from (
          select date_trunc('week', ms.date)::date as wk_start, count(*) as cnt
            from public.meal_slots ms
           where ms.user_id = p_user_id
             and ms.recipe_id is not null
             and ms.meal_type in ('lunch', 'dinner')
             and ms.date >= v_this_monday - 56
             and ms.date <  v_next_monday
           group by 1
        ) w
       where w.cnt >= greatest(v_typical, 3)
    ),

    -- Next week's plan rendered for the email grid: one entry per planned
    -- slot, in date order.
    'planned_slots', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'date',      ms.date,
                 'dow',       to_char(ms.date, 'Dy'),
                 'meal_type', ms.meal_type,
                 'name',      coalesce(r.name, ms.custom_meal_name),
                 'image_url', r.image_url
               ) order by ms.date, ms.meal_type
             )
        from public.meal_slots ms
        left join public.recipes r on r.id = ms.recipe_id
       where ms.user_id = p_user_id
         and (ms.recipe_id is not null or ms.custom_meal_name is not null)
         and ms.date between v_next_monday and v_next_sunday
    ), '[]'::jsonb),

    -- ── Grocery readiness ────────────────────────────────────────────────
    -- "Covered" means at least one grocery row already references one of next
    -- week's recipes. Deliberately loose: if they have started the list at
    -- all, telling them to build it is wrong.
    'grocery_covered', (
      v_planned_count > 0 and exists (
        select 1
          from public.grocery_items gi
         where gi.user_id = p_user_id
           and gi.recipe_ids && v_planned_ids
      )
    ),
    'saved_list_since_plan', exists (
      select 1
        from public.saved_grocery_lists sgl
       where sgl.user_id = p_user_id
         and sgl.created_at >= (
           select coalesce(max(ms.created_at), now())
             from public.meal_slots ms
            where ms.user_id = p_user_id
              and ms.recipe_id is not null
              and ms.date between v_next_monday and v_next_sunday
         )
    ),
    'grocery_open_items', (
      select count(*)
        from public.grocery_items gi
       where gi.user_id = p_user_id
         and gi.is_checked = false
    ),

    -- Ingredients for next week's planned recipes, for the in-email list.
    -- Aggregation happens in the edge function, which already has the unit
    -- rules; SQL just hands over the raw rows.
    'planned_ingredients', coalesce((
      select jsonb_agg(jsonb_build_object('recipe_id', r.id, 'ingredients', r.ingredients))
        from public.recipes r
       where r.id = any(v_planned_ids)
    ), '[]'::jsonb),

    -- ── Head start for W3 ────────────────────────────────────────────────
    -- Meals they actually cooked recently and did not dislike. This is the
    -- shortcut that makes "plan next week" useful instead of nagging, so W3
    -- is gated on it being non-empty.
    'repeat_candidates', coalesce((
      select jsonb_agg(x order by x->>'cooked_at' desc)
        from (
          select distinct on (r.id) jsonb_build_object(
                   'id',        r.id,
                   'name',      r.name,
                   'image_url', r.image_url,
                   'prep_time', coalesce(r.prep_time, 0) + coalesce(r.cook_time, 0),
                   'stars',     rr.stars,
                   'cooked_at', cl.cooked_at
                 ) as x
            from public.cooking_logs cl
            join public.recipes r on r.id::text = cl.recipe_id
            left join public.recipe_ratings rr
              on rr.user_id = p_user_id and rr.recipe_id = cl.recipe_id
           where cl.user_id = p_user_id
             and cl.status = 'cooked'
             and (cl.cooked_at at time zone v_tz)::date >= (p_local_date - 14)
             -- Unrated is fine (most meals never get rated); only an actively
             -- poor rating disqualifies. Suggesting something they gave two
             -- stars would be worse than saying nothing.
             and (rr.stars is null or rr.stars >= 4)
           order by r.id, cl.cooked_at desc
           limit 3
        ) s
    ), '[]'::jsonb),

    -- ── Rediscovery for W4 ───────────────────────────────────────────────
    -- Saved, old enough to count as forgotten, never once planned. The 14-day
    -- floor stops us nagging about something saved on Thursday.
    'orphan_recipes', coalesce((
      select jsonb_agg(x order by x->>'created_at' desc)
        from (
          select jsonb_build_object(
                   'id',         r.id,
                   'name',       r.name,
                   'image_url',  r.image_url,
                   'prep_time',  coalesce(r.prep_time, 0) + coalesce(r.cook_time, 0),
                   'created_at', r.created_at,
                   'days_since_saved', (p_local_date - (r.created_at at time zone v_tz)::date)
                 ) as x
            from public.recipes r
           where r.user_id = p_user_id
             and r.is_saved = true
             and (r.created_at at time zone v_tz)::date between (p_local_date - 90) and (p_local_date - 14)
             and not exists (
               select 1 from public.meal_slots ms
                where ms.user_id = p_user_id and ms.recipe_id = r.id
             )
           order by r.created_at desc
           limit 3
        ) s
    ), '[]'::jsonb),

    'orphan_count', (
      select count(*)
        from public.recipes r
       where r.user_id = p_user_id
         and r.is_saved = true
         and (r.created_at at time zone v_tz)::date between (p_local_date - 90) and (p_local_date - 14)
         and not exists (
           select 1 from public.meal_slots ms
            where ms.user_id = p_user_id and ms.recipe_id = r.id
         )
    ),

    -- ── Recap strip ──────────────────────────────────────────────────────
    'recap', jsonb_build_object(
      'planned_this_week', (
        select count(*) from public.meal_slots ms
         where ms.user_id = p_user_id and ms.recipe_id is not null
           and ms.date between v_this_monday and v_this_monday + 6
      ),
      'cooked_this_week', (
        select count(*) from public.cooking_logs cl
         where cl.user_id = p_user_id and cl.status = 'cooked'
           and (cl.cooked_at at time zone v_tz)::date between v_this_monday and v_this_monday + 6
      ),
      'recipes_added_this_week', (
        select count(*) from public.recipes r
         where r.user_id = p_user_id
           and (r.created_at at time zone v_tz)::date between v_this_monday and v_this_monday + 6
      )
    ),

    -- Proof of an existing planning habit — W3 requires one, so we never send
    -- "plan next week" to somebody who has never planned a week.
    'planning_event_count', (
      select count(*) from public.planning_events pe
       where pe.user_id = p_user_id
         and (pe.created_at at time zone v_tz)::date >= (p_local_date - 28)
    ),
    'library_count', (
      select count(*) from public.recipes r where r.user_id = p_user_id
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.compute_weekly_signals(uuid, date, text) from public, anon, authenticated;
grant execute on function public.compute_weekly_signals(uuid, date, text) to service_role;

-- ---------------------------------------------------------------------------
-- MONTHLY SIGNALS
--
-- `p_month_start` is the first day of the month being summarised (i.e. the
-- month that just ended, not the one we are in).
-- ---------------------------------------------------------------------------
create or replace function public.compute_monthly_signals(
  p_user_id     uuid,
  p_month_start date,
  p_timezone    text default 'UTC'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month_end  date;
  v_result     jsonb;
  v_first_name text;
  v_tz         text;
begin
  v_month_end := (p_month_start + interval '1 month')::date - 1;

  -- Same reason as compute_weekly_signals, and it matters more here: the
  -- "you usually plan on a Saturday" line is derived from extract(dow), and
  -- computed in the server's zone a US user planning at 8pm Saturday reads as
  -- Sunday. Validated once so a bad IANA name degrades to UTC rather than
  -- aborting the whole month.
  begin
    perform now() at time zone p_timezone;
    v_tz := p_timezone;
  exception when others then
    v_tz := 'UTC';
  end;

  select coalesce(nullif(split_part(coalesce(u.name, ''), ' ', 1), ''), null)
    into v_first_name
    from public.users u
   where u.id = p_user_id;

  select jsonb_build_object(
    'first_name', v_first_name,
    'month_name', to_char(p_month_start, 'FMMonth'),
    'month_start', p_month_start,
    'month_end',   v_month_end,

    'planned_meal_count', (
      select count(*) from public.meal_slots ms
       where ms.user_id = p_user_id and ms.recipe_id is not null
         and ms.date between p_month_start and v_month_end
    ),
    'distinct_recipe_count', (
      select count(distinct ms.recipe_id) from public.meal_slots ms
       where ms.user_id = p_user_id and ms.recipe_id is not null
         and ms.date between p_month_start and v_month_end
    ),
    'cooked_count', (
      select count(*) from public.cooking_logs cl
       where cl.user_id = p_user_id and cl.status = 'cooked'
         and (cl.cooked_at at time zone v_tz)::date between p_month_start and v_month_end
    ),
    'new_recipe_count', (
      select count(*) from public.recipes r
       where r.user_id = p_user_id
         and (r.created_at at time zone v_tz)::date between p_month_start and v_month_end
    ),
    'library_count', (
      select count(*) from public.recipes r where r.user_id = p_user_id
    ),

    -- Distinct calendar weeks touched. Two thin weeks is a month; one busy
    -- day is not, and a recap of one day would be embarrassing.
    'active_weeks', (
      select count(distinct date_trunc('week', ms.date))
        from public.meal_slots ms
       where ms.user_id = p_user_id and ms.recipe_id is not null
         and ms.date between p_month_start and v_month_end
    ),

    -- The Wrapped moment: the dish that kept coming back.
    'most_planned_recipe', (
      select jsonb_build_object(
               'id', r.id, 'name', r.name, 'image_url', r.image_url,
               'count', c.cnt
             )
        from (
          select ms.recipe_id, count(*) as cnt
            from public.meal_slots ms
           where ms.user_id = p_user_id and ms.recipe_id is not null
             and ms.date between p_month_start and v_month_end
           group by ms.recipe_id
           order by cnt desc, ms.recipe_id
           limit 1
        ) c
        join public.recipes r on r.id = c.recipe_id
    ),

    -- Modal cuisine tag across the month's planned recipes.
    'favourite_cuisine', (
      select tag_match
        from (
          select initcap(t.tag) as tag_match, count(*) as cnt
            from public.meal_slots ms
            join public.recipes r on r.id = ms.recipe_id
            cross join lateral unnest(r.tags) as t(tag)
           where ms.user_id = p_user_id
             and ms.date between p_month_start and v_month_end
             and lower(t.tag) = any (
               select lower(v) from unnest(public.engagement_cuisine_vocab()) v
             )
           group by 1
           order by cnt desc, 1
           limit 1
        ) s
    ),

    -- Modal day-of-week of planning sessions — mirrors computePlanningHabit().
    -- Only meaningful with 3+ events; below that it is noise dressed as
    -- insight, so the edge function suppresses the line.
    'usual_plan_dow', (
      select extract(dow from (pe.created_at at time zone v_tz))::int
        from public.planning_events pe
       where pe.user_id = p_user_id
         and (pe.created_at at time zone v_tz)::date between p_month_start and v_month_end
       group by 1
      having count(*) >= 3
       order by count(*) desc
       limit 1
    ),
    'planning_event_count', (
      select count(*) from public.planning_events pe
       where pe.user_id = p_user_id
         and (pe.created_at at time zone v_tz)::date between p_month_start and v_month_end
    ),

    -- Fallback for the rediscovery variant: something they genuinely liked
    -- and have quietly stopped cooking.
    'dormant_favourite', (
      select jsonb_build_object(
               'id', r.id, 'name', r.name, 'image_url', r.image_url,
               'cook_count', d.cook_count,
               'gap_days', (v_month_end - d.last_planned)
             )
        from (
          select cl.recipe_id,
                 count(*) as cook_count,
                 (select max(ms.date) from public.meal_slots ms
                   where ms.user_id = p_user_id and ms.recipe_id::text = cl.recipe_id
                 ) as last_planned
            from public.cooking_logs cl
           where cl.user_id = p_user_id and cl.status = 'cooked'
             and cl.recipe_id is not null
           group by cl.recipe_id
          having count(*) >= 3
        ) d
        join public.recipes r on r.id::text = d.recipe_id
       where d.last_planned is not null
         and d.last_planned < (v_month_end - 45)
       order by d.cook_count desc
       limit 1
    ),

    -- Top three of the month, for the "start next month from these" CTA.
    'top_recipes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'name', r.name, 'image_url', r.image_url, 'count', c.cnt
             ) order by c.cnt desc)
        from (
          select ms.recipe_id, count(*) as cnt
            from public.meal_slots ms
           where ms.user_id = p_user_id and ms.recipe_id is not null
             and ms.date between p_month_start and v_month_end
           group by ms.recipe_id
           order by cnt desc
           limit 3
        ) c
        join public.recipes r on r.id = c.recipe_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.compute_monthly_signals(uuid, date, text) from public, anon, authenticated;
grant execute on function public.compute_monthly_signals(uuid, date, text) to service_role;

-- ============================================================================
-- CAMPAIGN SEEDS
--
-- All disabled. Enabling is a deliberate act: `update engagement_campaigns
-- set enabled = true where campaign_id = '...'`. A migration that switched on
-- outbound email to the whole user base would be a very bad migration.
-- ============================================================================
insert into public.engagement_campaigns (
  campaign_id, name, period, enabled, priority, send_dow, send_nth_of_month,
  min_data, suppression, subject_template, preheader_template,
  body_blocks, cta_route, cta_label
) values
(
  'weekly_plan_unfinished',
  'Weekly · unfinished plan',
  'weekly', false, 100, 6, null,
  -- Needs something started AND a finished week on record to compare against.
  '{"planned_count_min": 1, "requires_complete_prior_week": true}'::jsonb,
  '{"cooldown_days": 5, "recent_activity_hours": 6, "max_inactive_days": 21}'::jsonb,
  'Next week is {{planned_count}} of {{typical_count}} planned',
  '{{unplanned_day_count}} days still open — pick up where you left off.',
  '["hero_plan_unfinished", "recap_strip", "rediscovery_card"]'::jsonb,
  'plan', 'Finish next week'
),
(
  'weekly_grocery_ready',
  'Weekly · grocery list ready to build',
  'weekly', false, 90, 6, null,
  '{"planned_count_min": 3}'::jsonb,
  '{"cooldown_days": 5, "recent_activity_hours": 6, "max_inactive_days": 21}'::jsonb,
  '{{planned_count}} meals planned — your list is ready to build',
  'We''ve combined the ingredients across all of them.',
  '["hero_grocery_ready", "recap_strip"]'::jsonb,
  'grocery', 'Open your list'
),
(
  'weekly_plan_next_week',
  'Weekly · plan next week with a head start',
  'weekly', false, 70, 6, null,
  -- The head start is mandatory. No repeat candidate, no send — otherwise
  -- this is just "you forgot", weekly, forever.
  '{"repeat_candidates_min": 1, "library_count_min": 3, "planning_event_count_min": 1}'::jsonb,
  '{"cooldown_days": 5, "recent_activity_hours": 6, "max_inactive_days": 21}'::jsonb,
  'Start next week with {{repeat_candidate_1}}',
  'Three meals that went down well — one tap to reuse them.',
  '["hero_plan_next_week", "rediscovery_card", "grocery_preview"]'::jsonb,
  'plan', 'Plan next week'
),
(
  'weekly_saved_rediscovery',
  'Weekly · saved but never planned',
  'weekly', false, 40, 6, null,
  -- Two, not one: a single orphan is as likely to be a mis-save as a
  -- forgotten favourite.
  '{"orphan_count_min": 2}'::jsonb,
  '{"cooldown_days": 5, "recent_activity_hours": 6, "max_inactive_days": 21, "recipe_cooldown_days": 60}'::jsonb,
  '{{recently_saved_recipe}} is still waiting',
  'Saved {{days_since_saved}} days ago and never planned.',
  '["hero_rediscovery", "recap_strip"]'::jsonb,
  'recipe', 'See the recipe'
),
(
  'monthly_meal_story',
  'Monthly · your month in meals',
  'monthly', false, 100, 3, 1,
  -- Strict on purpose. "Here is your month on PlanNplate" against four meals
  -- is worse than silence.
  '{"planned_meal_count_min": 8, "distinct_recipe_count_min": 4, "active_weeks_min": 2}'::jsonb,
  '{"cooldown_days": 5, "recent_activity_hours": 6, "max_inactive_days": 21}'::jsonb,
  'Your {{month_name}}: {{planned_meal_count}} meals, {{distinct_recipe_count}} recipes',
  '{{most_planned_recipe}} came up {{most_planned_count}} times.',
  '["hero_monthly_story"]'::jsonb,
  'plan', 'Plan from your favourites'
)
on conflict (campaign_id) do nothing;
