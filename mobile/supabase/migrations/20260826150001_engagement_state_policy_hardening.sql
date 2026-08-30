-- The app only needs to read, create, and update the signed-in user's own
-- engagement preferences. Keep anonymous API callers out entirely, avoid an
-- accidental DELETE resetting opt-outs, and evaluate auth.uid() once per
-- statement rather than once per row.

drop policy if exists user_engagement_state_owner
  on public.user_engagement_state;

revoke all on public.user_engagement_state from anon, authenticated;
grant select, insert, update on public.user_engagement_state to authenticated;

create policy user_engagement_state_select_own
  on public.user_engagement_state
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy user_engagement_state_insert_own
  on public.user_engagement_state
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_engagement_state_update_own
  on public.user_engagement_state
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
