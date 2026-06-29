/**
 * AVERAGE_WEIGHT_LOOKUP_AU - Australian ingredient average weights dataset
 * Used for deterministic count-to-weight conversions during ingredient aggregation
 *
 * USAGE CONSTRAINTS:
 * - Only use for unit conversion logic and ingredient aggregation
 * - Never display confidence levels or conversion metadata to UI
 * - Always prefer exact canonical match, then alias match
 * - Apply only when ingredient has both COUNT and WEIGHT units
 *
 * CONFIDENCE LEVELS:
 * - "high": Standard portion sizes, widely consistent (e.g., eggs, garlic cloves)
 * - "medium": Variable by variety/size, reasonable average (e.g., onions, tomatoes)
 * - "low": Highly variable, use with caution but don't block aggregation
 * - "missing": No data available, keep as separate lines
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'missing';

export interface AverageWeightEntry {
  canonicalName: string;
  aliases: string[]; // Alternative names that map to this canonical
  averageWeightG: number; // Weight in grams per piece/unit
  confidence: ConfidenceLevel;
  description: string; // Human-readable description (e.g., "medium egg")
  source: string; // Reference (e.g., "ABS data", "Standard recipe", "Industry standard")
}

/**
 * Australian Average Weight Lookup Table
 * Organized by ingredient category for clarity
 */
