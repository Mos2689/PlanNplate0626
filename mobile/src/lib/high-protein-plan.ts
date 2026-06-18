// ─────────────────────────────────────────────────────────────────────────
// High-Protein Simple — scheduling engine
//
// Sourced from the "High-Protein Meal Plan · 4 Weeks · Gym-Optimised (AU/NZ)"
// document. The doc ships a 16-recipe bank (R1–R16) plus a staggered weekly
// schedule. In the app we model it as a single strong 7-day BASE WEEK that is
// REPEATED to fill whatever Duration the user picks (7 / 14 / 21 / custom),
// with the user's cooking-style preferences swapping individual slots between
// freshly-cooked and leftover/grab-and-go variants.
//
// This module is intentionally self-contained: it imports only the `Recipe`
// type from the store and returns a structurally-CuratedMeal[] shape, so
// curated-meal-plans.ts can consume it without creating an import cycle.
// ─────────────────────────────────────────────────────────────────────────
import { Recipe } from './store';

// ── Cooking-style preferences (driven by the overview controls) ──
export type CookStyle = 'daily' | 'batch';

// Batch-cook configuration (only read when style === 'batch'). The user picks
// which weekday(s) they cook and how many distinct recipes they make each cook
// day; everything else (portions, which days eat leftovers) is derived.
export interface BatchConfig {
  /** JS weekday indices to cook on (0 = Sun … 6 = Sat). */
  cookDays: number[];
  /** How many distinct recipes to make on each cook day (1–3). */
  recipesPerCookDay: number;
}

// These mirror the profile's MealHabits options 1:1 so the setup screen can
// pass the user's saved habits straight through, and each option maps to a
// distinct slot treatment in the scheduler (see buildHighProteinMeals).
export type BreakfastPref = 'skip' | 'cook' | 'grab';
export type LunchPref = 'leftovers' | 'cook' | 'buy';
export type DinnerPref = 'leftovers' | 'cook' | 'buy';

export interface CookingPreferences {
  /** skip = no breakfast slot; cook = hot cooked breakfast; grab = no-cook grab & go. */
  breakfast: BreakfastPref;
  /** leftovers = reuse previous dinner; cook = fresh lunch; buy = buy-out placeholder. */
  lunch: LunchPref;
  /** leftovers = cook some nights + reheat between; cook = fresh nightly; buy = buy-out placeholder. */
  dinner: DinnerPref;
  /** Daily = everything fresh; Batch = cook on set days, eat leftovers between. */
  style: CookStyle;
  /** Only used when style === 'batch'. */
  batch?: BatchConfig;
}

// Default batch plan: cook on Sunday + Wednesday, 2 recipes each time.
export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  cookDays: [0, 3],
  recipesPerCookDay: 2,
};

// Neutral default — everything freshly cooked, no leftovers. The base 7-day
// plan.meals snapshot is generated with these so cards/previews look "full".
export const DEFAULT_COOKING_PREFS: CookingPreferences = {
  breakfast: 'cook',
  lunch: 'cook',
  dinner: 'cook',
  style: 'daily',
  batch: DEFAULT_BATCH_CONFIG,
};

// Structural match for CuratedMeal in curated-meal-plans.ts (kept local to
// avoid a circular import).
type CuratedRecipe = Omit<
  Recipe,
  'id' | 'isSaved' | 'createdAt' | 'isAIGenerated' | 'curatedSourceId'
> & { sourceId?: string };

export interface ScheduledMeal {
  dayOffset: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  recipe: CuratedRecipe;
  // When set, this slot is NOT a cooked recipe — apply leaves the slot
  // recipe-less and just labels it (e.g. "Grab & go"). The `recipe` field is
  // a lightweight display stand-in only and is never added to the library.
  placeholderLabel?: string;
  // How many meals this single cook feeds (fresh meal + its leftovers). Only
  // set on cooked batch mains; used to scale serving size at apply time.
  mealsCovered?: number;
}

const IMG =
  'https://wcjsrhdlnmfugdjtvadj.supabase.co/storage/v1/object/public/High%20Protein%20Gym%20Meal%20Plan/';

