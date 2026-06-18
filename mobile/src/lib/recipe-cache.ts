import { supabase } from './supabase';
import type { UserPreferences } from './store';

export interface CachedRecipe {
  id: string;
  preferenceshash: string;
  mealtype: string;
  recipe: any; // GeneratedRecipeResponse
  createdat: string;
}

/**
 * Generate a hash of user preferences for consistent caching
 * This allows recipes generated with the same preferences to be reused
 */
export function generatePreferencesHash(preferences: UserPreferences, mealtypes: string[]): string {
  const hashInput = JSON.stringify({
    dietaryRestrictions: preferences.dietaryRestrictions.sort(),
    allergies: preferences.allergies.sort(),
    cuisinePreferences: preferences.cuisinePreferences.sort(),
    cookingSkillLevel: preferences.cookingSkillLevel,
    mealPrepTime: preferences.mealPrepTime,
    servingSize: preferences.servingSize,
    mealtypes: mealtypes.sort(),
  });

  // Simple deterministic hash function for React Native
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).substring(0, 16).padEnd(16, '0');
}

/**
 * Initialize the recipe cache table if it doesn't exist
 * This should be called once on app startup
 */
export async function initializeCacheTable(): Promise<void> {
  try {
    // Try to query the table - if it doesn't exist, create it
    const { data, error } = await supabase
      .from('recipe_cache')
      .select('id')
      .limit(1);

    if (error && error.code === 'PGRST116') {
      // Table doesn't exist, but we can't create it from the client
      // The schema needs to be set up manually in Supabase
      console.warn('[RecipeCache] recipe_cache table not found. Please create it in Supabase using the SQL script.');
    }
  } catch (error) {
    console.error('[RecipeCache] Error checking cache table:', error);
  }
}

/**
 * Get cached recipes by preferences hash and meal type
 */
export async function getCachedRecipes(
  preferenceshash: string,
  mealtype: string,
  limit: number = 5
): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('recipe_cache')
      .select('recipe')
      .eq('preferenceshash', preferenceshash)
      .eq('mealtype', mealtype)
      .order('createdat', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[RecipeCache] Error fetching cached recipes:', error);
      return [];
    }

    return data?.map((item) => item.recipe) || [];
  } catch (error) {
    console.error('[RecipeCache] Error in getCachedRecipes:', error);
    return [];
  }
}

/**
 * Cache a generated recipe
 */
export async function cacheRecipe(
  preferenceshash: string,
  mealtype: string,
  recipe: any
): Promise<boolean> {
  try {
    const { error } = await supabase.from('recipe_cache').insert({
      preferenceshash,
      mealtype,
      recipe,
      createdat: new Date().toISOString(),
    });

    if (error) {
      console.error('[RecipeCache] Error caching recipe:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[RecipeCache] Error in cacheRecipe:', error);
    return false;
  }
}

/**
 * Get the count of cached recipes for a preferences hash
 */
export async function getCacheStats(preferenceshash: string): Promise<{ total: number; byMealType: Record<string, number> }> {
  try {
    const { data, error } = await supabase
      .from('recipe_cache')
      .select('mealtype')
      .eq('preferenceshash', preferenceshash);

    if (error) {
      console.error('[RecipeCache] Error fetching cache stats:', error);
      return { total: 0, byMealType: {} };
    }

    const byMealType: Record<string, number> = {};
    data?.forEach((item) => {
      byMealType[item.mealtype] = (byMealType[item.mealtype] || 0) + 1;
    });

    return {
      total: data?.length || 0,
      byMealType,
    };
  } catch (error) {
    console.error('[RecipeCache] Error in getCacheStats:', error);
    return { total: 0, byMealType: {} };
  }
}

/**
 * Clear old cache entries (older than 30 days)
 */
export async function clearOldCache(daysOld: number = 30): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const { error } = await supabase
      .from('recipe_cache')
      .delete()
      .lt('createdat', cutoffDate.toISOString());

    if (error) {
      console.error('[RecipeCache] Error clearing old cache:', error);
      return 0;
    }

    console.log(`[RecipeCache] Cleared old cache entries`);
    return 1;
  } catch (error) {
    console.error('[RecipeCache] Error in clearOldCache:', error);
    return 0;
  }
}
