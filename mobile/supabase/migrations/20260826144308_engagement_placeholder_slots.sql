-- ============================================================================
-- Engagement signals: handle placeholder meal slots.
--
-- Found by running compute_weekly_signals against production, not by reading
-- the schema. `meal_slots.custom_meal_name` is not just free text — the planner
-- writes four kinds of labelled, recipe-less placeholder into it (see the
-- comment at src/lib/store.ts:915):
--
--     Skipped · Grab & go · Buy out · Leftovers · <dish>
--
-- Production currently holds 80 "Skipped", 42 "Grab & go", 14 "Buy out" and
-- several hundred "Leftovers · …" rows. That broke the weekly signals in two
-- separate ways:
--
--   1. WRONG CLAIM. `planned_count` counted only slots with a recipe_id, so a
--      user who fills every lunch with "Leftovers · X" — a completely planned
--      week, by their own deliberate choice — computed as 6 of 8 planned. The
--      email would have told them they were behind when they were not. That is
--      the single worst thing this system could say, and the campaign's own
--      `week_already_complete` guard could not catch it because the guard
--      compares two numbers that were both wrong in the same direction.
--
--   2. NONSENSE CONTENT. `planned_slots` feeds the week grid in the email
--      verbatim, so a slot the user explicitly marked "Skipped" would have been
--      rendered as that day's meal: "Tue — Skipped".
--
-- The rule adopted here: ANY explicit entry is a decision, and a decision is
-- not a gap. Only a genuinely empty slot counts as unplanned. Grocery-facing
-- counts stay keyed to recipe_id, because a leftovers slot has nothing to buy.
-- ============================================================================

-- Is this a slot the user actually intends to eat from?
--
-- "Skipped" is the one placeholder that is not a meal. It still counts as a
-- DECISION (so it never shows up as a gap to fill), but it must never be
-- rendered as the name of a meal.
create or replace function public.engagement_is_edible_slot(p_custom_meal_name text)
returns boolean
language sql
immutable
as $fn$
  select p_custom_meal_name is not null
     and btrim(p_custom_meal_name) <> ''
     and lower(btrim(p_custom_meal_name)) <> 'skipped';
$fn$;

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
as $fn$
declare
  v_this_monday   date;
  v_next_monday   date;
  v_next_sunday   date;
  v_result        jsonb;
  v_planned_ids   uuid[];
  v_recipe_count  int;
  v_filled_count  int;
  v_typical       int;
  v_first_name    text;
  v_tz            text;
