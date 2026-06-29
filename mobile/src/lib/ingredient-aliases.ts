import { stripDescriptors } from './ingredient-normalizer';

/**
 * Unit aliases for combining similar measurement units
 */
const UNIT_ALIASES: Record<string, string> = {
  // Volume measurements - teaspoon
  'teaspoon': 'tsp',
  'teaspoons': 'tsp',
  'tsp': 'tsp',
  'tsps': 'tsp',
  't': 'tsp',

  // Volume measurements - tablespoon
  'tablespoon': 'tbsp',
  'tablespoons': 'tbsp',
  'tbsp': 'tbsp',
  'tbsps': 'tbsp',
  'tb': 'tbsp',
  'tbs': 'tbsp',

  // Volume measurements - cup
  'cup': 'cup',
  'cups': 'cup',
  'c': 'cup',

  // Volume measurements - milliliter
  'milliliter': 'ml',
  'milliliters': 'ml',
  'mls': 'ml',
  'ml': 'ml',

  // Volume measurements - liter
  'liter': 'l',
  'liters': 'l',
  'litre': 'l',
  'litres': 'l',
  'l': 'l',

  // Weight measurements - gram
  'gram': 'g',
  'grams': 'g',
  'gs': 'g',
  'g': 'g',

  // Weight measurements - kilogram
  'kilogram': 'kg',
  'kilograms': 'kg',
  'kg': 'kg',

  // Weight measurements - ounce
  'ounce': 'oz',
  'ounces': 'oz',
  'oz': 'oz',

  // Weight measurements - pound
  'pound': 'lb',
  'pounds': 'lb',
  'lb': 'lb',
  'lbs': 'lb',

  // Count measurements
  'piece': 'piece',
  'pieces': 'piece',
  'piece(s)': 'piece',
  'item': 'piece',
  'items': 'piece',
  'whole': 'piece',
  'head': 'piece',
  'heads': 'piece',
  'can': 'piece',
  'cans': 'piece',
  'jar': 'piece',
  'jars': 'piece',
  'bottle': 'piece',
  'bottles': 'piece',
  'slice': 'piece',
  'slices': 'piece',
  'strip': 'piece',
  'strips': 'piece',
  'stalk': 'piece',
  'stalks': 'piece',
  'clove': 'piece',
  'cloves': 'piece',
  'bulb': 'piece',
  'bulbs': 'piece',
  'bunch': 'piece',
  'bunches': 'piece',
  'handful': 'piece',
  'handfuls': 'piece',
  'pinch': 'piece',
  'pinches': 'piece',
};

/**
 * Ingredient alias mapping for intelligent combining
 * Maps common ingredient name variations to a canonical form
 */

