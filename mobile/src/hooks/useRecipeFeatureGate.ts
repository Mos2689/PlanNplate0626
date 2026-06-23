// useRecipeFeatureGate — monthly-limit paywall gate for the recipe-page
// features (Add recipe / Import recipe / Vibe cooking).
//
// Non-premium users get a fixed number of uses PER CALENDAR MONTH (see
// MONTHLY_FEATURE_LIMITS — 10/mo for add & import, 5/mo for vibe). Opening the
// screen once the month's allowance is spent fires the paywall and backs out.
// Premium users are never gated and never counted. Independent of the
// meal-planning signup gate and of the other recipe features.
//
// Called as the first hook in each feature screen:
//   • `blocked` true  → render `null` (the paywall is already showing).
//   • `accessGranted` → this render is a permitted use (premium OR allowance
//     remaining this month), so the screen should SUPPRESS its own premium
//     "subscribe" overlay and let the user actually use the feature.
//   • `markUsed()` → the screen calls this on a SUCCESSFUL use (recipe actually
//     added / imported / generated). That's what spends one monthly use — just
//     opening and backing out does NOT count. Once the month's allowance is
//     spent, the next OPEN gates.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useMealPlanStore, MONTHLY_FEATURE_LIMITS, type MonthlyFeature } from '@/lib/store';
import { useAuthStore } from '@/lib/auth-store';
import {
  useHasPremiumAccess,
  useSubscriptionLoading,
  useSubscriptionStore,
  type PaywallTrigger,
} from '@/lib/subscription-store';

type RecipeFeature = 'add' | 'import' | 'vibe';

// Map the screen-level feature key to the monthly-usage feature key.
const monthlyKey = (kind: RecipeFeature): MonthlyFeature =>
  kind === 'add' ? 'addRecipe' : kind === 'import' ? 'importRecipe' : 'vibe';

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
  const recordMonthlyFeatureUse = useMealPlanStore((s) => s.recordMonthlyFeatureUse);
  const openPaywallSheet = useSubscriptionStore((s) => s.openPaywallSheet);

  // ── AUTH-LAST signup gate ──
  // Once an anonymous guest has spent BOTH their free plan build and free
  // grocery build, every subsequent gated action (this feature included)
  // routes them to signup before anything else.
  const freePlanBuildsUsed = useMealPlanStore((s) => s.preferences.freePlanBuildsUsed ?? 0);
  const freeGroceryBuildsUsed = useMealPlanStore((s) => s.preferences.freeGroceryBuildsUsed ?? 0);
  const shouldGateSignup =
    isAnonymous && freePlanBuildsUsed >= 1 && freeGroceryBuildsUsed >= 1;

  const feature = monthlyKey(kind);
  const limit = MONTHLY_FEATURE_LIMITS[feature];

  // Snapshot this month's count synchronously at mount so the first render
  // already knows whether an allowance is available (avoids a flash of the
  // premium overlay). A use is SPENT on success via markUsed(), not on open.
  const mountCount = useMealPlanStore.getState().getMonthlyFeatureCount(feature);

  const markedRef = useRef(false);
  const [blocked, setBlocked] = useState(shouldGateSignup);
  const [accessGranted, setAccessGranted] = useState(
    !shouldGateSignup && (hasPremiumAccess || mountCount < limit),
  );

  useEffect(() => {
    if (!storeHydrated) return;

    // Signup gate takes precedence — an anonymous guest who's used their free
    // plan + grocery build is sent to signup on any further gated action.
    if (shouldGateSignup) {
      setAccessGranted(false);
      setBlocked(true);
      router.back();
      router.push('/signup');
      return;
    }

    // Don't decide while subscription state is still resolving — the
    // `hasPremiumAccess=false` default during cold start would otherwise
    // boot a paying user back to home.
    if (subscriptionLoading) return;

    // Premium: unlimited access, nothing to count.
    if (hasPremiumAccess) {
      setBlocked(false);
      setAccessGranted(true);
      return;
    }

    const used = useMealPlanStore.getState().getMonthlyFeatureCount(feature);
    if (used >= limit) {
      // Month's allowance spent → leave the feature screen and gate. An
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
      // Allowance remaining — let them in (counted only on success).
      setAccessGranted(true);
    }
  }, [storeHydrated, subscriptionLoading, hasPremiumAccess, isAnonymous, shouldGateSignup, feature, limit, trigger, openPaywallSheet, router]);

  // Spend one monthly use — called by the screen when the feature SUCCEEDS.
  // No-op for premium users and idempotent within a session.
  const markUsed = useCallback(() => {
    if (markedRef.current || hasPremiumAccess) return;
    markedRef.current = true;
    recordMonthlyFeatureUse(feature);
  }, [hasPremiumAccess, recordMonthlyFeatureUse, feature]);

  return { blocked, accessGranted, markUsed };
}
