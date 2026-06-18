// recipe-identity.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for "are these two recipes the same?" Used by
// `addRecipe` (store.ts) to UPSERT instead of blindly appending, so the same
// recipe added from different entry points (AI generation, curated plans,
// import, manual) does not pile up duplicate library rows.
//
// Identity is SOURCE-AWARE — we use the strongest signal available per source,
// in priority order:
//   1. curatedSourceId — a stable id stamped on curated-plan recipes. Highest
//      priority so re-applying the same curated plan (even after the user
//      renames their copy) reuses the existing row.
//   2. sourceUrl       — normalized canonical URL for web-imported recipes.
//   3. name + ingredient signature — the fallback. NEVER name alone: two
//      genuinely different recipes can share a name ("Chicken Curry" Indian vs
//      Thai), and silently merging them would destroy a distinct recipe. By
//      folding the canonical ingredient-name set into the key we fail toward
//      KEEPING BOTH (a missed merge is a visible dup the user can clean up;
//      a wrong merge is irreversible data loss).
// ─────────────────────────────────────────────────────────────────────────────

import type { Recipe } from './store';
import { getCanonicalIngredientName } from './ingredient-aliases';

/** Lowercased, trimmed, single-spaced recipe name. */
export function normalizeRecipeName(name: string): string {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Canonical form of a recipe source URL for dedup comparison. Strips YouTube
 * tracking params so the same video imported twice resolves to one key.
 * (Logic mirrors the previous inline normalizer in `hasRecipeWithSourceUrl`.)
 */
export function normalizeRecipeSourceUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
      const videoId = urlObj.searchParams.get('v');
      if (videoId) return `https://youtube.com/watch?v=${videoId}`;
      return `https://youtu.be${urlObj.pathname}`;
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * URL-safe slug from a recipe name, used to build a deterministic, stable
 * `curatedSourceId` for curated-plan recipes (e.g. "Greek Yogurt Parfait" →
 * "greek-yogurt-parfait"). Combined with the plan id by the caller.
 */
export function curatedNameSlug(name: string): string {
  return normalizeRecipeName(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Sorted, deduped set of canonical ingredient names — the fallback discriminator. */
function ingredientSignature(ingredients: Recipe['ingredients'] | undefined): string {
  const names = (ingredients || [])
    .map((i) => getCanonicalIngredientName(i?.name || '').trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(names)).sort().join(',');
}

/**
 * The dedup key for a recipe. Two recipes with the same key are considered the
 * same recipe and should share one library row. The prefix namespaces each
 * source so a curated id can never collide with a URL or a name.
 */
export function getRecipeDedupKey(
  recipe: Pick<Recipe, 'name' | 'sourceUrl' | 'ingredients'> & { curatedSourceId?: string },
): string {
  if (recipe.curatedSourceId) {
    return `curated:${recipe.curatedSourceId}`;
  }
  if (recipe.sourceUrl) {
    return `url:${normalizeRecipeSourceUrl(recipe.sourceUrl)}`;
  }
  return `name:${normalizeRecipeName(recipe.name)}|${ingredientSignature(recipe.ingredients)}`;
}

/**
 * Find an existing recipe in `recipes` that shares the incoming recipe's
 * identity, or return undefined. O(n) — fine for the cold add path on a
 * bounded library; curated/AI batches call this per item and the linear scan
 * naturally sees rows added earlier in the same batch (they're already in the
 * store), so within-batch dedup works without a separate index.
 */
export function findExistingRecipe(
  recipes: Recipe[],
  incoming: Pick<Recipe, 'name' | 'sourceUrl' | 'ingredients'> & { curatedSourceId?: string },
): Recipe | undefined {
  const key = getRecipeDedupKey(incoming);
  return recipes.find((r) => getRecipeDedupKey(r) === key);
}
