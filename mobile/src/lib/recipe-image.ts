// Helpers for detecting the app's DEFAULT / placeholder recipe photo.
//
// When Pexels search (and the curated Supabase image library) find nothing,
// generateRecipeImage() falls back to a single stock Unsplash photo. That same
// photo id is reused as the fallback across the app with different query params
// (w=400 / w=800 / q=80 / auto=format). Matching on the stable photo id catches
// every variant while NEVER matching a real Pexels photo, a user upload, or a
// curated Supabase image — those live on entirely different URLs.
//
// Used to show an "Update your recipe image" nudge only on the placeholder.

/** The stable Unsplash photo id every default/fallback recipe image shares. */
export const DEFAULT_RECIPE_IMAGE_ID = 'photo-1546069901-ba9599a7e63c';

// NOTE: `DEFAULT_RECIPE_IMAGE_ID` above is still needed even though the
// placeholder art is now bundled — rows saved before that change (and anything
// the AI pipeline falls back to) still carry the remote URL, and
// isDefaultRecipeImage has to keep recognising it.

/**
 * True when `imageUrl` is the app's default stock placeholder (any query-param
 * variant) or empty — i.e. the recipe has no real photo yet. Returns false for
 * Pexels results, user uploads, and curated library images.
 */
export function isDefaultRecipeImage(imageUrl?: string | null): boolean {
  if (!imageUrl || !imageUrl.trim()) return true;
  return imageUrl.includes(DEFAULT_RECIPE_IMAGE_ID);
}

/** Tag written onto every dish captured during onboarding step 1. */
export const FREQUENT_COOK_TAG = 'frequent-cook';

/**
 * True when a recipe must keep the branded "add your recipe photo" placeholder
 * instead of being given an automatically-sourced image.
 *
 * The dishes a user speaks or types during onboarding are THEIRS — "Mum's dal",
 * "Dad's birthday curry". Illustrating them with whatever Pexels returns for
 * that string produces a library where some cards carry a convincing stock
 * photo of someone else's food and others don't, with no pattern the user can
 * see. A placeholder on all of them is both honest and consistent, and it
 * doubles as the invitation to add a real photo.
 *
 * This only blocks AUTOMATIC assignment. A photo the user picks or uploads goes
 * through the normal update path and is never suppressed.
 */
export function keepsPlaceholderImage(recipe: { tags?: string[] | null }): boolean {
  return (recipe.tags ?? []).some((t) => t?.toLowerCase() === FREQUENT_COOK_TAG);
}
