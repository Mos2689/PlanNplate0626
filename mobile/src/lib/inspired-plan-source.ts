// ─────────────────────────────────────────────────────────────────────────────
// Inspired-library plan source
//
// "Plan My Meal" sources recipes from the new 667-recipe Get Inspired library
// (INSPIRED_RECIPES) BEFORE any OpenAI call. This module is a drop-in for the
// old `createCuratedMatcher` (same `CuratedMatcher` shape / `take()` contract),
// so the generation engine wiring is unchanged — only the pool + selection
// logic differ.
//
// Selection is a strict priority cascade (per the product spec):
//   1. Dietary preference + allergies — STRICT hard gate (all meal types).
//   2. Cuisine — lunch/dinner ONLY. Exact first, then similar (adjacency),
//      then any. "Any" (or no cuisine chosen) = whole dietary-filtered pool.
//   3. Cooking level — lunch/dinner ONLY. Beginner→Easy only (never harder);
//      Intermediate→Medium first then Easy; Advanced→Hard first then Medium/Easy.
//   4. Time — lunch/dinner ONLY. Prefer the selected bucket, extend up to +15
//      min when the bucket is exhausted. Lower buckets are always allowed.
//   5. What matters most (preferences.priorities) — Time (≤30m), Cost (<$5/serve),
//      Variety (no repeat in-plan or in the prior 14 days), Health (heart-healthy
//      / low-carb / low-cal / gut-health first, then high-protein).
//
// Breakfast & snack ignore cuisine / level / time — only dietary applies.
// Breakfast weekday(no-cook)/weekend(elaborate) is driven by the engine via
// `opts.predicate` on cookTime, so no-cook breakfasts expose cookTime === 0.
// ─────────────────────────────────────────────────────────────────────────────

import { INSPIRED_RECIPES, type InspiredRecipe } from './inspired-recipe-library';
import type { GeneratedRecipeResponse, MealType } from './openai';
import type { UserPreferences, Priority } from './store';
import type { CuratedMatcher, CuratedTakeOptions } from './curated-recipe-source';

// ── Static taxonomy helpers ─────────────────────────────────────────────────

type PlanCategory = 'breakfast' | 'lunchdinner' | 'snack';

// Which library mealType feeds each plan slot. Lunch AND dinner both draw from
// the shared "Lunch/Dinner" pool.
function planCategory(mealType: MealType): PlanCategory | null {
  switch (mealType) {
    case 'breakfast':
      return 'breakfast';
    case 'lunch':
    case 'dinner':
      return 'lunchdinner';
    case 'snack':
      return 'snack';
    default:
      return null;
  }
}

function libraryMealTypesFor(cat: PlanCategory): string[] {
  switch (cat) {
    case 'breakfast':
      return ['Breakfast'];
    case 'lunchdinner':
      return ['Lunch/Dinner'];
    case 'snack':
      return ['Snack'];
  }
}

// Cuisine adjacency — when the exact cuisine pool is exhausted we extend to
// "similar" cuisines before falling back to the whole pool. Symmetric-ish;
// tuned per spec (Thai→Asian/Chinese; Japanese↔Korean; Mediterranean↔Greek).
const CUISINE_ADJACENCY: Record<string, string[]> = {
  Thai: ['Asian', 'Chinese', 'Japanese', 'Korean'],
  Chinese: ['Asian', 'Thai', 'Japanese', 'Korean'],
  Japanese: ['Korean', 'Asian', 'Chinese', 'Thai'],
  Korean: ['Japanese', 'Asian', 'Chinese', 'Thai'],
  Asian: ['Chinese', 'Thai', 'Japanese', 'Korean'],
  Indian: ['Asian', 'Thai'],
  Mediterranean: ['Greek', 'Italian'],
  Greek: ['Mediterranean', 'Italian'],
  Italian: ['Mediterranean', 'French', 'Greek'],
  French: ['Italian', 'Mediterranean'],
  Mexican: ['American'],
  American: ['Mexican'],
};

