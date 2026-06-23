import { Recipe, MealSlot } from './store';
import { validateIngredient } from './ingredient-validator';
import { curatedNameSlug } from './recipe-identity';
import {
  buildHighProteinMeals,
  CookingPreferences,
  DEFAULT_COOKING_PREFS,
} from './high-protein-plan';
import { buildVegetarianMeals } from './vegetarian-plan';
import { buildLightEasyMeals } from './light-easy-plan';
import { buildFamilyBudgetMeals } from './family-budget-plan';
import { buildSoloActiveMeals } from './solo-active-plan';

export interface CuratedMealPlan {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  // Optional blurhash for the hero image — generated offline by
  // scripts/generate-blurhashes.ts. When present, DishImage paints it
  // instantly while the full WebP streams in. Optional so the screens still
  // render correctly before the script has been run for a given plan.
  blurhash?: string;
  duration: '3-day' | '5-day' | '7-day';
  tags: string[];
  totalCalories: number;
  meals: CuratedMeal[];

  // ── Scheduling controls ──
  // When true, the overview screen exposes Duration (7/14/21/custom) and
  // cooking-style preferences, and the meals are generated dynamically from
  // a repeating base week via getScheduledMeals() instead of being a fixed
  // list. Currently only the High-Protein Simple plan opts in.
  schedulable?: boolean;

  // ── Landing-page highlights ──
  // Editorial fact lines pulled from the plan's source document (budget,
  // servings, macros, etc.). When present, the landing page's inset box shows
  // these instead of the generic recipes/days/cal stat grid.
  highlights?: string[];

  // ── Editorial / social-proof signals ──
  // editorsPick floats a small "EDITOR'S PICK" badge on the card's
  // image. Use sparingly — 1–2 plans across the catalog so the
  // signal stays meaningful.
  editorsPick?: boolean;
  // Seeded baselines for social proof on cards. The user's own
  // rating + cook-from-this-plan activity is layered locally via
  // deriveLivePlanStats() in plan-stats.ts so the numbers feel
  // alive without a real-time aggregation backend. Replace seeds
  // with a Supabase aggregate when that backend exists (follow-up).
  socialStats?: {
    cookCount: number;
    rating: { avg: number; count: number };
  };
}

export interface CuratedMeal {
  dayOffset: number; // 0 = first day, 1 = second day, etc.
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  recipe: Omit<Recipe, 'id' | 'isSaved' | 'createdAt' | 'isAIGenerated' | 'curatedSourceId'> & {
    // Optional explicit, stable identity override. By default the curated
    // recipe's identity is derived as `${plan.id}::${slug(recipe.name)}`,
    // which is rename-proof for the user (the key is never recomputed from
    // their renamed copy). Pin `sourceId` ONLY if you later rename a recipe
    // in this data file and need existing installs to keep deduping to it.
    sourceId?: string;
  };
  // When set, this slot is NOT a cooked recipe. apply() leaves the calendar
  // slot recipe-less and labels it with this string (e.g. "Grab & go"). The
  // `recipe` above is only a display stand-in in that case.
  placeholderLabel?: string;
  // How many meals this single cook feeds (the fresh meal + every leftover that
  // reheats it). Used to scale the cook's serving size: a batch cooked once but
  // eaten across 3 meals must yield (household serves × 3) portions. Defaults
  // to 1 (a normal cook-once-eat-once meal).
  mealsCovered?: number;
}

// Generate a unique ID
const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

