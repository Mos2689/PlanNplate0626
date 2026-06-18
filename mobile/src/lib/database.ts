import { supabase, isSupabaseConfigured } from './supabase';
import type {
  Recipe,
  MealSlot,
  GroceryItem,
  UserPreferences,
  Ingredient,
  CookingLog,
  RecipeRating,
  MealPlanRating,
  PlanningEvent,
} from './store';

// Helper function to generate unique IDs
const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

// ============ USER SUBSCRIPTION ============

export type AccountStatus = 'active' | 'paused' | 'deleted';

export interface DbUser {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  profile_completed: boolean;
  is_premium: boolean;
  premium_expires_at: string | null;
  revenuecat_customer_id: string | null;
  account_status: AccountStatus;
  paused_at: string | null;
  deleted_at: string | null;
  declined_trial: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserSubscription {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  profileCompleted: boolean;
  isPremium: boolean;
  premiumExpiresAt: string | null;
  revenuecatCustomerId: string | null;
  accountStatus: AccountStatus;
  pausedAt: string | null;
  deletedAt: string | null;
  declinedTrial: boolean;
  createdAt: string;
  updatedAt: string;
}

const mapDbUser = (db: DbUser): UserSubscription => ({
  id: db.id,
  email: db.email,
  name: db.name,
  avatarUrl: db.avatar_url,
  profileCompleted: db.profile_completed ?? false,
  isPremium: db.is_premium,
  premiumExpiresAt: db.premium_expires_at,
  revenuecatCustomerId: db.revenuecat_customer_id,
  accountStatus: db.account_status || 'active',
  pausedAt: db.paused_at,
  deletedAt: db.deleted_at,
  declinedTrial: db.declined_trial ?? false,
  createdAt: db.created_at,
  updatedAt: db.updated_at,
});

export async function fetchUserSubscription(userId: string): Promise<UserSubscription | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('Error fetching user subscription:', error);
    return null;
  }

  return mapDbUser(data as DbUser);
}

export async function upsertUser(
  userId: string,
  email: string,
  name?: string | null
): Promise<UserSubscription | null> {
  const timestamp = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    console.log(`[DB] ${timestamp} - Supabase not configured, skipping user upsert`);
    return null;
  }

  console.log(`[DB] ${timestamp} - START: Upserting user: ${JSON.stringify({ userId, email, name })}`);

  // First try to fetch existing user
  console.log(`[DB] ${timestamp} - Checking if user exists...`);
  const { data: existingUser, error: fetchError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    // PGRST116 = "not found" which is expected for new users
    console.error(`[DB] ${timestamp} - Error fetching user: ${fetchError.message}, code: ${fetchError.code}`);
  }

  if (existingUser) {
    console.log(`[DB] ${timestamp} - User exists, updating...`);
    // User exists, just update
    const { data, error } = await supabase
      .from('users')
      .update({
        email,
        name: name ?? existingUser.name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error(`[DB] ${timestamp} - ERROR updating user: ${error.message}, code: ${error.code}, details: ${JSON.stringify(error.details)}`);
      return mapDbUser(existingUser as DbUser); // Return existing user even if update fails
    }
    console.log(`[DB] ${timestamp} - SUCCESS: User updated`);
    return mapDbUser(data as DbUser);
  }

  // User doesn't exist, create new one
  console.log(`[DB] ${timestamp} - User not found, creating new user...`);

  const insertData = {
    id: userId,
    email,
    name: name ?? null,
    is_premium: false,
    account_status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  console.log(`[DB] ${timestamp} - INSERT DATA: ${JSON.stringify(insertData)}`);

  const { data, error } = await supabase
    .from('users')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error(`[DB] ${timestamp} - ERROR creating user:`);
    console.error(`[DB] ${timestamp} -   Message: ${error.message}`);
    console.error(`[DB] ${timestamp} -   Code: ${error.code}`);
    console.error(`[DB] ${timestamp} -   Details: ${JSON.stringify(error.details)}`);
    console.error(`[DB] ${timestamp} -   Hint: ${error.hint || 'none'}`);

    // If the error is due to RLS or missing table, log more details
    if (error.code === '42501') {
      console.error(`[DB] ${timestamp} - RLS VIOLATION: Permission denied - check RLS policies for users table`);
      console.error(`[DB] ${timestamp} - This usually means auth.uid() is NULL or doesn't match the user ID being inserted`);
    } else if (error.code === '42P01') {
      console.error(`[DB] ${timestamp} - TABLE MISSING: Table does not exist - ensure users table is created`);
    } else if (error.code === '23505') {
      // Duplicate key - user was created between our check and insert
      console.log(`[DB] ${timestamp} - RACE CONDITION: User already exists (created by concurrent call), fetching...`);
      const { data: raceUser } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      if (raceUser) {
        console.log(`[DB] ${timestamp} - SUCCESS: Retrieved user from race condition`);
        return mapDbUser(raceUser as DbUser);
      }
    }
    return null;
  }

  console.log(`[DB] ${timestamp} - SUCCESS: User created with ID: ${data?.id}`);
  return mapDbUser(data as DbUser);
}

