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
