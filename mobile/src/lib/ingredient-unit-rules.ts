/**
 * Strict unit type rules by ingredient category
 * Prevents invalid unit assignments (e.g., chicken in mL)
 */

export type UnitType = 'WEIGHT' | 'COUNT' | 'VOLUME_LIQUID' | 'VOLUME_DRY';
export type IngredientType = 'PROTEIN' | 'GRAIN' | 'VEGETABLE' | 'FRUIT' | 'LIQUID' | 'DAIRY' | 'OTHER';

interface UnitTypeRules {
  allowed: UnitType[];
  forbidden: UnitType[];
  fallback: UnitType; // Fallback unit type if resolution fails
  displayUnits: Record<UnitType, string[]>; // Which units to display for each type
}

/**
 * Strict rules per ingredient category
 * Prevents invalid combinations like "chicken in mL"
 */
export const INGREDIENT_TYPE_RULES: Record<IngredientType, UnitTypeRules> = {
  PROTEIN: {
    allowed: ['WEIGHT', 'COUNT'],
    forbidden: ['VOLUME_LIQUID', 'VOLUME_DRY'],
    fallback: 'WEIGHT', // Default to grams
    displayUnits: {
      WEIGHT: ['g', 'kg'],
      COUNT: ['piece', 'pieces', 'whole', 'bar', 'bars'],
      VOLUME_LIQUID: [], // Not allowed
      VOLUME_DRY: [],    // Not allowed
    },
  },
  GRAIN: {
    allowed: ['WEIGHT', 'VOLUME_DRY'],
    forbidden: ['VOLUME_LIQUID'],
    fallback: 'WEIGHT', // Default to grams, not cups
    displayUnits: {
      WEIGHT: ['g', 'kg'],
      VOLUME_DRY: ['cup', 'tbsp', 'tsp'],
      VOLUME_LIQUID: [], // Not allowed
      COUNT: [],
    },
  },
  VEGETABLE: {
    allowed: ['WEIGHT', 'COUNT'],
    forbidden: ['VOLUME_LIQUID', 'VOLUME_DRY'],
    fallback: 'WEIGHT', // Default to grams
    displayUnits: {
      WEIGHT: ['g', 'kg'],
      COUNT: ['piece', 'pieces', 'head', 'heads', 'stalk', 'stalks', 'clove', 'cloves'],
      VOLUME_LIQUID: [], // Not allowed
      VOLUME_DRY: [],    // Not allowed
    },
  },
  FRUIT: {
    allowed: ['WEIGHT', 'COUNT'],
    forbidden: ['VOLUME_LIQUID', 'VOLUME_DRY'],
    fallback: 'WEIGHT', // Default to grams
    displayUnits: {
      WEIGHT: ['g', 'kg'],
      COUNT: ['piece', 'pieces', 'whole'],
      VOLUME_LIQUID: [], // Not allowed
      VOLUME_DRY: [],    // Not allowed
    },
  },
  LIQUID: {
    allowed: ['VOLUME_LIQUID'],
    forbidden: ['WEIGHT', 'COUNT', 'VOLUME_DRY'],
    fallback: 'VOLUME_LIQUID', // Default to mL
    displayUnits: {
      VOLUME_LIQUID: ['ml', 'l'],
      WEIGHT: [],
      COUNT: [],
      VOLUME_DRY: [],
    },
  },
  DAIRY: {
    allowed: ['WEIGHT', 'VOLUME_LIQUID', 'COUNT'],
    forbidden: ['VOLUME_DRY'],
    fallback: 'WEIGHT', // Default to grams (more common for cheese, yogurt)
    displayUnits: {
      WEIGHT: ['g', 'kg'],
      VOLUME_LIQUID: ['ml', 'l'],
      COUNT: ['piece', 'pieces'],
      VOLUME_DRY: [],
    },
  },
  OTHER: {
    allowed: ['WEIGHT', 'COUNT', 'VOLUME_LIQUID', 'VOLUME_DRY'],
    forbidden: [],
    fallback: 'WEIGHT', // Default to grams
    displayUnits: {
      WEIGHT: ['g', 'kg'],
      COUNT: ['piece', 'pieces'],
      VOLUME_LIQUID: ['ml', 'l'],
      VOLUME_DRY: ['cup', 'tbsp', 'tsp'],
    },
  },
};

