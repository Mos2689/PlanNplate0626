import type { Ingredient, UserPreferences } from './store';
import { fetch } from 'expo/fetch';
import { checkRateLimit, incrementRateLimit } from './rate-limit-store';
import { validateIngredient, logIngredientValidationIssues, splitCompoundIngredient } from './ingredient-validator';
import { getMealTypePromptGuidance, validateMealType, getClassificationReport } from './meal-type-validator';
import { findSupabaseImage, extractPrimaryIngredientNames } from './supabase-image-library';
import { determineIngredientCategory, getCategoryGuidancePrompt } from './ingredient-category-mapper';
import { apiCall } from './api-router';
import { isSupabaseConfigured } from './supabase';

export type PlanDuration = 'single' | 'week1' | 'week2' | 'week3' | 'week4' | 'monthly';

async function callOpenAIDirect(messages: Array<{ role: string; content: string }>): Promise<string> {
  console.log('[OpenAI] Calling via Supabase Edge Function (ai-chat)...');

  const result = await apiCall<{ choices: Array<{ message: { content: string } }> }>('ai-chat', {
    messages,
    model: 'gpt-4o-mini',
    temperature: 0.95,
    max_tokens: 2048,
  });

  if (result.error) {
    throw new Error(result.error);
  }

  const content = result.data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('No response from AI');

  console.log('[OpenAI] Response received successfully');
  return content;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface GenerateRecipeParams {
  mealTypes: MealType[];
  preferences: UserPreferences;
  additionalInstructions?: string;
  duration?: PlanDuration;
  recipesToGenerate?: number;
  optimizeGrocery?: boolean;
  numberOfDays?: number;
  allowRepeats?: boolean;
  assignedFridgeIngredient?: string; // Specific ingredient this recipe MUST use from user's fridge
  excludeProteins?: string[]; // Proteins already used in other recipes
  previousFormats?: string[]; // Cooking formats already used (stir-fry, curry, etc.)
  previousTechniques?: string[]; // Cooking techniques already used (pan-fry, roast, etc.)
  recipeIndex?: number; // Position in generation sequence (0-indexed) for protein diversity rules
  mealCount?: number; // Total unique recipes being generated for protein diversity rules
  customCookingInstructions?: string; // Free-text user instructions that override preferences (but not allergies)
  breakfastStyle?: 'no-cook' | 'cooked'; // For breakfast only: weekday = no-cook, weekend = cooked
}

// Parse fridge ingredients from user's "What's in your Fridge" specification
// Returns an array of individual ingredients mentioned WITH quantities
export interface FridgeIngredientWithQuantity {
  name: string;
  quantity: number; // How many pieces/portions available (default 1 if not specified)
  maxRecipes: number; // Max number of recipes this ingredient should be used in
}

export function parseFridgeIngredients(additionalInstructions: string): string[] {
  // For backward compatibility, return just the names
  const parsed = parseFridgeIngredientsWithQuantity(additionalInstructions);
  return parsed.map(ing => ing.name);
}

// New function that parses BOTH ingredient names AND quantities
// servingSize: the user's preferred serving size (used to calculate how many recipes each ingredient can make)
export function parseFridgeIngredientsWithQuantity(additionalInstructions: string, servingSize: number = 1): FridgeIngredientWithQuantity[] {
  if (!additionalInstructions || additionalInstructions.trim().length === 0) {
    return [];
  }

  const input = additionalInstructions.toLowerCase();

  // Common ingredient keywords to look for
  const knownIngredients = [
    // Proteins
    'chicken', 'beef', 'pork', 'turkey', 'lamb', 'duck', 'bacon', 'ham', 'sausage',
    'salmon', 'tuna', 'shrimp', 'fish', 'cod', 'tilapia', 'prawns', 'crab', 'lobster',
    'barramundi', 'barramundi fillet', 'barramundi fillets',
    'tofu', 'tempeh', 'eggs', 'egg',
    // Dairy
    'cream cheese', 'cheese', 'milk', 'cream', 'yogurt', 'butter', 'mozzarella', 'cheddar', 'parmesan', 'feta',
    // Vegetables
    'carrots', 'carrot', 'broccoli', 'spinach', 'kale', 'lettuce', 'tomatoes', 'tomato',
    'onion', 'onions', 'garlic', 'peppers', 'bell pepper', 'mushrooms', 'mushroom',
    'zucchini', 'cucumber', 'celery', 'cabbage', 'cauliflower', 'asparagus', 'corn',
    'potatoes', 'potato', 'sweet potato', 'eggplant', 'green beans', 'peas',
    // Fruits
    'apples', 'apple', 'bananas', 'banana', 'oranges', 'orange', 'berries', 'strawberries', 'blueberries',
    'lemon', 'lime', 'avocado', 'mango', 'pineapple',
    // Grains/Starches
    'rice', 'pasta', 'noodles', 'bread', 'quinoa', 'oats', 'flour',
    // Other
    'beans', 'lentils', 'chickpeas', 'nuts', 'almonds', 'peanuts'
  ];

  const foundIngredients: FridgeIngredientWithQuantity[] = [];

  // Sort by length (longest first) to match multi-word ingredients first
  const sortedIngredients = [...knownIngredients].sort((a, b) => b.length - a.length);

  for (const ingredient of sortedIngredients) {
    // Pattern to match: optional quantity + ingredient name
    // Examples: "2 barramundi", "6 chicken breasts", "500g beef", "barramundi" (no quantity)
    // Also match patterns like "barramundi x 2", "barramundi (2)", etc.
    const patterns = [
      // "2 barramundi", "6 chicken"
      new RegExp(`(\\d+(?:\\.\\d+)?)?\\s*(?:pieces?\\s+(?:of\\s+)?)?\\b${ingredient}\\b(?:\\s+fillets?)?`, 'i'),
      // "barramundi x 2", "barramundi x2"
      new RegExp(`\\b${ingredient}\\b(?:\\s+fillets?)?\\s*[x×]\\s*(\\d+)`, 'i'),
      // "barramundi (2)", "barramundi - 2"
      new RegExp(`\\b${ingredient}\\b(?:\\s+fillets?)?\\s*[\\(\\-]\\s*(\\d+)\\s*\\)?`, 'i'),
      // Just the ingredient name (no quantity = 1)
      new RegExp(`\\b${ingredient}\\b`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        // Extract quantity from the match (could be in group 1 or 2 depending on pattern)
        let quantity = 1;
        if (match[1]) {
          quantity = parseFloat(match[1]) || 1;
        } else if (match[2]) {
          quantity = parseFloat(match[2]) || 1;
        }

        // Skip if we already found this ingredient
        const normalized = ingredient.replace(/s$/, '').replace(/\s+fillets?$/, '');
        if (foundIngredients.some(f => f.name === normalized || f.name === ingredient)) {
          continue;
        }

        // Calculate max recipes based on quantity and serving size:
        // Each recipe needs servingSize amount of this ingredient
        // So maxRecipes = floor(quantity / servingSize)
        // Example: 2 fillets with serving size 4 = 2/4 = 0.5, round up to 1 recipe
        // Example: 6 fillets with serving size 1 = 6/1 = 6 recipes
        let maxRecipes: number = Math.ceil(quantity / Math.max(1, servingSize));

        // Minimum 1 recipe if ingredient is available (even if less than serving size)
        maxRecipes = Math.max(1, maxRecipes);

        foundIngredients.push({
          name: normalized,
          quantity,
          maxRecipes,
        });

        console.log(`[FridgeParser] Found "${ingredient}" with quantity ${quantity} → max ${maxRecipes} recipes`);
        break; // Found a match, move to next ingredient
      }
    }
  }

  // If we found ingredients, return them
  if (foundIngredients.length > 0) {
    console.log(`[FridgeParser] Found ${foundIngredients.length} ingredients with quantities`);
    return foundIngredients;
  }

  // Fallback: split by common separators and clean up (assume quantity 1 for each)
  const separatorPattern = /[,;]|\band\b|\s+&\s+/gi;
  const parts = additionalInstructions.split(separatorPattern)
    .map(p => p.trim().toLowerCase())
    .filter(p => p.length > 1 && p.length < 30); // Filter out very short or very long strings

  if (parts.length > 0) {
    console.log(`[FridgeParser] Parsed from separators: ${parts.join(', ')}`);
    return parts.map(p => ({
      name: p,
      quantity: 1,
      maxRecipes: Math.max(1, Math.ceil(1 / Math.max(1, servingSize))), // Default: respect serving size
    }));
  }

  return [];
}

// Extract main proteins from a recipe
export function extractProteinsFromRecipe(recipe: GeneratedRecipeResponse): string[] {
  const commonProteins = [
    'chicken', 'beef', 'pork', 'turkey', 'lamb', 'duck',
    'fish', 'salmon', 'cod', 'tuna', 'bass', 'trout', 'shrimp', 'seafood', 'shellfish',
    'tofu', 'tempeh', 'seitan',
    'lentils', 'chickpeas', 'beans', 'legumes',
    'eggs', 'egg'
  ];

  const foundProteins: Set<string> = new Set();
  const ingredientNames = recipe.ingredients.map(ing => ing.name.toLowerCase());

  commonProteins.forEach(protein => {
    if (ingredientNames.some(ing => ing.includes(protein.toLowerCase()))) {
      foundProteins.add(protein);
    }
  });

  return Array.from(foundProteins);
}

// Calculate required protein diversity based on meal count
// NEW LOGIC (Optimize Grocery ON):
// - 2 meals: same protein (1 protein) - both recipes use chicken or both use lentils
// - 3 meals: 2 with same protein, 1 with different (2 proteins) - prefer pantry staples (daal) or low-cost (chicken vs salmon)
// - 4 meals: exactly 2 types of proteins (2 proteins) - e.g., 2 chicken + 2 salmon
// - 5-6 meals: at least 2 variety of proteins
// - 7+ meals: at least 3 variety of proteins
function calculateRequiredProteinDiversity(lunchDinnerCount: number): number {
  if (lunchDinnerCount >= 7) return 3; // 7+ meals = 3+ proteins
  if (lunchDinnerCount >= 5) return 2; // 5-6 meals = 2+ proteins
  if (lunchDinnerCount >= 4) return 2; // 4 meals = exactly 2 proteins
  if (lunchDinnerCount === 3) return 2; // 3 meals = 2 proteins (2 same + 1 different)
  return 1; // 2 meals = 1 protein (same for both)
}

// Validate protein diversity in generated recipes
function validateProteinDiversity(
  recipes: GeneratedRecipeResponse[],
  mealTypes: MealType[],
  optimizeGrocery: boolean
): { isValid: boolean; lunchDinnerCount: number; uniqueProteins: Set<string> } {
  // Only validate when grocery optimization is enabled
  if (!optimizeGrocery) {
    return {
      isValid: true,
      lunchDinnerCount: 0,
      uniqueProteins: new Set()
    };
  }

  // Count lunch + dinner recipes
  const lunchDinnerRecipes = recipes.filter(r => r.mealType === 'lunch' || r.mealType === 'dinner');
  const lunchDinnerCount = lunchDinnerRecipes.length;

  // Extract all unique proteins across lunch/dinner recipes
  const uniqueProteins = new Set<string>();
  lunchDinnerRecipes.forEach(recipe => {
    const proteins = extractProteinsFromRecipe(recipe);
    proteins.forEach(p => uniqueProteins.add(p));
  });

  // Calculate required diversity
  const requiredProteins = calculateRequiredProteinDiversity(lunchDinnerCount);

  console.log(`Protein Diversity Check - Lunch/Dinner Count: ${lunchDinnerCount}, Required: ${requiredProteins}, Found: ${uniqueProteins.size}`);

  const isValid = uniqueProteins.size >= requiredProteins;

  return {
    isValid,
    lunchDinnerCount,
    uniqueProteins
  };
}

// Define recipe family dimensions
interface RecipeFamily {
  format: string; // stir-fry, curry, patties, roast, soup, salad, wrap
  technique: string; // pan-fry, oven-roast, simmer, grill, air-fry, steam
  flavorSystem: string; // east-asian, south-asian, mediterranean, middle-eastern, western, neutral
}

// Classify a recipe into its family
function classifyRecipeFamily(recipe: GeneratedRecipeResponse): RecipeFamily {
  const name = recipe.name.toLowerCase();
  const description = recipe.description.toLowerCase();
  const instructions = recipe.instructions.map(i => i.toLowerCase()).join(' ');
  const ingredients = recipe.ingredients.map(i => i.name.toLowerCase()).join(' ');
  const combined = `${name} ${description} ${instructions} ${ingredients}`;

  // Detect format - more specific to catch subtle variations
  let format = 'other';
  if (combined.includes('stir') || combined.includes('stir-fry') || combined.includes('toss')) {
    format = 'stir-fry';
  } else if (combined.includes('curry') || combined.includes('korma') || combined.includes('biryani') || combined.includes('masala')) {
    format = 'curry';
  } else if (combined.includes('patty') || combined.includes('patties') || combined.includes('fritter') || combined.includes('meatball')) {
    format = 'patties';
  } else if (combined.includes('roast') || combined.includes('bake') || combined.includes('tray')) {
    format = 'roast';
  } else if (combined.includes('soup') || combined.includes('stew') || combined.includes('broth') || combined.includes('chowder')) {
    format = 'soup';
  } else if (combined.includes('salad')) {
    format = 'salad';
  } else if (combined.includes('wrap') || combined.includes('roll') || combined.includes('burrito') || combined.includes('taco')) {
    format = 'wrap';
  } else if (combined.includes('bowl') || combined.includes('grain') || combined.includes('rice bowl') || combined.includes('buddha')) {
    format = 'bowl';
  } else if (combined.includes('grill') || combined.includes('skewer') || combined.includes('kabob')) {
    format = 'grill';
  } else if (combined.includes('sandwich') || combined.includes('burger')) {
    format = 'sandwich';
  } else if (combined.includes('pasta') || combined.includes('noodle')) {
    format = 'pasta';
  }

  // Detect cooking technique - more refined
  let technique = 'pan-fry';
  if (combined.includes('oven') || combined.includes('roast') || combined.includes('bake')) {
    technique = 'oven-roast';
  } else if (combined.includes('simmer') || combined.includes('braise') || combined.includes('stew') || combined.includes('slow')) {
    technique = 'simmer';
  } else if (combined.includes('grill') || combined.includes('bbq') || combined.includes('char')) {
    technique = 'grill';
  } else if (combined.includes('air fry') || combined.includes('air-fry')) {
    technique = 'air-fry';
  } else if (combined.includes('steam') || combined.includes('steamed')) {
    technique = 'steam';
  } else if (combined.includes('deep fry') || combined.includes('fried') || combined.includes('crispy')) {
    technique = 'deep-fry';
  } else if (combined.includes('slow') || combined.includes('pressure')) {
    technique = 'slow-cook';
  } else if (combined.includes('boil') || combined.includes('pasta') || combined.includes('noodle')) {
    technique = 'boil';
  }

  // Detect flavor system - much more granular to catch subtle variations
  let flavorSystem = 'neutral';
  if (combined.includes('soy') || combined.includes('sesame') || combined.includes('miso') || combined.includes('ginger-garlic') || combined.includes('east asian') || combined.includes('asian fusion')) {
    flavorSystem = 'east-asian';
  } else if (combined.includes('curry') || combined.includes('turmeric') || combined.includes('cumin') || combined.includes('cardamom') || combined.includes('garam masala') || combined.includes('coconut') || combined.includes('indian') || combined.includes('south asian')) {
    flavorSystem = 'south-asian';
  } else if (combined.includes('lemon') || combined.includes('feta') || combined.includes('olive') || combined.includes('oregano') || combined.includes('mediterranean') || combined.includes('greek')) {
    flavorSystem = 'mediterranean';
  } else if (combined.includes('tahini') || combined.includes('yogurt') || combined.includes('sumac') || combined.includes('middle eastern') || combined.includes('arabic') || combined.includes('harissa')) {
    flavorSystem = 'middle-eastern';
  } else if (combined.includes('cream') || combined.includes('cheese') || combined.includes('butter') || combined.includes('stock') || combined.includes('french') || combined.includes('german')) {
    flavorSystem = 'western';
  } else if (combined.includes('fresh') || combined.includes('herb') || combined.includes('light') || combined.includes('citrus') || combined.includes('lime') || combined.includes('cilantro')) {
    flavorSystem = 'fresh-citrus';
  } else if (combined.includes('mexican') || combined.includes('latin') || combined.includes('salsa') || combined.includes('chili')) {
    flavorSystem = 'latin';
  } else if (combined.includes('spicy') || combined.includes('chili') || combined.includes('peppers') || combined.includes('hot')) {
    flavorSystem = 'spicy';
  }

  return { format, technique, flavorSystem };
}

// Check if two recipes belong to the same family
function isSameRecipeFamily(recipe1: RecipeFamily, recipe2: RecipeFamily): boolean {
  // Two recipes are from the same family if they match on 2+ dimensions
  let matches = 0;
  if (recipe1.format === recipe2.format) matches++;
  if (recipe1.technique === recipe2.technique) matches++;
  if (recipe1.flavorSystem === recipe2.flavorSystem) matches++;

  return matches >= 2;
}

// Validate recipe distinctness when repeats are disabled
function validateRecipeDistinctness(
  recipes: GeneratedRecipeResponse[],
  allowRepeats: boolean,
  optimizeGrocery: boolean
): { isValid: boolean; duplicateFamilies: string[] } {
  // Only validate when repeats are disabled and grocery optimization is enabled
  if (allowRepeats || !optimizeGrocery) {
    return { isValid: true, duplicateFamilies: [] };
  }

  const duplicateFamilies: string[] = [];
  const recipeFamilies: RecipeFamily[] = [];

  // First pass: classify all recipes
  for (let i = 0; i < recipes.length; i++) {
    recipeFamilies.push(classifyRecipeFamily(recipes[i]));
  }

  // Second pass: check for family conflicts
  for (let i = 0; i < recipes.length; i++) {
    for (let j = i + 1; j < recipes.length; j++) {
      if (isSameRecipeFamily(recipeFamilies[i], recipeFamilies[j])) {
        const recipe1 = recipes[i];
        const recipe2 = recipes[j];
        const family1 = recipeFamilies[i];
        const issue = `"${recipe1.name}" (${family1.format}/${family1.technique}/${family1.flavorSystem}) similar to "${recipe2.name}"`;
        duplicateFamilies.push(issue);
        console.warn(`⚠️ ${issue}`);
      }
    }
  }

  const isValid = duplicateFamilies.length === 0;

  if (isValid) {
    console.log(`✓ Recipe distinctness validated: All ${recipes.length} recipes are structurally and sensorially distinct`);
  } else {
    console.warn(`⚠️ Recipe distinctness validation FAILED: Found ${duplicateFamilies.length} family conflicts`);
    console.warn(`   Each recipe must differ in 2+ dimensions: format (stir-fry, curry, roast, soup, etc), technique (pan-fry, oven, simmer, etc), flavor (asian, mediterranean, etc)`);
  }

  return { isValid, duplicateFamilies };
}
const HOUSEHOLD_STAPLES = [
  'chicken breast',
  'eggs',
  'rice',
  'pasta',
  'onion',
  'garlic',
  'olive oil',
  'salt',
  'black pepper',
  'lemon',
  'lime',
  'bell pepper',
  'tomato',
  'carrots',
  'celery',
  'potatoes',
  'milk',
  'butter',
  'canned tomatoes',
  'vegetable broth',
  'soy sauce',
  'ginger',
  'paprika',
  'cumin',
  'cinnamon',
  'sugar',
  'vinegar',
  'honey',
  'basil',
  'oregano',
  'thyme',
];

// Ingredient pairings that commonly appear together and complement each other
const INGREDIENT_PAIRINGS: Record<string, string[]> = {
  'garlic': ['onion', 'olive oil', 'soy sauce', 'ginger'],
  'onion': ['garlic', 'bell pepper', 'carrots', 'celery'],
  'soy sauce': ['ginger', 'garlic', 'vinegar', 'honey'],
  'tomato': ['basil', 'garlic', 'onion', 'olive oil'],
  'bell pepper': ['onion', 'garlic', 'tomato', 'carrots'],
  'ginger': ['soy sauce', 'garlic', 'lime', 'vinegar'],
  'lemon': ['olive oil', 'garlic', 'herbs', 'chicken'],
  'chicken': ['lemon', 'garlic', 'olive oil', 'paprika'],
  'rice': ['onion', 'garlic', 'soy sauce', 'ginger'],
  'pasta': ['tomato', 'garlic', 'olive oil', 'basil'],
};

export interface GeneratedRecipeResponse {
  name: string;
  description: string;
  cookTime: number;
  prepTime: number;
  servings: number;
  mealType?: MealType;
  ingredients: Array<{
    name: string;
    quantity: string;
    unit: string;
    category: Ingredient['category'];
  }>;
  instructions: string[];
  tags: string[];
  calories: number;
  violations?: string[]; // Allergen and preference violations for display
  // Set only for recipes sourced from the curated "Get Inspired" bank — carries
  // the curated hero image (and its blurhash) so the meal card shows the real
  // photo instead of a fetched stock/AI image. Undefined for AI-generated recipes.
  imageUrl?: string;
  blurhash?: string;
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export function getDurationDays(duration: PlanDuration): number {
  switch (duration) {
    case 'week1': return 7;
    case 'week2': return 14;
    case 'week3': return 21;
    case 'week4': return 28;
    case 'monthly': return 30;
    default: return 1;
  }
}

// Validate recipe against user preferences (allergies, dietary restrictions, cuisine preferences, prep time)
// Shared meat/seafood keyword lists for dietary validation. Unambiguous terms
// only — deliberately excludes words that collide with vegetarian foods
// (e.g. "goat"→goat cheese, "steak"→cauliflower steak, "mince"→mince garlic).
const LAND_MEAT_TERMS = [
  'meat', 'poultry', 'chicken', 'beef', 'pork', 'lamb', 'mutton', 'veal',
  'venison', 'rabbit', 'kangaroo', 'turkey', 'duck', 'goose', 'bacon', 'ham',
  'prosciutto', 'pancetta', 'sausage', 'chorizo', 'salami', 'pepperoni',
  'pastrami', 'meatball', 'meatballs', 'meatloaf', 'brisket', 'sirloin',
  'ribeye', 'tenderloin', 'schnitzel', 'bratwurst', 'jerky', 'liver',
];
const SEAFOOD_TERMS = [
  'fish', 'salmon', 'tuna', 'cod', 'barramundi', 'snapper', 'trout', 'mackerel',
  'sardine', 'sardines', 'herring', 'haddock', 'halibut', 'tilapia', 'seafood',
  'shrimp', 'prawn', 'prawns', 'crab', 'lobster', 'mussel', 'mussels', 'oyster',
  'oysters', 'scallop', 'scallops', 'squid', 'calamari', 'clam', 'clams',
  'octopus', 'anchovy', 'anchovies', 'shellfish', 'caviar', 'roe',
];

// Cuisine keyword indicators, used to verify a recipe actually belongs to a
// user's selected cuisine(s). Intentionally LENIENT (matches if ANY signal is
// present) so we reject only clear cross-cuisine mismatches, not edge cases —
// over-rejecting would burn regeneration attempts. "Asian" umbrellas the
// East/SE-Asian options so picking it accepts Japanese/Chinese/Thai/etc.
const CUISINE_KEYWORDS: Record<string, string[]> = {
  italian: ['italian', 'pasta', 'spaghetti', 'penne', 'linguine', 'fettuccine', 'lasagna', 'lasagne', 'risotto', 'gnocchi', 'parmesan', 'parmigiano', 'mozzarella', 'pesto', 'marinara', 'bolognese', 'carbonara', 'bruschetta', 'prosciutto', 'focaccia', 'caprese', 'ravioli', 'tortellini', 'minestrone', 'polenta'],
  mexican: ['mexican', 'taco', 'burrito', 'quesadilla', 'enchilada', 'tortilla', 'salsa', 'guacamole', 'jalapeno', 'jalapeño', 'chipotle', 'fajita', 'nachos', 'tostada', 'carnitas', 'pico de gallo', 'queso', 'tex-mex', 'refried'],
  asian: ['asian', 'stir-fry', 'stir fry', 'stir-fried', 'soy sauce', 'sesame', 'ginger', 'teriyaki', 'miso', 'tofu', 'hoisin', 'fish sauce', 'rice wine', 'bok choy', 'noodle', 'ramen', 'udon', 'soba', 'dumpling', 'spring roll', 'wonton', 'sushi', 'sashimi', 'kimchi', 'bibimbap', 'pad thai', 'pho', 'curry', 'satay', 'tempura', 'szechuan', 'sichuan', 'thai', 'chinese', 'japanese', 'korean', 'vietnamese', 'edamame', 'wok', 'gochujang', 'lemongrass'],
  mediterranean: ['mediterranean', 'hummus', 'tahini', 'falafel', 'tzatziki', 'feta', 'olive', 'pita', 'tabbouleh', 'couscous', 'tagine', 'harissa', "za'atar", 'halloumi', 'dolma', 'baba ganoush'],
  indian: ['indian', 'curry', 'masala', 'tikka', 'tandoori', 'naan', 'dal', 'daal', 'paneer', 'garam masala', 'biryani', 'korma', 'vindaloo', 'samosa', 'chana', 'saag', 'raita', 'chutney', 'turmeric', 'ghee', 'roti', 'chapati'],
  american: ['american', 'burger', 'cheeseburger', 'bbq', 'barbecue', 'barbeque', 'mac and cheese', 'meatloaf', 'cornbread', 'coleslaw', 'buffalo', 'sloppy joe', 'grilled cheese', 'pulled pork', 'hot dog', 'fried chicken'],
  french: ['french', 'ratatouille', 'baguette', 'quiche', 'coq au vin', 'beef bourguignon', 'croissant', 'crepe', 'crêpe', 'gratin', 'cassoulet', 'bisque', 'béarnaise', 'provençal', 'confit', 'dijon'],
  japanese: ['japanese', 'sushi', 'sashimi', 'ramen', 'udon', 'soba', 'miso', 'teriyaki', 'tempura', 'katsu', 'donburi', 'yakitori', 'edamame', 'nori', 'wasabi', 'dashi', 'matcha', 'onigiri', 'gyoza'],
  chinese: ['chinese', 'stir-fry', 'stir fry', 'szechuan', 'sichuan', 'hoisin', 'wonton', 'dumpling', 'chow mein', 'lo mein', 'fried rice', 'kung pao', 'sweet and sour', 'spring roll', 'bok choy', 'wok', 'char siu', 'dim sum'],
  korean: ['korean', 'kimchi', 'bibimbap', 'bulgogi', 'gochujang', 'gochugaru', 'japchae', 'tteokbokki', 'korean bbq', 'galbi', 'doenjang'],
  thai: ['thai', 'pad thai', 'green curry', 'red curry', 'massaman', 'tom yum', 'tom kha', 'lemongrass', 'fish sauce', 'coconut milk', 'satay', 'larb', 'som tam', 'galangal', 'thai basil'],
  greek: ['greek', 'tzatziki', 'feta', 'souvlaki', 'gyro', 'spanakopita', 'moussaka', 'dolma', 'taramasalata', 'horiatiki', 'avgolemono', 'kalamata'],
};

/**
 * True if the recipe plausibly belongs to at least one of the user's selected
 * cuisines (checks tags, name, description, and ingredient names against the
 * cuisine name itself and its keyword set). Lenient by design.
 */
export function recipeMatchesPreferredCuisine(
  recipe: GeneratedRecipeResponse,
  cuisinePreferences: string[],
): boolean {
  const prefs = (cuisinePreferences || []).map((c) => c.toLowerCase().trim()).filter(Boolean);
  if (prefs.length === 0) return true; // no cuisine selected → nothing to enforce

  const tags = (recipe.tags || []).map((t) => t.toLowerCase());
  const ingredientNames = recipe.ingredients.map((i) => i.name.toLowerCase()).join(' ');
  const text = `${recipe.name.toLowerCase()} ${recipe.description.toLowerCase()} ${tags.join(' ')} ${ingredientNames}`;

  for (const c of prefs) {
    if (text.includes(c)) return true; // cuisine named directly
    const keywords = CUISINE_KEYWORDS[c] || [];
    if (keywords.some((k) => text.includes(k))) return true;
  }
  return false;
}

export function validateRecipeAgainstPreferences(
  recipe: GeneratedRecipeResponse,
  preferences: UserPreferences,
  hasSpecialRequest: boolean = false,
  isFridgeAssigned: boolean = false // NEW: Skip validation for fridge-assigned recipes
): { isValid: boolean; violations: string[] } {
  const violations: string[] = [];

  // ── Build combined text for checking ─────────────────────────
  const ingredientNames = recipe.ingredients.map(ing => ing.name.toLowerCase());
  const recipeText = `${recipe.name.toLowerCase()} ${recipe.description.toLowerCase()} ${ingredientNames.join(' ')}`;
  // Allergens can hide in the METHOD too (e.g. "serve with naan", "top with
  // parmesan", "brush with butter"). Scan instructions as well, but ONLY for the
  // allergy check — the dietary checks keep the tighter `recipeText` so serving
  // suggestions ("great with a meat alternative") don't cause false positives.
  const instructionsText = (recipe.instructions || []).map(i => i.toLowerCase()).join(' ');
  const allergenScanText = `${recipeText} ${instructionsText}`;

  // Helper: word-boundary match
  const matchesWord = (text: string, word: string): boolean => {
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    return regex.test(text);
  };

  // ── #1  ALLERGIES (always check, but fridge-assigned ingredients override) ──
  const allergenMap: Record<string, string[]> = {
    // PEANUTS & TREE NUTS - Comprehensive coverage
    'peanuts': ['peanut', 'peanuts', 'groundnut', 'arachis oil', 'peanut butter', 'peanut flour'],
    'tree nuts': [
      // Common tree nuts
      'almond', 'walnut', 'cashew', 'pecan', 'pistachio', 'macadamia', 'brazil nut', 'hazelnut', 'pine nut', 'chestnut',
      // Less common but allergenic
      'filbert', 'hickory nut', 'litchi', 'lychee', 'ginkgo nut', 'pili nut', 'shea nut', 'acorn',
      // Derived products
      'praline', 'marzipan', 'nougat', 'nut butter', 'nut paste', 'nut flour', 'nut milk', 'almond milk', 'cashew cream'
    ],

    // MILK & DAIRY - All derivatives and hidden sources
    'milk': [
      // Direct milk products
      'milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'ice cream', 'ghee', 'buttermilk', 'kefir',
      // Milk proteins & components
      'whey', 'casein', 'lactose', 'milk powder', 'milk solids', 'curds', 'lacteal',
      // Cheese varieties
      'mozzarella', 'parmesan', 'cheddar', 'feta', 'ricotta', 'brie', 'gouda', 'swiss cheese', 'cottage cheese', 'cream cheese', 'mascarpone',
      'gorgonzola', 'roquefort', 'camembert', 'emmental', 'gruyere', 'parmigiano-reggiano', 'halloumi', 'paneer',
      // Milk-based dishes
      'sour cream', 'crème fraîche', 'half and half', 'custard', 'pudding', 'flan', 'curd',
      // Hidden milk sources
      'lactalbumin', 'lactoglobulin', 'artificial butter flavor'
    ],

    // EGGS - Direct & hidden sources (mayo, hollandaise, etc.)
    'eggs': [
      // Direct egg products
      'egg', 'eggs', 'egg white', 'egg yolk', 'powdered egg',
      // Egg-containing sauces & dishes
      'mayonnaise', 'mayo', 'hollandaise', 'béarnaise', 'aioli', 'meringue',
      // Egg-based items
      'custard', 'quiche', 'mousse', 'soufflé', 'omelet', 'crepe',
      // Baking & processed foods with egg
      'batter', 'breading', 'cake', 'cookie', 'noodle', 'pasta', 'egg noodle',
      // Hidden egg sources
      'lecithin', 'mayonaise', 'salad dressing', 'some caesar dressing'
    ],

    // FISH - All species (common, uncommon, less familiar)
    'fish': [
      // Common fish
      'salmon', 'cod', 'tuna', 'trout', 'bass', 'halibut', 'sardine', 'anchovy', 'tilapia', 'mackerel', 'snapper',
      // Less common/regional fish
      'barramundi', 'grouper', 'mahi', 'mahi-mahi', 'swordfish', 'catfish', 'flounder', 'herring', 'perch', 'pike', 'pollock', 'sole',
      'haddock', 'plaice', 'bream', 'carp', 'eel', 'monkfish', 'rockfish', 'sea bass', 'sea bream', 'kingfish',
      'snook', 'tarpon', 'pompano', 'mullet', 'brill', 'turbot', 'halibut', 'turbot', 'sprats', 'smelt',
      'pufferfish', 'ling', 'tench', 'marlin', 'wahoo', 'yellowtail', 'albacore', 'bonito',
      // Fish-derived products
      'fish sauce', 'fish paste', 'fish cake', 'fish meal', 'surimi', 'caviar', 'roe', 'fish stock', 'anchovy paste',
      // Sauces with fish products
      'worcestershire', 'some soy sauce'
    ],

    // SHELLFISH & CRUSTACEANS - Comprehensive list
    'shellfish': [
      // Crustaceans (most common allergen type)
      'shrimp', 'prawn', 'crab', 'lobster', 'crayfish', 'crawfish', 'langoustine', 'scampi', 'krill',
      // Mollusks
      'oyster', 'clam', 'mussel', 'scallop', 'squid', 'calamari', 'octopus', 'snail', 'escargot', 'abalone',
      // Shellfish-derived products
      'oyster sauce', 'shrimp paste', 'fish sauce', 'seafood seasoning', 'shellfish extract', 'bouillabaisse'
    ],

    // SOY - All forms and derivatives
    'soy': [
      // Direct soy products
      'soy', 'soya', 'soybean', 'tofu', 'tempeh', 'edamame', 'miso', 'soy sauce', 'shoyu', 'tamari',
      // Soy derivatives
      'soy milk', 'soy yogurt', 'soy cheese', 'soy flour', 'soy protein', 'textured vegetable protein', 'tvp',
      // Hidden soy sources
      'lecithin', 'soy lecithin', 'vegetable protein', 'plant protein', 'hydrolyzed vegetable protein'
    ],

    // WHEAT & GLUTEN - All grains containing gluten
    'wheat': [
      // Wheat products
      'wheat', 'flour', 'wheat flour', 'bread', 'pasta', 'noodle', 'wheat noodle', 'egg noodle',
      // Wheat derivatives
      'bran', 'germ', 'gluten', 'gluten flour', 'vital wheat gluten', 'seitan',
      // Wheat-based items
      'couscous', 'semolina', 'bulgur', 'farro', 'spelt', 'kamut', 'einkorn', 'durum',
      // Breading & coating
      'breadcrumb', 'panko', 'crouton', 'breading', 'batter',
      // Wheat-based baked goods
      'cake', 'cookie', 'cracker', 'cereal', 'granola', 'muesli',
      // Flatbreads & pastries
      'tortilla', 'pita', 'naan', 'focaccia', 'croissant', 'bagel',
      // Hidden wheat sources
      'some soy sauce', 'some worcestershire', 'some salad dressings', 'some processed foods'
    ],

    'gluten': [
      // All gluten-containing grains
      'wheat', 'barley', 'rye', 'oats', 'gluten', 'semolina', 'couscous', 'bulgur', 'farro', 'spelt', 'kamut',
      // Gluten-heavy products (see wheat above for full list)
      'flour', 'bread', 'pasta', 'noodle', 'seitan', 'vital wheat gluten'
    ],

    // SESAME - All forms
    'sesame': [
      // Direct sesame
      'sesame', 'sesame seed', 'sesame oil', 'sesame paste',
      // Sesame products
      'tahini', 'halva', 'halvah', 'hummus' // hummus traditionally has tahini
    ],

    // MUSTARD - All forms
    'mustard': [
      'mustard', 'mustard seed', 'mustard powder', 'mustard oil', 'dijon', 'whole grain mustard',
      // Mustard in sauces
      'some salad dressings', 'some mayonnaise'
    ],

    // CELERY - All parts and derivatives
    'celery': [
      'celery', 'celeriac', 'celery root', 'celery salt', 'celery seed', 'celery powder'
    ],

    // SULFITES - Preservatives and fermented foods
    'sulfites': [
      // Direct sulfites
      'sulfite', 'sulphite', 'sulfur dioxide', 'sulphur dioxide',
      // Common sources
      'wine', 'vinegar', 'dried fruit', 'dried apricot', 'dried raisin',
      // Processed foods with sulfites
      'fruit juice', 'some jams', 'some pickled foods', 'some sauces', 'some soy sauce'
    ],
  };

  // Always check for allergens (even for fridge-assigned), but fridge ingredients override
  if (preferences.allergies && preferences.allergies.length > 0) {
    preferences.allergies.forEach(allergy => {
      const allergyLower = allergy.toLowerCase();
      const allergyIndicators = allergenMap[allergyLower] || [allergyLower];

      allergyIndicators.forEach(indicator => {
        if (matchesWord(allergenScanText, indicator)) {
          // Always flag the violation for display
          violations.push(`ALLERGY VIOLATION: Contains ${allergy}`);
          // But only reject if NOT a fridge-assigned ingredient (user explicitly chose it)
          if (!isFridgeAssigned) {
            // Non-fridge recipe must not contain allergens - this will be caught below
          }
        }
      });
    });
  }

  // If there's a special request, it can override preferences #3 below,
  // but for fridge-assigned recipes, skip dietary restrictions too.
  // Fridge ingredients override user preferences but still respect allergies (when not fridge-assigned).
  if (!hasSpecialRequest && !isFridgeAssigned) {

    // ── #3a  DIETARY RESTRICTIONS ────────────────────────────────
    if (preferences.dietaryRestrictions && preferences.dietaryRestrictions.length > 0) {
      preferences.dietaryRestrictions.forEach(restriction => {
        const restrictionLower = restriction.toLowerCase();

        if (restrictionLower.includes('vegan')) {
          const animalProducts = [
            ...LAND_MEAT_TERMS, ...SEAFOOD_TERMS,
            'egg', 'eggs', 'mayonnaise', 'milk', 'cheese', 'butter', 'cream',
            'yogurt', 'yoghurt', 'ghee', 'whey', 'casein', 'honey',
            'gelatin', 'lard', 'suet', 'paneer',
          ];

          const foundAnimalProduct = animalProducts.some(product => matchesWord(recipeText, product));

          if (foundAnimalProduct) {
            violations.push(`DIETARY VIOLATION: Not suitable for ${restriction} diet — contains animal product`);
          }
        } else if (restrictionLower.includes('vegetarian')) {
          const meatProducts = [...LAND_MEAT_TERMS, ...SEAFOOD_TERMS, 'lard', 'suet', 'gelatin'];

          const foundMeatProduct = meatProducts.some(product => matchesWord(recipeText, product));

          if (foundMeatProduct) {
            violations.push(`DIETARY VIOLATION: Not suitable for ${restriction} diet — contains meat/fish`);
          }
        } else if (restrictionLower.includes('pescatarian') || restrictionLower.includes('pescetarian')) {
          // Pescatarian: no meat or poultry, but fish/seafood, eggs and dairy
          // are all fine. (Note: 'pescatarian' is NOT a substring of
          // 'vegetarian', so it correctly falls through to here.)
          const meatProducts = [...LAND_MEAT_TERMS, 'lard', 'suet'];
          const foundMeat = meatProducts.some(product => matchesWord(recipeText, product));
          if (foundMeat) {
            violations.push(`DIETARY VIOLATION: Not suitable for ${restriction} diet — contains meat/poultry`);
          }
        } else if (restrictionLower.includes('halal')) {
          const halalProhibited = ['pork', 'pig', 'bacon', 'ham', 'lard', 'alcohol', 'wine', 'beer', 'rum'];
          if (halalProhibited.some(item => matchesWord(recipeText, item))) {
            violations.push(`DIETARY VIOLATION: Not suitable for ${restriction} diet`);
          }
        } else if (restrictionLower.includes('kosher')) {
          const kosherProhibited = ['pork', 'pig', 'bacon', 'ham', 'lard', 'shellfish', 'shrimp', 'crab', 'lobster', 'prawn'];
          if (kosherProhibited.some(item => matchesWord(recipeText, item))) {
            violations.push(`DIETARY VIOLATION: Not suitable for ${restriction} diet`);
          }
        } else if (restrictionLower.includes('gluten-free')) {
          const glutenProducts = ['wheat', 'barley', 'rye', 'flour', 'bread', 'pasta', 'couscous', 'semolina'];
          if (glutenProducts.some(product => matchesWord(recipeText, product))) {
            violations.push(`DIETARY VIOLATION: Not gluten-free`);
          }
        } else if (restrictionLower.includes('keto') || restrictionLower.includes('low-carb')) {
          const highCarbProducts = ['rice', 'potato', 'pasta', 'bread', 'sugar', 'flour'];
          const highCarbCount = highCarbProducts.filter(item => matchesWord(recipeText, item)).length;

          if (highCarbCount > 1) {
            violations.push(`DIETARY VIOLATION: Too many carb-heavy ingredients for ${restriction} diet`);
          }
        }
      });
    }

    // ── #3b  SERVING SIZE ────────────────────────────────────────
    if (preferences.servingSize && recipe.servings !== preferences.servingSize) {
      // Allow small tolerance (AI sometimes returns servings ±1)
      const diff = Math.abs(recipe.servings - preferences.servingSize);
      if (diff > 1) {
        violations.push(`SERVING VIOLATION: Recipe serves ${recipe.servings}, expected ${preferences.servingSize}`);
      }
    }

    // ── #3c  PREP TIME ───────────────────────────────────────────
    if (preferences.mealPrepTime) {
      const totalTime = recipe.prepTime + recipe.cookTime;
      const prepTimeLower = preferences.mealPrepTime.toLowerCase();

      if (prepTimeLower === 'quick' && totalTime > 35) {
        // 35 min with small tolerance over 30
        violations.push(`TIME VIOLATION: Total time ${totalTime}min exceeds 'quick' limit (≤30min)`);
      } else if (prepTimeLower === 'moderate' && totalTime > 65) {
        // 65 min with small tolerance over 60
        violations.push(`TIME VIOLATION: Total time ${totalTime}min exceeds 'moderate' limit (≤60min)`);
      }
    }
  }

  // ── #3d  CUISINE (HARD, main meals only) ─────────────────────
  // Cuisine is a hard requirement for lunch/dinner. Breakfast & snacks are left
  // cuisine-neutral (they're usually generic and largely curated). A user's
  // explicit special request, or fridge-assigned recipes, override saved cuisine.
  if (
    !hasSpecialRequest &&
    !isFridgeAssigned &&
    (recipe.mealType === 'lunch' || recipe.mealType === 'dinner') &&
    (preferences.cuisinePreferences?.length ?? 0) > 0 &&
    !recipeMatchesPreferredCuisine(recipe, preferences.cuisinePreferences)
  ) {
    violations.push(`CUISINE VIOLATION: Not ${preferences.cuisinePreferences.join('/')} cuisine`);
  }

  if (violations.length > 0) {
    console.warn(`[Validation] Recipe "${recipe.name}" has ${violations.length} violation(s): ${violations.join('; ')}`);
  }

  // For fridge-assigned ingredients, allow allergen violations to pass (user explicitly chose it)
  // But still show the violations in the violations array for the allergen symbol display
  const rejectingViolations = isFridgeAssigned
    ? violations.filter(v => !v.includes('ALLERGY VIOLATION'))
    : violations;

  return {
    isValid: rejectingViolations.length === 0,
    violations // Always return all violations for UI display
  };
}

// Helper to clean and parse JSON from AI response
function parseJSONResponse(text: string, expectArray: boolean = false): unknown {
  let cleanedText = text.trim();

  // Remove markdown code blocks
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.slice(7);
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.slice(3);
  }
  if (cleanedText.endsWith('```')) {
    cleanedText = cleanedText.slice(0, -3);
  }

  // Find the JSON in the response
  const startChar = expectArray ? '[' : '{';
  const endChar = expectArray ? ']' : '}';
  const jsonStartIndex = cleanedText.indexOf(startChar);
  const jsonEndIndex = cleanedText.lastIndexOf(endChar);

  if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
    cleanedText = cleanedText.substring(jsonStartIndex, jsonEndIndex + 1);
  }

  return JSON.parse(cleanedText.trim());
}

