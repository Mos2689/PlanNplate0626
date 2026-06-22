// ───────────────────────────────────────────────────────────────────────────
// CURATED-FIRST SOURCING
// ---------------------------------------------------------------------------
// Before the generator ever calls OpenAI, it asks here for a recipe from the
// "Get Inspired" curated bank (the 5 curated meal plans) that matches the
// user's hard preferences — allergies + dietary restrictions — and the meal
// type it needs. Only when nothing in the bank qualifies does it fall back to
// an OpenAI generation.
//
// A matcher is created once per plan generation: it flattens every curated
// recipe (deduped by name across all plans), pre-validates each against the
// user's preferences, buckets the survivors by meal type, and then hands them
// out one at a time via take() — never repeating a recipe and skipping any
// name already used / excluded in the current plan.
// ───────────────────────────────────────────────────────────────────────────
import {
  CURATED_MEAL_PLANS,
  getCuratedPlanRecipes,
  type CuratedRecipeEntry,
} from './curated-meal-plans';
import {
  validateRecipeAgainstPreferences,
  type GeneratedRecipeResponse,
  type MealType,
} from './openai';
import { validateIngredient } from './ingredient-validator';
import type { UserPreferences } from './store';

/** Every unique curated recipe across all plans, deduped by name slug. Memoized. */
let _flatPool: CuratedRecipeEntry[] | null = null;
function getFlatCuratedPool(): CuratedRecipeEntry[] {
  if (_flatPool) return _flatPool;
  const seen = new Set<string>();
  const out: CuratedRecipeEntry[] = [];
  for (const plan of CURATED_MEAL_PLANS) {
    for (const entry of getCuratedPlanRecipes(plan)) {
      // Dedupe globally by name slug so the same dish appearing in two plans
      // isn't offered twice.
      const dedupeKey = entry.key;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push(entry);
    }
  }
  _flatPool = out;
  return out;
}

/** Convert a curated entry into the engine's recipe shape (metric-sanitized). */
function curatedEntryToGenerated(entry: CuratedRecipeEntry): GeneratedRecipeResponse {
  const r = entry.recipe;
  const ingredients = r.ingredients.map((ing) => {
    const validated = validateIngredient(ing);
    return {
      name: ing.name,
      quantity: validated.quantity,
      unit: validated.unit,
      category: ing.category,
    };
  });
  return {
    name: r.name,
    description: r.description,
    cookTime: r.cookTime,
    prepTime: r.prepTime,
    servings: r.servings,
    mealType: entry.mealType,
    ingredients,
    instructions: r.instructions,
    tags: r.tags,
    calories: r.calories ?? 0,
    // Preserve the curated hero image so the meal card shows the real photo.
    imageUrl: r.imageUrl,
    blurhash: r.blurhash,
  };
}

/**
 * Scale a curated recipe to the user's serving size so it matches the AI
 * recipes in the same plan (which are generated at preferences.servingSize)
 * and the grocery list buys the right quantities. Ingredient quantities are
 * multiplied; non-numeric quantities ("to taste") and calories are left as-is.
 */
function scaleToServings(
  recipe: GeneratedRecipeResponse,
  targetServings: number,
): GeneratedRecipeResponse {
  const from = recipe.servings && recipe.servings > 0 ? recipe.servings : 1;
  if (!targetServings || targetServings <= 0 || targetServings === from) return recipe;
  const factor = targetServings / from;
  const ingredients = recipe.ingredients.map((ing) => {
    const q = parseFloat(ing.quantity);
    if (!isFinite(q)) return ing;
    const scaled = Math.round(q * factor * 100) / 100;
    return { ...ing, quantity: String(scaled) };
  });
  return { ...recipe, servings: targetServings, ingredients };
}

export interface CuratedTakeOptions {
  /** Extra constraint, e.g. breakfast no-cook (cookTime === 0) vs cooked. */
  predicate?: (recipe: GeneratedRecipeResponse) => boolean;
  /** Name-similarity guard against excludeNames (default mirrors the engine). */
  similarityThreshold?: number;
}

export interface CuratedMatcher {
  /** How many preference-passing curated recipes exist for a meal type. */
  countFor(mealType: MealType): number;
  /**
   * Hand out the next unused curated recipe for `mealType` that isn't in
   * `excludeNames` (or too similar to one) and satisfies any predicate.
   * Marks it used and returns a fresh copy, or null when none qualify.
   */
  take(
    mealType: MealType,
    excludeNames: string[],
    opts?: CuratedTakeOptions,
  ): GeneratedRecipeResponse | null;
  /**
   * Record a recipe the engine sourced ELSEWHERE (cache / OpenAI / safety net)
   * so the pescatarian fish-vs-veg composition stays accurate across the whole
   * plan, not just the curated picks. No-op for non-pescatarian plans and for
   * non-main (breakfast/snack) slots.
   */
  record(recipe: GeneratedRecipeResponse, mealType: MealType): void;
  /**
   * True when the NEXT lunch/dinner slot should be pushed toward fish/seafood
   * to keep a pescatarian plan above the >60% seafood target. The engine uses
   * this to add a fish instruction to an OpenAI fallback call.
   */
  needsSignature(mealType: MealType): boolean;
}