export const AVERAGE_WEIGHT_LOOKUP_AU: Record<string, AverageWeightEntry> = {
  // PROTEINS
  'chicken breast': {
    canonicalName: 'chicken breast',
    aliases: ['chicken', 'chicken fillet'],
    averageWeightG: 200,
    confidence: 'high',
    description: 'Single boneless, skinless chicken breast (Australian standard)',
    source: 'ABS Food Standards, Australian Chicken Meat Federation',
  },
  'chicken thigh': {
    canonicalName: 'chicken thigh',
    aliases: ['chicken thigh fillet'],
    averageWeightG: 180,
    confidence: 'high',
    description: 'Single boneless chicken thigh fillet',
    source: 'Industry standard',
  },
  'beef': {
    canonicalName: 'beef',
    aliases: ['beef steak', 'beef mince', 'ground beef'],
    averageWeightG: 180,
    confidence: 'medium',
    description: 'Single beef serving/piece (average steak)',
    source: 'Industry standard',
  },
  'pork': {
    canonicalName: 'pork',
    aliases: ['pork chop', 'pork fillet'],
    averageWeightG: 180,
    confidence: 'medium',
    description: 'Single pork chop or fillet piece',
    source: 'Industry standard',
  },
  'fish': {
    canonicalName: 'fish',
    aliases: ['fish fillet', 'salmon', 'cod', 'bream'],
    averageWeightG: 180,
    confidence: 'medium',
    description: 'Single fish fillet (varies by species)',
    source: 'Australian Fisheries',
  },
  'salmon': {
    canonicalName: 'salmon',
    aliases: ['salmon fillet', 'atlantic salmon'],
    averageWeightG: 200,
    confidence: 'high',
    description: 'Single salmon fillet',
    source: 'Industry standard',
  },
  'shrimp': {
    canonicalName: 'shrimp',
    aliases: ['prawn', 'king prawn', 'school prawn'],
    averageWeightG: 15,
    confidence: 'medium',
    description: 'Single large prawn/shrimp',
    source: 'Australian Seafood Industry',
  },
  'egg': {
    canonicalName: 'egg',
    aliases: ['chicken egg', 'large egg', 'hard boiled egg', 'hard boiled eggs', 'hard-boiled egg', 'hard-boiled eggs', 'boiled egg', 'boiled eggs', 'soft boiled egg', 'soft boiled eggs', 'poached egg', 'poached eggs', 'fried egg', 'fried eggs', 'scrambled egg', 'scrambled eggs', 'eggs'],
    averageWeightG: 55,
    confidence: 'high',
    description: 'Single large Australian egg (AGSM standard)',
    source: 'Australian Egg Corporation, AGSM standards',
  },
  'tofu': {
    canonicalName: 'tofu',
    aliases: ['firm tofu', 'silken tofu'],
    averageWeightG: 150,
    confidence: 'medium',
    description: 'Single standard tofu serving/block',
    source: 'Industry standard',
  },

  // VEGETABLES
  'garlic': {
    canonicalName: 'garlic',
    aliases: ['garlic clove', 'clove', 'garlic cloves'],
    averageWeightG: 5,
    confidence: 'high',
    description: 'Single garlic clove (Australian standard bulbs)',
    source: 'ABS Vegetable Standards',
  },
  'onion': {
    canonicalName: 'onion',
    aliases: ['brown onion', 'yellow onion', 'medium onion', 'medium brown onion'],
    averageWeightG: 150,
    confidence: 'medium',
    description: 'Single medium brown onion (Australian standard)',
    source: 'ABS Vegetable Standards',
  },
  'red onion': {
    canonicalName: 'red onion',
    aliases: ['purple onion'],
    averageWeightG: 150,
    confidence: 'medium',
    description: 'Single medium red onion',
    source: 'ABS Vegetable Standards',
  },
  'tomato': {
    canonicalName: 'tomato',
    aliases: ['medium tomato', 'beef tomato', 'cherry tomato'],
    averageWeightG: 150,
    confidence: 'medium',
    description: 'Single medium tomato (Australian standard)',
    source: 'ABS Vegetable Standards',
  },
  'potato': {
    canonicalName: 'potato',
    aliases: ['medium potato', 'potato tuber'],
    averageWeightG: 200,
    confidence: 'medium',
    description: 'Single medium potato (Australian standard)',
    source: 'ABS Vegetable Standards',
  },
  'carrot': {
    canonicalName: 'carrot',
    aliases: ['medium carrot', 'carrot root'],
    averageWeightG: 80,
    confidence: 'medium',
    description: 'Single medium carrot',
    source: 'ABS Vegetable Standards',
  },
  'bell pepper': {
    canonicalName: 'bell pepper',
    aliases: ['pepper', 'capsicum', 'sweet pepper'],
    averageWeightG: 180,
    confidence: 'medium',
    description: 'Single medium bell pepper/capsicum (Australian standard)',
    source: 'ABS Vegetable Standards',
  },
  'cucumber': {
    canonicalName: 'cucumber',
    aliases: ['medium cucumber', 'telegraph cucumber'],
    averageWeightG: 300,
    confidence: 'medium',
    description: 'Single medium telegraph cucumber (Australian standard)',
    source: 'ABS Vegetable Standards',
  },
  'celery': {
    canonicalName: 'celery',
    aliases: ['celery stalk'],
    averageWeightG: 40,
    confidence: 'medium',
    description: 'Single celery stalk',
    source: 'Industry standard',
  },
  'broccoli': {
    canonicalName: 'broccoli',
    aliases: ['broccoli head', 'broccoli floret'],
    averageWeightG: 500,
    confidence: 'medium',
    description: 'Single medium broccoli head',
    source: 'ABS Vegetable Standards',
  },
  'lettuce': {
    canonicalName: 'lettuce',
    aliases: ['lettuce head', 'iceberg lettuce'],
    averageWeightG: 400,
    confidence: 'medium',
    description: 'Single medium lettuce head',
    source: 'ABS Vegetable Standards',
  },
  'cabbage': {
    canonicalName: 'cabbage',
    aliases: ['cabbage head', 'green cabbage'],
    averageWeightG: 1000,
    confidence: 'medium',
    description: 'Single medium cabbage head',
    source: 'ABS Vegetable Standards',
  },
  'mushroom': {
    canonicalName: 'mushroom',
    aliases: ['button mushroom', 'single mushroom'],
    averageWeightG: 15,
    confidence: 'medium',
    description: 'Single button mushroom',
    source: 'Industry standard',
  },
  'zucchini': {
    canonicalName: 'zucchini',
    aliases: ['courgette', 'medium zucchini'],
    averageWeightG: 200,
    confidence: 'medium',
    description: 'Single medium zucchini',
    source: 'ABS Vegetable Standards',
  },

  // FRUIT
  'lemon': {
    canonicalName: 'lemon',
    aliases: ['medium lemon'],
    averageWeightG: 60,
    confidence: 'medium',
    description: 'Single medium lemon',
    source: 'ABS Fruit Standards',
  },
  'lime': {
    canonicalName: 'lime',
    aliases: ['medium lime'],
    averageWeightG: 45,
    confidence: 'medium',
    description: 'Single medium lime',
    source: 'ABS Fruit Standards',
  },
  'orange': {
    canonicalName: 'orange',
    aliases: ['medium orange'],
    averageWeightG: 150,
    confidence: 'medium',
    description: 'Single medium orange',
    source: 'ABS Fruit Standards',
  },
  'apple': {
    canonicalName: 'apple',
    aliases: ['medium apple', 'granny smith', 'fuji apple'],
    averageWeightG: 180,
    confidence: 'medium',
    description: 'Single medium apple',
    source: 'ABS Fruit Standards',
  },
  'banana': {
    canonicalName: 'banana',
    aliases: ['medium banana'],
    averageWeightG: 120,
    confidence: 'medium',
    description: 'Single medium banana (peeled ~100g)',
    source: 'ABS Fruit Standards',
  },
  'strawberry': {
    canonicalName: 'strawberry',
    aliases: ['single strawberry'],
    averageWeightG: 12,
    confidence: 'low',
    description: 'Single strawberry (highly variable)',
    source: 'Industry average',
  },
  'blueberry': {
    canonicalName: 'blueberry',
    aliases: ['single blueberry'],
    averageWeightG: 2,
    confidence: 'low',
    description: 'Single blueberry',
    source: 'Industry average',
  },
  'avocado': {
    canonicalName: 'avocado',
    aliases: ['medium avocado', 'hass avocado'],
    averageWeightG: 150,
    confidence: 'medium',
    description: 'Single medium Hass avocado (Australian standard)',
    source: 'Australian Avocado Industry',
  },

  // DAIRY
  'milk': {
    canonicalName: 'milk',
    aliases: ['cow milk', 'dairy milk'],
    averageWeightG: 1000,
    confidence: 'high',
    description: '1 cup milk (mL basis, ~240mL = 250g)',
    source: 'Food standards',
  },
  'cheese': {
    canonicalName: 'cheese',
    aliases: ['cheese slice', 'cheese block', 'cheddar', 'mozzarella'],
    averageWeightG: 30,
    confidence: 'medium',
    description: 'Single cheese slice or small piece',
    source: 'Industry standard',
  },
  'yogurt': {
    canonicalName: 'yogurt',
    aliases: ['greek yogurt', 'natural yogurt'],
    averageWeightG: 200,
    confidence: 'medium',
    description: 'Single serving container of yogurt',
    source: 'Industry standard',
  },

  // GRAINS & LEGUMES
  'bread': {
    canonicalName: 'bread',
    aliases: ['slice of bread', 'bread slice'],
    averageWeightG: 30,
    confidence: 'medium',
    description: 'Single slice of bread (standard loaf)',
    source: 'Industry standard',
  },
  'rice': {
    canonicalName: 'rice',
    aliases: ['rice grain', 'rice serving'],
    averageWeightG: 75,
    confidence: 'medium',
    description: 'Single serving cooked rice (dry ~45g)',
    source: 'Industry standard',
  },
  'pasta': {
    canonicalName: 'pasta',
    aliases: ['pasta serving'],
    averageWeightG: 100,
    confidence: 'medium',
    description: 'Single serving cooked pasta (dry ~80g)',
    source: 'Industry standard',
  },
  'bean': {
    canonicalName: 'bean',
    aliases: ['canned bean', 'can of beans'],
    averageWeightG: 200,
    confidence: 'medium',
    description: 'Single can of beans (Australian standard 400g cans)',
    source: 'Industry standard',
  },
  'lentil': {
    canonicalName: 'lentil',
    aliases: ['lentil serving'],
    averageWeightG: 100,
    confidence: 'medium',
    description: 'Single serving of cooked lentils',
    source: 'Industry standard',
  },

  // HERBS & SEASONINGS
  'basil': {
    canonicalName: 'basil',
    aliases: ['basil bunch'],
    averageWeightG: 10,
    confidence: 'low',
    description: 'Single bunch of basil (highly variable)',
    source: 'Industry average',
  },
  'parsley': {
    canonicalName: 'parsley',
    aliases: ['parsley bunch'],
    averageWeightG: 15,
    confidence: 'low',
    description: 'Single bunch of parsley',
    source: 'Industry average',
  },
  'cilantro': {
    canonicalName: 'cilantro',
    aliases: ['coriander', 'cilantro bunch'],
    averageWeightG: 15,
    confidence: 'low',
    description: 'Single bunch of cilantro/coriander',
    source: 'Industry average',
  },

  // CANNED/PACKAGED ITEMS
  'canned tomato': {
    canonicalName: 'canned tomato',
    aliases: ['tomato can', 'tinned tomato'],
    averageWeightG: 400,
    confidence: 'high',
    description: 'Standard 400g can of canned tomatoes (Australian)',
    source: 'Industry standard can size',
  },
  'coconut milk': {
    canonicalName: 'coconut milk',
    aliases: ['can of coconut milk', 'tinned coconut milk'],
    averageWeightG: 400,
    confidence: 'high',
    description: 'Standard 400g can of coconut milk (Australian)',
    source: 'Industry standard can size',
  },

  // SPICES + DRY GOODS often expressed as counts
  // These exist so a recipe that says "2 cinnamon sticks" and another that
  // says "4 g cinnamon" can be reconciled in the grocery list instead of
  // surfacing as two separate rows.
  'cinnamon': {
    canonicalName: 'cinnamon',
    aliases: ['cinnamon stick', 'cinnamon sticks'],
    averageWeightG: 3,
    confidence: 'high',
    description: 'Single cinnamon stick (~7 cm)',
    source: 'Industry standard',
  },
  'bay leaf': {
    canonicalName: 'bay leaf',
    aliases: ['bay leaves', 'dried bay leaf'],
    averageWeightG: 0.2,
    confidence: 'high',
    description: 'Single dried bay leaf',
    source: 'Industry standard',
  },
  'star anise': {
    canonicalName: 'star anise',
    aliases: ['whole star anise'],
    averageWeightG: 1,
    confidence: 'high',
    description: 'Single whole star anise pod',
    source: 'Industry standard',
  },
  'cardamom': {
    canonicalName: 'cardamom',
    aliases: ['cardamom pod', 'cardamom pods', 'green cardamom'],
    averageWeightG: 0.3,
    confidence: 'high',
    description: 'Single cardamom pod',
    source: 'Industry standard',
  },
  'clove': {
    canonicalName: 'clove',
    aliases: ['cloves', 'whole clove', 'whole cloves'],
    averageWeightG: 0.1,
    confidence: 'high',
    description: 'Single whole clove',
    source: 'Industry standard',
  },

  // EXPANDED COVERAGE — common count-able produce/proteins so a "piece" row
  // can fold into a "g" row of the same canonical ingredient. Keys here must
  // match what normalizeIngredientName() emits (the alias-map canonical).
  'spring onion': {
    canonicalName: 'spring onion',
    aliases: ['scallion', 'green onion'],
    averageWeightG: 15,
    confidence: 'medium',
    description: 'Single spring onion / scallion stalk',
    source: 'Industry standard',
  },
  'eggplant': {
    canonicalName: 'eggplant',
    aliases: ['aubergine'],
    averageWeightG: 250,
    confidence: 'medium',
    description: 'Single medium eggplant',
    source: 'ABS Vegetable Standards',
  },
  'sweet potato': {
    canonicalName: 'sweet potato',
    aliases: ['kumara'],
    averageWeightG: 200,
    confidence: 'medium',
    description: 'Single medium sweet potato',
    source: 'ABS Vegetable Standards',
  },
  'leek': {
    canonicalName: 'leek',
    aliases: ['leeks'],
    averageWeightG: 150,
    confidence: 'medium',
    description: 'Single medium leek (trimmed)',
    source: 'Industry standard',
  },
  'cauliflower': {
    canonicalName: 'cauliflower',
    aliases: ['cauliflower head'],
    averageWeightG: 600,
    confidence: 'medium',
    description: 'Single medium cauliflower head',
    source: 'ABS Vegetable Standards',
  },
  'corn': {
    canonicalName: 'corn',
    aliases: ['corn cob', 'corn on the cob', 'sweetcorn'],
    averageWeightG: 250,
    confidence: 'medium',
    description: 'Single corn cob',
    source: 'Industry standard',
  },
  'chili': {
    canonicalName: 'chili',
    aliases: ['chilli', 'chili pepper', 'chilli pepper'],
    averageWeightG: 15,
    confidence: 'medium',
    description: 'Single fresh chili',
    source: 'Industry standard',
  },
  'sausage': {
    canonicalName: 'sausage',
    aliases: ['sausages', 'pork sausage', 'beef sausage'],
    averageWeightG: 75,
    confidence: 'medium',
    description: 'Single sausage',
    source: 'Industry standard',
  },
  'bacon': {
    canonicalName: 'bacon',
    aliases: ['bacon rasher', 'rasher'],
    averageWeightG: 30,
    confidence: 'medium',
    description: 'Single bacon rasher',
    source: 'Industry standard',
  },
  'mango': {
    canonicalName: 'mango',
    aliases: ['mangoes', 'mangos'],
    averageWeightG: 200,
    confidence: 'medium',
    description: 'Single medium mango (flesh ~140g)',
    source: 'ABS Fruit Standards',
  },
  'pear': {
    canonicalName: 'pear',
    aliases: ['pears'],
    averageWeightG: 180,
    confidence: 'medium',
    description: 'Single medium pear',
    source: 'ABS Fruit Standards',
  },
  'peach': {
    canonicalName: 'peach',
    aliases: ['peaches'],
    averageWeightG: 150,
    confidence: 'medium',
    description: 'Single medium peach',
    source: 'ABS Fruit Standards',
  },
};

