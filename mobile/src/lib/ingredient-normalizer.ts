/**
 * Ingredient Normalizer
 * Handles name normalization, descriptor stripping, and unit type classification
 * Before any aggregation, this pipeline ensures consistent ingredient identification
 */

import { getAverageWeightWithConfidence } from './average-weight-lookup-au';

/**
 * Descriptors to strip from ingredient names
 * These are metadata that don't affect aggregation
 */
const DESCRIPTORS_TO_STRIP = [
  'raw', 'cooked', 'fresh', 'dried', 'frozen', 'canned', 'day-old',
  'boneless', 'skinless', 'ground', 'chopped', 'sliced', 'diced',
  'minced', 'crushed', 'grated', 'shredded', 'melted',
  'sifted', 'beaten', 'whipped', 'blended', 'pureed',
  'unsalted', 'salted', 'whole', 'half', 'organic',
  'medium', 'large', 'small', 'extra large',
  'ripe', 'unripe', 'firm', 'soft',
];

/**
 * Unit type classifications
 */
export type UnitType = 'WEIGHT' | 'VOLUME' | 'COUNT';

/**
 * Average weight per piece for common count-based ingredients
 * DEPRECATED: Use AVERAGE_WEIGHT_LOOKUP_AU from average-weight-lookup-au.ts instead
 * This simplified version is kept for backward compatibility only
 */
export const INGREDIENT_AVERAGE_WEIGHTS_LEGACY: Record<string, number> = {
  // This is now superseded by AVERAGE_WEIGHT_LOOKUP_AU with confidence levels
  // Kept here only to prevent breaking existing code that imports it
};

/**
 * Strip descriptors from ingredient name
 * Returns the canonical ingredient name
 * Example: "fresh boneless chicken breast" → "chicken"
 */
export function stripDescriptors(ingredientName: string): string {
  let normalized = ingredientName.toLowerCase().trim();

  // Remove descriptors from the end and beginning
  DESCRIPTORS_TO_STRIP.forEach(descriptor => {
    const regex = new RegExp(`\\b${descriptor}\\b`, 'gi');
    normalized = normalized.replace(regex, '');
  });

  // Clean up extra whitespace and commas
  normalized = normalized
    .replace(/,\s*/g, ' ') // Remove commas
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();

  return normalized;
}

/**
 * Normalize an ingredient name to its canonical form
 * Handles common variations and aliases
 */
export function normalizeIngredientName(ingredientName: string): string {
  const stripped = stripDescriptors(ingredientName);
  const lower = stripped.toLowerCase().trim();

  // Handle common aliases and variations
  const aliasMap: Record<string, string> = {
    'chicken breast': 'chicken',
    'beef steak': 'beef',
    'pork chop': 'pork',
    'fish fillet': 'fish',
    'canned tomato': 'tomato',
    'canned tomatoes': 'tomato',
    'diced tomato': 'tomato',
    'diced tomatoes': 'tomato',
    'cherry tomato': 'tomato',
    'cherry tomatoes': 'tomato',
    'tomatoes': 'tomato',
    'bell pepper': 'pepper',
    'bell peppers': 'pepper',
    'sweet pepper': 'pepper',
    'sweet peppers': 'pepper',
    'chili pepper': 'pepper',
    'chili peppers': 'pepper',
    'chilli': 'chilli',
    'chillies': 'chilli',
    'chili': 'chili',
    'chilies': 'chili',
    'green chili': 'chili',
    'green chilies': 'chili',
    'green chilly': 'chili',
    'green chillies': 'chili',
    'red chili': 'chili',
    'red chilies': 'chili',
    'peppers': 'pepper',
    'olive oil': 'oil',
    'vegetable oil': 'oil',
    'coconut oil': 'oil',
    'sesame oil': 'oil',
    'canola oil': 'oil',
    'chicken stock': 'broth',
    'beef stock': 'broth',
    'vegetable stock': 'broth',
    'chicken broth': 'broth',
    'beef broth': 'broth',
    'vegetable broth': 'broth',
    'cheddar cheese': 'cheese',
    'mozzarella cheese': 'cheese',
    'parmesan cheese': 'cheese',
    'feta cheese': 'cheese',
    'greek yogurt': 'yogurt',
    'white pepper': 'pepper',
    'black pepper': 'pepper',
    'sea salt': 'salt',
    'table salt': 'salt',
    'garlic clove': 'garlic',
    'garlic cloves': 'garlic',
    'medium onion': 'onion',
    'medium brown onion': 'onion',
    'medium red onion': 'red onion',
    'red onion': 'red onion',
    'onions': 'onion',
    'garlic': 'garlic',
    'garlics': 'garlic',
    // Egg variations - combine all egg types
    'hard boiled egg': 'egg',
    'hard boiled eggs': 'egg',
    'hard-boiled egg': 'egg',
    'hard-boiled eggs': 'egg',
    'boiled egg': 'egg',
    'boiled eggs': 'egg',
    'soft boiled egg': 'egg',
    'soft boiled eggs': 'egg',
    'soft-boiled egg': 'egg',
    'soft-boiled eggs': 'egg',
    'poached egg': 'egg',
    'poached eggs': 'egg',
    'fried egg': 'egg',
    'fried eggs': 'egg',
    'scrambled egg': 'egg',
    'scrambled eggs': 'egg',
    'eggs': 'egg',
  };

  return aliasMap[lower] || lower;
}