// Lightweight name-similarity check, mirroring the engine's intent without
// importing its private helper. Normalizes and compares token overlap.
function namesTooSimilar(a: string, b: string, threshold: number): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
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
  const ratio = overlap / Math.max(ta.size, tb.size);
  return ratio >= threshold;
}

// ── Profile-match helpers ───────────────────────────────────────────────────
// The user's full preference set decides BOTH which curated recipes qualify
// (hard gate) and which ones are picked first (ranking). Without this a
// pescatarian was being handed the all-vegetarian plan simply because it sits
// first in plan order — vegetarian passes the allergy/diet gate, so it "won".

const TIME_LIMITS: Record<UserPreferences['mealPrepTime'], number> = {
  quick: 30,
  moderate: 60,
  elaborate: Infinity,
};

const FISH_SEAFOOD = [
  'fish', 'salmon', 'tuna', 'cod', 'haddock', 'snapper', 'barramundi', 'trout',
  'mackerel', 'sardine', 'anchovy', 'prawn', 'prawns', 'shrimp', 'crab', 'lobster',
  'mussel', 'mussels', 'clam', 'clams', 'oyster', 'squid', 'calamari', 'scallop',
  'scallops', 'seafood',
];
function recipeText(r: GeneratedRecipeResponse): string {
  const ing = r.ingredients.map((i) => i.name).join(' ');
  const tags = (r.tags || []).join(' ');
  return `${r.name} ${r.description} ${ing} ${tags}`.toLowerCase();
}
function wordIn(text: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`, 'i').test(text);
}
function totalTime(r: GeneratedRecipeResponse): number {
  return (r.prepTime || 0) + (r.cookTime || 0);
}
/** A recipe whose protein is fish/seafood — the "signature" of a pescatarian plan. */
function isFishDish(r: GeneratedRecipeResponse): boolean {
  const text = recipeText(r);
  return FISH_SEAFOOD.some((f) => wordIn(text, f));
}

// Recipe complexity heuristic (step count + total time) for skill matching.
const SKILL_ORDER = ['beginner', 'intermediate', 'advanced'] as const;
function complexityOf(r: GeneratedRecipeResponse): (typeof SKILL_ORDER)[number] {
  const steps = (r.instructions || []).length;
  const tt = totalTime(r);
  if (steps <= 4 && tt <= 30) return 'beginner';
  if (steps >= 8 || tt >= 60) return 'advanced';
  return 'intermediate';
}

/**
 * Higher = better fit for the user's full profile (cuisine, diet affinity,
 * time, skill). Only used to rank recipes that already passed the hard gate.
 */
function profileScore(r: GeneratedRecipeResponse, preferences: UserPreferences): number {
  let score = 0;
  const text = recipeText(r);
  const tags = (r.tags || []).map((t) => t.toLowerCase());

  // Cuisine — strong signal toward the user's preferred cuisines.
  const cuisines = (preferences.cuisinePreferences || [])
    .map((c) => c.toLowerCase())
    .filter(Boolean);
  for (const c of cuisines) {
    if (tags.some((t) => t.includes(c)) || text.includes(c)) score += 5;
  }

  // Diet affinity — reward a recipe that positively reflects the user's diet
  // tag (e.g. "High Protein"). NOTE: the pescatarian fish/veg BALANCE is NOT a
  // score here — it's a plan-level composition quota in the matcher (>60%
  // seafood, remainder vegetarian), so we don't blanket-rank all fish first.
  const diets = (preferences.dietaryRestrictions || []).map((d) => d.toLowerCase());
  for (const d of diets) {
    if (d.includes('pescatarian') || d.includes('pescetarian')) continue;
    if (d && (tags.some((t) => t.includes(d)) || text.includes(d))) score += 3;
  }

  // Time — prefer faster within the user's budget (0–2 bonus).
  const limit = TIME_LIMITS[preferences.mealPrepTime] ?? Infinity;
  if (isFinite(limit) && limit > 0) {
    score += Math.max(0, (limit - totalTime(r)) / limit) * 2;
  }

  // Cooking skill — full credit for an exact complexity match, half for adjacent.
  const diff = Math.abs(
    SKILL_ORDER.indexOf(complexityOf(r)) - SKILL_ORDER.indexOf(preferences.cookingSkillLevel),
  );
  score += diff === 0 ? 2 : diff === 1 ? 1 : 0;

  return score;
}

/**
 * Build a curated matcher for one plan generation. Up front it (1) HARD-GATES
 * the whole bank on the user's allergies, dietary restrictions and prep-time
 * budget, then (2) RANKS the survivors per meal type by full-profile fit
 * (cuisine, diet affinity, time, skill) so the best match is handed out first.
 */
export function createCuratedMatcher(preferences: UserPreferences): CuratedMatcher {
  const byMealType: Record<MealType, GeneratedRecipeResponse[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };

  const targetServings = preferences.servingSize || 1;

  const scored: Record<MealType, { recipe: GeneratedRecipeResponse; score: number }[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };

  for (const entry of getFlatCuratedPool()) {
    // Scale to the user's serving size FIRST. The shared validator also checks
    // serving size (#3b) and prep time (#3c), so validating the unscaled recipe
    // would wrongly reject a serves-2 curated dish for a serves-4 user. After
    // scaling, recipe.servings === preferences.servingSize and #3b passes.
    const generated = scaleToServings(curatedEntryToGenerated(entry), targetServings);

    // ── HARD GATE ──
    // The shared validator now enforces the user's full hard-constraint set:
    // allergies, dietary restrictions (incl. the pescatarian branch added in
    // openai.ts), serving size and the prep-time budget. Anything failing it is
    // never offered — the engine falls back to OpenAI for that slot.
    if (!validateRecipeAgainstPreferences(generated, preferences, false, false).isValid) continue;

    // ── RANK ── by full-profile fit (cuisine, diet affinity, time, skill).
    scored[entry.mealType].push({
      recipe: generated,
      score: profileScore(generated, preferences),
    });
  }

  // Best-fit first; ties keep first-seen (plan) order as a stable tiebreak.
  (Object.keys(scored) as MealType[]).forEach((mt) => {
    byMealType[mt] = scored[mt]
      .map((x, i) => ({ ...x, i }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map((x) => x.recipe);
  });

  const usedNames = new Set<string>();

  // ── Pescatarian composition quota ──
  // Across lunch + dinner over the whole plan, aim for a seafood MAJORITY
  // while still allowing vegetarian variety. SIG_TARGET (0.7) sits safely
  // above the >60% floor. Meat is already excluded by the validator, so
  // "non-fish" here always means vegetarian.
  const isPescatarian = (preferences.dietaryRestrictions || []).some(
    (d) => d.toLowerCase().includes('pescatarian') || d.toLowerCase().includes('pescetarian'),
  );
  const SIG_TARGET = 0.7;
  let sigCount = 0; // fish/seafood lunch+dinner recipes placed (any source)
  let mainCount = 0; // total lunch+dinner recipes placed (any source)
  const isMainMeal = (mt: MealType) => mt === 'lunch' || mt === 'dinner';
  // Want a fish dish next when the running seafood ratio is below target.
  const wantFishNext = () => sigCount / Math.max(mainCount, 1) < SIG_TARGET;

  return {
    countFor(mealType) {
      return byMealType[mealType]?.length ?? 0;
    },
    needsSignature(mealType) {
      return isPescatarian && isMainMeal(mealType) && wantFishNext();
    },
    record(recipe, mealType) {
      if (!isPescatarian || !isMainMeal(mealType)) return;
      mainCount++;
      if (isFishDish(recipe)) sigCount++;
    },
    take(mealType, excludeNames, opts) {
      const candidates = byMealType[mealType];
      if (!candidates || candidates.length === 0) return null;
      const threshold = opts?.similarityThreshold ?? 0.6;
      const excludeLower = excludeNames.map((n) => n.toLowerCase());

      const eligible = (candidate: GeneratedRecipeResponse): boolean => {
        if (usedNames.has(candidate.name.toLowerCase())) return false;
        if (excludeLower.includes(candidate.name.toLowerCase())) return false;
        if (excludeNames.some((n) => namesTooSimilar(candidate.name, n, threshold))) return false;
        if (opts?.predicate && !opts.predicate(candidate)) return false;
        return true;
      };

      let chosen: GeneratedRecipeResponse | undefined;
      if (isPescatarian && isMainMeal(mealType)) {
        const ranked = candidates.filter(eligible);
        if (ranked.length === 0) return null;
        if (wantFishNext()) {
          // Short of the seafood target — take a fish dish, or return null so
          // the engine OpenAI-generates a fish dish (don't burn the slot on veg
          // when we can't otherwise recover the ratio).
          chosen = ranked.find(isFishDish);
        } else {
          // Target satisfied — prefer vegetarian variety, else any remaining.
          chosen = ranked.find((c) => !isFishDish(c)) ?? ranked[0];
        }
      } else {
        chosen = candidates.find(eligible);
      }
      if (!chosen) return null;

      usedNames.add(chosen.name.toLowerCase());
      if (isPescatarian && isMainMeal(mealType)) {
        mainCount++;
        if (isFishDish(chosen)) sigCount++;
      }
      // Hand out a deep-ish copy so the caller can set mealType/mutate
      // without touching the shared pool entry.
      return {
        ...chosen,
        mealType,
        ingredients: chosen.ingredients.map((ing) => ({ ...ing })),
        instructions: [...chosen.instructions],
        tags: [...chosen.tags],
      };
    },
  };
}