// ── The 16-recipe bank (R1–R16), sized for 2 serves ──
// Keyed by the doc's recipe ref so the schedule below reads clearly.
const RECIPES: Record<string, CuratedRecipe> = {
  R1: {
    name: 'High-Protein Overnight Oats',
    description:
      'The highest-protein no-cook breakfast there is. Prep two jars the night before — grab from the fridge on your way to the gym.',
    imageUrl: IMG + 'high_protein_overnight_oats.png',
    blurhash: 'LKLW;E~p%Nn~^*M{Rjs:bcofM{xt',
    cookTime: 0,
    prepTime: 5,
    servings: 2,
    calories: 650,
    ingredients: [
      { id: '1', name: 'Rolled Oats', quantity: '1', unit: 'cup', category: 'pantry' },
      { id: '2', name: 'Greek Yogurt', quantity: '1', unit: 'cup', category: 'dairy' },
      { id: '3', name: 'Milk', quantity: '0.5', unit: 'cup', category: 'dairy' },
      { id: '4', name: 'Chia Seeds', quantity: '2', unit: 'tbsp', category: 'pantry' },
      { id: '5', name: 'Peanut Butter', quantity: '2', unit: 'tbsp', category: 'pantry' },
      { id: '6', name: 'Banana', quantity: '2', unit: 'whole', category: 'produce' },
      { id: '7', name: 'Honey', quantity: '2', unit: 'tbsp', category: 'pantry' },
    ],
    instructions: [
      'Mix oats, Greek yogurt, milk and chia seeds in two jars',
      'Seal and refrigerate overnight',
      'In the morning, top with peanut butter, sliced banana and honey',
      'Eat straight from the jar',
    ],
    tags: ['High Protein', 'Breakfast', 'No Cook', 'Grab & Go'],
  },
  R2: {
    name: 'Scrambled Eggs & Avocado on Sourdough',
    description:
      'A proper cooked brekkie for weekend mornings or days you need extra fuel. Four eggs, good fat from avocado, wholegrain carbs.',
    imageUrl: IMG + 'scrambled_eggs_avocado_on_sourdough.png',
    blurhash: 'LGI}bC005aS%?w%1WDt7A#I.==xD',
    cookTime: 8,
    prepTime: 4,
    servings: 2,
    calories: 680,
    ingredients: [
      { id: '1', name: 'Eggs', quantity: '4', unit: 'whole', category: 'dairy' },
      { id: '2', name: 'Milk', quantity: '2', unit: 'tbsp', category: 'dairy' },
      { id: '3', name: 'Avocado', quantity: '1', unit: 'whole', category: 'produce' },
      { id: '4', name: 'Sourdough Bread', quantity: '4', unit: 'slices', category: 'bakery' },
      { id: '5', name: 'Butter', quantity: '1', unit: 'tbsp', category: 'dairy' },
    ],
    instructions: [
      'Whisk eggs with milk, salt and pepper',
      'Heat butter in a non-stick pan on medium-low',
      'Pour in eggs and stir slowly every 30 seconds',
      'Remove from heat while still slightly glossy',
      'Toast sourdough and mash avocado with lemon and chilli',
      'Serve eggs on toast with avocado',
    ],
    tags: ['High Protein', 'Breakfast', 'Weekend'],
  },
  R3: {
    name: 'Protein Smoothie Bowl',
    description:
      'Thick enough to eat with a spoon. Load the toppings for crunch and micronutrients — the highest-protein breakfast in the plan.',
    imageUrl: IMG + 'protein_smoothie_bowl.png',
    blurhash: 'LCKdPU00PBwe}=~pX7IUcrofVEtR',
    cookTime: 0,
    prepTime: 5,
    servings: 2,
    calories: 580,
    ingredients: [
      { id: '1', name: 'Frozen Banana', quantity: '2', unit: 'whole', category: 'produce' },
      { id: '2', name: 'Frozen Mixed Berries', quantity: '1', unit: 'cup', category: 'frozen' },
      { id: '3', name: 'Greek Yogurt', quantity: '1', unit: 'cup', category: 'dairy' },
      { id: '4', name: 'Oat Milk', quantity: '0.5', unit: 'cup', category: 'dairy' },
      { id: '5', name: 'Granola', quantity: '0.5', unit: 'cup', category: 'pantry' },
    ],
    instructions: [
      'Blend frozen banana, berries, yogurt and milk until very thick',
      'Divide into 2 bowls — thick enough that toppings sit on top',
      'Top with granola, chia and a drizzle of honey',
      'Serve immediately',
    ],
    tags: ['High Protein', 'Breakfast', 'No Cook', 'Grab & Go'],
  },
  R4: {
    name: 'Chicken & Avocado Protein Wraps',
    description:
      'The most reliable high-protein lunch you can take anywhere. Use leftover dinner chicken or a deli rotisserie. Scales infinitely.',
    imageUrl: IMG + 'chicken_avocado_protein_wraps.png',
    blurhash: 'LIJ8Ln?b%N%MohM}M{f5-@WBITRP',
    cookTime: 0,
    prepTime: 10,
    servings: 2,
    calories: 620,
    ingredients: [
      { id: '1', name: 'Cooked Chicken Breast', quantity: '200', unit: 'g', category: 'meat' },
      { id: '2', name: 'Wholegrain Wraps', quantity: '4', unit: 'whole', category: 'bakery' },
      { id: '3', name: 'Avocado', quantity: '1', unit: 'whole', category: 'produce' },
      { id: '4', name: 'Baby Spinach', quantity: '2', unit: 'cups', category: 'produce' },
      { id: '5', name: 'Greek Yogurt', quantity: '4', unit: 'tbsp', category: 'dairy' },
    ],
    instructions: [
      'Lay wraps flat and spread Greek yogurt or hummus on each',
      'Layer spinach, chicken, avocado and cherry tomatoes',
      'Add sriracha and a squeeze of lemon',
      'Roll tightly and cut in half diagonally',
    ],
    tags: ['High Protein', 'Lunch', 'No Cook'],
  },
  R5: {
    name: 'High-Protein Tuna Rice Bowl',
    description:
      'Two tins of tuna, rice and egg — one of the cheapest high-protein lunches available. Cold leftover rice works perfectly here.',
    imageUrl: IMG + 'high_protein_tuna_rice_bowl.png',
    blurhash: 'LSI}Oy^+%gxu~WRkbHWCT2W.RPj?',
    cookTime: 10,
    prepTime: 5,
    servings: 2,
    calories: 590,
    ingredients: [
      { id: '1', name: 'Canned Tuna', quantity: '2', unit: 'can', category: 'pantry' },
      { id: '2', name: 'Cooked Jasmine Rice', quantity: '1.5', unit: 'cups', category: 'pantry' },
      { id: '3', name: 'Eggs', quantity: '2', unit: 'whole', category: 'dairy' },
      { id: '4', name: 'Avocado', quantity: '0.5', unit: 'whole', category: 'produce' },
      { id: '5', name: 'Baby Spinach', quantity: '1', unit: 'cup', category: 'produce' },
      { id: '6', name: 'Soy Sauce', quantity: '2', unit: 'tbsp', category: 'pantry' },
    ],
    instructions: [
      'Soft-boil eggs for 7 minutes, cool and peel',
      'Warm the rice if needed (cold leftover rice is great)',
      'Whisk soy, sesame oil and honey for the dressing',
      'Build bowls: rice, spinach, tuna, halved egg, avocado',
      'Drizzle dressing and top with sesame seeds',
    ],
    tags: ['High Protein', 'Lunch', 'Quick'],
  },
  R6: {
    name: 'Greek Chicken Caesar Salad',
    description:
      'The most protein-dense salad you can make without weighing food. Parmesan, egg, chicken and a yoghurt-based dressing stack the protein.',
    imageUrl: IMG + 'greek_chicken_caesar_salad.png',
    blurhash: 'LPL:[f-p?bxu~VR*WBWB.8t7Mxxa',
    cookTime: 12,
    prepTime: 8,
    servings: 2,
    calories: 540,
    ingredients: [
      { id: '1', name: 'Chicken Breast', quantity: '200', unit: 'g', category: 'meat' },
      { id: '2', name: 'Cos Lettuce', quantity: '2', unit: 'whole', category: 'produce' },
      { id: '3', name: 'Eggs', quantity: '2', unit: 'whole', category: 'dairy' },
      { id: '4', name: 'Parmesan', quantity: '0.25', unit: 'cup', category: 'dairy' },
      { id: '5', name: 'Greek Yogurt', quantity: '3', unit: 'tbsp', category: 'dairy' },
    ],
    instructions: [
      'Whisk Greek yogurt, lemon, grated garlic, Worcestershire and Dijon for the dressing',
      'Season and pan-fry chicken 5–6 min per side, rest, then slice',
      'Hard-boil the eggs and halve',
      'Toss chopped cos with most of the dressing',
      'Top with chicken, eggs, croutons and parmesan',
    ],
    tags: ['High Protein', 'Lunch', 'Salad'],
  },
  R7: {
    name: 'Honey Soy Chicken Thigh Bowl',
    description:
      'Sticky, caramelised chicken thighs with rice and steamed greens. Make double — tomorrow’s lunch is sorted.',
    imageUrl: IMG + 'honey_soy_chicken_thigh_bowl.png',
    blurhash: 'LULD+3.7yExv_NV[WBoLPCn,R5e.',
    cookTime: 18,
    prepTime: 4,
    servings: 2,
    calories: 720,
    ingredients: [
      { id: '1', name: 'Chicken Thigh Fillets', quantity: '500', unit: 'g', category: 'meat' },
      { id: '2', name: 'Honey', quantity: '2', unit: 'tbsp', category: 'pantry' },
      { id: '3', name: 'Soy Sauce', quantity: '2', unit: 'tbsp', category: 'pantry' },
      { id: '4', name: 'Brown Rice', quantity: '1', unit: 'cup', category: 'pantry' },
      { id: '5', name: 'Broccolini', quantity: '200', unit: 'g', category: 'produce' },
    ],
    instructions: [
      'Mix honey, soy, sesame oil and garlic, then coat the chicken',
      'Cook thighs 5–6 min per side until caramelised and cooked through',
      'Rest 2 min and slice',
      'Warm the rice and steam the broccolini',
      'Assemble bowls and spoon over any pan glaze',
    ],
    tags: ['High Protein', 'Dinner', 'Meal Prep'],
  },
  R8: {
    name: 'Beef or Turkey Mince Bolognese',
    description:
      'High protein, filling, and freezes brilliantly. Cook the full mince but only half the pasta — freeze the extra sauce.',
    imageUrl: IMG + 'beef_or_turkey_mince_bolognese.png',
    blurhash: 'LEF~294o_NRi%goeD%xu00t78_R+',
    cookTime: 28,
    prepTime: 8,
    servings: 2,
    calories: 780,
    ingredients: [
      { id: '1', name: 'Lean Beef Mince', quantity: '500', unit: 'g', category: 'meat' },
      { id: '2', name: 'Spaghetti', quantity: '200', unit: 'g', category: 'pantry' },
      { id: '3', name: 'Crushed Tomatoes', quantity: '400', unit: 'g', category: 'pantry' },
      { id: '4', name: 'Onion', quantity: '0.5', unit: 'whole', category: 'produce' },
      { id: '5', name: 'Garlic', quantity: '3', unit: 'cloves', category: 'produce' },
      { id: '6', name: 'Parmesan', quantity: '0.25', unit: 'cup', category: 'dairy' },
    ],
    instructions: [
      'Boil pasta per packet and reserve a splash of pasta water',
      'Fry onion 3 min, add garlic 1 min',
      'Add mince and brown 5–6 min',
      'Add tomato paste, crushed tomatoes, Worcestershire and herbs',
      'Simmer 15 min, then toss pasta through the sauce',
      'Serve with grated parmesan',
    ],
    tags: ['High Protein', 'Dinner', 'Freezer-Friendly'],
  },
  R9: {
    name: 'Garlic Butter Salmon with Roasted Veg & Rice',
    description:
      'Salmon is one of the best muscle-building proteins — omega-3s accelerate repair. Buy a 4-pack on special and freeze half.',
    imageUrl: IMG + 'garlic_butter_salmon_with_roasted_veg_rice.png',
    blurhash: 'LKJ*0D~VtmxuM{bIWVjYE,R-Z~jY',
    cookTime: 22,
    prepTime: 6,
    servings: 2,
    calories: 740,
    ingredients: [
      { id: '1', name: 'Salmon Fillets', quantity: '2', unit: 'pieces', category: 'meat' },
      { id: '2', name: 'Butter', quantity: '20', unit: 'g', category: 'dairy' },
      { id: '3', name: 'Garlic', quantity: '2', unit: 'cloves', category: 'produce' },
      { id: '4', name: 'Jasmine Rice', quantity: '1', unit: 'cup', category: 'pantry' },
      { id: '5', name: 'Mixed Vegetables', quantity: '2', unit: 'cups', category: 'produce' },
    ],
    instructions: [
      'Preheat oven to 200C and roast oiled, seasoned veg for 18 min',
      'Melt butter in an oven-safe pan, add garlic 1 min',
      'Add salmon skin-down and cook 4 min',
      'Flip, spoon over soy-honey glaze, finish in the oven 4–5 min',
      'Warm rice and serve salmon over rice with the veg and lemon',
    ],
    tags: ['High Protein', 'Dinner', 'Omega-3 Rich'],
  },
  R10: {
    name: 'Steak Stir-Fry with Hokkien Noodles',
    description:
      'A fast stir-fry that feels like takeaway at a quarter of the price. Thin-sliced beef cooks in 90 seconds.',
    imageUrl: IMG + 'steak_stir_fry_with_hokkien_noodles.png',
    blurhash: 'LRKAm5?b-;xu~ptRR*a|%~ogIUj@',
    cookTime: 18,
    prepTime: 10,
    servings: 2,
    calories: 760,
    ingredients: [
      { id: '1', name: 'Beef Rump Steak', quantity: '300', unit: 'g', category: 'meat' },
      { id: '2', name: 'Hokkien Noodles', quantity: '400', unit: 'g', category: 'pantry' },
      { id: '3', name: 'Mixed Asian Greens', quantity: '2', unit: 'cups', category: 'produce' },
      { id: '4', name: 'Soy Sauce', quantity: '2', unit: 'tbsp', category: 'pantry' },
      { id: '5', name: 'Oyster Sauce', quantity: '1', unit: 'tbsp', category: 'pantry' },
    ],
    instructions: [
      'Mix soy, oyster sauce, sesame oil and honey for the sauce',
      'Soak hokkien noodles in boiling water 2 min, then drain',
      'Heat a wok on high; sear thin-sliced beef 90 sec, remove',
      'Stir-fry garlic, ginger and greens 2 min',
      'Add noodles and sauce, toss, then return the beef',
    ],
    tags: ['High Protein', 'Dinner', 'Quick'],
  },
  R11: {
    name: 'Thai Red Curry Chicken with Jasmine Rice',
    description:
      'A $2.50 jar of red curry paste does the heavy lifting. Double the batch — it freezes brilliantly for next night.',
    imageUrl: IMG + 'thai_red_curry_chicken_with_jasmine_rice.png',
    blurhash: 'LIKwUi?HtS-;~AD*D*jYD*I;niMx',
    cookTime: 28,
    prepTime: 6,
    servings: 2,
    calories: 750,
    ingredients: [
      { id: '1', name: 'Chicken Thigh Fillets', quantity: '500', unit: 'g', category: 'meat' },
      { id: '2', name: 'Red Curry Paste', quantity: '2', unit: 'tbsp', category: 'pantry' },
      { id: '3', name: 'Coconut Milk', quantity: '400', unit: 'ml', category: 'pantry' },
      { id: '4', name: 'Jasmine Rice', quantity: '1', unit: 'cup', category: 'pantry' },
      { id: '5', name: 'Frozen Peas', quantity: '1', unit: 'cup', category: 'frozen' },
    ],
    instructions: [
      'Fry curry paste in a little oil 1–2 min until fragrant',
      'Add chicken and toss to coat, cook 3 min',
      'Pour in coconut cream and milk with lime leaves, fish sauce and sugar',
      'Simmer uncovered 20 min until glossy',
      'Add peas for the last 2 min and serve over rice',
    ],
    tags: ['High Protein', 'Dinner', 'Freezer-Friendly'],
  },
  R12: {
    name: 'Tuna & Spinach Pasta Bake',
    description:
      'A baked pasta that is high-protein and extremely budget-friendly. Uses tinned tuna and a creamy spinach sauce. Crowd-pleaser.',
    imageUrl: IMG + 'tuna_spinach_pasta_bake.png',
    blurhash: 'LPI4nZ_Nx^%M?GRkNGj@5s$%s+Rj',
    cookTime: 28,
    prepTime: 8,
    servings: 2,
    calories: 720,
    ingredients: [
      { id: '1', name: 'Canned Tuna', quantity: '2', unit: 'can', category: 'pantry' },
      { id: '2', name: 'Pasta', quantity: '200', unit: 'g', category: 'pantry' },
      { id: '3', name: 'Thickened Cream', quantity: '150', unit: 'ml', category: 'dairy' },
      { id: '4', name: 'Tasty Cheddar', quantity: '0.5', unit: 'cup', category: 'dairy' },
      { id: '5', name: 'Baby Spinach', quantity: '2', unit: 'cups', category: 'produce' },
    ],
    instructions: [
      'Preheat oven to 200C and boil pasta until just under al dente',
      'Fry garlic 1 min, wilt spinach 1 min',
      'Add cream, garlic powder, parsley and seasoning',
      'Stir through drained tuna and pasta',
      'Top with cheddar and parmesan, bake 10–12 min until golden',
    ],
    tags: ['High Protein', 'Dinner', 'Budget'],
  },
  R13: {
    name: 'Egg Fried Rice with Edamame & Corn',
    description:
      'The fastest high-protein dinner you can make. Day-old rice is essential — it’s the budget rescue meal that uses what you have.',
    imageUrl: IMG + 'egg_fried_rice_with_edamame_corn.png',
    blurhash: 'LCHLC:00u6$y%h-;IAWV0VMwm*NL',
    cookTime: 15,
    prepTime: 5,
    servings: 2,
    calories: 640,
    ingredients: [
      { id: '1', name: 'Day-Old Cooked Rice', quantity: '2', unit: 'cups', category: 'pantry' },
      { id: '2', name: 'Eggs', quantity: '4', unit: 'whole', category: 'dairy' },
      { id: '3', name: 'Frozen Edamame', quantity: '1', unit: 'cup', category: 'frozen' },
      { id: '4', name: 'Frozen Corn', quantity: '0.5', unit: 'cup', category: 'frozen' },
      { id: '5', name: 'Soy Sauce', quantity: '2', unit: 'tbsp', category: 'pantry' },
      { id: '6', name: 'Spring Onion', quantity: '3', unit: 'whole', category: 'produce' },
    ],
    instructions: [
      'Stir-fry garlic and white spring onion 30 sec on high',
      'Push aside, scramble the eggs',
      'Add cold rice and toss 3–4 min until grains separate',
      'Add edamame and corn, toss 2 min',
      'Season with soy and sesame oil, finish with spring onion',
    ],
    tags: ['High Protein', 'Dinner', 'Quick', 'Budget'],
  },
  R14: {
    name: 'Protein Pancakes with Berries & Greek Yoghurt',
    description:
      'Banana-oat pancakes with protein powder. A weekend special that tastes indulgent but hits ~44g protein per serve.',
    imageUrl: IMG + 'protein_pancakes_with_berries_greek_yoghurt.png',
    blurhash: 'LNLq5_9ZpJ-n_Nxtaxt8pexDi^I@',
    cookTime: 12,
    prepTime: 8,
    servings: 2,
    calories: 650,
    ingredients: [
      { id: '1', name: 'Banana', quantity: '2', unit: 'whole', category: 'produce' },
      { id: '2', name: 'Eggs', quantity: '4', unit: 'whole', category: 'dairy' },
      { id: '3', name: 'Rolled Oats', quantity: '0.5', unit: 'cup', category: 'pantry' },
      { id: '4', name: 'Protein Powder', quantity: '2', unit: 'scoops', category: 'pantry' },
      { id: '5', name: 'Greek Yogurt', quantity: '0.75', unit: 'cup', category: 'dairy' },
      { id: '6', name: 'Mixed Berries', quantity: '0.5', unit: 'cup', category: 'produce' },
    ],
    instructions: [
      'Blend oats to a rough flour and mash the bananas',
      'Mix all batter ingredients until smooth',
      'Cook small rounds 2–3 min until bubbles form, then flip 1–2 min',
      'Serve stacked with Greek yogurt, berries and honey',
    ],
    tags: ['High Protein', 'Breakfast', 'Weekend'],
  },
  R15: {
    name: 'Sheet Pan Chicken Thighs with Sweet Potato & Feta',
    description:
      'The laziest high-protein dinner in the plan. Everything on one tray, into the oven — you do nothing for 25 minutes.',
    imageUrl: IMG + 'sheet_pan_chicken_thighs_with_sweet_potato_feta.png',
    blurhash: 'L8IEqk?aGJt600009FxUys9aH?wZ',
    cookTime: 30,
    prepTime: 5,
    servings: 2,
    calories: 700,
    ingredients: [
      { id: '1', name: 'Chicken Thigh Fillets', quantity: '500', unit: 'g', category: 'meat' },
      { id: '2', name: 'Sweet Potato', quantity: '1', unit: 'whole', category: 'produce' },
      { id: '3', name: 'Red Capsicum', quantity: '1', unit: 'whole', category: 'produce' },
      { id: '4', name: 'Red Onion', quantity: '1', unit: 'whole', category: 'produce' },
      { id: '5', name: 'Feta', quantity: '100', unit: 'g', category: 'dairy' },
    ],
    instructions: [
      'Preheat oven to 200C and line a large tray',
      'Toss sweet potato, capsicum and onion with oil, paprika and garlic powder',
      'Coat chicken with oil and oregano, place on top of the veg',
      'Roast 25–28 min until golden and tender',
      'Scatter feta for the last 5 min; serve over spinach with lemon',
    ],
    tags: ['High Protein', 'Dinner', 'One Pan'],
  },
  R16: {
    name: 'Korean Ground Beef Rice Bowl',
    description:
      'Gochujang + soy + sesame on ground beef over rice. Addictively good, 20 minutes, one pan — the month’s finale.',
    imageUrl: IMG + 'korean_ground_beef_rice_bowl_bulgogi_style.png',
    blurhash: 'LCJ7XK~C_3XR}?D*jGg10}t64o%1',
    cookTime: 18,
    prepTime: 5,
    servings: 2,
    calories: 750,
    ingredients: [
      { id: '1', name: 'Lean Beef Mince', quantity: '500', unit: 'g', category: 'meat' },
      { id: '2', name: 'Jasmine Rice', quantity: '1.5', unit: 'cups', category: 'pantry' },
      { id: '3', name: 'Soy Sauce', quantity: '1', unit: 'tbsp', category: 'pantry' },
      { id: '4', name: 'Gochujang', quantity: '1', unit: 'tsp', category: 'pantry' },
      { id: '5', name: 'Spring Onion', quantity: '3', unit: 'whole', category: 'produce' },
      { id: '6', name: 'Eggs', quantity: '2', unit: 'whole', category: 'dairy' },
    ],
    instructions: [
      'Mix soy, oyster sauce, sesame oil, sugar and gochujang for the sauce',
      'Cook garlic 30 sec, add mince and brown well 5–6 min',
      'Pour the sauce over and toss 2 min until glossy',
      'Warm rice and divide into bowls, spoon over the beef',
      'Top with spring onion, sesame seeds and a fried egg',
    ],
    tags: ['High Protein', 'Dinner', 'Quick'],
  },
};