/**
 * Map ingredients to their category
 */
export const INGREDIENT_CATEGORIES: Record<string, IngredientType> = {
  // PROTEIN
  'chicken': 'PROTEIN',
  'chicken breast': 'PROTEIN',
  'chicken thigh': 'PROTEIN',
  'beef': 'PROTEIN',
  'beef steak': 'PROTEIN',
  'pork': 'PROTEIN',
  'pork chop': 'PROTEIN',
  'fish': 'PROTEIN',
  'fish fillet': 'PROTEIN',
  'salmon': 'PROTEIN',
  'shrimp': 'PROTEIN',
  'prawn': 'PROTEIN',
  'egg': 'PROTEIN',
  'eggs': 'PROTEIN',
  'tofu': 'PROTEIN',
  'tempeh': 'PROTEIN',
  'turkey': 'PROTEIN',
  'lamb': 'PROTEIN',
  'protein bar': 'PROTEIN',
  'protein bars': 'PROTEIN',

  // GRAIN
  'rice': 'GRAIN',
  'brown rice': 'GRAIN',
  'jasmine rice': 'GRAIN',
  'pasta': 'GRAIN',
  'bread': 'GRAIN',
  'flour': 'GRAIN',
  'oats': 'GRAIN',
  'oatmeal': 'GRAIN',
  'quinoa': 'GRAIN',
  'couscous': 'GRAIN',

  // VEGETABLE
  'lettuce': 'VEGETABLE',
  'spinach': 'VEGETABLE',
  'broccoli': 'VEGETABLE',
  'carrot': 'VEGETABLE',
  'onion': 'VEGETABLE',
  'garlic': 'VEGETABLE',
  'tomato': 'VEGETABLE',
  'potato': 'VEGETABLE',
  'sweet potato': 'VEGETABLE',
  'bell pepper': 'VEGETABLE',
  'cucumber': 'VEGETABLE',
  'zucchini': 'VEGETABLE',
  'celery': 'VEGETABLE',
  'green beans': 'VEGETABLE',
  'peas': 'VEGETABLE',

  // FRUIT
  'apple': 'FRUIT',
  'banana': 'FRUIT',
  'orange': 'FRUIT',
  'lemon': 'FRUIT',
  'lime': 'FRUIT',
  'strawberry': 'FRUIT',
  'blueberry': 'FRUIT',
  'avocado': 'FRUIT',

  // LIQUID
  'water': 'LIQUID',
  'milk': 'LIQUID',
  'almond milk': 'LIQUID',
  'coconut milk': 'LIQUID',
  'cream': 'LIQUID',
  'sour cream': 'LIQUID',
  'broth': 'LIQUID',
  'chicken broth': 'LIQUID',
  'beef broth': 'LIQUID',
  'vegetable broth': 'LIQUID',
  'olive oil': 'LIQUID',
  'vegetable oil': 'LIQUID',
  'coconut oil': 'LIQUID',
  'sesame oil': 'LIQUID',
  'honey': 'LIQUID',
  'maple syrup': 'LIQUID',
  'soy sauce': 'LIQUID',
  'vinegar': 'LIQUID',
  'lemon juice': 'LIQUID',
  'lime juice': 'LIQUID',
  'orange juice': 'LIQUID',

  // DAIRY
  'cheese': 'DAIRY',
  'cheddar cheese': 'DAIRY',
  'mozzarella cheese': 'DAIRY',
  'parmesan cheese': 'DAIRY',
  'feta cheese': 'DAIRY',
  'yogurt': 'DAIRY',
  'greek yogurt': 'DAIRY',
  'butter': 'DAIRY',

  // PULSES
  'beans': 'GRAIN',
  'lentils': 'GRAIN',
  'chickpeas': 'GRAIN',
  'black beans': 'GRAIN',
  'kidney beans': 'GRAIN',
};

