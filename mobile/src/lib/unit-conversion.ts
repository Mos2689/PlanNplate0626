/**
 * Unit conversion utilities for ingredient aggregation
 * Converts all units to base units for storage and combining
 *
 * KEY DISTINCTION for volume ingredients:
 * - LIQUID ingredients (water, oil, milk) → convert cups to mL
 * - SOLID/GRAIN ingredients (rice, flour, oats) → keep cups as cups
 */

import { normalizeUnit } from './ingredient-aliases';
import {
  getCanonicalGroceryUnit,
  convertToCanonicalGroceryBase,
} from './ingredient-unit-rules';
import { getAverageWeightWithConfidence } from './average-weight-lookup-au';

// Adapter: canonical resolver needs an avg-weight-in-grams lookup for
// count↔weight conversions. Returns null when no AU data exists.
const avgWeightG = (name: string): number | null =>
  getAverageWeightWithConfidence(name)?.weightG ?? null;

/**
 * Base units by category:
 * - Volume-Liquid: millilitres (ml) - for liquids like water, oil, milk
 * - Volume-Solid: cups - for grains/solids like rice, flour, oats
 * - Weight: grams (g)
 * - Count: pieces
 */

type IngredientCategory = 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other';

/**
 * Volume type classification for ingredients:
 * - 'liquid' = water, oil, milk, juice, broth → uses mL
 * - 'solid' = rice, flour, oats, grains, lentils, beans → uses cups
 */
type VolumeType = 'liquid' | 'solid';

/**
 * GRAIN/SOLID INGREDIENTS that should stay in CUPS (not convert to mL)
 * These are dry goods that are commonly measured in cups for cooking
 */