export const CURATED_MEAL_PLANS: CuratedMealPlan[] = [
  {
    id: 'vegetarian-delight',
    name: 'Vegetarian Delight',
    description:
      'A plant-forward plan — global veg dinners, hearty lunches and protein-rich breakfasts. Schedule it your way: batch-cook or cook daily.',
    // Hero image — app-hosted (Supabase) so it loads reliably on the cards.
    imageUrl:
      'https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/Vegeterian%20Delight%20Meal%20Plan/halloumi_roasted_vegetable_tray_bake_with_quinoa.png',
      blurhash: 'LSLDMe={tlxa~pS4RjbaBpS5Vsof',
    socialStats: { cookCount: 1289, rating: { avg: 4.5, count: 287 } },
    duration: '7-day',
    tags: ['Vegetarian', 'Plant-Based', 'High Fiber'],
    totalCalories: 11200,
    schedulable: true,
    highlights: [
      'Plant-forward · 2 serves',
      'Global veg dinners + protein-rich breakfasts',
      'Batch-cook or cook daily — leftovers handled',
    ],
    // Base week generated from the Vegetarian Delight bank (vegetarian-plan.ts).
    // getScheduledMeals() rebuilds it for the chosen Duration + cooking style.
    meals: buildVegetarianMeals(7),
  },
  {
    id: 'high-protein-simple',
    name: 'High-Protein Simple Plan',
    description: 'Muscle-supporting meals with protein in every meal. Perfect for fitness and everyday energy without extreme dieting.',
    // Hero image — from the plan's dedicated Supabase bucket.
    imageUrl:
      'https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/High%20Protein%20Gym%20Meal%20Plan/honey_soy_chicken_thigh_bowl.png',
      blurhash: 'LULD+3.7yExv_NV[WBoLPCn,R5e.',
    duration: '7-day',
    tags: ['High Protein', 'Muscle Support', 'Simple'],
    totalCalories: 13500,
    socialStats: { cookCount: 891, rating: { avg: 4.7, count: 198 } },
    schedulable: true,
    highlights: [
      'Budget $100–120/week · 2 people',
      '~2,600–3,000 kcal/day · 150–180g protein/day',
      'Pantry builds across the month',
    ],
    // Meals come from a repeating 7-day base week built from the doc's
    // 16-recipe bank (high-protein-plan.ts). getScheduledMeals() rebuilds
    // this for the chosen Duration + cooking style on the overview screen.
    meals: buildHighProteinMeals(7),
  },
  {
    id: 'family-friendly',
    name: 'Family-Friendly Plan',
    description:
      'Cook-once family meals with kid-friendly bases and easy adult swaps. Schedule it your way: batch-cook or cook daily.',
    imageUrl:
      'https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/Smart%20Family%20Budget/slow_cooked_pulled_lamb_shoulder.png',
      blurhash: 'LiHdvmV@Rkt7~UM|M|ayxtRkRjWB',
    socialStats: { cookCount: 1124, rating: { avg: 4.5, count: 245 } },
    duration: '7-day',
    tags: ['Family', 'Budget', 'Flexible'],
    totalCalories: 12800,
    schedulable: true,
    highlights: [
      'Cook-once strategy · ~\$120–150/wk',
      '4 serves per recipe · family-sized',
      'Batch-cook or cook daily — leftovers handled',
    ],
    // Base week generated from the plan's bank. getScheduledMeals() rebuilds
    // it for the chosen Duration + cooking style.
    meals: buildFamilyBudgetMeals(7),
  },
  {
    id: 'light-digestive-easy',
    name: 'Light & Digestive Easy Plan',
    description:
      'Gentle, low-GI meals with easy-to-digest proteins — ideal for 60+ and lighter appetites. Schedule it your way.',
    imageUrl:
      'https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/Light%20%26%20Easy%20Meal%20Plan/baked_salmon_with_steamed_broccolini_brown_rice.png',
      blurhash: 'LLG*m1~BK6OYoeV@WBWW5YEMn3wJ',
    socialStats: { cookCount: 742, rating: { avg: 4.6, count: 156 } },
    duration: '7-day',
    tags: ['Light & Easy', 'Low GI', 'Gentle'],
    totalCalories: 10500,
    schedulable: true,
    highlights: [
      'Low GI · low sodium · easy-to-digest',
      '1,400–1,600 kcal/day · 1 serve',
      'Batch-cook or cook daily — leftovers handled',
    ],
    // Base week generated from the plan's bank. getScheduledMeals() rebuilds
    // it for the chosen Duration + cooking style.
    meals: buildLightEasyMeals(7),
  },
  {
    id: 'just-for-one',
    name: 'Just for One',
    description:
      'High-energy solo meals sized for one, with smart dinner-to-lunch leftovers. Schedule it your way: batch-cook or cook daily.',
    imageUrl:
      'https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/Solo%20Active%20Professional/shakshuka_for_one.png',
      blurhash: 'LLJQTDxZI[D*^i~VM{M{IpRjRjxt',
    socialStats: { cookCount: 968, rating: { avg: 4.7, count: 174 } },
    duration: '7-day',
    tags: ['Solo', 'High Protein', 'Active'],
    totalCalories: 15400,
    schedulable: true,
    highlights: [
      'Active lifestyle · ~2,000–2,400 kcal',
      '1 serve · dinner → next-day lunch',
      'Batch-cook or cook daily — leftovers handled',
    ],
    // Base week generated from the plan's bank. getScheduledMeals() rebuilds
    // it for the chosen Duration + cooking style.
    meals: buildSoloActiveMeals(7),
  },
];

// ───────────────────────────────────────────────────────────────────────────────
// RECIPE BROWSING HELPERS — used by the Explore screen + curated recipe detail.
// A "recipe entry" is one unique recipe within a plan (the plan's base week
// repeats recipes across days; we dedupe by name slug for browsing).
// ───────────────────────────────────────────────────────────────────────────────

export interface CuratedRecipeEntry {
  /** Stable per-plan key — curatedNameSlug(recipe.name). Used for navigation. */
  key: string;
  mealType: CuratedMeal['mealType'];
  recipe: CuratedMeal['recipe'];
  planId: string;
  planName: string;
}