// Build a simple prompt for generating a single recipe
function buildSingleRecipePrompt(
  mealType: MealType,
  preferences: UserPreferences,
  additionalInstructions?: string,
  excludeNames: string[] = [],
  sharedIngredients: string[] = [],
  recipeIndex?: number,
  totalRecipes?: number,
  optimizeGrocery?: boolean,
  allowRepeats?: boolean,
  excludeProteins: string[] = [],
  previousFormats: string[] = [],
  previousTechniques: string[] = [],
  assignedFridgeIngredient?: string, // NEW: specific ingredient this recipe MUST use
  mealCount?: number, // NEW: actual total meal count (different from uniqueRecipes when repeats allowed)
  customCookingInstructions?: string, // NEW: free-text user instructions that override preferences
  breakfastStyle?: 'no-cook' | 'cooked' // NEW: breakfast only — weekday no-cook vs weekend cooked
): string {
  // ============================================================
  // RULE PRIORITY (strictly enforced top to bottom):
  //
  //   #1  ALLERGIES           — absolute, never overridden
  //   #2  SPECIAL REQUEST     — overrides preferences below, but never allergies
  //   #3  USER PREFERENCES    — serving size, cooking skill, dietary restriction,
  //                             cuisine preference, prep time
  //   #4  GROCERY / REPEATS   — optimise grocery shopping & allow repeats
  //                             follow their own rules, never override #1-#3
  // ============================================================

  const restrictionLower = preferences.dietaryRestrictions.map(r => r.toLowerCase());
  const isVegan = restrictionLower.some(r => r.includes('vegan'));
  const isVegetarian = restrictionLower.some(r => r.includes('vegetarian'));
  const isHalal = restrictionLower.some(r => r.includes('halal'));
  const isKosher = restrictionLower.some(r => r.includes('kosher'));
  const isGlutenFree = restrictionLower.some(r => r.includes('gluten-free'));
  const isKeto = restrictionLower.some(r => r.includes('keto') || r.includes('low-carb'));

  let prompt = `Generate a ${mealType} recipe.\n${getMealTypePromptGuidance(mealType)}`;

  // ── #1  ALLERGIES (absolute — never overridden by anything) ────
  if (preferences.allergies.length > 0) {
    prompt += `

═══ RULE #1 — ALLERGY SAFETY (ABSOLUTE — NOTHING CAN OVERRIDE THIS) ═══
The following allergens are LIFE-THREATENING. Do NOT include ANY ingredient
that contains or is derived from these allergens, regardless of any other
instruction in this prompt:
  ${preferences.allergies.join(', ')}
Any recipe containing these allergens will be REJECTED.`;
  }

  // ── #1.5  CUSTOM COOKING INSTRUCTIONS (overrides preferences, never allergies) ──
  // These are free-text user instructions entered in the "Any additional cooking
  // instructions?" field. They take priority over the "Based on your preferences"
  // section (RULE #3) but never override the allergy rule (RULE #1).
  if (customCookingInstructions && customCookingInstructions.trim().length > 0) {
    const trimmed = customCookingInstructions.trim();
    prompt += `

═══ RULE #1.5 — CUSTOM COOKING INSTRUCTIONS (HIGHEST PRIORITY AFTER ALLERGIES) ═══
The user has provided explicit instructions for this recipe generation. You MUST
follow these instructions exactly. These OVERRIDE the "Based on your preferences"
section below (cuisine, dietary restrictions, prep time, skill, etc.), but you
MUST still respect the allergy rule above.

USER'S INSTRUCTIONS:
"${trimmed}"

HOW TO APPLY:
• Read the instructions carefully and honour every constraint/request.
• If the user says "exclude X" or "no X" — do NOT use X in this recipe.
• If the user says "only use X" — X must be a primary ingredient.
• If the user specifies a count constraint (e.g., "only use chicken in 3 of the recipes"),
  treat this recipe according to its position in the generation sequence${recipeIndex !== undefined && totalRecipes !== undefined ? ` (this is recipe ${recipeIndex + 1} of ${totalRecipes})` : ''}.
• If the user requests a cuisine / flavour / spice level, use that exactly — even if
  it conflicts with the user's saved cuisine/dietary/skill preferences.
• If the user's instruction directly conflicts with an allergy, the allergy wins.
Any recipe that ignores these instructions will be REJECTED.`;
  }

  // ── #2  SPECIAL REQUEST (overrides preferences, never allergies) ──
  if (additionalInstructions || assignedFridgeIngredient) {
    prompt += `

═══ RULE #2 — AVAILABLE INGREDIENTS / SPECIAL REQUEST (overrides preferences below, NEVER allergies) ═══`;

    // If we have an assigned ingredient, make it mandatory for this recipe
    if (assignedFridgeIngredient) {
      prompt += `
⭐ MANDATORY INGREDIENT FOR THIS RECIPE: "${assignedFridgeIngredient.toUpperCase()}"
This recipe MUST feature "${assignedFridgeIngredient}" as a primary ingredient. Build the recipe around this ingredient.
This is NOT optional — the user specifically wants to use up this ingredient from their fridge.`;
    }

    if (additionalInstructions) {
      prompt += `

The user's full note (for context): "${additionalInstructions}"
${!assignedFridgeIngredient ? `
If this lists multiple ingredients, we are distributing them across different recipes.
For THIS recipe, focus on creating a delicious dish — other ingredients from the list will be used in other recipes.` : ''}`;
    }

    prompt += `
Never violate the allergy rule above.`;
  }

  // ── #3  USER PREFERENCES ──────────────────────────────────────
  prompt += `

═══ RULE #3 — USER PREFERENCES (follow strictly unless overridden by special request) ═══`;

  // 3a. Serving size
  prompt += `
SERVING SIZE: This recipe MUST serve exactly ${preferences.servingSize} ${preferences.servingSize === 1 ? 'person' : 'people'}. Scale all ingredient quantities for ${preferences.servingSize} servings.`;

  // 3b. Cooking skill level
  prompt += `
COOKING SKILL: ${preferences.cookingSkillLevel.toUpperCase()}.`;
  if (preferences.cookingSkillLevel === 'beginner') {
    prompt += ` Use simple techniques only (boiling, pan-frying, baking, steaming). No sous-vide, tempering, flambéing, or advanced knife work. Keep steps clear and straightforward. Maximum 6-8 steps.`;
  } else if (preferences.cookingSkillLevel === 'intermediate') {
    prompt += ` Moderate techniques are fine (sautéing, roasting, braising, stir-frying). Can use up to 10 steps.`;
  } else {
    prompt += ` Any technique is acceptable including advanced methods.`;
  }

  // 3c. Dietary restrictions
  if (preferences.dietaryRestrictions.length > 0) {
    prompt += `
DIETARY RESTRICTION: This recipe MUST be ${preferences.dietaryRestrictions.join(', ')}.`;

    if (isVegan) {
      prompt += `
  VEGAN — absolutely NO animal products:
  • NO meat (chicken, beef, pork, lamb, turkey, duck, bacon, ham, sausage)
  • NO fish or seafood (salmon, tuna, shrimp, crab, anchovy)
  • NO dairy (milk, cheese, butter, cream, yogurt, ghee, whey, casein)
  • NO eggs, mayonnaise, or egg-based products
  • NO honey, gelatin, or animal-derived additives
  • Use ONLY plant-based proteins: tofu, tempeh, seitan, lentils, chickpeas, beans, nuts, seeds
  • Any animal product = INVALID recipe, will be rejected and regenerated.`;
    } else if (isVegetarian) {
      prompt += `
  VEGETARIAN — NO meat, poultry, or seafood:
  • NO chicken, beef, pork, lamb, turkey, duck, bacon, ham, sausage
  • NO fish or seafood (salmon, tuna, shrimp, crab, anchovy)
  • Dairy and eggs ARE allowed
  • Any meat or fish = INVALID recipe, will be rejected and regenerated.`;
    }
    if (isHalal) {
      prompt += `
  HALAL — NO pork, NO alcohol-based ingredients.`;
    }
    if (isKosher) {
      prompt += `
  KOSHER — NO pork, NO shellfish, NO mixing meat and dairy.`;
    }
    if (isGlutenFree) {
      prompt += `
  GLUTEN-FREE — NO wheat, barley, rye, regular flour, bread, or pasta. Gluten-free alternatives only.`;
    }
    if (isKeto) {
      prompt += `
  KETO/LOW-CARB — minimal carbs. NO rice, potatoes, bread, pasta, sugar, or flour.`;
    }
  }

  // 3d. Cuisine preferences — HARD requirement for lunch/dinner.
  if (preferences.cuisinePreferences.length > 0) {
    const cuisineList = preferences.cuisinePreferences.join(', ');
    if (mealType === 'lunch' || mealType === 'dinner') {
      prompt += `
CUISINE (MANDATORY): This recipe MUST be authentic ${cuisineList} cuisine. Do NOT produce a dish from any other cuisine (e.g. Italian, Mexican, Mediterranean) unless it is part of ${cuisineList}. The dish name, ingredients, and flavour profile must clearly reflect ${cuisineList} cuisine.`;
    } else {
      prompt += `
CUISINE PREFERENCE: Prefer these cuisines where it fits: ${cuisineList}.`;
    }
  }

  // 3e. Prep time
  prompt += `
PREP TIME: ${preferences.mealPrepTime}.`;
  if (preferences.mealPrepTime === 'quick') {
    prompt += ` Total cook + prep time MUST be ≤ 30 minutes.`;
  } else if (preferences.mealPrepTime === 'moderate') {
    prompt += ` Total cook + prep time MUST be ≤ 60 minutes.`;
  } else {
    prompt += ` No time limit.`;
  }

  // 3f. Breakfast style (weekday = no-cook, weekend = cooked).
  // Only applies to breakfasts; the orchestrator decides which style this
  // slot needs from its day-of-week. Never overrides allergies/dietary rules.
  if (mealType === 'breakfast' && breakfastStyle) {
    if (breakfastStyle === 'no-cook') {
      prompt += `

═══ BREAKFAST STYLE — NO-COOK (WEEKDAY) ═══
This breakfast is for a busy WEEKDAY morning. It MUST require ZERO cooking — no
stovetop, oven, grill, toaster, or any applied heat. Make it a fast assemble-and-go
dish such as: overnight oats, bircher muesli, yogurt & granola parfait, smoothie or
smoothie bowl, chia pudding, cottage-cheese bowl, or a fruit-and-nut bowl.
- cookTime MUST be 0 and prepTime should be small (≤ 10 minutes).
- Do NOT include any step that fries, bakes, boils, simmers, scrambles, toasts, or
  otherwise applies heat. Assembly/mixing/chilling only.`;
    } else {
      prompt += `

═══ BREAKFAST STYLE — COOKED (WEEKEND) ═══
This breakfast is for a relaxed WEEKEND morning — a proper HOT, cooked breakfast.
Use real cooking such as: pancakes, waffles, omelette, scrambled or fried eggs,
shakshuka, breakfast hash, or French toast.
- Include at least one genuine cooking step (pan, oven, or griddle) and a realistic
  cookTime of at least 8 minutes.`;
    }
  }

  // ── #4  GROCERY OPTIMISATION & REPEAT RULES ───────────────────
  if (optimizeGrocery && sharedIngredients.length > 0) {
    // Scale ingredient limits based on total recipes in the meal plan
    // Small plans (1-5 recipes): 5-7 ingredients - tight optimization
    // Medium plans (6-14 recipes): 6-8 ingredients - moderate variety
    // Large plans (15+ recipes): 7-9 ingredients - more variety needed
    const recipeCount = totalRecipes ?? 1;
    let minIngredients: number;
    let maxIngredients: number;
    let stapleCount: string;

    if (recipeCount <= 5) {
      minIngredients = 5;
      maxIngredients = 7;
      stapleCount = '4-5';
    } else if (recipeCount <= 14) {
      minIngredients = 6;
      maxIngredients = 8;
      stapleCount = '4-6';
    } else {
      minIngredients = 7;
      maxIngredients = 9;
      stapleCount = '5-7';
    }

    prompt += `

═══ RULE #4 — GROCERY OPTIMISATION (never overrides Rules #1-#3) ═══
CRITICAL GOAL: Create a recipe with FEWER ingredients than a typical recipe. Minimize shopping.

HARD INGREDIENT LIMIT (STRICTLY ENFORCED):
- MINIMUM ${minIngredients} ingredients, MAXIMUM ${maxIngredients} ingredients
- This count INCLUDES the protein, vegetables, and seasonings
- Salt and black pepper do NOT count toward this limit
- If your recipe has more than ${maxIngredients} ingredients (excluding salt/pepper), you MUST simplify it
- Recipes exceeding this limit will be REJECTED

MANDATORY INGREDIENTS (pick ${stapleCount} from this list):
${sharedIngredients.slice(0, 15).join(', ')}

SIMPLIFICATION RULES:
- DO NOT add garnishes, toppings, or finishing touches that require extra ingredients
- DO NOT use specialty sauces or condiments - use basic seasonings instead
- DO NOT add "nice to have" ingredients - only include what's essential
- COMBINE flavoring roles: e.g., instead of "garlic + ginger + scallions", use just "garlic + ginger"
- SUBSTITUTE complex ingredients: e.g., instead of "tahini", use "olive oil"

EXAMPLE OF SIMPLIFIED RECIPE:
A stir-fry needs: protein (1) + 2 vegetables (2) + garlic (1) + soy sauce (1) + oil (1) + rice (1) = 7 ingredients ✓
NOT: protein + 4 vegetables + garlic + ginger + soy sauce + sesame oil + rice vinegar + oil + rice = 11 ingredients ✗

IMPORTANT: Every ingredient must still comply with dietary restrictions and allergies above

DISTINCT FORMAT AND COOKING STYLE:
- Each recipe must differ in format (stir-fry, curry, roast, soup, salad, bowl, wrap, etc.)
- Cooking technique must vary (pan-fry, oven-roast, simmer, grill, steam, boil, etc.)
- Previously used formats: ${previousFormats.length > 0 ? previousFormats.join(', ') : 'none yet'}
- Previously used techniques: ${previousTechniques.length > 0 ? previousTechniques.join(', ') : 'none yet'}
- Pick a format and technique NOT in the above lists.`;
  } else if (!optimizeGrocery) {
    // RULE 1 (no optimization) or RULE 2 (repeats ON, no grocery optimization)
    prompt += `

═══ RULE #4 — RECIPE QUALITY (never overrides Rules #1-#3) ═══
- Optimise for authentic flavour, culinary balance, and quality
- Use the best ingredients for this recipe${allowRepeats ? ' — focus on variety & palatability over cost' : ''}
- Include specialty and regional ingredients if they improve the dish
- A typical recipe uses 8-12 ingredients - use what's needed for authenticity
- Focus on taste, authenticity, and protein variety
- Recipe ${recipeIndex !== undefined ? recipeIndex + 1 : '?'} of ${totalRecipes ?? '?'} in a meal plan — use DIFFERENT proteins from other recipes`;
  }

  // Protein diversity (filtered by dietary restriction)
  if (optimizeGrocery && sharedIngredients.length > 0) {
    let proteinDiversityInstruction = '';
    let proteinReuseInstruction = '';

    // Use actual mealCount if available, otherwise estimate from totalRecipes
    const actualMealCount = mealCount || (totalRecipes !== undefined ? Math.ceil(totalRecipes * 1.2) : 0);
    const recipeNumber = recipeIndex !== undefined ? recipeIndex + 1 : undefined;

    // Protein reuse instructions for specific meal counts (when optimizeGrocery ON)
    if (actualMealCount === 2 && recipeNumber) {
      if (recipeNumber === 1) {
        proteinReuseInstruction = 'RECIPE 1 OF 2: Pick any protein. This will be used for BOTH meals.';
      } else if (recipeNumber === 2) {
        proteinReuseInstruction = 'RECIPE 2 OF 2: MUST use the SAME protein as Recipe 1 to minimize grocery shopping.';
      }
    } else if (actualMealCount === 3 && recipeNumber) {
      if (recipeNumber <= 2) {
        proteinReuseInstruction = `RECIPE ${recipeNumber} OF 3: Use the SAME protein. Recipes 1-2 share one protein for cost efficiency.`;
      } else if (recipeNumber === 3) {
        proteinReuseInstruction = 'RECIPE 3 OF 3: Use a DIFFERENT protein (pantry staple or low-cost option preferred). Do NOT repeat the protein from recipes 1-2.';
      }
    } else if (actualMealCount === 4 && recipeNumber) {
      if (recipeNumber <= 2) {
        proteinReuseInstruction = `RECIPE ${recipeNumber} OF 4: Use PROTEIN A (same as recipe 1). Recipes 1-2 share protein A.`;
      } else if (recipeNumber === 3) {
        proteinReuseInstruction = 'RECIPE 3 OF 4: Switch to PROTEIN B (different from recipes 1-2). This is the first recipe with protein B.';
      } else if (recipeNumber === 4) {
        proteinReuseInstruction = 'RECIPE 4 OF 4: Use PROTEIN B (same as recipe 3). Recipes 3-4 share protein B for cost efficiency.';
      }
    } else if (actualMealCount >= 5 && actualMealCount <= 6) {
      proteinDiversityInstruction = 'This meal plan has 5-6 meals — ensure at least 2 DIFFERENT proteins across all recipes.';
      if (recipeNumber === 1) {
        proteinReuseInstruction = 'RECIPE 1 OF 5-6: Pick any protein as the first option.';
      } else if (recipeNumber === 2) {
        proteinReuseInstruction = 'RECIPE 2 OF 5-6: Can use same or different protein.';
      } else if (recipeNumber && excludeProteins.length === 0) {
        proteinReuseInstruction = `RECIPE ${recipeNumber} OF 5-6: Reuse one of the proteins from earlier recipes if possible.`;
      }
    } else if (actualMealCount >= 7) {
      proteinDiversityInstruction = 'This meal plan has 7+ meals — ensure at least 3 DIFFERENT proteins across all recipes.';
      if (recipeNumber === 1) {
        proteinReuseInstruction = 'RECIPE 1 OF 7+: Pick any protein as the first option.';
      } else if (recipeNumber === 2) {
        proteinReuseInstruction = 'RECIPE 2 OF 7+: Can use same or different protein.';
      } else if (recipeNumber && excludeProteins.length === 0) {
        proteinReuseInstruction = `RECIPE ${recipeNumber} OF 7+: Reuse one of the proteins from earlier recipes if possible.`;
      }
    }

    if (proteinDiversityInstruction || proteinReuseInstruction) {
      prompt += `\n${proteinDiversityInstruction}${proteinDiversityInstruction && proteinReuseInstruction ? '\n' : ''}${proteinReuseInstruction}`;

      let proteinOptions: string[];
      if (isVegan) {
        proteinOptions = ['Tofu', 'Tempeh', 'Seitan', 'Lentils', 'Chickpeas', 'Black Beans', 'Kidney Beans', 'Edamame', 'Quinoa', 'Hemp Seeds'];
      } else if (isVegetarian) {
        proteinOptions = ['Tofu', 'Tempeh', 'Lentils', 'Chickpeas', 'Beans', 'Eggs', 'Paneer', 'Cottage Cheese', 'Quinoa', 'Greek Yogurt'];
      } else {
        proteinOptions = ['Chicken', 'Beef', 'Pork', 'Fish', 'Salmon', 'Shrimp', 'Lamb', 'Turkey', 'Tofu', 'Lentils', 'Chickpeas', 'Beans'];
      }

      prompt += `\nAvailable protein options (pick ONE): ${proteinOptions.join(', ')}`;

      if (excludeProteins.length > 0) {
        prompt += `\nAlready used — DO NOT repeat: ${excludeProteins.join(', ')}`;
      }
    }
  }

  if (excludeNames.length > 0) {
    prompt += `

═══ DUPLICATE PREVENTION (CRITICAL) ═══
Do NOT generate any of these recipes - they have ALREADY been created:
${excludeNames.map(name => `  ✗ "${name}"`).join('\n')}
You MUST generate a COMPLETELY DIFFERENT recipe with a DIFFERENT name, DIFFERENT main ingredient, and DIFFERENT cooking method.
Similar variations are NOT allowed. Examples of what is NOT allowed:
  - "Lemon Garlic Chicken with Rice" and "Lemon Garlic Chicken with Vegetables" (same base dish)
  - "Grilled Chicken" and "Grilled Chicken with Herbs" (same dish + garnish)
  - "Chicken Stir Fry" and "Chicken Vegetable Stir Fry" (same format)
${
  (mealType === 'lunch' || mealType === 'dinner') && preferences.cuisinePreferences.length > 0
    ? `Keep the cuisine as ${preferences.cuisinePreferences.join('/')} (that is required), but change the PROTEIN and the COOKING METHOD to create real variety.`
    : 'Change the PROTEIN, the CUISINE STYLE, and the COOKING METHOD to create real variety.'
}`;
  }

  if (excludeProteins.length > 0) {
    prompt += `
PROTEIN DIVERSITY (MANDATORY): Do NOT use these proteins — they were already used in other recipes: ${excludeProteins.join(', ')}.
Pick a COMPLETELY DIFFERENT protein source for this recipe.`;
  }

  // Variety hint — use random style selection for unpredictability
  if (totalRecipes !== undefined && totalRecipes > 1) {
    const varietyStyles = [
      'classic comfort food style',
      'light and fresh style',
      'bold and spicy style',
      'hearty and filling style',
      'quick and simple style',
      'gourmet restaurant style',
      'rustic homestyle',
      'modern fusion style',
      'Mediterranean inspired',
      'Asian inspired',
      'Latin American inspired',
      'Middle Eastern inspired',
      'Southern comfort style',
      'Scandinavian inspired',
      'farm-to-table fresh',
    ];
    // Use random selection instead of sequential to avoid predictable patterns
    const styleIndex = Math.floor(Math.random() * varietyStyles.length);
    prompt += `\n\nVARIETY REQUIREMENT: Make this recipe ${varietyStyles[styleIndex]} — it MUST be distinctly different from the other recipes in this meal plan.`;
  }

  if (previousFormats.length > 0 || previousTechniques.length > 0) {
    prompt += `\n\nALREADY USED COOKING STYLES (do NOT repeat these):`;
    if (previousFormats.length > 0) {
      prompt += `\n- Formats already used: ${previousFormats.join(', ')} — pick a DIFFERENT format`;
    }
    if (previousTechniques.length > 0) {
      prompt += `\n- Techniques already used: ${previousTechniques.join(', ')} — pick a DIFFERENT technique`;
    }
  }

  // ── Category guidance (prevents miscategorization) ────────────────
  prompt += `

${getCategoryGuidancePrompt()}

`;

  // ── JSON output format ─────────────────────────────────────────
  prompt += `

Return a JSON object with this exact structure:
{
  "name": "Recipe Name",
  "description": "A brief, appetizing description",
  "mealType": "${mealType}",
  "cookTime": 20,
  "prepTime": 10,
  "servings": ${preferences.servingSize},
  "ingredients": [
    {"name": "Ingredient", "quantity": "250", "unit": "g", "category": "produce|dairy|meat|pantry|frozen|bakery|other"}
  ],
  "instructions": ["Step 1", "Step 2"],
  "tags": ["tag1", "tag2"],
  "calories": 400
}

METRIC UNITS ONLY — and use ONE canonical unit family per ingredient so the
grocery list never gets duplicate lines for the same item:
- LIQUIDS (water, milk, cream, oils, broth/stock, juice, vinegar, soy/fish/other liquid sauces, honey, syrup, wine): use "ml" or "l" ONLY.
- COUNT PRODUCE bought whole (egg, onion, garlic, tomato, potato, carrot, capsicum, cucumber, zucchini, lemon, lime, apple, banana, avocado, lettuce, celery, broccoli, mushroom): use count units — "piece", "pieces", "clove", "head", "stalk".
- EVERYTHING ELSE (rice, flour, pasta, oats, quinoa, couscous, sugar, beans/lentils/chickpeas, cheese, meat, fish, chicken, butter, nuts, breadcrumbs, spices): use "g" or "kg" ONLY.
- ABSOLUTELY NO cups, tbsp, tsp, oz, or lb anywhere. For spices give grams (e.g. 5 g salt). For rice/flour give grams (e.g. 185 g rice), never cups.
- Be consistent: the SAME ingredient must always use the SAME unit family across every recipe.
- Never use 0, empty, undefined, null, or NaN for any quantity or unit.

FINAL COMPLIANCE CHECK — before returning, verify:
${preferences.allergies.length > 0 ? `✓ NO ingredient contains: ${preferences.allergies.join(', ')}` : ''}
${preferences.dietaryRestrictions.length > 0 ? `✓ EVERY ingredient complies with: ${preferences.dietaryRestrictions.join(', ')}` : ''}
✓ Servings = ${preferences.servingSize}
✓ Skill level = ${preferences.cookingSkillLevel}
${preferences.mealPrepTime === 'quick' ? '✓ Total time ≤ 30 min' : preferences.mealPrepTime === 'moderate' ? '✓ Total time ≤ 60 min' : ''}
If ANY check fails, fix the recipe before returning.

Only return valid JSON, no markdown or explanation.`;

  return prompt;
}