begin
  -- meal_slots.date is a plain DATE, but cooking_logs.cooked_at,
  -- recipes.created_at and planning_events.created_at are timestamptz. A bare
  -- ::date cast uses the SERVER zone, which for a user west of UTC turns
  -- Saturday evening into Sunday. Validated once so a retired IANA name costs
  -- one exception per call rather than one per row.
  begin
    perform now() at time zone p_timezone;
    v_tz := p_timezone;
  exception when others then
    v_tz := 'UTC';
  end;

  v_this_monday := date_trunc('week', p_local_date)::date;
  v_next_monday := v_this_monday + 7;
  v_next_sunday := v_next_monday + 6;

  select coalesce(nullif(split_part(coalesce(u.name, ''), ' ', 1), ''), null)
    into v_first_name
    from public.users u
   where u.id = p_user_id;

  -- Recipes to shop for. Placeholders are excluded by construction: they carry
  -- no recipe_id, and a "Leftovers · X" slot has nothing to buy.
  select array_agg(distinct ms.recipe_id), count(*)
    into v_planned_ids, v_recipe_count
    from public.meal_slots ms
   where ms.user_id = p_user_id
     and ms.recipe_id is not null
     and ms.meal_type in ('lunch', 'dinner')
     and ms.date between v_next_monday and v_next_sunday;

  v_planned_ids  := coalesce(v_planned_ids, '{}');
  v_recipe_count := coalesce(v_recipe_count, 0);

  -- Slots the user has DECIDED, by any means. This is the number that answers
  -- "is your week sorted?", and the one the subject line quotes.
  select count(*)
    into v_filled_count
    from public.meal_slots ms
   where ms.user_id = p_user_id
     and ms.meal_type in ('lunch', 'dinner')
     and ms.date between v_next_monday and v_next_sunday
     and (ms.recipe_id is not null or ms.custom_meal_name is not null);

  v_filled_count := coalesce(v_filled_count, 0);

  -- What a full week looks like FOR THIS USER — median of the last four
  -- completed weeks, on the same "decided" basis as v_filled_count. Comparing
  -- a filled count against a recipe-only baseline is what produced the false
  -- "you're behind" claim in the first place.
  select coalesce(
           percentile_cont(0.5) within group (order by wk.cnt)::int,
           0
         )
    into v_typical
    from (
      select date_trunc('week', ms.date)::date as wk_start, count(*) as cnt
        from public.meal_slots ms
       where ms.user_id = p_user_id
         and ms.meal_type in ('lunch', 'dinner')
         and (ms.recipe_id is not null or ms.custom_meal_name is not null)
         and ms.date >= v_this_monday - 28
         and ms.date <  v_this_monday
       group by 1
    ) wk;

  select jsonb_build_object(
    'first_name',        v_first_name,
    'week_start',        v_next_monday,
    'week_end',          v_next_sunday,
    'week_name',         to_char(v_next_monday, 'FMMonth DD'),

    -- Decided slots. Drives W1 and the subject line.
    'planned_count',     v_filled_count,
    -- Recipe-bearing slots. Drives W2, because this is what generates a
    -- shopping list.
    'planned_recipe_count', v_recipe_count,
    'typical_count',     v_typical,
    'planned_recipe_ids', to_jsonb(v_planned_ids),

    -- Days with nothing decided at all. A day the user marked "Skipped" is
    -- handled, not open.
    'unplanned_day_count', (
      7 - (
        select count(distinct ms.date)
          from public.meal_slots ms
         where ms.user_id = p_user_id
           and (ms.recipe_id is not null or ms.custom_meal_name is not null)
           and ms.date between v_next_monday and v_next_sunday
      )
    ),

    'has_complete_prior_week', exists (
      select 1
        from (
          select date_trunc('week', ms.date)::date as wk_start, count(*) as cnt
            from public.meal_slots ms
           where ms.user_id = p_user_id
             and ms.meal_type in ('lunch', 'dinner')
             and (ms.recipe_id is not null or ms.custom_meal_name is not null)
             and ms.date >= v_this_monday - 56
             and ms.date <  v_next_monday
           group by 1
        ) w
       where w.cnt >= greatest(v_typical, 3)
    ),

    -- The week grid. "Skipped" is filtered out: it is a decision, not a dish,
    -- and printing it as one would read as a bug to the user.
    'planned_slots', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'date',      ms.date,
                 'dow',       to_char(ms.date, 'Dy'),
                 'meal_type', ms.meal_type,
                 'name',      coalesce(r.name, ms.custom_meal_name),
                 'image_url', r.image_url,
                 'is_recipe', (ms.recipe_id is not null)
               ) order by ms.date, ms.meal_type
             )
        from public.meal_slots ms
        left join public.recipes r on r.id = ms.recipe_id
       where ms.user_id = p_user_id
         and (
           ms.recipe_id is not null
           or public.engagement_is_edible_slot(ms.custom_meal_name)
         )
         and ms.date between v_next_monday and v_next_sunday
    ), '[]'::jsonb),

    'grocery_covered', (
      v_recipe_count > 0 and exists (
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
    'planned_ingredients', coalesce((
      select jsonb_agg(jsonb_build_object('recipe_id', r.id, 'ingredients', r.ingredients))
        from public.recipes r
       where r.id = any(v_planned_ids)
    ), '[]'::jsonb),

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
             and (rr.stars is null or rr.stars >= 4)
           order by r.id, cl.cooked_at desc
           limit 3
        ) s
    ), '[]'::jsonb),

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
$fn$;

revoke all on function public.compute_weekly_signals(uuid, date, text) from public, anon, authenticated;
grant execute on function public.compute_weekly_signals(uuid, date, text) to service_role;

-- W2 keys off recipes, not decided slots: a week of leftovers is fully planned
-- but generates no shopping list, and "your list is ready to build" against
-- zero ingredients is nonsense.
update public.engagement_campaigns
   set min_data = '{"planned_recipe_count_min": 3}'::jsonb,
       subject_template = '{{planned_recipe_count}} meals planned - your list is ready to build'
 where campaign_id = 'weekly_grocery_ready';
