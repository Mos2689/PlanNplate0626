-- =============================================================================
-- AUTO USER CREATION TRIGGER FOR SUPABASE
-- =============================================================================
-- This SQL creates a database trigger that automatically creates an entry in the
-- 'users' table whenever a new user signs up via Supabase Auth.
--
-- Run this SQL in your Supabase SQL Editor (Dashboard > SQL Editor)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: Create a logging table for debugging user creation
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_creation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID,
  email TEXT,
  action TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'success', 'error', 'skipped')),
  error_message TEXT,
  error_details JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster log queries
CREATE INDEX IF NOT EXISTS idx_user_creation_logs_auth_user_id ON user_creation_logs(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_user_creation_logs_status ON user_creation_logs(status);
CREATE INDEX IF NOT EXISTS idx_user_creation_logs_created_at ON user_creation_logs(created_at DESC);

-- Allow service role to insert logs (no RLS restrictions for logging)
ALTER TABLE user_creation_logs ENABLE ROW LEVEL SECURITY;

-- Policy to allow inserts from triggers (using service role)
CREATE POLICY "Allow trigger inserts" ON user_creation_logs
  FOR INSERT WITH CHECK (true);

-- Policy to allow admins/service role to read logs
CREATE POLICY "Allow service role to read logs" ON user_creation_logs
  FOR SELECT USING (true);

-- -----------------------------------------------------------------------------
-- STEP 2: Create the function that handles new user creation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  user_name TEXT;
  user_email TEXT;
  log_metadata JSONB;
BEGIN
  -- Log the start of user creation process
  log_metadata := jsonb_build_object(
    'trigger_name', TG_NAME,
    'trigger_op', TG_OP,
    'trigger_table', TG_TABLE_NAME,
    'raw_user_meta_data', NEW.raw_user_meta_data,
    'raw_app_meta_data', NEW.raw_app_meta_data
  );

  INSERT INTO user_creation_logs (auth_user_id, email, action, status, metadata)
  VALUES (NEW.id, NEW.email, 'handle_new_user_triggered', 'started', log_metadata);

  -- Extract user name from metadata or derive from email
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'user_name',
    split_part(NEW.email, '@', 1)
  );

  user_email := COALESCE(NEW.email, '');

  -- Log extracted values
  INSERT INTO user_creation_logs (auth_user_id, email, action, status, metadata)
  VALUES (
    NEW.id,
    user_email,
    'values_extracted',
    'success',
    jsonb_build_object('extracted_name', user_name, 'extracted_email', user_email)
  );

  -- Check if user already exists in users table
  IF EXISTS (SELECT 1 FROM public.users WHERE id = NEW.id) THEN
    INSERT INTO user_creation_logs (auth_user_id, email, action, status, metadata)
    VALUES (NEW.id, user_email, 'user_already_exists', 'skipped', jsonb_build_object('reason', 'User already exists in users table'));

    RETURN NEW;
  END IF;

  -- Insert the new user into the users table
  BEGIN
    INSERT INTO public.users (
      id,
      email,
      name,
      is_premium,
      account_status,
      created_at,
      updated_at
    ) VALUES (
      NEW.id,
      user_email,
      user_name,
      FALSE,
      'active',
      NOW(),
      NOW()
    );

    -- Log successful creation
    INSERT INTO user_creation_logs (auth_user_id, email, action, status, metadata)
    VALUES (
      NEW.id,
      user_email,
      'user_created_in_users_table',
      'success',
      jsonb_build_object(
        'user_id', NEW.id,
        'name', user_name,
        'email', user_email,
        'is_premium', FALSE,
        'account_status', 'active'
      )
    );

  EXCEPTION WHEN OTHERS THEN
    -- Log the error but don't fail the auth signup
    INSERT INTO user_creation_logs (
      auth_user_id,
      email,
      action,
      status,
      error_message,
      error_details
    )
    VALUES (
      NEW.id,
      user_email,
      'user_creation_failed',
      'error',
      SQLERRM,
      jsonb_build_object(
        'sql_state', SQLSTATE,
        'error_detail', SQLERRM,
        'attempted_values', jsonb_build_object(
          'id', NEW.id,
          'email', user_email,
          'name', user_name
        )
      )
    );

    -- Still return NEW to not block the auth signup
    -- The user can be created later via the app
  END;

  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- STEP 3: Create the trigger on auth.users table
