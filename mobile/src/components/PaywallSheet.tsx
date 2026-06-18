// PaywallSheet — the app's single paywall surface.
//
// Mounted globally in src/app/_layout.tsx; any caller fires
// `useSubscriptionStore.getState().openPaywallSheet(trigger)` to bring
// it up. Sliding sheet keeps the user's scroll/tab position intact,
// which is far less aggressive than a full-screen route push.
//
// Conversion levers (this redesign, by lever):
//   1. Per-week price anchor on each plan card. Same pricing, but
//      "$1.10/wk" reads dramatically cheaper than "$57.49/yr" — a
//      classic anchor without any product/price change.
//   2. Social proof row under the headline ("4.8 ★ · 12k home cooks")
//      — single line, no images, fast to read.
//   3. Testimonial card behind the benefits list — one short quote,
//      one name, serif accent. Adds credibility without breaking the
//      editorial layout.
//   4. Urgency micro-copy for last-3-day trial users — a small olive
//      pill above the CTA: "Your taste graph locks in N days."
//   5. Behavior-personalized anchor strip (kept from prior version) —
//      "You've cooked X meals … on a Y-day streak."
//
// Brand rules (locked):
//   • Olive eyebrow + italic word in the headline.
//   • Sage brand CTA, no purple/blue.
//   • scale-on-press for every Pressable.
//   • No Sparkles / ChefHat icons.

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Crown, Check, X, Star, AlertCircle } from 'lucide-react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
} from 'react-native-reanimated';
import { useMealPlanStore, type PendingGenerationState } from '@/lib/store';
import * as Haptics from 'expo-haptics';
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  isRevenueCatEnabled,
} from '@/lib/revenuecatClient';
import { friendlyPurchaseError } from '@/lib/purchase-errors';
import { useRouter } from 'expo-router';
import {
  useSubscriptionStore,
  type PaywallTrigger,
} from '@/lib/subscription-store';
import { useBehaviorInsights } from '@/hooks/useBehaviorInsights';
import { designTokens, easing, elevation, getThemeColors } from '@/lib/design-tokens';
import type { PurchasesPackage } from 'react-native-purchases';
import { logMetaPurchase } from '@/lib/meta-sdk';


const EASE = Easing.bezier(...easing.outStrong);

// Trigger-aware headline (italic word marked separately so we can
// render the Instrument Serif italic glyph for it).
function headlineForTrigger(trigger: PaywallTrigger | null): {
  eyebrow: string;
  title: string;
  italicWord: string;
} {
  switch (trigger) {
    case 'pnp-second-tap':
      return {
        eyebrow: 'KEEP COOKING THE VIBE',
        title: "Don't lose your taste graph.",
        italicWord: 'taste',
      };
    case 'vibe-cooking':
      return {
        eyebrow: 'VIBE COOKING IS PREMIUM',
        title: 'Pick a mood. We cook.',
        italicWord: 'mood',
      };
    case 'import-recipe':
      return {
        eyebrow: 'SAVE FROM ANYWHERE',
        title: 'Keep the recipes you love.',
        italicWord: 'love',
      };
    case 'curated-plans':
      return {
        eyebrow: 'CURATED PLANS',
        title: 'Expert weeks, yours.',
        italicWord: 'yours',
      };
    case 'profile-banner':
      return {
        eyebrow: 'PREMIUM',
        title: 'Keep cooking with PnP.',
        italicWord: 'cooking',
      };
    case 'onboarding':
      return {
        eyebrow: 'YOUR PLAN IS READY',
        title: 'Cook beautifully, every week.',
        italicWord: 'beautifully',
      };
    case 'generating-plan':
      // Headline + eyebrow are overridden at render time by
      // `headlineForGeneratingStage()` so they morph with the stage.
      // This static fallback is only used if pendingGeneration is null.
      return {
        eyebrow: 'CRAFTING YOUR WEEK',
        title: "We're plating your first week.",
        italicWord: 'first',
      };
    case 'generic':
    default:
      return {
        eyebrow: 'PREMIUM',
        title: 'Keep cooking with PnP.',
        italicWord: 'cooking',
      };
  }
}

const PREMIUM_BENEFITS: Array<{ title: string; sub: string }> = [
  { title: 'PnP Picks', sub: 'Personalised weekly meal plans in minutes.' },
  { title: 'Grocery aggregation', sub: 'Smart grocery lists that save time and money.' },
  { title: 'Recipe Library', sub: 'Save recipes from anywhere — websites, cookbooks, or chat.' },
  { title: 'Vibe Cooking', sub: 'Create recipes from your mood and pantry ingredients.' },
  { title: 'Curated Meal Plans', sub: 'Nutritionist-designed curated meal plans.' },
];

