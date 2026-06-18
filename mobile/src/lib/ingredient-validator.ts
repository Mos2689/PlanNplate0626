/**
 * Ingredient validation and sanitization utilities
 * Handles edge cases like 0 quantities, NaN, missing units, etc.
 * ENFORCES STRICT UNIT TYPE RULES: Prevents chicken in mL, vegetables in volume, etc.
 */

import { normalizeIngredientName } from './ingredient-aliases';
import { convertToCanonicalGroceryBase } from './ingredient-unit-rules';
import { getAverageWeightWithConfidence } from './average-weight-lookup-au';

const avgWeightG = (name: string): number | null =>
  getAverageWeightWithConfidence(name)?.weightG ?? null;

export interface ValidatedIngredient {
  name: string;
  quantity: string;
  unit: string;
  category: 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other';
  isValid: boolean;
  warnings: string[];
}

/**
 * Map ingredients to their correct grocery categories
 * Used to correct category assignments from AI
 */
const INGREDIENT_CATEGORY_MAP: Record<string, 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other'> = {
  // MEAT & SEAFOOD - Actual meat/fish only
  'chicken': 'meat',
  'chicken breast': 'meat',
  'chicken thigh': 'meat',
  'beef': 'meat',
  'beef steak': 'meat',
  'pork': 'meat',
  'pork chop': 'meat',
  'fish': 'meat',
  'fish fillet': 'meat',
  'salmon': 'meat',
  'cod': 'meat',
  'tuna': 'meat',
  'shrimp': 'meat',
  'prawn': 'meat',
  'crab': 'meat',
  'lobster': 'meat',
  'turkey': 'meat',
  'lamb': 'meat',
  'duck': 'meat',
  'bacon': 'meat',
  'ham': 'meat',
  'sausage': 'meat',

  // PLANT-BASED PROTEINS - Should be PANTRY or PRODUCE
  'tofu': 'pantry',
  'firm tofu': 'pantry',
  'silken tofu': 'pantry',
  'tempeh': 'pantry',
  'seitan': 'pantry',
  'lentils': 'pantry',
  'chickpeas': 'pantry',
  'black beans': 'pantry',
  'kidney beans': 'pantry',
  'beans': 'pantry',
  'edamame': 'produce',
  'peas': 'produce',

  // PRODUCE
  'garlic': 'produce',
  'onion': 'produce',
  'tomato': 'produce',
  'potato': 'produce',
  'sweet potato': 'produce',
  'carrot': 'produce',
  'broccoli': 'produce',
  'spinach': 'produce',
  'lettuce': 'produce',
  'bell pepper': 'produce',
  'cucumber': 'produce',
  'zucchini': 'produce',
  'celery': 'produce',
  'green beans': 'produce',
  'cabbage': 'produce',
  'kale': 'produce',
  'arugula': 'produce',
  'mushroom': 'produce',
  'apple': 'produce',
  'banana': 'produce',
  'orange': 'produce',
  'lemon': 'produce',
  'lime': 'produce',
  'strawberry': 'produce',
  'blueberry': 'produce',
  'avocado': 'produce',
  'ginger': 'produce',
  'ginger root': 'produce',

  // DAIRY
  'milk': 'dairy',
  'almond milk': 'dairy',
  'coconut milk': 'dairy',
  'cream': 'dairy',
  'sour cream': 'dairy',
  'yogurt': 'dairy',
  'greek yogurt': 'dairy',
  'cheese': 'dairy',
  'cheddar cheese': 'dairy',
  'mozzarella cheese': 'dairy',
  'parmesan cheese': 'dairy',
  'feta cheese': 'dairy',
  'butter': 'dairy',
  'egg': 'dairy',
  'eggs': 'dairy',

  // PANTRY/DRY GOODS
  'rice': 'pantry',
  'brown rice': 'pantry',
  'jasmine rice': 'pantry',
  'pasta': 'pantry',
  'bread': 'pantry',
  'flour': 'pantry',
  'oats': 'pantry',
  'oatmeal': 'pantry',
  'quinoa': 'pantry',
  'couscous': 'pantry',
  'olive oil': 'pantry',
  'vegetable oil': 'pantry',
  'coconut oil': 'pantry',
  'sesame oil': 'pantry',
  'honey': 'pantry',
  'maple syrup': 'pantry',
  'soy sauce': 'pantry',
  'vinegar': 'pantry',
  'salt': 'pantry',
  'pepper': 'pantry',
  'black pepper': 'pantry',
  'white pepper': 'pantry',
  'baking powder': 'pantry',
  'baking soda': 'pantry',
  'sugar': 'pantry',
  'brown sugar': 'pantry',

  // FROZEN
  'frozen vegetables': 'frozen',
  'frozen berries': 'frozen',
  'frozen peas': 'frozen',
  'frozen corn': 'frozen',
  'frozen broccoli': 'frozen',

  // BAKERY
  'croissant': 'bakery',
  'baguette': 'bakery',
  'pastry': 'bakery',
};