// Display-only stand-in for a "Grab & go" breakfast. When the user picks
// grab-and-go we do NOT assign a breakfast recipe at all — the calendar slot
// is left recipe-less and simply labelled. This object exists purely so the
// preview/browser have something to render; apply() never adds it to the
// library (it branches on placeholderLabel).
const GRAB_GO_BREAKFAST: CuratedRecipe = {
  name: 'Grab & go',
  description:
    'No cooking — grab a quick high-protein option on your way out: Greek yogurt, a protein shake, fruit and nuts, or a protein bar.',
  imageUrl: IMG + 'overnight_oats.png',
  cookTime: 0,
  prepTime: 0,
  servings: 2,
  calories: 0,
  ingredients: [],
  instructions: [],
  tags: ['Grab & Go', 'No Cook'],
};

// No-cook placeholder for "Buy out" lunches — a labelled, recipe-less slot.
const BUY_OUT_LUNCH: CuratedRecipe = {
  name: 'Buy out',
  description:
    'No cooking — pick up lunch out. Aim for a lean protein + veg option to stay on track.',
  imageUrl: IMG + 'overnight_oats.png',
  cookTime: 0,
  prepTime: 0,
  servings: 2,
  calories: 0,
  ingredients: [],
  instructions: [],
  tags: ['Buy Out', 'No Cook'],
};