/**
 * Standard container volume (mL) for LIQUID ingredients that are normally sold
 * by the can/tin/carton/bottle. Used to reconcile a volume row (mL) with a
 * count row (the count collapses every container unit to "piece", so a "piece"
 * of these ingredients reliably means one standard container).
 *
 * Deliberately curated and small: only liquids where a counted unit is
 * unambiguously a container — never produce like lemon/onion where "piece"
 * means a whole item, not a measured volume. Anything not listed here is left
 * for the manual "combine duplicates" flow rather than guessed.
 *
 * Keys must match what normalizeIngredientName() emits (the alias-map canonical).
 */
export const CONTAINER_VOLUME_ML_AU: Record<string, number> = {
  'coconut milk': 400, // standard AU can
  'coconut cream': 400, // standard AU can
  'evaporated milk': 375, // standard AU can
  'condensed milk': 395, // standard AU can
  'chicken broth': 500, // carton/can portion
  'beef broth': 500,
  'vegetable broth': 500,
  'passata': 680, // standard bottle
  'tomato passata': 680,
};

/**
 * Returns the standard container volume (mL) for a counted liquid, or null when
 * the ingredient isn't a known container liquid (so the caller should NOT
 * attempt a count→volume conversion).
 */
export function getContainerVolumeML(ingredientName: string): number | null {
  const normalized = ingredientName.toLowerCase().trim();
  return CONTAINER_VOLUME_ML_AU[normalized] ?? null;
}