export async function updateUserProfile(
  userId: string,
  updates: {
    name?: string;
    avatarUrl?: string | null;
    profileCompleted?: boolean;
  }
): Promise<UserSubscription | null> {
  if (!isSupabaseConfigured()) return null;

  const dbUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  // Only update name for now - avatar_url and profile_completed columns
  // may not exist in the database yet
  if (updates.name !== undefined) {
    dbUpdates.name = updates.name;
  }

  // Try to update avatar_url and profile_completed if they exist
  // These columns need to be added via migration
  if (updates.avatarUrl !== undefined) {
    dbUpdates.avatar_url = updates.avatarUrl;
  }

  if (updates.profileCompleted !== undefined) {
    dbUpdates.profile_completed = updates.profileCompleted;
  }

  // First try with all fields
  let { data, error } = await supabase
    .from('users')
    .update(dbUpdates)
    .eq('id', userId)
    .select('*')
    .single();

  // If error is about missing columns, retry with just name
  if (error && error.code === 'PGRST204') {
    console.log('[DB] avatar_url/profile_completed columns not found, updating name only');
    const nameOnlyUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.name !== undefined) {
      nameOnlyUpdate.name = updates.name;
    }

    const result = await supabase
      .from('users')
      .update(nameOnlyUpdate)
      .eq('id', userId)
      .select('*')
      .single();

    data = result.data;
    error = result.error;
  }

  if (error) {
    console.error('Error updating user profile:', error);
    return null;
  }

  // Map the data, filling in defaults for potentially missing fields
  const dbUser = data as DbUser;
  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    avatarUrl: updates.avatarUrl ?? dbUser.avatar_url ?? null,
    profileCompleted: updates.profileCompleted ?? dbUser.profile_completed ?? true,
    isPremium: dbUser.is_premium,
    premiumExpiresAt: dbUser.premium_expires_at,
    revenuecatCustomerId: dbUser.revenuecat_customer_id,
    accountStatus: dbUser.account_status || 'active',
    pausedAt: dbUser.paused_at,
    deletedAt: dbUser.deleted_at,
    declinedTrial: dbUser.declined_trial ?? false,
    createdAt: dbUser.created_at,
    updatedAt: dbUser.updated_at,
  };
}

export async function updateUserPremiumStatus(
  userId: string,
  isPremium: boolean,
  expiresAt?: string | null,
  revenuecatCustomerId?: string | null
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const updates: Record<string, unknown> = {
    is_premium: isPremium,
    updated_at: new Date().toISOString(),
  };

  if (expiresAt !== undefined) {
    updates.premium_expires_at = expiresAt;
  }

  if (revenuecatCustomerId !== undefined) {
    updates.revenuecat_customer_id = revenuecatCustomerId;
  }

  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId);

  if (error) {
    console.error('Error updating premium status:', error);
    return false;
  }

  return true;
}