// Health goals that count as the "1st tier" health preference.
const PRIMARY_HEALTH_GOALS = new Set([
  'Heart Healthy',
  'Low-Carb',
  'Low Calories',
  'Gut Health',
]);
const SECONDARY_HEALTH_GOALS = new Set(['High Protein']);

const DIFFICULTY_RANK: Record<string, number> = { Easy: 1, Medium: 2, Hard: 3 };

// User allergy id (onboarding ALLERGY_OPTIONS) → library allergen tag(s).
// The library tracks Dairy/Gluten as allergens (not dietary tags), so the
// "Dairy-Free" / "Gluten-Free" dietary selections map here too.
const ALLERGY_TO_LIBRARY: Record<string, string[]> = {
  Peanuts: ['Peanuts'],
  'Tree Nuts': ['Nuts'],
  Milk: ['Dairy'],
  Dairy: ['Dairy'],
  Eggs: ['Egg'],
  Egg: ['Egg'],
  Fish: ['Fish'],
  Shellfish: ['Shellfish'],
  Soy: ['Soy'],
  Wheat: ['Gluten'],
  Gluten: ['Gluten'],
  Sesame: ['Sesame'],
};

// Cooking verbs that mean a recipe applies heat (→ NOT no-cook). Used to derive
// cookTime for breakfasts so the engine's weekday(no-cook)/weekend(cooked)
// predicate keeps working against library data.
const COOK_VERBS = [
  'bake', 'roast', 'fry', 'fried', 'grill', 'griddle', 'broil', 'saute',
  'sauté', 'sear', 'simmer', 'boil', 'poach', 'steam', 'microwave', 'toast',
  'scramble', 'braise', 'stir-fry', 'deep-fry', 'pan-fry', 'cook ', 'cooked',
  'cooking', 'heat ', 'preheat', 'oven', 'skillet', 'saucepan',
];

function detectNoCook(recipe: InspiredRecipe): boolean {
  const text = recipe.instructions.join(' ').toLowerCase();
  return !COOK_VERBS.some((v) => text.includes(v));
}

// ── Enriched records (built once from the static library) ────────────────────

interface EnrichedRecord {
  recipe: InspiredRecipe;
  category: PlanCategory;
  isNoCook: boolean;
}

const RECORDS: Record<PlanCategory, EnrichedRecord[]> = {
  breakfast: [],
  lunchdinner: [],
  snack: [],
};

(() => {
  const catByLibType: Record<string, PlanCategory> = {
    Breakfast: 'breakfast',
    'Lunch/Dinner': 'lunchdinner',
    Snack: 'snack',
  };
  for (const recipe of INSPIRED_RECIPES) {
    const cat = catByLibType[recipe.mealType];
    if (!cat) continue; // Drink / Dessert / Appetiser / Side Dish — not planned
    RECORDS[cat].push({
      recipe,
      category: cat,
      isNoCook: cat === 'breakfast' ? detectNoCook(recipe) : false,
    });
  }
})();

// ── Preference matching ──────────────────────────────────────────────────────

function normList(xs?: string[] | null): string[] {
  return (xs ?? []).filter((x) => x && x.toLowerCase() !== 'none');
}

