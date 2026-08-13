-- Support v1 — threads, messages, agents, push tokens.
--
-- Shaped as threads + messages from the start rather than a flat
-- `support_requests` table. A single-row-per-report design would have to be
-- rewritten the moment agents can reply, and replies are in scope for v1 (the
-- admin console at admin.plannplate.com.au answers from the same record the
-- user sees). The cost of the second table now is one join; the cost later is a
-- migration of live support history.
--
-- Nothing here is ever shown to the user as an identifier. `id` exists for
-- routing and for the admin console; the app never renders it. That is a
-- product rule, not a technical one — see docs/SUPPORT_V1.md.

-- ── Threads ────────────────────────────────────────────────────────────────
create table if not exists public.support_threads (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,

  -- The user's intent, not a support category. Three values, chosen at the
  -- entry point rather than by asking the user to classify their own problem.
  type             text not null check (type in ('bug', 'question', 'idea')),

  -- Agent-facing workflow state. Deliberately three values: anything richer
  -- (priority, assignment, SLA) is admin-product complexity this team does not
  -- have the headcount to operate.
  status           text not null default 'new'
                     check (status in ('new', 'open', 'resolved')),

  -- First 80 characters of the opening message, denormalised so the admin
  -- inbox can render a list without fetching every thread's messages.
  subject          text not null,

  -- Product area the request came from: 'recipe-import', 'grocery',
  -- 'app-shell', 'faq:04', … Mirrors `Failure.feature` from lib/failure/types
  -- so support volume and failure telemetry group on the same key.
  feature          text,

  -- Sanitised diagnostics. Built ONLY by lib/support/diagnostics-policy.ts,
  -- which is an allowlist — see that file and its test for what may appear
  -- here. Never contains recipe content, dish names or free text from
  -- elsewhere in the app.
  context          jsonb not null default '{}'::jsonb,

  last_message_at  timestamptz not null default now(),

  -- Drives the unread dot in the app. Set by support-reply when an agent
  -- answers, cleared when the user opens the thread.
  unread_for_user  boolean not null default false,

  created_at       timestamptz not null default now()
);

-- ── Messages ───────────────────────────────────────────────────────────────
create table if not exists public.support_messages (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.support_threads(id) on delete cascade,

  author       text not null check (author in ('user', 'agent')),
  -- Set only for agent messages. Kept for internal accountability; the app
  -- never renders it — replies appear as "PlanNplate", not as a named person.
  agent_id     uuid references auth.users(id),

  body         text not null,

  -- [{ path, width, height, bytes }] in the private support-attachments
  -- bucket. Paths, never signed URLs — signatures expire, so they are minted
  -- at read time.
  attachments  jsonb not null default '[]'::jsonb,

  created_at   timestamptz not null default now()
);

-- ── Agents ─────────────────────────────────────────────────────────────────
-- Membership here is what grants access to every other user's threads, so it
-- is the single authorization decision in the whole system. Rows are created
-- by hand in the Supabase dashboard; there is deliberately no self-service
-- path into this table.
create table if not exists public.support_agents (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  name      text not null,
  active    boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Push tokens ────────────────────────────────────────────────────────────
-- One row per device. `token` is unique so a device that moves between
-- accounts (shared phone, re-signup) doesn't end up delivering one user's
-- support replies to another's notification tray.
create table if not exists public.user_push_tokens (
  token       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text not null check (platform in ('ios', 'android')),
  updated_at  timestamptz not null default now()
);

-- ── Row level security ─────────────────────────────────────────────────────
alter table public.support_threads  enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_agents   enable row level security;
alter table public.user_push_tokens enable row level security;

-- Stable, indexable agent check. Written as a security-definer function rather
-- than an inline EXISTS so the agent policies can read support_agents without
-- needing their own SELECT policy on it — which would otherwise be a way to
-- enumerate staff accounts.
create or replace function public.is_support_agent()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.support_agents
    where user_id = auth.uid() and active
  );
$$;

-- Revoke from the NAMED roles, not just PUBLIC. Supabase's default privileges
-- grant EXECUTE directly to anon / authenticated / service_role when a function
-- is created, and `revoke ... from public` does not remove a direct grant to a
-- named role — which left this SECURITY DEFINER function callable by anonymous
-- callers over /rest/v1/rpc/. See 20260814000002 for the fix applied to the
-- already-deployed database.
revoke all on function public.is_support_agent() from public;
revoke all on function public.is_support_agent() from anon;
grant execute on function public.is_support_agent() to authenticated;
grant execute on function public.is_support_agent() to service_role;

-- Threads: a user reaches their own; an agent reaches all.
drop policy if exists "support_threads_owner" on public.support_threads;
create policy "support_threads_owner" on public.support_threads
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "support_threads_agent" on public.support_threads;
create policy "support_threads_agent" on public.support_threads
  for all
  using (public.is_support_agent())
  with check (public.is_support_agent());

-- Messages: reachable through a thread the caller can reach. The `author`
-- check on INSERT stops a user from writing a message that appears to come
-- from the team — without it, RLS would happily let someone forge a reply into
-- their own thread and screenshot it.
drop policy if exists "support_messages_owner" on public.support_messages;
create policy "support_messages_owner" on public.support_messages
  for select
  using (
    exists (
      select 1 from public.support_threads t
      where t.id = thread_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "support_messages_owner_insert" on public.support_messages;
create policy "support_messages_owner_insert" on public.support_messages
  for insert
  with check (
    author = 'user'
    and agent_id is null
    and exists (
      select 1 from public.support_threads t
      where t.id = thread_id and t.user_id = auth.uid()
    )
  );

drop policy if exists "support_messages_agent" on public.support_messages;
create policy "support_messages_agent" on public.support_messages
  for all
  using (public.is_support_agent())
  with check (public.is_support_agent());

-- Agents: only agents can see the roster.
drop policy if exists "support_agents_self" on public.support_agents;
create policy "support_agents_self" on public.support_agents
  for select
  using (public.is_support_agent());

-- Push tokens: strictly own-row.
drop policy if exists "user_push_tokens_owner" on public.user_push_tokens;
create policy "user_push_tokens_owner" on public.user_push_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Indexes ────────────────────────────────────────────────────────────────
-- The app's "your conversations" list.
create index if not exists support_threads_user_idx
  on public.support_threads (user_id, last_message_at desc);

-- The admin inbox, which is always filtered by status.
create index if not exists support_threads_status_idx
  on public.support_threads (status, last_message_at desc);

create index if not exists support_messages_thread_idx
  on public.support_messages (thread_id, created_at);

create index if not exists user_push_tokens_user_idx
  on public.user_push_tokens (user_id);
