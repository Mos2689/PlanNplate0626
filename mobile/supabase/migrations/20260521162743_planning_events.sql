create table public.planning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  days int not null,
  meal_types text[] not null default '{}'
);
alter table public.planning_events enable row level security;
create policy "planning_events_owner" on planning_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index planning_events_user_idx
  on public.planning_events (user_id, created_at desc);
