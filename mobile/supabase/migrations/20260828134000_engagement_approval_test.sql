-- One-shot, service-only approval pack configuration.
--
-- This does not enable a campaign and is never read by the hourly campaign
-- evaluator. The dispatcher atomically flips approval_test_enabled to false
-- before sending, so the same approval request cannot be replayed.
alter table public.engagement_settings
  add column if not exists approval_test_email text,
  add column if not exists approval_test_enabled boolean not null default false;

