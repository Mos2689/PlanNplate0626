// ─────────────────────────────────────────────────────────────────────────
// Generic curated-plan scheduling engine
//
// This is the same scheduling logic the High-Protein Simple plan uses, lifted
// out so EVERY schedulable plan can share it. A plan supplies a `PlanBank`
// (its recipe map + the pools the scheduler draws from) and the engine handles
// batch vs daily cooking, weekday-aware breakfasts, leftover placeholders,
// buy-out slots and serving-size scaling identically across plans.
//
// Shared types/constants (CookingPreferences, ScheduledMeal, computeBatchBlocks
// …) still live in high-protein-plan.ts; we import them here to avoid churn for
// the many call-sites that already import them from there.
// ─────────────────────────────────────────────────────────────────────────
import { Recipe } from './store';
import {
  type CookingPreferences,
  type ScheduledMeal,
  type BreakfastPref,
  DEFAULT_BATCH_CONFIG,
  DEFAULT_COOKING_PREFS,
  computeBatchBlocks,
} from './high-protein-plan';

// Structural match for CuratedMeal's recipe shape (kept local to avoid a
// circular import with curated-meal-plans.ts).
export type CuratedRecipe = Omit<
  Recipe,
  'id' | 'isSaved' | 'createdAt' | 'isAIGenerated' | 'curatedSourceId'
> & { sourceId?: string };

/**
 * Everything the engine needs to schedule one plan.
 *
 * Pools hold recipe KEYS into `recipes`. Breakfast is split weekend/weekday so
 * hot cooked breakfasts only land on weekends. `batchMains` is the rotating
 * pool the batch scheduler cooks from; `lunchCook` / `dinnersFresh` are the
 * 7-long daily-rhythm pools (indexed by dayOffset % 7).
 */
export interface PlanBank {
  recipes: Record<string, CuratedRecipe>;
  breakfastWeekendCook: string[]; // hot/cooked breakfasts (weekends)
  breakfastWeekdayEasy: string[]; // no-cook breakfasts (weekdays)
  lunchCook: string[]; // daily-rhythm fresh lunches (length 7)
  dinnersFresh: string[]; // daily-rhythm dinners (length 7)
  batchMains: string[]; // cookable mains pool for batch cooking
  grabGoBreakfast: CuratedRecipe; // "Grab & go" placeholder
  buyOutLunch: CuratedRecipe; // "Buy out" lunch placeholder
  buyOutDinner: CuratedRecipe; // "Buy out" dinner placeholder
}

type SlotPlan = { ref: string; leftover: boolean };

// Turn a "cooked" recipe into a lightweight leftover variant so it dedupes
// separately from the original and reads honestly in the schedule.
//
// ingredients: [] — a leftover reheats already-cooked food, so the variant
// carries zero ingredients of its own. The original cook already paid for
// every gram on the grocery list. This is the safety net that lets us link
// the slot to a real recipe (so users see image + description + steps) without
// ever double-counting in generateGroceryList.
function leftoverRecipe(
  bank: PlanBank,
  ref: string,
  mealType: 'lunch' | 'dinner',
): CuratedRecipe {
  const base = bank.recipes[ref];
  return {
    ...base,
    name: `Leftover ${base.name}`,
    description: `Reheat last night’s ${base.name.toLowerCase()} — zero-effort ${mealType}.`,
    ingredients: [],
    instructions: [
      `Pull last night's ${base.name.toLowerCase()} from the fridge.`,
      'Reheat 3–4 min — microwave or stovetop with a splash of water.',
      'Plate, taste, adjust salt or lemon, and eat.',
    ],
    cookTime: 4,
    prepTime: 0,
    tags: Array.from(new Set([...(base.tags ?? []), 'Leftover'])),
    sourceId: `${ref}-leftover`,
  };
}

function toMeal(
  bank: PlanBank,
  dayOffset: number,
  mealType: ScheduledMeal['mealType'],
  slot: SlotPlan,
): ScheduledMeal {
  if (slot.leftover) {
    // A leftover reheats already-cooked food. The variant recipe carries
    // ZERO ingredients (see leftoverRecipe), so apply will mint + link a
    // real Recipe row that gives the slot an image, description, and reheat
    // steps — but generateGroceryList naturally skips it because there are
    // no ingredients to add.
    return {
      dayOffset,
      mealType,
      recipe: leftoverRecipe(bank, slot.ref, mealType as 'lunch' | 'dinner'),
    };
  }
  return { dayOffset, mealType, recipe: bank.recipes[slot.ref] };
}

// Breakfast slot builder.
//   skip → no slot (returns null)
//   grab → labelled "Grab & go" placeholder (no recipe)
//   cook → a hot cooked breakfast, but ONLY on weekends; weekdays (Mon–Fri)
//          fall back to a no-cook easy breakfast.
// `weekday` is 0 = Sun … 6 = Sat.
function breakfastMeal(
  bank: PlanBank,
  dayOffset: number,
  pref: BreakfastPref,
  weekday: number,
): ScheduledMeal | null {
  if (pref === 'skip') return null;
  if (pref === 'grab') {
    return {
      dayOffset,
      mealType: 'breakfast',
      recipe: bank.grabGoBreakfast,
      placeholderLabel: 'Grab & go',
    };
  }
  const isWeekend = weekday === 0 || weekday === 6;
  const pool = isWeekend ? bank.breakfastWeekendCook : bank.breakfastWeekdayEasy;
  const ref = pool[dayOffset % pool.length];
  return toMeal(bank, dayOffset, 'breakfast', { ref, leftover: false });
}