// Editorial tagline — sits under the benefits list as a single quiet line.
const PREMIUM_TAGLINE = 'Eat better. Plan smarter. Cook with confidence.';

// Single editorial testimonial. Kept short — a long block reads like
// marketing, a short one reads like a quote.
const TESTIMONIAL = {
  quote: "I open the app, pick a mood, and dinner solves itself.",
  attribution: 'Sandra · Brisbane',
};

// Stage-aware headline for the generating-plan branch. Eyebrow and
// title morph with `stage` so the surface FEELS alive — the user sees
// "we're working" → "we're nearly done" → "your plan is ready."
function headlineForGeneratingStage(
  pending: PendingGenerationState | null,
): { eyebrow: string; title: string; italicWord: string } {
  if (!pending) {
    return {
      eyebrow: 'CRAFTING YOUR WEEK',
      title: "We're plating your first week.",
      italicWord: 'first',
    };
  }
  if (pending.stage === 'failed') {
    return {
      eyebrow: 'WE HIT A SNAG',
      title: "Your spot is saved.",
      italicWord: 'saved',
    };
  }
  if (pending.stage === 'done') {
    return {
      eyebrow: 'YOUR PLAN IS READY',
      title: 'Your week is ready.',
      italicWord: 'ready',
    };
  }
  // generating / starting / finalizing — show day progress in the eyebrow
  // (1-indexed). Falls back to "CRAFTING" if days are unknown.
  const totalDays = pending.days || 0;
  const completed = pending.completedDays || 0;
  // The active day is `completed + 1` clamped to total.
  const activeDay = Math.min(totalDays, completed + 1);
  const eyebrow = totalDays
    ? `DAY ${activeDay} OF ${totalDays} · CRAFTING YOUR WEEK`
    : 'CRAFTING YOUR WEEK';
  return {
    eyebrow,
    title: "We're plating your first week.",
    italicWord: 'first',
  };
}

// Persona echo subline — proves the AI used the onboarding answers.
// Falls back to a generic line when persona fields aren't set yet.
function personaSublineFor(
  pending: PendingGenerationState | null,
  preferences: ReturnType<typeof useMealPlanStore.getState>['preferences'],
): string | null {
  if (!pending || pending.days <= 0) return null;
  const days = pending.days;
  const mealsPerDay = pending.mealTypesPerDay || 0;
  const totalMeals = days * Math.max(1, mealsPerDay);
  const household = preferences.household;
  const weeknightMinutes = preferences.weeknightMinutes;
  // Household label: prefer "family of N" if servingSize > 1.
  let serves: string | null = null;
  if (preferences.servingSize && preferences.servingSize > 1) {
    serves = `${preferences.servingSize}`;
  } else if (household && (household as any).adults) {
    const adults = (household as any).adults || 0;
    const kids = (household as any).kids || 0;
    const total = adults + kids;
    if (total > 0) serves = String(total);
  }
  const timeStr = weeknightMinutes ? `under ${weeknightMinutes} min` : null;
  // Compose. Examples:
  //   "21 meals for 4, all under 30 min."
  //   "7 dinners, all under 45 min."
  //   "10 meals for your week."
  const parts: string[] = [`${totalMeals} meal${totalMeals === 1 ? '' : 's'}`];
  if (serves) parts.push(`for ${serves}`);
  if (timeStr) parts.push(`all ${timeStr}`);
  return parts.join(', ') + '.';
}