// STRICT dietary gate — every selected dietary must be satisfied (AND).
function satisfiesDietary(recipe: InspiredRecipe, diets: string[]): boolean {
  const tags = recipe.dietary.map((d) => d.toLowerCase());
  const allergens = recipe.allergens.map((a) => a.toLowerCase());
  const has = (t: string) => tags.includes(t.toLowerCase());

  for (const raw of diets) {
    const d = raw.toLowerCase();
    switch (d) {
      case 'vegetarian':
        if (!(has('vegetarian') || has('vegan'))) return false;
        break;
      case 'vegan':
        if (!has('vegan')) return false;
        break;
      case 'pescatarian':
        // Pescatarian eats vegetarian/vegan dishes plus dedicated pesca ones.
        if (!(has('pesca') || has('pescatarian') || has('vegetarian') || has('vegan')))
          return false;
        break;
      case 'gluten-free':
        if (!(has('gluten-free') || !allergens.includes('gluten'))) return false;
        break;
      case 'dairy-free':
        if (allergens.includes('dairy')) return false;
        break;
      case 'keto':
        if (!has('keto')) return false;
        break;
      case 'low-carb':
        if (!(has('low-carb') || has('keto'))) return false;
        break;
      case 'paleo':
        if (!has('paleo')) return false;
        break;
      case 'low-sodium':
        if (!(has('low-sodium') ||
          recipe.healthGoals.some((g) => g.toLowerCase() === 'low-sodium')))
          return false;
        break;
      case 'halal':
        if (!has('halal')) return false;
        break;
      case 'kosher':
        if (!has('kosher')) return false;
        break;
      default:
        break; // unknown / 'none' — no constraint
    }
  }
  return true;
}

// STRICT allergen gate — recipe must contain none of the user's allergens.
function isAllergenSafe(recipe: InspiredRecipe, allergies: string[]): boolean {
  if (allergies.length === 0) return true;
  const recipeAllergens = new Set(recipe.allergens.map((a) => a.toLowerCase()));
  for (const a of allergies) {
    const mapped = ALLERGY_TO_LIBRARY[a] ?? [a];
    for (const m of mapped) {
      if (recipeAllergens.has(m.toLowerCase())) return false;
    }
  }
  return true;
}

// ── Taste sampler (onboarding "what I feel like eating") ─────────────────────
// A light, order-agnostic pick of Inspired recipes matching the user's diet +
// allergens + cuisines, mixing Breakfast and Lunch/Dinner only. Cuisine is a
// soft filter: if it leaves too few, we relax it (keeping diet + allergens hard)
// so the onboarding grid is never sparse.
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getTasteSampleRecipes(opts: {
  dietaryRestrictions?: string[] | null;
  allergies?: string[] | null;
  cuisinePreferences?: string[] | null;
  limit?: number;
}): InspiredRecipe[] {
  const diets = normList(opts.dietaryRestrictions);
  const allergies = normList(opts.allergies);
  const cuisines = normList(opts.cuisinePreferences).map((c) => c.toLowerCase());
  const limit = opts.limit ?? 12;

  const dietAllergenOk = (r: InspiredRecipe) =>
    satisfiesDietary(r, diets) && isAllergenSafe(r, allergies);

  const pools = (withCuisine: boolean) => {
    const ok = (r: InspiredRecipe, meal: string) =>
      r.mealType === meal &&
      dietAllergenOk(r) &&
      (!withCuisine || cuisines.length === 0 || cuisines.includes(r.cuisine.toLowerCase()));
    return {
      breakfast: shuffle(INSPIRED_RECIPES.filter((r) => ok(r, 'Breakfast'))),
      mains: shuffle(INSPIRED_RECIPES.filter((r) => ok(r, 'Lunch/Dinner'))),
    };
  };

  let { breakfast, mains } = pools(true);
  if (breakfast.length + mains.length < limit) {
    ({ breakfast, mains } = pools(false)); // relax cuisine to fill the grid
  }

  // Interleave breakfast / mains for a visible mix, backfilling from whichever
  // pool still has recipes when the other runs out.
  const out: InspiredRecipe[] = [];
  let bi = 0;
  let mi = 0;
  while (out.length < limit && (bi < breakfast.length || mi < mains.length)) {
    if (bi < breakfast.length) out.push(breakfast[bi++]);
    if (out.length < limit && mi < mains.length) out.push(mains[mi++]);
  }
  return out.slice(0, limit);
}

// ── Name-similarity (mirrors the engine's intent) ────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function namesTooSimilar(a: string, b: string, threshold: number): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = new Set(na.split(' '));
  const tb = new Set(nb.split(' '));
  let overlap = 0;
  ta.forEach((t) => {
    if (tb.has(t)) overlap++;
  });
  return overlap / Math.max(ta.size, tb.size) >= threshold;
}