export async function markUserDeclinedTrial(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await supabase
    .from('users')
    .update({
      declined_trial: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('Error marking user as declined trial:', error);
    return false;
  }

  return true;
}

// ============ ACCOUNT MANAGEMENT ============

export async function pauseUserAccount(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await supabase
    .from('users')
    .update({
      account_status: 'paused',
      paused_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('Error pausing account:', error);
    return false;
  }

  return true;
}

export async function resumeUserAccount(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await supabase
    .from('users')
    .update({
      account_status: 'active',
      paused_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('Error resuming account:', error);
    return false;
  }

  return true;
}

export async function deleteUserAccount(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  console.log('[DB] Starting account deletion for user:', userId);

  // First, delete all user data from related tables
  const deletePromises = [
    supabase.from('user_preferences').delete().eq('user_id', userId),
    supabase.from('recipes').delete().eq('user_id', userId),
    supabase.from('meal_slots').delete().eq('user_id', userId),
    supabase.from('grocery_items').delete().eq('user_id', userId),
    supabase.from('saved_grocery_lists').delete().eq('user_id', userId),
  ];

  const results = await Promise.all(deletePromises);
  const hasDeleteError = results.some((r) => r.error);

  if (hasDeleteError) {
    console.error('Error deleting user data:', results.map((r) => r.error).filter(Boolean));
  }

  // Hard delete the user record from users table
  const { error: deleteUserError } = await supabase
    .from('users')
    .delete()
    .eq('id', userId);

  if (deleteUserError) {
    console.error('Error deleting user from users table:', deleteUserError);
    // Continue to try deleting from auth even if users table deletion fails
  } else {
    console.log('[DB] Successfully deleted user from users table');
  }

  // Delete the user from Supabase Auth via backend API
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.access_token) {
      const backendUrl = process.env.EXPO_PUBLIC_VIBECODE_BACKEND_URL || 'http://localhost:3000';
      console.log('[DB] Calling backend to delete user from Supabase Auth...');

      const response = await fetch(`${backendUrl}/api/auth/delete-account`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        console.log('[DB] Successfully deleted user from Supabase Auth');
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('[DB] Failed to delete user from Auth:', errorData);
      }
    }

    // Sign out locally
    await supabase.auth.signOut();
    console.log('[DB] User signed out successfully');
    console.log('[DB] Account deletion completed for user:', userId);
    return true;
  } catch (authError) {
    console.error('Error during auth cleanup:', authError);
    // Return true anyway since we've deleted the user data
    return true;
  }
}

// Type definitions for database rows
interface DbUserPreferences {
  id: string;
  user_id: string;
  dietary_restrictions: string[];
  cuisine_preferences: string[];
  allergies: string[];
  serving_size: number;
  cooking_skill_level: 'beginner' | 'intermediate' | 'advanced';
  meal_prep_time: 'quick' | 'moderate' | 'elaborate';
  has_completed_onboarding: boolean;
  // ── Persona fields (all nullable so old rows still load) ──
  household?: string | null;
  cooking_days_per_week?: number | null;
  weeknight_minutes?: number | null;
  equipment?: string[] | null;
  pantry_staples?: string[] | null;
  weekly_budget?: number | null;
  monthly_budget?: number | null;
  priorities?: string[] | null;
  adventure_level?: number | null;
  goals?: string[] | null;
  explore_cuisines?: string[] | null;
  meal_habits?: { breakfast?: string; lunch?: string; dinner?: string } | null;
  has_used_free_trial?: boolean | null;
  onboarding_step?: number | null;
}

interface DbRecipe {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  cook_time: number;
  prep_time: number;
  servings: number;
  ingredients: Ingredient[];
  instructions: string[];
  tags: string[];
  calories: number | null;
  is_ai_generated: boolean;
  is_saved: boolean;
  is_imported: boolean | null;
  source_url: string | null;
  curated_source_id?: string | null;
  created_at: string;
}

interface DbMealSlot {
  id: string;
  user_id: string;
  date: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  recipe_id: string | null;
  custom_meal_name: string | null;
  serving_override: number | null;
  curated_plan_id?: string | null;
}

interface DbGroceryItem {
  id: string;
  user_id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  category: Ingredient['category'];
  is_checked: boolean;
  recipe_ids: string[];
}

// Mappers: Database -> App
const mapDbPreferences = (db: DbUserPreferences): UserPreferences => ({
  dietaryRestrictions: db.dietary_restrictions || [],
  cuisinePreferences: db.cuisine_preferences || [],
  allergies: db.allergies || [],
  servingSize: db.serving_size,
  cookingSkillLevel: db.cooking_skill_level,
  mealPrepTime: db.meal_prep_time,
  hasCompletedOnboarding: db.has_completed_onboarding,
  // Persona — coerce to undefined when null/missing
  household: (db.household as UserPreferences['household']) ?? undefined,
  cookingDaysPerWeek: db.cooking_days_per_week ?? undefined,
  weeknightMinutes: (db.weeknight_minutes as UserPreferences['weeknightMinutes']) ?? undefined,
  equipment: db.equipment ?? undefined,
  pantryStaples: db.pantry_staples ?? undefined,
  weeklyBudget: db.weekly_budget ?? undefined,
  monthlyBudget: db.monthly_budget ?? undefined,
  priorities: (db.priorities as UserPreferences['priorities']) ?? undefined,
  adventureLevel: db.adventure_level ?? undefined,
  goals: db.goals ?? undefined,
  exploreCuisines: db.explore_cuisines ?? undefined,
  mealHabits: db.meal_habits
    ? {
        breakfast: (db.meal_habits.breakfast as 'skip' | 'cook' | 'grab') ?? 'cook',
        lunch: (db.meal_habits.lunch as 'leftovers' | 'cook' | 'buy') ?? 'cook',
        dinner: (db.meal_habits.dinner as 'leftovers' | 'cook' | 'buy') ?? 'cook',
      }
    : undefined,
  hasUsedFreeTrial: db.has_used_free_trial ?? false,
  onboardingStep: db.onboarding_step ?? undefined,
});

const mapDbRecipe = (db: DbRecipe): Recipe => ({
  id: db.id,
  name: db.name,
  description: db.description || '',
  imageUrl: db.image_url || '',
  cookTime: db.cook_time,
  prepTime: db.prep_time,
  servings: db.servings,
  ingredients: db.ingredients || [],
  instructions: db.instructions || [],
  tags: db.tags || [],
  calories: db.calories ?? undefined,
  isAIGenerated: db.is_ai_generated,
  isImported: db.is_imported ?? false,
  sourceUrl: db.source_url ?? undefined,
  curatedSourceId: db.curated_source_id ?? undefined,
  isSaved: db.is_saved,
  createdAt: db.created_at,
});

const mapDbMealSlot = (db: DbMealSlot): MealSlot => ({
  id: db.id,
  date: db.date,
  mealType: db.meal_type,
  recipeId: db.recipe_id,
  customMealName: db.custom_meal_name ?? undefined,
  servingOverride: db.serving_override ?? undefined,
  curatedPlanId: db.curated_plan_id ?? undefined,
});

const mapDbGroceryItem = (db: DbGroceryItem): GroceryItem => ({
  id: db.id,
  name: db.name,
  quantity: db.quantity || '',
  unit: db.unit || '',
  category: db.category,
  isChecked: db.is_checked,
  recipeIds: db.recipe_ids || [],
});

// ============ USER PREFERENCES ============

export async function fetchUserPreferences(userId: string): Promise<UserPreferences | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('Error fetching preferences:', error);
    return null;
  }

  return mapDbPreferences(data as DbUserPreferences);
}

