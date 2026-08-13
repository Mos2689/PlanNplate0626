-- Scoped credentials for the iOS share extension.
--
-- The extension runs in its own process and needs to reach the backend to turn a
-- shared link into a recipe. It must NOT carry the user's Supabase session to do
-- that: a session token opens the whole account, and an extension is a much
-- larger attack surface than the app (it is launched by arbitrary third-party
-- apps, with whatever content they hand it).
--
-- So it gets a credential that can do exactly one thing — resolve to a user id
-- for a recipe import — and can be revoked without touching the session.
--
-- Only the SHA-256 hash is stored. A database leak yields hashes, not usable
-- credentials, and the plaintext lives solely in the device Keychain.

create table if not exists public.share_import_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Hex SHA-256 of the 32-byte token. Never the token itself.
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

-- The edge function's hot path: hash → user, skipping revoked rows entirely.
create index if not exists share_import_tokens_active_hash_idx
  on public.share_import_tokens (token_hash)
  where revoked_at is null;

-- Sign-out revokes every token for the account, so this ordering matters.
create index if not exists share_import_tokens_user_idx
  on public.share_import_tokens (user_id);

alter table public.share_import_tokens enable row level security;

drop policy if exists "own tokens are readable" on public.share_import_tokens;
create policy "own tokens are readable"
  on public.share_import_tokens for select
  using (auth.uid() = user_id);

drop policy if exists "own tokens can be minted" on public.share_import_tokens;
create policy "own tokens can be minted"
  on public.share_import_tokens for insert
  with check (auth.uid() = user_id);

drop policy if exists "own tokens can be revoked" on public.share_import_tokens;
create policy "own tokens can be revoked"
  on public.share_import_tokens for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own tokens can be deleted" on public.share_import_tokens;
create policy "own tokens can be deleted"
  on public.share_import_tokens for delete
  using (auth.uid() = user_id);

-- Verification runs in the edge function under the service role, which bypasses
-- RLS by design: the caller presents a token, not a session, so there is no
-- `auth.uid()` to match against.

comment on table public.share_import_tokens is
  'Revocable, import-only credentials for the iOS share extension. Hash only; plaintext lives in the device Keychain.';