// ── Conversion to the engine's GeneratedRecipeResponse ───────────────────────

function toGenerated(
  recipe: InspiredRecipe,
  isNoCook: boolean,
  targetServings: number,
  mealType: MealType,
): GeneratedRecipeResponse {
  const from = recipe.servings && recipe.servings > 0 ? recipe.servings : 1;
  const factor = targetServings > 0 && targetServings !== from ? targetServings / from : 1;

  const ingredients = recipe.ingredients.map((ing) => {
    const num = parseFloat(ing.quantity);
    const quantity =
      factor !== 1 && Number.isFinite(num)
        ? String(Math.round(num * factor * 100) / 100)
        : ing.quantity;
    return { name: ing.name, quantity, unit: ing.unit, category: ing.category };
  });

  // Split total time into prep/cook so the engine's no-cook predicate
  // (`cookTime === 0`) works for breakfasts.
  const total = recipe.totalMinutes || 0;
  const prepTime = isNoCook ? total : 0;
  const cookTime = isNoCook ? 0 : total;

  const tags = Array.from(
    new Set([
      recipe.cuisine,
      recipe.difficulty,
      ...recipe.dietary,
      ...recipe.healthGoals,
    ].filter(Boolean)),
  );

  return {
    name: recipe.name,
    description: `${recipe.cuisine} · ${recipe.difficulty} · ${recipe.cookingTime}`,
    cookTime,
    prepTime,
    servings: factor !== 1 ? targetServings : recipe.servings,
    // CRITICAL: the store places each recipe into its slot by `mealType`
    // (store.ts). Missing it makes the store round-robin by stream index —
    // dinners land in breakfast slots and slots collide/empty. Always stamp
    // the meal type the slot was requested for.
    mealType,
    ingredients,
    instructions: recipe.instructions,
    tags,
    calories: recipe.calories ?? 0,
    imageUrl: recipe.imageUrl,
  } as GeneratedRecipeResponse;
}

// ── Matcher factory ──────────────────────────────────────────────────────────

export interface InspiredMatcherContext {
  /** Names of recipes cooked in the prior 14 days — avoided for "Variety". */
  recentCookedNames?: string[];
  /** Favourite recipe names the user opted to allow even if recently cooked. */
  favouriteNames?: string[];
  // ── Learned behaviour signals (from behavior-insights.computeBehaviorSignals) ──
  /** Cuisines the user skipped/swapped/rated poorly — pushed to the back. */
  avoidCuisines?: string[];
  /** Dish names the user rejected (skipped/swapped/rated ≤2) — excluded. */
  avoidRecipeNames?: string[];
  /** Cuisines the user cooks most — rewarded in ranking. */
  boostCuisines?: string[];
  /** Their cooked meals skew quick — reward ≤30-min recipes. */
  preferQuick?: boolean;
}