export async function upsertUserPreferences(
  userId: string,
  preferences: UserPreferences
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  // Build payload defensively: only include persona columns when defined.
  // If the Supabase table doesn't yet have a column, the request will fail
  // and we surface a clear log so the user knows to run the migration.
  const payload: Record<string, unknown> = {
    user_id: userId,
    dietary_restrictions: preferences.dietaryRestrictions,
    cuisine_preferences: preferences.cuisinePreferences,
    allergies: preferences.allergies,
    serving_size: preferences.servingSize,
    cooking_skill_level: preferences.cookingSkillLevel,
    meal_prep_time: preferences.mealPrepTime,
    has_completed_onboarding: preferences.hasCompletedOnboarding,
  };
  if (preferences.household !== undefined) payload.household = preferences.household;
  if (preferences.cookingDaysPerWeek !== undefined) payload.cooking_days_per_week = preferences.cookingDaysPerWeek;
  if (preferences.weeknightMinutes !== undefined) payload.weeknight_minutes = preferences.weeknightMinutes;
  if (preferences.equipment !== undefined) payload.equipment = preferences.equipment;
  if (preferences.pantryStaples !== undefined) payload.pantry_staples = preferences.pantryStaples;
  if (preferences.weeklyBudget !== undefined) payload.weekly_budget = preferences.weeklyBudget;
  if (preferences.monthlyBudget !== undefined) payload.monthly_budget = preferences.monthlyBudget;
  if (preferences.priorities !== undefined) payload.priorities = preferences.priorities;
  if (preferences.adventureLevel !== undefined) payload.adventure_level = preferences.adventureLevel;
  if (preferences.goals !== undefined) payload.goals = preferences.goals;
  if (preferences.exploreCuisines !== undefined) payload.explore_cuisines = preferences.exploreCuisines;
  if (preferences.mealHabits !== undefined) payload.meal_habits = preferences.mealHabits;
  if (preferences.hasUsedFreeTrial !== undefined) payload.has_used_free_trial = preferences.hasUsedFreeTrial;
  if (preferences.onboardingStep !== undefined) payload.onboarding_step = preferences.onboardingStep;

  const { error } = await supabase
    .from('user_preferences')
    .upsert(payload, { onConflict: 'user_id' });

  if (error) {
    // If the persona migration hasn't been run yet, retry with the legacy payload
    // so we don't block users on an outdated schema.
    // PostgREST returns code PGRST204 ("Could not find the '...' column in the schema cache")
    // while PostgreSQL itself returns "column ... does not exist" — catch both.
    const isUnknownColumn =
      (error as { code?: string }).code === 'PGRST204' ||
      /column .* does not exist/i.test(error.message ?? '') ||
      /could not find the .* column/i.test(error.message ?? '');
    if (isUnknownColumn) {
      console.warn('[DB] user_preferences missing persona columns — falling back to legacy upsert. Run the persona migration.');
      const legacy = {
        user_id: userId,
        dietary_restrictions: preferences.dietaryRestrictions,
        cuisine_preferences: preferences.cuisinePreferences,
        allergies: preferences.allergies,
        serving_size: preferences.servingSize,
        cooking_skill_level: preferences.cookingSkillLevel,
        meal_prep_time: preferences.mealPrepTime,
        has_completed_onboarding: preferences.hasCompletedOnboarding,
      };
      const { error: legacyErr } = await supabase
        .from('user_preferences')
        .upsert(legacy, { onConflict: 'user_id' });
      if (legacyErr) {
        console.error('Error saving preferences (legacy fallback):', legacyErr);
        return false;
      }
      return true;
    }
    console.error('Error saving preferences:', error);
    return false;
  }

  return true;
}

// ============ RECIPES ============

export async function fetchUserRecipes(userId: string): Promise<Recipe[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching recipes:', error);
    return [];
  }

  const recipes = (data as DbRecipe[]).map(mapDbRecipe);

  // Log imported recipes with source URLs
  recipes.forEach((recipe) => {
    if (recipe.isImported && recipe.sourceUrl) {
      console.log('[DB] Loaded imported recipe:', {
        name: recipe.name,
        sourceUrl: recipe.sourceUrl,
        sourceUrlLength: recipe.sourceUrl.length,
      });
    }
  });

  return recipes;
}