// No-cook placeholder for "Buy out" dinners — a labelled, recipe-less slot.
const BUY_OUT_DINNER: CuratedRecipe = {
  name: 'Buy out',
  description: 'No cooking tonight — buy dinner out or order in. No groceries needed for this slot.',
  imageUrl: IMG + 'overnight_oats.png',
  cookTime: 0,
  prepTime: 0,
  servings: 2,
  calories: 0,
  ingredients: [],
  instructions: [],
  tags: ['Buy Out', 'No Cook'],
};

// ── Recipe pools the scheduler draws from, by meal slot ──
// Indexed by (dayOffset % 7) so the week repeats cleanly.
// "Cook" breakfast is split by weekday: hot/cooked recipes are only suggested
// on weekends (when there's time to cook); weekdays fall back to no-cook,
// grab-from-the-fridge breakfasts (overnight oats / protein smoothie).
const BREAKFAST_WEEKEND_COOK = ['R2', 'R14']; // Scrambled Eggs, Protein Pancakes (hot)
const BREAKFAST_WEEKDAY_EASY = ['R1', 'R3']; //  Overnight Oats, Protein Smoothie (no-cook)
const LUNCH_COOK = ['R4', 'R5', 'R6', 'R4', 'R5', 'R6', 'R4']; // fresh lunches
const DINNERS_FRESH = ['R7', 'R8', 'R9', 'R11', 'R10', 'R15', 'R16']; // 7 distinct dinners

