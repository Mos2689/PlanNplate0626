import { Recipe, MealSlot, UserPreferences } from './store';
import { MealType } from './openai';

export type PickSource = 'pattern' | 'rule' | 'ai';

export interface Pick {
  recipe: Recipe;
  source: PickSource;
  score: number;
  fromAICache?: boolean;
}

const ACTIVE_MEAL_WINDOW_DAYS = 30;
const NEW_USER_THRESHOLD_DAYS = 14;
const NEW_USER_RECIPE_THRESHOLD = 5;
const MIN_OCCURRENCES_FOR_ACTIVE = 2;

function getDateNDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

export function detectActiveMealTypes(mealSlots: MealSlot[]): MealType[] {
  const cutoff = getDateNDaysAgo(ACTIVE_MEAL_WINDOW_DAYS);
  const counts: Record<MealType, number> = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    snack: 0,
  };

  mealSlots.forEach((slot) => {
    if (slot.recipeId && slot.date >= cutoff) {
      counts[slot.mealType] = (counts[slot.mealType] || 0) + 1;
    }
  });

  const active = (Object.entries(counts) as [MealType, number][])
    .filter(([, count]) => count >= MIN_OCCURRENCES_FOR_ACTIVE)
    .map(([type]) => type);

  if (active.length === 0) {
    return ['breakfast', 'lunch', 'dinner'];
  }

  return active;
}

export function isNewUser(recipes: Recipe[], mealSlots: MealSlot[]): boolean {
  if (recipes.length < NEW_USER_RECIPE_THRESHOLD) return true;

  const cutoff = getDateNDaysAgo(NEW_USER_THRESHOLD_DAYS);
  const hasRecentActivity = mealSlots.some(
    (slot) => slot.recipeId && slot.date >= cutoff,
  );

  return !hasRecentActivity;
}

function recipeMatchesAllergies(recipe: Recipe, allergies: string[]): boolean {
  if (allergies.length === 0) return false;
  const lower = allergies.map((a) => a.toLowerCase());
  return recipe.ingredients.some((ing) =>
    lower.some((a) => ing.name.toLowerCase().includes(a)),
  );
}

function recipeMatchesDiet(recipe: Recipe, dietary: string[]): boolean {
  if (dietary.length === 0) return true;
  const tags = recipe.tags.map((t) => t.toLowerCase());
  return dietary.some((d) => tags.includes(d.toLowerCase()));
}

function inferRecipeMealType(recipe: Recipe): MealType {
  const tags = recipe.tags.map((t) => t.toLowerCase());
  if (tags.includes('breakfast')) return 'breakfast';
  if (tags.includes('lunch')) return 'lunch';
  if (tags.includes('dinner')) return 'dinner';
  if (tags.includes('snack')) return 'snack';
  return 'dinner';
}

function fitsPrepTime(recipe: Recipe, prepTimePref: UserPreferences['mealPrepTime']): boolean {
  const total = (recipe.cookTime || 0) + (recipe.prepTime || 0);
  if (prepTimePref === 'quick') return total <= 30;
  if (prepTimePref === 'moderate') return total <= 60;
  return true;
}

// Weight a per-priority bonus by its position in the user's ordered top-2.
// Position 0 → full weight, position 1 → half, anything else → 0.
function priorityWeight(
  priorities: UserPreferences['priorities'],
  target: 'time' | 'cost' | 'variety' | 'health',
): number {
  if (!priorities || priorities.length === 0) return 0;
  const idx = priorities.indexOf(target);
  if (idx === 0) return 1;
  if (idx === 1) return 0.5;
  return 0;
}

export function scoreRecipeForUser(
  recipe: Recipe,
  preferences: UserPreferences,
  activeMealTypes: MealType[],
  recentTopCuisines: string[] = [],
): number {
  if (recipeMatchesAllergies(recipe, preferences.allergies)) return -1000;
  if (!recipeMatchesDiet(recipe, preferences.dietaryRestrictions)) return -1000;

  let score = 0;
  const tags = recipe.tags.map((t) => t.toLowerCase());

  if (preferences.cuisinePreferences.some((c) => tags.includes(c.toLowerCase()))) {
    score += 15;
  }

  const recipeMealType = inferRecipeMealType(recipe);
  if (activeMealTypes.includes(recipeMealType)) {
    score += 10;
  }

  const timeFits = fitsPrepTime(recipe, preferences.mealPrepTime);
  if (timeFits) {
    // Base bonus, amplified when time is the user's top "what matters most".
    score += 5 + Math.round(10 * priorityWeight(preferences.priorities, 'time'));
  }

  // Cost priority — fewer ingredients = cheaper grocery run.
  const costWeight = priorityWeight(preferences.priorities, 'cost');
  if (costWeight > 0) {
    const ingCount = recipe.ingredients.length;
    if (ingCount <= 8) score += Math.round(10 * costWeight);
    else if (ingCount <= 10) score += Math.round(5 * costWeight);
  }

  // Variety priority — demote dishes whose cuisine the user has been eating
  // a lot in the last 30 days (passed in from detectUserPatterns).
  const varietyWeight = priorityWeight(preferences.priorities, 'variety');
  if (varietyWeight > 0 && recentTopCuisines.length > 0) {
    const recipeCuisineRecent = recentTopCuisines.some((c) => tags.includes(c));
    if (recipeCuisineRecent) score -= Math.round(5 * varietyWeight);
  }

  // Health priority — proxy on count of produce-category ingredients.
  const healthWeight = priorityWeight(preferences.priorities, 'health');
  if (healthWeight > 0) {
    const produceCount = recipe.ingredients.filter(
      (i) => (i.category || '').toLowerCase() === 'produce',
    ).length;
    if (produceCount >= 3) score += Math.round(8 * healthWeight);
  }

  if (recipe.isSaved) score += 8;

  return score;
}

