-- Recipe Cache Table for Supabase
-- This table stores generated recipes with preferences hash for caching
-- Execute this SQL in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS recipe_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  preferencesHash VARCHAR(16) NOT NULL,
  mealType VARCHAR(50) NOT NULL,
  recipe JSONB NOT NULL,
  createdAt TIMESTAMP DEFAULT NOW(),

  -- Add indexes for fast queries
  CONSTRAINT recipe_cache_unique_recipe UNIQUE(preferencesHash, mealType, recipe)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_recipe_cache_preferences_hash ON recipe_cache(preferencesHash);
CREATE INDEX IF NOT EXISTS idx_recipe_cache_meal_type ON recipe_cache(mealType);
CREATE INDEX IF NOT EXISTS idx_recipe_cache_created_at ON recipe_cache(createdAt);
CREATE INDEX IF NOT EXISTS idx_recipe_cache_preferences_meal ON recipe_cache(preferencesHash, mealType);

-- Enable RLS (Row Level Security) - adjust based on your auth setup
ALTER TABLE recipe_cache ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all authenticated users to read/write to the cache
-- Modify this based on your security requirements
CREATE POLICY "Allow authenticated users to manage recipe cache" ON recipe_cache
  USING (true)
  WITH CHECK (true);

-- Optional: Create a trigger to automatically delete old cache entries
CREATE OR REPLACE FUNCTION delete_old_recipe_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM recipe_cache
  WHERE createdAt < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Note: You may need to set up a cron job or background task to regularly call delete_old_recipe_cache()
-- This keeps your cache table from growing indefinitely
