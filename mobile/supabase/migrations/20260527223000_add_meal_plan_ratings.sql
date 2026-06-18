-- =============================================================
-- meal_plan_ratings — per-user ratings on curated meal plans
-- Mirrors the recipe_ratings table; one row per (user, plan).
-- =============================================================

create table if not exists public.meal_plan_ratings (
  id           uuid primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  plan_id      text not null,
  stars        smallint not null check (stars between 1 and 5),
  cook_again   text check (cook_again in ('yes', 'maybe', 'no')),
  rated_at     timestamptz not null default now(),

  -- One rating per user per plan. The app's upsert uses this
  -- onConflict target to replace an existing rating in place
  -- when the user changes their mind.
  unique (user_id, plan_id)
);

-- Index for the "list all of my ratings" query path used at
-- app startup to rehydrate local state from the server.
create index if not exists meal_plan_ratings_user_idx
  on public.meal_plan_ratings (user_id);

-- Optional secondary index for future aggregation queries
-- ("what's the average rating across all users for plan X").
-- Cheap to add now; saves a migration later.
create index if not exists meal_plan_ratings_plan_idx
  on public.meal_plan_ratings (plan_id);

-- =============================================================
-- Row Level Security — users can only see/write their own rows
-- =============================================================

alter table public.meal_plan_ratings enable row level security;

create policy "Users can read their own meal_plan_ratings"
  on public.meal_plan_ratings
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own meal_plan_ratings"
  on public.meal_plan_ratings
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own meal_plan_ratings"
  on public.meal_plan_ratings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own meal_plan_ratings"
  on public.meal_plan_ratings
  for delete
  using (auth.uid() = user_id);
