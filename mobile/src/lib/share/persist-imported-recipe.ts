// Turning an extracted recipe into a saved one — for BOTH import entry points.
//
// This is `handleSaveRecipe` from app/import-review.tsx, lifted out unchanged so
// the share flow can save without a second copy of the rules. Every step, and
// the order of every step, is preserved: duplicate gate → validate ingredients →
// classify meal type → resolve/re-host the hero image → build the Recipe →
// addRecipe. The review screen now calls this and behaves exactly as before.
//
// Deliberately NOT changed while moving it:
//   • The duplicate gate still matches on sourceUrl ONLY. `findExistingRecipe`
//     would also match on name+ingredient signature, which would start blocking
//     text imports that save today — a behaviour change with no bug behind it.
//   • The Unsplash fallback image, the Pexels lookup, and the "meal type joins
//     the tags" rule are all as they were.
//
// The one substitution: the screen's private `normalizeUrl` helper is replaced
// by `normalizeRecipeSourceUrl` from lib/recipe-identity.ts. They were
// character-for-character the same logic, and the shared one is what
// `store.addRecipe`'s upsert already keys on.

import { validateIngredients } from '../ingredient-validator';
import { classifyRecipeByContent } from '../meal-type-validator';
import { generateRecipeImage } from '../openai';
import { uploadRecipeImage } from '../uploadRecipeImage';
import { swallow } from '../failure';
import { normalizeRecipeSourceUrl } from '../recipe-identity';
import { useMealPlanStore } from '../store';
import type { Ingredient, Recipe } from '../store';

/** Placeholder used when neither the source post nor a photo lookup yields one. */
const FALLBACK_IMAGE_URL =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400';

/**
 * Meta (Facebook/Instagram) serve recipe photos from signed CDN hosts whose URLs
 * EXPIRE after a few days (note the `oe=` param). We persist those to our own
 * storage so a saved recipe keeps its photo. Stable hosts (blogs, YouTube
 * thumbnails) are left as-is.
 */
export function isEphemeralImageUrl(url: string): boolean {
  return /(?:fbcdn\.net|cdninstagram\.com|scontent)/i.test(url);
}

/** The editable shape both callers hold: the review screen's form state, or a
 *  freshly extracted recipe passed straight through by the share flow. */
export interface ImportedRecipeDraft {
  name: string;
  description: string;
  prepTime: number;
  cookTime: number;
  servings: number;
  calories?: number;
  ingredients: {
    name: string;
    quantity: string;
    unit: string;
    category: Ingredient['category'];
  }[];
  instructions: string[];
  tags: string[];
  /** The original page. Absent for text imports. */
  sourceUrl?: string;
  /** The source post's own photo, when the importer captured one. */
  imageUrl?: string;
}

export type PersistResult =
  | { kind: 'saved'; recipeId: string; recipe: Recipe }
  | { kind: 'duplicate'; recipeId: string; recipe: Recipe };

/**
 * The recipe already in the library that this draft would duplicate, if any.
 *
 * Source-URL match only — see the note at the top of the file. Returns the row
 * rather than a boolean so the caller can offer "View recipe" instead of a dead
 * end, which is what the share flow needs and the review screen never had.
 */
export function findDuplicateBySourceUrl(
  recipes: Recipe[],
  sourceUrl: string | undefined,
): Recipe | undefined {
  if (!sourceUrl) return undefined;
  const target = normalizeRecipeSourceUrl(sourceUrl);
  return recipes.find((r) => r.sourceUrl && normalizeRecipeSourceUrl(r.sourceUrl) === target);
}

/**
 * Save an imported recipe, or report that it's already saved.
 *
 * Idempotent by construction at two levels: the duplicate gate below, and
 * `store.addRecipe`'s own upsert (lib/recipe-identity.ts), which reuses an
 * existing row rather than appending when identities match. Calling this twice
 * with the same draft cannot produce two recipes.
 */
export async function persistImportedRecipe(
  draft: ImportedRecipeDraft,
): Promise<PersistResult> {
  const store = useMealPlanStore.getState();
  const normalizedSourceUrl = draft.sourceUrl
    ? normalizeRecipeSourceUrl(draft.sourceUrl)
    : undefined;

  const existing = findDuplicateBySourceUrl(store.recipes, draft.sourceUrl);
  if (existing) {
    return { kind: 'duplicate', recipeId: existing.id, recipe: existing };
  }

  // Validate and normalize ingredients using strict unit type rules.
  const validatedIngredients = validateIngredients(draft.ingredients);

  // Classify by content to determine meal type, then fold it into the tags.
  // The review screen passed this object through `as any`; it types cleanly, and
  // `calories: 0` is indistinguishable from `undefined` to the classifier (it
  // guards with `if (recipe.calories && …)`), so the behaviour is unchanged.
  const mealType = classifyRecipeByContent({
    name: draft.name,
    description: draft.description,
    cookTime: draft.cookTime,
    prepTime: draft.prepTime,
    servings: draft.servings,
    ingredients: validatedIngredients.map((ing) => ({
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category,
    })),
    instructions: draft.instructions,
    calories: draft.calories ?? 0,
    tags: [],
  });

  const updatedTags = [...draft.tags];
  if (!updatedTags.includes(mealType)) {
    updatedTags.push(mealType);
  }

  // Image: prefer the source post's own photo (og:image) — the real dish — and
  // only fall back to a photo lookup when the import didn't capture one.
  let imageUrl = FALLBACK_IMAGE_URL;
  const sourceImage = draft.imageUrl;
  if (sourceImage && /^https?:\/\//i.test(sourceImage)) {
    if (isEphemeralImageUrl(sourceImage)) {
      // Download the expiring CDN image and re-host it permanently.
      const persisted = await uploadRecipeImage(sourceImage);
      imageUrl = persisted ?? sourceImage;
    } else {
      imageUrl = sourceImage;
    }
  } else {
    try {
      const ingredientsForImage = validatedIngredients.map((ing) => ({
        name: ing.name,
        category: ing.category,
      }));
      imageUrl = await generateRecipeImage(
        draft.name,
        draft.description,
        ingredientsForImage,
      );
    } catch (error) {
      swallow(error, 'photo lookup is best-effort; a fallback image is used', 'recipe-image');
    }
  }

  const newRecipe: Recipe = {
    id: '', // Will be generated by store
    name: draft.name,
    description: draft.description,
    imageUrl,
    prepTime: draft.prepTime,
    cookTime: draft.cookTime,
    servings: draft.servings,
    ingredients: validatedIngredients.map((ing, idx) => ({
      id: `${Date.now()}-${idx}`,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category,
    })),
    instructions: draft.instructions,
    tags: updatedTags,
    calories: draft.calories,
    isAIGenerated: false,
    isImported: true,
    sourceUrl: normalizedSourceUrl,
    isSaved: false,
    createdAt: new Date().toISOString(),
  };

  const recipeId = store.addRecipe(newRecipe);
  return { kind: 'saved', recipeId, recipe: { ...newRecipe, id: recipeId } };
}
