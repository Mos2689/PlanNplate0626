// DishImage — the single image wrapper for every recipe photo in the app.
//
// The loading experience is layered so the slot is NEVER empty:
//
//   Layer 0 · Tone tile (frame 1, zero network)
//       A warm tile picked deterministically from the item's id. Replaces the
//       old flat #F4F0E8, so a grid of loading cards reads as intentional
//       rather than broken, and two adjacent cards never look identical.
//
//   Layer 1 · Placeholder (frame 1 if hashed, ~1 round trip otherwise)
//       A pre-computed blurhash when the data file carries one (instant, no
//       request). Otherwise a ~1–4 KB low-quality preview of the real photo
//       from the same CDN. Never both — that would be a wasted request.
//
//   Layer 2 · Full image, cross-faded in
//       Requested at the size it actually renders. Measured against the live
//       bucket: 1.5–2.1 MB raw PNG versus ~23–30 KB at width=340. Cache policy
//       is memory-disk so a second look is a memory hit, not a re-decode.
//
// Failure is bounded: one retry against the raw object URL, then it settles on
// the tone tile. A card whose photo 404s keeps its title, metadata and actions.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import type { ImageStyle, StyleProp } from 'react-native';
import { Image, type ImageContentFit } from 'expo-image';
import { previewImageUrl, recipeImageUrl } from '@/lib/supabase-image';
import { isDefaultRecipeImage } from '@/lib/recipe-image';
import { RecipePlaceholder } from './RecipePlaceholder';

interface DishImageProps {
  /** Source URL (Supabase storage or any other host). Empty/null renders the placeholder only. */
  url: string | null | undefined;
  /** Blurhash for the source image. Generated offline by scripts/generate-blurhashes.ts. */
  blurhash?: string;
  /** Width the image actually renders at, in points. Snapped to the shared ladder. */
  width: number;
  /** Style for the image itself. Should normally fill its container. */
  style?: StyleProp<ImageStyle>;
  /** Defaults to 'cover'. */
  contentFit?: ImageContentFit;
  /** Cross-fade duration in ms when the image swaps in. Defaults to 250. */
  transition?: number;
  /**
   * Stable identity for the item this image belongs to (e.g. a recipe id).
   * Pass it whenever the wrapper sits inside a list: it tells expo-image to
   * clear the previous bitmap when a cell is recycled, instead of showing the
   * old photo until the new one decodes. Also seeds the tone tile.
   */
  recyclingKey?: string;
  /** Raise for above-the-fold heroes so they win the download queue. */
  priority?: 'low' | 'normal' | 'high';
  /**
   * When the slot falls back to the branded placeholder (no real photo yet),
   * also show its "Update recipe image / Personalise your recipe" caption.
   * Only for large surfaces without their own update-image pill — i.e. the
   * full-screen viewer. Grid cards and the detail hero leave it off.
   */
  placeholderLabel?: boolean;
  /**
   * When set, the branded placeholder (shown when there's no real photo) becomes
   * tappable, letting the user add a photo in place. Only wire this on surfaces
   * with a known recipe + update path (the detail hero) — not on grid cards,
   * where the tap already navigates to the recipe.
   */
  onAddPhoto?: () => void;
}

// Warm neutral tones drawn from the app's cream/sage palette. Deliberately low
// contrast: this is a resting state behind a photo, not a UI surface. A grid of
// these reads as "loading, on purpose" rather than "broken".
const TONE_TILES = [
  '#F4F0E8', // cream (the historical value — keeps existing screens familiar)
  '#EFEAE0',
  '#EAE6DA',
  '#F1EDE3',
  '#ECE9DE',
  '#F2EDE1',
] as const;

// Same cheap string hash used for the Explore masonry heights. Deterministic,
// so a given recipe always gets the same tone — no flicker between renders and
// no reshuffling when a list re-orders.
function toneFor(seed: string | undefined): string {
  if (!seed) return TONE_TILES[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return TONE_TILES[Math.abs(h) % TONE_TILES.length];
}

export function DishImage({
  url,
  blurhash,
  width,
  style,
  contentFit = 'cover',
  transition = 250,
  recyclingKey,
  priority = 'normal',
  placeholderLabel = false,
  onAddPhoto,
}: DishImageProps) {
  // Empty URL or the shared stock photo == "no real image yet". Short-circuit
  // to the branded line-art placeholder and never fetch the old salad bowl.
  const isPlaceholder = isDefaultRecipeImage(url);
  const sized = url ? recipeImageUrl(url, { width }) : undefined;
  const tone = useMemo(() => toneFor(recyclingKey ?? url ?? undefined), [recyclingKey, url]);

  // Placeholder chain. A pre-computed hash wins because it costs no request and
  // paints in the first frame; the LQIP is the fallback for anything not in a
  // data file we generate (user uploads, Pexels results, AI-generated photos).
  const placeholder = useMemo(() => {
    if (blurhash) return { blurhash };
    const preview = previewImageUrl(url);
    return preview ? { uri: preview } : undefined;
  }, [blurhash, url]);

  // Bounded retry. `failed` means even the raw URL didn't load, so we stop and
  // show the tone tile instead of looping. Both reset when the URL changes, so
  // a recycled list cell evaluates a fresh URL rather than inheriting a stale
  // failure from whatever item previously occupied it.
  const [useRawFallback, setUseRawFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setUseRawFallback(false);
    setFailed(false);
  }, [url, sized]);

  const handleError = useCallback(() => {
    if (!useRawFallback && sized && sized !== url) {
      // The resize endpoint failed (transform add-on disabled, or a transient
      // 4xx on the render route). Retry once against the raw object URL, which
      // is always served while the bucket is public.
      // Log the host and path only — never the full signed/query URL.
      console.warn(
        '[DishImage] sized URL failed, retrying raw:',
        (() => {
          try {
            const u = new URL(url!);
            return `${u.host}${u.pathname}`;
          } catch {
            return 'unparseable url';
          }
        })(),
      );
      setUseRawFallback(true);
      return;
    }
    // Raw failed too (or there was nothing to fall back to) — stop here.
    setFailed(true);
  }, [useRawFallback, sized, url]);

  // No real photo (empty / stock placeholder), or every load attempt failed:
  // the branded line-art placeholder IS the final state. Same dimensions and
  // layout as the image, so the card never resizes.
  if (isPlaceholder || !url || !sized || failed) {
    return <RecipePlaceholder style={style} showLabel={placeholderLabel} onPress={onAddPhoto} />;
  }

  const sourceUri = useRawFallback ? url : sized;

  return (
    <Image
      source={{ uri: sourceUri }}
      placeholder={placeholder}
      // Must match contentFit — expo-image's docs call out that a mismatch
      // between placeholder and final scaling causes a visible flicker as the
      // two swap, which is exactly what we're trying to eliminate.
      placeholderContentFit={contentFit}
      contentFit={contentFit}
      transition={transition}
      // expo-image defaults to `cachePolicy: 'disk'`, which re-reads and
      // re-decodes the file every time the image scrolls back into view.
      // 'memory-disk' keeps the decoded bitmap around, so a second look is
      // instant instead of a fresh decode.
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey}
      priority={priority}
      onError={handleError}
      // Tone tile sits behind everything via the style background, so there is
      // never a transparent/empty frame — not before the placeholder resolves,
      // and not during the cross-fade.
      style={[{ backgroundColor: tone }, style as object]}
    />
  );
}