/**
 * Density (grams per millilitre) for common liquids, so a weight row (g) and a
 * volume row (mL) of the SAME liquid can be reconciled when manually combined
 * (e.g. "200 g honey" + "30 mL honey"). Water ≈ 1.0; fats are lighter, syrups
 * heavier.
 *
 * Curated to liquids/pourables only — never applied to solids, where "g" and a
 * stray "mL" would not represent the same thing. Keys must match what
 * normalizeIngredientName() emits (the alias-map canonical).
 */
export const LIQUID_DENSITY_G_PER_ML_AU: Record<string, number> = {
  'water': 1.0,
  'milk': 1.03,
  'almond milk': 1.0,
  'coconut milk': 1.0,
  'coconut cream': 1.0,
  'cream': 1.01,
  'yogurt': 1.03,
  'olive oil': 0.91,
  'oil': 0.91,
  'vegetable oil': 0.91,
  'canola oil': 0.91,
  'sunflower oil': 0.92,
  'sesame oil': 0.92,
  'honey': 1.42,
  'maple syrup': 1.37,
  'soy sauce': 1.2,
  'vinegar': 1.01,
  'chicken broth': 1.0,
  'beef broth': 1.0,
  'vegetable broth': 1.0,
  'orange juice': 1.04,
  'lemon juice': 1.03,
  'lime juice': 1.03,
  'wine': 0.99,
};