const INGREDIENT_ALIASES: Record<string, string[]> = {
  // Herbs and seasonings
  'italian herbs': ['italian seasoning', 'italian herb blend', 'italian mixed herbs'],
  'garlic powder': ['garlic salt (garlic portion)', 'powdered garlic', 'garlic dust'],
  'onion powder': ['powdered onion', 'onion dust'],
  'black pepper': ['ground black pepper', 'cracked black pepper', 'pepper'],
  'sea salt': ['kosher salt', 'table salt', 'salt'],
  'paprika': ['smoked paprika', 'hungarian paprika', 'sweet paprika'],
  'chili powder': ['red pepper powder', 'chile powder', 'chilli powder'],
  'cayenne pepper': ['cayenne', 'red pepper', 'ground cayenne'],
  'cumin': ['ground cumin', 'cumin powder'],
  'oregano': ['dried oregano', 'fresh oregano'],
  'basil': ['dried basil', 'fresh basil'],
  'thyme': ['dried thyme', 'fresh thyme'],
  'rosemary': ['dried rosemary', 'fresh rosemary'],
  'parsley': ['dried parsley', 'fresh parsley', 'italian parsley'],
  'cilantro': ['fresh cilantro', 'coriander leaves', 'coriander', 'fresh coriander', 'corianders'],
  'dill': ['dried dill', 'fresh dill', 'dill weed'],

  // Common ingredients
  'olive oil': ['extra virgin olive oil', 'virgin olive oil', 'pure olive oil'],
  'butter': ['unsalted butter', 'salted butter', 'margarine'],
  'milk': ['whole milk', 'skim milk', 'low-fat milk', '2% milk', 'regular milk'],
  'yogurt': ['greek yogurt', 'plain yogurt', 'vanilla yogurt', 'yoghurt', 'greek yoghurt', 'plain yoghurt'],
  'cheese': ['cheddar cheese', 'mozzarella cheese', 'parmesan cheese'],
  'flour': ['all-purpose flour', 'wheat flour', 'bleached flour', 'unbleached flour'],
  'sugar': ['white sugar', 'granulated sugar', 'caster sugar'],
  'brown sugar': ['light brown sugar', 'dark brown sugar'],
  'honey': ['raw honey', 'organic honey'],
  'vinegar': ['white vinegar', 'apple cider vinegar', 'balsamic vinegar', 'red wine vinegar'],
  'soy sauce': ['low-sodium soy sauce', 'tamari', 'shoyu'],
  'tomato sauce': ['marinara sauce', 'tomato puree', 'tomato paste'],
  'chicken broth': ['chicken stock', 'chicken bouillon'],
  'beef broth': ['beef stock', 'beef bouillon'],
  'vegetable broth': ['vegetable stock'],

  // Vegetables
  'onion': ['yellow onion', 'white onion', 'red onion', 'sweet onion', 'onions'],
  'garlic': ['garlic cloves', 'minced garlic', 'garlic puree', 'garlics'],
  'bell pepper': ['red bell pepper', 'green bell pepper', 'yellow bell pepper', 'orange bell pepper', 'bell peppers', 'capsicum', 'capsicums', 'red capsicum', 'green capsicum', 'yellow capsicum'],
  'tomato': ['fresh tomato', 'cherry tomato', 'roma tomato', 'beefsteak tomato', 'tomatoes'],
  'lettuce': ['romaine lettuce', 'iceberg lettuce', 'leaf lettuce', 'mixed greens', 'lettuces'],
  'spinach': ['fresh spinach', 'baby spinach', 'frozen spinach', 'spinaches'],
  'broccoli': ['fresh broccoli', 'broccoli florets', 'frozen broccoli', 'broccolis'],
  'carrot': ['fresh carrot', 'baby carrot', 'shredded carrot', 'carrots'],
  'cucumber': ['english cucumber', 'regular cucumber', 'cucumbers'],
  'potato': ['russet potato', 'red potato', 'yellow potato', 'potatoes'],
  'rice': ['white rice', 'brown rice', 'jasmine rice', 'basmati rice', 'rices'],

  // Proteins
  'chicken': ['chicken breast', 'chicken thigh', 'ground chicken', 'chickens'],
  'beef': ['ground beef', 'beef steak', 'beef chuck', 'lean beef', 'beefs'],
  'pork': ['ground pork', 'pork chop', 'pork shoulder', 'porks'],
  'salmon': ['atlantic salmon', 'wild salmon', 'salmon fillet', 'salmons'],
  'egg': ['chicken egg', 'whole egg', 'large egg', 'eggs', 'hard boiled egg', 'hard boiled eggs', 'hard-boiled egg', 'hard-boiled eggs', 'boiled egg', 'boiled eggs', 'soft boiled egg', 'soft boiled eggs', 'soft-boiled egg', 'soft-boiled eggs', 'poached egg', 'poached eggs', 'fried egg', 'fried eggs', 'scrambled egg', 'scrambled eggs'],

  // More vegetables (varieties + AU/UK spellings so they canonicalize & combine)
  'spring onion': ['scallion', 'scallions', 'green onion', 'green onions', 'spring onions'],
  'eggplant': ['aubergine', 'aubergines', 'eggplants'],
  'sweet potato': ['sweet potatoes', 'kumara', 'kumaras'],
  'zucchini': ['courgette', 'courgettes', 'zucchinis'],
  'leek': ['leeks'],
  'cauliflower': ['cauliflowers', 'cauliflower florets'],
  'mushroom': ['button mushroom', 'button mushrooms', 'cremini', 'crimini', 'portobello', 'swiss brown mushroom', 'swiss brown mushrooms', 'mushrooms'],
  'green bean': ['green beans', 'french bean', 'french beans', 'string bean', 'string beans'],
  'chili': ['chilli', 'chillies', 'chilies', 'chillis', 'chili pepper', 'chilli pepper', 'red chili', 'green chili', 'red chilli', 'green chilli'],
  'corn': ['corn cob', 'corn cobs', 'corn on the cob', 'sweetcorn', 'sweet corn', 'corns'],

  // More proteins
  'shrimp': ['prawn', 'prawns', 'shrimps', 'king prawn', 'king prawns', 'school prawn', 'school prawns'],
  'sausage': ['sausages', 'pork sausage', 'pork sausages', 'beef sausage', 'beef sausages', 'italian sausage'],
  'bacon': ['bacon rasher', 'bacon rashers', 'rasher', 'rashers', 'streaky bacon'],

  // More fruit
  'mango': ['mangoes', 'mangos'],
  'pear': ['pears'],
  'peach': ['peaches'],

  // Legumes
  'chickpea': ['chickpeas', 'chick pea', 'chick peas', 'garbanzo', 'garbanzo bean', 'garbanzo beans'],

  // Dairy alternatives
  'almond milk': ['unsweetened almond milk', 'sweetened almond milk'],
  'coconut milk': ['canned coconut milk', 'fresh coconut milk'],
};

