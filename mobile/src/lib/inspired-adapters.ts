// Adapters between the static Get Inspired library (INSPIRED_RECIPES) and the
// app's store Recipe shape. Shared by the Get Inspired feed and recipe-detail
// so the "read-only library preview" always renders pristine library data,
// independent of any personal (store) copy the user may have edited.

import { INSPIRED_RECIPES, type InspiredRecipe } from './inspired-recipe-library';
import type { Recipe, Ingredient } from './store';

/** Build a full store Recipe from a library entry — ready for store.addRecipe,
 *  which upserts on curatedSourceId (`inspired::<id>`) so it can't duplicate. */
export function inspiredToRecipe(r: InspiredRecipe, isSaved: boolean): Recipe {
  const tags = Array.from(
    new Set([r.cuisine, r.mealType, r.difficulty, ...r.dietary, ...r.healthGoals].filter(Boolean)),
  );
  const desc = `A ${r.difficulty ? r.difficulty.toLowerCase() + ' ' : ''}${r.cuisine} recipe${
    r.dietary.length ? ` (${r.dietary.join(', ')})` : ''
  }.`;
  return {
    id: '',
    name: r.name,
    description: desc,
    imageUrl: r.imageUrl,
    cookTime: r.totalMinutes,
    prepTime: 0,
    servings: r.servings || 1,
    ingredients: r.ingredients.map((ing, i) => ({
      id: `${r.id}-${i}`,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      category: ing.category as Ingredient['category'],
    })),
    instructions: r.instructions,
    tags,
    calories: r.calories || undefined,
    isAIGenerated: false,
    isSaved,
    createdAt: new Date().toISOString(),
    curatedSourceId: `inspired::${r.id}`,
  };
}

/** Resolve a library entry from a curatedSourceId (`inspired::<id>`) or bare id. */
export function findInspiredById(sourceId?: string | null): InspiredRecipe | undefined {
  if (!sourceId) return undefined;
  const rawId = sourceId.startsWith('inspired::') ? sourceId.slice('inspired::'.length) : sourceId;
  return INSPIRED_RECIPES.find((r) => r.id === rawId);
}

// id → blurhash, built on first lookup. A saved library recipe stores only its
// `curatedSourceId`, not the hash — the hash deliberately does NOT live on the
// persisted Recipe (that would mean a schema change and a column of derived
// data). Looking it back up here gives the Recipes grid the same instant
// placeholder the Explore tab gets, for free.
//
// Lazy + memoized: a linear .find() per card would be 736 comparisons on every
// render, and building the map eagerly would force the 740 KB library to
// evaluate at import time.
let blurhashById: Map<string, string> | null = null;

/** Blurhash for a saved library recipe, resolved from its curatedSourceId. */
export function inspiredBlurhashFor(sourceId?: string | null): string | undefined {
  if (!sourceId) return undefined;
  if (!blurhashById) {
    blurhashById = new Map();
    for (const r of INSPIRED_RECIPES) {
      if (r.blurhash) blurhashById.set(r.id, r.blurhash);
    }
  }
  const rawId = sourceId.startsWith('inspired::') ? sourceId.slice('inspired::'.length) : sourceId;
  return blurhashById.get(rawId);
}