export async function insertRecipe(userId: string, recipe: Recipe): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    console.warn('[DB] Supabase not configured, recipe will not persist');
    return recipe.id || null;
  }

  const insertData: Record<string, unknown> = {
    user_id: userId,
    name: recipe.name,
    description: recipe.description,
    image_url: recipe.imageUrl,
    cook_time: recipe.cookTime,
    prep_time: recipe.prepTime,
    servings: recipe.servings,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    tags: recipe.tags,
    calories: recipe.calories ?? null,
    is_ai_generated: recipe.isAIGenerated,
    is_saved: recipe.isSaved,
    is_imported: recipe.isImported ?? false,
    source_url: recipe.sourceUrl ?? null,
    curated_source_id: recipe.curatedSourceId ?? null,
    created_at: recipe.createdAt,
  };

  let { data, error } = await supabase
    .from('recipes')
    .insert(insertData)
    .select('id')
    .single();

  // Backwards-compat: if the curated_source_id column hasn't been added yet
  // (migration not run), retry without it so recipe saving never breaks.
  // Mirrors the legacy-column fallback used in saveUserPreferences.
  if (error) {
    const isUnknownColumn =
      (error as { code?: string }).code === 'PGRST204' ||
      /column .* does not exist/i.test(error.message ?? '') ||
      /could not find the .* column/i.test(error.message ?? '');
    if (isUnknownColumn && 'curated_source_id' in insertData) {
      console.warn('[DB] recipes.curated_source_id column missing — retrying insert without it. Run the curated_source_id migration.');
      delete insertData.curated_source_id;
      ({ data, error } = await supabase
        .from('recipes')
        .insert(insertData)
        .select('id')
        .single());
    }
  }

  if (error) {
    console.error('Error inserting recipe:', error);
    return null;
  }

  return data?.id || null;
}

export async function updateRecipe(
  userId: string,
  recipeId: string,
  updates: Partial<Recipe>
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  // Guard: never send a non-UUID to Supabase — the recipe may still have a
  // temp ID that hasn't been swapped for a real UUID yet.
  if (!isValidUUID(recipeId)) {
    console.warn(`[DB] Skipping updateRecipe — recipeId is not a valid UUID: ${recipeId}`);
    return false;
  }

  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.imageUrl !== undefined) dbUpdates.image_url = updates.imageUrl;
  if (updates.cookTime !== undefined) dbUpdates.cook_time = updates.cookTime;
  if (updates.prepTime !== undefined) dbUpdates.prep_time = updates.prepTime;
  if (updates.servings !== undefined) dbUpdates.servings = updates.servings;
  if (updates.ingredients !== undefined) dbUpdates.ingredients = updates.ingredients;
  if (updates.instructions !== undefined) dbUpdates.instructions = updates.instructions;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.calories !== undefined) dbUpdates.calories = updates.calories;
  if (updates.isAIGenerated !== undefined) dbUpdates.is_ai_generated = updates.isAIGenerated;
  if (updates.isSaved !== undefined) dbUpdates.is_saved = updates.isSaved;
  if (updates.isImported !== undefined) dbUpdates.is_imported = updates.isImported;
  if (updates.sourceUrl !== undefined) dbUpdates.source_url = updates.sourceUrl;

  const { error } = await supabase
    .from('recipes')
    .update(dbUpdates)
    .eq('id', recipeId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error updating recipe:', error);
    return false;
  }

  return true;
}

export async function deleteRecipe(userId: string, recipeId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', recipeId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting recipe:', error);
    return false;
  }

  return true;
}

// ============ MEAL SLOTS ============

export async function fetchUserMealSlots(userId: string): Promise<MealSlot[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from('meal_slots')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  if (error) {
    console.error('Error fetching meal slots:', error);
    return [];
  }

  return (data as DbMealSlot[]).map(mapDbMealSlot);
}

// Helper to check if a string is a valid UUID
const isValidUUID = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

export async function upsertMealSlot(userId: string, slot: MealSlot): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  // Validate recipe_id is a valid UUID before sending to database
  if (slot.recipeId && !isValidUUID(slot.recipeId)) {
    console.log('Skipping upsert - recipe_id is not a valid UUID yet:', slot.recipeId);
    return null;
  }

  // Check if this exact slot already exists (by checking user_id, date, meal_type, and recipe_id)
  const { data: existingSlot } = await supabase
    .from('meal_slots')
    .select('id')
    .eq('user_id', userId)
    .eq('date', slot.date)
    .eq('meal_type', slot.mealType)
    .eq('recipe_id', slot.recipeId)
    .maybeSingle();

  if (existingSlot) {
    // Update existing slot
    const { error } = await supabase
      .from('meal_slots')
      .update({
        custom_meal_name: slot.customMealName ?? null,
        serving_override: slot.servingOverride ?? null,
        curated_plan_id: slot.curatedPlanId ?? null,
      })
      .eq('id', existingSlot.id);

    if (error) {
      console.error('Error updating meal slot:', error);
      return null;
    }
    return existingSlot.id;
  } else {
    // Insert new slot - allow multiple recipes per date+meal_type
    const { data, error } = await supabase
      .from('meal_slots')
      .insert({
        user_id: userId,
        date: slot.date,
        meal_type: slot.mealType,
        recipe_id: slot.recipeId || null,
        custom_meal_name: slot.customMealName ?? null,
        serving_override: slot.servingOverride ?? null,
        curated_plan_id: slot.curatedPlanId ?? null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error inserting meal slot:', error);
      return null;
    }
    return data?.id || null;
  }
}

