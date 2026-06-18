-- Add persona / personalization columns to user_preferences table.
-- These columns power the onboarding personalization flow (household type,
-- cooking habits, budget, pantry staples, etc.). All are nullable so
-- existing rows continue to work without a backfill.
-- Migration: 2026-05-22 - Add persona columns to user_preferences

ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS household TEXT NULL;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS cooking_days_per_week INTEGER NULL;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS weeknight_minutes INTEGER NULL;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS equipment TEXT[] NULL;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS pantry_staples TEXT[] NULL;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS weekly_budget NUMERIC NULL;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS monthly_budget NUMERIC NULL;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS priorities TEXT[] NULL;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS adventure_level INTEGER NULL;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS goals TEXT[] NULL;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS explore_cuisines TEXT[] NULL;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS meal_habits JSONB NULL;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS has_used_free_trial BOOLEAN NULL DEFAULT false;
ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS onboarding_step INTEGER NULL;

-- Add comments for documentation
COMMENT ON COLUMN user_preferences.household IS 'Household type: solo, couple, family, roommates';
COMMENT ON COLUMN user_preferences.cooking_days_per_week IS 'Number of days per week the user cooks (1-7)';
COMMENT ON COLUMN user_preferences.weeknight_minutes IS 'Available cooking time on weeknights in minutes';
COMMENT ON COLUMN user_preferences.equipment IS 'Array of available kitchen equipment';
COMMENT ON COLUMN user_preferences.pantry_staples IS 'Array of pantry staple ingredients the user keeps on hand';
COMMENT ON COLUMN user_preferences.weekly_budget IS 'Weekly grocery budget amount';
COMMENT ON COLUMN user_preferences.monthly_budget IS 'Monthly grocery budget amount';
COMMENT ON COLUMN user_preferences.priorities IS 'Array of meal planning priorities (e.g., healthy, quick, budget)';
COMMENT ON COLUMN user_preferences.adventure_level IS 'How adventurous the user is with food (1-5 scale)';
COMMENT ON COLUMN user_preferences.goals IS 'Array of health/cooking goals';
COMMENT ON COLUMN user_preferences.explore_cuisines IS 'Array of cuisines the user wants to explore';
COMMENT ON COLUMN user_preferences.meal_habits IS 'JSON object with breakfast/lunch/dinner habits';
COMMENT ON COLUMN user_preferences.has_used_free_trial IS 'Whether the user has used their free trial plan generation';
COMMENT ON COLUMN user_preferences.onboarding_step IS 'Current step in the onboarding flow (for resuming)';