// Cookable mains the batch scheduler draws from (dinners + the heartier
// lunch-capable mains). Drawn with a moving pointer that never resets within a
// build, so recipes rotate across cook days AND across weeks — the same dish
// only comes back after the whole pool has been used.
const BATCH_MAINS = [
  'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R15', 'R16', 'R4', 'R5', 'R6',
];

// Distinct recipes available to batch-cook — the natural ceiling for
// "recipes each cook day" (you can't cook more unique dishes than exist).
export const MAX_BATCH_RECIPES = BATCH_MAINS.length;

// ── Batch blocks ──
// A "cook day" is the first day of a block; you eat what you cook that day
// (fresh) and the leftovers carry forward until the NEXT cook day. Day 0 is
// always a cook day (you have to cook on day one), then each chosen weekday.
// The final block runs to the end of the plan.
export interface BatchBlock {
  cookOffset: number; // dayOffset of the cook day (0-based)
  cookWeekday: number; // JS weekday of that cook day (0 = Sun)
  days: number; // how many days this batch must feed (incl. the cook day)
}

export function computeBatchBlocks(
  durationDays: number,
  startWeekday: number,
  cookDays: number[],
): BatchBlock[] {
  const days = Math.max(1, Math.floor(durationDays));
  const sw = (((Math.floor(startWeekday) % 7) + 7) % 7) as number;
  const chosen = cookDays && cookDays.length ? cookDays : DEFAULT_BATCH_CONFIG.cookDays;

  // Day 0 is always a cook day; add every chosen weekday that falls in range.
  const offsets = new Set<number>([0]);
  for (let d = 0; d < days; d++) {
    if (chosen.includes((sw + d) % 7)) offsets.add(d);
  }
  const sorted = [...offsets].sort((a, b) => a - b);
  return sorted.map((off, i) => ({
    cookOffset: off,
    cookWeekday: (sw + off) % 7,
    days: (sorted[i + 1] ?? days) - off,
  }));
}

