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

// ── Width ladder ────────────────────────────────────────────────────────────
//
// Every rendered width is snapped UP to one of these rungs before it reaches a
// URL. Without this, a 64pt strip thumbnail, a 72pt picker row and an 88pt meal
// card would each mint a slightly different transform URL for the SAME photo —
// three cache entries, three downloads, and a prefetch that warms none of them.
// Six rungs caps a photo at six variants app-wide and keeps prefetch and render
// agreeing on one key.
// 1200 is the top rung specifically because curated-plan-detail already
// requests it; keeping it means this refactor doesn't silently downgrade an
// existing hero's sharpness.
export const IMAGE_WIDTHS = [80, 150, 340, 600, 800, 1000, 1200] as const;

/** Rounds a rendered width up to the next ladder rung (clamped to the top rung). */
export function snapWidth(width: number): number {
  const w = Math.max(1, Math.round(width));
  for (const rung of IMAGE_WIDTHS) {
    if (w <= rung) return rung;
  }
  return IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];
}

// Hosts that expose their own resizing query params. Supabase is handled by the
// transform-endpoint rewrite above; these two only need their `w` swapped.
const PEXELS_HOST = 'images.pexels.com';
const UNSPLASH_HOST = 'images.unsplash.com';

/** Replace (or insert) a query param on a URL string, without a URL parser. */
function withParam(url: string, key: string, value: string): string {
  const re = new RegExp(`([?&])${key}=[^&]*`);
  if (re.test(url)) return url.replace(re, `$1${key}=${value}`);
  return `${url}${url.includes('?') ? '&' : '?'}${key}=${value}`;
}

/** Strip a query param entirely (used to drop Pexels' fixed `h`). */
function withoutParam(url: string, key: string): string {
  return url
    .replace(new RegExp(`([?&])${key}=[^&]*&`), '$1')
    .replace(new RegExp(`([?&])${key}=[^&]*$`), '')
    .replace(/\?$/, '');
}

interface RecipeImageOptions {
  /** Width the image actually renders at, in points. Snapped to the ladder. */
  width: number;
  /** WebP/JPEG quality 1-100. Defaults to 75. */
  quality?: number;
}

/**
 * The single entry point for turning a stored recipe photo URL into one sized
 * for the surface that's about to render it.
 *
 * Measured against the live bucket, a recipe PNG is 1.5–2.1 MB raw; the same
 * image through the Supabase transform at width=340 is ~23 KB. Pexels' `large`
 * variant is ~132 KB at 940px versus ~23 KB at 340px. Both are worth rewriting.
 *
 * Unknown hosts (user uploads to other CDNs) are returned unchanged, so this is
 * always safe to call.
 */
export function recipeImageUrl(url: string, opts: RecipeImageOptions): string {
  return buildImageUrl(url, snapWidth(opts.width), opts.quality ?? 75);
}

/**
 * Host dispatch at an EXACT width. Separate from `recipeImageUrl` because the
 * LQIP below deliberately bypasses the width ladder — snapping 24px up to the
 * first rung (80) would make the "preview" 3× larger than intended.
 */
function buildImageUrl(url: string, width: number, rawQuality: number): string {
  if (!url || typeof url !== 'string') return url;

  const quality = Math.max(1, Math.min(100, Math.round(rawQuality)));

  // Supabase Storage — the big win. Delegates to the existing helper so the
  // curated screens that already call it keep identical behaviour.
  if (url.includes(STORAGE_OBJECT_PATH) || url.includes(STORAGE_RENDER_PATH)) {
    return optimizedImageUrl(url, { width, quality });
  }

  if (url.includes(PEXELS_HOST)) {
    // Pexels sizes on `w`; its stock URLs also carry a fixed `h` that would
    // letterbox the result once the width changes, so drop it.
    return withParam(withoutParam(url, 'h'), 'w', String(width));
  }

  if (url.includes(UNSPLASH_HOST)) {
    return withParam(url, 'w', String(width));
  }

  return url;
}

// LQIP dimensions. 24px wide at low quality measures 0.9–4.3 KB across the
// bucket — small enough to arrive in one round trip, large enough to read as a
// blurred version of the real photo once scaled up.
const PREVIEW_WIDTH = 24;
const PREVIEW_QUALITY = 40;

/**
 * A tiny low-quality preview of the same photo, used as expo-image's
 * `placeholder` when no pre-computed blurhash exists for the image.
 *
 * Returns `undefined` for hosts we can't resize — there's no point requesting a
 * "preview" that is actually the full-size original.
 */
export function previewImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const preview = buildImageUrl(url, PREVIEW_WIDTH, PREVIEW_QUALITY);
  // Unchanged means the host isn't resizable — no preview available.
  return preview === url ? undefined : preview;
}
