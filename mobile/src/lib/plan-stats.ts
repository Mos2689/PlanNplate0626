// Pure helpers for the social-proof + personal-fit signals that
// render on curated-plan cards (PnPSpecials, /curated-meal-plan, and
// /curated-plan-detail).
//
// Two big ideas:
//   1. `deriveLivePlanStats` layers the user's local rating + their
//      personal cook activity on top of the seeded `socialStats` so
//      the community numbers feel alive without a real-time backend.
//   2. `pickPersonalFit` picks the single highest-value "Fits your X"
//      tag for the current user based on their saved preferences.
//      Priority order means the most specific reason always wins,
//      and the function returns `null` for users with no relevant
//      signal so the card meta line ends cleanly.
//
// No store access. Every consumer passes in the data they hold.

import type { CookingLog, MealSlot, UserPreferences } from './store';
import type { CuratedMealPlan } from './curated-meal-plans';

// ─── Live-stats merge ─────────────────────────────────────────────────

export interface LivePlanStats {
  cookCount: number;       // seeded baseline + 1 if user has cooked from this plan
  rating: {
    avg: number;            // includes user's own rating if present
    count: number;          // baseline + 1 if user has rated
  };
  userStars?: 1 | 2 | 3 | 4 | 5; // surfaced for the "(you)" pill
}

/** Returns true if the user has ≥1 'cooked' log on a slot tagged with this plan. */
export function hasUserCookedFromPlan(
  planId: string,
  cookingLogs: CookingLog[],
  mealSlots: MealSlot[],
): boolean {
  return countCookedFromPlan(planId, cookingLogs, mealSlots) > 0;
}

/** Number of `cooked`-status logs whose slot is tagged with this plan id. */
export function countCookedFromPlan(
  planId: string,
  cookingLogs: CookingLog[],
  mealSlots: MealSlot[],
): number {
  const slotIdsForPlan = new Set(
    mealSlots.filter((s) => s.curatedPlanId === planId).map((s) => s.id),
  );
  return cookingLogs.filter(
    (log) => log.status === 'cooked' && slotIdsForPlan.has(log.slotId),
  ).length;
}

/**
 * Layers user's local rating + cook activity on top of the seeded
 * `socialStats` baseline. Returns sensible defaults if the plan has
 * no `socialStats` at all (so the card never crashes).
 */
export function deriveLivePlanStats(
  plan: CuratedMealPlan,
  mealPlanRatings: Array<{ planId: string; stars: 1 | 2 | 3 | 4 | 5 }>,
  cookingLogs: CookingLog[],
  mealSlots: MealSlot[],
): LivePlanStats {
  const seeded = plan.socialStats ?? {
    cookCount: 0,
    rating: { avg: 0, count: 0 },
  };

  const userCooked = hasUserCookedFromPlan(plan.id, cookingLogs, mealSlots);
  const userRating = mealPlanRatings.find((r) => r.planId === plan.id);

  let mergedAvg = seeded.rating.avg;
  let mergedCount = seeded.rating.count;
  if (userRating) {
    const newCount = mergedCount + 1;
    mergedAvg = (mergedAvg * mergedCount + userRating.stars) / newCount;
    mergedCount = newCount;
  }

  return {
    cookCount: seeded.cookCount + (userCooked ? 1 : 0),
    rating: {
      avg: Math.round(mergedAvg * 10) / 10, // single decimal for display
      count: mergedCount,
    },
    userStars: userRating?.stars,
  };
}

// ─── Compact number formatting ────────────────────────────────────────
// "247" → "247", "1247" → "1.2k", "12847" → "12.8k". One-decimal
// precision below 10k, integer above. Reads as a deliberate design
// choice rather than raw data.

