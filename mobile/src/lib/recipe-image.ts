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

/**
 * True when `imageUrl` is the app's default stock placeholder (any query-param
 * variant) or empty — i.e. the recipe has no real photo yet. Returns false for
 * Pexels results, user uploads, and curated library images.
 */
export function isDefaultRecipeImage(imageUrl?: string | null): boolean {
  if (!imageUrl || !imageUrl.trim()) return true;
  return imageUrl.includes(DEFAULT_RECIPE_IMAGE_ID);
}