/**
 * Classify a unit into its type (WEIGHT, VOLUME, COUNT)
 */
export function classifyUnitType(unit: string): UnitType {
  const normalizedUnit = unit.toLowerCase().trim();

  // Metric weight units
  if (['g', 'kg'].includes(normalizedUnit)) {
    return 'WEIGHT';
  }

  // Volume units (includes both metric mL/L and cups for solids)
  if (['ml', 'l', 'cup', 'cups'].includes(normalizedUnit)) {
    return 'VOLUME';
  }

  // Count units
  const countUnits = [
    'piece', 'pieces', 'whole', 'head', 'heads', 'can', 'cans',
    'jar', 'jars', 'bottle', 'bottles', 'slice', 'slices', 'strip',
    'strips', 'stalk', 'stalks', 'clove', 'cloves', 'bulb', 'bulbs',
    'bunch', 'bunches', 'handful', 'handfuls', 'pinch', 'pinches',
  ];

  if (countUnits.includes(normalizedUnit)) {
    return 'COUNT';
  }

  // Default to WEIGHT
  return 'WEIGHT';
}

/**
 * Get average weight for a count-based ingredient
 * Returns weight in grams, or null if no mapping exists
 * Now uses AVERAGE_WEIGHT_LOOKUP_AU with confidence levels
 */
export function getAverageWeightPerPiece(ingredientName: string): number | null {
  const normalized = normalizeIngredientName(ingredientName);
  const lookup = getAverageWeightWithConfidence(normalized);
  return lookup?.weightG ?? null;
}

/**
 * Normalized ingredient representation for aggregation
 */
export interface NormalizedIngredient {
  canonicalName: string; // e.g., "chicken", "salt", "onion"
  originalName: string; // e.g., "fresh chicken breast"
  quantity: number; // in base unit
  baseUnit: string; // 'g', 'ml', or 'piece'
  unitType: UnitType; // WEIGHT, VOLUME, or COUNT
  category: 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other';
}

/**
 * Normalize an ingredient for aggregation purposes
 * This function is a bridge between validated ingredients and aggregation
 */
export function normalizeIngredientForAggregation(ingredient: {
  name: string;
  quantity: number;
  baseUnit: string;
  category: 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other';
}): NormalizedIngredient {
  const canonicalName = normalizeIngredientName(ingredient.name);
  const unitType = classifyUnitType(ingredient.baseUnit);

  return {
    canonicalName,
    originalName: ingredient.name,
    quantity: ingredient.quantity,
    baseUnit: ingredient.baseUnit,
    unitType,
    category: ingredient.category,
  };
}
