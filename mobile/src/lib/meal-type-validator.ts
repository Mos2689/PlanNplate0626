import type { GeneratedRecipeResponse, MealType } from './openai';

/**
 * Meal Type Classification System
 *
 * Uses 3 approaches:
 * 1. Rule-based classification (fast, deterministic)
 * 2. Content validation (check if recipe matches assigned type)
 * 3. Fallback classification (if validation fails, reclassify)
 */

interface MealTypeScore {
  breakfast: number;
  lunch: number;
  dinner: number;
  snack: number;
}

interface ClassificationResult {
  assignedType: MealType;
  detectedType: MealType;
  confidence: number;
  isValid: boolean;
  reason: string;
}

// Breakfast indicators
const BREAKFAST_INDICATORS = {
  ingredients: [
    'egg', 'eggs', 'bacon', 'sausage', 'ham', 'toast', 'bread', 'bagel',
    'oatmeal', 'cereal', 'granola', 'yogurt', 'milk', 'butter', 'jam',
    'honey', 'pancake', 'waffle', 'french toast', 'muffin', 'scone',
    'fruit', 'berries', 'blueberry', 'strawberry', 'banana', 'apple',
    'cheese', 'cream', 'coffee', 'tea', 'smoothie', 'orange juice',
    'breakfast', 'morning', 'brunch'
  ],
  calorieRange: { min: 200, max: 600 },
  prepTimeMax: 45,
};

// Snack indicators
const SNACK_INDICATORS = {
  ingredients: [
    'snack', 'appetizer', 'dip', 'finger food', 'bite', 'chip', 'cracker',
    'nut', 'nuts', 'popcorn', 'pretzel', 'trail mix', 'energy bar',
    'cheese ball', 'spring roll', 'hummus', 'guacamole', 'salsa',
    'bruschetta', 'canapé', 'skewer', 'slider', 'tart', 'tartlet',
    'meatball', 'wing', 'chicken wing', 'buffalo', 'deviled', 'stuffed',
    'quesadilla', 'taco', 'nachos', 'empanada', 'croquette', 'fritter'
  ],
  calorieRange: { min: 50, max: 300 },
  prepTimeMax: 30,
  servingSizeMax: 4, // Small portions or multiple servings
};

// Lunch indicators
const LUNCH_INDICATORS = {
  ingredients: [
    'salad', 'sandwich', 'wrap', 'burger', 'pita', 'sub', 'hoagie',
    'pasta', 'noodle', 'rice bowl', 'grain bowl', 'buddha bowl',
    'soup', 'stew', 'chili', 'curry', 'taco', 'quesadilla',
    'chicken', 'turkey', 'beef', 'fish', 'salmon', 'tuna',
    'lunch', 'midday', 'light meal', 'lunch bowl'
  ],
  calorieRange: { min: 400, max: 700 },
  prepTimeMax: 60,
};

// Dinner indicators
const DINNER_INDICATORS = {
  ingredients: [
    'dinner', 'main course', 'entrée', 'roast', 'baked', 'grilled',
    'steak', 'chicken', 'pork', 'beef', 'lamb', 'fish', 'seafood', 'shrimp',
    'sauce', 'gravy', 'sides', 'vegetables', 'potatoes', 'rice',
    'pasta', 'noodles', 'hearty', 'substantial', 'filling',
    'roasted', 'braised', 'simmered', 'slow-cooked'
  ],
  calorieRange: { min: 500, max: 1000 },
  prepTimeMax: 120,
};

/**
 * Score a recipe against meal type indicators
 */
function scoreRecipeForMealType(recipe: GeneratedRecipeResponse, indicators: any): number {
  let score = 0;
  const recipeText = `${recipe.name.toLowerCase()} ${recipe.description.toLowerCase()} ${recipe.ingredients.map(i => i.name.toLowerCase()).join(' ')}`;

  // Score ingredient matches
  const ingredientMatches = indicators.ingredients.filter((indicator: string) =>
    recipeText.includes(indicator.toLowerCase())
  ).length;
  score += ingredientMatches * 10;

  // Score calorie match
  if (recipe.calories && indicators.calorieRange) {
    const { min, max } = indicators.calorieRange;
    if (recipe.calories >= min && recipe.calories <= max) {
      score += 50;
    } else if (recipe.calories >= min - 100 && recipe.calories <= max + 100) {
      score += 25; // Partial match
    }
  }

  // Score prep time match
  const totalTime = recipe.prepTime + recipe.cookTime;
  if (indicators.prepTimeMax && totalTime <= indicators.prepTimeMax) {
    score += 30;
  } else if (totalTime <= indicators.prepTimeMax + 30) {
    score += 15; // Slightly over
  }

  // Score serving size match (for snacks)
  if (indicators.servingSizeMax && recipe.servings && recipe.servings <= indicators.servingSizeMax) {
    score += 20;
  }

  return score;
}

/**
 * Rule-based classification: Determine meal type from recipe content
 */
export function classifyRecipeByContent(recipe: GeneratedRecipeResponse): MealType {
  const scores: MealTypeScore = {
    breakfast: scoreRecipeForMealType(recipe, BREAKFAST_INDICATORS),
    lunch: scoreRecipeForMealType(recipe, LUNCH_INDICATORS),
    dinner: scoreRecipeForMealType(recipe, DINNER_INDICATORS),
    snack: scoreRecipeForMealType(recipe, SNACK_INDICATORS),
  };

  console.log(`[MealTypeClassifier] Classification scores for "${recipe.name}":`, scores);

  // Find meal type with highest score
  const classified = Object.entries(scores).reduce((best, current) => {
    return current[1] > best[1] ? current : best;
  });

  return classified[0] as MealType;
}

