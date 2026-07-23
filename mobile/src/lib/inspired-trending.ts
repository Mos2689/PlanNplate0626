// "Trending now" for the Get Inspired tab.
//
// There is no cross-user popularity signal available on-device, so "trending"
// here is a personalised, day-rotating pick from the static INSPIRED_RECIPES
// bank. It scores every recipe against the user's onboarding preferences plus
// the current time of day, hard-filters anything unsafe (allergens) or off-diet,
// and adds a deterministic per-day jitter so the row feels fresh each day
// without reshuffling on every render.
//
// Pure & deterministic given (recipes, preferences, savedIds, now) — no React,
// no store, no network. This doubles as the cold-start / offline fallback if a
// real backend-backed trending feed is added later.

import type { InspiredRecipe } from './inspired-recipe-library';
import type { UserPreferences } from './store';

// ── Small deterministic string hash → [0, 1) ─────────────────────────────────
function hashUnit(str: string): number {
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // >>> 0 makes it unsigned; divide by 2^32 for [0, 1)
  return (h >>> 0) / 4294967296;
}

// Local YYYY-MM-DD — the seed that keeps the pick stable across a day.
function dayKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function norm(s: string): string {
  return s.toLowerCase().trim();
}

// ── Allergen safety (hard filter) ────────────────────────────────────────────
// Conservative: exclude when any user allergy overlaps any recipe allergen,
// matching loosely so "nuts" also catches "peanuts"/"tree nuts", etc.
function hasAllergenConflict(recipe: InspiredRecipe, allergies: string[]): boolean {
  if (!allergies?.length || !recipe.allergens?.length) return false;
  const recipeAllergens = recipe.allergens.map(norm);
  return allergies.some((a) => {
    const ua = norm(a);
    if (!ua) return false;
    return recipeAllergens.some((ra) => ra === ua || ra.includes(ua) || ua.includes(ra));
  });
}

// ── Dietary fit (hard filter) ────────────────────────────────────────────────
// recipe.dietary carries tags like Vegan / Vegetarian / Pesca / Halal / Kosher
// / Gluten-Free. A restriction is enforced only when we can map it to one of
// those tags; unmappable restrictions (e.g. "Dairy-Free") are left to the
// allergen filter and don't wrongly exclude everything.
const DIETARY_TAG_BY_RESTRICTION: Record<string, string> = {
  vegan: 'vegan',
  vegetarian: 'vegetarian',
  pescatarian: 'pesca',
  pesca: 'pesca',
  halal: 'halal',
  kosher: 'kosher',
  'gluten-free': 'gluten-free',
  'gluten free': 'gluten-free',
  glutenfree: 'gluten-free',
};

function satisfiesDiet(recipe: InspiredRecipe, restrictions: string[]): boolean {
  if (!restrictions?.length) return true;
  const tags = new Set((recipe.dietary ?? []).map(norm));
  return restrictions.every((r) => {
    const required = DIETARY_TAG_BY_RESTRICTION[norm(r)];
    if (!required) return true; // unmappable → don't exclude here
    return tags.has(required);
  });
}

// ── Time-of-day nudge ────────────────────────────────────────────────────────
// Surface what someone is likely to want right now. Keys are InspiredMealType.
function timeOfDayBoost(mealType: string, hour: number): number {
  const mt = mealType;
  if (hour >= 5 && hour < 11) {
    if (mt === 'Breakfast') return 3;
    if (mt === 'Drink') return 1;
    return 0;
  }
  if (hour >= 11 && hour < 15) {
    if (mt === 'Lunch/Dinner') return 2;
    if (mt === 'Appetiser' || mt === 'Snack') return 1;
    return 0;
  }
  if (hour >= 15 && hour < 17) {
    if (mt === 'Snack') return 2;
    if (mt === 'Dessert' || mt === 'Drink') return 1;
    return 0;
  }
  if (hour >= 17 && hour < 22) {
    if (mt === 'Lunch/Dinner') return 3;
    if (mt === 'Dessert' || mt === 'Side Dish') return 1;
    return 0;
  }
  // Late night
  if (mt === 'Snack' || mt === 'Dessert') return 1;
  return 0;
}

export interface BuildTrendingInput {
  recipes: InspiredRecipe[];
  preferences: UserPreferences;
  /** Inspired recipe ids already saved to the library (deprioritised). */
  savedInspiredIds: Set<string>;
  now: Date;
  limit?: number;
}

/**
 * Returns a personalised, day-stable "trending" pick from the inspired bank.
 * Allergen- and diet-safe. Falls back gracefully to a time-of-day + daily
 * rotation when the user has no stated preferences (cold start).
 */
export function buildTrendingRecipes(input: BuildTrendingInput): InspiredRecipe[] {
  const { recipes, preferences, savedInspiredIds, now } = input;
  const limit = input.limit ?? 10;
  const hour = now.getHours();
  const seed = dayKey(now);

  // Preferred cuisines: explicit prefs + explore list + cuisines behind the
  // recipes the user tapped during onboarding ("what I feel like eating").
  const prefCuisines = new Set((preferences.cuisinePreferences ?? []).map(norm));
  const exploreCuisines = new Set((preferences.exploreCuisines ?? []).map(norm));
  const tasteIds = new Set(preferences.tasteRecipeIds ?? []);
  const tasteCuisines = new Set<string>();
  for (const r of recipes) {
    if (tasteIds.has(r.id)) tasteCuisines.add(norm(r.cuisine));
  }
  const goals = new Set((preferences.goals ?? []).map(norm));

  const scored = recipes
    // Hard filters — safety and values first.
    .filter(
      (r) =>
        !hasAllergenConflict(r, preferences.allergies ?? []) &&
        satisfiesDiet(r, preferences.dietaryRestrictions ?? []),
    )
    .map((r) => {
      let score = 0;
      const cuisine = norm(r.cuisine);

      // Cuisine affinity.
      if (prefCuisines.has(cuisine)) score += 3;
      else if (exploreCuisines.has(cuisine)) score += 2;
      if (tasteCuisines.has(cuisine)) score += 2;

      // Prep-time fit.
      if (preferences.mealPrepTime === 'quick') {
        if (r.totalMinutes <= 30) score += 2;
        else if (r.totalMinutes > 45) score -= 1;
      } else if (preferences.mealPrepTime === 'moderate') {
        if (r.totalMinutes <= 60) score += 1;
      } else if (preferences.mealPrepTime === 'elaborate') {
        if (r.totalMinutes >= 45) score += 1;
      }

      // Skill fit.
      const diff = norm(r.difficulty);
      if (preferences.cookingSkillLevel === 'beginner' && diff === 'easy') score += 1;
      if (preferences.cookingSkillLevel === 'advanced' && diff === 'hard') score += 1;

      // Health-goal overlap (capped).
      if (goals.size > 0) {
        const overlap = (r.healthGoals ?? []).some((g) => goals.has(norm(g)));
        if (overlap) score += 1;
      }

      // Time-of-day relevance.
      score += timeOfDayBoost(r.mealType, hour);

      // Deprioritise recipes already saved to the library (still eligible so
      // the pool never starves, just unlikely to surface).
      if (savedInspiredIds.has(r.id)) score -= 3;

      // Deterministic per-day jitter → daily rotation without per-render churn.
      score += hashUnit(`${r.id}::${seed}`) * 2;

      return { r, score };
    });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable, day-varying tiebreak.
    return hashUnit(`${b.r.id}::tb::${seed}`) - hashUnit(`${a.r.id}::tb::${seed}`);
  });

  return scored.slice(0, limit).map((s) => s.r);
}