-- -----------------------------------------------------------------------------
-- First, drop existing trigger if it exists to avoid duplicates
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger that fires AFTER a new user is inserted into auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- STEP 4: Grant necessary permissions
-- -----------------------------------------------------------------------------
-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;

-- Grant insert permission on users table for the function
GRANT INSERT ON public.users TO service_role;
GRANT INSERT ON public.users TO postgres;

-- Grant insert permission on logs table
GRANT INSERT ON public.user_creation_logs TO service_role;
GRANT INSERT ON public.user_creation_logs TO postgres;
GRANT SELECT ON public.user_creation_logs TO service_role;
GRANT SELECT ON public.user_creation_logs TO postgres;

-- -----------------------------------------------------------------------------
-- STEP 5: Backfill existing auth users who don't have entries in users table
-- -----------------------------------------------------------------------------
-- This will create user entries for any existing auth users who signed up
-- before this trigger was created

INSERT INTO public.users (id, email, name, is_premium, account_status, created_at, updated_at)
SELECT
  au.id,
  COALESCE(au.email, ''),
  COALESCE(
    au.raw_user_meta_data->>'name',
    au.raw_user_meta_data->>'full_name',
    split_part(au.email, '@', 1)
  ),
  FALSE,
  'active',
  COALESCE(au.created_at, NOW()),
  NOW()
FROM auth.users au
LEFT JOIN public.users u ON au.id = u.id
WHERE u.id IS NULL;

-- Log the backfill operation
INSERT INTO user_creation_logs (action, status, metadata)
VALUES (
  'backfill_existing_users',
  'success',
  jsonb_build_object(
    'description', 'Backfilled existing auth users without users table entries',
    'executed_at', NOW()
  )
);

-- -----------------------------------------------------------------------------
-- STEP 6: Helper function to manually sync a user (for debugging/recovery)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_auth_user_to_users_table(auth_user_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  auth_user RECORD;
  user_name TEXT;
  result JSONB;
BEGIN
  -- Get the auth user
  SELECT * INTO auth_user FROM auth.users WHERE id = auth_user_id;

  IF auth_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Auth user not found');
  END IF;

  -- Check if already exists
  IF EXISTS (SELECT 1 FROM public.users WHERE id = auth_user_id) THEN
    RETURN jsonb_build_object('success', true, 'message', 'User already exists in users table');
  END IF;

  -- Extract name
  user_name := COALESCE(
    auth_user.raw_user_meta_data->>'name',
    auth_user.raw_user_meta_data->>'full_name',
    split_part(auth_user.email, '@', 1)
  );

  -- Insert user
  INSERT INTO public.users (id, email, name, is_premium, account_status, created_at, updated_at)
  VALUES (auth_user_id, auth_user.email, user_name, FALSE, 'active', NOW(), NOW());

  -- Log the manual sync
  INSERT INTO user_creation_logs (auth_user_id, email, action, status, metadata)
  VALUES (auth_user_id, auth_user.email, 'manual_sync', 'success', jsonb_build_object('synced_by', 'sync_auth_user_to_users_table function'));

  RETURN jsonb_build_object(
    'success', true,
    'message', 'User created successfully',
    'user_id', auth_user_id,
    'email', auth_user.email,
    'name', user_name
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.sync_auth_user_to_users_table(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_auth_user_to_users_table(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- VERIFICATION QUERIES (Run these to verify the setup)
-- -----------------------------------------------------------------------------
--
-- 1. Check if trigger exists:
--    SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
--
-- 2. Check if function exists:
--    SELECT proname, prosrc FROM pg_proc WHERE proname = 'handle_new_user';
--
-- 3. View recent logs:
--    SELECT * FROM user_creation_logs ORDER BY created_at DESC LIMIT 20;
--
-- 4. Check for auth users without users table entries:
--    SELECT au.id, au.email, au.created_at
--    FROM auth.users au
--    LEFT JOIN users u ON au.id = u.id
--    WHERE u.id IS NULL;
--
-- 5. Manually sync a specific user:
--    SELECT sync_auth_user_to_users_table('user-uuid-here');
--
-- =============================================================================