export async function updateMealSlotById(userId: string, slotId: string, updates: { recipeId?: string | null; customMealName?: string | null; servingOverride?: number | null; curatedPlanId?: string | null }): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const dbUpdates: Record<string, any> = {};
  if (updates.recipeId !== undefined) dbUpdates.recipe_id = updates.recipeId;
  if (updates.customMealName !== undefined) dbUpdates.custom_meal_name = updates.customMealName;
  if (updates.servingOverride !== undefined) dbUpdates.serving_override = updates.servingOverride;
  if (updates.curatedPlanId !== undefined) dbUpdates.curated_plan_id = updates.curatedPlanId;

  const { error } = await supabase
    .from('meal_slots')
    .update(dbUpdates)
    .eq('id', slotId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error updating meal slot by id:', error);
    return false;
  }

  return true;
}

export async function deleteMealSlot(userId: string, slotId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await supabase
    .from('meal_slots')
    .delete()
    .eq('id', slotId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting meal slot:', error);
    return false;
  }

  return true;
}

export async function clearMealSlotsInRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await supabase
    .from('meal_slots')
    .delete()
    .eq('user_id', userId)
    .gte('date', startDate)
    .lt('date', endDate);

  if (error) {
    console.error('Error clearing meal slots:', error);
    return false;
  }

  return true;
}

// ============ GROCERY ITEMS ============

export async function fetchUserGroceryItems(userId: string): Promise<GroceryItem[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from('grocery_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching grocery items:', error);
    return [];
  }

  return (data as DbGroceryItem[]).map(mapDbGroceryItem);
}

export async function insertGroceryItem(
  userId: string,
  item: GroceryItem
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  const insertData: Record<string, any> = {
    user_id: userId,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    is_checked: item.isChecked,
    recipe_ids: item.recipeIds,
  };

  // Preserve client-provided ID if it is a valid UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (item.id && uuidRegex.test(item.id)) {
    insertData.id = item.id;
  }

  const { data, error } = await supabase
    .from('grocery_items')
    .insert(insertData)
    .select('id')
    .single();

  if (error) {
    console.error('Error inserting grocery item:', error);
    return null;
  }

  return data?.id || null;
}

export async function updateGroceryItem(
  userId: string,
  itemId: string,
  updates: Partial<GroceryItem>
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  if (!isValidUUID(itemId)) {
    console.warn(`[DB] Skipping updateGroceryItem — itemId is not a valid UUID: ${itemId}`);
    return false;
  }

  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.quantity !== undefined) dbUpdates.quantity = updates.quantity;
  if (updates.unit !== undefined) dbUpdates.unit = updates.unit;
  if (updates.category !== undefined) dbUpdates.category = updates.category;
  if (updates.isChecked !== undefined) dbUpdates.is_checked = updates.isChecked;
  if (updates.recipeIds !== undefined) dbUpdates.recipe_ids = updates.recipeIds;

  const { error } = await supabase
    .from('grocery_items')
    .update(dbUpdates)
    .eq('id', itemId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error updating grocery item:', error);
    return false;
  }

  return true;
}

export async function deleteGroceryItem(userId: string, itemId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  if (!isValidUUID(itemId)) {
    console.warn(`[DB] Skipping deleteGroceryItem — itemId is not a valid UUID: ${itemId}`);
    return false;
  }

  const { error } = await supabase
    .from('grocery_items')
    .delete()
    .eq('id', itemId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting grocery item:', error);
    return false;
  }

  return true;
}

export async function clearUserGroceryItems(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await supabase
    .from('grocery_items')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('Error clearing grocery items:', error);
    return false;
  }

  return true;
}

export async function clearCheckedGroceryItems(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const { error } = await supabase
    .from('grocery_items')
    .delete()
    .eq('user_id', userId)
    .eq('is_checked', true);

  if (error) {
    console.error('Error clearing checked grocery items:', error);
    return false;
  }

  return true;
}

// ============ BULK OPERATIONS ============