/**
 * Sanitize recipe ingredients to fix common issues with quantities, units, and categories
 */
function sanitizeRecipeIngredients(recipe: GeneratedRecipeResponse): GeneratedRecipeResponse {
  // First split any compound ingredient names ("Olive Oil + 2 tsp Cumin") into
  // separate ingredients so each becomes its own line, THEN validate each.
  const expandedIngredients = recipe.ingredients.flatMap(ing =>
    splitCompoundIngredient({
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category,
    }),
  );
  const validatedIngredients = expandedIngredients.map(ing => {
    const validated = validateIngredient({
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category,
    });
    if (ing.unit !== validated.unit) {
      console.log(`[AI RECIPE] Correcting ${ing.name}: "${ing.quantity} ${ing.unit}" → "${validated.quantity} ${validated.unit}"`);
    }

    // Correct miscategorized ingredients using robust category mapping
    const correctCategory = determineIngredientCategory(ing.name);
    if (ing.category !== correctCategory) {
      console.log(`[AI RECIPE] Correcting ${ing.name} category: "${ing.category}" → "${correctCategory}"`);
    }

    return {
      ...validated,
      category: correctCategory,
    };
  });

  // Log any issues found
  logIngredientValidationIssues(validatedIngredients);

  // Return recipe with sanitized ingredients
  return {
    ...recipe,
    ingredients: validatedIngredients.map(v => ({
      name: v.name,
      quantity: v.quantity,
      unit: v.unit,
      category: v.category,
    })),
  };
}