function placeholderMeal(
  dayOffset: number,
  mealType: 'lunch' | 'dinner',
  recipe: CuratedRecipe,
  label: string,
): ScheduledMeal {
  return { dayOffset, mealType, recipe, placeholderLabel: label };
}

/**
 * Build the expanded meal list for any schedulable plan.
 *
 * A 7-day base week is repeated to fill `durationDays`; the user's cooking-style
 * prefs swap slots between freshly-cooked and leftover / grab-and-go variants.
 * `startWeekday` (0 = Sun) lands batch cook days on the correct calendar days.
 */
export function buildPlanMeals(
  bank: PlanBank,
  durationDays: number,
  prefs: CookingPreferences = DEFAULT_COOKING_PREFS,
  startWeekday: number = 0,
): ScheduledMeal[] {
  const days = Math.max(1, Math.floor(durationDays));
  const bfast = prefs.breakfast;

  // ── Batch path ──
  // On a cook day the user batch-cooks N distinct recipes; ALL of them land in
  // that day's LUNCH slot (real recipes, counted once for groceries). Dinner +
  // the following days are "Leftover <dish>" placeholders (no ingredients).
  // Cooking at lunch means the opening day never shows a leftover for food not
  // yet cooked, and the leftover rotation hands out consecutive dishes so a
  // following day's lunch and dinner are always different recipes.
  if (prefs.style === 'batch') {
    const cfg = prefs.batch ?? DEFAULT_BATCH_CONFIG;
    const recipesN = Math.max(
      1,
      Math.min(Math.floor(cfg.recipesPerCookDay || 1), bank.batchMains.length),
    );
    const blocks = computeBatchBlocks(days, startWeekday, cfg.cookDays);

    const meals: ScheduledMeal[] = [];
    let poolIdx = 0; // never resets within a build → cross-week rotation

    for (const block of blocks) {
      const blockDays = Math.min(block.days, days - block.cookOffset);
      if (blockDays <= 0) continue;

      const dishes: string[] = [];
      for (let x = 0; x < recipesN; x++) {
        dishes.push(bank.batchMains[poolIdx % bank.batchMains.length]);
        poolIdx++;
      }

      let leftIdx = 0;
      const nextLeftover = (): string => {
        const ref = dishes[leftIdx % dishes.length];
        leftIdx++;
        return ref;
      };

      // Pre-count leftovers per dish (same order nextLeftover() runs below) so a
      // cook's serving size scales to 1 fresh lunch + that many leftovers.
      const leftoverSlotCount = 1 + Math.max(0, blockDays - 1) * 2;
      const leftoversByDish: Record<string, number> = {};
      for (let i = 0; i < leftoverSlotCount; i++) {
        const ref = dishes[i % dishes.length];
        leftoversByDish[ref] = (leftoversByDish[ref] ?? 0) + 1;
      }

      for (let k = 0; k < blockDays; k++) {
        const d = block.cookOffset + k;
        const b = breakfastMeal(bank, d, bfast, (startWeekday + d) % 7);
        if (b) meals.push(b);

        if (k === 0) {
          for (const dish of dishes) {
            const lunch = toMeal(bank, d, 'lunch', { ref: dish, leftover: false });
            lunch.mealsCovered = 1 + (leftoversByDish[dish] ?? 0);
            meals.push(lunch);
          }
          meals.push(toMeal(bank, d, 'dinner', { ref: nextLeftover(), leftover: true }));
        } else {
          meals.push(toMeal(bank, d, 'lunch', { ref: nextLeftover(), leftover: true }));
          meals.push(toMeal(bank, d, 'dinner', { ref: nextLeftover(), leftover: true }));
        }
      }
    }

    return meals;
  }

  // ── Daily path ──
  // Each meal honours its own habit: dinner leftovers (cook every other night)
  // / cook (fresh nightly) / buy; lunch leftovers (reuse last dinner) / cook /
  // buy; breakfast via breakfastMeal.
  const dinners: (SlotPlan | null)[] = [];
  let dinnerCookIdx = 0;
  for (let d = 0; d < days; d++) {
    const w = d % 7;
    if (prefs.dinner === 'buy') {
      dinners.push(null);
    } else if (prefs.dinner === 'leftovers') {
      if (d % 2 === 0) {
        dinners.push({ ref: bank.dinnersFresh[dinnerCookIdx % bank.dinnersFresh.length], leftover: false });
        dinnerCookIdx++;
      } else {
        const prev = dinners[d - 1];
        dinners.push(
          prev
            ? { ref: prev.ref, leftover: true }
            : { ref: bank.dinnersFresh[dinnerCookIdx % bank.dinnersFresh.length], leftover: false },
        );
      }
    } else {
      dinners.push({ ref: bank.dinnersFresh[w], leftover: false });
    }
  }

  const meals: ScheduledMeal[] = [];
  for (let d = 0; d < days; d++) {
    const w = d % 7;

    const b = breakfastMeal(bank, d, bfast, (startWeekday + d) % 7);
    if (b) meals.push(b);

    if (prefs.lunch === 'buy') {
      meals.push(placeholderMeal(d, 'lunch', bank.buyOutLunch, 'Buy out'));
    } else if (prefs.lunch === 'leftovers' && d > 0 && dinners[d - 1]) {
      meals.push(toMeal(bank, d, 'lunch', { ref: dinners[d - 1]!.ref, leftover: true }));
    } else {
      meals.push(toMeal(bank, d, 'lunch', { ref: bank.lunchCook[w], leftover: false }));
    }

    const dn = dinners[d];
    if (dn) {
      meals.push(toMeal(bank, d, 'dinner', dn));
    } else {
      meals.push(placeholderMeal(d, 'dinner', bank.buyOutDinner, 'Buy out'));
    }
  }

  return meals;
}