export async function replaceUserGroceryItems(
  userId: string,
  items: GroceryItem[]
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  // Delete all existing items
  const { error: deleteError } = await supabase
    .from('grocery_items')
    .delete()
    .eq('user_id', userId);

  if (deleteError) {
    console.error('Error clearing grocery items:', deleteError);
    return false;
  }

  if (items.length === 0) return true;

  // Insert all new items, preserving their IDs if they are valid UUIDs
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const insertData = items.map((item) => {
    const payload: Record<string, any> = {
      user_id: userId,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      is_checked: item.isChecked,
      recipe_ids: item.recipeIds,
    };
    if (item.id && uuidRegex.test(item.id)) {
      payload.id = item.id;
    }
    return payload;
  });

  const { error: insertError } = await supabase
    .from('grocery_items')
    .insert(insertData);

  if (insertError) {
    console.error('Error inserting grocery items:', insertError);
    return false;
  }

  return true;
}

// ============ FETCH ALL USER DATA ============

export interface UserData {
  preferences: UserPreferences | null;
  recipes: Recipe[];
  mealSlots: MealSlot[];
  groceryItems: GroceryItem[];
}

// ============ SAVED GROCERY LISTS ============

export async function fetchUserSavedGroceryLists(
  userId: string
): Promise<any[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    console.log('[DB] Fetching saved grocery lists for user:', userId);

    const { data, error } = await supabase
      .from('saved_grocery_lists')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DB] Error fetching saved grocery lists:', error);
      return [];
    }

    console.log('[DB] Fetched saved grocery lists:', data?.length || 0, 'lists');
    if (data && data.length > 0) {
      console.log('[DB] List IDs:', data.map((l: any) => l.id));
    }

    return data || [];
  } catch (error) {
    console.error('[DB] Exception fetching saved grocery lists:', error);
    return [];
  }
}

export async function saveSavedGroceryList(userId: string, list: any): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    console.log('[DB] Saving grocery list:', { id: list.id, name: list.name, itemCount: list.items?.length });

    // Use upsert to handle both create and update cases
    const { error } = await supabase
      .from('saved_grocery_lists')
      .upsert({
        id: list.id,
        user_id: userId,
        name: list.name,
        items: list.items,
        created_at: list.createdAt,
      }, {
        onConflict: 'id',
      });

    if (error) {
      console.error('[DB] Error saving grocery list:', error);
      return false;
    }

    console.log('[DB] Successfully saved grocery list:', list.id);
    return true;
  } catch (error) {
    console.error('[DB] Exception saving grocery list:', error);
    return false;
  }
}

export async function deleteSavedGroceryList(userId: string, listId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    console.log('[DB] Deleting grocery list:', { userId, listId });

    const { error, count } = await supabase
      .from('saved_grocery_lists')
      .delete()
      .eq('user_id', userId)
      .eq('id', listId);

    if (error) {
      console.error('[DB] Error deleting saved grocery list:', error);
      return false;
    }

    console.log('[DB] Successfully deleted grocery list:', listId);
    return true;
  } catch (error) {
    console.error('[DB] Exception deleting saved grocery list:', error);
    return false;
  }
}

export async function fetchAllUserData(userId: string): Promise<UserData> {
  const [preferences, recipes, mealSlots, groceryItems] = await Promise.all([
    fetchUserPreferences(userId),
    fetchUserRecipes(userId),
    fetchUserMealSlots(userId),
    fetchUserGroceryItems(userId),
  ]);

  return {
    preferences,
    recipes,
    mealSlots,
    groceryItems,
  };
}

// ============ NUDGE ENGINE: COOKING LOGS & RECIPE RATINGS ============
//
// Requires the following Supabase tables (run once via SQL editor):
//
//   create table cooking_logs (
//     id uuid primary key,
//     user_id uuid not null references auth.users(id) on delete cascade,
//     slot_id text not null,
//     recipe_id text,
//     status text not null check (status in ('cooked','skipped','swapped')),
//     cooked_at timestamptz not null default now(),
//     skip_reason text,
//     actual_meal_eaten text,
//     created_at timestamptz default now()
//   );
//   alter table cooking_logs enable row level security;
//   create policy "cooking_logs_owner" on cooking_logs
//     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
//
//   create table recipe_ratings (
//     id uuid primary key,
//     user_id uuid not null references auth.users(id) on delete cascade,
//     recipe_id text not null,
//     stars int not null check (stars between 1 and 5),
//     cook_again text check (cook_again in ('yes','maybe','no')),
//     rated_at timestamptz not null default now(),
//     created_at timestamptz default now(),
//     unique(user_id, recipe_id)
//   );
//   alter table recipe_ratings enable row level security;
//   create policy "recipe_ratings_owner" on recipe_ratings
//     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

export async function insertCookingLog(
  userId: string,
  log: CookingLog,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { error } = await supabase.from('cooking_logs').insert({
    id: log.id,
    user_id: userId,
    slot_id: log.slotId,
    recipe_id: log.recipeId,
    status: log.status,
    cooked_at: log.cookedAt,
    skip_reason: log.skipReason ?? null,
    actual_meal_eaten: log.actualMealEaten ?? null,
  });
  if (error) {
    console.error('[DB] insertCookingLog failed:', error);
    return false;
  }
  return true;
}

