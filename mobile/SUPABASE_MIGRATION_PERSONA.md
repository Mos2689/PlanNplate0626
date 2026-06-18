# Supabase migration — persona + free-trial columns

This migration adds the new persona-collection fields (Phase 2 onboarding) and
the free-trial gating flag to the existing `user_preferences` table. **The app
will keep working without this migration** — `database.ts` falls back to a
legacy upsert when the columns are missing — but recipes won't be tailored to
the persona until you run it, and the "first plan free" flag will not survive
re-installs.

## How to run

1. Open Supabase dashboard → your project → **SQL Editor**.
2. Paste the SQL below into a new query.
3. Click **Run**.

```sql
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS household                TEXT,
  ADD COLUMN IF NOT EXISTS cooking_days_per_week    INTEGER,
  ADD COLUMN IF NOT EXISTS weeknight_minutes        INTEGER,
  ADD COLUMN IF NOT EXISTS equipment                TEXT[],
  ADD COLUMN IF NOT EXISTS pantry_staples           TEXT[],
  ADD COLUMN IF NOT EXISTS weekly_budget            NUMERIC,
  ADD COLUMN IF NOT EXISTS monthly_budget           NUMERIC,
  ADD COLUMN IF NOT EXISTS priorities               TEXT[],
  ADD COLUMN IF NOT EXISTS adventure_level          INTEGER,
  ADD COLUMN IF NOT EXISTS goals                    TEXT[],
  ADD COLUMN IF NOT EXISTS explore_cuisines         TEXT[],
  ADD COLUMN IF NOT EXISTS meal_habits              JSONB,
  ADD COLUMN IF NOT EXISTS has_used_free_trial      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_step          INTEGER;

-- Optional: a soft check constraint on the household enum-like field.
-- Skip this block if you'd rather keep it unconstrained.
ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_household_check;
ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_household_check
  CHECK (household IS NULL OR household IN ('solo','couple','family_kids','roommates'));
```

## Column reference

| Column | Type | Used for |
|---|---|---|
| `household` | TEXT | Household type (solo / couple / family_kids / roommates) |
| `cooking_days_per_week` | INTEGER | 1–7 |
| `weeknight_minutes` | INTEGER | 15 / 30 / 45 / 60 / 90 |
| `equipment` | TEXT[] | Stove, oven, air fryer, instant pot, etc. |
| `pantry_staples` | TEXT[] | Items the user already keeps stocked |
| `weekly_budget` | NUMERIC | High-level $ target |
| `monthly_budget` | NUMERIC | High-level $ target |
| `priorities` | TEXT[] | Ordered top-2: time / cost / variety / health |
| `adventure_level` | INTEGER | 1–5 (familiar → adventurous) |
| `goals` | TEXT[] | Health / lifestyle goals |
| `explore_cuisines` | TEXT[] | Cuisines to explore (separate from preferred) |
| `meal_habits` | JSONB | `{ breakfast, lunch, dinner }` habits per meal |
| `has_used_free_trial` | BOOLEAN | Flips `true` after first grocery list — drives paywall |
| `onboarding_step` | INTEGER | Resume-where-you-left-off in the persona flow |

## Verifying

After running, you should see:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_preferences'
  AND column_name IN (
    'household','cooking_days_per_week','weeknight_minutes','equipment',
    'pantry_staples','weekly_budget','monthly_budget','priorities',
    'adventure_level','goals','explore_cuisines','meal_habits',
    'has_used_free_trial','onboarding_step'
  );
```

It should return 14 rows.

## Rolling back

```sql
ALTER TABLE public.user_preferences
  DROP COLUMN IF EXISTS household,
  DROP COLUMN IF EXISTS cooking_days_per_week,
  DROP COLUMN IF EXISTS weeknight_minutes,
  DROP COLUMN IF EXISTS equipment,
  DROP COLUMN IF EXISTS pantry_staples,
  DROP COLUMN IF EXISTS weekly_budget,
  DROP COLUMN IF EXISTS monthly_budget,
  DROP COLUMN IF EXISTS priorities,
  DROP COLUMN IF EXISTS adventure_level,
  DROP COLUMN IF EXISTS goals,
  DROP COLUMN IF EXISTS explore_cuisines,
  DROP COLUMN IF EXISTS meal_habits,
  DROP COLUMN IF EXISTS has_used_free_trial,
  DROP COLUMN IF EXISTS onboarding_step;
```
