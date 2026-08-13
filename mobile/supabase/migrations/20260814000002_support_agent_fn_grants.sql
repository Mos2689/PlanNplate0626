-- Tighten execute rights on public.is_support_agent().
--
-- 20260814000000 did:
--     revoke all on function public.is_support_agent() from public;
--     grant execute on function public.is_support_agent() to authenticated;
--
-- That was insufficient. Supabase's default privileges grant EXECUTE DIRECTLY
-- to anon / authenticated / service_role at creation time, and revoking from
-- PUBLIC does not remove a direct grant to a named role. The resulting ACL was
--     {postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
-- i.e. exactly what we thought we had prevented, and Supabase's security
-- linter flagged it (0028_anon_security_definer_function_executable).
--
-- The exposure was nil in practice: the function reads auth.uid(), which is
-- NULL for anon, so an unauthenticated call over /rest/v1/rpc/ always returns
-- false and reveals nothing about who is on the support team. But a
-- SECURITY DEFINER function reachable by anonymous callers is not something to
-- leave sitting in the linter, and the comment in the original migration
-- asserted a protection that did not exist.
--
-- Revoke from the named roles explicitly. `authenticated` keeps EXECUTE because
-- the RLS policies on support_threads / support_messages call this function as
-- the signed-in user.

revoke all on function public.is_support_agent() from public;
revoke all on function public.is_support_agent() from anon;

grant execute on function public.is_support_agent() to authenticated;
grant execute on function public.is_support_agent() to service_role;