/**
 * A reheat-only "leftover / tiffin" variant — e.g. "Barramundi Rice Bowl
 * (leftover tiffin)", "Wednesday Taco Mince Tiffin Bowl" — whose ingredients are
 * pre-cooked components ("Leftover rice", "Leftover taco mince"). These exist
 * only to fill the leftover days when a whole plan is applied; they are NOT
 * standalone cook-from-scratch recipes, so they must never surface in the
 * Get Inspired browse or be picked into an AI-generated plan.
 */
function isLeftoverVariantRecipe(recipe: CuratedMeal['recipe']): boolean {
  if (/\bleftover\b|\btiffin\b/i.test(recipe.name)) return true;
  const ings = recipe.ingredients || [];
  if (ings.length === 0) return false;
  const leftoverIngredients = ings.filter((i) => /^\s*leftover\b/i.test(i.name)).length;
  return leftoverIngredients / ings.length >= 0.5;
}

/** All unique cook-from-scratch recipes in a plan, deduped by name slug, in first-seen order. */
export function getCuratedPlanRecipes(plan: CuratedMealPlan): CuratedRecipeEntry[] {
  const seen = new Set<string>();
  const out: CuratedRecipeEntry[] = [];
  for (const meal of plan.meals) {
    // Skip grab-&-go / buy-out placeholders — they have no real recipe to show.
    if (meal.placeholderLabel) continue;
    if (!meal.recipe?.name) continue;
    // Skip reheat-only leftover/tiffin variants — not standalone recipes.
    if (isLeftoverVariantRecipe(meal.recipe)) continue;
    const key = curatedNameSlug(meal.recipe.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      mealType: meal.mealType,
      recipe: meal.recipe,
      planId: plan.id,
      planName: plan.name,
    });
  }
  return out;
}

/** Look up a single curated recipe by plan id + recipe key (name slug). */
export function findCuratedRecipe(
  planId: string,
  key: string,
): CuratedRecipeEntry | undefined {
  const plan = CURATED_MEAL_PLANS.find((p) => p.id === planId);
  if (!plan) return undefined;
  return getCuratedPlanRecipes(plan).find((r) => r.key === key);
}

/**
 * The stable library identity for a curated recipe entry. Matches the id
 * minted in applyCuratedMealPlan, so saving a recipe from the Explore screen
 * dedupes against the same row created when its parent plan is applied.
 */
export function curatedSourceIdFor(entry: CuratedRecipeEntry): string {
  return entry.recipe.sourceId ?? `${entry.planId}::${entry.key}`;
}

/**
 * Build a full Recipe from a curated entry, ready for store.addRecipe (which
 * upserts on curatedSourceId — so it can never create a duplicate row).
 * Ingredients are sanitized to metric, mirroring applyCuratedMealPlan.
 */