// Call OpenAI API to generate a single recipe (direct API call)
async function callOpenAIForRecipe(prompt: string): Promise<GeneratedRecipeResponse> {
  const text = await callOpenAIDirect([
    {
      role: 'system',
      content: 'You are a helpful chef assistant that generates recipes in JSON format. Only output valid JSON, no markdown or explanations.',
    },
    {
      role: 'user',
      content: prompt,
    },
  ]);

  const recipe = parseJSONResponse(text, false) as GeneratedRecipeResponse;
  // Sanitize ingredients to fix any quantity/unit issues
  return sanitizeRecipeIngredients(recipe);
}

// Call OpenAI API to generate a recipe with meal type validation
async function callOpenAIForRecipeWithValidation(
  prompt: string,
  mealType: MealType,
  attemptNumber: number = 1
): Promise<GeneratedRecipeResponse> {
  const recipe = await callOpenAIForRecipe(prompt);

  // Validate meal type
  const validation = validateMealType(recipe, mealType);
  const report = getClassificationReport(recipe, mealType);

  console.log(`[MealTypeValidation] ${report.reason} (confidence: ${report.confidence.toFixed(0)}%)`);

  if (validation.isValid) {
    console.log(`✓ Recipe "${recipe.name}" validated for ${mealType}`);
    return recipe;
  }

  // If validation fails and we haven't tried too many times, regenerate with better prompt
  if (attemptNumber < 2) {
    console.warn(
      `⚠️ Recipe "${recipe.name}" failed validation for ${mealType} (detected: ${report.detectedType}). Regenerating with stricter guidance...`
    );

    // Create a more explicit prompt for the detected type
    const stricterPrompt = prompt.replace(
      `Generate a ${mealType} recipe that is SPECIFICALLY SUITABLE for ${mealType}`,
      `CRITICAL: Generate ONLY a ${mealType} recipe. This MUST be a ${mealType}, NOT a ${report.detectedType}.`
    );

    return callOpenAIForRecipeWithValidation(stricterPrompt, mealType, attemptNumber + 1);
  }

  // Return recipe even if validation failed (after 2 attempts)
  console.log(`✓ Accepting recipe after ${attemptNumber} attempts (confidence: ${validation.confidence.toFixed(0)}%)`);
  return recipe;
}

// Generate a single recipe (public API)
export async function generateRecipe(
  params: GenerateRecipeParams
): Promise<GeneratedRecipeResponse> {
  const mealType = params.mealTypes[0] ?? 'dinner';
  const MAX_PREFERENCE_RETRIES = 3;

  // For single recipe generation with fridge ingredients, extract the primary ingredient to assign
  let assignedFridgeIngredient: string | undefined = undefined;
  if (params.additionalInstructions) {
    const fridgeIngredientsWithQty = parseFridgeIngredientsWithQuantity(params.additionalInstructions, params.preferences.servingSize);
    if (fridgeIngredientsWithQty.length > 0) {
      // For single recipe, prioritize the first ingredient
      assignedFridgeIngredient = fridgeIngredientsWithQty[0].name;
      console.log(`[SingleRecipe] Assigning fridge ingredient: ${assignedFridgeIngredient}`);
    }
  }

  for (let attempt = 1; attempt <= MAX_PREFERENCE_RETRIES; attempt++) {
    const prompt = buildSingleRecipePrompt(
      mealType,
      params.preferences,
      params.additionalInstructions,
      [], // excludeNames
      [], // sharedIngredients
      undefined, // recipeIndex
      undefined, // totalRecipes
      undefined, // optimizeGrocery
      undefined, // allowRepeats
      [], // excludeProteins
      [], // previousFormats
      [], // previousTechniques
      assignedFridgeIngredient, // Pass the assigned fridge ingredient as mandatory
      undefined, // mealCount - not applicable for single meal generation
      params.customCookingInstructions // customCookingInstructions from user
    );

    console.log(`Generating single recipe (attempt ${attempt}/${MAX_PREFERENCE_RETRIES})...`);
    const recipe = await callOpenAIForRecipeWithValidation(prompt, mealType);
    recipe.mealType = mealType;

    // Validate recipe contains the assigned fridge ingredient
    if (assignedFridgeIngredient) {
      const ingredientText = `${recipe.name} ${recipe.description} ${(recipe.ingredients || []).map(i => i.name).join(' ')}`.toLowerCase();
      if (!ingredientText.includes(assignedFridgeIngredient.toLowerCase())) {
        console.warn(`⚠️ Recipe "${recipe.name}" doesn't contain required fridge ingredient "${assignedFridgeIngredient}" (attempt ${attempt})`);
        if (attempt < MAX_PREFERENCE_RETRIES) continue; // Retry
      }
    }

    // Validate recipe against user preferences
    // Special request can override preferences but never allergies
    const hasSpecialRequest = !!params.additionalInstructions;
    const validation = validateRecipeAgainstPreferences(
      recipe,
      params.preferences,
      hasSpecialRequest,
      !!assignedFridgeIngredient // Allow allergen overrides for fridge-assigned ingredients
    );

    // Always attach violations for display (even if validation passes)
    recipe.violations = validation.violations;

    if (validation.isValid) {
      console.log('Generated recipe:', recipe.name);
      return recipe;
    }

    console.warn(`⚠️ Recipe "${recipe.name}" failed preference validation (attempt ${attempt}):`, validation.violations.join('; '));

    if (attempt === MAX_PREFERENCE_RETRIES) {
      console.warn(`⚠️ Failed to generate compliant recipe after ${MAX_PREFERENCE_RETRIES} attempts. Returning last attempt.`);
      // Still return the recipe with violations for display
      return recipe;
    }
  }

  // Fallback - should not reach here
  throw new Error('Failed to generate recipe');
}