/**
 * Validate if recipe matches its assigned meal type
 */
export function validateMealType(
  recipe: GeneratedRecipeResponse,
  assignedType: MealType
): { isValid: boolean; confidence: number; reason: string } {
  const detectedType = classifyRecipeByContent(recipe);

  // Calculate confidence score
  const match = assignedType === detectedType;
  let confidence = 0;

  if (assignedType === 'breakfast') {
    confidence = scoreRecipeForMealType(recipe, BREAKFAST_INDICATORS);
  } else if (assignedType === 'lunch') {
    confidence = scoreRecipeForMealType(recipe, LUNCH_INDICATORS);
  } else if (assignedType === 'dinner') {
    confidence = scoreRecipeForMealType(recipe, DINNER_INDICATORS);
  } else if (assignedType === 'snack') {
    confidence = scoreRecipeForMealType(recipe, SNACK_INDICATORS);
  }

  // Normalize confidence to 0-100
  const normalizedConfidence = Math.min(100, confidence);

  let reason = '';
  if (match) {
    reason = `Recipe correctly classified as ${assignedType} (detected: ${detectedType})`;
  } else {
    reason = `Recipe may be better suited for ${detectedType} (assigned: ${assignedType})`;
  }

  // Consider valid if:
  // 1. Detected type matches assigned type, OR
  // 2. Confidence score is high enough (>60), OR
  // 3. It's ambiguous (lunch/dinner often overlap)
  const isValid =
    match ||
    normalizedConfidence > 60 ||
    (assignedType === 'lunch' && detectedType === 'dinner') ||
    (assignedType === 'dinner' && detectedType === 'lunch');

  return {
    isValid,
    confidence: normalizedConfidence,
    reason,
  };
}

/**
 * Get meal type-specific prompt enhancements
 */
export function getMealTypePromptGuidance(mealType: MealType): string {
  switch (mealType) {
    case 'breakfast':
      return `
BREAKFAST RECIPE REQUIREMENTS:
- Must be suitable for morning consumption
- Should include typical breakfast components: eggs, grains, dairy, fruit, or breakfast meats
- Preparation time ideally under 45 minutes
- Calorie range: 200-600 calories (reasonable morning meal)
- Examples of good breakfast recipes: oatmeal, eggs (scrambled/fried/poached), pancakes, waffles, French toast, toast with toppings, yogurt parfaits, smoothie bowls, breakfast burritos, frittatas, shakshuka
- Should be energizing and suitable for morning consumption
- MUST NOT be: heavy dinners, main courses, or late-night foods`;

    case 'lunch':
      return `
LUNCH RECIPE REQUIREMENTS:
- Must be suitable for midday meal (lunch/lunchtime)
- Should be a balanced, complete meal
- Preparation time ideally under 60 minutes
- Calorie range: 400-700 calories (typical lunch portion)
- Examples of good lunch recipes: salads, sandwiches, wraps, light pasta dishes, rice bowls, grain bowls, Buddha bowls, soups, light curries, tacos, pitas, half-portion entrees
- Should be lighter than dinner but more substantial than breakfast
- Can include vegetables, proteins, and grains
- MUST NOT be: heavy dinner dishes, full-sized main courses, or heavy multi-course meals`;

    case 'dinner':
      return `
DINNER RECIPE REQUIREMENTS:
- Must be suitable for evening meal (dinner/supper)
- Should be a substantial, satisfying main course
- Preparation time can be 30-120 minutes
- Calorie range: 500-1000+ calories (full dinner portion)
- Examples of good dinner recipes: roasted proteins with sides, braised dishes, stews, curries with rice, pasta with sauce, grilled steaks with vegetables, baked fish with sides, hearty soups, casseroles, slow-cooked dishes
- Should feel like a complete, filling meal
- Can include sauces, multiple components, and complex flavors
- Typically has a protein, carbs/grains, and vegetables
- MUST NOT be: breakfast foods, light snacks, or appetizers`;

    case 'snack':
      return `
SNACK RECIPE REQUIREMENTS:
- Must be light, quick, and easy to eat
- Ideal for eating between meals or as an appetizer
- Preparation time ideally under 30 minutes
- Calorie range: 50-300 calories (light snacking portion)
- Portion size: Small portions or bite-sized pieces
- Serving size typically 2-4 people for appetizer-style snacks
- Examples of good snacks: appetizers, finger foods, dips with crackers, meatballs, chicken wings, sliders, spring rolls, deviled eggs, nachos, quesadilla bites, cheese boards, bruschetta, canapés, skewers, energy bites, trail mix, popcorn, nut mixes
- Should be easy to hold and eat with hands or small utensils
- MUST NOT be: full meals, heavy entrees, or dishes that require a full plate`;

    default:
      return '';
  }
}

/**
 * Get full classification report
 */
export function getClassificationReport(
  recipe: GeneratedRecipeResponse,
  assignedType: MealType
): ClassificationResult {
  const validation = validateMealType(recipe, assignedType);
  const detected = classifyRecipeByContent(recipe);

  return {
    assignedType,
    detectedType: detected,
    confidence: validation.confidence,
    isValid: validation.isValid,
    reason: validation.reason,
  };
}