const SOLID_VOLUME_INGREDIENTS: string[] = [
  // Grains
  'rice', 'white rice', 'brown rice', 'basmati rice', 'jasmine rice', 'wild rice',
  'quinoa', 'couscous', 'bulgur', 'barley', 'farro', 'millet', 'amaranth',
  // Oats & breakfast
  'oats', 'rolled oats', 'steel cut oats', 'oatmeal', 'granola', 'cereal',
  // Flours & baking
  'flour', 'all-purpose flour', 'whole wheat flour', 'bread flour', 'cake flour',
  'almond flour', 'coconut flour', 'cornmeal', 'cornstarch',
  // Sugars
  'sugar', 'brown sugar', 'powdered sugar', 'confectioners sugar', 'caster sugar',
  // Legumes (dry)
  'lentils', 'dried lentils', 'red lentils', 'green lentils', 'black lentils',
  'beans', 'black beans', 'kidney beans', 'pinto beans', 'navy beans', 'chickpeas',
  'dried beans', 'dried chickpeas', 'split peas',
  // Pasta (dry)
  'pasta', 'dry pasta', 'macaroni', 'penne', 'spaghetti', 'noodles', 'rice noodles',
  // Nuts & seeds (when measured in cups)
  'nuts', 'almonds', 'walnuts', 'pecans', 'cashews', 'peanuts', 'pistachios',
  'seeds', 'sunflower seeds', 'pumpkin seeds', 'chia seeds', 'flax seeds',
  // Dried fruits
  'raisins', 'dried cranberries', 'dried fruit',
  // Other dry goods
  'breadcrumbs', 'panko', 'coconut', 'shredded coconut', 'chocolate chips',
  'cocoa powder', 'baking powder', 'baking soda',
  // Fresh herbs (when measured in cups for chopped herbs)
  'parsley', 'cilantro', 'basil', 'mint', 'dill', 'chives',
  'oregano', 'thyme', 'rosemary', 'sage', 'tarragon',
  // Spices (dry, measured in tsp/tbsp)
  'cumin', 'paprika', 'turmeric', 'cinnamon', 'nutmeg', 'ginger',
  'cayenne', 'chili powder', 'curry powder', 'garlic powder', 'onion powder',
  'black pepper', 'white pepper', 'salt', 'sea salt', 'kosher salt',
  'italian seasoning', 'herbs de provence', 'spice', 'spices',
  // SOLID FOODS measured by volume (NOT liquids!)
  // Olives
  'olives', 'olive', 'kalamata olives', 'kalamata olive', 'black olives', 'green olives',
  // Cheese (when measured in cups - shredded, crumbled, etc.)
  'shredded cheese', 'grated cheese', 'crumbled cheese', 'feta', 'feta cheese',
  'cottage cheese', 'ricotta', 'ricotta cheese', 'cream cheese',
  // Vegetables (when measured in cups - chopped, diced, etc.)
  'chopped vegetables', 'diced vegetables', 'mixed vegetables',
  'bell pepper', 'bell peppers', 'chopped pepper', 'diced pepper', 'pepper', 'red pepper', 'green pepper',
  'chopped onion', 'diced onion', 'sliced onion', 'onion',
  'chopped tomato', 'diced tomato', 'cherry tomatoes', 'tomato',
  'chopped carrot', 'diced carrot', 'shredded carrot', 'carrot',
  'chopped celery', 'diced celery', 'sliced celery', 'celery',
  'chopped mushroom', 'mushrooms', 'sliced mushrooms', 'mushroom',
  'corn', 'corn kernels', 'frozen corn', 'canned corn',
  'peas', 'green peas', 'frozen peas',
  'spinach', 'chopped spinach', 'baby spinach',
  'lettuce', 'chopped lettuce', 'shredded lettuce',
  'cabbage', 'shredded cabbage', 'coleslaw',
  'broccoli', 'broccoli florets', 'chopped broccoli',
  'cauliflower', 'cauliflower florets',
  'zucchini', 'chopped zucchini', 'diced zucchini', 'zucchini',
  'cucumber', 'chopped cucumber', 'diced cucumber', 'cucumber',
  // Fruits (when measured in cups - chopped, diced, etc.)
  'chopped fruit', 'diced fruit', 'mixed fruit', 'fruit salad',
  'berries', 'mixed berries', 'strawberries', 'blueberries', 'raspberries', 'blackberries',
  'chopped apple', 'diced apple', 'apple chunks',
  'chopped mango', 'diced mango', 'mango chunks',
  'chopped pineapple', 'diced pineapple', 'pineapple chunks',
  'grapes', 'halved grapes',
  // Capers & other pickled items
  'capers', 'caper', 'pickles', 'pickle', 'relish',
  // Meat/seafood when diced or chopped
  'diced chicken', 'chopped chicken', 'shredded chicken',
  'diced ham', 'chopped ham',
  'crab meat', 'crabmeat', 'shrimp',
];

/**
 * LIQUID INGREDIENTS that should convert to mL
 * These are pourable liquids measured in cups for recipes
 */
const LIQUID_VOLUME_INGREDIENTS: string[] = [
  // Oils
  'oil', 'olive oil', 'vegetable oil', 'coconut oil', 'sesame oil', 'canola oil',
  'avocado oil', 'sunflower oil', 'peanut oil',
  // Dairy liquids
  'milk', 'almond milk', 'coconut milk', 'oat milk', 'soy milk', 'buttermilk',
  'cream', 'heavy cream', 'half and half', 'half & half',
  // Water & broths
  'water', 'broth', 'stock', 'chicken broth', 'beef broth', 'vegetable broth',
  'chicken stock', 'beef stock', 'vegetable stock', 'bone broth',
  // Juices
  'juice', 'lemon juice', 'lime juice', 'orange juice', 'apple juice', 'tomato juice',
  // Sauces & condiments (liquid)
  'soy sauce', 'fish sauce', 'worcestershire sauce', 'hot sauce',
  'vinegar', 'apple cider vinegar', 'balsamic vinegar', 'red wine vinegar', 'white wine vinegar',
  // Syrups
  'honey', 'maple syrup', 'agave', 'corn syrup', 'molasses',
  // Wine & alcohol
  'wine', 'white wine', 'red wine', 'cooking wine', 'sake', 'mirin',
  'beer', 'rum', 'vodka', 'whiskey',
];