export function compactNumber(n: number): string {
  if (!isFinite(n) || n < 0) return '0';
  if (n < 1000) return String(Math.round(n));
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

// ─── Personal fit ─────────────────────────────────────────────────────
// Priority cascade — first match wins. Each branch is allowed to
// produce a short tail like "Fits your 30-min nights" or null.
//
// Safety: this function MUST NOT recommend a plan as "fits your X"
// if it would violate the user's allergies. The allergen check
// short-circuits everything and returns null instead.

const DIET_TAG_MAP: Record<string, string[]> = {
  Vegan: ['Vegan'],
  Vegetarian: ['Vegan', 'Vegetarian'],
  Pescatarian: ['Vegan', 'Vegetarian', 'Pescatarian'],
  'Gluten-Free': ['Gluten-Free', 'Gluten Free'],
  'Dairy-Free': ['Dairy-Free', 'Dairy Free'],
  Keto: ['Keto', 'Low Carb', 'Low-Carb'],
  Paleo: ['Paleo'],
  'Low-Carb': ['Low Carb', 'Low-Carb', 'Keto'],
  Halal: ['Halal'],
  Kosher: ['Kosher'],
};

// Surface-level allergen vocab. We check ingredient names across the
// plan's meals for these tokens; if any user allergen matches, we
// suppress the personal-fit signal entirely (never recommend a plan
// we think might contain their allergen).
const ALLERGY_TOKEN_MAP: Record<string, string[]> = {
  Peanuts: ['peanut'],
  'Tree Nuts': ['almond', 'cashew', 'walnut', 'pistachio', 'pecan', 'hazelnut', 'macadamia'],
  Milk: ['milk', 'cream', 'butter', 'cheese', 'yogurt', 'yoghurt', 'whey', 'cottage cheese', 'mozzarella', 'parmesan', 'feta', 'ricotta'],
  Eggs: ['egg'],
  Wheat: ['wheat', 'flour', 'bread', 'pasta', 'noodle', 'breadcrumb', 'tortilla', 'wrap', 'bagel'],
  Soy: ['soy', 'tofu', 'tempeh', 'edamame'],
  Fish: ['salmon', 'cod', 'tuna', 'tilapia', 'fish'],
  Shellfish: ['shrimp', 'prawn', 'crab', 'lobster', 'clam', 'mussel', 'oyster', 'scallop'],
  Sesame: ['sesame', 'tahini'],
};

function planContainsAllergen(plan: CuratedMealPlan, allergy: string): boolean {
  const tokens = ALLERGY_TOKEN_MAP[allergy];
  if (!tokens) return false;
  for (const meal of plan.meals) {
    for (const ing of meal.recipe.ingredients) {
      const name = ing.name.toLowerCase();
      if (tokens.some((tok) => name.includes(tok))) return true;
    }
  }
  return false;
}

/**
 * Returns the highest-value "Fits your X" tail for the current user.
 * Priority cascade: diet → time → goals → pantry → cadence. Returns
 * null when no signal is strong enough OR when the plan contains any
 * of the user's allergens (safety override).
 */
export function pickPersonalFit(
  plan: CuratedMealPlan,
  preferences: UserPreferences,
): string | null {
  // ── Safety override ──
  // Never claim a plan "fits" a user if it contains their allergen.
  // This is a soft guard for the recommendation line only — the
  // actual recipe generation safety is enforced elsewhere.
  if (preferences.allergies && preferences.allergies.length > 0) {
    const hasMatchingAllergen = preferences.allergies.some((a) =>
      planContainsAllergen(plan, a),
    );
    if (hasMatchingAllergen) return null;
  }

  // ── 1. Diet match — most specific ──
  if (preferences.dietaryRestrictions && preferences.dietaryRestrictions.length > 0) {
    for (const diet of preferences.dietaryRestrictions) {
      const matchingTags = DIET_TAG_MAP[diet] ?? [diet];
      const planTags = plan.tags.map((t) => t.toLowerCase());
      if (matchingTags.some((t) => planTags.includes(t.toLowerCase()))) {
        return `Fits your ${diet.toLowerCase()} diet`;
      }
    }
  }

  // ── 2. Time match ──
  if (preferences.weeknightMinutes && preferences.weeknightMinutes > 0) {
    const avgRecipeTime = computeAvgRecipeTime(plan);
    if (avgRecipeTime > 0 && avgRecipeTime <= preferences.weeknightMinutes) {
      return `Fits your ${preferences.weeknightMinutes}-min nights`;
    }
  }

  // ── 3. Goal match ──
  if (preferences.goals && preferences.goals.length > 0) {
    const goalToTagMap: Record<string, string[]> = {
      eat_healthier: ['Balanced', 'Healthy', 'Mediterranean'],
      save_money: ['Budget', 'Pantry-Friendly', 'Low-Waste'],
      reduce_waste: ['Low-Waste', 'Pantry-Friendly'],
      learn_recipes: ['Adventurous', 'New', 'Variety'],
      lose_weight: ['Low Carb', 'Low-Carb', 'High Protein', 'Light', 'Balanced'],
      more_protein: ['High Protein', 'Muscle Support'],
    };
    const goalLabelMap: Record<string, string> = {
      eat_healthier: 'eating healthier',
      save_money: 'saving money',
      reduce_waste: 'reducing waste',
      learn_recipes: 'learning new recipes',
      lose_weight: 'weight loss',
      more_protein: 'more protein',
    };
    const planTagsLower = plan.tags.map((t) => t.toLowerCase());
    for (const goal of preferences.goals) {
      const targets = (goalToTagMap[goal] ?? []).map((t) => t.toLowerCase());
      if (targets.some((t) => planTagsLower.includes(t))) {
        const label = goalLabelMap[goal] ?? goal;
        return `Helps with ${label}`;
      }
    }
  }

  // ── 4. Pantry overlap ──
  if (preferences.pantryStaples && preferences.pantryStaples.length > 0) {
    const pantryLower = new Set(
      preferences.pantryStaples.map((p) => p.toLowerCase().trim()),
    );
    const planIngredients = new Set<string>();
    for (const meal of plan.meals) {
      for (const ing of meal.recipe.ingredients) {
        planIngredients.add(ing.name.toLowerCase().trim());
      }
    }
    let overlap = 0;
    for (const ing of planIngredients) {
      for (const p of pantryLower) {
        if (ing.includes(p) || p.includes(ing)) {
          overlap += 1;
          break;
        }
      }
    }
    if (overlap >= 4) {
      return `Uses ${overlap} pantry staples you have`;
    }
  }

  // ── 5. Cadence match ──
  if (preferences.cookingDaysPerWeek && preferences.cookingDaysPerWeek > 0) {
    const planDays = parseInt(plan.duration.split('-')[0], 10);
    if (
      isFinite(planDays) &&
      Math.abs(planDays - preferences.cookingDaysPerWeek) <= 1
    ) {
      return `Matches your ${preferences.cookingDaysPerWeek}-days-a-week pace`;
    }
  }

  return null;
}

/** Average (prepTime + cookTime) across all recipes in a plan. 0 if empty. */
function computeAvgRecipeTime(plan: CuratedMealPlan): number {
  if (plan.meals.length === 0) return 0;
  const total = plan.meals.reduce(
    (acc, meal) => acc + (meal.recipe.prepTime ?? 0) + (meal.recipe.cookTime ?? 0),
    0,
  );
  return Math.round(total / plan.meals.length);
}
