import { Recipe, UserPreferences, mergePersonaWithUserInstructions } from './store';
import { generateRecipe, isOpenAIConfigured, type MealType } from './openai';
import { validateIngredients } from './ingredient-validator';

const PLACEHOLDER_IMAGES: Record<MealType, string> = {
  breakfast: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400',
  lunch: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
  dinner: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400',
  snack: 'https://images.unsplash.com/photo-1559054663-e8d23213f55c?w=400',
};

function generateLocalId(): string {
  return `pick_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function generateAIPicks(
  preferences: UserPreferences,
  activeMealTypes: MealType[],
): Promise<Recipe[]> {
  if (!isOpenAIConfigured()) {
    console.log('[PicksForYou] OpenAI not configured, skipping AI generation');
    return [];
  }

  const targetMealTypes = activeMealTypes.length > 0
    ? activeMealTypes.slice(0, 4)
    : (['breakfast', 'lunch', 'dinner'] as MealType[]);

  console.log('[PicksForYou] Generating AI picks for meal types:', targetMealTypes);

  // Persona + ANZ context + per-meal budget — funneled through Rule #1.5 in
  // the recipe prompt (overrides cuisine/skill/time prefs, never allergies).
  const personaInstructions = mergePersonaWithUserInstructions(preferences);

  const recipes: Recipe[] = [];
  const usedFormats: string[] = [];
  const usedTechniques: string[] = [];
  const usedProteins = new Set<string>();

  for (const mealType of targetMealTypes) {
    try {
      const result = await generateRecipe({
        mealTypes: [mealType],
        preferences,
        previousFormats: usedFormats,
        previousTechniques: usedTechniques,
        excludeProteins: Array.from(usedProteins),
        customCookingInstructions: personaInstructions,
      });

      const validatedIngredients = validateIngredients(
        result.ingredients.map((ing) => ({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          category: ing.category as 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other',
        })),
      );

      const recipe: Recipe = {
        id: generateLocalId(),
        name: result.name,
        description: result.description,
        imageUrl: PLACEHOLDER_IMAGES[mealType],
        cookTime: result.cookTime,
        prepTime: result.prepTime,
        servings: result.servings,
        ingredients: validatedIngredients.map((ing, idx) => ({
          id: `pick-ing-${idx}`,
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          category: ing.category,
        })),
        instructions: result.instructions,
        tags: [...new Set([...result.tags, mealType])],
        calories: result.calories,
        isAIGenerated: true,
        isSaved: false,
        createdAt: new Date().toISOString(),
        violations: result.violations,
      };

      recipes.push(recipe);

      result.ingredients.forEach((ing) => {
        const name = ing.name.toLowerCase();
        ['chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'tofu', 'shrimp', 'turkey', 'lamb'].forEach((p) => {
          if (name.includes(p)) usedProteins.add(p);
        });
      });
    } catch (error) {
      console.warn(`[PicksForYou] Failed to generate ${mealType} pick:`, error);
    }
  }

  console.log(`[PicksForYou] Generated ${recipes.length} AI picks`);
  return recipes;
}
