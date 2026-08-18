// Recipe meal-type taxonomy — the single source of truth shared by:
//   • the Recipes-tab filter chips (src/app/(tabs)/recipes.tsx)
//   • the guided TagPicker (src/components/TagPicker.tsx)
//   • the "Get Inspired" classification (mirrors src/app/(tabs)/inspired.tsx)
//
// Each category has:
//   • tag   — the canonical tag written when the category is chosen in the picker
//   • match — every lowercased tag value that should COUNT toward this category
//             (tolerates spelling variants + the combined "lunch/dinner" bucket)

export interface RecipeCategory {
  key: string;
  label: string;
  /** Canonical tag stored when this category is selected in the TagPicker. */
  tag: string;
  /** Lowercased tag values that count toward this category in filters. */
  match: string[];
}

export const MEAL_TYPE_CATEGORIES: RecipeCategory[] = [
  { key: 'breakfast', label: 'Breakfast', tag: 'breakfast', match: ['breakfast', 'brunch'] },
  {
    key: 'lunch-dinner',
    label: 'Lunch/Dinner',
    tag: 'dinner',
    match: ['lunch/dinner', 'lunch', 'dinner', 'main', 'main course'],
  },
  { key: 'snack', label: 'Snack', tag: 'snack', match: ['snack', 'snacks'] },
  { key: 'appetiser', label: 'Appetiser', tag: 'appetiser', match: ['appetiser', 'appetizer', 'starter'] },
  { key: 'side', label: 'Side Dish', tag: 'side dish', match: ['side dish', 'side', 'sides'] },
  { key: 'dessert', label: 'Dessert', tag: 'dessert', match: ['dessert', 'desserts', 'sweet'] },
  {
    key: 'drink',
    label: 'Drink',
    tag: 'drink',
    match: ['drink', 'drinks', 'beverage', 'beverages', 'cocktail', 'smoothie'],
  },
];

/** Filter chip list for the Recipes tab — "All" plus every meal-type category. */
export const FILTER_CATEGORIES: { key: string; label: string; match: string[] }[] = [
  { key: 'all', label: 'All', match: [] },
  ...MEAL_TYPE_CATEGORIES.map(({ key, label, match }) => ({ key, label, match })),
];

/** Every meal-type match keyword — used to tell meal-type tags from custom tags. */
export const MEAL_TYPE_MATCH_SET = new Set(
  MEAL_TYPE_CATEGORIES.flatMap((c) => c.match),
);

/** The category a given tag belongs to, if any (case-insensitive). */
export function categoryForTag(tag: string): RecipeCategory | undefined {
  const t = tag.toLowerCase();
  return MEAL_TYPE_CATEGORIES.find((c) => c.match.includes(t));
}

/** True when `tag` is a meal-type tag (vs. a free-form descriptive tag). */
export function isMealTypeTag(tag: string): boolean {
  return MEAL_TYPE_MATCH_SET.has(tag.toLowerCase());
}

/** The three meal-TIME categories a plan cares about (breakfast / a main / snack). */
export type MealCategory = 'breakfast' | 'lunch-dinner' | 'snack';

/**
 * The meal category a recipe belongs to, read from its `tags` through the
 * shared taxonomy — so it tolerates every format variant ('Lunch/Dinner',
 * 'lunch', 'dinner', 'main', …), not just a hardcoded lowercase word.
 *
 * MAINS WIN: a recipe that (from stale/polluted tags) carries both a main tag
 * and a breakfast/snack tag classifies as 'lunch-dinner', so a dinner dish is
 * never mis-slotted to breakfast. Non-meal-time categories (appetiser, side,
 * dessert, drink) and untagged recipes return null.
 */
export function mealCategoryOf(recipe: { tags?: string[] | null }): MealCategory | null {
  let hasBreakfast = false;
  let hasSnack = false;
  for (const tag of recipe.tags ?? []) {
    const key = categoryForTag(tag)?.key;
    if (key === 'lunch-dinner') return 'lunch-dinner';
    if (key === 'breakfast') hasBreakfast = true;
    else if (key === 'snack') hasSnack = true;
  }
  if (hasBreakfast) return 'breakfast';
  if (hasSnack) return 'snack';
  return null;
}

/**
 * The canonical tag to WRITE for a given meal type, so every writer emits one
 * agreed format. Maps any variant to the taxonomy's canonical tag
 * (lunch|dinner|'Lunch/Dinner'|main → 'dinner'; breakfast → 'breakfast'; …).
 */
export function canonicalMealTag(mealType: string): string {
  return categoryForTag(mealType)?.tag ?? mealType.toLowerCase();
}

/**
 * How a recipe fits a meal-plan slot, from its tags:
 *   'main'      — a lunch/dinner dish (cookable in any main slot)
 *   'breakfast' — a breakfast dish
 *   'other'     — an explicit NON-main category (snack, drink, dessert, side,
 *                 appetiser) that has NO cooked plan slot → must not be placed
 *   'untagged'  — no meal-type tag at all (safe to treat as a main by default)
 *
 * Distinguishing 'other' from 'untagged' is what stops a drink/dessert from
 * being dropped into a dinner slot. Mains win over breakfast/other.
 */
export type MealSlotKind = 'main' | 'breakfast' | 'other' | 'untagged';

export function mealSlotKindOf(recipe: { tags?: string[] | null }): MealSlotKind {
  let hasBreakfast = false;
  let hasOther = false;
  for (const tag of recipe.tags ?? []) {
    const key = categoryForTag(tag)?.key;
    if (!key) continue;
    if (key === 'lunch-dinner') return 'main';
    if (key === 'breakfast') hasBreakfast = true;
    else hasOther = true; // snack / drink / dessert / side / appetiser
  }
  if (hasBreakfast) return 'breakfast';
  if (hasOther) return 'other';
  return 'untagged';
}
