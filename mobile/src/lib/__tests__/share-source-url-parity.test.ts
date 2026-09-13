// `normalizeRecipeSourceUrl` exists twice and the two copies MUST agree.
//
// The app keys `store.addRecipe`'s upsert on it (lib/recipe-identity.ts); the
// `share-import` edge function keys its duplicate gate on it
// (supabase/functions/_shared/recipe-source-url.ts). They cannot be one module:
// Deno can't resolve the app file's extensionless relative imports, and the app
// file drags in `./store` for a type.
//
// If they drift, nothing throws. The share extension saves a recipe, the app
// later drains the queued copy of the same link, the duplicate check compares
// two differently-normalized strings, misses, and the user gets the same recipe
// twice. This test is the only thing standing between that and a release.

import { normalizeRecipeSourceUrl as appNormalize } from '../recipe-identity';
import { normalizeRecipeSourceUrl as serverNormalize } from '../../../supabase/functions/_shared/recipe-source-url';

const URLS = [
  // The YouTube cases the function exists for.
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123',
  'https://youtube.com/watch?v=abc_DEF-123',
  'https://youtu.be/dQw4w9WgXcQ',
  'https://youtu.be/dQw4w9WgXcQ?si=trackingparam',
  'https://www.youtube.com/shorts/abc123',
  'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
  // youtube.com with no `v` at all — falls through to the youtu.be branch.
  'https://www.youtube.com/playlist?list=PL123',

  // Everything else is returned untouched, tracking params and all.
  'https://www.instagram.com/reel/CxYzAbCdEfG/',
  'https://www.instagram.com/p/CxYzAbCdEfG/?igsh=abc123',
  'https://www.tiktok.com/@user/video/7301234567890123456',
  'https://cooking.nytimes.com/recipes/1234-pasta?smid=share',
  'https://example.com/recipe#ingredients',
  'https://example.com/a%20path/with%20spaces',

  // Inputs that must not throw.
  '',
  'not a url at all',
  'plannplate://share-import',
  'http://insecure.example.com/recipe',
];

describe('normalizeRecipeSourceUrl parity', () => {
  it.each(URLS)('app and edge function agree on %p', (url) => {
    expect(serverNormalize(url)).toBe(appNormalize(url));
  });

  it('is idempotent — normalizing twice changes nothing', () => {
    // The duplicate gate compares a stored value (already normalized on save)
    // against a freshly normalized one, so a second pass has to be a no-op.
    for (const url of URLS) {
      const once = appNormalize(url);
      expect(appNormalize(once)).toBe(once);
      expect(serverNormalize(once)).toBe(once);
    }
  });

  it('collapses YouTube tracking params onto one key', () => {
    // The behaviour the whole function is for: the same video shared from the
    // app, from a browser and from a playlist must resolve to one recipe.
    const canonical = appNormalize('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(appNormalize('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe(canonical);
    expect(appNormalize('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(canonical);
  });
});
