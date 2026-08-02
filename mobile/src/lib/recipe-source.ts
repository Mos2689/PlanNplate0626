// Pure helpers for judging a recipe link.
//
// These two functions used to sit at the bottom of recipeImport.ts. They are
// unchanged — moved here because that file also reaches for the Supabase client
// and the edge-function router at import time, which makes it unloadable in the
// plain-node test environment this repo uses (see jest.config.js). The shared
// ingestion layer in lib/share/ needs them and needs to be testable, so the
// pure part now lives on its own.
//
// recipeImport.ts re-exports both, so every existing
// `import { isUrl, detectSourceType } from '@/lib/recipeImport'` still resolves
// to exactly the same functions.

/**
 * Check if a string looks like a URL
 */
export function isUrl(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Detect the source type from a URL
 */
export function detectSourceType(url: string): 'instagram' | 'tiktok' | 'youtube' | 'pinterest' | 'website' {
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes('instagram.com') || lowerUrl.includes('instagr.am')) {
    return 'instagram';
  }
  if (lowerUrl.includes('tiktok.com') || lowerUrl.includes('vm.tiktok.com')) {
    return 'tiktok';
  }
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
    return 'youtube';
  }
  if (lowerUrl.includes('pinterest.com') || lowerUrl.includes('pin.it')) {
    return 'pinterest';
  }

  return 'website';
}