// Define which unit category an ingredient belongs to
// This would normally come from a database, but we'll provide sensible defaults
const UNIT_CATEGORY_BY_INGREDIENT: Record<string, 'volume' | 'weight' | 'count'> = {
  // Volume (liquid measurements)
  'olive oil': 'volume',
  'vegetable oil': 'volume',
  'coconut oil': 'volume',
  'sesame oil': 'volume',
  'butter': 'weight', // butter is solid, use weight
  'milk': 'volume',
  'almond milk': 'volume',
  'coconut milk': 'volume',
  'cream': 'volume',
  'sour cream': 'volume',
  'yogurt': 'volume', // even though it's thick, measure in volume
  'greek yogurt': 'volume',
  'honey': 'volume',
  'maple syrup': 'volume',
  'soy sauce': 'volume',
  'vinegar': 'volume',
  'lemon juice': 'volume',
  'lime juice': 'volume',
  'orange juice': 'volume',
  'water': 'volume',
  'broth': 'volume',
  'chicken broth': 'volume',
  'beef broth': 'volume',
  'vegetable broth': 'volume',

  // Solids measured by volume (should NOT convert cups to mL)
  'olives': 'volume',
  'olive': 'volume',
  'kalamata olive': 'volume',
  'kalamata olives': 'volume',
  'black olives': 'volume',
  'green olives': 'volume',
  'feta': 'volume',
  'feta cheese': 'volume',
  'cream cheese': 'volume',
  'ricotta': 'volume',
  'ricotta cheese': 'volume',
  'cottage cheese': 'volume',

  // Spices and seasonings (measured by volume - tsp/tbsp)
  'salt': 'volume',
  'sea salt': 'volume',
  'black pepper': 'volume',
  'white pepper': 'volume',
  'pepper': 'volume',
  'garlic powder': 'volume',
  'onion powder': 'volume',
  'paprika': 'volume',
  'chili powder': 'volume',
  'cumin': 'volume',
  'oregano': 'volume',
  'basil': 'volume',
  'thyme': 'volume',
  'rosemary': 'volume',
  'parsley': 'volume',
  'cilantro': 'volume',
  'dill': 'volume',
  'cinnamon': 'volume',
  'nutmeg': 'volume',
  'ginger': 'volume',
  'turmeric': 'volume',
  'curry powder': 'volume',

  // Weight (dry/solid measurements)
  'sugar': 'weight',
  'brown sugar': 'weight',
  'italian herbs': 'weight',
  'cheese': 'weight',
  'cheddar cheese': 'weight',
  'mozzarella cheese': 'weight',
  'parmesan cheese': 'weight',
  'baking powder': 'weight',
  'baking soda': 'weight',
  'cocoa powder': 'weight',
  'coffee': 'weight',
  'chocolate chips': 'weight',
  'rice': 'volume', // Changed: rice is measured in cups (volume-solid)
  'pasta': 'volume', // Changed: pasta is measured in cups (volume-solid)
  'oats': 'volume', // Changed: oats are measured in cups (volume-solid)
  'beans': 'volume', // Changed: beans are measured in cups (volume-solid)
  'lentils': 'volume', // Changed: lentils are measured in cups (volume-solid)
  'flour': 'volume', // Changed: flour is measured in cups (volume-solid)

  // Weight (produce/proteins)
  'chicken': 'weight',
  'beef': 'weight',
  'pork': 'weight',
  'salmon': 'weight',
  'onion': 'count', // typically counted or in cups, not weight
  'garlic': 'count', // often measured in cloves
  'tomato': 'count',
  'potato': 'count',
  'carrot': 'count',
  'broccoli': 'count', // or weight
  'bell pepper': 'count', // typically counted or in cups, not weight
  'zucchini': 'count',
  'cucumber': 'count',
  'mushroom': 'count',
  'spinach': 'count', // can be measured in cups
  'lettuce': 'count', // can be measured in cups
  'egg': 'count',
  'apple': 'count',
  'banana': 'count',
  'orange': 'count',
  'lemon': 'count',
  'lime': 'count',
  'peach': 'count',
  'strawberry': 'count',
};