export function createInspiredMatcher(
  preferences: UserPreferences,
  context: InspiredMatcherContext = {},
): CuratedMatcher {
  const diets = normList(preferences.dietaryRestrictions);
  const allergies = normList(preferences.allergies);
  const cuisines = normList(preferences.cuisinePreferences).filter(
    (c) => c.toLowerCase() !== 'any',
  );
  const anyCuisine =
    cuisines.length === 0 ||
    (preferences.cuisinePreferences ?? []).some((c) => c.toLowerCase() === 'any');
  const skill = preferences.cookingSkillLevel ?? 'intermediate';
  const timeBase = Number(preferences.weeknightMinutes) || 45;
  const timeCap = timeBase + 15;
  // Prep-time BAND for mains (total minutes): quick ≤30, moderate ≤60,
  // elaborate over 60. bandMax=null for elaborate (no upper limit); bandMin>0
  // only for elaborate (a genuinely over-an-hour dish).
  const bandMax = preferences.mealPrepTime === 'quick' ? 30
    : preferences.mealPrepTime === 'moderate' ? 60 : null;
  const bandMin = preferences.mealPrepTime === 'elaborate' ? 60 : 0;
  const priorities: Priority[] = preferences.priorities ?? [];
  const targetServings = preferences.servingSize || 0;
  // Recipes the user tapped in onboarding ("what I feel like eating"). These are
  // seeded first: when a tapped recipe still passes the hard gates (diet, allergen,
  // skill, time band) for a slot, it outranks everything else in that category.
  const tasteIds = new Set(preferences.tasteRecipeIds ?? []);

  const recentCooked = new Set(
    (context.recentCookedNames ?? []).map((n) => norm(n)),
  );
  const favourites = new Set((context.favouriteNames ?? []).map((n) => norm(n)));

  // Learned behaviour signals (lowercased for cuisine, normalised for names).
  const avoidCuisineSet = new Set(
    (context.avoidCuisines ?? []).map((c) => c.toLowerCase()),
  );
  const boostCuisineSet = new Set(
    (context.boostCuisines ?? []).map((c) => c.toLowerCase()),
  );
  const avoidNameSet = new Set(
    (context.avoidRecipeNames ?? []).map((n) => norm(n)),
  );
  const behaviourPreferQuick = !!context.preferQuick;

  const usedNames = new Set<string>(); // handed-out this plan

  // Skill hard-allowed difficulties + preferred tier.
  const skillAllowed: Record<string, Set<string>> = {
    beginner: new Set(['Easy']),
    intermediate: new Set(['Easy', 'Medium']),
    advanced: new Set(['Easy', 'Medium', 'Hard']),
  };
  const preferredTier: Record<string, number> = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
  };

  // Dietary/allergen-passing pool per category (computed once).
  const eligible: Record<PlanCategory, EnrichedRecord[]> = {
    breakfast: RECORDS.breakfast.filter(
      (r) => satisfiesDietary(r.recipe, diets) && isAllergenSafe(r.recipe, allergies),
    ),
    lunchdinner: RECORDS.lunchdinner.filter(
      (r) => satisfiesDietary(r.recipe, diets) && isAllergenSafe(r.recipe, allergies),
    ),
    snack: RECORDS.snack.filter(
      (r) => satisfiesDietary(r.recipe, diets) && isAllergenSafe(r.recipe, allergies),
    ),
  };

  // Diagnostic: how many onboarding taste picks reached this matcher and survived
  // the diet/allergen filter (i.e. are eligible to be seeded into the plan).
  if (tasteIds.size > 0) {
    const inPool = (cat: PlanCategory) =>
      eligible[cat].filter((r) => tasteIds.has(r.recipe.id)).length;
    console.log(
      `[BG-GEN] taste seed: ${tasteIds.size} tapped | eligible after diet/allergen — breakfast=${inPool('breakfast')} lunch/dinner=${inPool('lunchdinner')} snack=${inPool('snack')}`,
    );
  }

  function cuisineTier(recipe: InspiredRecipe): number {
    if (anyCuisine) return 0;
    if (cuisines.some((c) => c.toLowerCase() === recipe.cuisine.toLowerCase()))
      return 2; // exact
    for (const c of cuisines) {
      const adj = CUISINE_ADJACENCY[c] ?? [];
      if (adj.some((a) => a.toLowerCase() === recipe.cuisine.toLowerCase()))
        return 1; // similar
    }
    return 0; // any
  }

  // Score a candidate. Higher wins. Ordering encodes the cascade: cuisine >
  // skill > time dominate for mains, then "what matters most", then jitter.
  function score(rec: EnrichedRecord, isMain: boolean): number {
    const r = rec.recipe;
    let s = 0;

    // Seed: a recipe the user tapped in onboarding leads its category. The boost
    // dominates every other term (cuisine tops out at 200k) so tapped dishes are
    // placed first; hard eligibility (diet/allergen/skill/time) is already
    // enforced in take() before scoring, so this never breaks a constraint.
    if (tasteIds.has(r.id)) s += 1_000_000;

    if (isMain) {
      // 2. Cuisine
      s += cuisineTier(r) * 100_000;
      // 3. Cooking level — reward the preferred tier, within the allowed set.
      const rank = DIFFICULTY_RANK[r.difficulty] ?? 1;
      const pref = preferredTier[skill] ?? 2;
      // Closer to (and not exceeding) the preferred tier scores higher.
      s += (10 - Math.abs(pref - rank)) * 5_000;
      if (rank === pref) s += 3_000;
      // 4. Time
      if (r.totalMinutes <= timeBase) s += 4_000;
      else if (r.totalMinutes <= timeCap) s += 1_200;
    }

    // 5. What matters most (ordered; first priority weighs most).
    priorities.forEach((p, idx) => {
      const w = idx === 0 ? 2_500 : 1_200;
      switch (p) {
        case 'time':
          if (r.totalMinutes <= 30) s += w;
          break;
        case 'cost':
          if (r.costPerServe < 5) s += w + Math.max(0, 5 - r.costPerServe) * 50;
          break;
        case 'health': {
          const goals = r.healthGoals;
          if (goals.some((g) => PRIMARY_HEALTH_GOALS.has(g))) s += w;
          else if (goals.some((g) => SECONDARY_HEALTH_GOALS.has(g))) s += w / 2;
          break;
        }
        case 'variety':
          s += Math.random() * 800; // spread picks apart
          break;
      }
    });

    // 6. Learned behaviour — reward cuisines they cook, push down cuisines they
    // reject. Weighted below the explicit cuisine cascade so stated preferences
    // still lead, but above skill/time so taste meaningfully reorders ties.
    const cLower = r.cuisine.toLowerCase();
    if (boostCuisineSet.has(cLower)) s += 30_000;
    if (avoidCuisineSet.has(cLower)) s -= 40_000;
    if (behaviourPreferQuick && r.totalMinutes <= 30) s += 2_000;

    // Cheap cost tiebreak + small jitter so repeated plans aren't identical.
    s += Math.max(0, 8 - r.costPerServe) * 10;
    s += Math.random() * 200;
    return s;
  }

  function take(
    mealType: MealType,
    excludeNames: string[],
    opts?: CuratedTakeOptions,
  ): GeneratedRecipeResponse | null {
    const cat = planCategory(mealType);
    if (!cat) return null;
    const isMain = mealType === 'lunch' || mealType === 'dinner';
    const threshold = opts?.similarityThreshold ?? 0.6;
    const predicate = opts?.predicate;

    const exclude = new Set(excludeNames.map((n) => norm(n)));

    // Base pool: dietary/allergen-safe, unused, not excluded, not recently
    // cooked (unless favourite), passing the caller predicate.
    let pool = eligible[cat].filter((rec) => {
      const n = norm(rec.recipe.name);
      if (usedNames.has(rec.recipe.name)) return false;
      if (exclude.has(n)) return false;
      if (excludeNames.some((e) => namesTooSimilar(e, rec.recipe.name, threshold)))
        return false;
      if (recentCooked.has(n) && !favourites.has(n)) return false;
      // Behaviour: never re-suggest a dish the user rejected (unless favourited).
      if (avoidNameSet.has(n) && !favourites.has(n)) return false;
      if (predicate) {
        const g = toGenerated(rec.recipe, rec.isNoCook, targetServings, mealType);
        if (!predicate(g)) return false;
      }
      return true;
    });

    if (pool.length === 0) return null;

    // Mains: enforce the skill HARD gate (beginner never gets harder recipes).
    if (isMain) {
      const allowed = skillAllowed[skill] ?? skillAllowed.intermediate;
      const skillGated = pool.filter((r) => allowed.has(r.recipe.difficulty));
      if (skillGated.length > 0) pool = skillGated;
      // else: no allowed-difficulty recipe survived the other filters — return
      // null so the engine falls back to OpenAI rather than break the rule.
      else return null;

      // Prep-time band (mains):
      //  • elaborate → keep ONLY over-an-hour recipes; do NOT relax — if the
      //    library has none, return null so the engine generates a proper
      //    elaborate dish instead of mislabelling a quick one.
      //  • quick/moderate → prefer within the bucket max (+15 grace); relax only
      //    if nothing fits, so a slot is never left empty.
      if (bandMin > 0) {
        pool = pool.filter((r) => r.recipe.totalMinutes >= bandMin);
        if (pool.length === 0) return null;
      } else if (bandMax !== null) {
        const timed = pool.filter((r) => r.recipe.totalMinutes <= bandMax + 15);
        if (timed.length > 0) pool = timed;
      }
    }

    // Pick the highest-scoring candidate.
    let best: EnrichedRecord | null = null;
    let bestScore = -Infinity;
    for (const rec of pool) {
      const sc = score(rec, isMain);
      if (sc > bestScore) {
        bestScore = sc;
        best = rec;
      }
    }
    if (!best) return null;

    if (tasteIds.has(best.recipe.id)) {
      console.log(`[BG-GEN] taste seed → placed "${best.recipe.name}" in ${mealType}`);
    }
    usedNames.add(best.recipe.name);
    return toGenerated(best.recipe, best.isNoCook, targetServings, mealType);
  }

  function countFor(mealType: MealType): number {
    const cat = planCategory(mealType);
    if (!cat) return 0;
    return eligible[cat].filter((r) => !usedNames.has(r.recipe.name)).length;
  }

  // Guaranteed-fill fallback: only DIETARY + ALLERGEN safety is enforced (the
  // non-negotiables). Cuisine / skill / time / behaviour are all dropped so a
  // slot the OpenAI path couldn't fill still lands an INSTANT library recipe
  // rather than coming back empty. Prefers quicker, cheaper recipes. Returns
  // null only if the 667-library genuinely has no diet/allergen-safe recipe of
  // this meal type left.
  function takeRelaxed(
    mealType: MealType,
    excludeNames: string[],
    opts?: CuratedTakeOptions,
  ): GeneratedRecipeResponse | null {
    const cat = planCategory(mealType);
    if (!cat) return null;
    const threshold = opts?.similarityThreshold ?? 0.6;
    const predicate = opts?.predicate;
    const exclude = new Set(excludeNames.map((n) => norm(n)));

    const passesPredicate = (rec: EnrichedRecord) => {
      if (!predicate) return true;
      return predicate(toGenerated(rec.recipe, rec.isNoCook, targetServings, mealType));
    };

    // First choice: unused, not-in-plan, predicate-passing.
    let pool = eligible[cat].filter((rec) => {
      if (usedNames.has(rec.recipe.name)) return false;
      if (exclude.has(norm(rec.recipe.name))) return false;
      return passesPredicate(rec);
    });
    // Last resort: allow within-plan repeats (still diet/allergen-safe) so a
    // slot is filled rather than left empty.
    if (pool.length === 0) {
      pool = eligible[cat].filter(passesPredicate);
    }
    if (pool.length === 0) return null;

    const best = pool
      .slice()
      .sort(
        (a, b) =>
          // Tapped ("taste") recipes lead the fallback too, then quicker/cheaper.
          (tasteIds.has(b.recipe.id) ? 1 : 0) - (tasteIds.has(a.recipe.id) ? 1 : 0) ||
          a.recipe.totalMinutes - b.recipe.totalMinutes ||
          a.recipe.costPerServe - b.recipe.costPerServe,
      )[0];
    if (tasteIds.has(best.recipe.id)) {
      console.log(`[BG-GEN] taste seed (fallback) → placed "${best.recipe.name}" in ${mealType}`);
    }
    usedNames.add(best.recipe.name);
    return toGenerated(best.recipe, best.isNoCook, targetServings, mealType);
  }

  return {
    countFor,
    take,
    takeRelaxed,
    // Pescatarian fish-ratio balancing isn't tracked by the library source;
    // dietary strictness already guarantees pescatarian-safe picks.
    record: () => {},
    needsSignature: () => false,
  };
}