/**
 * Correct ingredient category based on ingredient name
 * Uses INGREDIENT_CATEGORY_MAP to ensure proper categorization
 */
function getCorrectCategory(
  ingredientName: string,
  aiAssignedCategory: 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other'
): 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other' {
  const normalized = ingredientName.toLowerCase().trim();

  // Exact match
  if (INGREDIENT_CATEGORY_MAP[normalized]) {
    return INGREDIENT_CATEGORY_MAP[normalized];
  }

  // Partial match - check if ingredient name includes any key from the map
  for (const [key, category] of Object.entries(INGREDIENT_CATEGORY_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return category;
    }
  }

  // If no match found, return the AI-assigned category
  return aiAssignedCategory;
}

/**
 * Default units for ingredients that commonly have missing or invalid units
 * METRIC ONLY: Uses mL/L for volume, g/kg for weight, pieces for count
 */
const DEFAULT_UNITS_BY_INGREDIENT: Record<string, string> = {
  // Spices and seasonings - default to 5mL (equivalent to 1 tsp converted to metric)
  'salt': 'ml',
  'black pepper': 'ml',
  'white pepper': 'ml',
  'pepper': 'ml',
  'garlic powder': 'ml',
  'onion powder': 'ml',
  'paprika': 'ml',
  'chili powder': 'ml',
  'cumin': 'ml',
  'oregano': 'ml',
  'basil': 'ml',
  'thyme': 'ml',
  'rosemary': 'ml',
  'parsley': 'ml',
  'cilantro': 'ml',
  'dill': 'ml',
  'italian herbs': 'ml',
  'cinnamon': 'ml',
  'nutmeg': 'ml',
  'ginger': 'ml',
  'turmeric': 'ml',
  'cayenne': 'ml',
  'red pepper flakes': 'ml',
  'baking powder': 'g',
  'baking soda': 'g',
  'vanilla extract': 'ml',
  'almond extract': 'ml',

  // Produce - default to count or pieces
  'garlic': 'clove',
  'onion': 'piece',
  'tomato': 'piece',
  'potato': 'piece',
  'carrot': 'piece',
  'broccoli': 'head',
  'egg': 'piece',
  'apple': 'piece',
  'banana': 'piece',
  'orange': 'piece',
  'lemon': 'piece',
  'lime': 'piece',
  'bell pepper': 'piece',
  'cucumber': 'piece',
  'lettuce': 'head',
  'celery': 'stalk',
  'avocado': 'piece',
  'strawberry': 'piece',
  'blueberry': 'piece',

  // Common items
  'can tomatoes': 'can',
  'canned tomatoes': 'can',
  'coconut milk': 'ml',
  'chicken broth': 'ml',
  'vegetable broth': 'ml',
  'beef broth': 'ml',
  'bread': 'slice',
  'ginger root': 'piece',
};

/**
 * Default quantities for ingredients that often have implicit quantities
 * All in metric units where applicable
 */
const DEFAULT_QUANTITIES_BY_INGREDIENT: Record<string, string> = {
  // Spices and seasonings - default to 5mL (metric equivalent of 1 tsp)
  'salt': '5',
  'pepper': '5',
  'black pepper': '5',
  'white pepper': '5',

  // Garlic - 3 cloves is common
  'garlic': '3',

  // Oil - 30mL is common for cooking (metric equivalent of 2 tbsp)
  'olive oil': '30',
  'vegetable oil': '30',
  'coconut oil': '30',
  'sesame oil': '15', // 1 tbsp ~ 15mL

  // Butter - 30g is common (metric equivalent of 2 tbsp)
  'butter': '30',

  // Soy sauce - 30mL is common (metric equivalent of 2 tbsp)
  'soy sauce': '30',
};

