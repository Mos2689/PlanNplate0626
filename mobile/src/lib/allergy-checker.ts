import { CuratedMealPlan } from './curated-meal-plans';
import { Recipe } from './store';

// Common allergen keywords mapping
// Each allergen maps to ingredient names that may contain it
const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  'Peanuts': ['peanut', 'peanuts', 'peanut butter', 'groundnut', 'arachis oil', 'peanut flour'],
  'Tree Nuts': ['almond', 'almonds', 'walnut', 'walnuts', 'cashew', 'cashews', 'pecan', 'pecans', 'pistachio', 'pistachios', 'hazelnut', 'hazelnuts', 'macadamia', 'brazil nut', 'brazil nuts', 'pine nut', 'pine nuts', 'chestnut', 'chestnuts', 'filbert', 'hickory nut', 'litchi', 'lychee', 'ginkgo nut', 'pili nut', 'shea nut', 'acorn', 'praline', 'marzipan', 'nougat', 'nut butter', 'nut paste', 'nut flour', 'nut milk', 'almond milk', 'cashew cream'],
  'Milk': ['milk', 'cream', 'butter', 'cheese', 'yogurt', 'yoghurt', 'greek yogurt', 'feta', 'parmesan', 'mozzarella', 'cheddar', 'ricotta', 'cottage cheese', 'sour cream', 'whey', 'casein', 'ghee', 'half and half', 'ice cream', 'paneer', 'halloumi', 'brie', 'gouda', 'swiss cheese', 'cream cheese', 'custard', 'pudding', 'dairy', 'buttermilk', 'kefir', 'curd', 'lactose', 'lactalbumin', 'lactoglobulin', 'milk powder', 'milk solids'],
  'Eggs': ['egg', 'eggs', 'egg white', 'egg yolk', 'powdered egg', 'mayonnaise', 'mayo', 'meringue', 'aioli', 'hollandaise', 'béarnaise', 'custard', 'quiche', 'mousse', 'soufflé', 'omelet', 'crepe', 'batter', 'breading', 'cake', 'cookie', 'noodle', 'pasta', 'egg noodle', 'lecithin', 'salad dressing'],
  'Wheat': ['wheat', 'flour', 'bread', 'pasta', 'noodles', 'spaghetti', 'penne', 'fettuccine', 'linguine', 'couscous', 'bulgur', 'semolina', 'breadcrumbs', 'croutons', 'tortilla', 'pita', 'naan', 'baguette', 'croissant', 'pancake', 'waffle', 'cereal', 'granola', 'farro', 'spelt', 'seitan', 'panko', 'bran', 'germ', 'gluten', 'vital wheat gluten', 'kamut', 'einkorn', 'durum'],
  'Soy': ['soy', 'soya', 'soybean', 'tofu', 'tempeh', 'edamame', 'miso', 'soy sauce', 'soy milk', 'shoyu', 'tamari', 'soy yogurt', 'soy cheese', 'soy flour', 'soy protein', 'textured vegetable protein', 'tvp', 'hydrolyzed vegetable protein', 'vegetable protein'],
  'Fish': ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'trout', 'sardine', 'sardines', 'anchovy', 'anchovies', 'mackerel', 'bass', 'snapper', 'swordfish', 'catfish', 'fish sauce', 'worcestershire', 'flounder', 'herring', 'perch', 'pike', 'pollock', 'sole', 'grouper', 'mahi', 'mahi-mahi', 'barramundi', 'sea bass', 'sea bream', 'kingfish', 'snook', 'tarpon', 'pompano', 'mullet', 'brill', 'turbot', 'sprats', 'smelt', 'pufferfish', 'ling', 'tench', 'marlin', 'wahoo', 'yellowtail', 'albacore', 'bonito', 'haddock', 'plaice', 'bream', 'carp', 'eel', 'monkfish', 'rockfish', 'fish stock', 'anchovy paste', 'caviar', 'roe', 'surimi', 'fish cake', 'fish meal', 'fish paste'],
  'Shellfish': ['shrimp', 'crab', 'lobster', 'prawn', 'prawns', 'crawfish', 'crayfish', 'clam', 'clams', 'mussel', 'mussels', 'oyster', 'oysters', 'scallop', 'scallops', 'squid', 'calamari', 'octopus', 'langoustine', 'scampi', 'krill', 'snail', 'escargot', 'abalone', 'oyster sauce', 'shrimp paste', 'seafood seasoning', 'shellfish extract', 'bouillabaisse'],
  'Sesame': ['sesame', 'sesame seeds', 'sesame oil', 'sesame paste', 'tahini', 'hummus', 'halvah'],
};

export interface AllergenMatch {
  allergen: string;
  ingredient: string;
  recipeName: string;
}

export interface RecipeAllergenInfo {
  hasAllergens: boolean;
  allergens: string[];
  ingredients: string[];
}

/**
 * Check if an ingredient name contains any allergen keywords
 */
function ingredientContainsAllergen(ingredientName: string, allergen: string): boolean {
  const keywords = ALLERGEN_KEYWORDS[allergen];
  if (!keywords) return false;

  const normalizedIngredient = ingredientName.toLowerCase().trim();

  return keywords.some(keyword => {
    const normalizedKeyword = keyword.toLowerCase();
    // Check for exact match or word boundary match
    return normalizedIngredient === normalizedKeyword ||
           normalizedIngredient.includes(normalizedKeyword) ||
           normalizedIngredient.split(/[\s,]+/).some(word => word === normalizedKeyword);
  });
}

