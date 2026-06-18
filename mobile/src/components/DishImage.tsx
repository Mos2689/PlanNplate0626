// DishImage — the single image wrapper used by every curated-plan surface.
//
// What it does:
//   1. Rewrites the source URL through Supabase's transform endpoint to a
//      resized WebP (Layer 1). Cuts payloads from ~1 MB PNG to ~30 KB WebP.
//      If that endpoint isn't available on the Supabase project (the Image
//      Transformations add-on must be enabled in Settings → Storage), the
//      onError handler transparently falls back to the raw object URL so the
//      blurhash placeholder doesn't stick.
//   2. Renders a blurhash preview instantly via expo-image's native
//      `placeholder` prop (Layer 2). When `blurhash` is undefined the wrapper
//      gracefully falls back to a soft cream tile so first-launch (before the
//      offline blurhash script has run) still beats the flat #F4F0E8 block.
//   3. Keeps the 250 ms cross-fade transition consistent across surfaces.
//
// Designed as a thin drop-in replacement for the bare
//   <View bg='#F4F0E8'><Image source={{ uri }} contentFit='cover' /></View>
// pattern that was duplicated across curated screens.

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { ImageStyle, StyleProp } from 'react-native';
import { Image, type ImageContentFit } from 'expo-image';
import { optimizedImageUrl } from '@/lib/supabase-image';

interface DishImageProps {
  /** Source URL (Supabase storage or any other host). Empty/null renders the placeholder only. */
  url: string | null | undefined;
  /** Blurhash for the source image. Generated offline by scripts/generate-blurhashes.ts. */
  blurhash?: string;
  /** Logical width of the rendered slot. Used to size the CDN transform; pass roughly 2× the displayed width. */
  width: number;
  /** Style for the image itself. Should normally fill its container. */
  style?: StyleProp<ImageStyle>;
  /** Defaults to 'cover'. */
  contentFit?: ImageContentFit;
  /** Cross-fade duration in ms when the image swaps in. Defaults to 250. */
  transition?: number;
}

// Cream fallback used when no blurhash is available yet. Matches the historical
// bare-View background so visually nothing regresses if the offline blurhash
// pass hasn't been run for a particular image.
const CREAM_FALLBACK = '#F4F0E8';

export function DishImage({
  url,
  blurhash,
  width,
  style,
  contentFit = 'cover',
  transition = 250,
}: DishImageProps) {
  const transformed = url ? optimizedImageUrl(url, { width }) : undefined;

  // Tracks whether the transformed URL failed to load. When true we re-render
  // pointing `source` at the raw URL instead. Reset when the input `url` (or
  // its transform) changes so a recycled list cell evaluates a fresh URL from
  // scratch instead of inheriting a stale failure.
  const [useRawFallback, setUseRawFallback] = useState(false);
  useEffect(() => {
    setUseRawFallback(false);
  }, [url, transformed]);

  // No URL at all — render the cream tile only. Avoids passing a falsy source
  // into expo-image which would log a warning.
  if (!url || !transformed) {
    return <View style={[{ backgroundColor: CREAM_FALLBACK }, style as object]} />;
  }

  // Skip the transform entirely once we know it failed for this URL. If the
  // transformed string is identical to the raw URL (non-Supabase host), the
  // fallback is a no-op — we'd hit the same URL again.
  const sourceUri = useRawFallback ? url : transformed;

  return (
    <Image
      source={{ uri: sourceUri }}
      placeholder={blurhash ? { blurhash } : undefined}
      placeholderContentFit="cover"
      contentFit={contentFit}
      transition={transition}
      onError={() => {
        // The transform endpoint failed (typically because Supabase Image
        // Transformations isn't enabled on the project, or a transient 4xx
        // on the render route). Swap to the raw object URL — that's always
        // served as long as the bucket is public. Without this swap, the
        // blurhash placeholder would stay up forever.
        if (!useRawFallback && transformed !== url) {
          console.warn(
            '[DishImage] transformed URL failed — falling back to raw URL:',
            url,
          );
          setUseRawFallback(true);
        }
      }}
      // Cream tile sits behind the placeholder via the style background — when
      // there's no blurhash yet, this is what the user sees until the image
      // streams in. Once a blurhash is present, expo-image paints over this.
      style={[{ backgroundColor: CREAM_FALLBACK }, style as object]}
    />
  );
}