export function buildCuratedRecipe(
  entry: CuratedRecipeEntry,
  isSaved: boolean,
): Recipe {
  const { sourceId: _override, ...recipeData } = entry.recipe;
  const sanitizedIngredients = entry.recipe.ingredients.map((ingredient) => {
    const validated = validateIngredient(ingredient);
    return { ...ingredient, quantity: validated.quantity, unit: validated.unit };
  });
  return {
    ...recipeData,
    ingredients: sanitizedIngredients,
    id: '',
    curatedSourceId: curatedSourceIdFor(entry),
    isAIGenerated: false,
    isSaved,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Resolve the meal list for a plan at a given duration + cooking style.
 *
 * For schedulable plans (currently High-Protein Simple) the meals are
 * generated from a repeating 7-day base week so the day-by-day browser and
 * the apply flow both reflect the user's chosen Duration and cooking-style.
 * For every other plan it simply repeats the plan's fixed base week to fill
 * the requested number of days (a no-op when durationDays === base length).
 */
export function getScheduledMeals(
  plan: CuratedMealPlan,
  durationDays: number,
  prefs: CookingPreferences = DEFAULT_COOKING_PREFS,
  startWeekday: number = 0,
): CuratedMeal[] {
  const days = Math.max(1, Math.floor(durationDays));

  if (plan.id === 'high-protein-simple') {
    return buildHighProteinMeals(days, prefs, startWeekday) as CuratedMeal[];
  }
  if (plan.id === 'vegetarian-delight') {
    return buildVegetarianMeals(days, prefs, startWeekday) as CuratedMeal[];
  }
  if (plan.id === 'light-digestive-easy') {
    return buildLightEasyMeals(days, prefs, startWeekday) as CuratedMeal[];
  }
  if (plan.id === 'family-friendly') {
    return buildFamilyBudgetMeals(days, prefs, startWeekday) as CuratedMeal[];
  }
  if (plan.id === 'just-for-one') {
    return buildSoloActiveMeals(days, prefs, startWeekday) as CuratedMeal[];
  }

  // Generic fallback: repeat the plan's own base week to fill `days`.
  const baseLen =
    plan.meals.reduce((max, m) => Math.max(max, m.dayOffset), 0) + 1;
  if (days <= baseLen) {
    return plan.meals.filter((m) => m.dayOffset < days);
  }
  const out: CuratedMeal[] = [];
  for (let d = 0; d < days; d++) {
    const w = d % baseLen;
    plan.meals
      .filter((m) => m.dayOffset === w)
      .forEach((m) => out.push({ ...m, dayOffset: d }));
  }
  return out;
}

// Helper function to apply a curated meal plan.
// `mealsOverride` lets callers pass a duration/cooking-style-expanded meal
// list (from getScheduledMeals); when omitted the plan's base meals are used.
export function applyCuratedMealPlan(
  plan: CuratedMealPlan,
  startDate: string,
  addRecipe: (recipe: Recipe) => string,
  addMealToSlot: (slot: MealSlot) => void,
  mealsOverride?: CuratedMeal[],
  // Household serving size from the user's profile. When set, each cooked
  // recipe's slot is sized to (servings × meals it feeds): a batch cooked once
  // but eaten across 3 meals for 2 people becomes a 6-serve cook, so the
  // grocery list buys enough. Leftover placeholders carry no recipe, so they
  // never add ingredients regardless.
  defaultServings?: number
): void {
  // Parse the date string correctly (YYYY-MM-DD format)
  const [year, month, day] = startDate.split('-').map(Number);
  const start = new Date(year, month - 1, day);

  const meals = mealsOverride ?? plan.meals;
  meals.forEach((meal) => {
    const mealDate = new Date(start);
    mealDate.setDate(mealDate.getDate() + meal.dayOffset);

    const dateKey = formatDateKey(mealDate);

    // Placeholder slot (e.g. "Grab & go") — no recipe is assigned. We add a
    // recipe-less slot that just carries the label so it shows on the calendar
    // without ever creating a library recipe.
    if (meal.placeholderLabel) {
      addMealToSlot({
        id: generateId(),
        date: dateKey,
        mealType: meal.mealType,
        recipeId: null,
        customMealName: meal.placeholderLabel,
        curatedPlanId: plan.id,
      });
      return;
    }

    // Validate and sanitize all ingredients (convert imperial to metric)
    const sanitizedIngredients = meal.recipe.ingredients.map((ingredient) => {
      const validated = validateIngredient(ingredient);
      if (!validated.isValid || ingredient.unit !== validated.unit) {
        console.log(`[VALIDATION] ${ingredient.name}: "${ingredient.quantity} ${ingredient.unit}" → "${validated.quantity} ${validated.unit}"`);
        if (validated.warnings.length > 0) {
          console.log(`  Warnings: ${validated.warnings.join(', ')}`);
        }
      }
      return {
        ...ingredient,
        quantity: validated.quantity,
        unit: validated.unit,
      };
    });

    // Stable, rename-proof identity for this curated recipe. addRecipe upserts
    // on this, so re-applying the same plan (any week, any session) reuses the
    // existing library row instead of creating a duplicate. Derived from the
    // SOURCE name (fixed in this data file), never from the user's renamed copy.
    const { sourceId: _sourceIdOverride, ...recipeData } = meal.recipe;
    const curatedSourceId =
      _sourceIdOverride ?? `${plan.id}::${curatedNameSlug(meal.recipe.name)}`;

    // Create the recipe with sanitized ingredients. No id is minted here —
    // addRecipe assigns one on first insert, or returns the existing row's id.
    const fullRecipe: Recipe = {
      ...recipeData,
      ingredients: sanitizedIngredients,
      id: '',
      curatedSourceId,
      isAIGenerated: false,
      isSaved: false,
      createdAt: new Date().toISOString(),
    };

    // Add recipe (upsert) and get its ID — existing row reused if already present
    const recipeId = addRecipe(fullRecipe);

    // Size the cook to the household × how many meals this one cook feeds.
    // Grocery scaling divides by the recipe's own base servings, so this lands
    // the right ingredient quantities (e.g. 2 people × 3 meals = 6 serves).
    const servingOverride =
      defaultServings && defaultServings > 0
        ? defaultServings * (meal.mealsCovered ?? 1)
        : undefined;

    // Create the meal slot with curated plan tracking
    const slot: MealSlot = {
      id: generateId(),
      date: dateKey,
      mealType: meal.mealType,
      recipeId: recipeId,
      curatedPlanId: plan.id, // Track the source curated plan
      ...(servingOverride !== undefined ? { servingOverride } : {}),
    };

    addMealToSlot(slot);
  });
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

