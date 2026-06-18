/**
 * Robust Ingredient Category Mapper
 * Handles edge cases and ensures correct categorization
 * Prevents miscategorization like butternut→butter, peanut butter misplacement, etc.
 */

export type IngredientCategory = 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other';

/**
 * Comprehensive ingredient patterns for category determination
 * Uses word-boundary matching to avoid false positives like "butternut" → "butter"
 */
const CATEGORY_PATTERNS: Record<IngredientCategory, RegExp[]> = {
  produce: [
    /\b(apple|apples|banana|bananas|orange|oranges|grape|grapes|berry|berries|blueberry|strawberry|raspberry|blackberry|watermelon|melon|cantaloupe|peach|pear|plum|pineapple|mango|papaya|kiwi|lemon|lime|grapefruit|pomegranate)\b/i,
    /\b(tomato|tomatoes|lettuce|spinach|kale|arugula|cabbage|broccoli|cauliflower|carrot|carrots|celery|cucumber|zucchini|squash|bell pepper|pepper|peppers|onion|onions|garlic|ginger|potato|potatoes|sweet potato|yam|beet|beets|radish|parsnip|turnip|brussels sprout|asparagus|green bean|pea|peas|corn|pumpkin|butternut|acorn squash)\b/i,
    /\b(herb|herbs|parsley|cilantro|basil|oregano|thyme|rosemary|mint|dill|tarragon)\b/i,
    /\b(mushroom|mushrooms|truffle|chanterelle|cremini|portobello|shiitake)\b/i,
    /\b(avocado|avocados|cucumber|cucumbers)\b/i,
  ],

  meat: [
    /\b(chicken|beef|pork|lamb|turkey|duck|venison|rabbit|veal|goat|mutton)\b/i,
    /\b(ground chicken|ground beef|ground pork|ground turkey|ground lamb|minced meat|mincemeat)\b/i,
    /\b(chicken breast|chicken thigh|chicken leg|drumstick|wing|breasts|thighs)\b/i,
    /\b(beef steak|beef roast|beef chuck|beef brisket|ground beef|sirloin|ribeye|filet|fillet)\b/i,
    /\b(pork chop|pork loin|pork shoulder|pork belly|ham|bacon|sausage|kielbasa|pepperoni|prosciutto)\b/i,
    /\b(fish|salmon|trout|cod|halibut|tilapia|tuna|mackerel|sardine|anchovy|herring|bass|snapper)\b/i,
    /\b(shrimp|prawns|lobster|crab|crayfish|clams|mussels|oyster|scallop)\b/i,
    /\b(meat|protein|protein source|animal protein)\b/i,
  ],

  dairy: [
    /\b(milk|cream|cheese|butter|yogurt|yoghurt|buttermilk|sour cream|whey|ghee|cottage cheese|ricotta|mozzarella|parmesan|cheddar|feta|brie|gouda|halloumi|paneer|cream cheese|mascarpone|kefir|ice cream)\b/i,
    /\b(greek yogurt|greek yoghurt|sour cream|heavy cream|whipped cream|crème|crema)\b/i,
    /\b(lactose|casein|milk solids|milk powder|milk fat|dairy|whey protein)\b/i,
    // IMPORTANT: Exclude false positives
    /(?<!peanut\s)\bbutter\b/i, // "butter" but NOT "peanut butter"
  ],

  pantry: [
    /\b(oil|olive oil|vegetable oil|coconut oil|sesame oil|canola oil|sunflower oil|grapeseed oil|avocado oil)\b/i,
    /\b(salt|sea salt|table salt|himalayan salt|kosher salt)\b/i,
    /\b(pepper|black pepper|white pepper|peppercorn|ground pepper)\b/i,
    /\b(flour|wheat flour|all-purpose flour|cornmeal|cornstarch|arrowroot|tapioca)\b/i,
    /\b(sugar|white sugar|brown sugar|cane sugar|honey|agave|maple syrup|molasses|date|dates)\b/i,
    /\b(spice|spices|cumin|paprika|turmeric|cinnamon|nutmeg|ginger|clove|cloves|cardamom|coriander|chili|chilli|cayenne|garlic powder|onion powder)\b/i,
    /\b(rice|white rice|brown rice|basmati|jasmine|arborio|wild rice)\b/i,
    /\b(pasta|noodle|noodles|spaghetti|fettuccine|penne|linguine|ravioli|tortellini)\b/i,
    /\b(bread|loaf|baguette|ciabatta|focaccia|pita|naan|tortilla|wrap|roti|chapati)\b/i,
    /\b(cereal|oat|oats|granola|muesli|cornflakes|wheat germ)\b/i,
    /\b(bean|beans|lentil|lentils|chickpea|chickpeas|daal|dal|pulses?|legume)\b/i,
    /\b(nut|nuts|almond|walnut|cashew|pecan|pistachio|peanut|peanut butter|nut butter|hazelnut|macadamia|brazil nut)\b/i,
    /\b(seed|seeds|sesame|sunflower|pumpkin|flax|chia)\b/i,
    /\b(canned|can|jar|bottle|broth|stock|sauce|vinegar|soy sauce|worcestershire|hot sauce|salsa|jam|jelly|peanut butter|tahini)\b/i,
    /\b(vinegar|balsamic|apple cider|rice vinegar|white vinegar)\b/i,
    /\b(condiment|ketchup|mustard|mayo|mayonnaise|relish)\b/i,
    /\b(extract|vanilla extract|almond extract)\b/i,
    /\b(yeast|baking powder|baking soda)\b/i,
    /\b(broth|stock|bouillon|bone broth|vegetable broth|chicken broth|beef broth)\b/i,
    /\b(tofu|tempeh|textured vegetable protein|tvp|edamame)\b/i,
  ],

  frozen: [
    /\b(frozen|freezer|ice cream|frozen vegetable|frozen fruit|frozen berry|frozen pea|frozen corn|frozen mixed vegetable)\b/i,
    /\b(frozen chicken|frozen beef|frozen fish|frozen shrimp|frozen salmon|frozen cod|frozen vegetable blend)\b/i,
  ],

  bakery: [
    /\b(bread|loaf|baguette|roll|bun|pastry|croissant|donut|bagel|muffin|cake|cookie|biscuit|scone|waffle|pancake|crepe)\b/i,
    /\b(tortilla|wrap|pita|naan|roti|chapati|focaccia|ciabatta|sourdough|whole wheat bread|white bread|rye bread)\b/i,
    /\b(yeast bread|leavened bread|unleavened bread)\b/i,
  ],

  other: [
    /\b(misc|miscellaneous|other|unknown)\b/i,
  ],
};

