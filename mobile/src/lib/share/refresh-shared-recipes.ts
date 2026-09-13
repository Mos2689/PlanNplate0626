// Pick up recipes the iOS share extension saved while the app wasn't running.
//
// The extension imports through the `share-import` edge function, so the recipe
// lands in Postgres with no app process involved. `loadUserData` would find it —
// but StoreHydration only calls that when the signed-in user CHANGES, so
// otherwise the recipe wouldn't appear until the next cold start. Sharing three
// recipes over a morning and seeing none of them is not a shipped feature.
//
// Runs on the foreground pass that already exists in useShareTarget, alongside
// draining the App Group queue. Deliberately narrow and cheap: one timestamped
// query, nothing written back, and a failure is silent — this is a top-up, and
// the next cold start is the backstop.

import * as db from '../database';
import { swallow } from '../failure';
import { reclassifySingleRecipe } from '../recipe-reclassifier';
import { useMealPlanStore } from '../store';

/**
 * How far back to look when the library is empty.
 *
 * Matches the 7-day expiry on pending shares (lib/share/pending-share.ts): a
 * link older than that is no longer offered to the user, so a recipe older than
 * that cannot be one we're waiting on.
 */
const COLD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Small overlap on the "since" bound.
 *
 * `created_at` is stamped by the edge function from the server's clock and
 * compared against a timestamp derived from rows the client already holds. A few
 * seconds of skew either way would silently drop exactly the recipe this
 * function exists to fetch, and re-fetching a row we already have costs nothing
 * — `mergeRemoteRecipes` ignores it.
 */
const SKEW_MS = 60 * 1000;

function since(): string {
  const { recipes } = useMealPlanStore.getState();
  const newest = recipes.reduce((max, recipe) => {
    const t = recipe.createdAt ? new Date(recipe.createdAt).getTime() : 0;
    return Number.isFinite(t) && t > max ? t : max;
  }, 0);

  const from = newest > 0 ? newest - SKEW_MS : Date.now() - COLD_WINDOW_MS;
  return new Date(from).toISOString();
}

/**
 * Fetch anything saved since the newest recipe we hold, and fold it in.
 *
 * Returns the number of genuinely new recipes. Never throws.
 */
export async function refreshSharedRecipes(userId: string): Promise<number> {
  try {
    const fetched = await db.fetchRecipesSince(userId, since());
    if (fetched.length === 0) return 0;

    // A recipe saved by the extension has whatever tags the model produced,
    // which may not include a meal type — the tag the Breakfast/Lunch/Snack
    // filters read. The same backfill StoreHydration runs on load fills it in,
    // so there is one implementation of that rule rather than a server-side copy.
    const classified = fetched.map((recipe) => {
      const { updatedRecipe } = reclassifySingleRecipe(recipe);
      return updatedRecipe ?? recipe;
    });

    const added = useMealPlanStore.getState().mergeRemoteRecipes(classified);
    if (added > 0) {
      console.log(`[ShareTarget] Picked up ${added} recipe(s) saved while away`);
    }
    return added;
  } catch (error) {
    swallow(error, 'recipe top-up is best-effort; cold start reloads everything', 'recipe-share');
    return 0;
  }
}
