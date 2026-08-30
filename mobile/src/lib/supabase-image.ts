// Recipe image URL helpers.
//
// Supabase's on-demand image transformations are deliberately NOT used. Static
// recipe buckets contain pre-generated WebP variants under
// `_optimized/v1/{340|800|1200}/...`; those are ordinary Storage objects with
// immutable browser caching and do not consume the transformation quota.
//
// Buckets outside the explicit static allowlist (especially user-uploads) stay
// on their original object URL. DishImage retains its original fallback, so a
// partially completed variant rollout never leaves an empty card.

// Marker that identifies a Supabase Storage public-object URL we can rewrite.
const STORAGE_OBJECT_PATH = "/storage/v1/object/public/";
const STORAGE_RENDER_PATH = "/storage/v1/render/image/public/";
const OPTIMIZED_ROOT = "_optimized/v1";

export const STATIC_OPTIMIZED_BUCKETS = [
  "NewRecipeImages",
  "Recipe Images",
  "backupimages",
  "New69",
  "Solo Active Professional",
  "Smart Family Budget",
  "Vegeterian Delight Meal Plan",
  "Light & Easy Meal Plan",
  "High Protein Gym Meal Plan",
] as const;

export const STORED_IMAGE_WIDTHS = [340, 800, 1200] as const;

interface OptimizeOptions {
  /** Target width in CSS px. Pass ~2× the rendered width for retina sharpness. */
  width: number;
  /** WebP quality 1-100. Default 75 — the sweet spot for plated food photos. */
  quality?: number;
}

/**
 * Selects an ordinary pre-generated WebP Storage object. A persisted legacy
 * render URL is first normalized back to its public object URL so disabling
 * Image Transformations cannot leave old data pointing at the render endpoint.
 */