// Generate a meal plan with exact number of recipes using parallel API calls
export async function generateMealPlan(
  params: GenerateRecipeParams
): Promise<GeneratedRecipeResponse[]> {
  const { mealTypes, preferences, additionalInstructions, optimizeGrocery, allowRepeats = true, customCookingInstructions } = params;
  const totalToGenerate = params.recipesToGenerate ?? 1;

  // Check rate limits BEFORE generating any recipes
  const rateLimitCheck = await checkRateLimit(totalToGenerate);
  if (!rateLimitCheck.allowed) {
    console.error('[RateLimit]', rateLimitCheck.reason);
    throw new Error(rateLimitCheck.reason || 'Rate limit exceeded');
  }

  console.log(
    `[RateLimit] Check passed. Generating ${totalToGenerate} recipes. Remaining: ${rateLimitCheck.remaining_hour}/${300} hour, ${rateLimitCheck.remaining_day}/${1000} day`
  );

  console.log('=== MEAL PLAN GENERATION START ===');
  console.log('Total recipes needed:', totalToGenerate);
  console.log('Meal types:', mealTypes);
  console.log('Allow repeats:', allowRepeats);
  console.log('Optimize grocery:', optimizeGrocery);

  // ═══════════════════════════════════════════════════════════════════════════════
  // FRIDGE INGREDIENTS PARSING AND DISTRIBUTION
  // ═══════════════════════════════════════════════════════════════════════════════
  // Parse user's fridge ingredients WITH quantities and create an assignment queue
  // that respects how much of each ingredient the user has available
  const servingSize = preferences.servingSize || 1;
  const fridgeIngredientsWithQty = additionalInstructions ? parseFridgeIngredientsWithQuantity(additionalInstructions, servingSize) : [];
  const fridgeIngredients = fridgeIngredientsWithQty.map(ing => ing.name);
  const fridgeIngredientQueue: string[] = [];

  if (fridgeIngredientsWithQty.length > 0) {
    console.log(`[FridgeIngredients] User has ${fridgeIngredientsWithQty.length} ingredients:`);
    fridgeIngredientsWithQty.forEach(ing => {
      console.log(`  - ${ing.name}: quantity=${ing.quantity}, maxRecipes=${ing.maxRecipes}`);
    });

    // QUANTITY-AWARE DISTRIBUTION:
    // Instead of distributing evenly, respect each ingredient's maxRecipes based on quantity
    // This prevents overusing limited ingredients (e.g., 2 barramundi → max 2 recipes)

    // Build a pool of ingredient assignments respecting max recipes
    const ingredientPool: string[] = [];
    for (const ing of fridgeIngredientsWithQty) {
      // Add this ingredient to the pool up to its maxRecipes limit
      for (let i = 0; i < ing.maxRecipes; i++) {
        ingredientPool.push(ing.name);
      }
    }

    console.log(`[FridgeIngredients] Ingredient pool (respecting quantities): ${ingredientPool.join(', ')}`);
    console.log(`[FridgeIngredients] Total assignments available: ${ingredientPool.length} for ${totalToGenerate} recipes`);

    // If we have more recipes than ingredient assignments, we need to fill the gap
    // by either: (1) using ingredients without quantity limits, or (2) letting some recipes be freestyle
    if (ingredientPool.length >= totalToGenerate) {
      // We have enough - just take what we need
      // Shuffle the pool first to add variety
      for (let i = ingredientPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ingredientPool[i], ingredientPool[j]] = [ingredientPool[j], ingredientPool[i]];
      }
      fridgeIngredientQueue.push(...ingredientPool.slice(0, totalToGenerate));
    } else {
      // Not enough assignments to cover all recipes - use what we have
      // The remaining recipes will be generated without a specific fridge ingredient
      // Shuffle the pool first
      for (let i = ingredientPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ingredientPool[i], ingredientPool[j]] = [ingredientPool[j], ingredientPool[i]];
      }
      fridgeIngredientQueue.push(...ingredientPool);

      // Fill remaining slots with empty string (freestyle recipes)
      const remaining = totalToGenerate - ingredientPool.length;
      console.log(`[FridgeIngredients] ${remaining} recipes will be generated without specific fridge ingredients`);
      for (let i = 0; i < remaining; i++) {
        fridgeIngredientQueue.push(''); // Empty = no specific ingredient required
      }

      // Shuffle again so freestyle recipes are distributed throughout
      for (let i = fridgeIngredientQueue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [fridgeIngredientQueue[i], fridgeIngredientQueue[j]] = [fridgeIngredientQueue[j], fridgeIngredientQueue[i]];
      }
    }

    console.log(`[FridgeIngredients] Final assignment queue: ${fridgeIngredientQueue.map(i => i || '(freestyle)').join(', ')}`);
  }

  // Build intelligent shared ingredients list for grocery optimization
  // Filter out ingredients that conflict with dietary restrictions
  const sharedIngredients: string[] = [];
  if (optimizeGrocery) {
    const restrictionLower = preferences.dietaryRestrictions.map(r => r.toLowerCase());
    const isVegan = restrictionLower.some(r => r.includes('vegan'));
    const isVegetarian = restrictionLower.some(r => r.includes('vegetarian'));
    const isDairyFree = restrictionLower.some(r => r.includes('dairy-free'));
    const isGlutenFree = restrictionLower.some(r => r.includes('gluten-free'));

    // Non-animal staples that are always safe
    const veganUnsafe = ['chicken breast', 'eggs', 'milk', 'butter', 'honey'];
    const vegetarianUnsafe = ['chicken breast'];
    const dairyUnsafe = ['milk', 'butter'];
    const glutenUnsafe = ['pasta'];

    const filteredStaples = HOUSEHOLD_STAPLES.filter(staple => {
      const stapleLower = staple.toLowerCase();
      if (isVegan && veganUnsafe.some(u => stapleLower.includes(u))) return false;
      if (isVegetarian && vegetarianUnsafe.some(u => stapleLower.includes(u))) return false;
      if (isDairyFree && dairyUnsafe.some(u => stapleLower.includes(u))) return false;
      if (isGlutenFree && glutenUnsafe.some(u => stapleLower.includes(u))) return false;
      return true;
    });

    sharedIngredients.push(...filteredStaples);
    console.log('Grocery optimization enabled with', sharedIngredients.length, 'household staples (filtered for dietary restrictions)');
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // RECIPE GENERATION COUNT LOGIC
  // ═══════════════════════════════════════════════════════════════════════════════
  //
  // Rule 1: Allow Repeats OFF
  //   → Generate ALL recipes as unique (do NOT reduce count)
  //   → Optimize Grocery applies: shared ingredients + protein diversity
  //   → Result: All 14 recipes are unique with optimized ingredients
  //
  // Rule 2: Allow Repeats ON (with Optimize Grocery OFF)
  //   → Generate fewer unique recipes: totalToGenerate - maxAllowedRepeats
  //   → maxAllowedRepeats = number of UNIQUE recipes that can be repeated
  //   → EACH repeated recipe appears exactly 2 times (original + 1 repeat)
  //   → LEFTOVERS LOGIC: Dinner repeats as next-day LUNCH (saves cooking time)
  //   → Based on lunch/dinner count:
  //     - 3-4 meals: 1 unique recipe repeated (appears 2x)
  //     - 5-8 meals: 2 unique recipes repeated (each appears 2x)
  //     - 9-13 meals: 3 unique recipes repeated (each appears 2x)
  //     - 14+ meals: 4 unique recipes repeated (each appears 2x)
  //   → NO recipe should appear more than 2 times total
  //   → Focus on protein variety and palatability
  //
  // Rule 3: Allow Repeats ON + Optimize Grocery ON
  //   → Same repeat logic as Rule 2
  //   → Apply shared ingredients + protein diversity + cost-effective alternatives
  //   → Most efficient: fewer recipes AND shared ingredients
  // ═══════════════════════════════════════════════════════════════════════════════

  let uniqueRecipesToGenerate = totalToGenerate;
  let maxAllowedRepeats = 0; // Track max repeats allowed

  // Calculate meal type counts (needed for both rules and 3-meal special case)
  const repeatableMealTypes = mealTypes.filter(mt => mt === 'lunch' || mt === 'dinner');
  const nonRepeatableMealTypes = mealTypes.filter(mt => mt !== 'lunch' && mt !== 'dinner');
  const slotsPerDay = totalToGenerate / mealTypes.length;
  const repeatableMealCount = Math.round(slotsPerDay * repeatableMealTypes.length);

  if (!allowRepeats) {
    // ── RULE 1: Allow Repeats OFF ──────────────────────────────────────────────
    // Generate ALL recipes as unique, regardless of meal type mix
    console.log('═══ RULE 1: Allow Repeats OFF ═══');
    console.log('Generating ALL', totalToGenerate, 'recipes as UNIQUE');
    if (optimizeGrocery) {
      console.log('✓ Grocery optimization ENABLED: shared ingredients + protein diversity applied');
    } else {
      console.log('✓ Grocery optimization DISABLED: focus on taste & palatability');
    }
  } else {
    // ── RULE 2 & 3: Allow Repeats ON ──────────────────────────────────────────
    // Calculate how many lunch/dinner meal slots we have
    // mealTypes is like ['breakfast', 'lunch', 'dinner', 'snack']
    // For each day, we have one of each meal type
    // So: lunch count = (total recipes / total meal types) * 1
    // Or more directly: count how many slots are lunch/dinner

    // Only enable repeats if we have 3+ lunch/dinner meals
    if (repeatableMealCount < 3) {
      // Fallback to unique generation if not enough repeatable meals
      console.log('═══ RULE 1 (fallback): Not enough repeatable meals ═══');
      console.log('Lunch/dinner count:', repeatableMealCount, '(need 3+)');
      console.log('Generating ALL', totalToGenerate, 'recipes as UNIQUE');
    } else {
      // Calculate max allowed repeats based on lunch/dinner meal count
      if (repeatableMealCount >= 14) {
        maxAllowedRepeats = 4; // 14+ meals: max 4 repeats
      } else if (repeatableMealCount >= 9) {
        maxAllowedRepeats = 3; // 9-13 meals: max 3 repeats
      } else if (repeatableMealCount >= 5) {
        maxAllowedRepeats = 2; // 5-8 meals: max 2 repeats
      } else if (repeatableMealCount >= 3) {
        maxAllowedRepeats = 1; // 3-4 meals: max 1 repeat
      }

      // Calculate unique recipes: Total meals - max repeats allowed
      uniqueRecipesToGenerate = totalToGenerate - maxAllowedRepeats;

      console.log('═══ RULE 2 & 3: Allow Repeats ON ═══');
      console.log('Total meals needed:', totalToGenerate);
      console.log('Meal types mix:', mealTypes);
      console.log('Lunch/dinner meal count:', repeatableMealCount);
      console.log('Max repeats allowed:', maxAllowedRepeats);
      console.log('Unique recipes to generate:', uniqueRecipesToGenerate);
      if (optimizeGrocery) {
        console.log('✓ Rule 3: Grocery optimization ENABLED - shared ingredients + cost-effective alternatives');
      } else {
        console.log('✓ Rule 2: Grocery optimization DISABLED - focus on protein variety & palatability');
      }
    }
  }

  // Create all recipe generation promises
  // For better variety, we'll use batches to allow protein tracking
  const recipes: GeneratedRecipeResponse[] = [];
  const usedProteins: Set<string> = new Set();
  const usedFormats: string[] = []; // NEW: track formats
  const usedTechniques: string[] = []; // NEW: track techniques
  const usedRecipeNames: string[] = []; // Track recipe names to prevent duplicates
  // Use batch size of 1 (sequential) when:
  // 1. Generate few unique recipes (≤3) — easier to avoid concurrent duplicates
  // 2. Repeats are disabled — absolute requirement for uniqueness
  // Otherwise use batch size 3 for efficiency
  const batchSize = (uniqueRecipesToGenerate <= 3 || !allowRepeats) ? 1 : 3;

  console.log(`Generating ${uniqueRecipesToGenerate} unique recipes in batches of ${batchSize}${batchSize === 1 ? ' (sequential for uniqueness)' : ' (parallel with caching)'}...`);

  for (let batchStart = 0; batchStart < uniqueRecipesToGenerate; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, uniqueRecipesToGenerate);
    const batchPromises: Promise<GeneratedRecipeResponse | null>[] = [];

    for (let i = batchStart; i < batchEnd; i++) {
      // Cycle through meal types
      const mealType = mealTypes[i % mealTypes.length];

      // Build protein exclusion list for variety
      // RULE 2: Allow Repeats ON + Optimize Grocery OFF
      //   → Exclude proteins for palatability (avoid same protein back-to-back)
      // RULE 3: Allow Repeats ON + Optimize Grocery ON
      //   → AGGRESSIVELY exclude proteins to force diversity + minimize ingredient cost
      // RULE 1: Allow Repeats OFF
      //   → AGGRESSIVELY exclude proteins if grocery optimization ON
      //   → Otherwise exclude proteins for basic variety
      // SPECIAL: 3-meal case with optimizeGrocery
      //   → First 2 recipes: same protein
      //   → 3rd recipe: different protein, prefer pantry staples (daal) or low-cost proteins (chicken)

      let proteinsToExclude = Array.from(usedProteins);

      // Protein diversity enforcement when optimizeGrocery is ON
      // Rules:
      // - 2 meals: same protein for both
      // - 3 meals: 2 recipes with same protein, 1 with different (pantry staple/low-cost)
      // - 4 meals: 2 recipes with protein A, 2 recipes with protein B
      // - 5-6 meals: at least 2 different proteins
      // - 7+ meals: at least 3 different proteins
      if (optimizeGrocery) {
        const relativeIndex = i - batchStart;

        if (repeatableMealCount === 2) {
          // 2 meals: both use same protein
          proteinsToExclude = [];
          console.log(`[Recipe ${relativeIndex + 1}/2] Using SAME protein for grocery optimization (2-meal plan)`);
        } else if (repeatableMealCount === 3) {
          // 3 meals: first 2 same, 3rd different
          if (relativeIndex < 2) {
            proteinsToExclude = [];
            console.log(`[Recipe ${relativeIndex + 1}/3] Using SAME protein for grocery optimization (3-meal plan, recipes 1-2)`);
          } else if (relativeIndex === 2) {
            proteinsToExclude = Array.from(usedProteins);
            console.log(`[Recipe ${relativeIndex + 1}/3] Using DIFFERENT protein - excluding: ${Array.from(usedProteins).join(', ')} (3-meal plan, recipe 3, prefer pantry staples/low-cost)`);
          }
        } else if (repeatableMealCount === 4) {
          // 4 meals: 2 with protein A, 2 with protein B
          if (relativeIndex < 2) {
            proteinsToExclude = [];
            console.log(`[Recipe ${relativeIndex + 1}/4] Using SAME protein A for grocery optimization (4-meal plan, recipes 1-2)`);
          } else if (relativeIndex === 2) {
            proteinsToExclude = Array.from(usedProteins);
            console.log(`[Recipe ${relativeIndex + 1}/4] Switching to DIFFERENT protein B - excluding: ${Array.from(usedProteins).join(', ')} (4-meal plan, recipe 3)`);
          } else if (relativeIndex === 3) {
            // Recipe 4: reuse protein B (don't exclude)
            proteinsToExclude = [];
            console.log(`[Recipe ${relativeIndex + 1}/4] Using SAME protein B as recipe 3 for cost optimization (4-meal plan, recipe 4)`);
          }
        } else if (repeatableMealCount >= 5 && repeatableMealCount <= 6) {
          // 5-6 meals: at least 2 different proteins
          if (relativeIndex === 0) {
            proteinsToExclude = [];
            console.log(`[Recipe ${relativeIndex + 1}/5-6] Using first protein (5-6 meal plan)`);
          } else if (relativeIndex === 1) {
            // Allow same as first (for pairing) or can be different
            proteinsToExclude = [];
            console.log(`[Recipe ${relativeIndex + 1}/5-6] Can use same or different protein (5-6 meal plan)`);
          } else if (usedProteins.size < 2) {
            // Force 2nd protein if we only have 1 so far
            proteinsToExclude = Array.from(usedProteins);
            console.log(`[Recipe ${relativeIndex + 1}/5-6] Forcing 2nd protein - excluding: ${Array.from(usedProteins).join(', ')} (5-6 meal plan, need 2+ proteins)`);
          } else {
            // We have at least 2 proteins, can use any
            proteinsToExclude = [];
            console.log(`[Recipe ${relativeIndex + 1}/5-6] Already have 2+ proteins, flexible protein choice (5-6 meal plan)`);
          }
        } else if (repeatableMealCount >= 7) {
          // 7+ meals: at least 3 different proteins
          if (relativeIndex === 0) {
            proteinsToExclude = [];
            console.log(`[Recipe ${relativeIndex + 1}/7+] Using first protein (7+ meal plan)`);
          } else if (relativeIndex === 1) {
            // Can be same as first or different
            proteinsToExclude = [];
            console.log(`[Recipe ${relativeIndex + 1}/7+] Can use same or different protein (7+ meal plan)`);
          } else if (relativeIndex === 2 && usedProteins.size < 2) {
            // Force 2nd protein if needed
            proteinsToExclude = Array.from(usedProteins);
            console.log(`[Recipe ${relativeIndex + 1}/7+] Forcing 2nd protein - excluding: ${Array.from(usedProteins).join(', ')} (7+ meal plan, need 2+ proteins)`);
          } else if (usedProteins.size < 3) {
            // Force 3rd protein if we only have 2
            proteinsToExclude = Array.from(usedProteins);
            console.log(`[Recipe ${relativeIndex + 1}/7+] Forcing 3rd protein - excluding: ${Array.from(usedProteins).join(', ')} (7+ meal plan, need 3+ proteins)`);
          } else {
            // We have at least 3 proteins, can use any
            proteinsToExclude = [];
            console.log(`[Recipe ${relativeIndex + 1}/7+] Already have 3+ proteins, flexible protein choice (7+ meal plan)`);
          }
        }
      } else if (allowRepeats) {
        // Allow repeats without grocery optimization: exclude used proteins for variety
        proteinsToExclude = Array.from(usedProteins);
      }

      // Get the assigned fridge ingredient for this recipe (if any)
      // Empty string means "freestyle" - no specific ingredient required
      const rawFridgeIngredient = fridgeIngredientQueue.length > 0 ? fridgeIngredientQueue[i] : undefined;
      const assignedFridgeIngredient = rawFridgeIngredient && rawFridgeIngredient.length > 0 ? rawFridgeIngredient : undefined;

      // Only pass additionalInstructions if this recipe is assigned a fridge ingredient
      // For freestyle recipes, don't mention fridge ingredients to avoid AI generating with them anyway
      let recipeAdditionalInstructions = '';
      if (assignedFridgeIngredient) {
        recipeAdditionalInstructions = additionalInstructions || '';
        console.log(`[Recipe ${i + 1}] Assigned fridge ingredient: ${assignedFridgeIngredient}`);
      } else if (fridgeIngredientQueue.length > 0) {
        // Freestyle recipe - don't include fridge ingredient instructions
        recipeAdditionalInstructions = ''; // Clear to avoid AI using fridge ingredients
        console.log(`[Recipe ${i + 1}] Freestyle recipe (no specific fridge ingredient assigned)`);
      } else {
        // No fridge ingredients at all, use original instructions
        recipeAdditionalInstructions = additionalInstructions || '';
      }

      const prompt = buildSingleRecipePrompt(
        mealType,
        preferences,
        recipeAdditionalInstructions,
        usedRecipeNames, // Pass already generated recipe names to exclude
        optimizeGrocery ? sharedIngredients : [], // Only pass ingredients if optimizing grocery
        i, // Pass recipe index for variety
        uniqueRecipesToGenerate, // Pass total count for variety hints
        optimizeGrocery, // Pass optimization flag
        allowRepeats, // Pass allow repeats flag
        proteinsToExclude, // Pass proteins to exclude
        usedFormats, // NEW: pass used formats
        usedTechniques, // NEW: pass used techniques
        assignedFridgeIngredient, // NEW: assigned ingredient from user's fridge
        repeatableMealCount, // NEW: pass actual meal count for protein diversity logic
        customCookingInstructions // NEW: user's free-text custom instructions
      );

      // Create promise for this recipe (with meal type validation and error handling)
      const recipePromise = callOpenAIForRecipeWithValidation(prompt, mealType)
        .then(recipe => {
          recipe.mealType = mealType;
          console.log(`Generated: ${recipe.name} (${mealType})`);

          // VALIDATION: Check for duplicate recipe names during initial unique generation.
          // STRICT MODE: Only enforce when allowRepeats = OFF (absolute uniqueness required)
          // FLEX MODE: When allowRepeats = ON, allow some duplicates — controlled repeats via repeat-filling step
          if (!allowRepeats && usedRecipeNames.length > 0) {
            const lowerCaseName = recipe.name.toLowerCase();
            const isDuplicate = usedRecipeNames.some(existingName => {
              const existingLower = existingName.toLowerCase();
              // Check exact match or very similar names
              return existingLower === lowerCaseName ||
                existingLower.includes(lowerCaseName) ||
                lowerCaseName.includes(existingLower);
            });
            if (isDuplicate) {
              console.warn(`⚠️ Duplicate recipe detected: "${recipe.name}" - will regenerate (allowRepeats=OFF requires uniqueness)`);
              return null;
            }
          }

          // VALIDATION: Check recipe against user preferences
          // Special request can override preferences, and fridge-assigned recipes override both
          const hasSpecialReq = !!additionalInstructions;
          const isFridgeAssigned = !!assignedFridgeIngredient;
          const validation = validateRecipeAgainstPreferences(recipe, preferences, hasSpecialReq, isFridgeAssigned);

          // Always attach violations for display (even if validation passes)
          recipe.violations = validation.violations;

          if (!validation.isValid) {
            console.warn(`⚠️ Recipe validation failed for "${recipe.name}":`, validation.violations.join('; '));
            // Return null to skip this recipe and regenerate
            return null;
          }

          // Log ingredient count for debugging - calculate scalable target based on total recipes
          const ingredientCount = recipe.ingredients.length;
          const recipeCount = uniqueRecipesToGenerate;
          let targetMax: number;
          if (recipeCount <= 5) {
            targetMax = 7; // Small plans: max 7 ingredients
          } else if (recipeCount <= 14) {
            targetMax = 8; // Medium plans: max 8 ingredients
          } else {
            targetMax = 9; // Large plans: max 9 ingredients
          }
          console.log(`📦 Recipe "${recipe.name}" has ${ingredientCount} ingredients${optimizeGrocery ? ` (grocery opt ON - target: ≤${targetMax})` : ' (grocery opt OFF - typical: 8-12)'}`);

          // Warn if grocery optimization is on but ingredient count exceeds scalable target
          if (optimizeGrocery && ingredientCount > targetMax) {
            console.warn(`⚠️ Recipe "${recipe.name}" has ${ingredientCount} ingredients - exceeds grocery optimization target (≤${targetMax})`);
          }

          // Track proteins used in this recipe
          const recipeProteins = extractProteinsFromRecipe(recipe);
          recipeProteins.forEach(p => usedProteins.add(p));

          // Track recipe name to prevent duplicates
          usedRecipeNames.push(recipe.name);

          // NEW: Track format and technique for distinctness
          if (optimizeGrocery) {
            const recipeFamily = classifyRecipeFamily(recipe);
            if (!usedFormats.includes(recipeFamily.format)) {
              usedFormats.push(recipeFamily.format);
            }
            if (!usedTechniques.includes(recipeFamily.technique)) {
              usedTechniques.push(recipeFamily.technique);
            }
          }

          return recipe;
        })
        .catch(error => {
          console.error(`Failed to generate recipe ${i + 1}:`, error);
          return null; // Return null for failed recipes
        });

      batchPromises.push(recipePromise);
    }

    // Wait for this batch to complete before moving to the next
    const batchResults = await Promise.all(batchPromises);
    const batchRecipes = batchResults.filter((r): r is GeneratedRecipeResponse => r !== null);
    const failedIndices: number[] = [];

    // Track which recipes failed (returned null)
    batchResults.forEach((result, idx) => {
      if (result === null) {
        failedIndices.push(batchStart + idx);
      }
    });

    recipes.push(...batchRecipes);

    // Retry failed recipes (up to 2 attempts per failed recipe)
    if (failedIndices.length > 0) {
      console.log(`⚠️ ${failedIndices.length} recipes failed validation, retrying...`);

      for (const failedIdx of failedIndices) {
        let retryCount = 0;
        let retryRecipe: GeneratedRecipeResponse | null = null;

        while (retryCount < 2 && retryRecipe === null) {
          retryCount++;
          const mealType = mealTypes[failedIdx % mealTypes.length];
          let proteinsToExclude = Array.from(usedProteins);

          if (allowRepeats || optimizeGrocery) {
            proteinsToExclude = Array.from(usedProteins);
          }

          const retryPrompt = buildSingleRecipePrompt(
            mealType,
            preferences,
            additionalInstructions,
            usedRecipeNames, // Pass already generated recipe names to exclude
            optimizeGrocery ? sharedIngredients : [],
            failedIdx,
            uniqueRecipesToGenerate,
            optimizeGrocery,
            allowRepeats,
            proteinsToExclude,
            usedFormats,
            usedTechniques,
            fridgeIngredientQueue.length > 0 ? fridgeIngredientQueue[failedIdx] : undefined, // Pass assigned fridge ingredient
            repeatableMealCount, // Pass actual meal count
            customCookingInstructions // User's free-text custom instructions
          );

          try {
            const generatedRecipe = await callOpenAIForRecipeWithValidation(retryPrompt, mealType);
            generatedRecipe.mealType = mealType;

            // Check for duplicate recipe names during initial unique generation
            // STRICT MODE: Only enforce when allowRepeats = OFF
            if (!allowRepeats && usedRecipeNames.length > 0) {
              const lowerCaseName = generatedRecipe.name.toLowerCase();
              const isDuplicate = usedRecipeNames.some(existingName => {
                const existingLower = existingName.toLowerCase();
                return existingLower === lowerCaseName ||
                  existingLower.includes(lowerCaseName) ||
                  lowerCaseName.includes(existingLower);
              });
              if (isDuplicate) {
                console.warn(`⚠️ Retry ${retryCount}: Duplicate recipe detected: "${generatedRecipe.name}"`);
                continue; // Try again
              }
            }

            // Validate against preferences
            const hasSpecialReq = !!additionalInstructions;
            const assignedFridgeIng = fridgeIngredientQueue.length > 0 ? fridgeIngredientQueue[failedIdx] : undefined;
            const validation = validateRecipeAgainstPreferences(
              generatedRecipe,
              preferences,
              hasSpecialReq,
              !!(assignedFridgeIng && assignedFridgeIng.length > 0)
            );

            // Always attach violations for display
            generatedRecipe.violations = validation.violations;

            if (validation.isValid) {
              console.log(`✓ Retry ${retryCount} successful for recipe ${failedIdx + 1}: ${generatedRecipe.name}`);

              // Track proteins
              const recipeProteins = extractProteinsFromRecipe(generatedRecipe);
              recipeProteins.forEach(p => usedProteins.add(p));

              // Track recipe name to prevent duplicates
              usedRecipeNames.push(generatedRecipe.name);

              // Track formats/techniques if grocery optimization
              if (optimizeGrocery) {
                const recipeFamily = classifyRecipeFamily(generatedRecipe);
                if (!usedFormats.includes(recipeFamily.format)) {
                  usedFormats.push(recipeFamily.format);
                }
                if (!usedTechniques.includes(recipeFamily.technique)) {
                  usedTechniques.push(recipeFamily.technique);
                }
              }

              retryRecipe = generatedRecipe;
              recipes.push(retryRecipe);
            } else {
              console.warn(`⚠️ Retry ${retryCount} failed for recipe ${failedIdx + 1}:`, validation.violations.join('; '));
            }
          } catch (error) {
            console.error(`⚠️ Retry ${retryCount} error for recipe ${failedIdx + 1}:`, error);
          }
        }

        if (retryRecipe === null) {
          console.warn(`❌ Failed to generate recipe ${failedIdx + 1} after 2 retries`);
        }
      }
    }

    console.log(`Batch complete: Generated ${batchRecipes.length} recipes (${failedIndices.length} failed), proteins: ${usedProteins.size}, formats: [${usedFormats.join(', ')}], techniques: [${usedTechniques.join(', ')}]`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // DEDUPLICATION STEP (when allowRepeats = ON)
  // ═══════════════════════════════════════════════════════════════════════════════
  // If the AI generated uncontrolled duplicates (3+ of same recipe), deduplicate
  // by removing all but the first occurrence, then let the repeat-filling code
  // add controlled repeats back.
  if (allowRepeats) {
    const recipeOccurrences: Record<string, number> = {};
    const deduplicatedRecipes: GeneratedRecipeResponse[] = [];

    recipes.forEach(r => {
      const recipeName = r.name.toLowerCase();
      if (!recipeOccurrences[recipeName]) {
        recipeOccurrences[recipeName] = 0;
        deduplicatedRecipes.push(r); // Keep first occurrence
      }
      recipeOccurrences[recipeName]++;
    });

    // Log if deduplication happened
    if (deduplicatedRecipes.length < recipes.length) {
      console.warn(`⚠️ Deduplication: AI generated ${recipes.length} recipes but ${deduplicatedRecipes.length} were unique`);
      recipes.length = 0;
      recipes.push(...deduplicatedRecipes);
    }
  }

  // If repeats are allowed, fill remaining slots by repeating lunch/dinner recipes
  // RULE: Each unique recipe can appear at most 2 times total (original + 1 repeat)
  // LEFTOVERS LOGIC: Dinner repeats as LUNCH the next day (inserted right after the dinner)
  // maxAllowedRepeats = number of UNIQUE recipes that can be repeated
  if (allowRepeats && maxAllowedRepeats > 0 && recipes.length < totalToGenerate) {
    const slotsToFill = totalToGenerate - recipes.length;
    console.log(`Filling ${slotsToFill} slots with repeated recipes`);
    console.log(`Rule: Up to ${maxAllowedRepeats} unique recipes can be repeated (max 2 appearances each)`);
    console.log(`Leftovers logic: Dinner → next day Lunch`);

    // Track how many times each recipe has been used (original counts as 1)
    const recipeUsageCount: Record<string, number> = {};
    recipes.forEach(r => {
      recipeUsageCount[r.name] = (recipeUsageCount[r.name] || 0) + 1;
    });

    // Find dinner recipes that can be repeated (currently at 1 use)
    // We'll insert their lunch repeats right after them in the array
    const dinnerRecipesToRepeat: { recipe: GeneratedRecipeResponse; originalIndex: number }[] = [];
    const seenNames = new Set<string>();

    recipes.forEach((r, idx) => {
      if (r.mealType === 'dinner' && (recipeUsageCount[r.name] || 0) === 1 && !seenNames.has(r.name)) {
        seenNames.add(r.name);
        dinnerRecipesToRepeat.push({ recipe: r, originalIndex: idx });
      }
    });

    // If we don't have enough dinner recipes, also consider lunch recipes
    const lunchRecipesToRepeat: { recipe: GeneratedRecipeResponse; originalIndex: number }[] = [];
    if (dinnerRecipesToRepeat.length < maxAllowedRepeats) {
      recipes.forEach((r, idx) => {
        if (r.mealType === 'lunch' && (recipeUsageCount[r.name] || 0) === 1 && !seenNames.has(r.name)) {
          seenNames.add(r.name);
          lunchRecipesToRepeat.push({ recipe: r, originalIndex: idx });
        }
      });
    }

    console.log(`Available dinners for repeating: ${dinnerRecipesToRepeat.length}`);
    console.log(`Available lunches for repeating: ${lunchRecipesToRepeat.length}`);

    // Build a new array with repeats inserted in the correct positions
    // Strategy: Insert dinner repeats (as lunch) right after each dinner
    const newRecipes: GeneratedRecipeResponse[] = [];
    let repeatsAdded = 0;
    let dinnerRepeatIndex = 0;

    for (let i = 0; i < recipes.length; i++) {
      const recipe = recipes[i];
      newRecipes.push(recipe);

      // After adding a dinner, check if we should insert its repeat as next-day lunch
      if (recipe.mealType === 'dinner' &&
          repeatsAdded < slotsToFill &&
          repeatsAdded < maxAllowedRepeats &&
          dinnerRepeatIndex < dinnerRecipesToRepeat.length) {

        const dinnerToRepeat = dinnerRecipesToRepeat[dinnerRepeatIndex];
        if (dinnerToRepeat.recipe.name === recipe.name && (recipeUsageCount[recipe.name] || 0) === 1) {
          // Insert the repeat as LUNCH (will be assigned to next day due to array position)
          const repeatedRecipe: GeneratedRecipeResponse = {
            ...recipe,
            mealType: 'lunch', // Dinner becomes next-day lunch (leftovers)
          };

          newRecipes.push(repeatedRecipe);
          recipeUsageCount[recipe.name] = 2;
          repeatsAdded++;
          dinnerRepeatIndex++;

          console.log(`✓ Repeated: "${recipe.name}" (Dinner → next day Lunch) - inserted at position ${newRecipes.length - 1}`);
        }
      }
    }

    // If we still need more repeats and have lunch recipes available, add them at the end
    let lunchRepeatIndex = 0;
    while (repeatsAdded < slotsToFill &&
           repeatsAdded < maxAllowedRepeats &&
           lunchRepeatIndex < lunchRecipesToRepeat.length) {

      const lunchToRepeat = lunchRecipesToRepeat[lunchRepeatIndex];
      if ((recipeUsageCount[lunchToRepeat.recipe.name] || 0) === 1) {
        const repeatedRecipe: GeneratedRecipeResponse = {
          ...lunchToRepeat.recipe,
        };

        newRecipes.push(repeatedRecipe);
        recipeUsageCount[lunchToRepeat.recipe.name] = 2;
        repeatsAdded++;

        console.log(`✓ Repeated: "${lunchToRepeat.recipe.name}" (Lunch) - appended at end`);
      }
      lunchRepeatIndex++;
    }

    // Replace recipes array with the new one that has repeats in correct positions
    recipes.length = 0;
    recipes.push(...newRecipes);

    console.log(`Repeat summary: ${repeatsAdded} unique recipes repeated`);
    console.log(`Final recipe order: ${recipes.map((r, i) => `${i + 1}:${r.name}(${r.mealType})`).join(', ')}`);

    if (repeatsAdded < slotsToFill) {
      console.log(`Note: Could only fill ${repeatsAdded}/${slotsToFill} slots (limited by maxAllowedRepeats=${maxAllowedRepeats} or available recipes)`);
    }
  }

  console.log('=== MEAL PLAN GENERATION COMPLETE ===');
  console.log(`Generated ${recipes.length} recipes (${uniqueRecipesToGenerate} unique)`);

  // Log ingredient statistics for debugging
  const totalIngredients = recipes.reduce((sum, r) => sum + r.ingredients.length, 0);
  const avgIngredients = totalIngredients / recipes.length;
  const uniqueIngredientNames = new Set(
    recipes.flatMap(r => r.ingredients.map(ing => ing.name.toLowerCase().trim()))
  );
  console.log(`📊 Ingredient stats: Total=${totalIngredients}, Avg per recipe=${avgIngredients.toFixed(1)}, Unique ingredients across all recipes=${uniqueIngredientNames.size}`);
  if (optimizeGrocery) {
    console.log(`🛒 Grocery optimization ${uniqueIngredientNames.size <= recipes.length * 6 ? '✓ EFFECTIVE' : '⚠️ NEEDS IMPROVEMENT'}: Target unique ingredients ~${recipes.length * 5}-${recipes.length * 6}, Actual=${uniqueIngredientNames.size}`);
  }

  // Validate protein diversity if grocery optimization is enabled
  if (optimizeGrocery) {
    const proteinValidation = validateProteinDiversity(recipes, mealTypes, optimizeGrocery);
    if (!proteinValidation.isValid) {
      console.warn(`⚠️ Protein diversity requirement not fully met. Required: ${calculateRequiredProteinDiversity(proteinValidation.lunchDinnerCount)}, Found: ${proteinValidation.uniqueProteins.size}`);
      console.warn(`Proteins found: ${Array.from(proteinValidation.uniqueProteins).join(', ')}`);
    } else {
      console.log(`✓ Protein diversity validated: ${proteinValidation.uniqueProteins.size} proteins across ${proteinValidation.lunchDinnerCount} lunch/dinner meals`);
    }
  }

  // Validate recipe distinctness when repeats are disabled and grocery optimization is enabled
  if (!allowRepeats && optimizeGrocery) {
    const distinctnessValidation = validateRecipeDistinctness(recipes, allowRepeats, optimizeGrocery);
    if (!distinctnessValidation.isValid) {
      console.warn(`⚠️ Some recipes may be too similar in structure or flavor. ${distinctnessValidation.duplicateFamilies.length} potential duplicates detected.`);
      distinctnessValidation.duplicateFamilies.forEach(issue => console.warn(`  - ${issue}`));
    }
  }

  // Increment rate limit counters - recipes generated = API calls made
  await incrementRateLimit(totalToGenerate);

  return recipes;
}

/**
 * Check if OpenAI is configured (sync version for UI)
 * Now checks if Supabase is configured since OpenAI calls go through Edge Functions
 */
export function isOpenAIConfigured(): boolean {
  // OpenAI calls go through Supabase Edge Functions. Use the resolved config
  // (env OR built-in publishable fallback) so this never reports "off" just
  // because a build profile was missing the EXPO_PUBLIC_* env.
  return isSupabaseConfigured();
}

// Generate a single replacement recipe for a meal plan
export async function regenerateSingleRecipe(
  params: GenerateRecipeParams,
  excludeRecipeNames: string[] = []
): Promise<GeneratedRecipeResponse> {
  const mealType = params.mealTypes[0] ?? 'dinner';
  const MAX_PREFERENCE_RETRIES = 3;

  // Build shared ingredients list for grocery optimization (same logic as generateMealPlan)
  const sharedIngredients: string[] = [];
  if (params.optimizeGrocery) {
    const restrictionLower = params.preferences.dietaryRestrictions.map(r => r.toLowerCase());
    const isVegan = restrictionLower.some(r => r.includes('vegan'));
    const isVegetarian = restrictionLower.some(r => r.includes('vegetarian'));
    const isDairyFree = restrictionLower.some(r => r.includes('dairy-free'));
    const isGlutenFree = restrictionLower.some(r => r.includes('gluten-free'));

    const veganUnsafe = ['chicken breast', 'eggs', 'milk', 'butter', 'honey'];
    const vegetarianUnsafe = ['chicken breast'];
    const dairyUnsafe = ['milk', 'butter'];
    const glutenUnsafe = ['pasta'];

    const filteredStaples = HOUSEHOLD_STAPLES.filter(staple => {
      const stapleLower = staple.toLowerCase();
      if (isVegan && veganUnsafe.some(u => stapleLower.includes(u))) return false;
      if (isVegetarian && vegetarianUnsafe.some(u => stapleLower.includes(u))) return false;
      if (isDairyFree && dairyUnsafe.some(u => stapleLower.includes(u))) return false;
      if (isGlutenFree && glutenUnsafe.some(u => stapleLower.includes(u))) return false;
      return true;
    });

    sharedIngredients.push(...filteredStaples);
    console.log(`[regenerateSingleRecipe] Grocery optimization enabled with ${sharedIngredients.length} staples`);
  }

  for (let attempt = 1; attempt <= MAX_PREFERENCE_RETRIES; attempt++) {
    const prompt = buildSingleRecipePrompt(
      mealType,
      params.preferences,
      params.additionalInstructions,
      excludeRecipeNames,
      sharedIngredients, // Pass shared ingredients for grocery optimization
      params.recipeIndex ?? 0, // recipeIndex (from orchestrator for protein diversity)
      params.recipesToGenerate ?? 1, // totalRecipes - important for scaling ingredient limits
      params.optimizeGrocery, // Pass the optimization flag!
      params.allowRepeats,
      params.excludeProteins ?? [], // excludeProteins
      params.previousFormats ?? [], // previousFormats
      params.previousTechniques ?? [], // previousTechniques
      params.assignedFridgeIngredient, // Pass assigned fridge ingredient
      params.mealCount, // mealCount for protein diversity rules
      params.customCookingInstructions, // User's free-text custom instructions
      params.breakfastStyle // Breakfast no-cook (weekday) vs cooked (weekend)
    );

    console.log(`Regenerating single recipe (attempt ${attempt}/${MAX_PREFERENCE_RETRIES}, optimizeGrocery=${params.optimizeGrocery})...`);
    const recipe = await callOpenAIForRecipeWithValidation(prompt, mealType);
    recipe.mealType = mealType;

    // Log ingredient count for debugging
    console.log(`📦 Generated "${recipe.name}" with ${recipe.ingredients.length} ingredients${params.optimizeGrocery ? ' (grocery opt ON)' : ' (grocery opt OFF)'}`);

    // Validate: special request can override preferences but never allergies
    const hasSpecialRequest = !!params.additionalInstructions;
    const validation = validateRecipeAgainstPreferences(
      recipe,
      params.preferences,
      hasSpecialRequest,
      !!params.assignedFridgeIngredient // Allow allergen overrides for fridge-assigned ingredients
    );

    // Always attach violations for display
    recipe.violations = validation.violations;

    if (validation.isValid) {
      console.log('Regenerated recipe:', recipe.name);
      return recipe;
    }

    console.warn(`⚠️ Regenerated recipe "${recipe.name}" failed preference validation (attempt ${attempt}):`, validation.violations.join('; '));
    // Add the failed recipe name to exclusion list to avoid getting the same one
    excludeRecipeNames = [...excludeRecipeNames, recipe.name];

    if (attempt === MAX_PREFERENCE_RETRIES) {
      console.warn(`⚠️ Failed to regenerate compliant recipe after ${MAX_PREFERENCE_RETRIES} attempts. Returning last attempt with violations.`);
      return recipe;
    }
  }

  // Fallback - should not reach here
  throw new Error('Failed to regenerate recipe');
}

// Pexels API response types
interface PexelsImage {
  id: number;
  url: string;
  alt: string;
  src: {
    original: string;
    large: string;
    large2x: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
  photographer: string;
  photographer_url: string;
}

interface PexelsResponse {
  total_results: number;
  page: number;
  per_page: number;
  photos: PexelsImage[];
}

// Default fallback image if Pixabay fails
const DEFAULT_FOOD_IMAGE = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800';

// Extract keywords from recipe description and name
function extractRecipeKeywords(recipeName: string, recipeDescription: string): string[] {
  const commonWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
    'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
    'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
    'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
    'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'same', 'so', 'than', 'too', 'very',
    'as', 'if', 'just', 'by', 'from', 'about', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every'
  ]);

  // Common cooking verbs to filter out
  const cookingVerbs = new Set([
    'cook', 'bake', 'fry', 'boil', 'steam', 'grill', 'roast', 'blend', 'mix', 'combine',
    'add', 'remove', 'heat', 'serve', 'prepare', 'make', 'season', 'stir', 'mash', 'chop',
    'slice', 'dice', 'whisk', 'fold', 'simmer', 'sauté', 'sear', 'toast'
  ]);

  const text = `${recipeName} ${recipeDescription}`.toLowerCase();

  // Extract words (alphanumeric sequences)
  const words = text.match(/\b\w+\b/g) ?? [];

  // Filter and deduplicate
  const keywords = Array.from(new Set(
    words.filter(word =>
      word.length > 2 &&
      !commonWords.has(word) &&
      !cookingVerbs.has(word)
    )
  ));

  return keywords.slice(0, 8); // Return top 8 keywords
}

