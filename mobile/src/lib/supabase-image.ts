// Supabase Storage image-transformation helpers.
//
// Raw Supabase URLs (`/storage/v1/object/public/...`) serve the upload-quality
// PNG/JPEG straight from the bucket. For mobile cards that render at ~400×225
// we're downloading 30× the pixels we display, in a format that's 3× heavier
// than WebP. Rewriting through the `/storage/v1/render/image/public/...`
// transform endpoint returns a resized + recompressed WebP served from the
// edge cache, typically 20–40× smaller for photographic food imagery.
//
// The helper is idempotent and safe for non-Supabase URLs (returns them
// unchanged), so call sites can opt in without checking the URL shape first.

// Marker that identifies a Supabase Storage public-object URL we can rewrite.
const STORAGE_OBJECT_PATH = '/storage/v1/object/public/';
const STORAGE_RENDER_PATH = '/storage/v1/render/image/public/';

interface OptimizeOptions {
  /** Target width in CSS px. Pass ~2× the rendered width for retina sharpness. */
  width: number;
  /** WebP quality 1-100. Default 75 — the sweet spot for plated food photos. */
  quality?: number;
}

/**
 * Rewrites a Supabase Storage URL to its image-transform endpoint, requesting a
 * resized WebP variant. Non-Supabase URLs (e.g. AI-generated CDN links, user
 * uploads to other hosts) are returned unchanged.
 */
export function optimizedImageUrl(url: string, opts: OptimizeOptions): string {
  if (!url || typeof url !== 'string') return url;
  // Already a transform URL? Don't double-rewrite — return as-is.
  if (url.includes(STORAGE_RENDER_PATH)) return url;
  // Not a Supabase storage URL? Leave it.
  if (!url.includes(STORAGE_OBJECT_PATH)) return url;

  const width = Math.max(1, Math.round(opts.width));
  const quality = Math.max(1, Math.min(100, Math.round(opts.quality ?? 75)));

  const rewritten = url.replace(STORAGE_OBJECT_PATH, STORAGE_RENDER_PATH);
  // Preserve any pre-existing query string on the original URL.
  const sep = rewritten.includes('?') ? '&' : '?';
  return `${rewritten}${sep}width=${width}&quality=${quality}&format=webp`;
}