/**
 * Normalizes a unit of measurement to a canonical form
 */
export function normalizeUnit(unit: string): string {
  const normalized = unit.toLowerCase().trim();
  return UNIT_ALIASES[normalized] || normalized;
}

/**
 * Simple pluralization rules to convert plurals to singular forms
 */
function singularize(word: string): string {
  // Handle common irregular plurals
  const irregulars: Record<string, string> = {
    'tomatoes': 'tomato',
    'potatoes': 'potato',
    'berries': 'berry',
    'cherries': 'cherry',
    'chillies': 'chilli',
    'chilies': 'chili',
    'babies': 'baby',
    'ladies': 'lady',
    'leaves': 'leaf',
    'knives': 'knife',
    'wives': 'wife',
    'lives': 'life',
    'elves': 'elf',
    'loaves': 'loaf',
    'halves': 'half',
    'calves': 'calf',
  };

  if (irregulars[word]) {
    return irregulars[word];
  }

  // Handle common plural endings
  if (word.endsWith('ies')) {
    return word.slice(0, -3) + 'y';
  }
  if (word.endsWith('ves')) {
    return word.slice(0, -3) + 'f';
  }
  if (word.endsWith('oes')) {
    return word.slice(0, -2);
  }
  if (word.endsWith('es')) {
    return word.slice(0, -2);
  }
  if (word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1);
  }

  return word;
}

/**
 * Normalizes an ingredient name to a canonical form
 * Handles common aliases, variations, and plurals
 */
export function normalizeIngredientName(name: string): string {
  const lower = name.toLowerCase().trim();

  // Strip prep/cut descriptors (e.g. "cooked", "day-old") BEFORE the alias lookup so
  // "cooked day-old jasmine rice" → "jasmine rice" → alias → "rice".
  // stripDescriptors only removes known descriptor words, so genuinely distinct
  // varieties are preserved ("sweet potato" stays "sweet potato", not "potato").
  // Fall back to the original when stripping leaves nothing (e.g. a descriptor-only name).
  const stripped = stripDescriptors(name).trim();
  let normalized = stripped.length > 0 ? stripped : lower;

  // First, try to find it in the aliases as-is
  for (const [canonical, aliases] of Object.entries(INGREDIENT_ALIASES)) {
    if (canonical.toLowerCase() === normalized) {
      return canonical;
    }
    if (aliases.some(alias => alias.toLowerCase() === normalized)) {
      return canonical;
    }
  }

  // If not found, singularize each word and try again
  const words = normalized.split(' ');
  const singularWords = words.map(word => singularize(word));
  const singularized = singularWords.join(' ');

  // Check aliases again with singularized form
  for (const [canonical, aliases] of Object.entries(INGREDIENT_ALIASES)) {
    if (canonical.toLowerCase() === singularized) {
      return canonical;
    }
    if (aliases.some(alias => alias.toLowerCase() === singularized)) {
      return canonical;
    }
  }

  // If still not found, return the singularized form
  return singularized;
}

/**
 * Checks if two ingredient names should be combined
 * Returns true only if they refer to the same ingredient
 */
export function shouldCombineIngredients(
  name1: string,
  name2: string,
  unit1: string,
  unit2: string,
  category1: string,
  category2: string
): boolean {
  // Different units or categories = don't combine
  if (unit1 !== unit2 || category1 !== category2) {
    return false;
  }

  // Normalize names and compare
  const normalized1 = normalizeIngredientName(name1);
  const normalized2 = normalizeIngredientName(name2);

  return normalized1 === normalized2;
}

/**
 * Gets the canonical (display) name for an ingredient
 */
export function getCanonicalIngredientName(name: string): string {
  const normalized = normalizeIngredientName(name);

  // Return the capitalized canonical form
  return normalized
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