/**
 * Returns the density (g per mL) for a known liquid, or null when the
 * ingredient isn't a recognised liquid (so the caller should NOT attempt a
 * weight↔volume conversion).
 */
export function getLiquidDensityGPerMl(ingredientName: string): number | null {
  const normalized = ingredientName.toLowerCase().trim();
  return LIQUID_DENSITY_G_PER_ML_AU[normalized] ?? null;
}

/**
 * Get average weight for an ingredient with confidence level
 * Returns null if no mapping exists
 * Supports both canonical names and aliases
 */
export function getAverageWeightWithConfidence(
  ingredientName: string
): { weightG: number; confidence: ConfidenceLevel; description: string } | null {
  const normalized = ingredientName.toLowerCase().trim();

  // First try exact match on canonical name
  const entry = AVERAGE_WEIGHT_LOOKUP_AU[normalized];
  if (entry) {
    return {
      weightG: entry.averageWeightG,
      confidence: entry.confidence,
      description: entry.description,
    };
  }

  // Then try to find via aliases
  for (const [_, lookupEntry] of Object.entries(AVERAGE_WEIGHT_LOOKUP_AU)) {
    if (lookupEntry.aliases.includes(normalized)) {
      return {
        weightG: lookupEntry.averageWeightG,
        confidence: lookupEntry.confidence,
        description: lookupEntry.description,
      };
    }
  }

  return null;
}

/**
 * Check if lookup has high confidence for automatic conversion
 */
export function hasHighConfidenceWeight(ingredientName: string): boolean {
  const lookup = getAverageWeightWithConfidence(ingredientName);
  return lookup ? lookup.confidence === 'high' : false;
}

/**
 * Get only high/medium confidence entries for conversion
 */
export function shouldConvertCountToWeight(ingredientName: string): boolean {
  const lookup = getAverageWeightWithConfidence(ingredientName);
  if (!lookup) return false;
  return lookup.confidence === 'high' || lookup.confidence === 'medium';
}
