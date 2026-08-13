-- Support attachments bucket.
--
-- PRIVATE, unlike `recipe-images` and `avatars`. A support screenshot is
-- whatever happened to be on the user's screen when something broke — it can
-- contain their email address, a half-written message, or another app's
-- notification. Those are read through short-lived signed URLs minted for an
-- agent, never through a public URL.
--
-- Path convention: {user_id}/{timestamp}-{random}.jpg
-- The leading user_id segment is what every policy below keys on, via
-- storage.foldername(name)[1], and it is already what
-- supabase/functions/upload-file/index.ts writes — so support attachments ride
-- the existing upload path with no change to it.
--
-- There is no thread_id segment: attachments are uploaded from the composer
-- BEFORE the thread exists (the user attaches, then decides to send). The link
-- back to the thread lives on support_messages.attachments, and support-submit
-- verifies every submitted path begins with the caller's own id.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  10485760, -- 10 MB. The client compresses to ~300 KB; this is the hard ceiling.
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Users write and read only inside their own folder.
drop policy if exists "support_attachments_owner_insert" on storage.objects;
create policy "support_attachments_owner_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "support_attachments_owner_select" on storage.objects;
create policy "support_attachments_owner_select" on storage.objects
  for select
  using (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A user may withdraw an attachment they just added, before sending.
drop policy if exists "support_attachments_owner_delete" on storage.objects;
create policy "support_attachments_owner_delete" on storage.objects
  for delete
  using (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Agents read everything in the bucket so the admin console can show the
-- screenshot alongside the message. Read only — an agent has no reason to
-- write into a user's attachment folder.
drop policy if exists "support_attachments_agent_select" on storage.objects;
create policy "support_attachments_agent_select" on storage.objects
  for select
  using (
    bucket_id = 'support-attachments'
    and public.is_support_agent()
  );