/**
 * Explicit exclusion patterns - items that should NOT be categorized to certain categories
 * Format: "ingredient pattern" → list of categories to EXCLUDE
 */
const EXCLUSION_PATTERNS: Record<string, IngredientCategory[]> = {
  'butternut': ['dairy'], // butternut squash, butternut lettuce → NOT dairy
  'peanut butter': ['dairy'], // peanut butter → pantry, NOT dairy
  'peanut': ['dairy', 'meat'], // peanut → pantry
  'coconut': ['dairy'], // coconut oil/milk → pantry or other, NOT dairy
  'tahini': ['dairy'], // tahini (sesame paste) → pantry, NOT dairy
  'almond milk': ['dairy'], // almond milk → pantry, NOT dairy
  'oat milk': ['dairy'],
  'soy milk': ['dairy'],
  'rice milk': ['dairy'],
  'nut milk': ['dairy'],
  'cream of': ['dairy'], // cream of mushroom soup → pantry
};

/**
 * Determine ingredient category with robust pattern matching
 * Prevents false positives and edge cases
 * @param ingredientName Raw ingredient name from recipe
 * @returns Best-guess category or 'other' if uncertain
 */
export function determineIngredientCategory(ingredientName: string): IngredientCategory {
  const lower = ingredientName.toLowerCase().trim();

  // ── Check exclusion patterns first (prevent miscategorization) ──
  for (const [pattern, excludedCategories] of Object.entries(EXCLUSION_PATTERNS)) {
    if (lower.includes(pattern)) {
      // Find first category that matches AND is not excluded
      for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
        if (excludedCategories.includes(category as IngredientCategory)) {
          continue; // Skip excluded categories
        }
        for (const regex of patterns) {
          if (regex.test(ingredientName)) {
            return category as IngredientCategory;
          }
        }
      }
    }
  }

  // ── Standard pattern matching ──
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    for (const regex of patterns) {
      if (regex.test(ingredientName)) {
        return category as IngredientCategory;
      }
    }
  }

  // ── Default fallback ──
  return 'other';
}

/**
 * Build category guidance for AI prompt
 * Provides clear rules to help AI categorize ingredients correctly
 */
export function getCategoryGuidancePrompt(): string {
  return `
INGREDIENT CATEGORY GUIDELINES (use these to assign the "category" field):

⚠️ CRITICAL EDGE CASES (common miscategorizations):
• "butternut squash" or "butternut lettuce" → PRODUCE (NOT dairy, despite "butter" in name)
• "peanut butter" → PANTRY (NOT dairy, it's a nut product)
• "peanut" → PANTRY (nuts/seeds category, NOT meat/dairy)
• "tahini" → PANTRY (sesame paste, NOT dairy)
• "almond milk" / "oat milk" / "soy milk" / "rice milk" → PANTRY (NOT dairy)
• "coconut oil" / "coconut milk" → PANTRY (NOT dairy, use "pantry" for plant-based fats)

📋 CATEGORY DEFINITIONS:

PRODUCE: Fresh fruits, vegetables, herbs, mushrooms
  Examples: apple, tomato, lettuce, spinach, carrot, onion, garlic, bell pepper, herbs

MEAT: All animal proteins (meat, poultry, fish, seafood)
  Examples: chicken, beef, salmon, shrimp, turkey, pork, lamb, bacon

DAIRY: Only true dairy products (milk-based)
  Examples: milk, cheese, butter, cream, yogurt, ghee, sour cream, cottage cheese
  ⚠️ NOT dairy: plant-based milks, nut butters, coconut products

PANTRY: Shelf-stable ingredients, processed foods, nut products, oils, spices
  Examples: rice, pasta, flour, sugar, salt, pepper, oil, peanut butter, honey, canned goods, nuts, beans

FROZEN: Frozen vegetables, frozen fruits, frozen proteins
  Examples: frozen broccoli, frozen berries, frozen chicken, frozen fish

BAKERY: Bread products (fresh or packaged)
  Examples: bread, baguette, rolls, tortilla, pita, pastries

OTHER: Miscellaneous items that don't fit above
  Use rarely — try to fit items into primary categories when possible

🎯 DECISION RULES:
1. If item is plant-based (vegetables, fruits, nuts, seeds) → PRODUCE or PANTRY
2. If item contains "butter" but isn't dairy butter → likely PRODUCE or PANTRY (check the main ingredient)
3. If item is a milk/cream product → DAIRY
4. If item is a plant-based milk alternative → PANTRY
5. When in doubt between PANTRY and PRODUCE: Use PANTRY for shelf-stable, PRODUCE for fresh`;
}