type SlotPlan = { ref: string; leftover: boolean };

// Turn a "cooked" recipe into a lightweight leftover variant so it dedupes
// separately from the original and reads honestly in the schedule.
//
// ingredients: [] — a leftover reheats already-cooked food, so the variant
// carries zero ingredients of its own. The original cook already paid for
// every gram on the grocery list. This safety net lets us link the slot to
// a real recipe (so users see image + description + reheat steps) without
// ever double-counting in generateGroceryList.
function leftoverRecipe(ref: string, mealType: 'lunch' | 'dinner'): CuratedRecipe {
  const base = RECIPES[ref];
  return {
    ...base,
    name: `Leftover ${base.name}`,
    description: `Reheat last night’s ${base.name.toLowerCase()} — zero-effort ${mealType}, all the protein.`,
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
      recipe: leftoverRecipe(slot.ref, mealType as 'lunch' | 'dinner'),
    };
  }
  return { dayOffset, mealType, recipe: RECIPES[slot.ref] };
}

// Breakfast slot builder — shared by both scheduling paths.
//   skip → no slot at all (returns null; nothing lands on the calendar)
//   grab → labelled "Grab & go" placeholder (no recipe)
//   cook → a hot cooked breakfast, but ONLY on weekends. On weekdays (Mon–Fri)
//          we never suggest cooking breakfast — a no-cook easy breakfast
//          (overnight oats / protein smoothie) is used instead.
// `weekday` is 0 = Sun … 6 = Sat.
function breakfastMeal(
  dayOffset: number,
  pref: BreakfastPref,
  weekday: number,
): ScheduledMeal | null {
  if (pref === 'skip') return null;
  if (pref === 'grab') {
    return {
      dayOffset,
      mealType: 'breakfast',
      recipe: GRAB_GO_BREAKFAST,
      placeholderLabel: 'Grab & go',
    };
  }
  const isWeekend = weekday === 0 || weekday === 6;
  const ref = isWeekend
    ? BREAKFAST_WEEKEND_COOK[dayOffset % BREAKFAST_WEEKEND_COOK.length]
    : BREAKFAST_WEEKDAY_EASY[dayOffset % BREAKFAST_WEEKDAY_EASY.length];
  return toMeal(dayOffset, 'breakfast', { ref, leftover: false });
}

