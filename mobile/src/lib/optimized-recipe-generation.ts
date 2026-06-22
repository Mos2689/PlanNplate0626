import { generateRecipe, regenerateSingleRecipe, parseFridgeIngredientsWithQuantity, extractProteinsFromRecipe, type GenerateRecipeParams, type GeneratedRecipeResponse, type MealType } from './openai';
import { getCachedRecipes, cacheRecipe, generatePreferencesHash } from './recipe-cache';
import { createCuratedMatcher, type CuratedMatcher } from './curated-recipe-source';
import type { UserPreferences } from './store';

interface BatchGenerationOptions {
  mealTypes: MealType[];
  preferences: UserPreferences;
  recipesToGenerate: number;
  useCache?: boolean;
  optimizeGrocery?: boolean;
  allowRepeats?: boolean;
  /**
   * When true AND both lunch+dinner are selected, dinner from day N is
   * repeated as lunch on day N+1 (leftovers pattern). When false, lunch
   * and dinner are always distinct recipes — even if `allowRepeats` is
   * true (within-meal-type repeats still apply for lunch-only / dinner-
   * only plans). Defaults to false (conservative, matches user intent
   * unless they explicitly picked the "Leftovers" lunch habit).
   */
  crossMealRepeats?: boolean;
  additionalInstructions?: string;
  customCookingInstructions?: string;
  /**
   * Plan length in days. Drives the duration-based repetition policy
   * (lunch/dinner): < 7 days → all unique; ≥ 7 days → repeats allowed
   * (still capped at 2 per recipe). Also used by the breakfast pass to map
   * each breakfast slot to a calendar day. When omitted it is inferred from
   * recipesToGenerate / mealTypes.length for legacy callers.
   */
  numberOfDays?: number;
  /**
   * Anchor date of the plan window as 'YYYY-MM-DD' (or any Date-parseable
   * string). The breakfast pass uses it to tell weekdays (no-cook) from
   * weekends (cooked). Defaults to today when omitted.
   */
  startDate?: string;
}

interface GenerationProgress {
  total: number;
  completed: number;
  cached: number;
  generated: number;
  failed: number;
  estimatedTimeRemaining?: number;
}

/**
 * Calculate max allowed repeats based on lunch/dinner meal count
 * Rule: Each unique recipe appears exactly 2 times (original + 1 repeat)
 * Formula: floor(repeatableMealCount / 2) repeats → ceil(repeatableMealCount / 2) unique recipes
 *
 * Examples (lunch+dinner selected):
 * - 7 days = 14 meals → 7 repeats → 7 unique dinners + 7 repeated as lunch
 * - 3 days = 6 meals → 3 repeats → 3 unique
 * - 1 week lunch only = 7 meals → 3 repeats → 4 unique
 */
function calculateMaxRepeats(mealTypes: MealType[], totalRecipes: number): number {
  const repeatableMealTypes = mealTypes.filter(mt => mt === 'lunch' || mt === 'dinner');
  if (repeatableMealTypes.length === 0) return 0;

  // Calculate repeatable meal count
  const slotsPerDay = totalRecipes / mealTypes.length;
  const repeatableMealCount = Math.round(slotsPerDay * repeatableMealTypes.length);

  if (repeatableMealCount < 3) return 0;
  // Each recipe appears max 2 times: floor(N/2) repeats gives ceil(N/2) unique recipes
  return Math.floor(repeatableMealCount / 2);
}

/**
 * Extract cooking format from recipe name/description/tags
 * (e.g., "stir-fry", "curry", "soup", "salad", "roast")
 */
function extractCookingFormat(recipe: GeneratedRecipeResponse): string | null {
  const formats = [
    'stir-fry', 'stir fry', 'curry', 'soup', 'stew', 'salad', 'bowl', 'wrap',
    'sandwich', 'pasta', 'noodles', 'rice bowl', 'casserole', 'gratin',
    'roast', 'bake', 'grill', 'skillet', 'sheet pan', 'one-pot',
    'tacos', 'burrito', 'quesadilla', 'pizza', 'flatbread',
    'risotto', 'pilaf', 'fried rice', 'noodle soup', 'chili',
  ];
  const text = `${recipe.name} ${recipe.description} ${(recipe.tags || []).join(' ')}`.toLowerCase();
  return formats.find(f => text.includes(f)) || null;
}

/**
 * Extract cooking technique from recipe instructions
 * (e.g., "pan-fry", "oven-roast", "simmer", "grill")
 */
function extractCookingTechnique(recipe: GeneratedRecipeResponse): string | null {
  const techniques = [
    'pan-fry', 'deep-fry', 'sauté', 'saute', 'oven-roast', 'roast', 'bake',
    'grill', 'broil', 'simmer', 'braise', 'steam', 'boil', 'poach',
    'stir-fry', 'sear', 'smoke', 'slow-cook', 'pressure-cook', 'air-fry',
  ];
  const text = (recipe.instructions || []).join(' ').toLowerCase();
  return techniques.find(t => text.includes(t)) || null;
}

/**
 * Check if two recipe names are too similar (share >60% of significant words)
 */
function areRecipeNamesTooSimilar(name1: string, name2: string, threshold = 0.6): boolean {
  const stopWords = new Set(['with', 'and', 'the', 'a', 'an', 'in', 'on', 'of', 'for', 'to']);
  const getWords = (name: string) =>
    name.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

  const words1 = getWords(name1);
  const words2 = getWords(name2);
  if (words1.length === 0 || words2.length === 0) return false;

  const commonWords = words1.filter(w => words2.includes(w));
  const similarity = commonWords.length / Math.max(words1.length, words2.length);
  return similarity > threshold;
}

// Streaming-aware callbacks for `generateRecipesOptimized`. The function
// historically accepted a single `onProgress` callback as its 2nd arg;
// for backward compatibility we still accept that shape, but the new
// preferred shape is an object exposing BOTH `onProgress` (aggregate
// counts) AND `onRecipeReady` (per-recipe yield) so the caller can
// stream recipes into the UI as they become available rather than
// waiting for the whole batch to resolve.
export interface GenerationCallbacks {
  onProgress?: (progress: GenerationProgress) => void;
  /**
   * Fires once per recipe the moment it lands in the result set —
   * whether from cache, fresh LLM generation, or the repeat-logic pass.
   * Use this to push recipes into the store one-by-one for streaming UI.
   */
  onRecipeReady?: (recipe: GeneratedRecipeResponse, index: number) => void;
}