/**
 * Determine if an ingredient is a solid (uses cups) or liquid (uses mL)
 *
 * KEY RULE: Default to SOLID for unknown ingredients measured in cups.
 * Only return 'liquid' if the ingredient is explicitly known to be a liquid.
 * This prevents solid foods like olives, cheese, vegetables from being converted to mL.
 */
export function getVolumeType(ingredientName: string): VolumeType {
  const normalized = ingredientName.toLowerCase().trim();

  // FIRST: Check EXACT matches - these take highest priority
  // Check exact liquid match
  if (LIQUID_VOLUME_INGREDIENTS.includes(normalized)) {
    return 'liquid';
  }
  // Check exact solid match
  if (SOLID_VOLUME_INGREDIENTS.includes(normalized)) {
    return 'solid';
  }

  // SECOND: Check for partial matches using word boundaries
  // This prevents false positives like "breadcrumbs" matching "rum" or "olive oil" matching "olive"

  // Helper function to check if ingredient contains the term as a whole word
  const containsWholeWord = (text: string, word: string): boolean => {
    // Escape regex special characters in the word
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|\\s|-)${escaped}($|\\s|-)`, 'i');
    return regex.test(text);
  };

  // Check liquid partial matches first (more specific, e.g., "olive oil" should match before "olive")
  // Sort by length descending to prefer longer matches
  const sortedLiquids = [...LIQUID_VOLUME_INGREDIENTS].sort((a, b) => b.length - a.length);
  for (const liquid of sortedLiquids) {
    if (containsWholeWord(normalized, liquid)) {
      return 'liquid';
    }
  }

  // Check solid partial matches
  const sortedSolids = [...SOLID_VOLUME_INGREDIENTS].sort((a, b) => b.length - a.length);
  for (const solid of sortedSolids) {
    if (containsWholeWord(normalized, solid)) {
      return 'solid';
    }
  }

  // THIRD: Check for liquid keywords - only explicitly liquid things
  const liquidKeywords = ['juice', 'broth', 'stock', 'milk', 'cream', 'water', 'wine', 'beer', 'sauce', 'vinegar', 'syrup'];
  for (const keyword of liquidKeywords) {
    if (containsWholeWord(normalized, keyword)) {
      return 'liquid';
    }
  }

  // Everything else is SOLID - this is the key change!
  // If we don't know what it is, treat cups as cups (not mL)
  // This includes: olives, cheese, vegetables, unknown ingredients
  return 'solid';
}

/**
 * Conversion factors for volume (LIQUID ingredients)
 * Everything converts to millilitres (ml)
 * Includes plurals and common variations
 */
const VOLUME_TO_ML: Record<string, number> = {
  'tsp': 5,
  'tsps': 5,
  'teaspoon': 5,
  'teaspoons': 5,
  'tbsp': 15,
  'tbsps': 15,
  'tablespoon': 15,
  'tablespoons': 15,
  'cup': 240,
  'cups': 240,
  'ml': 1,
  'mls': 1,
  'l': 1000,
  'liter': 1000,
  'liters': 1000,
  'litre': 1000,
  'litres': 1000,
};

/**
 * Conversion factors for volume (SOLID/GRAIN ingredients)
 * Everything converts to cups (base unit for grains)
 * tbsp → cups, tsp → cups, but cups stay as cups
 */
const VOLUME_TO_CUPS: Record<string, number> = {
  'tsp': 1 / 48, // 48 tsp in a cup
  'tsps': 1 / 48,
  'teaspoon': 1 / 48,
  'teaspoons': 1 / 48,
  'tbsp': 1 / 16, // 16 tbsp in a cup
  'tbsps': 1 / 16,
  'tablespoon': 1 / 16,
  'tablespoons': 1 / 16,
  'cup': 1,
  'cups': 1,
  'ml': 1 / 240, // 240ml = 1 cup
  'mls': 1 / 240,
  'l': 1000 / 240, // ~4.17 cups per liter
  'liter': 1000 / 240,
  'liters': 1000 / 240,
  'litre': 1000 / 240,
  'litres': 1000 / 240,
};

/**
 * Conversion factors for weight
 * Everything converts to grams (g)
 * Includes plurals and common variations
 */
const WEIGHT_TO_G: Record<string, number> = {
  'g': 1,
  'gs': 1,
  'gram': 1,
  'grams': 1,
  'kg': 1000,
  'kilogram': 1000,
  'kilograms': 1000,
  'oz': 28.35,
  'ounce': 28.35,
  'ounces': 28.35,
  'lb': 453.6,
  'lbs': 453.6,
  'pound': 453.6,
  'pounds': 453.6,
};

/**
 * Count units - these are treated as pieces
 * Any unit in this list means the ingredient is counted, not measured
 */
const COUNT_UNITS: Record<string, number> = {
  'piece': 1,
  'pieces': 1,
  'whole': 1,
  'head': 1,
  'heads': 1,
  'can': 1,
  'cans': 1,
  'jar': 1,
  'jars': 1,
  'bottle': 1,
  'bottles': 1,
  'slice': 1,
  'slices': 1,
  'strip': 1,
  'strips': 1,
  'stalk': 1,
  'stalks': 1,
  'clove': 1,
  'cloves': 1,
  'bulb': 1,
  'bulbs': 1,
  'bunch': 1,
  'bunches': 1,
  'handful': 1,
  'handfuls': 1,
  'pinch': 1,
  'pinches': 1,
  'bar': 1,
  'bars': 1,
};

/**
 * Determine the base unit category for an ingredient
 * Returns 'volume', 'weight', or 'count'
 */
export function getBaseUnitCategory(
  ingredientName: string,
  userSpecifiedUnit?: string
): 'volume' | 'weight' | 'count' {
  const normalized = ingredientName.toLowerCase().trim();

  // CANONICAL FIRST: resolve the grocery family from the ingredient NAME so
  // the same ingredient always lands in the same category regardless of the
  // recipe's unit. This is what prevents "rice 2 cups" (volume) and
  // "rice 450 g" (weight) from splitting into two grocery lines.
  if (normalized) {
    const canonical = getCanonicalGroceryUnit(normalized);
    if (canonical.family === 'WEIGHT') return 'weight';
    if (canonical.family === 'VOLUME_LIQUID') return 'volume';
    return 'count';
  }

  // Fallback (no name): infer from the supplied unit.
  if (userSpecifiedUnit) {
    const unit = userSpecifiedUnit.toLowerCase().trim();
    if (Object.keys(COUNT_UNITS).includes(unit)) return 'count';
    if (Object.keys(VOLUME_TO_ML).includes(unit)) return 'volume';
    if (Object.keys(WEIGHT_TO_G).includes(unit)) return 'weight';
  }

  // Default to weight for unknown dry goods
  return 'weight';
}

/**
 * Get the base unit for a category
 * For volume, also considers whether it's a solid/grain (cups) or liquid (mL)
 */
export function getBaseUnit(category: 'volume' | 'weight' | 'count', ingredientName?: string): string {
  switch (category) {
    case 'volume':
      // Check if this is a solid/grain ingredient → use cups
      if (ingredientName && getVolumeType(ingredientName) === 'solid') {
        return 'cup';
      }
      return 'ml';
    case 'weight':
      return 'g';
    case 'count':
      return 'piece';
  }
}

/**
 * Get the canonical (preferred) unit for an ingredient
 * Used for grouping ingredients in the grocery list
 *
 * CANONICAL UNIT HIERARCHY:
 * - Eggs: 'piece' (not 'g' or 'ml')
 * - Vegetables (count-based like onion): 'piece' (not 'g' or 'cup')
 * - Solids in volume (rice, flour): 'cup' (not 'ml' or 'g')
 * - Liquids: 'ml' (not 'cup' or 'g')
 * - Weight items: 'g'
 *
 * This ensures "4 eggs" + "2 g egg" → both resolve to 'piece' for grouping
 */
export function getCanonicalUnit(ingredientName: string): string {
  // Single source of truth: the canonical grocery base unit for this name.
  return getCanonicalGroceryUnit(ingredientName).baseUnit;
}

/**
 * Convert a quantity and unit to the base unit
 * Returns { quantity: number, unit: string, category }
 *
 * KEY FEATURE: For volume ingredients:
 * - LIQUID (water, oil, milk) → converts to mL
 * - SOLID/GRAIN (rice, flour, oats) → converts to cups
 */
export function convertToBaseUnit(
  quantity: string | number,
  unit: string,
  ingredientName?: string
): { quantity: number; unit: string; category: 'volume' | 'weight' | 'count' } {
  const qty = typeof quantity === 'string' ? parseFloat(quantity) : quantity;

  // Handle invalid quantities: 0, NaN, negative
  if (isNaN(qty) || qty < 0) {
    console.warn(`⚠️ Invalid quantity "${quantity}" for "${ingredientName || 'unknown'}". Using 1 as fallback.`);
    return convertToBaseUnit(1, unit, ingredientName);
  }

  // Handle zero quantity - use 1 as fallback
  if (qty === 0) {
    console.warn(`⚠️ Zero quantity for "${ingredientName || 'unknown'}". Using 1 as fallback.`);
    return convertToBaseUnit(1, unit, ingredientName);
  }

  // CANONICAL PATH: when we know the ingredient name, resolve to its single
  // canonical grocery base unit so all variants of the same ingredient
  // converge (this is the duplication fix). Falls through to the legacy
  // unit-driven path only when no name is supplied.
  if (ingredientName && ingredientName.trim()) {
    const { quantity: baseQty, baseUnit } = convertToCanonicalGroceryBase(
      qty,
      unit,
      ingredientName,
      avgWeightG,
    );
    const category: 'volume' | 'weight' | 'count' =
      baseUnit === 'ml' ? 'volume' : baseUnit === 'piece' ? 'count' : 'weight';
    return { quantity: baseQty, unit: baseUnit, category };
  }

  const normalizedUnit = unit.toLowerCase().trim();

  // Apply unit aliases to normalize variations (e.g., "tablespoons" → "tbsp", "tsp" → "tsp")
  const aliasedUnit = normalizeUnit(normalizedUnit);

  // Determine which category this ingredient/unit belongs to
  let category: 'volume' | 'weight' | 'count' = 'weight'; // default

  // Try to infer from unit first - check count units first since they're most specific
  if (Object.keys(COUNT_UNITS).includes(aliasedUnit)) {
    category = 'count';
  } else if (Object.keys(VOLUME_TO_ML).includes(aliasedUnit)) {
    category = 'volume';
  } else if (Object.keys(WEIGHT_TO_G).includes(aliasedUnit)) {
    category = 'weight';
  } else if (ingredientName) {
    // Fall back to ingredient-based category
    category = getBaseUnitCategory(ingredientName, unit);
  }

  // Convert to base unit
  let baseQuantity = qty;
  let baseUnit = getBaseUnit(category, ingredientName);

  if (category === 'volume') {
    // Determine if this is a solid/grain or liquid ingredient
    // Default to 'solid' if no ingredient name provided (safer default - keeps cups as cups)
    const volumeType = ingredientName ? getVolumeType(ingredientName) : 'solid';

    if (volumeType === 'solid') {
      // SOLID/GRAIN: Convert to cups
      const factor = VOLUME_TO_CUPS[aliasedUnit];

      if (!factor) {
        console.warn(`⚠️ Unknown volume unit: "${unit}" for "${ingredientName || 'unknown'}". Treating as cups.`);
        baseQuantity = qty; // Assume already in cups
        baseUnit = 'cup';
      } else {
        baseQuantity = qty * factor;
        baseUnit = 'cup';
      }
    } else {
      // LIQUID: Convert to mL
      const factor = VOLUME_TO_ML[aliasedUnit];
      if (!factor) {
        console.warn(`⚠️ Unknown volume unit: "${unit}" for "${ingredientName || 'unknown'}". Treating as ml.`);
        baseQuantity = qty; // Assume already in ml
        baseUnit = 'ml';
      } else {
        baseQuantity = qty * factor;
        baseUnit = 'ml';
      }
    }
  } else if (category === 'weight') {
    const factor = WEIGHT_TO_G[aliasedUnit];
    if (!factor) {
      console.warn(`⚠️ Unknown weight unit: "${unit}" for "${ingredientName || 'unknown'}". Treating as g.`);
      baseQuantity = qty; // Assume already in g
      baseUnit = 'g';
    } else {
      baseQuantity = qty * factor;
    }
  } else if (category === 'count') {
    // Count stays as-is (already in pieces)
    // For specific count units like 'pinch', 'clove', etc., preserve the unit name
    baseUnit = aliasedUnit || 'piece';
  }

  return {
    quantity: baseQuantity,
    unit: baseUnit,
    category,
  };
}

/**
 * Format a base unit quantity back to human-readable format
 *
 * Volume-Liquid: mL, L
 * Volume-Solid: cups
 * Weight: g, kg
 * Count: pieces, cloves, items, etc.
 */
export function formatFromBaseUnit(
  baseQuantity: number,
  baseUnit: string,
  ingredientName?: string
): string {
  const qty = Math.round(baseQuantity * 100) / 100; // Round to 2 decimals

  // Handle all count-based units (piece, pinch, clove, can, jar, bar, etc.)
  if (baseUnit === 'piece' || baseUnit === 'pieces' || baseUnit === 'whole' ||
      baseUnit === 'pinch' || baseUnit === 'pinches' ||
      baseUnit === 'clove' || baseUnit === 'cloves' ||
      baseUnit === 'can' || baseUnit === 'cans' ||
      baseUnit === 'jar' || baseUnit === 'jars' ||
      baseUnit === 'bottle' || baseUnit === 'bottles' ||
      baseUnit === 'slice' || baseUnit === 'slices' ||
      baseUnit === 'stalk' || baseUnit === 'stalks' ||
      baseUnit === 'head' || baseUnit === 'heads' ||
      baseUnit === 'bulb' || baseUnit === 'bulbs' ||
      baseUnit === 'bunch' || baseUnit === 'bunches' ||
      baseUnit === 'handful' || baseUnit === 'handfuls' ||
      baseUnit === 'strip' || baseUnit === 'strips' ||
      baseUnit === 'bar' || baseUnit === 'bars') {
    // Count-based units: display as "quantity unit" format
    if (qty === 1) {
      // Singular form
      const singular = baseUnit.endsWith('s') && baseUnit !== 'pieces' ? baseUnit.slice(0, -1) : baseUnit;
      return baseUnit === 'piece' || baseUnit === 'pieces' ? '1' : `1 ${singular}`;
    }
    // Plural form - ensure piece → pieces
    const pluralUnit = baseUnit === 'piece' ? 'pieces' : (baseUnit.endsWith('s') ? baseUnit : `${baseUnit}s`);
    return `${qty} ${pluralUnit}`;
  }

  // Handle CUPS for solid/grain ingredients
  if (baseUnit === 'cup' || baseUnit === 'cups') {
    // Format cups in a user-friendly way

    // First, check for very small amounts that should be displayed as tbsp or tsp
    // Less than 1/4 cup (0.25) should be in tbsp or tsp
    if (qty < 0.25) {
      const tbsp = qty * 16; // 16 tbsp in a cup

      if (tbsp < 1) {
        // Less than 1 tbsp: show in tsp
        // Use Math.ceil for fractional tsp to avoid showing "0 tsp" (e.g., 0.5 tsp should show as 1 tsp, not 0)
        // But preserve exact values like 2, 3, etc.
        const exactTsp = qty * 48; // 48 tsp in a cup
        const tsp = exactTsp < 1 ? Math.ceil(exactTsp) : Math.round(exactTsp);
        // Ensure we never show 0 tsp - minimum is 1 tsp
        const displayTsp = Math.max(1, tsp);
        return displayTsp === 1 ? '1 tsp' : `${displayTsp} tsp`;
      }

      const roundedTbsp = Math.round(tbsp);
      return roundedTbsp === 1 ? '1 tbsp' : `${roundedTbsp} tbsp`;
    }

    // For 1/4 cup and larger, round to nearest 1/4 cup for readability
    const roundedCups = Math.round(qty * 4) / 4;

    // Format as fraction if it's a common fraction
    if (roundedCups === 0.25) return '1/4 cup';
    if (roundedCups === 0.5) return '1/2 cup';
    if (roundedCups === 0.75) return '3/4 cup';
    if (roundedCups === 1) return '1 cup';
    if (roundedCups === 1.25) return '1 1/4 cups';
    if (roundedCups === 1.5) return '1 1/2 cups';
    if (roundedCups === 1.75) return '1 3/4 cups';

    // For larger amounts, show decimal or whole number
    const displayCups = Math.round(roundedCups * 10) / 10; // Round to 1 decimal
    if (Number.isInteger(displayCups)) {
      return displayCups === 1 ? '1 cup' : `${displayCups} cups`;
    }
    return `${displayCups} cups`;
  }

  if (baseUnit === 'ml') {
    // Volume-Liquid: Display in mL or L (metric only)
    // Use L for quantities >= 1000 mL
    if (qty >= 1000) {
      const liters = qty / 1000;
      const roundedL = Math.round(liters * 100) / 100;
      return roundedL === 1 ? '1 L' : `${roundedL} L`;
    }

    // Use mL for quantities < 1000 mL
    const roundedMl = Math.round(qty);
    return roundedMl === 1 ? '1 mL' : `${roundedMl} mL`;
  }

  if (baseUnit === 'g') {
    // Weight: Display in g or kg (metric only)
    // Use kg for quantities >= 1000g
    if (qty >= 1000) {
      const kg = qty / 1000;
      const roundedKg = Math.round(kg * 100) / 100;
      return roundedKg === 1 ? '1 kg' : `${roundedKg} kg`;
    }

    // Use g for quantities < 1000g
    const roundedG = Math.round(qty);
    return roundedG === 1 ? '1 g' : `${roundedG} g`;
  }

  return qty.toString();
}

/**
 * Check if two ingredients can be combined (same category, compatible units)
 */
export function canCombineIngredients(
  unit1: string,
  unit2: string,
  ingredientName1?: string,
  ingredientName2?: string
): boolean {
  try {
    const category1 = getBaseUnitCategory(ingredientName1 || '', unit1);
    const category2 = getBaseUnitCategory(ingredientName2 || '', unit2);

    // Can only combine if same category (volume/weight/count)
    return category1 === category2;
  } catch {
    return false;
  }
}