/**
 * Validate and sanitize an ingredient
 * Fixes common issues: 0 quantity, NaN, missing units, missing quantities
 * ENFORCES STRICT UNIT TYPE RULES: chicken never in mL, vegetables never in volume, etc.
 */
export function validateIngredient(
  ingredient: {
    name: string;
    quantity: string | number;
    unit: string;
    category: 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other';
  }
): ValidatedIngredient {
  const warnings: string[] = [];
  let { name, quantity, unit, category } = ingredient;

  // Correct category if it's wrong (e.g., Tofu marked as "meat" should be "pantry")
  const correctedCategory = getCorrectCategory(name, category);
  if (correctedCategory !== category) {
    console.log(`[CATEGORY] Corrected "${name}" from "${category}" to "${correctedCategory}"`);
    category = correctedCategory;
  }

  const normalizedName = normalizeIngredientName(name);
  const quantityNum = typeof quantity === 'string' ? parseFloat(quantity) : quantity;

  // Fix invalid quantity (0, NaN, negative)
  // Also handle text-based quantities like "pinch", "dash", "to taste"
  let fixedQuantity = quantity;
  if (isNaN(quantityNum) || quantityNum <= 0) {
    warnings.push(`Invalid quantity "${quantity}" - using default`);
    fixedQuantity = DEFAULT_QUANTITIES_BY_INGREDIENT[normalizedName] ?? '1';
  } else {
    fixedQuantity = quantityNum.toString();
  }

  // Fix missing or invalid unit
  let fixedUnit = unit;
  if (!unit || unit.trim() === '' || unit === 'nan' || unit === 'undefined') {
    warnings.push(`Missing unit - using default for ${normalizedName}`);
    fixedUnit = DEFAULT_UNITS_BY_INGREDIENT[normalizedName] ?? 'g';
  } else {
    fixedUnit = unit.toLowerCase().trim();
  }

  // CANONICAL GROCERY UNIT COERCION
  // Resolve every ingredient to its single canonical grocery unit family
  // (liquids→mL, count produce→pieces, everything else→g) so the same
  // ingredient never diverges across recipes. Converts cups→g via density,
  // count↔weight via the AU average-weight table. This is the source-level
  // fix that stops duplicates being injected into the grocery list.
  const before = `${fixedQuantity} ${fixedUnit}`;
  const canonical = convertToCanonicalGroceryBase(
    fixedQuantity,
    fixedUnit,
    normalizedName,
    avgWeightG,
  );

  // Round for clean display: g/ml to nearest whole, pieces to nearest 0.5.
  const roundedQty =
    canonical.baseUnit === 'piece'
      ? Math.round(canonical.quantity * 2) / 2
      : Math.max(1, Math.round(canonical.quantity));
  fixedQuantity = roundedQty.toString();
  fixedUnit = canonical.baseUnit;

  if (`${fixedQuantity} ${fixedUnit}` !== before) {
    warnings.push(`Normalized "${before}" → "${fixedQuantity} ${fixedUnit}"`);
  }

  const isValid = warnings.length === 0;

  // Log validation for debugging
  if (!isValid && ingredient.unit !== fixedUnit) {
    console.log(`✓ VALIDATED: ${normalizedName} - ${ingredient.quantity} ${ingredient.unit} → ${fixedQuantity} ${fixedUnit}`);
  }

  return {
    name,
    quantity: fixedQuantity,
    unit: fixedUnit,
    category,
    isValid,
    warnings,
  };
}

/**
 * Validate and sanitize a batch of ingredients
 */
export function validateIngredients(
  ingredients: Array<{
    name: string;
    quantity: string | number;
    unit: string;
    category: 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other';
  }>
): ValidatedIngredient[] {
  return ingredients.map(ing => validateIngredient(ing));
}

/**
 * Log ingredient validation issues
 */
export function logIngredientValidationIssues(validated: ValidatedIngredient[]): void {
  const invalidIngredients = validated.filter(v => !v.isValid);

  if (invalidIngredients.length > 0) {
    console.warn(`⚠️ Found ${invalidIngredients.length} ingredients with issues:`);
    invalidIngredients.forEach(ing => {
      console.warn(`  - ${ing.name}: ${ing.warnings.join(', ')}`);
      console.warn(`    → Fixed to: ${ing.quantity} ${ing.unit}`);
    });
  }
}
