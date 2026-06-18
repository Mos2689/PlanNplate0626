// Image prefetch helpers — Tier-1 only.
//
// On first install, the first time the user navigates to the home tab or the
// Curated Meal Plans listing, the 5 plan hero images need to be fetched from
// Supabase. With the Layer-1 transform helper that's ~30 KB each (~150 KB
// total). Firing the prefetch from StoreHydration once the app is ready means
// by the time the user gets to those surfaces, expo-image's on-disk cache is
// already populated and the heroes render instantly.
//
// Why only Tier-1 (heroes, not per-recipe images): with Layer-1 optimization
// each per-recipe image is small enough that expo-image's natural
// prefetch-on-mount plus the blurhash placeholder is smooth enough. If
// telemetry later shows the plan-detail open still feels slow we can add a
// per-plan Tier-2 prefetch keyed on the tap-time intent.

import { Image } from 'expo-image';
import { CURATED_MEAL_PLANS } from './curated-meal-plans';
import { optimizedImageUrl } from './supabase-image';

// Idempotency guard. Reset only on a full JS bundle reload.
let didPrefetchHeroes = false;

/**
 * Warm the 5 curated-plan hero images. Safe to call multiple times — only
 * the first invocation does work. Errors (offline, transient network) are
 * swallowed so a failed prefetch never surfaces to the user; expo-image
 * will retry the request when the surface actually renders.
 */
export async function prefetchPlanHeroImages(): Promise<void> {
  if (didPrefetchHeroes) return;
  didPrefetchHeroes = true;

  try {
    await Promise.all(
      CURATED_MEAL_PLANS.map((plan) => {
        if (!plan.imageUrl) return Promise.resolve();
        // 1000-wide variant covers the featured 4:3 hero (largest surface);
        // smaller surfaces will hit the same cache key and reuse the bytes.
        // Actually — expo-image caches by URL, and other call sites request
        // width=800. We prefetch BOTH so both cache keys land warm.
        const variants = [
          optimizedImageUrl(plan.imageUrl, { width: 1000 }),
          optimizedImageUrl(plan.imageUrl, { width: 800 }),
        ];
        return Promise.all(
          variants.map((url) => Image.prefetch(url).catch(() => undefined)),
        );
      }),
    );
  } catch {
    // Any aggregate rejection is non-fatal — surface will load on demand.
  }
}
