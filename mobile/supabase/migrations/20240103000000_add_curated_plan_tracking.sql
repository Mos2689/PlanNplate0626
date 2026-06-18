-- Add curated_plan_id column to meal_slots table
-- This tracks which curated meal plan a meal slot came from
-- Useful for analytics and audit trails

-- Add curated_plan_id column
ALTER TABLE meal_slots ADD COLUMN IF NOT EXISTS curated_plan_id TEXT NULL;

-- Add comment for documentation
COMMENT ON COLUMN meal_slots.curated_plan_id IS 'ID of the curated meal plan this meal slot originated from (for tracking and audit purposes)';

-- Create index on curated_plan_id for efficient queries
-- This helps quickly find all meals from a specific curated plan
CREATE INDEX IF NOT EXISTS idx_meal_slots_curated_plan_id ON meal_slots(curated_plan_id) WHERE curated_plan_id IS NOT NULL;

