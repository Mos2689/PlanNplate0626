-- Supabase Database Schema for Meal Planning App
-- Run this SQL in your Supabase SQL Editor (Dashboard > SQL Editor)

-- Enable Row Level Security
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret';

-- Users Table for Premium Subscriptions and Account Management
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  is_premium BOOLEAN DEFAULT FALSE,
  premium_expires_at TIMESTAMPTZ,
  revenuecat_customer_id TEXT,
  account_status TEXT DEFAULT 'active' CHECK (account_status IN ('active', 'paused', 'deleted')),
  paused_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own data" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_is_premium ON users(is_premium);
CREATE INDEX IF NOT EXISTS idx_users_revenuecat_customer_id ON users(revenuecat_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);

-- User Preferences Table
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  dietary_restrictions TEXT[] DEFAULT '{}',
  cuisine_preferences TEXT[] DEFAULT '{}',
  allergies TEXT[] DEFAULT '{}',
  serving_size INTEGER DEFAULT 2,
  cooking_skill_level TEXT DEFAULT 'intermediate' CHECK (cooking_skill_level IN ('beginner', 'intermediate', 'advanced')),
  meal_prep_time TEXT DEFAULT 'moderate' CHECK (meal_prep_time IN ('quick', 'moderate', 'elaborate')),
  has_completed_onboarding BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recipes Table
CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  cook_time INTEGER DEFAULT 0,
  prep_time INTEGER DEFAULT 0,
  servings INTEGER DEFAULT 2,
  ingredients JSONB DEFAULT '[]',
  instructions TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  calories INTEGER,
  is_ai_generated BOOLEAN DEFAULT false,
  is_saved BOOLEAN DEFAULT true,
  is_imported BOOLEAN DEFAULT false,
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Meal Slots Table
CREATE TABLE IF NOT EXISTS meal_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  custom_meal_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date, meal_type)
);

-- Grocery Items Table
CREATE TABLE IF NOT EXISTS grocery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  category TEXT DEFAULT 'other' CHECK (category IN ('produce', 'dairy', 'meat', 'pantry', 'frozen', 'bakery', 'other')),
  is_checked BOOLEAN DEFAULT false,
  recipe_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security on all tables
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE grocery_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_preferences
CREATE POLICY "Users can view own preferences" ON user_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences" ON user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences" ON user_preferences
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own preferences" ON user_preferences
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for recipes
CREATE POLICY "Users can view own recipes" ON recipes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recipes" ON recipes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recipes" ON recipes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own recipes" ON recipes
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for meal_slots
CREATE POLICY "Users can view own meal slots" ON meal_slots
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meal slots" ON meal_slots
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meal slots" ON meal_slots
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own meal slots" ON meal_slots
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for grocery_items
CREATE POLICY "Users can view own grocery items" ON grocery_items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own grocery items" ON grocery_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own grocery items" ON grocery_items
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own grocery items" ON grocery_items
  FOR DELETE USING (auth.uid() = user_id);

-- Saved Grocery Lists Table
CREATE TABLE IF NOT EXISTS saved_grocery_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  items JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security on saved_grocery_lists
ALTER TABLE saved_grocery_lists ENABLE ROW LEVEL SECURITY;

-- RLS Policies for saved_grocery_lists
CREATE POLICY "Users can view own saved lists" ON saved_grocery_lists
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved lists" ON saved_grocery_lists
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saved lists" ON saved_grocery_lists
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved lists" ON saved_grocery_lists
  FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON recipes(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_slots_user_id ON meal_slots(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_slots_date ON meal_slots(date);
CREATE INDEX IF NOT EXISTS idx_grocery_items_user_id ON grocery_items(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_grocery_lists_user_id ON saved_grocery_lists(user_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recipes_updated_at
  BEFORE UPDATE ON recipes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meal_slots_updated_at
  BEFORE UPDATE ON meal_slots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_grocery_items_updated_at
  BEFORE UPDATE ON grocery_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_saved_grocery_lists_updated_at
  BEFORE UPDATE ON saved_grocery_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