/**
 * Scores a Pixabay image hit for relevance to the recipe.
 * Uses tags from Pixabay to verify the image actually matches.
 * Returns a score 0-100; higher is better. Returns -1 if the image should be excluded.
 *
 * Scoring tiers:
 *  - Dish type match (taco, soup, salad, etc.) = HIGH weight (25 pts each)
 *  - Protein/main ingredient match (shrimp, chicken, etc.) = HIGH weight (20 pts each)
 *  - Other recipe name words = MEDIUM weight (8 pts each)
 *  - Ingredient words = LOW weight (3 pts each)
 *  - Penalty if image tags contain a DIFFERENT dish type than the recipe
 */

// Dish type terms — these define what the dish IS
const DISH_TYPE_TERMS = new Set([
  'taco', 'tacos', 'burrito', 'burritos', 'enchilada', 'enchiladas', 'quesadilla',
  'soup', 'stew', 'chowder', 'bisque', 'broth',
  'salad', 'slaw', 'coleslaw',
  'pasta', 'spaghetti', 'fettuccine', 'linguine', 'penne', 'noodle', 'noodles', 'ramen',
  'pizza', 'flatbread',
  'sandwich', 'burger', 'hamburger', 'wrap', 'sub',
  'curry', 'tikka', 'masala',
  'rice', 'risotto', 'paella', 'pilaf', 'biryani',
  'cake', 'pie', 'tart', 'cheesecake', 'brownie', 'brownies', 'cookie', 'cookies',
  'bread', 'toast', 'croissant', 'muffin', 'biscuit',
  'pancake', 'pancakes', 'waffle', 'waffles', 'crepe', 'crepes',
  'omelette', 'omelet', 'frittata', 'quiche',
  'casserole', 'gratin', 'lasagna',
  'wings', 'drumstick', 'drumsticks',
  'stir-fry', 'stirfry', 'fried rice',
  'dumpling', 'dumplings', 'potsticker', 'potstickers',
  'ceviche', 'sushi', 'sashimi', 'tempura',
  'chili', 'gumbo', 'jambalaya',
  'smoothie', 'shake', 'latte', 'cappuccino',
  'fries', 'chips', 'nuggets',
]);

