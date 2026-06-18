-- Adds a stable, rename-proof identity column for curated-plan recipes.
--
-- Used by the app's addRecipe upsert (see src/lib/recipe-identity.ts) to
-- deduplicate recipes added from the same curated meal plan. When a user
-- applies the same curated plan to different weeks (or in a later session),
-- the recipe rows are reused instead of duplicated.
--
-- Additive and nullable: existing rows are unaffected, and the app already
-- tolerates this column being absent (insertRecipe retries without it), so
-- this migration is safe to run before or after the client deploy.

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS curated_source_id text;

-- Speeds up the (rare) server-side lookups by curated identity per user.
CREATE INDEX IF NOT EXISTS idx_recipes_user_curated_source
  ON recipes (user_id, curated_source_id);