export function optimizedImageUrl(url: string, opts: OptimizeOptions): string {
  if (!url || typeof url !== "string") return url;
  const publicObjectUrl = url.includes(STORAGE_RENDER_PATH)
    ? url
        .replace(STORAGE_RENDER_PATH, STORAGE_OBJECT_PATH)
        .replace(/[?#].*$/, "")
    : url;
  if (!publicObjectUrl.includes(STORAGE_OBJECT_PATH)) return url;

  return storedVariantUrl(publicObjectUrl, opts.width) ?? publicObjectUrl;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function storedVariantWidth(
  width: number,
): (typeof STORED_IMAGE_WIDTHS)[number] {
  const requested = Math.max(1, Math.round(width));
  for (const candidate of STORED_IMAGE_WIDTHS) {
    if (requested <= candidate) return candidate;
  }
  return STORED_IMAGE_WIDTHS[STORED_IMAGE_WIDTHS.length - 1];
}

/** Returns null for non-static buckets so callers use the original URL. */
export function storedVariantUrl(url: string, width: number): string | null {
  const marker = url.indexOf(STORAGE_OBJECT_PATH);
  if (marker < 0) return null;

  const base = url.slice(0, marker + STORAGE_OBJECT_PATH.length);
  const storagePath = url
    .slice(marker + STORAGE_OBJECT_PATH.length)
    .replace(/[?#].*$/, "");
  const firstSlash = storagePath.indexOf("/");
  if (firstSlash < 1) return null;

  const encodedBucket = storagePath.slice(0, firstSlash);
  const objectPath = storagePath.slice(firstSlash + 1);
  const bucket = safeDecode(encodedBucket);
  if (!(STATIC_OPTIMIZED_BUCKETS as readonly string[]).includes(bucket))
    return null;

  // Already immutable and pre-generated: do not nest `_optimized` repeatedly.
  if (objectPath.startsWith(`${OPTIMIZED_ROOT}/`))
    return `${base}${storagePath}`;

  const stem = objectPath.replace(/\.[^./]+$/, "");
  return `${base}${encodedBucket}/${OPTIMIZED_ROOT}/${storedVariantWidth(width)}/${stem}.webp`;
}

// ── Width ladder ────────────────────────────────────────────────────────────
//
// Every rendered width is snapped UP to one of these rungs before it reaches a
// URL. Without this, a 64pt strip thumbnail, a 72pt picker row and an 88pt meal
// card would each mint a slightly different transform URL for the SAME photo —
// three cache entries, three downloads, and a prefetch that warms none of them.
// The ladder still keeps third-party CDN URLs stable; Supabase requests are
// collapsed again to the three stored widths above.
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
// stored-object selection above; these two only need their `w` swapped.
const PEXELS_HOST = "images.pexels.com";
const UNSPLASH_HOST = "images.unsplash.com";

/** Replace (or insert) a query param on a URL string, without a URL parser. */
function withParam(url: string, key: string, value: string): string {
  const re = new RegExp(`([?&])${key}=[^&]*`);
  if (re.test(url)) return url.replace(re, `$1${key}=${value}`);
  return `${url}${url.includes("?") ? "&" : "?"}${key}=${value}`;
}

/** Strip a query param entirely (used to drop Pexels' fixed `h`). */
function withoutParam(url: string, key: string): string {
  return url
    .replace(new RegExp(`([?&])${key}=[^&]*&`), "$1")
    .replace(new RegExp(`([?&])${key}=[^&]*$`), "")
    .replace(/\?$/, "");
}

interface RecipeImageOptions {
  /** Width the image actually renders at, in points. Snapped to the ladder. */
  width: number;
  /** WebP/JPEG quality 1-100. Defaults to 75. */
  quality?: number;
}

// Native image requests are not consistently shown by Expo's experimental
// Network inspector. In development, emit one diagnostic per resolved URL so
// a physical-device check can prove which stored object is actually selected
// without flooding Metro every time a list cell re-renders.
const loggedRecipeImageUrls = new Set<string>();

function logResolvedRecipeImage(source: string, resolved: string): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  if (loggedRecipeImageUrls.has(resolved)) return;
  loggedRecipeImageUrls.add(resolved);
  const strategy = resolved.includes(`/${OPTIMIZED_ROOT}/`)
    ? "STORED_VARIANT"
    : resolved !== source
      ? "EXTERNAL_RESIZED"
      : "ORIGINAL";
  console.log(`[ImageResolver:${strategy}]`, {
    source,
    resolved,
  });
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
  const resolved = buildImageUrl(
    url,
    snapWidth(opts.width),
    opts.quality ?? 75,
  );
  logResolvedRecipeImage(url, resolved);
  return resolved;
}

/**
 * Host dispatch at an EXACT width. Separate from `recipeImageUrl` because the
 * LQIP below deliberately bypasses the width ladder — snapping 24px up to the
 * first rung (80) would make the "preview" 3× larger than intended.
 */
function buildImageUrl(url: string, width: number, rawQuality: number): string {
  if (!url || typeof url !== "string") return url;

  const quality = Math.max(1, Math.min(100, Math.round(rawQuality)));

  // Supabase Storage — select a pre-generated object and never call /render.
  if (url.includes(STORAGE_OBJECT_PATH) || url.includes(STORAGE_RENDER_PATH)) {
    return optimizedImageUrl(url, { width, quality });
  }

  if (url.includes(PEXELS_HOST)) {
    // Pexels sizes on `w`; its stock URLs also carry a fixed `h` that would
    // letterbox the result once the width changes, so drop it.
    return withParam(withoutParam(url, "h"), "w", String(width));
  }

  if (url.includes(UNSPLASH_HOST)) {
    return withParam(url, "w", String(width));
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
export function previewImageUrl(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined;
  // Static recipes already carry blurhashes. For user uploads, the tone tile is
  // preferable to probing a variant that may not exist and then downloading
  // the original twice. Pexels and Unsplash can still provide a tiny preview.
  if (url.includes(STORAGE_OBJECT_PATH) || url.includes(STORAGE_RENDER_PATH))
    return undefined;
  const preview = buildImageUrl(url, PREVIEW_WIDTH, PREVIEW_QUALITY);
  // Unchanged means the host isn't resizable — no preview available.
  return preview === url ? undefined : preview;
}
