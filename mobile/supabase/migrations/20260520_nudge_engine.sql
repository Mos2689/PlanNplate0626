-- ============================================================
-- Nudge Engine schema: cooking_logs + recipe_ratings
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ---------- DROP (clean slate) ----------
drop table if exists public.cooking_logs cascade;
drop table if exists public.recipe_ratings cascade;

-- ---------- COOKING LOGS ----------
create table public.cooking_logs (
  id                 uuid primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  slot_id            text not null,
  recipe_id          text,
  status             text not null check (status in ('cooked', 'skipped', 'swapped')),
  cooked_at          timestamptz not null default now(),
  skip_reason        text check (skip_reason in (
                       'no_time',
                       'didnt_feel_like',
                       'missing_ingredients',
                       'takeout',
                       'leftovers'
                     )),
  actual_meal_eaten  text,
  created_at         timestamptz not null default now()
);

create index cooking_logs_user_cooked_at_idx
  on public.cooking_logs (user_id, cooked_at desc);

alter table public.cooking_logs enable row level security;

create policy "cooking_logs_owner"
  on public.cooking_logs
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- RECIPE RATINGS ----------
create table public.recipe_ratings (
  id          uuid primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  recipe_id   text not null,
  stars       int  not null check (stars between 1 and 5),
  cook_again  text check (cook_again in ('yes', 'maybe', 'no')),
  rated_at    timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (user_id, recipe_id)
);

create index recipe_ratings_user_idx
  on public.recipe_ratings (user_id);

alter table public.recipe_ratings enable row level security;

create policy "recipe_ratings_owner"
  on public.recipe_ratings
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- VERIFY ----------
-- Quick sanity check; should return 2 rows.
select tablename, rowsecurity
from   pg_tables
where  schemaname = 'public'
and    tablename in ('cooking_logs', 'recipe_ratings');