/**
 * Determine ingredient category from name
 */
export function getIngredientCategory(ingredientName: string): IngredientType {
  const normalized = ingredientName.toLowerCase().trim();

  // Exact match
  if (INGREDIENT_CATEGORIES[normalized]) {
    return INGREDIENT_CATEGORIES[normalized];
  }

  // Partial match
  for (const [key, category] of Object.entries(INGREDIENT_CATEGORIES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return category;
    }
  }

  // Default
  return 'OTHER';
}

/**
 * Validate if a unit type is allowed for an ingredient
 */
export function isUnitTypeAllowed(
  ingredientName: string,
  unitType: UnitType
): boolean {
  const category = getIngredientCategory(ingredientName);
  const rules = INGREDIENT_TYPE_RULES[category];

  return rules.allowed.includes(unitType) && !rules.forbidden.includes(unitType);
}

/**
 * Get allowed unit types for an ingredient
 */
export function getAllowedUnitTypes(ingredientName: string): UnitType[] {
  const category = getIngredientCategory(ingredientName);
  return INGREDIENT_TYPE_RULES[category].allowed;
}

/**
 * Get display units for a specific ingredient and unit type
 */
export function getDisplayUnits(
  ingredientName: string,
  unitType: UnitType
): string[] {
  const category = getIngredientCategory(ingredientName);
  const rules = INGREDIENT_TYPE_RULES[category];
  return rules.displayUnits[unitType];
}

/**
 * Get fallback unit type for an ingredient
 */
export function getFallbackUnitType(ingredientName: string): UnitType {
  const category = getIngredientCategory(ingredientName);
  return INGREDIENT_TYPE_RULES[category].fallback;
}

/**
 * Classify unit string to unit type
 */
