// useRecipeFeatureGate — one-free-use paywall gate for the recipe-page
// features (Add recipe / Import recipe / Vibe cooking).
//
// Each feature gets ONE free use for non-premium users; the SECOND time the
// screen is opened it fires the paywall and backs out. Premium / in-trial
// users are never gated and never counted. This is independent of the
// meal-planning PnP/grocery signup gate and of the other recipe features.
//
// Called as the first hook in each feature screen:
//   • `blocked` true  → render `null` (the paywall is already showing).
//   • `accessGranted` → this render is a permitted use (premium OR a free use
//     still available), so the screen should SUPPRESS its own premium
//     "subscribe" overlay and let the user actually use the feature.
//   • `markUsed()` → the screen calls this on a SUCCESSFUL use (recipe actually
//     added / imported / generated). That's what spends the one free use — just
//     opening and backing out does NOT count. Once spent, the next OPEN gates.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useMealPlanStore } from '@/lib/store';
import { useAuthStore } from '@/lib/auth-store';
import {
  useHasPremiumAccess,
  useSubscriptionLoading,
  useSubscriptionStore,
  type PaywallTrigger,
} from '@/lib/subscription-store';

type RecipeFeature = 'add' | 'import' | 'vibe';

const usedField = (kind: RecipeFeature) =>
  kind === 'add'
    ? ('freeAddRecipeUsed' as const)
    : kind === 'import'
      ? ('freeImportRecipeUsed' as const)
      : ('freeVibeUsed' as const);

export function useRecipeFeatureGate(
  kind: RecipeFeature,
  trigger: PaywallTrigger,
): { blocked: boolean; accessGranted: boolean; markUsed: () => void } {
  const router = useRouter();
  const hasPremiumAccess = useHasPremiumAccess();
  const subscriptionLoading = useSubscriptionLoading();
  // Anonymous guests are routed to signup (the paywall fires automatically
  // after a successful signup); registered non-premium users get the paywall
  // directly.
  const isAnonymous = useAuthStore((s) => s.isAnonymous);
  const storeHydrated = useMealPlanStore((s) => s._hasHydrated);
  const markRecipeFeatureUsed = useMealPlanStore((s) => s.markRecipeFeatureUsed);
  const openPaywallSheet = useSubscriptionStore((s) => s.openPaywallSheet);

  // Snapshot the count synchronously at mount so the very first render already
  // knows whether a free use is available (avoids a flash of the premium
  // overlay). The free use is SPENT on success via markUsed(), not on open.
  const mountUsed = useMealPlanStore.getState().preferences[usedField(kind)] ?? 0;

  const markedRef = useRef(false);
  const [blocked, setBlocked] = useState(false);
  const [accessGranted, setAccessGranted] = useState(
    hasPremiumAccess || mountUsed < 1,
  );

  useEffect(() => {
    if (!storeHydrated) return;
    // Don't decide while subscription state is still resolving — the
    // `hasPremiumAccess=false` default during cold start would otherwise
    // boot a paying user back to home.
    if (subscriptionLoading) return;

    // Premium / in-trial: unlimited access, nothing to count.
    if (hasPremiumAccess) {
      setBlocked(false);
      setAccessGranted(true);
      return;
    }

    const used = useMealPlanStore.getState().preferences[usedField(kind)] ?? 0;
    if (used >= 1) {
      // Free use already spent → leave the feature screen and gate. An
      // anonymous guest is sent to signup first (the paywall fires after a
      // successful signup); a registered non-premium user gets the paywall.
      setAccessGranted(false);
      setBlocked(true);
      router.back();
      if (isAnonymous) {
        router.push('/signup');
      } else {
        openPaywallSheet(trigger);
      }
    } else {
      // Free use still available — let them in (counted only on success).
      setAccessGranted(true);
    }
  }, [storeHydrated, subscriptionLoading, hasPremiumAccess, isAnonymous, kind, trigger, openPaywallSheet, router]);

  // Spend the one free use — called by the screen when the feature SUCCEEDS.
  // No-op for premium users and idempotent within a session.
  const markUsed = useCallback(() => {
    if (markedRef.current || hasPremiumAccess) return;
    markedRef.current = true;
    markRecipeFeatureUsed(kind);
  }, [hasPremiumAccess, markRecipeFeatureUsed, kind]);

  return { blocked, accessGranted, markUsed };
}
