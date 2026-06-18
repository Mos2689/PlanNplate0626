-- Add avatar_url and profile_completed columns to users table
-- These columns support the profile setup feature for new users
-- Migration: 2024-01-02 - Add user profile fields

-- Add avatar_url column for storing user profile photos or default avatar IDs
-- Stores either a URL from Vibecode storage or "default:{color_id}" for default avatars
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NULL;

-- Add profile_completed column to track if user has completed initial profile setup
-- Defaults to false for new users, set to true after user completes profile
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT false;

-- Add comments for documentation
COMMENT ON COLUMN users.avatar_url IS 'URL to user profile photo (from Vibecode storage) or "default:color_id" for default avatars (e.g., "default:sage", "default:terracotta"). Null if not set.';
COMMENT ON COLUMN users.profile_completed IS 'Boolean flag indicating whether user has completed initial profile setup (entered name and optionally photo)';

-- Create index on profile_completed for efficient queries
-- This helps quickly find users who still need to complete profile setup
CREATE INDEX IF NOT EXISTS idx_users_profile_completed ON users(profile_completed) WHERE profile_completed = false;

-- Add constraint check to ensure avatar_url is either null, a URL, or a default avatar reference
-- Allows URLs (http/https), storage URLs, and default:* format
ALTER TABLE users ADD CONSTRAINT check_avatar_url_format
  CHECK (
    avatar_url IS NULL
    OR avatar_url LIKE 'http://%'
    OR avatar_url LIKE 'https://%'
    OR avatar_url LIKE 'default:%'
  );

-- Update existing users who have a name to mark profile_completed as true
-- This ensures users who created accounts before this feature still work correctly
UPDATE users SET profile_completed = true WHERE name IS NOT NULL AND profile_completed = false;
