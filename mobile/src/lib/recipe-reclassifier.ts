import type { Recipe } from './store';
import { classifyRecipeByContent } from './meal-type-validator';
import { canonicalMealTag, isMealTypeTag, categoryForTag } from './recipe-categories';
import { findInspiredById } from './inspired-adapters';

/**
 * FILL IN a missing meal-type tag from content analysis.
 *
 * This only ADDS a meal-type tag to recipes that don't already have one and
 * aren't curated. It must NEVER override a meal type a recipe already carries —
 * a content guess is fallible (it once mislabelled a curry as breakfast), and a
 * curated library recipe's category is authoritative. Reading is done through
 * the shared taxonomy so every tag format ('Lunch/Dinner', 'lunch', …) counts.
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
 * Reclassify a single recipe based on content
 */
export function reclassifySingleRecipe(recipe: Recipe): {
  needsUpdate: boolean;
  oldMealType: string | null;
  newMealType: string;
  updatedRecipe: Recipe | null;
} {
  // 1. CURATED library recipe → REPAIR from the library, which is authoritative.
  //    Content classification must never decide here — it once mislabelled the
  //    curry "Saag Aloo" (mealType "Lunch/Dinner") as breakfast, and past runs
  //    persisted that wrong tag. We keep every non-meal tag plus any meal-type
  //    tag of the RIGHT category, drop meal-type tags of any other category, and
  //    ensure the correct canonical tag is present.
  if (recipe.curatedSourceId) {
    const lib = findInspiredById(recipe.curatedSourceId);
    const libCat = lib?.mealType ? categoryForTag(lib.mealType) : undefined;
    if (libCat) {
      const cleaned = recipe.tags.filter(
        (t) => !isMealTypeTag(t) || categoryForTag(t)?.key === libCat.key,
      );
      if (!cleaned.some((t) => categoryForTag(t)?.key === libCat.key)) {
        cleaned.push(libCat.tag);
      }
      const changed =
        cleaned.length !== recipe.tags.length ||
        cleaned.some((t, i) => t !== recipe.tags[i]);
      if (changed) {
        return {
          needsUpdate: true,
          oldMealType: recipe.tags.filter(isMealTypeTag).join('+') || 'untagged',
          newMealType: libCat.tag,
          updatedRecipe: { ...recipe, tags: cleaned },
        };
      }
    }
    // Curated but not in the inspired library (e.g. a curated-plan recipe), or
    // already correct → leave untouched.
    return { needsUpdate: false, oldMealType: null, newMealType: 'n/a', updatedRecipe: null };
  }

  // 2. NON-CURATED that already carries ANY meal-type tag (breakfast, main,
  //    snack, drink, dessert, …) → never override it.
  if (recipe.tags.some(isMealTypeTag)) {
    return {
      needsUpdate: false,
      oldMealType: 'tagged',
      newMealType: 'tagged',
      updatedRecipe: null,
    };
  }

  // 3. NON-CURATED and untagged → derive a meal type from content and fill it in.
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
  // Defensive: strip any stray meal-type tags (there shouldn't be any, since
  // currentCategory was null) and add the single canonical tag.
  const updatedTags = recipe.tags.filter(tag => !isMealTypeTag(tag));
  updatedTags.push(canonicalMealTag(detectedMealType));

  return {
    needsUpdate: true,
    oldMealType: 'untagged',
    newMealType: detectedMealType,
    updatedRecipe: { ...recipe, tags: updatedTags },
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