export function classifyUnitToType(unitString: string): UnitType | null {
  const unit = unitString.toLowerCase().trim();

  // VOLUME_LIQUID units
  if (['ml', 'mls', 'l', 'liter', 'liters', 'litre', 'litres'].includes(unit)) {
    return 'VOLUME_LIQUID';
  }

  // VOLUME_DRY units
  if (['cup', 'cups', 'tbsp', 'tbsps', 'tablespoon', 'tablespoons', 'tsp', 'tsps', 'teaspoon', 'teaspoons'].includes(unit)) {
    return 'VOLUME_DRY';
  }

  // WEIGHT units
  if (['g', 'gs', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds'].includes(unit)) {
    return 'WEIGHT';
  }

  // COUNT units
  if (['piece', 'pieces', 'whole', 'head', 'heads', 'can', 'cans', 'jar', 'jars', 'bottle', 'bottles', 'slice', 'slices', 'strip', 'strips', 'stalk', 'stalks', 'clove', 'cloves', 'bulb', 'bulbs', 'bunch', 'bunches', 'handful', 'handfuls', 'pinch', 'pinches', 'bar', 'bars'].includes(unit)) {
    return 'COUNT';
  }

  return null;
}

/**
 * Validate and correct unit assignment for an ingredient
 * Returns the correct unit type and optionally corrected unit
 */
export function validateAndCorrectUnit(
  ingredientName: string,
  unitString: string
): {
  isValid: boolean;
  unitType: UnitType;
  correctedUnit?: string;
  warning?: string;
} {
  const unitType = classifyUnitToType(unitString);

  if (!unitType) {
    // Unknown unit - use fallback
    const fallbackType = getFallbackUnitType(ingredientName);
    const displayUnits = getDisplayUnits(ingredientName, fallbackType);
    return {
      isValid: false,
      unitType: fallbackType,
      correctedUnit: displayUnits[0] || 'g',
      warning: `Unknown unit "${unitString}" for "${ingredientName}". Using ${displayUnits[0] || 'g'} instead.`,
    };
  }

  // Check if unit type is allowed
  if (isUnitTypeAllowed(ingredientName, unitType)) {
    return {
      isValid: true,
      unitType,
    };
  }

  // Unit type not allowed - use fallback
  const fallbackType = getFallbackUnitType(ingredientName);
  const displayUnits = getDisplayUnits(ingredientName, fallbackType);

  return {
    isValid: false,
    unitType: fallbackType,
    correctedUnit: displayUnits[0] || 'g',
    warning: `Unit "${unitString}" (${unitType}) not allowed for ${ingredientName}. Using ${displayUnits[0] || 'g'} instead.`,
  };
}

// ════════════════════════════════════════════════════════════════════════
// CANONICAL GROCERY UNIT RESOLVER
//
// The single source of truth for the grocery unit family of an ingredient.
// Unlike INGREDIENT_TYPE_RULES (which lists *allowed* unit types and only
// blocks forbidden combos), this resolves exactly ONE canonical family per
// ingredient NAME, independent of whatever unit a recipe happened to use.
// This is what kills grocery duplication at the source: "2 cups rice" and
// "450 g rice" both resolve to the SAME base unit and merge.
//
// Decisions (confirmed with product):
//   • Liquids                       → VOLUME_LIQUID, base 'ml'
//   • Count-style produce (egg,     → COUNT, base 'piece'
//     onion, garlic, lemon, …)
//   • Everything else (grains,      → WEIGHT, base 'g'
//     flour, pasta, sugar, legumes,
//     cheese, meat, spices, …)
// ════════════════════════════════════════════════════════════════════════

export type CanonicalFamily = 'WEIGHT' | 'VOLUME_LIQUID' | 'COUNT';

export interface CanonicalGroceryUnit {
  family: CanonicalFamily;
  baseUnit: 'g' | 'ml' | 'piece';
}

/**
 * Liquids that must always resolve to mL regardless of the recipe's unit.
 * Mirrors LIQUID_VOLUME_INGREDIENTS in unit-conversion.ts (kept in sync).
 */
const CANONICAL_LIQUIDS: string[] = [
  'water', 'milk', 'almond milk', 'coconut milk', 'oat milk', 'soy milk',
  'buttermilk', 'cream', 'heavy cream', 'sour cream', 'half and half',
  'oil', 'olive oil', 'vegetable oil', 'coconut oil', 'sesame oil', 'canola oil',
  'avocado oil', 'sunflower oil', 'peanut oil',
  'broth', 'stock', 'chicken broth', 'beef broth', 'vegetable broth',
  'chicken stock', 'beef stock', 'vegetable stock', 'bone broth',
  'juice', 'lemon juice', 'lime juice', 'orange juice', 'apple juice', 'tomato juice',
  'soy sauce', 'fish sauce', 'worcestershire sauce', 'hot sauce', 'sauce',
  'vinegar', 'apple cider vinegar', 'balsamic vinegar', 'red wine vinegar', 'white wine vinegar',
  'honey', 'maple syrup', 'agave', 'corn syrup', 'molasses', 'syrup',
  'wine', 'white wine', 'red wine', 'cooking wine', 'sake', 'mirin',
  'beer', 'rum', 'vodka', 'whiskey',
];

/**
 * Count-style produce that must always resolve to pieces (or piece-like
 * units: clove/head/stalk). Anything in weight/volume gets converted to
 * pieces via the AU average-weight table.
 */
const CANONICAL_COUNT: string[] = [
  'egg', 'eggs',
  'onion', 'red onion', 'brown onion', 'spring onion', 'shallot',
  'garlic',
  'tomato', 'cherry tomato',
  'potato', 'sweet potato',
  'carrot',
  'capsicum', 'bell pepper', 'pepper',
  'cucumber',
  'zucchini',
  'lemon', 'lime', 'apple', 'banana', 'orange',
  'avocado',
  'lettuce', 'celery', 'broccoli', 'cauliflower', 'mushroom',
  'corn',
];

/**
 * Approximate density (grams per US cup, 240 mL) for dry solids the AI or
 * curated recipes commonly express in cups. Lets "2 cups rice" converge with
 * gram-based rice entries. Approximate by design — close enough for a
 * shopping list, and unifying beats splitting into two lines.
 */
export const DENSITY_G_PER_CUP: Record<string, number> = {
  // Grains & rice
  'rice': 185, 'white rice': 185, 'brown rice': 190, 'basmati rice': 185,
  'jasmine rice': 185, 'wild rice': 160,
  'quinoa': 170, 'couscous': 175, 'bulgur': 140, 'barley': 200,
  // Flours & baking
  'flour': 120, 'all-purpose flour': 120, 'plain flour': 120, 'whole wheat flour': 130,
  'bread flour': 130, 'almond flour': 96, 'coconut flour': 112, 'cornmeal': 160,
  'cornstarch': 128, 'cornflour': 128,
  'breadcrumbs': 110, 'panko': 50, 'cocoa powder': 100,
  'baking powder': 230, 'baking soda': 220,
  // Sugars
  'sugar': 200, 'caster sugar': 200, 'white sugar': 200, 'brown sugar': 220,
  'powdered sugar': 120, 'icing sugar': 120,
  // Oats & cereal
  'oats': 90, 'rolled oats': 90, 'steel cut oats': 175, 'oatmeal': 90,
  // Legumes (dry)
  'lentils': 190, 'red lentils': 190, 'green lentils': 190,
  'beans': 190, 'black beans': 190, 'kidney beans': 185, 'chickpeas': 200,
  'split peas': 200,
  // Nuts & seeds
  'nuts': 140, 'almonds': 140, 'walnuts': 100, 'cashews': 130, 'peanuts': 145,
  'chia seeds': 170, 'flax seeds': 150, 'sunflower seeds': 140,
  // Dried fruit
  'raisins': 145, 'dried cranberries': 120,
  // Cheese measured in cups (shredded)
  'cheese': 110, 'cheddar cheese': 110, 'mozzarella cheese': 110, 'parmesan cheese': 90,
};

/** Conservative fallback density for unknown dry solids given in cups. */
const GENERIC_DENSITY_G_PER_CUP = 150;

const VOLUME_TO_ML_LOCAL: Record<string, number> = {
  'tsp': 5, 'tsps': 5, 'teaspoon': 5, 'teaspoons': 5,
  'tbsp': 15, 'tbsps': 15, 'tablespoon': 15, 'tablespoons': 15,
  'cup': 240, 'cups': 240,
  'ml': 1, 'mls': 1, 'l': 1000, 'liter': 1000, 'liters': 1000, 'litre': 1000, 'litres': 1000,
};

const WEIGHT_TO_G_LOCAL: Record<string, number> = {
  'g': 1, 'gs': 1, 'gram': 1, 'grams': 1,
  'kg': 1000, 'kilogram': 1000, 'kilograms': 1000,
  'oz': 28.35, 'ounce': 28.35, 'ounces': 28.35,
  'lb': 453.6, 'lbs': 453.6, 'pound': 453.6, 'pounds': 453.6,
};

/** Prep/cut descriptors stripped before resolving so they don't hide the
 *  real ingredient (e.g. "chopped bell pepper" → "bell pepper"). */
const PREP_DESCRIPTORS = [
  'raw', 'cooked', 'fresh', 'dried', 'frozen', 'canned', 'boneless', 'skinless',
  'ground', 'chopped', 'sliced', 'diced', 'minced', 'crushed', 'grated',
  'shredded', 'melted', 'cubed', 'crumbled', 'halved', 'quartered', 'peeled',
  'trimmed', 'drained', 'rinsed', 'toasted', 'roasted', 'mashed',
  'organic', 'large', 'medium', 'small', 'ripe', 'day-old', 'old',
];

function stripPrepDescriptors(ingredientName: string): string {
  let n = ingredientName.toLowerCase().trim();
  PREP_DESCRIPTORS.forEach((d) => {
    n = n.replace(new RegExp(`\\b${d}\\b`, 'gi'), '');
  });
  return n.replace(/,\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Whole-word match helper (prevents "olive oil" matching "olive"). */
function matchesAny(name: string, list: string[]): boolean {
  const normalized = name.toLowerCase().trim();
  if (list.includes(normalized)) return true;
  // longest-first whole-word partial match
  const sorted = [...list].sort((a, b) => b.length - a.length);
  for (const entry of sorted) {
    const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|\\s|-)${escaped}($|\\s|-)`, 'i');
    if (regex.test(normalized)) return true;
  }
  return false;
}

/** Density lookup for a dry solid, with generic fallback. */
function densityForCup(name: string): number {
  const normalized = name.toLowerCase().trim();
  if (DENSITY_G_PER_CUP[normalized]) return DENSITY_G_PER_CUP[normalized];
  const sorted = Object.keys(DENSITY_G_PER_CUP).sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (normalized.includes(key)) return DENSITY_G_PER_CUP[key];
  }
  return GENERIC_DENSITY_G_PER_CUP;
}

/**
 * The single canonical grocery unit family for an ingredient, derived from
 * its NAME only. Liquids → ml, count produce → piece, everything else → g.
 */
/**
 * Spice/seasoning names that collide with count-produce keywords ("pepper" the
 * spice vs "pepper" the capsicum). These always resolve to WEIGHT so seasonings
 * never get bucketed as count produce.
 */
const SPICE_WEIGHT_OVERRIDES: string[] = [
  'black pepper', 'white pepper', 'cracked pepper', 'ground pepper',
  'peppercorn', 'peppercorns', 'pepper flakes', 'red pepper flakes',
  'chili powder', 'chilli powder', 'cayenne', 'paprika',
];

export function getCanonicalGroceryUnit(ingredientName: string): CanonicalGroceryUnit {
  // Strip prep descriptors so "chopped bell pepper" resolves like "bell pepper".
  const name = stripPrepDescriptors(ingredientName);

  // Resolution order matters:
  //  1. Spice "pepper" forms → weight (beats the capsicum count rule).
  //  2. Liquids → ml. Checked BEFORE count so "lemon juice", "tomato sauce",
  //     "coconut milk" resolve as liquids even though lemon/tomato/coconut are
  //     count/solid words.
  //  3. Count produce → piece ("pepper"/"capsicum" land here, no liquid word).
  //  4. Weight → g (default).
  if (matchesAny(name, SPICE_WEIGHT_OVERRIDES)) {
    return { family: 'WEIGHT', baseUnit: 'g' };
  }
  // Cheese is always weight (g), even "cream cheese" which contains the liquid
  // word "cream". Guard before the liquid check.
  if (/\bcheese\b/.test(name)) {
    return { family: 'WEIGHT', baseUnit: 'g' };
  }
  if (matchesAny(name, CANONICAL_LIQUIDS)) {
    return { family: 'VOLUME_LIQUID', baseUnit: 'ml' };
  }
  if (matchesAny(name, CANONICAL_COUNT)) {
    return { family: 'COUNT', baseUnit: 'piece' };
  }
  return { family: 'WEIGHT', baseUnit: 'g' };
}

/**
 * Convert ANY incoming (quantity, unit) for an ingredient into its canonical
 * grocery base unit. This is the deterministic normalizer that makes all
 * variants of the same ingredient converge so they merge in the grocery list.
 *
 * Cross-family conversions:
 *   • cups/tbsp/tsp of a WEIGHT ingredient → grams via DENSITY_G_PER_CUP
 *   • weight/volume of a COUNT ingredient  → pieces via avg-weight table
 *   • count of a WEIGHT ingredient         → grams via avg-weight table
 * When a needed avg-weight lookup is missing, we keep the original family for
 * that item (rare) and warn, rather than fabricate a number.
 */
export function convertToCanonicalGroceryBase(
  quantity: string | number,
  unit: string,
  ingredientName: string,
  getAvgWeightG?: (name: string) => number | null
): { quantity: number; baseUnit: 'g' | 'ml' | 'piece' } {
  let qty = typeof quantity === 'string' ? parseFloat(quantity) : quantity;
  if (isNaN(qty) || qty <= 0) qty = 1;

  const u = (unit || '').toLowerCase().trim();
  const incomingType = classifyUnitToType(u); // WEIGHT | COUNT | VOLUME_LIQUID | VOLUME_DRY | null
  const cleanName = stripPrepDescriptors(ingredientName);
  const canonical = getCanonicalGroceryUnit(ingredientName);
  const avg = () => (getAvgWeightG ? getAvgWeightG(cleanName) : null);

  // ── Target: WEIGHT (g) ──────────────────────────────────────────────
  if (canonical.family === 'WEIGHT') {
    if (incomingType === 'WEIGHT') {
      return { quantity: qty * (WEIGHT_TO_G_LOCAL[u] ?? 1), baseUnit: 'g' };
    }
    if (incomingType === 'VOLUME_DRY' || incomingType === 'VOLUME_LIQUID') {
      const ml = qty * (VOLUME_TO_ML_LOCAL[u] ?? 240);
      const grams = (ml / 240) * densityForCup(cleanName); // cups → g via density
      return { quantity: grams, baseUnit: 'g' };
    }
    if (incomingType === 'COUNT') {
      const w = avg();
      if (w) return { quantity: qty * w, baseUnit: 'g' };
      // No avg weight — fall back to grams 1:1 is meaningless; keep piece.
      console.warn(`[CanonicalUnit] No avg-weight for count→weight "${ingredientName}". Keeping pieces.`);
      return { quantity: qty, baseUnit: 'piece' };
    }
    // Unknown unit → assume already grams.
    return { quantity: qty, baseUnit: 'g' };
  }

  // ── Target: VOLUME_LIQUID (ml) ──────────────────────────────────────
  if (canonical.family === 'VOLUME_LIQUID') {
    if (incomingType === 'VOLUME_LIQUID' || incomingType === 'VOLUME_DRY') {
      return { quantity: qty * (VOLUME_TO_ML_LOCAL[u] ?? 1), baseUnit: 'ml' };
    }
    if (incomingType === 'WEIGHT') {
      // Treat ~1 g ≈ 1 mL for liquids (water-like density) — close enough.
      return { quantity: qty * (WEIGHT_TO_G_LOCAL[u] ?? 1), baseUnit: 'ml' };
    }
    // Count of a liquid is unusual — assume the qty is already mL.
    return { quantity: qty, baseUnit: 'ml' };
  }

  // ── Target: COUNT (piece) ───────────────────────────────────────────
  if (incomingType === 'COUNT' || incomingType === null) {
    return { quantity: qty, baseUnit: 'piece' };
  }
  // weight/volume → pieces via avg weight
  const w = avg();
  if (w) {
    const grams =
      incomingType === 'WEIGHT'
        ? qty * (WEIGHT_TO_G_LOCAL[u] ?? 1)
        : (qty * (VOLUME_TO_ML_LOCAL[u] ?? 240) / 240) * densityForCup(cleanName);
    return { quantity: grams / w, baseUnit: 'piece' };
  }
  // No avg-weight data — keep the COUNT family (base 'piece') so the item stays
  // in its canonical family for dedup rather than leaking into g/ml. Quantity is
  // a best-effort passthrough (count produce shouldn't arrive in cups/grams).
  console.warn(`[CanonicalUnit] No avg-weight for ${incomingType}→count "${cleanName}". Keeping pieces (approx).`);
  return { quantity: qty, baseUnit: 'piece' };
}