export async function insertCookingLogsBulk(
  userId: string,
  logs: CookingLog[],
): Promise<boolean> {
  if (!isSupabaseConfigured() || logs.length === 0) return false;
  const { error } = await supabase.from('cooking_logs').insert(
    logs.map((log) => ({
      id: log.id,
      user_id: userId,
      slot_id: log.slotId,
      recipe_id: log.recipeId,
      status: log.status,
      cooked_at: log.cookedAt,
      skip_reason: log.skipReason ?? null,
      actual_meal_eaten: log.actualMealEaten ?? null,
    })),
  );
  if (error) {
    console.error('[DB] insertCookingLogsBulk failed:', error);
    return false;
  }
  return true;
}

export async function deleteCookingLog(
  userId: string,
  slotId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { error } = await supabase
    .from('cooking_logs')
    .delete()
    .eq('user_id', userId)
    .eq('slot_id', slotId);
  if (error) {
    console.error('[DB] deleteCookingLog failed:', error);
    return false;
  }
  return true;
}


export async function upsertRecipeRating(
  userId: string,
  rating: RecipeRating,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { error } = await supabase
    .from('recipe_ratings')
    .upsert(
      {
        id: rating.id,
        user_id: userId,
        recipe_id: rating.recipeId,
        stars: rating.stars,
        cook_again: rating.cookAgain ?? null,
        rated_at: rating.ratedAt,
      },
      { onConflict: 'user_id,recipe_id' },
    );
  if (error) {
    console.error('[DB] upsertRecipeRating failed:', error);
    return false;
  }
  return true;
}

/**
 * Upsert a curated-meal-plan rating. Parallel surface to
 * upsertRecipeRating — same row-replacement semantics, different
 * table. Requires the Supabase migration to add:
 *
 *   create table meal_plan_ratings (
 *     id uuid primary key,
 *     user_id uuid references auth.users not null,
 *     plan_id text not null,
 *     stars int2 not null check (stars between 1 and 5),
 *     cook_again text check (cook_again in ('yes','maybe','no')),
 *     rated_at timestamptz not null default now(),
 *     unique (user_id, plan_id)
 *   );
 *
 * Until the table exists this returns false silently — the local
 * store already holds the rating, so the user-visible UX works
 * even when sync is unavailable.
 */
export async function upsertMealPlanRating(
  userId: string,
  rating: MealPlanRating,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { error } = await supabase
    .from('meal_plan_ratings')
    .upsert(
      {
        id: rating.id,
        user_id: userId,
        plan_id: rating.planId,
        stars: rating.stars,
        cook_again: rating.cookAgain ?? null,
        rated_at: rating.ratedAt,
      },
      { onConflict: 'user_id,plan_id' },
    );
  if (error) {
    console.error('[DB] upsertMealPlanRating failed:', error);
    return false;
  }
  return true;
}

export async function fetchCookingLogs(userId: string): Promise<CookingLog[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('cooking_logs')
    .select('*')
    .eq('user_id', userId)
    .order('cooked_at', { ascending: false })
    .limit(500);
  if (error) {
    console.error('[DB] fetchCookingLogs failed:', error);
    return [];
  }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    slotId: row.slot_id,
    recipeId: row.recipe_id,
    status: row.status,
    cookedAt: row.cooked_at,
    skipReason: row.skip_reason ?? undefined,
    actualMealEaten: row.actual_meal_eaten ?? undefined,
  }));
}

export async function fetchRecipeRatings(userId: string): Promise<RecipeRating[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('recipe_ratings')
    .select('*')
    .eq('user_id', userId);
  if (error) {
    console.error('[DB] fetchRecipeRatings failed:', error);
    return [];
  }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    recipeId: row.recipe_id,
    stars: row.stars,
    cookAgain: row.cook_again ?? undefined,
    ratedAt: row.rated_at,
  }));
}

// ============ PLANNING EVENTS ============
// SQL migration (run once in Supabase SQL editor):
//
//   create table public.planning_events (
//     id uuid primary key default gen_random_uuid(),
//     user_id uuid not null references auth.users(id) on delete cascade,
//     created_at timestamptz not null default now(),
//     days int not null,
//     meal_types text[] not null default '{}'
//   );
//
//   alter table public.planning_events enable row level security;
//
//   create policy "planning_events_owner" on planning_events
//     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
//
//   create index planning_events_user_idx
//     on public.planning_events (user_id, created_at desc);

export async function insertPlanningEvent(
  userId: string,
  event: PlanningEvent,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { error } = await supabase.from('planning_events').insert({
    id: event.id,
    user_id: userId,
    created_at: event.createdAt,
    days: event.days,
    meal_types: event.mealTypes,
  });
  if (error) {
    console.error('[DB] insertPlanningEvent failed:', error);
    return false;
  }
  return true;
}

export async function fetchPlanningEvents(
  userId: string,
): Promise<PlanningEvent[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('planning_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error('[DB] fetchPlanningEvents failed:', error);
    return [];
  }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    createdAt: row.created_at,
    days: row.days,
    mealTypes: row.meal_types ?? [],
  }));
}
