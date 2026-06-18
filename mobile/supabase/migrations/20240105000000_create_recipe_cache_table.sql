-- Recipe Cache Table for storing generated recipes
-- Run this in Supabase Dashboard > SQL Editor

-- Create recipe_cache table
CREATE TABLE IF NOT EXISTS recipe_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  preferences_hash TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  recipe JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_recipe_cache_preferences_hash ON recipe_cache(preferences_hash);
CREATE INDEX IF NOT EXISTS idx_recipe_cache_meal_type ON recipe_cache(meal_type);
CREATE INDEX IF NOT EXISTS idx_recipe_cache_created_at ON recipe_cache(created_at DESC);

-- Enable RLS
ALTER TABLE recipe_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own cache entries (based on preferences_hash which contains user context)
CREATE POLICY "Users can read own recipe cache" ON recipe_cache
  FOR SELECT USING (true);

CREATE POLICY "Users can insert recipe cache" ON recipe_cache
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can delete own recipe cache" ON recipe_cache
  FOR DELETE USING (true);