/**
 * Check a single recipe for allergens based on user's allergy list
 * Returns info about which allergens are found and which ingredients contain them
 * Uses recipe.violations if available (more comprehensive), falls back to ingredient checking
 */
export function checkRecipeForAllergens(
  recipe: Recipe,
  userAllergies: string[]
): RecipeAllergenInfo {
  const result: RecipeAllergenInfo = {
    hasAllergens: false,
    allergens: [],
    ingredients: [],
  };

  if (!userAllergies || userAllergies.length === 0) {
    return result;
  }

  console.log(`[AllergyChecker] Checking "${recipe.name}" for allergies: ${userAllergies.join(', ')}`);
  console.log(`[AllergyChecker] Recipe violations: ${recipe.violations ? recipe.violations.length : 0} items`);
  if (recipe.violations && recipe.violations.length > 0) {
    console.log(`[AllergyChecker] Violations: ${recipe.violations.slice(0, 2).join('; ')}`);
  }

  // First, check if recipe has violations (these are more comprehensive and include hidden allergens)
  if (recipe.violations && recipe.violations.length > 0) {
    const foundAllergens = new Set<string>();
    const foundIngredients = new Set<string>();

    for (const violation of recipe.violations) {
      // Check if this violation is an allergy violation
      if (violation.includes('ALLERGY VIOLATION')) {
        // Extract allergen name from violation string like "ALLERGY VIOLATION: Contains Fish"
        // Try to match each allergen, including case-insensitive matching
        for (const allergen of userAllergies) {
          // Check exact match with various case combinations
          if (violation.includes(allergen) ||
              violation.toLowerCase().includes(allergen.toLowerCase()) ||
              violation.includes(`Contains ${allergen}`) ||
              violation.toLowerCase().includes(`contains ${allergen.toLowerCase()}`)) {
            foundAllergens.add(allergen);
          }
        }
      }
    }

    if (foundAllergens.size > 0) {
      // Also extract ingredients that contain allergens for detailed info
      for (const ingredient of recipe.ingredients || []) {
        for (const allergen of userAllergies) {
          if (ingredientContainsAllergen(ingredient.name, allergen)) {
            foundIngredients.add(ingredient.name);
          }
        }
      }

      console.log(`[AllergyChecker] Detected allergens from violations for "${recipe.name}": ${Array.from(foundAllergens).join(', ')}`);
      result.hasAllergens = true;
      result.allergens = Array.from(foundAllergens);
      result.ingredients = Array.from(foundIngredients);
      return result;
    }
  }

  // Fallback: Check ingredients directly (when violations not available)
  if (!recipe.ingredients) {
    return result;
  }

  const foundAllergens = new Set<string>();
  const foundIngredients = new Set<string>();

  for (const ingredient of recipe.ingredients) {
    for (const allergen of userAllergies) {
      if (ingredientContainsAllergen(ingredient.name, allergen)) {
        foundAllergens.add(allergen);
        foundIngredients.add(ingredient.name);
      }
    }
  }

  if (foundAllergens.size > 0) {
    console.log(`[AllergyChecker] Detected allergens from ingredients for "${recipe.name}": ${Array.from(foundAllergens).join(', ')}`);
  }

  result.hasAllergens = foundAllergens.size > 0;
  result.allergens = Array.from(foundAllergens);
  result.ingredients = Array.from(foundIngredients);

  return result;
}

/**
 * Check a meal plan for allergens based on user's allergy list
 * Returns an array of allergen matches found in the meal plan
 */
export function checkMealPlanForAllergens(
  plan: CuratedMealPlan,
  userAllergies: string[]
): AllergenMatch[] {
  const matches: AllergenMatch[] = [];

  if (!userAllergies || userAllergies.length === 0) {
    return matches;
  }

  // Check each meal in the plan
  for (const meal of plan.meals) {
    const recipe = meal.recipe;

    // Check each ingredient
    for (const ingredient of recipe.ingredients) {
      for (const allergen of userAllergies) {
        if (ingredientContainsAllergen(ingredient.name, allergen)) {
          // Avoid duplicate entries for same allergen in same recipe
          const isDuplicate = matches.some(
            m => m.allergen === allergen && m.recipeName === recipe.name
          );

          if (!isDuplicate) {
            matches.push({
              allergen,
              ingredient: ingredient.name,
              recipeName: recipe.name,
            });
          }
        }
      }
    }
  }

  return matches;
}

/**
 * Get unique allergens found in a meal plan
 */
export function getUniqueAllergens(matches: AllergenMatch[]): string[] {
  return [...new Set(matches.map(m => m.allergen))];
}

/**
 * Format allergen warning message
 */
export function formatAllergenWarning(matches: AllergenMatch[]): string {
  const uniqueAllergens = getUniqueAllergens(matches);

  if (uniqueAllergens.length === 0) return '';

  if (uniqueAllergens.length === 1) {
    return `Contains ${uniqueAllergens[0]}`;
  }

  if (uniqueAllergens.length === 2) {
    return `Contains ${uniqueAllergens[0]} and ${uniqueAllergens[1]}`;
  }

  const last = uniqueAllergens.pop();
  return `Contains ${uniqueAllergens.join(', ')}, and ${last}`;
}
