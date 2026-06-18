import { Recipe, MealSlot, UserPreferences } from './store';

/**
 * Deduplicates recipes by name (keeps first occurrence)
 */
function deduplicateRecipes(recipes: Recipe[]): Recipe[] {
  const seenNames = new Set<string>();
  return recipes.filter((r) => {
    const normalizedName = r.name.toLowerCase().trim();
    if (seenNames.has(normalizedName)) {
      return false;
    }
    seenNames.add(normalizedName);
    return true;
  });
}

/**
 * Gets recipes used in the last 2 weeks (most repeated)
 * Returns top 3 most frequently used recipes
 */
export function getRecentlyUsedRecipes(
  mealSlots: MealSlot[],
  allRecipes: Recipe[],
  limit: number = 3
): Recipe[] {
  // Get date 2 weeks ago
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const twoWeeksAgoString = twoWeeksAgo.toISOString().split('T')[0];

  // Count recipe usage in the last 2 weeks
  const recipeUsageCount: Record<string, number> = {};

  mealSlots.forEach((slot) => {
    if (slot.recipeId && slot.date >= twoWeeksAgoString) {
      recipeUsageCount[slot.recipeId] = (recipeUsageCount[slot.recipeId] || 0) + 1;
    }
  });

  // Sort by usage count and get recipe objects
  const sortedRecipeIds = Object.entries(recipeUsageCount)
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id)
    .slice(0, limit);

  return sortedRecipeIds
    .map((id) => allRecipes.find((r) => r.id === id))
    .filter((r): r is Recipe => r !== undefined);
}

/**
 * Gets recipes that match user preferences
 * Returns top 3 recipes matching dietary restrictions and cuisine preferences
 */
export function getPreferenceMatchedRecipes(
  allRecipes: Recipe[],
  preferences: UserPreferences,
  limit: number = 3,
  exclude: Set<string> = new Set()
): Recipe[] {
  // Filter recipes that match user preferences
  const matchedRecipes = allRecipes.filter((recipe) => {
    // Skip if already in other categories
    if (exclude.has(recipe.id)) return false;

    const recipeTagsLower = recipe.tags.map((tag) => tag.toLowerCase());

    // Check if recipe matches any dietary restrictions
    const matchesDietary = preferences.dietaryRestrictions.length === 0 ||
      preferences.dietaryRestrictions.some((restriction) =>
        recipeTagsLower.includes(restriction.toLowerCase())
      );

    // Check if recipe matches any cuisine preferences
    const matchesCuisine = preferences.cuisinePreferences.length === 0 ||
      preferences.cuisinePreferences.some((cuisine) =>
        recipeTagsLower.includes(cuisine.toLowerCase())
      );

    // Check if recipe contains any allergens
    const hasAllergens = preferences.allergies.length > 0 &&
      preferences.allergies.some((allergen) =>
        recipe.ingredients.some((ingredient) =>
          ingredient.name.toLowerCase().includes(allergen.toLowerCase())
        )
      );

    return matchesDietary && matchesCuisine && !hasAllergens;
  });

  return matchedRecipes.slice(0, limit);
}

/**
 * Gets saved (favorite) recipes
 * Returns top 3 saved recipes
 */
export function getFavoriteRecipes(
  allRecipes: Recipe[],
  limit: number = 3,
  exclude: Set<string> = new Set()
): Recipe[] {
  return allRecipes
    .filter((recipe) => recipe.isSaved && !exclude.has(recipe.id))
    .slice(0, limit);
}

/**
 * Gets all Quick Add recipes organized by category
 * Returns object with three categories: recent, preferences, favorites
 */
export function getQuickAddRecipes(
  mealSlots: MealSlot[],
  allRecipes: Recipe[],
  preferences: UserPreferences
) {
  // Deduplicate recipes first to avoid showing duplicates
  const uniqueRecipes = deduplicateRecipes(allRecipes);

  // Get recent recipes
  const recent = getRecentlyUsedRecipes(mealSlots, uniqueRecipes, 3);
  const recentIds = new Set(recent.map((r) => r.id));

  // Get preference-matched recipes (excluding recent)
  const preferenceMatched = getPreferenceMatchedRecipes(
    uniqueRecipes,
    preferences,
    3,
    recentIds
  );
  const preferenceIds = new Set(preferenceMatched.map((r) => r.id));

  // Get favorites (excluding recent and preference-matched)
  const excludedIds = new Set([...recentIds, ...preferenceIds]);
  const favorites = getFavoriteRecipes(uniqueRecipes, 3, excludedIds);

  return {
    recent,
    preferenceMatched,
    favorites,
  };
}

/**
 * Gets a flat list of Quick Add recipes in priority order
 * Useful for horizontal scroll display
 */
export function getQuickAddRecipesFlat(
  mealSlots: MealSlot[],
  allRecipes: Recipe[],
  preferences: UserPreferences,
  limit: number = 9
): Recipe[] {
  // Deduplicate recipes first
  const uniqueRecipes = deduplicateRecipes(allRecipes);

  const { recent, preferenceMatched, favorites } = getQuickAddRecipes(
    mealSlots,
    uniqueRecipes,
    preferences
  );

  // Combine all and return up to limit
  return [...recent, ...preferenceMatched, ...favorites].slice(0, limit);
}