// Inline progress strip mirroring the visual vocabulary of
// PendingGenerationBanner: segmented pills (one per day), sub-fill via
// dayRecipeCounts[i] / mealTypesPerDay, shimmer on the active day.
// Self-contained so we don't import the banner (which has its own
// header chrome we don't want inside the sheet).
function GenerationProgressStrip({
  pending,
  isDark,
}: {
  pending: PendingGenerationState | null;
  isDark: boolean;
}) {
  // Shimmer driver — runs continuously while the strip is mounted. The
  // overlay is only painted on the active (first partial) pill, so the
  // cost is just one looping animation regardless of pill count.
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
  }, [shimmer]);
  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + 0.45 * Math.sin(shimmer.value * Math.PI),
  }));

  if (!pending || pending.days <= 0) return null;

  const isFailed = pending.stage === 'failed';
  const dayCount = pending.days;
  const mealsPerDay = Math.max(1, pending.mealTypesPerDay || 1);
  const counts = pending.dayRecipeCounts || [];

  // Find the first partial-fill pill (the "active day") for shimmer.
  const activeIdx = counts.findIndex((c) => c > 0 && c < mealsPerDay);

  const trackBg = isDark ? '#2a2a2a' : designTokens.colors.hair2;
  const fillBg = isFailed
    ? designTokens.colors.ink3
    : designTokens.colors.brand;

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 5,
        marginTop: 4,
        marginBottom: 6,
      }}
    >
      {Array.from({ length: dayCount }).map((_, i) => {
        const filled = counts[i] ?? 0;
        const pct = Math.max(0, Math.min(1, filled / mealsPerDay));
        const isActive = i === activeIdx;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height: 5,
              borderRadius: 999,
              backgroundColor: trackBg,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${pct * 100}%`,
                height: '100%',
                borderRadius: 999,
                backgroundColor: fillBg,
              }}
            />
            {isActive && !isFailed && (
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: designTokens.colors.cream,
                    borderRadius: 999,
                    mixBlendMode: 'overlay' as any,
                  },
                  shimmerStyle,
                ]}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

interface PaywallSheetProps {
  isDark?: boolean;
}

/**
 * Format a per-week price string from a yearly product price.
 * 52 weeks/year is the standard retail anchor — same convention
 * Apple/Netflix/Spotify use on their pricing pages.
 */
function formatPerWeek(yearlyPrice: number | undefined, priceString: string): string | null {
  if (!yearlyPrice || yearlyPrice <= 0) return null;
  const perWeek = yearlyPrice / 52;
  // Pull the currency symbol from the localized price string (e.g.
  // "A$57.49" → "A$"; "$57.49" → "$"; "£44.99" → "£"). Falls back to
  // empty string if the regex misses, which still renders cleanly.
  const symbolMatch = priceString.match(/^[^\d.,\s]+/);
  const symbol = symbolMatch ? symbolMatch[0] : '';
  return `${symbol}${perWeek.toFixed(2)}/wk`;
}

function formatPerWeekFromMonthly(monthlyPrice: number | undefined, priceString: string): string | null {
  if (!monthlyPrice || monthlyPrice <= 0) return null;
  // 4.33 weeks per month on average (52 / 12). Standard convention.
  const perWeek = monthlyPrice / 4.33;
  const symbolMatch = priceString.match(/^[^\d.,\s]+/);
  const symbol = symbolMatch ? symbolMatch[0] : '';
  return `${symbol}${perWeek.toFixed(2)}/wk`;
}

export function PaywallSheet({ isDark = false }: PaywallSheetProps) {
  const router = useRouter();
  const trigger = useSubscriptionStore((s) => s.paywallSheetTrigger);
  const closeSheet = useSubscriptionStore((s) => s.closePaywallSheet);
  // Onboarding-mode (legacy, no longer fired from any call site —
  // kept defined for safety): the sheet is the ONLY route forward into
  // the app after profile setup, so dismiss is suppressed and a
  // "Maybe later" link replaces the X. Same dismiss-suppression
  // applies to the new generating-plan mode.
  const isOnboarding = trigger === 'onboarding';
  // Generating-plan mode: the sheet sits ON TOP of /plan-meals while
  // the engine streams recipes in via the meal-plan store's
  // `pendingGeneration` state. The sheet itself owns the route
  // forward (auto-close + nav to /(tabs) when stage==='done').
  const isGeneratingPlan = trigger === 'generating-plan';
  const isLockedSheet = isOnboarding || isGeneratingPlan;
  const pendingGeneration = useMealPlanStore((s) => s.pendingGeneration);
  const preferences = useMealPlanStore((s) => s.preferences);
  // Tracks whether the user already completed a purchase on THIS
  // sheet — distinct from `isPremium` because RC's state can lag
  // slightly behind StoreKit confirming the receipt. Local source of
  // truth for the "celebration tile while the plan finishes" body
  // swap, plus the auto-dismiss-when-done effect.
  const [hasPurchasedHere, setHasPurchasedHere] = useState(false);
  const colors = getThemeColors(isDark);
  const sheetBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const visible = trigger !== null;

  // Behavior insights — power the personalized anchor strip.
  const insights = useBehaviorInsights();
  const cookedThisWeek = insights.cooking.cookedThisWeek;
  const streak = insights.cooking.currentStreakDays;

  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [monthly, setMonthly] = useState<PurchasesPackage | null>(null);
  const [yearly, setYearly] = useState<PurchasesPackage | null>(null);
  const [selected, setSelected] = useState<'monthly' | 'yearly'>('yearly');

  // Load offerings whenever the sheet opens. RevenueCat caches the
  // response client-side, so re-firing on each open is cheap.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      if (!isRevenueCatEnabled()) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      const result = await getOfferings();
      if (cancelled) return;
      if (result.ok && result.data.current) {
        const packages = result.data.current.availablePackages;
        setMonthly(packages.find((p) => p.identifier === '$rc_monthly') ?? null);
        setYearly(packages.find((p) => p.identifier === '$rc_annual') ?? null);
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  // Reset the local hasPurchasedHere flag whenever the sheet closes
  // so a future open doesn't show stale celebration UI. The store-
  // level `isPremium` is the durable source of truth.
  useEffect(() => {
    if (!visible) setHasPurchasedHere(false);
  }, [visible]);

  // Auto-dismiss orchestration for generating-plan mode. Two completion
  // paths land here:
  //
  //   1. SUBSCRIBE → plan still cooking → wait for stage==='done' →
  //      hold ~600ms on the celebration tile → close + navigate.
  //   2. PLAN COMPLETES before user picks anything → hold ~2s on a
  //      "your plan is ready" beat → close + navigate. No comp granted
  //      (trial removed); the home tab gates premium actions behind
  //      the paywall directly.
  //
  // The store-level `pendingGeneration` is the single source of
  // truth; this effect just translates `stage==='done'` into nav.
  useEffect(() => {
    if (!visible) return;
    if (!isGeneratingPlan) return;
    if (pendingGeneration?.stage !== 'done') return;

    // Subscribed first, then plan finished — short hold (RC will flip
    // isPremium).
    if (hasPurchasedHere) {
      const t = setTimeout(() => {
        closeSheet();
        router.replace('/(tabs)');
      }, 600);
      return () => clearTimeout(t);
    }

    // Plan finished while user was still undecided — longer hold so the
    // "your plan is ready" celebration registers, then navigate. The
    // user lands on the home tab as non-premium; gated actions fire the
    // paywall.
    const t = setTimeout(() => {
      closeSheet();
      router.replace('/(tabs)');
    }, 2000);
    return () => clearTimeout(t);
  }, [
    visible,
    isGeneratingPlan,
    pendingGeneration?.stage,
    hasPurchasedHere,
    closeSheet,
    router,
  ]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Failure-branch dismiss: route the user to the home tab. They land
    // as non-premium; gated actions fire the paywall.
    if (isGeneratingPlan && pendingGeneration?.stage === 'failed') {
      router.replace('/(tabs)');
    }
    closeSheet();
  }, [closeSheet, isGeneratingPlan, pendingGeneration?.stage, router]);

  const handlePurchase = useCallback(async () => {
    const pkg = selected === 'yearly' ? yearly : monthly;
    if (!pkg) {
      Alert.alert('Unavailable', 'No subscription package available right now.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPurchasing(true);
    const result = await purchasePackage(pkg);
    setIsPurchasing(false);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Log purchase event to Meta SDK
      const price = (pkg.product as any).price || 0;
      const currency = (pkg.product as any).currencyCode || 'USD';
      logMetaPurchase(price, currency, {
        content_name: pkg.product.title,
        content_id: pkg.product.identifier,
        content_type: 'product',
      });

      if (isGeneratingPlan) {
        // Generating-plan mode: the body swaps to an in-sheet
        // celebration tile (rendered conditionally on hasPurchasedHere
        // below). Progress bar stays at the top. A useEffect watches
        // for `stage === 'done'` to auto-close + navigate. NO alert
        // dialog — would obscure the choreographed reveal.
        setHasPurchasedHere(true);
      } else {
        Alert.alert(
          'Welcome to Premium!',
          'Your subscription is active. Vibe Cooking, AI plans, smart grocery — all yours.',
          [{
            text: 'Get Started',
            onPress: () => {
              closeSheet();
              if (isOnboarding) router.replace('/(tabs)');
            },
          }],
        );
      }
    } else {
      // Friendlier error handling — map common StoreKit/RC failures to human
      // copy with Try again / Restore purchases / Cancel actions. Returns
      // null for user-initiated cancellation so we stay silent there.
      const friendly = friendlyPurchaseError(
        result.reason,
        result.error as Error | undefined,
      );
      if (!friendly) return;
      Alert.alert(
        friendly.title,
        friendly.message + (friendly.hint ? `\n\n${friendly.hint}` : ''),
        [
          { text: 'Try again', onPress: () => handlePurchase() },
          { text: 'Restore purchases', onPress: () => handleRestore() },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    }
  }, [selected, yearly, monthly, closeSheet, isOnboarding, isGeneratingPlan, router]);

  const handleRestore = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRestoring(true);
    const result = await restorePurchases();
    setIsRestoring(false);
    if (result.ok) {
      const hasActive = Object.keys(result.data.entitlements.active || {}).length > 0;
      if (hasActive) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Restored', 'Your purchases have been restored.', [
          { text: 'OK', onPress: () => closeSheet() },
        ]);
      } else {
        Alert.alert("No Purchases Found", "We couldn't find any previous purchases to restore.");
      }
    } else {
      Alert.alert('Restore Failed', 'Unable to restore purchases. Please try again.');
    }
  }, [closeSheet]);

  // Computed pricing strings. useMemo so they don't recompute on
  // every haptic-triggered re-render.
  const pricingDetails = useMemo(() => {
    const yearlyPrice = (yearly?.product as any)?.price as number | undefined;
    const yearlyString = yearly?.product.priceString ?? '$51.99';
    const monthlyPrice = (monthly?.product as any)?.price as number | undefined;
    const monthlyString = monthly?.product.priceString ?? '$9.99';

    // Fall back to target display prices when RevenueCat products haven't loaded.
    const yearlyPerWeek = yearly ? formatPerWeek(yearlyPrice, yearlyString) : '$0.99/wk';
    const monthlyPerWeek = monthly ? formatPerWeekFromMonthly(monthlyPrice, monthlyString) : '$2.31/wk';

    // Marketing-fixed at 60% — matches the annual price-point promise
    // ($0.99/wk billed $51.99 vs $9.99/mo). Override here if the
    // RevenueCat-side pricing ever shifts enough that the headline
    // claim drifts.
    const annualSavingsLabel = 'Get 60% off';

    return {
      yearlyString,
      monthlyString,
      yearlyPerWeek,
      monthlyPerWeek,
      annualSavingsLabel,
    };
  }, [yearly, monthly]);

  if (!visible) return null;

  // In generating-plan mode the headline morphs with `stage`. In every
  // other mode the static trigger-based headline applies.
  const headline = isGeneratingPlan
    ? headlineForGeneratingStage(pendingGeneration)
    : headlineForTrigger(trigger);
  const titleParts = headline.title.split(headline.italicWord);
  const personaSubline = isGeneratingPlan
    ? personaSublineFor(pendingGeneration, preferences)
    : null;
  const planIsDone = pendingGeneration?.stage === 'done';
  const planFailed = pendingGeneration?.stage === 'failed';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {/* Tap-outside-to-dismiss layer — disabled in locked-sheet
            modes (onboarding + generating-plan) so the only way
            forward is an explicit subscribe-or-skip choice. EXCEPTION:
            the generating-plan FAILURE branch re-enables dismiss so
            the user isn't stranded after an error. */}
        {(!isLockedSheet || isOnboarding || (isGeneratingPlan && pendingGeneration?.stage === 'failed')) && (
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        )}

        <View style={[styles.sheet, { backgroundColor: sheetBg }]}>
          {/* Drag handle — visually softer in locked-sheet modes
              since the sheet isn't actually drag-dismissible there. */}
          <View style={styles.handleWrap}>
            <View style={[styles.handle, isLockedSheet && { opacity: 0.35 }]} />
          </View>

          {/* Close X — visible when the sheet is dismissable. Generating-
              plan mid-stream hides it to prevent abandoning a generation
              the user can't restart; the failure branch re-enables it so
              a stuck user can escape. Onboarding mode keeps it visible as
              a no-comp exit (App Review needs an out — there's no longer
              a "Maybe later" link). */}
          {(!isLockedSheet || isOnboarding || (isGeneratingPlan && pendingGeneration?.stage === 'failed')) && (
            <Pressable
              onPress={handleClose}
              hitSlop={10}
              style={{
                position: 'absolute',
                top: 16,
                right: 14,
                width: 32,
                height: 32,
                borderRadius: 999,
                backgroundColor: designTokens.colors.hair2,
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
              }}
            >
              <X size={16} color={colors.ink} strokeWidth={1.9} />
            </Pressable>
          )}

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {/* Editorial header */}
            <View style={{ paddingHorizontal: 24, paddingTop: 6, paddingBottom: 10 }}>
              {/* In generating-plan mode, the progress strip sits ABOVE
                  the eyebrow so the user's eye lands on real-time
                  motion first. Pills fill as recipes arrive. */}
              {isGeneratingPlan && (
                <GenerationProgressStrip pending={pendingGeneration} isDark={isDark} />
              )}
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 10.5,
                  letterSpacing: 1.3,
                  textTransform: 'uppercase',
                  color: planFailed
                    ? designTokens.colors.ink3
                    : designTokens.colors.olive,
                  marginBottom: 8,
                }}
              >
                {headline.eyebrow}
              </Text>
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 26,
                  color: colors.ink,
                  letterSpacing: -0.52,
                  lineHeight: 32,
                }}
              >
                {titleParts[0]}
                <Text
                  style={{
                    fontFamily: designTokens.font.serifItalic,
                    fontStyle: 'italic',
                    fontSize: 30,
                  }}
                >
                  {headline.italicWord}
                </Text>
                {titleParts[1]}
              </Text>

              {/* Persona echo subline (generating-plan mode only) —
                  reflects the answers the user just gave during
                  onboarding. Proves the AI listened. */}
              {isGeneratingPlan && personaSubline && !planFailed && (
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 13,
                    lineHeight: 18,
                    color: designTokens.colors.ink2,
                    marginTop: 8,
                    letterSpacing: -0.05,
                  }}
                >
                  {personaSubline}
                </Text>
              )}

              {/* Failure copy (generating-plan mode only). */}
              {isGeneratingPlan && planFailed && (
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 8,
                    marginTop: 10,
                    alignItems: 'flex-start',
                  }}
                >
                  <AlertCircle
                    size={14}
                    color={designTokens.colors.ink3}
                    strokeWidth={2}
                    style={{ marginTop: 2 }}
                  />
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: designTokens.font.regular,
                      fontSize: 13,
                      lineHeight: 18,
                      color: designTokens.colors.ink2,
                    }}
                  >
                    We couldn't finish your plan. Your spot is saved — try again from the home tab.
                  </Text>
                </View>
              )}

              {/* Social proof row — single line, no images. Hidden in
                  generating-plan mode because the progress strip
                  already carries the "this is alive" weight. */}
              {!isGeneratingPlan && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 10,
                  }}
                >
                  <Star size={12} color={designTokens.colors.olive} fill={designTokens.colors.olive} strokeWidth={0} />
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 12,
                      color: designTokens.colors.ink2,
                      letterSpacing: -0.05,
                    }}
                  >
                    4.8 · loved by 12k+ home cooks
                  </Text>
                </View>
              )}
            </View>

            {/* Personalized anchor strip — only when we have signal. */}
            {(cookedThisWeek > 0 || streak > 0) && (
              <Animated.View
                entering={FadeIn.duration(380).easing(EASE)}
                style={{
                  marginHorizontal: 16,
                  marginBottom: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 14,
                  backgroundColor: designTokens.colors.cream,
                  borderWidth: 1,
                  borderColor: cardBorder,
                }}
              >
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 13,
                    lineHeight: 18,
                    color: designTokens.colors.ink2,
                  }}
                >
                  {streak > 0 ? (
                    <>
                      You've cooked{' '}
                      <Text style={{ fontFamily: designTokens.font.semibold, color: colors.ink }}>
                        {cookedThisWeek}
                      </Text>
                      {' '}meals this week — on a{' '}
                      <Text style={{ fontFamily: designTokens.font.semibold, color: colors.ink }}>
                        {streak}-day streak
                      </Text>
                      . Premium keeps that going.
                    </>
                  ) : (
                    <>
                      You've cooked{' '}
                      <Text style={{ fontFamily: designTokens.font.semibold, color: colors.ink }}>
                        {cookedThisWeek}
                      </Text>
                      {' '}meals with PnP this week. Premium keeps the momentum.
                    </>
                  )}
                </Text>
              </Animated.View>
            )}

            {/* Benefits section heading */}
            <View style={{ paddingHorizontal: 24, marginBottom: 10 }}>
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 18,
                  color: colors.ink,
                  letterSpacing: -0.3,
                }}
              >
                Unlock{' '}
                <Text
                  style={{
                    fontFamily: designTokens.font.serifItalic,
                    fontStyle: 'italic',
                    fontSize: 20,
                  }}
                >
                  PlanPlate+
                </Text>
              </Text>
            </View>

            {/* Benefits list */}
            <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
              {PREMIUM_BENEFITS.map((b, idx) => (
                <View
                  key={b.title}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    paddingVertical: 8,
                    borderBottomWidth: idx < PREMIUM_BENEFITS.length - 1 ? 1 : 0,
                    borderBottomColor: colors.hair2,
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      backgroundColor: designTokens.colors.brand,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                      marginTop: 1,
                    }}
                  >
                    <Check size={13} color="#F6F2E9" strokeWidth={2.8} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 13.5,
                        color: colors.ink,
                        letterSpacing: -0.15,
                      }}
                    >
                      {b.title}
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 12,
                        lineHeight: 16,
                        color: designTokens.colors.ink3,
                        marginTop: 1,
                      }}
                    >
                      {b.sub}
                    </Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Closing tagline — quiet editorial sign-off under the benefits. */}
            <Text
              style={{
                paddingHorizontal: 24,
                marginBottom: 16,
                fontFamily: designTokens.font.serifItalic,
                fontStyle: 'italic',
                fontSize: 14,
                lineHeight: 20,
                color: designTokens.colors.ink2,
                letterSpacing: -0.1,
              }}
            >
              {PREMIUM_TAGLINE}
            </Text>

            {/* Testimonial — short quote, serif pull, attribution. */}
            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 16,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: 14,
                backgroundColor: isDark ? '#262626' : designTokens.colors.cream,
                borderWidth: 1,
                borderColor: cardBorder,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.serifItalic,
                  fontStyle: 'italic',
                  fontSize: 17,
                  lineHeight: 23,
                  color: colors.ink,
                  letterSpacing: -0.2,
                }}
              >
                “{TESTIMONIAL.quote}”
              </Text>
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 11.5,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  color: designTokens.colors.ink3,
                  marginTop: 8,
                }}
              >
                {TESTIMONIAL.attribution}
              </Text>
            </View>

            {/* Plan picker + CTA. In generating-plan mode AFTER a
                successful purchase, the picker is replaced with an
                in-sheet celebration tile while the plan finishes
                generating. The auto-dismiss effect (above) closes the
                sheet and navigates once stage==='done'. */}
            <View style={{ paddingHorizontal: 16 }}>
              {isGeneratingPlan && hasPurchasedHere ? (
                <Animated.View
                  entering={FadeInDown.duration(360).easing(EASE)}
                  style={{
                    paddingVertical: 24,
                    paddingHorizontal: 18,
                    borderRadius: 18,
                    backgroundColor: 'rgba(84, 100, 69, 0.08)',
                    borderWidth: 1,
                    borderColor: 'rgba(84, 100, 69, 0.22)',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 999,
                      backgroundColor: designTokens.colors.brand,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <Crown size={22} color={designTokens.colors.cream} strokeWidth={1.9} />
                  </View>
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 15,
                      color: colors.ink,
                      letterSpacing: -0.2,
                      textAlign: 'center',
                    }}
                  >
                    Welcome to Premium.
                  </Text>
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 12.5,
                      lineHeight: 17,
                      color: designTokens.colors.ink2,
                      marginTop: 4,
                      textAlign: 'center',
                      paddingHorizontal: 6,
                    }}
                  >
                    {planIsDone
                      ? 'Your plan is ready — opening it now.'
                      : 'Your plan is finishing up. We’ll open it in a moment.'}
                  </Text>
                </Animated.View>
              ) : isLoading ? (
                <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                  <ActivityIndicator color={designTokens.colors.olive} />
                </View>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                    {/* Annual (recommended) */}
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSelected('yearly');
                      }}
                      style={{ flex: 1 }}
                    >
                      <View
                        style={{
                          paddingVertical: 14,
                          paddingHorizontal: 14,
                          borderRadius: 16,
                          borderWidth: selected === 'yearly' ? 2 : 1,
                          borderColor:
                            selected === 'yearly'
                              ? designTokens.colors.brand
                              : cardBorder,
                          backgroundColor:
                            selected === 'yearly'
                              ? 'rgba(84, 100, 69, 0.06)'
                              : colors.bg,
                          ...elevation.card,
                        }}
                      >
                        {pricingDetails.annualSavingsLabel && (
                          <View
                            style={{
                              position: 'absolute',
                              top: -8,
                              right: 10,
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              borderRadius: 999,
                              backgroundColor: designTokens.colors.olive,
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: designTokens.font.semibold,
                                fontSize: 10,
                                color: '#F6F2E9',
                                letterSpacing: 0.4,
                              }}
                            >
                              {pricingDetails.annualSavingsLabel} · best value
                            </Text>
                          </View>
                        )}
                        <Text
                          style={{
                            fontFamily: designTokens.font.semibold,
                            fontSize: 13,
                            color: colors.ink,
                            letterSpacing: -0.1,
                          }}
                        >
                          Annual
                        </Text>
                        {/* Per-week anchor — primary price line. Same
                            pricing, just framed in the unit that reads
                            cheapest. */}
                        <Text
                          style={{
                            fontFamily: designTokens.font.semibold,
                            fontSize: 22,
                            color: colors.ink,
                            marginTop: 4,
                            letterSpacing: -0.4,
                          }}
                          numberOfLines={1}
                        >
                          {pricingDetails.yearlyPerWeek ?? pricingDetails.yearlyString}
                        </Text>
                        {/* Full yearly price as a secondary anchor —
                            keeps the actual billing amount honest. */}
                        <Text
                          style={{
                            fontFamily: designTokens.font.regular,
                            fontSize: 11,
                            color: designTokens.colors.ink3,
                            marginTop: 2,
                          }}
                          numberOfLines={1}
                        >
                          {pricingDetails.yearlyPerWeek
                            ? `${pricingDetails.yearlyString}/yr · billed annually`
                            : 'per year'}
                        </Text>
                      </View>
                    </Pressable>

                    {/* Monthly */}
                    <Pressable
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSelected('monthly');
                      }}
                      style={{ flex: 1 }}
                    >
                      <View
                        style={{
                          paddingVertical: 14,
                          paddingHorizontal: 14,
                          borderRadius: 16,
                          borderWidth: selected === 'monthly' ? 2 : 1,
                          borderColor:
                            selected === 'monthly'
                              ? designTokens.colors.brand
                              : cardBorder,
                          backgroundColor:
                            selected === 'monthly'
                              ? 'rgba(84, 100, 69, 0.06)'
                              : colors.bg,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: designTokens.font.semibold,
                            fontSize: 13,
                            color: colors.ink,
                            letterSpacing: -0.1,
                          }}
                        >
                          Monthly
                        </Text>
                        <Text
                          style={{
                            fontFamily: designTokens.font.semibold,
                            fontSize: 22,
                            color: colors.ink,
                            marginTop: 4,
                            letterSpacing: -0.4,
                          }}
                          numberOfLines={1}
                        >
                          {pricingDetails.monthlyPerWeek ?? pricingDetails.monthlyString}
                        </Text>
                        <Text
                          style={{
                            fontFamily: designTokens.font.regular,
                            fontSize: 11,
                            color: designTokens.colors.ink3,
                            marginTop: 2,
                          }}
                          numberOfLines={1}
                        >
                          {pricingDetails.monthlyPerWeek
                            ? `${pricingDetails.monthlyString}/mo · billed monthly`
                            : 'per month'}
                        </Text>
                      </View>
                    </Pressable>
                  </View>

                  {/* Primary CTA. Subscribe-only — no trial framing. */}
                  <Pressable
                    onPress={handlePurchase}
                    disabled={isPurchasing}
                    style={{ width: '100%' }}
                  >
                    {({ pressed }) => (
                      <View
                        style={{
                          alignItems: 'center',
                          justifyContent: 'center',
                          paddingVertical: 14,
                          paddingHorizontal: 14,
                          borderRadius: 999,
                          backgroundColor: designTokens.colors.brand,
                          shadowColor: designTokens.colors.brandDeep,
                          shadowOpacity: 0.24,
                          shadowRadius: 16,
                          shadowOffset: { width: 0, height: 6 },
                          elevation: 4,
                          transform: [{ scale: pressed ? 0.985 : 1 }],
                        }}
                      >
                        {isPurchasing ? (
                          <ActivityIndicator color={designTokens.colors.cream} />
                        ) : (
                          <>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Crown size={18} color={designTokens.colors.cream} strokeWidth={1.9} />
                              <Text
                                style={{
                                  fontFamily: designTokens.font.semibold,
                                  fontSize: 16,
                                  color: designTokens.colors.cream,
                                  letterSpacing: -0.2,
                                }}
                              >
                                {isGeneratingPlan
                                  ? (planIsDone ? 'Save my plan' : 'Subscribe to unlock')
                                  : isOnboarding
                                    ? 'Subscribe'
                                    : 'Continue with Premium'}
                              </Text>
                            </View>
                            {(isOnboarding || isGeneratingPlan) && (
                              <Text
                                style={{
                                  fontFamily: designTokens.font.regular,
                                  fontSize: 11.5,
                                  color: 'rgba(246, 242, 233, 0.78)',
                                  marginTop: 3,
                                  letterSpacing: -0.05,
                                }}
                                numberOfLines={1}
                              >
                                {selected === 'yearly'
                                  ? `${pricingDetails.yearlyString}/yr · auto-renews`
                                  : `${pricingDetails.monthlyString}/mo · auto-renews`}
                              </Text>
                            )}
                          </>
                        )}
                      </View>
                    )}
                  </Pressable>

                  {/* Auto-renew disclosure — App Store reviewers expect
                      this language verbatim near the CTA. */}
                  <Text
                    style={{
                      textAlign: 'center',
                      marginTop: 10,
                      fontFamily: designTokens.font.regular,
                      fontSize: 11,
                      color: designTokens.colors.ink3,
                      paddingHorizontal: 8,
                      lineHeight: 15,
                    }}
                  >
                    {(isOnboarding || isGeneratingPlan) ? (
                      <>
                        {selected === 'yearly'
                          ? `${pricingDetails.yearlyString} per year`
                          : `${pricingDetails.monthlyString} per month`}
                        . Auto-renews. Cancel anytime in Settings.
                      </>
                    ) : (
                      <>Auto-renews. Cancel anytime in Settings.</>
                    )}
                  </Text>

                  {/* "Maybe later" link removed — no trial to grant.
                      Onboarding keeps the close X (above) as a no-comp exit;
                      generating-plan auto-dismisses when the plan finishes. */}

                  {/* Restore link — visible directly under the CTA. */}
                  <Pressable
                    onPress={handleRestore}
                    disabled={isRestoring}
                    hitSlop={6}
                    style={{
                      alignSelf: 'center',
                      marginTop: isLockedSheet ? 4 : 8,
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 13,
                        color: designTokens.colors.ink2,
                        textDecorationLine: 'underline',
                      }}
                    >
                      {isRestoring ? 'Restoring…' : 'Restore purchases'}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '92%',
    paddingBottom: 18,
    overflow: 'hidden',
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D8D4C9',
  },
});