export function getRuleBasedPicks(
  allRecipes: Recipe[],
  preferences: UserPreferences,
  activeMealTypes: MealType[],
  limit: number = 4,
  recentTopCuisines: string[] = [],
): Pick[] {
  return allRecipes
    .map((recipe) => ({
      recipe,
      source: 'rule' as PickSource,
      score: scoreRecipeForUser(recipe, preferences, activeMealTypes, recentTopCuisines),
    }))
    .filter((pick) => pick.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function detectUserPatterns(
  mealSlots: MealSlot[],
  allRecipes: Recipe[],
): { topCuisines: string[]; topProteins: string[]; recentRecipeIds: Set<string> } {
  const cutoff = getDateNDaysAgo(ACTIVE_MEAL_WINDOW_DAYS);
  const cuisineCounts: Record<string, number> = {};
  const proteinKeywords = ['chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'tofu', 'shrimp', 'turkey', 'lamb', 'egg'];
  const proteinCounts: Record<string, number> = {};
  const recentIds = new Set<string>();

  mealSlots.forEach((slot) => {
    if (!slot.recipeId || slot.date < cutoff) return;
    recentIds.add(slot.recipeId);
    const recipe = allRecipes.find((r) => r.id === slot.recipeId);
    if (!recipe) return;

    recipe.tags.forEach((tag) => {
      const t = tag.toLowerCase();
      cuisineCounts[t] = (cuisineCounts[t] || 0) + 1;
    });

    recipe.ingredients.forEach((ing) => {
      const name = ing.name.toLowerCase();
      proteinKeywords.forEach((p) => {
        if (name.includes(p)) {
          proteinCounts[p] = (proteinCounts[p] || 0) + 1;
        }
      });
    });
  });

  const topCuisines = Object.entries(cuisineCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([k]) => k);

  const topProteins = Object.entries(proteinCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([k]) => k);

  return { topCuisines, topProteins, recentRecipeIds: recentIds };
}

export function getPatternBasedPicks(
  mealSlots: MealSlot[],
  allRecipes: Recipe[],
  preferences: UserPreferences,
  activeMealTypes: MealType[],
  limit: number = 4,
): Pick[] {
  const { topCuisines, topProteins, recentRecipeIds } = detectUserPatterns(mealSlots, allRecipes);
  if (topCuisines.length === 0 && topProteins.length === 0) return [];

  const candidates: Pick[] = [];

  allRecipes.forEach((recipe) => {
    if (recentRecipeIds.has(recipe.id)) return;
    if (recipeMatchesAllergies(recipe, preferences.allergies)) return;
    if (!recipeMatchesDiet(recipe, preferences.dietaryRestrictions)) return;

    let score = 0;
    const tags = recipe.tags.map((t) => t.toLowerCase());
    const ingNames = recipe.ingredients.map((i) => i.name.toLowerCase()).join(' ');

    topCuisines.forEach((c, i) => {
      if (tags.includes(c)) score += 12 - i * 2;
    });

    topProteins.forEach((p, i) => {
      if (ingNames.includes(p)) score += 8 - i * 2;
    });

    const recipeMealType = inferRecipeMealType(recipe);
    if (activeMealTypes.includes(recipeMealType)) {
      score += 5;
    }

    if (score > 0) {
      candidates.push({ recipe, source: 'pattern', score });
    }
  });

  return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function mergeAndDedupePicks(
  patternPicks: Pick[],
  rulePicks: Pick[],
  aiPicks: Pick[],
  limit: number = 8,
): Pick[] {
  const seen = new Set<string>();
  const merged: Pick[] = [];

  const addUnique = (picks: Pick[]) => {
    for (const pick of picks) {
      const key = pick.recipe.name.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(pick);
      if (merged.length >= limit) break;
    }
  };

  addUnique(patternPicks);
  addUnique(rulePicks);
  addUnique(aiPicks);

  return merged.slice(0, limit);
}

export function hashPreferences(preferences: UserPreferences): string {
  const relevant = {
    diet: [...preferences.dietaryRestrictions].sort().join(','),
    allergies: [...preferences.allergies].sort().join(','),
    cuisines: [...preferences.cuisinePreferences].sort().join(','),
    skill: preferences.cookingSkillLevel,
    prepTime: preferences.mealPrepTime,
    servings: preferences.servingSize,
    // Persona signals that now flow into prompt + scorer — bump the hash so
    // picks re-generate when the user retunes budget/priorities/habits.
    priorities: (preferences.priorities ?? []).join('>'),
    weeklyBudget: preferences.weeklyBudget ?? '',
    monthlyBudget: preferences.monthlyBudget ?? '',
    cookDays: preferences.cookingDaysPerWeek ?? '',
    habits: preferences.mealHabits
      ? `${preferences.mealHabits.breakfast}-${preferences.mealHabits.lunch}-${preferences.mealHabits.dinner}`
      : '',
  };
  return Object.entries(relevant).map(([k, v]) => `${k}:${v}`).join('|');
}

export function getCurrentWeekKey(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diffMs = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const weekNum = Math.floor(dayOfYear / 7) + 1;
  return `${now.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}