// Protein / main ingredient terms - KEY ingredients that should be shown in images
const PROTEIN_TERMS = new Set([
  // Poultry
  'chicken', 'turkey', 'duck', 'goose', 'quail', 'pheasant',
  // Red meat
  'beef', 'pork', 'lamb', 'veal', 'mutton', 'venison', 'bison', 'goat',
  'steak', 'ribeye', 'sirloin', 'tenderloin', 'filet', 'mignon',
  // Processed meat
  'ham', 'bacon', 'sausage', 'prosciutto', 'salami', 'pepperoni',
  // Seafood - Common fish
  'fish', 'salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'trout', 'bass', 'snapper',
  'mahi', 'swordfish', 'sardine', 'sardines', 'anchovy', 'anchovies', 'mackerel',
  'herring', 'flounder', 'sole', 'perch', 'catfish', 'grouper', 'haddock',
  // Seafood - Specialty fish (including barramundi!)
  'barramundi', 'baramundi', 'branzino', 'seabass', 'dorado', 'bream', 'pollock', 'walleye',
  'monkfish', 'turbot', 'kingfish', 'pompano', 'wahoo', 'opah', 'escolar', 'arctic char',
  // Shellfish
  'shrimp', 'prawn', 'prawns', 'lobster', 'crab', 'crawfish', 'crayfish',
  'clam', 'clams', 'oyster', 'oysters', 'mussel', 'mussels', 'scallop', 'scallops',
  'squid', 'calamari', 'octopus', 'cuttlefish',
  // Vegetarian proteins
  'tofu', 'tempeh', 'seitan', 'paneer',
  // Eggs
  'egg', 'eggs',
]);

// Protein category mapping - maps specific proteins to their broader visual category
// Used for fallback image searches (e.g., "barramundi" → "fish" if exact search fails)
const PROTEIN_CATEGORY_MAP: Record<string, string> = {
  // Specialty fish → "fish"
  'barramundi': 'fish',
  'baramundi': 'fish',  // Common misspelling
  'branzino': 'fish',
  'seabass': 'fish',
  'dorado': 'fish',
  'bream': 'fish',
  'pollock': 'fish',
  'walleye': 'fish',
  'monkfish': 'fish',
  'turbot': 'fish',
  'kingfish': 'fish',
  'pompano': 'fish',
  'wahoo': 'fish',
  'opah': 'fish',
  'escolar': 'fish',
  'arctic char': 'fish',
  'grouper': 'fish',
  'haddock': 'fish',
  'perch': 'fish',
  'catfish': 'fish',
  'flounder': 'fish',
  'sole': 'fish',
  'snapper': 'fish',
  'mahi': 'fish',
  'swordfish': 'fish',
  'halibut': 'fish',
  'trout': 'fish',
  'cod': 'fish',
  'tilapia': 'fish',
  'mackerel': 'fish',
  'herring': 'fish',
  'sardine': 'fish',
  'sardines': 'fish',
  'anchovy': 'fish',
  'anchovies': 'fish',
  // Poultry variants → "chicken" or "poultry"
  'quail': 'poultry',
  'pheasant': 'poultry',
  'goose': 'poultry',
  'duck': 'duck', // duck is common enough to keep
  'turkey': 'turkey', // turkey is common enough to keep
  // Red meat variants → broader categories
  'ribeye': 'steak',
  'sirloin': 'steak',
  'tenderloin': 'steak',
  'filet': 'steak',
  'mignon': 'steak',
  'venison': 'beef',
  'bison': 'beef',
  'veal': 'beef',
  'mutton': 'lamb',
  'goat': 'lamb',
  // Shellfish variants → broader categories
  'prawn': 'shrimp',
  'prawns': 'shrimp',
  'crawfish': 'shrimp',
  'crayfish': 'shrimp',
  'cuttlefish': 'squid',
  'calamari': 'squid',
};

// Tags that indicate cooked/plated food (preferred for recipe images)
const COOKED_PLATED_TAGS = new Set([
  'cooked', 'plated', 'served', 'prepared', 'dish', 'meal', 'dinner', 'lunch',
  'grilled', 'roasted', 'baked', 'fried', 'sauteed', 'steamed', 'braised',
  'plate', 'cuisine', 'gourmet', 'restaurant', 'delicious', 'tasty', 'homemade',
  'garnished', 'seasoned', 'glazed', 'crispy', 'golden', 'finished',
]);

// Tags that indicate raw/uncooked food (less preferred for recipe images)
const RAW_UNCOOKED_TAGS = new Set([
  'raw', 'uncooked', 'fresh', 'ingredient', 'ingredients', 'market', 'grocery',
  'produce', 'farm', 'harvest', 'organic', 'whole', 'fillet', 'filet',
  'cutting board', 'preparation', 'prep', 'butcher',
]);

// Breakfast/dessert tags - should be EXCLUDED when searching for savory protein dishes
const BREAKFAST_DESSERT_TAGS = new Set([
  'pancake', 'pancakes', 'waffle', 'waffles', 'crepe', 'crepes', 'french toast',
  'cereal', 'oatmeal', 'porridge', 'granola', 'muesli',
  'cake', 'cupcake', 'brownie', 'cookie', 'cookies', 'pastry', 'pastries',
  'donut', 'doughnut', 'muffin', 'muffins', 'croissant', 'danish',
  'pie', 'tart', 'cheesecake', 'ice cream', 'gelato', 'sorbet',
  'chocolate', 'candy', 'sweet', 'dessert', 'pudding', 'custard',
  'syrup', 'maple', 'honey drizzle', 'whipped cream', 'frosting',
]);

// Savory protein categories that should NEVER show breakfast/dessert images
const SAVORY_PROTEIN_CATEGORIES = new Set([
  // All fish
  'fish', 'salmon', 'tuna', 'cod', 'tilapia', 'halibut', 'trout', 'bass', 'snapper',
  'barramundi', 'baramundi', 'branzino', 'seabass', 'grouper', 'haddock', 'mackerel',
  // Shellfish
  'shrimp', 'prawn', 'prawns', 'lobster', 'crab', 'scallop', 'scallops', 'clam', 'clams',
  'oyster', 'oysters', 'mussel', 'mussels', 'squid', 'calamari', 'octopus',
  // Poultry
  'chicken', 'turkey', 'duck',
  // Red meat
  'beef', 'pork', 'lamb', 'steak', 'veal',
  // Vegetarian proteins
  'tofu', 'tempeh', 'seitan',
]);

// Cooking forms - describe HOW the dish is prepared (visual appearance)
const COOKING_FORM_TERMS = new Set([
  // Oven methods
  'bake', 'baked', 'roast', 'roasted', 'broil', 'broiled',
  // Pan methods
  'fry', 'fried', 'sauteed', 'saute', 'seared', 'pan-fried', 'panfried',
  // Wet cooking
  'boil', 'boiled', 'poach', 'poached', 'simmer', 'simmered', 'steam', 'steamed', 'braise', 'braised',
  // Grill/BBQ
  'grill', 'grilled', 'bbq', 'barbecue', 'barbecued', 'charred', 'smoked',
  // Other
  'raw', 'tartare', 'ceviche', 'carpaccio', 'cured',
  'crispy', 'crusted', 'glazed', 'stuffed', 'wrapped',
]);

// Vegetable/side terms - should be DE-PRIORITIZED when a protein is present
// These are side ingredients that shouldn't be the main focus of the image
const VEGETABLE_SIDE_TERMS = new Set([
  // Leafy greens
  'collard', 'collards', 'kale', 'spinach', 'lettuce', 'arugula', 'chard', 'cabbage',
  'bok choy', 'watercress', 'endive', 'radicchio', 'mustard greens',
  // Root vegetables
  'potato', 'potatoes', 'carrot', 'carrots', 'beet', 'beets', 'turnip', 'radish',
  'parsnip', 'celery', 'celeriac', 'rutabaga', 'sweet potato',
  // Alliums
  'onion', 'onions', 'garlic', 'shallot', 'leek', 'leeks', 'scallion', 'chive',
  // Cruciferous
  'broccoli', 'cauliflower', 'brussels', 'sprouts',
  // Squash
  'zucchini', 'squash', 'pumpkin', 'butternut', 'acorn',
  // Peppers
  'pepper', 'peppers', 'bell pepper', 'jalapeno', 'chili',
  // Beans/legumes
  'bean', 'beans', 'pea', 'peas', 'lentil', 'chickpea', 'edamame',
  // Other vegetables
  'tomato', 'tomatoes', 'corn', 'asparagus', 'artichoke', 'mushroom', 'mushrooms',
  'eggplant', 'okra', 'cucumber', 'fennel',
]);

// Terms in Pexels alt text that signal an image contains embedded text, typography,
// watermarks, social-media graphics, or infographics. We want clean food photography,
// so any image whose alt text hints at overlays (e.g. "Share", "Recipe", a logo, etc.)
// is excluded.
const TEXT_OVERLAY_TAGS = new Set([
  'text', 'texts', 'typography', 'typographic', 'font', 'fonts', 'letter', 'letters',
  'letterpress', 'word', 'words', 'wording', 'caption', 'quote', 'quotes', 'title',
  'heading', 'headline', 'headlines', 'sentence',
  'sign', 'signs', 'signage', 'signboard', 'billboard', 'poster', 'posters', 'flyer',
  'flyers', 'banner', 'banners', 'brochure', 'pamphlet', 'leaflet', 'placard',
  'logo', 'logos', 'logotype', 'branding', 'brand', 'trademark', 'watermark',
  'label', 'labels', 'labeled', 'labelled', 'sticker', 'stickers', 'tag', 'tags',
  'infographic', 'infographics', 'chart', 'diagram', 'graphic', 'graphics',
  'advertisement', 'advert', 'advertising', 'ad', 'ads',
  'menu', 'menus', 'recipe card', 'recipebook', 'cookbook',
  'newspaper', 'magazine', 'article', 'page', 'pages', 'book', 'books', 'paper',
  'note', 'notes', 'notebook', 'notepad', 'blackboard', 'chalkboard', 'whiteboard',
  'screen', 'screenshot', 'website', 'webpage', 'instagram', 'facebook', 'twitter',
  'pinterest', 'social', 'post', 'share', 'shared', 'sharing', 'emoji', 'icon', 'icons',
  'button', 'buttons', 'app', 'interface', 'ui', 'ux',
  'message', 'subscribe', 'follow', 'click', 'download',
  'calligraphy', 'handwriting', 'handwritten', 'script', 'scripture',
]);

