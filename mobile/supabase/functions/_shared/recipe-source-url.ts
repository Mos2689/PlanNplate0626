// The canonical form of a recipe's source URL.
//
// Character-for-character the same logic as `normalizeRecipeSourceUrl` in
// src/lib/recipe-identity.ts. It is copied rather than imported because Deno
// cannot resolve that file's extensionless relative imports, and it is copied
// rather than reimplemented because the two MUST agree: the server's duplicate
// gate and `store.addRecipe`'s upsert both key on this string. If they disagree,
// a recipe saved by the share extension imports a second time the next time the
// app drains a queued share.
//
// Kept deliberately tiny for that reason — it has no dependencies and nothing
// else belongs in here. `src/lib/__tests__/share-source-url-parity.test.ts`
// asserts the two implementations still return the same answer.

/**
 * Canonical form of a recipe source URL for dedup comparison. Strips YouTube
 * tracking params so the same video imported twice resolves to one key.
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