// Labelled no-cook placeholder slot (Buy out).
function placeholderMeal(
  dayOffset: number,
  mealType: 'lunch' | 'dinner',
  recipe: CuratedRecipe,
  label: string,
): ScheduledMeal {
  return { dayOffset, mealType, recipe, placeholderLabel: label };
}

/**
 * Build the expanded meal list for the High-Protein Simple plan.
 *
 * The 7-day base week is repeated to fill `durationDays`, and the user's
 * cooking-style preferences swap individual slots between freshly-cooked and
 * leftover / grab-and-go variants.
 *
 * `startWeekday` (0 = Sun) lets the batch scheduler land cook days on the
 * correct calendar weekdays relative to the plan's start date.
 */
export function buildHighProteinMeals(
  durationDays: number,
  prefs: CookingPreferences = DEFAULT_COOKING_PREFS,
  startWeekday: number = 0,
): ScheduledMeal[] {
  const days = Math.max(1, Math.floor(durationDays));
  const bfast = prefs.breakfast;

  // ── Batch path ──
  // On a cook day the user batch-cooks N DISTINCT recipes. ALL of them land in
  // that day's LUNCH slot as real recipes (the meal-plan calendar holds
  // multiple recipes per slot) — and that's the ONLY place each recipe's
  // ingredients are counted for the grocery list. Every other main slot in the
  // block (the cook day's dinner + the following days' lunch & dinner) is a
  // "Leftover <dish>" placeholder: name only, no ingredients, so nothing is
  // double-counted. Cooking happens at LUNCH (the day's first main), so the
  // cook day's own dinner leftover — and everything after — is always reheating
  // food that's already been cooked: the opening day never shows a leftover for
  // a dish that hasn't been made yet. The leftover rotation hands out
  // consecutive dishes, so a following day's lunch and dinner are always
  // different recipes (for N ≥ 2). N is uncapped except by the distinct recipes
  // that exist; the running `poolIdx` rotates dishes across cook days and weeks.
  if (prefs.style === 'batch') {
    const cfg = prefs.batch ?? DEFAULT_BATCH_CONFIG;
    const recipesN = Math.max(1, Math.min(Math.floor(cfg.recipesPerCookDay || 1), BATCH_MAINS.length));
    const blocks = computeBatchBlocks(days, startWeekday, cfg.cookDays);

    const meals: ScheduledMeal[] = [];
    let poolIdx = 0; // never resets within a build → cross-week rotation

    for (const block of blocks) {
      const blockDays = Math.min(block.days, days - block.cookOffset);
      if (blockDays <= 0) continue;

      // The distinct dishes cooked on this block's cook day.
      const dishes: string[] = [];
      for (let x = 0; x < recipesN; x++) {
        dishes.push(BATCH_MAINS[poolIdx % BATCH_MAINS.length]);
        poolIdx++;
      }

      let leftIdx = 0; // rotates the leftover label through the cooked dishes
      const nextLeftover = (): string => {
        const ref = dishes[leftIdx % dishes.length];
        leftIdx++;
        return ref;
      };

      // Leftover slots in the SAME order nextLeftover() is called below (the
      // cook day's dinner, then each following day's lunch then dinner), so we
      // can pre-count how many leftovers fall to each dish. A dish's cook then
      // feeds 1 fresh lunch + that many leftovers → scales its serving size.
      const leftoverSlotCount = 1 + Math.max(0, blockDays - 1) * 2;
      const leftoversByDish: Record<string, number> = {};
      for (let i = 0; i < leftoverSlotCount; i++) {
        const ref = dishes[i % dishes.length];
        leftoversByDish[ref] = (leftoversByDish[ref] ?? 0) + 1;
      }

      for (let k = 0; k < blockDays; k++) {
        const d = block.cookOffset + k;

        // Breakfast (skip / cook / grab) every day.
        const b = breakfastMeal(d, bfast, (startWeekday + d) % 7);
        if (b) meals.push(b);

        if (k === 0) {
          // ── Cook day ──
          // The LUNCH slot holds ALL the dishes cooked today (real recipes —
          // each counted exactly once for the grocery list). Dinner is a
          // leftover (made earlier today at lunch), so it never re-counts
          // ingredients and never precedes its own cook.
          for (const dish of dishes) {
            const lunch = toMeal(d, 'lunch', { ref: dish, leftover: false });
            // Fresh at lunch + every leftover that reheats it → scales servings.
            lunch.mealsCovered = 1 + (leftoversByDish[dish] ?? 0);
            meals.push(lunch);
          }
          meals.push(toMeal(d, 'dinner', { ref: nextLeftover(), leftover: true }));
        } else {
          // ── Following days ── only leftovers (name-only placeholders). Lunch
          // and dinner take consecutive dishes, so they're always different.
          meals.push(toMeal(d, 'lunch', { ref: nextLeftover(), leftover: true }));
          meals.push(toMeal(d, 'dinner', { ref: nextLeftover(), leftover: true }));
        }
      }
    }

    return meals;
  }

  // ── Daily path ──
  // Each meal slot honours its own habit, distinctly:
  //   Dinner — leftovers (cook some nights, reheat between) / cook (fresh nightly) / buy (buy-out)
  //   Lunch  — leftovers (reuse last cooked dinner) / cook (fresh) / buy (buy-out)
  //   Breakfast — handled by breakfastMeal (skip / cook / grab)

  // 1) Resolve dinners first — lunches may reuse the previous day's cooked dinner.
  //    `null` marks a buy-out night (no cooked recipe).
  const dinners: (SlotPlan | null)[] = [];
  let dinnerCookIdx = 0; // advances only on cook nights → distinct dinners
  for (let d = 0; d < days; d++) {
    const w = d % 7;
    if (prefs.dinner === 'buy') {
      dinners.push(null);
    } else if (prefs.dinner === 'leftovers') {
      // Batch rhythm: cook a fresh dinner every other night, reheat in between.
      if (d % 2 === 0) {
        dinners.push({ ref: DINNERS_FRESH[dinnerCookIdx % DINNERS_FRESH.length], leftover: false });
        dinnerCookIdx++;
      } else {
        const prev = dinners[d - 1];
        dinners.push(
          prev
            ? { ref: prev.ref, leftover: true }
            : { ref: DINNERS_FRESH[dinnerCookIdx % DINNERS_FRESH.length], leftover: false },
        );
      }
    } else {
      dinners.push({ ref: DINNERS_FRESH[w], leftover: false });
    }
  }

  const meals: ScheduledMeal[] = [];
  for (let d = 0; d < days; d++) {
    const w = d % 7;

    // Breakfast (may be skipped → no slot).
    const b = breakfastMeal(d, bfast, (startWeekday + d) % 7);
    if (b) meals.push(b);

    // Lunch.
    if (prefs.lunch === 'buy') {
      meals.push(placeholderMeal(d, 'lunch', BUY_OUT_LUNCH, 'Buy out'));
    } else if (prefs.lunch === 'leftovers' && d > 0 && dinners[d - 1]) {
      // Reheat the previous night's cooked dinner. Falls through to a fresh
      // lunch on day 1 or after a buy-out night (nothing to reheat).
      meals.push(toMeal(d, 'lunch', { ref: dinners[d - 1]!.ref, leftover: true }));
    } else {
      meals.push(toMeal(d, 'lunch', { ref: LUNCH_COOK[w], leftover: false }));
    }

    // Dinner.
    const dn = dinners[d];
    if (dn) {
      meals.push(toMeal(d, 'dinner', dn));
    } else {
      meals.push(placeholderMeal(d, 'dinner', BUY_OUT_DINNER, 'Buy out'));
    }
  }

  return meals;
}