function scorePexelsImage(
  photo: PexelsImage,
  recipeWords: string[],
  ingredientWords: string[],
  excludeTerms: string[]
): number {
  const alt = photo.alt.toLowerCase();
  const altWords = alt.split(/\s+/).filter(w => w.length >= 3);

  // --- TEXT / WATERMARK / INFOGRAPHIC EXCLUSION ---
  // Reject any image whose alt text hints at embedded text, typography, logos,
  // watermarks, social-media overlays, or menu/recipe-card graphics. We want
  // clean food photography only.
  for (const word of altWords) {
    if (TEXT_OVERLAY_TAGS.has(word)) {
      console.log(`[Pexels] EXCLUDED: Text/overlay tag "${word}" found in alt "${alt.substring(0, 80)}"`);
      return -1;
    }
  }
  // Also catch multi-word phrases that a single-word check misses
  const textPhraseHints = ['recipe card', 'recipe book', 'menu card', 'sign board', 'chalk board'];
  for (const phrase of textPhraseHints) {
    if (alt.includes(phrase)) {
      console.log(`[Pexels] EXCLUDED: Text phrase "${phrase}" found in alt "${alt.substring(0, 80)}"`);
      return -1;
    }
  }

  // Check if this image should be EXCLUDED (e.g. "oyster mushroom" when looking for "oyster" the seafood)
  for (const exclude of excludeTerms) {
    if (altWords.some((w: string) => w.includes(exclude))) {
      return -1;
    }
  }

  // --- BREAKFAST/DESSERT EXCLUSION FOR SAVORY PROTEIN DISHES ---
  // If recipe contains a savory protein (fish, meat, etc.), EXCLUDE breakfast/dessert images
  const recipeHasSavoryProtein = recipeWords.some(w => SAVORY_PROTEIN_CATEGORIES.has(w));
  if (recipeHasSavoryProtein) {
    for (const word of altWords) {
      if (BREAKFAST_DESSERT_TAGS.has(word)) {
        console.log(`[Pexels] EXCLUDED: Breakfast/dessert tag "${word}" found for savory protein recipe`);
        return -1; // Completely exclude breakfast/dessert images for protein dishes
      }
    }
  }

  let score = 0;

  // Identify which dish types, cooking forms, and proteins the RECIPE expects
  const recipeDishTypes = recipeWords.filter(w => DISH_TYPE_TERMS.has(w));
  const recipeProteins = recipeWords.filter(w => PROTEIN_TERMS.has(w));
  const recipeCookingForms = recipeWords.filter(w => COOKING_FORM_TERMS.has(w));
  const recipeOtherWords = recipeWords.filter(w =>
    !DISH_TYPE_TERMS.has(w) &&
    !PROTEIN_TERMS.has(w) &&
    !COOKING_FORM_TERMS.has(w) &&
    w.length >= 3
  );

  // --- PROTEIN MATCHING (CRITICAL - highest priority) ---
  // The main protein/ingredient is the MOST important visual element
  let proteinMatched = false;
  for (const protein of recipeProteins) {
    if (altWords.some((word: string) => word.includes(protein))) {
      score += 35; // Very high score for matching the key protein
      proteinMatched = true;
    }
  }

  // If recipe has proteins but image shows NONE of them, heavy penalty
  if (recipeProteins.length > 0 && !proteinMatched) {
    score -= 30; // Heavy penalty - wrong protein is a bad match
  }

  // Check if image shows a DIFFERENT protein than expected — severe penalty
  if (recipeProteins.length > 0) {
    for (const word of altWords) {
      if (PROTEIN_TERMS.has(word) && !recipeProteins.includes(word)) {
        // Image shows a different protein (e.g. "chicken" when recipe is "barramundi")
        score -= 25;
        break;
      }
    }
  }

  // --- COOKING FORM matching (HIGH priority) ---
  // The form (bake, grill, fry) affects how the dish looks
  let cookingFormMatched = false;
  for (const form of recipeCookingForms) {
    if (altWords.some((word: string) => word.includes(form))) {
      score += 20;
      cookingFormMatched = true;
    }
  }

  // Bonus for form-related visual terms that match expected cooking method
  const formVisualTerms: Record<string, string[]> = {
    'bake': ['baked', 'oven', 'roast', 'casserole'],
    'baked': ['baked', 'oven', 'roast', 'casserole'],
    'roast': ['roasted', 'oven', 'baked'],
    'roasted': ['roasted', 'oven', 'baked'],
    'grill': ['grilled', 'bbq', 'charred', 'barbecue'],
    'grilled': ['grilled', 'bbq', 'charred', 'barbecue'],
    'fry': ['fried', 'crispy', 'pan'],
    'fried': ['fried', 'crispy', 'golden'],
    'steam': ['steamed', 'fresh'],
    'steamed': ['steamed', 'fresh'],
  };
  for (const form of recipeCookingForms) {
    const visualTerms = formVisualTerms[form] || [];
    for (const term of visualTerms) {
      if (altWords.some((word: string) => word.includes(term))) {
        score += 8;
        break;
      }
    }
  }

  // --- Dish type matching (HIGH priority) ---
  let dishTypeMatched = false;
  for (const dishType of recipeDishTypes) {
    if (altWords.some((word: string) => word.includes(dishType))) {
      score += 25;
      dishTypeMatched = true;
    }
  }

  // If recipe has dish types but NONE matched in alt text, penalty
  if (recipeDishTypes.length > 0 && !dishTypeMatched) {
    score -= 15;
  }

  // Check if image alt text contains a DIFFERENT dish type than the recipe — penalize
  if (recipeDishTypes.length > 0) {
    for (const word of altWords) {
      if (DISH_TYPE_TERMS.has(word) && !recipeDishTypes.includes(word)) {
        // Image shows a different dish type (e.g. "rice" when recipe is "tacos")
        score -= 10;
        break;
      }
    }
  }

  // --- Other recipe name words (MEDIUM priority) ---
  // These are secondary ingredients/descriptors
  for (const word of recipeOtherWords) {
    if (altWords.some((w: string) => w.includes(word))) {
      score += 5; // Lower score for non-protein ingredients
    }
  }

  // --- VEGETABLE PENALTY: When recipe has protein, penalize vegetable-focused images ---
  // This prevents matching "collard greens" when looking for "collard barramundi bake"
  if (recipeProteins.length > 0 && !proteinMatched) {
    // Check if image appears to be vegetable-focused (main subject is a vegetable)
    const recipeVegetables = recipeWords.filter(w => VEGETABLE_SIDE_TERMS.has(w));
    for (const veg of recipeVegetables) {
      // Check if the vegetable appears prominently in alt text (suggests it's the main subject)
      const vegInAlt = altWords.filter((w: string) => w.includes(veg));
      if (vegInAlt.length > 0) {
        // This is likely an image of the vegetable, not the protein dish
        // E.g., "collard greens" image when we want "barramundi with collards"
        score -= 20;
        console.log(`[Pexels] Vegetable penalty: "${veg}" appears in alt text without protein`);
      }
    }
  }

  // --- Ingredient words (LOW priority, avoid double-counting recipe words) ---
  const alreadyCounted = new Set([...recipeWords]);
  for (const word of ingredientWords) {
    if (word.length < 3 || alreadyCounted.has(word)) continue;
    alreadyCounted.add(word);
    if (altWords.some((w: string) => w.includes(word))) {
      score += 2; // Very low score for ingredients not in title
    }
  }

  // Bonus for general food indicators
  const foodIndicators = ['food', 'dish', 'meal', 'cuisine', 'recipe', 'plate', 'dinner', 'lunch', 'breakfast'];
  for (const indicator of foodIndicators) {
    if (altWords.some((w: string) => w.includes(indicator))) {
      score += 2;
      break;
    }
  }

  // --- COOKED/PLATED VS RAW SCORING (HIGH priority) ---
  // Prefer images of cooked, plated food over raw ingredients
  let cookedPlatedScore = 0;
  let rawScore = 0;

  for (const word of altWords) {
    if (COOKED_PLATED_TAGS.has(word)) {
      cookedPlatedScore++;
    }
    if (RAW_UNCOOKED_TAGS.has(word)) {
      rawScore++;
    }
  }

  // Bonus for cooked/plated images (recipe images should show finished dishes)
  if (cookedPlatedScore > 0) {
    score += Math.min(cookedPlatedScore * 8, 24); // Up to +24 for cooked/plated indicators
  }

  // Penalty for raw/uncooked images (less desirable for recipe display)
  if (rawScore > 0) {
    score -= Math.min(rawScore * 5, 15); // Up to -15 for raw/uncooked indicators
  }

  // Extra bonus if cooked indicators significantly outweigh raw indicators
  if (cookedPlatedScore > rawScore + 1) {
    score += 10; // Strong preference for clearly cooked images
  }

  return score;
}

/**
 * Builds a list of compound terms to exclude from results.
 * For example, "oyster" as a seafood should exclude "oyster mushroom".
 * "chicken" should exclude "chicken pox" etc.
 */
function buildExcludeTerms(recipeName: string): string[] {
  const name = recipeName.toLowerCase();
  const excludes: string[] = [];

  // Map of ingredient -> misleading compound terms in Pixabay
  const misleadingCompounds: Record<string, string[]> = {
    'oyster': ['oyster mushroom', 'oyster mushrooms'],
    'chicken': ['chicken pox'],
    'egg': ['eggplant'],
    'lime': ['limestone'],
    'date': ['date palm'],
    'kiwi': ['kiwi bird'],
    'sage': ['sagebrush'],
    'mint': ['mint condition'],
    'ginger': ['ginger cat', 'ginger hair'],
    'crab': ['crab apple', 'crabapple'],
    'clam': ['clamber'],
    'bass': ['bass guitar', 'bass music'],
    'turkey': ['turkey country'],
  };

  for (const [ingredient, compounds] of Object.entries(misleadingCompounds)) {
    if (name.includes(ingredient)) {
      excludes.push(...compounds);
    }
  }

  return excludes;
}

/**
 * Selects the best image from Pexels photos using alt text and recipe matching.
 * Picks the highest-scoring image, using Pexels result order as tiebreaker.
 */
function selectBestPexelsImage(
  photos: PexelsImage[],
  recipeName: string,
  recipeIngredients: Array<{ name: string; category?: string }>
): PexelsImage | null {
  if (!photos || photos.length === 0) return null;

  const recipeWords = recipeName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 3);

  const ingredientWords = recipeIngredients
    .map(i => i.name.toLowerCase().replace(/[^a-z0-9\s]/g, ''))
    .flatMap(n => n.split(/\s+/))
    .filter(w => w.length >= 3);

  const excludeTerms = buildExcludeTerms(recipeName);

  // Score all photos
  const scored = photos.map((photo, index) => ({
    photo,
    index,
    score: scorePexelsImage(photo, recipeWords, ingredientWords, excludeTerms),
  }));

  // Filter out excluded images (score === -1)
  const valid = scored.filter(s => s.score >= 0);

  if (valid.length === 0) {
    console.log(`[Pexels] All ${photos.length} results were filtered out by exclusion rules`);
    return null;
  }

  // Sort by score descending, then by original index (prefer earlier results as tiebreaker)
  valid.sort((a: any, b: any) => b.score - a.score || a.index - b.index);

  const selected = valid[0];

  console.log(`[Pexels] Selected image #${selected.index} (score: ${selected.score}, alt: "${selected.photo.alt.substring(0, 80)}...")`);

  // Log top 3 for debugging
  const top3 = valid.slice(0, 3);
  for (const s of top3) {
    console.log(`[Pexels]   #${s.index}: score=${s.score} alt="${s.photo.alt.substring(0, 50)}..."`);
  }

  return selected.photo;
}

async function fetchPexels(apiKey: string, query: string): Promise<PexelsResponse | null> {
  try {
    const response = await globalThis.fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=20&page=1`,
      {
        headers: {
          'Authorization': apiKey,
        },
      }
    );
    if (response.ok) {
      return await response.json() as PexelsResponse;
    }
  } catch (e) {
    console.log(`[Pexels] Fetch error for query "${query}":`, e);
  }
  return null;
}

export async function generateRecipeImage(
  recipeName: string,
  recipeDescription: string,
  recipeIngredients: Array<{ name: string; category?: string }> = []
): Promise<string> {
  const ingredientNames = extractPrimaryIngredientNames(recipeIngredients);

  // Step 1: Try Pexels first for the freshest, most relevant images.
  // Fall back to the known key when a build profile omits the env (otherwise
  // recipe photos silently degrade to the default image in such builds).
  const pexelsApiKey =
    process.env.EXPO_PUBLIC_PEXELS_API_KEY ||
    'e04AwB0tvSH3BVmyE9c7sZTNvQcbUHKKFQXX1j98dKhT0715wH785NF5';

  if (pexelsApiKey) {
    try {
      // Parse recipe name to identify KEY components
      const nameWords = recipeName
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length >= 3);

      // Identify the primary protein (key ingredient) from recipe name
      const primaryProtein = nameWords.find(w => PROTEIN_TERMS.has(w));
      // Identify secondary ingredients (vegetables, etc.)
      const secondaryIngredients = nameWords.filter(w =>
        VEGETABLE_SIDE_TERMS.has(w) && w !== primaryProtein
      );
      // Identify cooking form from recipe name
      const cookingForm = nameWords.find(w => COOKING_FORM_TERMS.has(w));
      // Identify dish type from recipe name
      const dishType = nameWords.find(w => DISH_TYPE_TERMS.has(w));

      let data: PexelsResponse | null = null;

      // ============================================
      // CASCADING SEARCH STRATEGY
      // ============================================

      // LEVEL 1: Multi-ingredient search (protein + secondary ingredient)
      // e.g., "barramundi asparagus" for "Barramundi with Asparagus"
      if (primaryProtein && secondaryIngredients.length > 0) {
        const multiIngredientQuery = `${primaryProtein} ${secondaryIngredients[0]} dish`;
        console.log(`[Pexels] Level 1 - Multi-ingredient search: ${multiIngredientQuery}`);
        data = await fetchPexels(pexelsApiKey, multiIngredientQuery);

        if (data && data.photos && data.photos.length > 0) {
          const best = selectBestPexelsImage(data.photos, recipeName, recipeIngredients);
          if (best) {
            console.log(`[Pexels] ✓ Found image for multi-ingredient: ${multiIngredientQuery}`);
            return best.src.large || best.src.original;
          }
        }
      }

      // LEVEL 2: Protein + cooking form/dish type
      // e.g., "barramundi baked" or "barramundi roasted"
      if (primaryProtein) {
        const proteinQuery = cookingForm
          ? `${primaryProtein} ${cookingForm}`
          : dishType
          ? `${primaryProtein} ${dishType}`
          : `${primaryProtein} cooked dish`;

        console.log(`[Pexels] Level 2 - Protein + form: ${proteinQuery}`);
        data = await fetchPexels(pexelsApiKey, proteinQuery);

        if (data && data.photos && data.photos.length > 0) {
          const best = selectBestPexelsImage(data.photos, recipeName, recipeIngredients);
          if (best) {
            console.log(`[Pexels] ✓ Found image for protein + form: ${proteinQuery}`);
            return best.src.large || best.src.original;
          }
        }

        // LEVEL 3: Just the protein with "food" or "recipe"
        console.log(`[Pexels] Level 3 - Protein only: ${primaryProtein}`);
        data = await fetchPexels(pexelsApiKey, `${primaryProtein} recipe`);

        if (data && data.photos && data.photos.length > 0) {
          const best = selectBestPexelsImage(data.photos, recipeName, recipeIngredients);
          if (best) {
            console.log(`[Pexels] ✓ Found image for protein: ${primaryProtein}`);
            return best.src.large || best.src.original;
          }
        }

        // LEVEL 4: Protein CATEGORY fallback
        // e.g., barramundi → "fish", branzino → "fish", ribeye → "steak"
        const proteinCategory = PROTEIN_CATEGORY_MAP[primaryProtein];
        if (proteinCategory && proteinCategory !== primaryProtein) {
          const categoryQuery = cookingForm
            ? `${proteinCategory} ${cookingForm}`
            : `${proteinCategory} cooked dish`;

          console.log(`[Pexels] Level 4 - Category fallback: ${primaryProtein} → ${proteinCategory} (query: ${categoryQuery})`);
          data = await fetchPexels(pexelsApiKey, categoryQuery);

          if (data && data.photos && data.photos.length > 0) {
            const best = selectBestPexelsImage(data.photos, recipeName, recipeIngredients);
            if (best) {
              console.log(`[Pexels] ✓ Found image for category "${proteinCategory}" (fallback from "${primaryProtein}")`);
              return best.src.large || best.src.original;
            }
          }

          // Try just the category
          console.log(`[Pexels] Level 4b - Category only: ${proteinCategory}`);
          data = await fetchPexels(pexelsApiKey, `${proteinCategory} recipe`);

          if (data && data.photos && data.photos.length > 0) {
            const best = selectBestPexelsImage(data.photos, recipeName, recipeIngredients);
            if (best) {
              console.log(`[Pexels] ✓ Found image for category: ${proteinCategory}`);
              return best.src.large || best.src.original;
            }
          }
        }
      }

      // LEVEL 5: Full recipe name keywords (fallback)
      const nameQuery = recipeName
        .toLowerCase()
        .replace(/\b(with|and|the|a|an|in|on|for|of|to)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      console.log(`[Pexels] Level 5 - Recipe name keywords: ${nameQuery}`);

      data = await fetchPexels(pexelsApiKey, nameQuery);

      if (data && data.photos && data.photos.length > 0) {
        const best = selectBestPexelsImage(data.photos, recipeName, recipeIngredients);
        if (best) {
          console.log(`[Pexels] ✓ Found image for recipe name: ${nameQuery}`);
          return best.src.large || best.src.original;
        }
      }

      // LEVEL 6: Description keywords
      console.log(`[Pexels] Level 6 - Description keywords`);

      const keywords = extractRecipeKeywords(recipeName, recipeDescription);
      const keywordQuery = keywords.slice(0, 3).join(' ');

      if (keywordQuery) {
        data = await fetchPexels(pexelsApiKey, keywordQuery);

        if (data && data.photos && data.photos.length > 0) {
          const best = selectBestPexelsImage(data.photos, recipeName, recipeIngredients);
          if (best) {
            console.log(`[Pexels] ✓ Found image for description keywords: ${keywordQuery}`);
            return best.src.large || best.src.original;
          }
        }
      }

      // LEVEL 7: Primary ingredient from ingredients list
      console.log(`[Pexels] Level 7 - Primary ingredient from list`);

      if (recipeIngredients.length > 0) {
        const primaryIngredient = recipeIngredients[0]?.name?.toLowerCase() || '';
        if (primaryIngredient && primaryIngredient.length > 2) {
          console.log(`[Pexels] Trying primary ingredient: ${primaryIngredient}`);

          data = await fetchPexels(pexelsApiKey, primaryIngredient + ' cooked');

          if (data && data.photos && data.photos.length > 0) {
            const best = selectBestPexelsImage(data.photos, recipeName, recipeIngredients);
            if (best) {
              console.log(`[Pexels] ✓ Found image for ingredient: ${primaryIngredient}`);
              return best.src.large || best.src.original;
            }
          }
        }
      }

      console.log(`[Pexels] ✗ All Pexels searches exhausted for "${recipeName}"`);
    } catch (error) {
      console.error('[Pexels] Error fetching image:', error);
    }
  } else {
    console.log('[Image] Pexels API key not configured, skipping Pexels');
  }

  // Step 2: Fall back to Supabase image library if Pexels found nothing
  console.log(`[Image] Trying Supabase image library for "${recipeName}"`);
  const supabaseMatch = findSupabaseImage(recipeName, ingredientNames);

  if (supabaseMatch) {
    console.log(`[Image] Using Supabase image for "${recipeName}" (matched: ${supabaseMatch.matchedEntry.displayTag}, score: ${supabaseMatch.score.toFixed(2)})`);
    return supabaseMatch.url;
  }

  // Step 3: Final fallback
  console.log(`[Image] No image found for "${recipeName}", using default fallback`);
  return DEFAULT_FOOD_IMAGE;
}