import type { Recipe } from './store';
import { classifyRecipeByContent } from './meal-type-validator';

/**
 * Reclassify existing recipes based on content analysis
 * This scans all recipes and updates their meal type tags based on characteristics
 */

export interface ReclassificationReport {
  totalRecipes: number;
  reclassified: number;
  changes: Array<{
    recipeName: string;
    oldMealType: string;
    newMealType: string;
    confidence: number;
  }>;
}

/**
 * Extract meal type from recipe tags (looks for breakfast/lunch/dinner/snack)
 */
function extractCurrentMealType(recipe: Recipe): string | null {
  const mealTypeTag = recipe.tags.find(tag =>
    ['breakfast', 'lunch', 'dinner', 'snack'].includes(tag.toLowerCase())
  );
  return mealTypeTag?.toLowerCase() || null;
}

/**
 * Reclassify a single recipe based on content
 */
export function reclassifySingleRecipe(recipe: Recipe): {
  needsUpdate: boolean;
  oldMealType: string | null;
  newMealType: string;
  updatedRecipe: Recipe | null;
} {
  const currentMealType = extractCurrentMealType(recipe);

  // Convert recipe to format expected by validator
  const recipeForValidation = {
    name: recipe.name,
    description: recipe.description,
    cookTime: recipe.cookTime,
    prepTime: recipe.prepTime,
    servings: recipe.servings,
    ingredients: recipe.ingredients.map(ing => ({
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category,
    })),
    instructions: recipe.instructions,
    tags: recipe.tags,
    calories: recipe.calories || 0,
  };

  const detectedMealType = classifyRecipeByContent(recipeForValidation as any);
  const needsUpdate = currentMealType !== detectedMealType;

  if (needsUpdate) {
    // Remove old meal type tag and add new one
    const updatedTags = recipe.tags.filter(tag =>
      !['breakfast', 'lunch', 'dinner', 'snack'].includes(tag.toLowerCase())
    );
    updatedTags.push(detectedMealType);

    const updatedRecipe: Recipe = {
      ...recipe,
      tags: updatedTags,
    };

    return {
      needsUpdate: true,
      oldMealType: currentMealType || 'untagged',
      newMealType: detectedMealType,
      updatedRecipe,
    };
  }

  return {
    needsUpdate: false,
    oldMealType: currentMealType,
    newMealType: detectedMealType,
    updatedRecipe: null,
  };
}

/**
 * Reclassify all recipes in a collection
 * Returns a report of what was changed
 */
export function reclassifyAllRecipes(recipes: Recipe[]): {
  report: ReclassificationReport;
  updatedRecipes: Recipe[];
} {
  const changes: ReclassificationReport['changes'] = [];
  const updatedRecipes: Recipe[] = [];
  let reclassifiedCount = 0;

  recipes.forEach(recipe => {
    const result = reclassifySingleRecipe(recipe);

    if (result.needsUpdate && result.updatedRecipe) {
      reclassifiedCount++;
      changes.push({
        recipeName: recipe.name,
        oldMealType: result.oldMealType || 'untagged',
        newMealType: result.newMealType,
        confidence: 85, // Base confidence for existing recipes
      });
      updatedRecipes.push(result.updatedRecipe);
    } else {
      updatedRecipes.push(recipe);
    }
  });

  const report: ReclassificationReport = {
    totalRecipes: recipes.length,
    reclassified: reclassifiedCount,
    changes,
  };

  console.log(`[RecipeReclassifier] Reclassification complete:`, report);
  console.log(`[RecipeReclassifier] ${reclassifiedCount} recipes reclassified out of ${recipes.length}`);

  if (changes.length > 0) {
    console.log('[RecipeReclassifier] Changes:');
    changes.forEach(change => {
      console.log(
        `  - "${change.recipeName}": ${change.oldMealType} → ${change.newMealType}`
      );
    });
  }

  return { report, updatedRecipes };
}