/**
 * Optimized batch recipe generation with parallel processing and caching
 * This replaces the client-side sequential generation with:
 * 1. Cache checking to reuse previously generated recipes
 * 2. Parallel batch processing (when allowRepeats=true) or sequential (when allowRepeats=false)
 * 3. Automatic caching of new recipes for future reuse
 * 4. REPEAT LOGIC: When allowRepeats=true, generates fewer unique recipes and repeats dinner as next-day lunch
 * 5. STREAMING: pass `{ onRecipeReady }` to receive each recipe as it
 *    completes rather than waiting for the whole batch
 */
export async function generateRecipesOptimized(
  options: BatchGenerationOptions,
  progressOrCallbacks?:
    | ((progress: GenerationProgress) => void)
    | GenerationCallbacks
): Promise<GeneratedRecipeResponse[]> {
  // Backward-compat shim: if the caller passed a bare function, treat it
  // as the legacy `onProgress` callback. New callers should pass an
  // object `{ onProgress, onRecipeReady }`.
  const callbacks: GenerationCallbacks =
    typeof progressOrCallbacks === 'function'
      ? { onProgress: progressOrCallbacks }
      : progressOrCallbacks ?? {};
  const onProgress = callbacks.onProgress;
  const onRecipeReady = callbacks.onRecipeReady;
  const {
    mealTypes: requestedMealTypes,
    preferences,
    recipesToGenerate: requestedTotal,
    useCache = true,
    optimizeGrocery = false,
    allowRepeats: requestedAllowRepeats = true,
    crossMealRepeats = false,
    additionalInstructions,
    customCookingInstructions,
    numberOfDays,
    startDate,
  } = options;

  // Plan length in days — supplied by the caller, or inferred from the
  // recipe/meal-type ratio for legacy callers.
  const planDays =
    numberOfDays ??
    Math.max(1, Math.round(requestedTotal / Math.max(requestedMealTypes.length, 1)));

  // ── Item 1: duration-based repeat policy (lunch/dinner) ──
  // ≤ 7 days → every lunch/dinner recipe is unique (force repeats off).
  // > 7 days → repeats permitted, still capped at 2 per recipe (the cap is
  //            enforced by calculateMaxRepeats + the usedForRepeat set).
  const allowRepeats = requestedAllowRepeats && planDays > 7;
  if (requestedAllowRepeats && !allowRepeats) {
    console.log(
      `[OptimizedGeneration] Plan is ${planDays} day(s) (≤ 7) — forcing all lunch/dinner recipes unique.`
    );
  }

  // ── Item 2: breakfast is produced by a dedicated pass (no-cook weekday /
  // cooked weekend, plus the < 5-day "2 variations" cap), so the core
  // lunch/dinner/snack pipeline below operates on the NON-breakfast subset.
  const hasBreakfast = requestedMealTypes.includes('breakfast');
  const breakfastSlots = hasBreakfast ? planDays : 0;
  const mealTypes: MealType[] = requestedMealTypes.filter((mt) => mt !== 'breakfast');
  const recipesToGenerate = requestedTotal - breakfastSlots;

  // Cache key uses the FULL requested meal-type set so lunch/dinner cache
  // hits stay identical to the pre-breakfast-split behaviour.
  const preferencesHash = generatePreferencesHash(preferences, requestedMealTypes);
  const results: GeneratedRecipeResponse[] = [];
  let cachedCount = 0;
  let generatedCount = 0;
  let failedCount = 0;
  // Monotonically increasing index passed to onRecipeReady — bumped once
  // per recipe regardless of which branch (cache / generated / repeated /
  // safety-net) produced it. The caller can ignore it or use it to drive
  // a "filling slot N of M" UI label.
  let streamIndex = 0;

  // Track generated recipe names to prevent duplicates when allowRepeats is OFF
  const usedRecipeNames: string[] = [];

  // Track diversity across all generated recipes
  const usedProteins: string[] = [];
  const usedFormats: string[] = [];
  const usedTechniques: string[] = [];

  // Item 3: curated-first sourcing. Pre-validate the "Get Inspired" bank
  // against the user's allergies + dietary restrictions once; every slot below
  // tries this before falling back to an OpenAI call. `curatedCount` is folded
  // into `generatedCount` for progress, and tracked separately just for logs.
  const curatedMatcher: CuratedMatcher = createCuratedMatcher(preferences);
  let curatedCount = 0;
  console.log(
    `[OptimizedGeneration] Curated bank available: breakfast=${curatedMatcher.countFor('breakfast')}, lunch=${curatedMatcher.countFor('lunch')}, dinner=${curatedMatcher.countFor('dinner')}, snack=${curatedMatcher.countFor('snack')} (after preference filter)`
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // BREAKFAST PASS (Item 2)
  // ─────────────────────────────────────────────────────────────────────────────
  // Breakfast follows its own rules, independent of the lunch/dinner repeat
  // machinery:
  //   • WEEKDAY (Mon–Fri) breakfasts are NO-COOK (overnight oats, parfait,
  //     smoothie, …); WEEKEND (Sat/Sun) breakfasts are COOKED (pancakes,
  //     omelette, hash, …). Day-of-week comes from `startDate`.
  //   • Windows < 5 days use at most 2 unique breakfasts, rotated across the
  //     days; ≥ 5 days gets one unique breakfast per day.
  // Each breakfast is pushed into `results` and streamed via onRecipeReady in
  // day order, so the store assigns breakfast #i → breakfast day #i.
  if (breakfastSlots > 0) {
    // Parse the anchor date as a LOCAL calendar date so day-of-week is
    // timezone-stable (avoid UTC-midnight rolling back a day).
    const parseLocalDate = (s?: string): Date => {
      if (s) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d;
      }
      return new Date();
    };
    const anchor = parseLocalDate(startDate);
    anchor.setHours(0, 0, 0, 0);

    const styleForDay = (dayIndex: number): 'no-cook' | 'cooked' => {
      const d = new Date(anchor);
      d.setDate(d.getDate() + dayIndex);
      const dow = d.getDay(); // 0 = Sunday … 6 = Saturday
      return dow === 0 || dow === 6 ? 'cooked' : 'no-cook';
    };

    const styleByDay: ('no-cook' | 'cooked')[] = [];
    for (let d = 0; d < breakfastSlots; d++) styleByDay.push(styleForDay(d));

    // Variation cap by window length (each variation still respects its
    // weekday/weekend style):
    //   < 5 days → 2     5–9 days → 4     10–14 days → 5
    const variationCap = planDays < 5 ? 2 : planDays < 10 ? 4 : 5;
    const noCookDays = styleByDay.filter((s) => s === 'no-cook').length;
    const cookedDays = styleByDay.filter((s) => s === 'cooked').length;
    const target = Math.min(variationCap, breakfastSlots);

    // Split the variation budget across the two styles, proportional to how
    // many days each covers — with ≥ 1 per style that appears, and never more
    // variations of a style than it has days in the window.
    const uniqueByStyle: Record<'no-cook' | 'cooked', number> = { 'no-cook': 0, cooked: 0 };
    if (noCookDays > 0) uniqueByStyle['no-cook'] = 1;
    if (cookedDays > 0) uniqueByStyle['cooked'] = 1;
    let remaining = target - (uniqueByStyle['no-cook'] + uniqueByStyle['cooked']);
    while (remaining > 0) {
      const canNoCook = uniqueByStyle['no-cook'] < noCookDays;
      const canCooked = uniqueByStyle['cooked'] < cookedDays;
      if (!canNoCook && !canCooked) break;
      // Top up whichever style is currently the least "filled" relative to its
      // day count, so the rotation spreads evenly.
      const noCookFill = canNoCook ? uniqueByStyle['no-cook'] / noCookDays : Infinity;
      const cookedFill = canCooked ? uniqueByStyle['cooked'] / cookedDays : Infinity;
      if (canNoCook && (noCookFill <= cookedFill || !canCooked)) uniqueByStyle['no-cook']++;
      else uniqueByStyle['cooked']++;
      remaining--;
    }

    const poolStyles: ('no-cook' | 'cooked')[] = [
      ...(Array(uniqueByStyle['no-cook']).fill('no-cook') as 'no-cook'[]),
      ...(Array(uniqueByStyle['cooked']).fill('cooked') as 'cooked'[]),
    ];

    console.log(
      `[OptimizedGeneration] Breakfast pass: ${breakfastSlots} slot(s), ${poolStyles.length} unique [${poolStyles.join(', ')}], style/day=[${styleByDay.join(', ')}]`
    );

    // Generate the unique pool (tagged with the style it was generated for).
    const pool: { recipe: GeneratedRecipeResponse; style: 'no-cook' | 'cooked' }[] = [];
    for (let p = 0; p < poolStyles.length; p++) {
      const style = poolStyles[p];
      const excludeNames = [...usedRecipeNames];
      const threshold = optimizeGrocery ? 0.8 : 0.6;
      let made: GeneratedRecipeResponse | null = null;

      // Curated-first: a breakfast from the Get Inspired bank matching the
      // required style (no-cook = no applied heat → cookTime 0; cooked → > 0).
      const curated = curatedMatcher.take('breakfast', usedRecipeNames, {
        predicate: (r) => (style === 'no-cook' ? r.cookTime === 0 : r.cookTime > 0),
        similarityThreshold: threshold,
      });
      let madeFromCurated = false;
      if (curated) {
        made = curated;
        madeFromCurated = true;
        curatedCount++;
        console.log(`[OptimizedGeneration] Breakfast from Get Inspired bank (${style}): "${curated.name}"`);
      }

      // Fall back to OpenAI only when nothing in the bank qualified.
      for (let attempt = 0; !made && attempt < 5; attempt++) {
        try {
          const recipe = await regenerateSingleRecipe(
            {
              mealTypes: ['breakfast'],
              preferences,
              recipesToGenerate: Math.max(poolStyles.length, 1),
              optimizeGrocery,
              allowRepeats: false,
              breakfastStyle: style,
              customCookingInstructions,
            },
            excludeNames
          );
          if (usedRecipeNames.some((n) => areRecipeNamesTooSimilar(recipe.name, n, threshold))) {
            excludeNames.push(recipe.name);
            continue;
          }
          made = recipe;
          break;
        } catch (error: any) {
          console.error(
            `[OptimizedGeneration] Breakfast generation failed (attempt ${attempt + 1}): ${error?.message}`
          );
        }
      }
      if (made) {
        made.mealType = 'breakfast';
        usedRecipeNames.push(made.name);
        pool.push({ recipe: made, style });
        // Don't pollute the AI recipe cache with curated picks.
        if (useCache && !madeFromCurated) await cacheRecipe(preferencesHash, 'breakfast', made);
        console.log(`[OptimizedGeneration] Breakfast pool +1 (${style}): "${made.name}"`);
      } else {
        failedCount++;
        console.error(`[OptimizedGeneration] Failed to generate a ${style} breakfast after 5 attempts`);
      }
    }

    // Assign pool recipes to days (round-robin within matching style) and
    // stream them in day order so each lands on its calendar day.
    if (pool.length > 0) {
      const rotation: Record<'no-cook' | 'cooked', number> = { 'no-cook': 0, cooked: 0 };
      for (let d = 0; d < breakfastSlots; d++) {
        const style = styleByDay[d];
        let candidates = pool.filter((p) => p.style === style);
        if (candidates.length === 0) candidates = pool; // graceful fallback
        const pick = candidates[rotation[style] % candidates.length].recipe;
        rotation[style]++;
        const dayRecipe: GeneratedRecipeResponse = { ...pick, mealType: 'breakfast' };
        results.push(dayRecipe);
        generatedCount++;
        onRecipeReady?.(dayRecipe, streamIndex++);
      }
      onProgress?.({
        total: requestedTotal,
        completed: cachedCount + generatedCount + failedCount,
        cached: cachedCount,
        generated: generatedCount,
        failed: failedCount,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FRIDGE INGREDIENTS PARSING AND DISTRIBUTION
  // ═══════════════════════════════════════════════════════════════════════════════
  // Parse user's fridge ingredients and create an assignment queue to distribute them
  const fridgeIngredientQueue: string[] = [];

  if (additionalInstructions) {
    const servingSize = preferences.servingSize || 1;
    const fridgeIngredientsWithQty = parseFridgeIngredientsWithQuantity(additionalInstructions, servingSize);

    if (fridgeIngredientsWithQty.length > 0) {
      console.log(`[OptimizedGeneration] User has ${fridgeIngredientsWithQty.length} fridge ingredients:`);
      fridgeIngredientsWithQty.forEach(ing => {
        console.log(`  - ${ing.name}: quantity=${ing.quantity}, maxRecipes=${ing.maxRecipes}`);
      });

      // QUANTITY-AWARE DISTRIBUTION:
      // Respects each ingredient's maxRecipes based on quantity AND serving size
      // Example: 2 barramundi fillets + serving size 4 = 1 recipe (2/4 = 0.5, round up to 1)
      // Example: 8 chicken breasts + serving size 2 = 4 recipes (8/2 = 4)

      // Build a pool of ingredient assignments respecting max recipes
      const ingredientPool: string[] = [];
      for (const ing of fridgeIngredientsWithQty) {
        // Add this ingredient to the pool up to its maxRecipes limit
        for (let i = 0; i < ing.maxRecipes; i++) {
          ingredientPool.push(ing.name);
        }
      }

      console.log(`[OptimizedGeneration] Ingredient pool (respecting quantities): ${ingredientPool.join(', ')}`);
      console.log(`[OptimizedGeneration] Total assignments available: ${ingredientPool.length} for ${recipesToGenerate} recipes`);

      // Shuffle the pool first to add variety
      for (let i = ingredientPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ingredientPool[i], ingredientPool[j]] = [ingredientPool[j], ingredientPool[i]];
      }

      if (ingredientPool.length >= recipesToGenerate) {
        // We have enough - just take what we need
        fridgeIngredientQueue.push(...ingredientPool.slice(0, recipesToGenerate));
      } else {
        // Not enough assignments to cover all recipes - use what we have
        // The remaining recipes will be generated without a specific fridge ingredient (freestyle)
        fridgeIngredientQueue.push(...ingredientPool);

        // Fill remaining slots with empty string (freestyle recipes)
        const remaining = recipesToGenerate - ingredientPool.length;
        console.log(`[OptimizedGeneration] ${remaining} recipes will be FREESTYLE (no specific fridge ingredient)`);
        for (let i = 0; i < remaining; i++) {
          fridgeIngredientQueue.push(''); // Empty = no specific ingredient required
        }
      }

      console.log(`[OptimizedGeneration] Final fridge ingredient assignment queue: ${fridgeIngredientQueue.map(i => i || 'FREESTYLE').join(', ')}`);
    }
  }

  // Calculate how many of each meal type we need
  const hasLunch = mealTypes.includes('lunch');
  const hasDinner = mealTypes.includes('dinner');
  const hasLunchAndDinner = hasLunch && hasDinner;

  // The lunch+dinner LEFTOVERS pattern is only used when the user
  // explicitly opted in via mealHabits.lunch === 'leftovers'. Outside
  // of that, lunch and dinner are always distinct recipes.
  const useLeftoversPattern = !!crossMealRepeats && allowRepeats && hasLunchAndDinner;

  // Calculate how many unique recipes to generate
  // When allowRepeats is ON: generate ceil(N/2) unique recipes, repeat each once to fill N total
  // Rule: no recipe appears more than twice
  let maxAllowedRepeats = allowRepeats ? calculateMaxRepeats(mealTypes, recipesToGenerate) : 0;

  // Calculate target counts per meal type
  let uniqueBreakfastCount = 0;
  let uniqueLunchCount = 0;
  let uniqueDinnerCount = 0;
  let uniqueSnackCount = 0;

  if (useLeftoversPattern) {
    // LEFTOVERS PATTERN — dinner D_n → next day's lunch (day n+1).
    // For N days × (lunch+dinner):
    //   • N unique dinners (one per day)
    //   • 1 unique lunch (day 0 — has no prior dinner to leftover-from)
    //   • N - 1 lunch repeats (days 1..N-1, sourced from dinners D_0..D_{N-2})
    // Total: (N + 1) unique + (N - 1) repeats = 2N meals ✓
    const lunchDinnerCount = Math.round((recipesToGenerate / mealTypes.length) * 2);
    const N = Math.max(1, Math.floor(lunchDinnerCount / 2));
    uniqueDinnerCount = N;
    uniqueLunchCount = 1;
    maxAllowedRepeats = Math.max(0, N - 1);

    // Handle other meal types normally
    const otherMealTypes = mealTypes.filter(mt => mt !== 'lunch' && mt !== 'dinner');
    const otherMealsTotal = recipesToGenerate - lunchDinnerCount;
    if (otherMealTypes.length > 0 && otherMealsTotal > 0) {
      const perOther = Math.floor(otherMealsTotal / otherMealTypes.length);
      uniqueBreakfastCount = otherMealTypes.includes('breakfast') ? perOther : 0;
      uniqueSnackCount = otherMealTypes.includes('snack') ? perOther : 0;
    }
  } else {
    // Normal distribution: split uniqueRecipesToGenerate across all meal types.
    // When allowRepeats is true but crossMealRepeats is false, repeats still
    // apply WITHIN a meal type (e.g. lunch-only plans), so maxAllowedRepeats
    // stays as calculated by calculateMaxRepeats.
    const uniqueRecipesToGenerate = recipesToGenerate - maxAllowedRepeats;
    const uniquePerType: Record<string, number> = {};
    const uniqueMealsPerType = Math.floor(uniqueRecipesToGenerate / mealTypes.length);
    const uniqueRemainder = uniqueRecipesToGenerate % mealTypes.length;
    mealTypes.forEach((mt, idx) => {
      uniquePerType[mt] = uniqueMealsPerType + (idx < uniqueRemainder ? 1 : 0);
    });

    uniqueBreakfastCount = uniquePerType['breakfast'] || 0;
    uniqueLunchCount = uniquePerType['lunch'] || 0;
    uniqueDinnerCount = uniquePerType['dinner'] || 0;
    uniqueSnackCount = uniquePerType['snack'] || 0;
  }

  // Total unique recipes we'll generate (computed AFTER per-type counts so
  // the leftovers branch can override).
  const uniqueRecipesToGenerate =
    uniqueBreakfastCount + uniqueLunchCount + uniqueDinnerCount + uniqueSnackCount;

  // Build the ordered meal type sequence for generation
  const mealTypeSequence: MealType[] = [];

  // Add breakfasts first (not affected by repeats)
  for (let i = 0; i < uniqueBreakfastCount; i++) {
    mealTypeSequence.push('breakfast');
  }

  // Add lunches (reduced count if repeats will fill them)
  for (let i = 0; i < uniqueLunchCount; i++) {
    mealTypeSequence.push('lunch');
  }

  // Add dinners (these will be repeated as next-day lunch)
  for (let i = 0; i < uniqueDinnerCount; i++) {
    mealTypeSequence.push('dinner');
  }

  // Add snacks (not affected by repeats)
  for (let i = 0; i < uniqueSnackCount; i++) {
    mealTypeSequence.push('snack');
  }

  console.log(
    `[OptimizedGeneration] Starting batch generation: ${recipesToGenerate} total recipes, ${uniqueRecipesToGenerate} unique, cache=${useCache}, allowRepeats=${allowRepeats}, maxRepeats=${maxAllowedRepeats}, optimizeGrocery=${optimizeGrocery}`
  );
  const repeatTargetType = hasLunchAndDinner ? 'lunches' : (hasDinner ? 'dinners' : 'lunches');
  console.log(
    `[OptimizedGeneration] Target counts: breakfast=${uniqueBreakfastCount}, lunch=${uniqueLunchCount}, dinner=${uniqueDinnerCount}, snack=${uniqueSnackCount}. Repeats will add ${maxAllowedRepeats} more ${repeatTargetType}.`
  );

  // Step 1: Try to get recipes from cache (only if allowRepeats is true, otherwise we want fresh unique recipes)
  // IMPORTANT: Respect the target counts per meal type to avoid imbalanced results
  const cachedCountPerType: Record<string, number> = {};
  const targetPerType: Record<string, number> = {
    breakfast: uniqueBreakfastCount,
    lunch: uniqueLunchCount,
    dinner: uniqueDinnerCount,
    snack: uniqueSnackCount,
  };

  if (useCache && allowRepeats) {
    for (const mealType of mealTypes) {
      const targetForType = targetPerType[mealType] || 0;
      if (targetForType <= 0) continue;

      const cached = await getCachedRecipes(preferencesHash, mealType, targetForType);
      // Only take up to the target count for this meal type
      const toTake = Math.min(cached.length, targetForType);
      const takenRecipes = cached.slice(0, toTake);

      results.push(...takenRecipes);
      cachedCount += takenRecipes.length;
      cachedCountPerType[mealType] = takenRecipes.length;
      takenRecipes.forEach(r => usedRecipeNames.push(r.name));
      // Count cached picks toward the pescatarian composition target too.
      takenRecipes.forEach(r => curatedMatcher.record(r, mealType));
      // Stream each cached recipe to the caller so the UI can render
      // it before any LLM call even fires.
      if (onRecipeReady) {
        takenRecipes.forEach((r) => {
          onRecipeReady(r, streamIndex++);
        });
      }

      if (results.length >= uniqueRecipesToGenerate) {
        break;
      }
    }

    if (cachedCount > 0) {
      console.log(`[OptimizedGeneration] Retrieved ${cachedCount} recipes from cache: ${Object.entries(cachedCountPerType).map(([mt, c]) => `${mt}=${c}`).join(', ')}`);
      onProgress?.({
        total: requestedTotal,
        completed: cachedCount,
        cached: cachedCount,
        generated: 0,
        failed: 0,
      });
    }
  }

  // Step 2: Generate remaining UNIQUE recipes for each meal type
  // Calculate how many more of each type we need to generate
  const remainingPerType: Record<string, number> = {
    breakfast: uniqueBreakfastCount - (cachedCountPerType['breakfast'] || 0),
    lunch: uniqueLunchCount - (cachedCountPerType['lunch'] || 0),
    dinner: uniqueDinnerCount - (cachedCountPerType['dinner'] || 0),
    snack: uniqueSnackCount - (cachedCountPerType['snack'] || 0),
  };

  // Build the remaining generation sequence based on what we still need.
  //
  // DAY-INTERLEAVED ORDER: emit one full day's worth of meal types
  // before moving to the next day — i.e. [B0, L0, S0, D0, B1, L1, S1,
  // D1, ...] instead of [B0, B1, B2, ..., L0, L1, L2, ...].
  //
  // This is purely an EMISSION-ORDER change to support day-grouped UI
  // streaming downstream. The actual generation LOGIC is unaffected:
  //   • Diversity tracking (usedProteins/usedFormats/usedTechniques)
  //     accumulates monotonically across the loop and is order-
  //     independent — every new recipe sees every previously-generated
  //     recipe regardless of which day it belongs to.
  //   • Repeat logic operates on results[] by recipe name (not
  //     position) so it doesn't care about input order either.
  //   • Cache logic, ingredient validation, the per-attempt retry — all
  //     intact.
  //
  // The downstream store-side day buffer relies on this order to flush
  // each day's full set of cards into the meal grid simultaneously.
  const remainingSequence: MealType[] = [];
  const maxDaysToFill = Math.max(
    remainingPerType['breakfast'] || 0,
    remainingPerType['lunch']     || 0,
    remainingPerType['dinner']    || 0,
    remainingPerType['snack']     || 0,
  );
  for (let d = 0; d < maxDaysToFill; d++) {
    if ((remainingPerType['breakfast'] || 0) > d) remainingSequence.push('breakfast');
    if ((remainingPerType['lunch']     || 0) > d) remainingSequence.push('lunch');
    if ((remainingPerType['snack']     || 0) > d) remainingSequence.push('snack');
    if ((remainingPerType['dinner']    || 0) > d) remainingSequence.push('dinner');
  }

  const recipesNeeded = remainingSequence.length;
  if (recipesNeeded > 0) {
    // ALWAYS generate sequentially (batch size 1) to ensure diversity tracking propagates
    // between recipes. Each recipe gets the full exclusion + diversity context from previous ones.
    const batchSize = 1;

    console.log(
      `[OptimizedGeneration] Need to generate ${recipesNeeded} more unique recipes: ${Object.entries(remainingPerType).filter(([_, c]) => c > 0).map(([mt, c]) => `${mt}=${c}`).join(', ')} (sequential for diversity)`
    );

    for (let i = 0; i < recipesNeeded; i++) {
      const mealType = remainingSequence[i] || mealTypes[i % mealTypes.length];

      // Build exclusion list for this recipe
      const excludeNames = [...usedRecipeNames];

      // Get assigned fridge ingredient for this recipe index
      // Note: Empty string means "freestyle" recipe (no specific fridge ingredient)
      const assignedFridgeIngredient = fridgeIngredientQueue.length > i ? fridgeIngredientQueue[i] : undefined;

      // Only pass additionalInstructions if this recipe is assigned a fridge ingredient
      // For freestyle recipes, don't mention fridge ingredients in instructions
      let recipeAdditionalInstructions = '';
      if (assignedFridgeIngredient) {
        recipeAdditionalInstructions = additionalInstructions || '';
        console.log(`[OptimizedGeneration] Recipe ${i + 1}: assigned fridge ingredient "${assignedFridgeIngredient}"`);
      } else if (fridgeIngredientQueue.length > 0) {
        // Freestyle recipe - don't include fridge ingredient instructions
        recipeAdditionalInstructions = ''; // Clear instructions to avoid AI using fridge ingredients
        console.log(`[OptimizedGeneration] Recipe ${i + 1}: FREESTYLE (no specific fridge ingredient - quantity limits respected)`);
      } else {
        // No fridge ingredients at all, use original instructions
        recipeAdditionalInstructions = additionalInstructions || '';
      }

      // Calculate protein exclusion based on diversity rules (only when optimizeGrocery is ON)
      // Rules when optimizeGrocery=true:
      // - 2 unique recipes: same protein (no exclusion)
      // - 3 unique recipes: first 2 same, 3rd different
      // - 4 unique recipes: 2 with protein A, 2 with protein B
      // - 5-6 unique recipes: at least 2 different proteins
      // - 7+ unique recipes: at least 3 different proteins
      const currentRecipePosition = cachedCount + i; // 0-indexed position in unique recipe sequence
      let computedExcludeProteins: string[] = [];
      const uniqueProteinsUsed = new Set(usedProteins);

      if (optimizeGrocery) {
        if (uniqueRecipesToGenerate === 2) {
          // Both recipes same protein - no exclusion
          computedExcludeProteins = [];
          console.log(`[OptimizedGeneration] Protein rule 2-meal: Recipe ${currentRecipePosition + 1}/2 - same protein (no exclusion)`);
        } else if (uniqueRecipesToGenerate === 3) {
          // First 2 same, 3rd different
          if (currentRecipePosition < 2) {
            computedExcludeProteins = [];
            console.log(`[OptimizedGeneration] Protein rule 3-meal: Recipe ${currentRecipePosition + 1}/3 - same protein (no exclusion)`);
          } else {
            computedExcludeProteins = [...uniqueProteinsUsed];
            console.log(`[OptimizedGeneration] Protein rule 3-meal: Recipe ${currentRecipePosition + 1}/3 - different protein, excluding: ${computedExcludeProteins.join(', ')}`);
          }
        } else if (uniqueRecipesToGenerate === 4) {
          // 2 with protein A, 2 with protein B
          if (currentRecipePosition < 2) {
            computedExcludeProteins = [];
            console.log(`[OptimizedGeneration] Protein rule 4-meal: Recipe ${currentRecipePosition + 1}/4 - protein A (no exclusion)`);
          } else if (currentRecipePosition === 2) {
            computedExcludeProteins = [...uniqueProteinsUsed];
            console.log(`[OptimizedGeneration] Protein rule 4-meal: Recipe ${currentRecipePosition + 1}/4 - switch to protein B, excluding: ${computedExcludeProteins.join(', ')}`);
          } else {
            // Recipe 4: reuse protein B (the most recent one)
            // Exclude all EXCEPT the last one used (which is protein B)
            const proteinArr = [...uniqueProteinsUsed];
            const proteinB = proteinArr[proteinArr.length - 1];
            computedExcludeProteins = proteinArr.filter(p => p !== proteinB);
            console.log(`[OptimizedGeneration] Protein rule 4-meal: Recipe ${currentRecipePosition + 1}/4 - reuse protein B, excluding: ${computedExcludeProteins.join(', ')}`);
          }
        } else if (uniqueRecipesToGenerate >= 5 && uniqueRecipesToGenerate <= 6) {
          // At least 2 different proteins
          if (currentRecipePosition < 2) {
            computedExcludeProteins = [];
          } else if (uniqueProteinsUsed.size < 2) {
            // Force 2nd protein
            computedExcludeProteins = [...uniqueProteinsUsed];
            console.log(`[OptimizedGeneration] Protein rule 5-6 meal: Recipe ${currentRecipePosition + 1} - forcing 2nd protein, excluding: ${computedExcludeProteins.join(', ')}`);
          } else {
            // Already have 2+, flexible
            computedExcludeProteins = [];
          }
        } else if (uniqueRecipesToGenerate >= 7) {
          // At least 3 different proteins
          if (currentRecipePosition < 2) {
            computedExcludeProteins = [];
          } else if (currentRecipePosition === 2 && uniqueProteinsUsed.size < 2) {
            // Force 2nd protein
            computedExcludeProteins = [...uniqueProteinsUsed];
            console.log(`[OptimizedGeneration] Protein rule 7+ meal: Recipe ${currentRecipePosition + 1} - forcing 2nd protein, excluding: ${computedExcludeProteins.join(', ')}`);
          } else if (uniqueProteinsUsed.size < 3) {
            // Force 3rd protein
            computedExcludeProteins = [...uniqueProteinsUsed];
            console.log(`[OptimizedGeneration] Protein rule 7+ meal: Recipe ${currentRecipePosition + 1} - forcing 3rd protein, excluding: ${computedExcludeProteins.join(', ')}`);
          } else {
            // Already have 3+, flexible
            computedExcludeProteins = [];
          }
        }
      } else {
        // When optimizeGrocery is OFF, just exclude all used proteins for variety (existing behavior)
        computedExcludeProteins = [...uniqueProteinsUsed];
      }

      // Curated-first (Item 3): pull from the Get Inspired bank before any
      // OpenAI call. Skip when this slot must feature a specific fridge
      // ingredient — curated recipes can't honour that, so those generate.
      if (!assignedFridgeIngredient) {
        const curated = curatedMatcher.take(mealType, excludeNames, {
          similarityThreshold: optimizeGrocery ? 0.8 : 0.6,
        });
        if (curated) {
          curatedCount++;
          generatedCount++;
          usedRecipeNames.push(curated.name);
          results.push(curated);
          onRecipeReady?.(curated, streamIndex++);
          // Feed diversity trackers so later OpenAI recipes vary against it.
          const proteins = extractProteinsFromRecipe(curated);
          usedProteins.push(...proteins);
          const format = extractCookingFormat(curated);
          if (format) usedFormats.push(format);
          const technique = extractCookingTechnique(curated);
          if (technique) usedTechniques.push(technique);
          console.log(
            `[OptimizedGeneration] Slot ${i + 1}/${recipesNeeded} from Get Inspired bank: "${curated.name}" (${mealType})`
          );
          onProgress?.({
            total: requestedTotal,
            completed: cachedCount + generatedCount + failedCount,
            cached: cachedCount,
            generated: generatedCount,
            failed: failedCount,
          });
          continue; // slot filled — skip OpenAI entirely
        }
      }

      // Pescatarian composition: if the running plan is short of its >60%
      // seafood target, nudge this OpenAI fallback toward fish (the bank had no
      // qualifying fish dish left). customCookingInstructions does NOT bypass
      // dietary validation, so the no-meat rule still holds.
      const pushFish = curatedMatcher.needsSignature(mealType);
      const slotCookingInstructions = pushFish
        ? [customCookingInstructions, 'This dish MUST feature fish or seafood as its main protein.']
            .filter((s) => s && s.trim().length > 0)
            .join('\n\n')
        : customCookingInstructions;

      // Retry loop for similarity rejection
      let recipeAccepted = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const recipe = await regenerateSingleRecipe({
            mealTypes: [mealType],
            preferences,
            additionalInstructions: recipeAdditionalInstructions, // Use recipe-specific instructions
            recipesToGenerate: uniqueRecipesToGenerate,
            optimizeGrocery,
            allowRepeats,
            assignedFridgeIngredient: assignedFridgeIngredient || undefined, // Convert empty string to undefined
            excludeProteins: computedExcludeProteins,
            previousFormats: [...usedFormats],
            previousTechniques: [...usedTechniques],
            recipeIndex: currentRecipePosition, // Pass position for prompt-side logic
            mealCount: uniqueRecipesToGenerate, // Pass meal count for prompt-side logic
            customCookingInstructions: slotCookingInstructions, // user instructions (+ fish nudge when needed)
          }, excludeNames);

          // Check for name similarity with ALL existing recipes (even when allowRepeats=true)
          const threshold = optimizeGrocery ? 0.8 : 0.6;
          const isTooSimilar = usedRecipeNames.some(existingName =>
            areRecipeNamesTooSimilar(recipe.name, existingName, threshold)
          );

          if (isTooSimilar) {
            console.warn(`[OptimizedGeneration] Recipe "${recipe.name}" too similar to existing recipes (attempt ${attempt + 1}) - retrying`);
            // Add to exclude list for next attempt
            excludeNames.push(recipe.name);
            continue;
          }

          // Recipe is unique enough - accept it
          generatedCount++;
          usedRecipeNames.push(recipe.name);
          results.push(recipe);
          // Keep the pescatarian seafood-vs-veg composition accurate.
          curatedMatcher.record(recipe, mealType);
          // Stream the freshly-accepted recipe out immediately so the UI
          // can render it before the rest of the batch finishes.
          onRecipeReady?.(recipe, streamIndex++);

          // Track diversity info for subsequent recipes
          const proteins = extractProteinsFromRecipe(recipe);
          usedProteins.push(...proteins);
          const format = extractCookingFormat(recipe);
          if (format) usedFormats.push(format);
          const technique = extractCookingTechnique(recipe);
          if (technique) usedTechniques.push(technique);

          console.log(`[OptimizedGeneration] Accepted recipe ${i + 1}/${recipesNeeded}: "${recipe.name}" (proteins: ${proteins.join(',') || 'none'}, format: ${format || 'unknown'}, technique: ${technique || 'unknown'})`);

          // Cache the generated recipe for future use
          if (useCache) {
            await cacheRecipe(preferencesHash, mealType, recipe);
          }

          recipeAccepted = true;
          break;
        } catch (error: any) {
          console.error(`[OptimizedGeneration] Failed to generate recipe (attempt ${attempt + 1}): ${error.message}`);
        }
      }

      if (!recipeAccepted) {
        failedCount++;
        console.error(`[OptimizedGeneration] Failed to generate unique recipe for ${mealType} after 5 attempts`);
      }

      onProgress?.({
        total: requestedTotal,
        completed: cachedCount + generatedCount + failedCount,
        cached: cachedCount,
        generated: generatedCount,
        failed: failedCount,
      });
    }
  }

  console.log(
    `[OptimizedGeneration] Generated ${results.length} unique recipes (${cachedCount} cached, ${generatedCount} generated [${curatedCount} from Get Inspired bank], ${failedCount} failed)`
  );

  // Step 3: Apply repeat logic
  // RULE: Each unique recipe can appear at most 2 times total (original + 1 repeat)
  // Cases:
  // - Both lunch & dinner: Dinner repeats as LUNCH the next day (leftovers concept)
  // - Only lunch: Some lunches repeat as lunch
  // - Only dinner: Some dinners repeat as dinner
  if (allowRepeats && maxAllowedRepeats > 0) {
    const onlyLunch = hasLunch && !hasDinner;
    const onlyDinner = hasDinner && !hasLunch;

    console.log(`[OptimizedGeneration] Applying repeat logic: ${maxAllowedRepeats} recipes will be repeated (onlyLunch=${onlyLunch}, onlyDinner=${onlyDinner})`);

    // Track usage
    const recipeUsageCount: Record<string, number> = {};
    results.forEach(r => {
      recipeUsageCount[r.name] = (recipeUsageCount[r.name] || 0) + 1;
    });

    // Find recipes that can be repeated
    // Use first occurrence of each unique name per meal type
    // Note: If AI generates duplicate names, we still want to repeat each unique name once
    const recipesToRepeat: GeneratedRecipeResponse[] = [];
    const seenNames = new Set<string>();

    // Prioritize dinner recipes for the dinner→lunch pattern
    // For onlyLunch: use lunch recipes; for onlyDinner: use dinner; for both: use dinner
    const repeatSourceType: MealType = onlyLunch ? 'lunch' : 'dinner';
    results.forEach(r => {
      if (r.mealType === repeatSourceType && !seenNames.has(r.name)) {
        seenNames.add(r.name);
        recipesToRepeat.push(r);
      }
    });

    // If still not enough, add lunch recipes too (handles edge cases)
    if (recipesToRepeat.length < maxAllowedRepeats && !onlyDinner) {
      results.forEach(r => {
        if (r.mealType === 'lunch' && !seenNames.has(r.name)) {
          seenNames.add(r.name);
          recipesToRepeat.push(r);
        }
      });
    }

    console.log(`[OptimizedGeneration] Available recipes for repeating: ${recipesToRepeat.map(r => `${r.name}(${r.mealType})`).join(', ')}`);

    // Build new array with repeats inserted in correct positions
    const newResults: GeneratedRecipeResponse[] = [];
    let repeatsAdded = 0;
    const usedForRepeat = new Set<string>(); // Track which recipes have been repeated

    for (let i = 0; i < results.length; i++) {
      const recipe = results[i];
      newResults.push(recipe);

      // Check if we should insert a repeat after this recipe
      const canRepeat = repeatsAdded < maxAllowedRepeats &&
                        !usedForRepeat.has(recipe.name) &&
                        recipesToRepeat.some(r => r.name === recipe.name);

      if (canRepeat) {
        // Determine the meal type for the repeat
        let repeatMealType: MealType;
        if (onlyLunch) {
          // Only lunch selected: repeat as lunch
          repeatMealType = 'lunch';
        } else if (onlyDinner) {
          // Only dinner selected: repeat as dinner
          repeatMealType = 'dinner';
        } else {
          // Both lunch and dinner: dinner becomes next-day lunch (leftovers)
          repeatMealType = recipe.mealType === 'dinner' ? 'lunch' : 'lunch';
        }

        const repeatedRecipe: GeneratedRecipeResponse = {
          ...recipe,
          mealType: repeatMealType,
        };

        newResults.push(repeatedRecipe);
        // Stream the repeat into its slot immediately so the store can
        // render the lunch card — mirrors the fallback loop below.
        onRecipeReady?.(repeatedRecipe, streamIndex++);
        recipeUsageCount[recipe.name] = 2;
        usedForRepeat.add(recipe.name);
        repeatsAdded++;

        console.log(`✓ [OptimizedGeneration] Repeated: "${recipe.name}" (${recipe.mealType} → ${repeatMealType})`);
      }
    }

    // If we still need more repeats, add remaining available recipes
    for (const recipeToRepeat of recipesToRepeat) {
      if (repeatsAdded >= maxAllowedRepeats) break;
      if (usedForRepeat.has(recipeToRepeat.name)) continue;

      // Determine the meal type for the repeat
      let repeatMealType: MealType;
      if (onlyLunch) {
        repeatMealType = 'lunch';
      } else if (onlyDinner) {
        repeatMealType = 'dinner';
      } else {
        repeatMealType = 'lunch'; // Default to lunch for leftovers
      }

      const repeatedRecipe: GeneratedRecipeResponse = {
        ...recipeToRepeat,
        mealType: repeatMealType,
      };
      newResults.push(repeatedRecipe);
      // Stream the repeat into the slot immediately — even though the
      // recipe content is shared with the original, this is a NEW slot
      // (different meal type / day) and the UI needs to render it.
      onRecipeReady?.(repeatedRecipe, streamIndex++);
      recipeUsageCount[recipeToRepeat.name] = 2;
      usedForRepeat.add(recipeToRepeat.name);
      repeatsAdded++;
      console.log(`✓ [OptimizedGeneration] Repeated: "${recipeToRepeat.name}" (${recipeToRepeat.mealType} → ${repeatMealType}) - appended`);
    }

    // Replace results with the new array
    results.length = 0;
    results.push(...newResults);

    console.log(`[OptimizedGeneration] Repeat summary: ${repeatsAdded} recipes repeated (each appears exactly 2 times)`);

    // Log final meal type counts
    const finalMealTypeCounts: Record<string, number> = {};
    newResults.forEach(r => {
      const mt = r.mealType || 'unknown';
      finalMealTypeCounts[mt] = (finalMealTypeCounts[mt] || 0) + 1;
    });
    console.log(`[OptimizedGeneration] Final meal type counts: ${Object.entries(finalMealTypeCounts).map(([mt, count]) => `${mt}=${count}`).join(', ')}`);
    console.log(`[OptimizedGeneration] Final order: ${results.map((r, i) => `${i + 1}:${r.name}(${r.mealType})`).join(', ')}`);
  }

  // Safety net: if we still don't have enough recipes, generate the missing ones directly.
  // `results` already includes the breakfast pass output, so compare against the
  // FULL requested total. Backfill uses core (non-breakfast) meal types only;
  // skip entirely for breakfast-only plans (mealTypes is empty there).
  const stillNeeded = requestedTotal - results.length;
  if (stillNeeded > 0 && mealTypes.length > 0) {
    console.log(`[OptimizedGeneration] Safety net: need ${stillNeeded} more recipes to reach target of ${requestedTotal}`);
    const safeBatch: Promise<GeneratedRecipeResponse | null>[] = [];
    for (let i = 0; i < stillNeeded; i++) {
      const mealType = mealTypes[i % mealTypes.length];

      // Curated-first here too — only spend an OpenAI call when the bank is dry.
      const curated = curatedMatcher.take(mealType, [...usedRecipeNames], {
        similarityThreshold: optimizeGrocery ? 0.8 : 0.6,
      });
      if (curated) {
        curatedCount++;
        usedRecipeNames.push(curated.name);
        safeBatch.push(Promise.resolve(curated));
        console.log(`[OptimizedGeneration] Safety net slot from Get Inspired bank: "${curated.name}" (${mealType})`);
        continue;
      }

      const safePushFish = curatedMatcher.needsSignature(mealType);
      const safeCookingInstructions = safePushFish
        ? [customCookingInstructions, 'This dish MUST feature fish or seafood as its main protein.']
            .filter((s) => s && s.trim().length > 0)
            .join('\n\n')
        : customCookingInstructions;
      safeBatch.push(
        regenerateSingleRecipe({
          mealTypes: [mealType],
          preferences,
          additionalInstructions,
          customCookingInstructions: safeCookingInstructions,
          recipesToGenerate,
          optimizeGrocery,
          allowRepeats,
        }, [...usedRecipeNames]).then(recipe => {
          usedRecipeNames.push(recipe.name);
          curatedMatcher.record(recipe, mealType);
          if (useCache) cacheRecipe(preferencesHash, mealType, recipe);
          return recipe;
        }).catch(() => null)
      );
    }
    const safeResults = await Promise.all(safeBatch);
    safeResults.forEach((r) => {
      if (r) {
        results.push(r);
        // Stream safety-net recipes too — they're real slots the UI needs.
        onRecipeReady?.(r, streamIndex++);
      }
    });
    console.log(`[OptimizedGeneration] Safety net added ${safeResults.filter(Boolean).length} recipes. Total now: ${results.length}`);
  }

  // Log ingredient statistics for debugging grocery optimization
  const totalIngredients = results.reduce((sum, r) => sum + r.ingredients.length, 0);
  const avgIngredients = results.length > 0 ? totalIngredients / results.length : 0;
  const uniqueIngredientNames = new Set(
    results.flatMap(r => r.ingredients.map(ing => ing.name.toLowerCase().trim()))
  );
  console.log(`📊 [OptimizedGeneration] Ingredient stats: Total=${totalIngredients}, Avg per recipe=${avgIngredients.toFixed(1)}, Unique=${uniqueIngredientNames.size}`);
  if (optimizeGrocery) {
    const isEffective = uniqueIngredientNames.size <= results.length * 6;
    console.log(`🛒 [OptimizedGeneration] Grocery optimization ${isEffective ? '✓ EFFECTIVE' : '⚠️ NEEDS IMPROVEMENT'}: Target unique ~${results.length * 5}-${results.length * 6}, Actual=${uniqueIngredientNames.size}`);
  }

  return results.slice(0, requestedTotal);
}

/**
 * Estimate the time needed to generate recipes
 * Cached recipes: ~0.5s each
 * Generated recipes: ~10s each (sequential for diversity)
 * When allowRepeats is ON, fewer unique recipes are generated (rest are repeats)
 */
export function estimateGenerationTime(
  recipesToGenerate: number,
  cachedCount: number = 0,
  allowRepeats: boolean = true
): number {
  const cachedTime = cachedCount * 0.5; // 0.5s per cached

  if (allowRepeats) {
    // When repeats are on, we generate ~ceil(N/2) unique recipes sequentially
    const uniqueCount = Math.ceil(recipesToGenerate / 2) - cachedCount;
    const generatedTime = Math.max(0, uniqueCount) * 10;
    return Math.ceil(cachedTime + generatedTime);
  } else {
    // Sequential: ~10s per recipe for uniqueness
    const generatedCount = recipesToGenerate - cachedCount;
    const generatedTime = generatedCount * 10;
    return Math.ceil(cachedTime + generatedTime);
  }
}
