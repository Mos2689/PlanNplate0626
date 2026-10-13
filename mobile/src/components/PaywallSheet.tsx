// PaywallSheet — the app's single paywall surface.
//
// Mounted globally in src/app/_layout.tsx; any caller fires
// `useSubscriptionStore.getState().openPaywallSheet(trigger)` to bring it up.
//
// Design: "Go Premium" headline + tagline, a 3×2 feature grid, then two plan
// cards side by side — Annual (BEST VALUE, selected by default) and Weekly
// (the monthly plan shown as its weekly equivalent, billed monthly) — and one
// "Go Premium" CTA. Prices are read live from RevenueCat ($rc_annual /
// $rc_monthly) and never hard-coded. Food photography frames the page
// (plate top-right, bowl + napkin at the bottom; light mode only for the
// cut-out garnish).
//
// Closing without buying hands over to the free-week ad offer
// (AdUnlockSheet "intro") unless a free week is already running or the sheet
// was opened from an ad sheet's own "Go Premium" button.

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, Modal, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import {
  Crown,
  X,
  CalendarDays,
  Bookmark,
  Leaf,
  ShoppingBasket,
  ChefHat,
  Smile,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { getOfferings, purchasePackage, restorePurchases, isRevenueCatEnabled } from '@/lib/revenuecatClient';
import { friendlyPurchaseError } from '@/lib/purchase-errors';
import { makeFailure, presentFailure } from '@/lib/failure';
import { useRouter } from 'expo-router';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { useAdUnlockStore } from '@/lib/ad-unlock-store';
import { shouldOfferAfterPaywallClose } from '@/lib/ad-unlock-logic';
import { adUnlockAvailable } from '@/lib/rewarded-ad';
import { designTokens, getThemeColors, serifItalicFontStyle } from '@/lib/design-tokens';
import type { PurchasesPackage } from 'react-native-purchases';
import { logMetaPurchase } from '@/lib/meta-sdk';
import { track } from '@/lib/analytics';

type Feature = { title: string; sub: string; Icon: LucideIcon };

const FEATURES: Feature[] = [
  { title: 'Save recipes', sub: 'from anywhere', Icon: Bookmark },
  { title: 'Chef-made', sub: 'recipes & plans', Icon: ChefHat },
  { title: 'Easy', sub: 'meal planning', Icon: CalendarDays },
  { title: 'Smart', sub: 'shopping lists', Icon: ShoppingBasket },
  { title: 'Smart pantry', sub: 'meal ideas', Icon: Leaf },
  { title: 'Cook by mood', sub: 'personalised for you', Icon: Smile },
];

const IMG = {
  plate: require('../../assets/images/paywall/pw-plate.png'),
  bowl: require('../../assets/images/paywall/pw-bowl.png'),
  napkin: require('../../assets/images/paywall/pw-napkin.png'),
  leaf: require('../../assets/images/paywall/pw-leaf.png'),
};

const PAGE_BG = '#FAF7F1';
const ICON_BG = '#E8EEDD';
const BRAND_DARK = '#1F3A24';
const CTA_GREEN = '#3F5A34';

type Plan = 'annual' | 'monthly';

interface PaywallSheetProps {
  isDark?: boolean;
}

export function PaywallSheet({ isDark = false }: PaywallSheetProps) {
  const router = useRouter();
  const trigger = useSubscriptionStore((s) => s.paywallSheetTrigger);
  const closeSheet = useSubscriptionStore((s) => s.closePaywallSheet);
  const isOnboarding = trigger === 'onboarding';

  const colors = getThemeColors(isDark);
  const visible = trigger !== null;

  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [annual, setAnnual] = useState<PurchasesPackage | null>(null);
  const [monthly, setMonthly] = useState<PurchasesPackage | null>(null);
  const [plan, setPlan] = useState<Plan>('annual');

  // Load both plans whenever the sheet opens (RevenueCat caches the response).
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
        const a = packages.find((p) => p.identifier === '$rc_annual') ?? null;
        setAnnual(a);
        setMonthly(packages.find((p) => p.identifier === '$rc_monthly') ?? null);
        setPlan(a ? 'annual' : 'monthly');
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const selected = plan === 'annual' ? annual : monthly;

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    track('paywall_dismissed', { trigger: trigger ?? 'unknown' });
    // Onboarding's only route forward is this sheet — skipping lands the user
    // on the recipes tab (gated actions re-fire the paywall later).
    if (isOnboarding) router.replace('/(tabs)/recipes');
    const fromAdSheet = trigger === 'ad-sheet';
    closeSheet();
    // Closed without buying → offer the free week, after this sheet slides away.
    const ad = useAdUnlockStore.getState();
    if (!fromAdSheet && shouldOfferAfterPaywallClose(ad, Date.now(), adUnlockAvailable())) {
      setTimeout(() => {
        track('ad_unlock_prompt_shown', { mode: 'intro', trigger: trigger ?? 'unknown' });
        useAdUnlockStore.getState().openSheet('intro');
      }, 400);
    }
  }, [closeSheet, isOnboarding, router, trigger]);

  const handlePurchase = useCallback(async () => {
    if (!selected) {
      presentFailure(makeFailure('not-configured', { feature: 'subscription' }));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    track('purchase_started', { trigger: trigger ?? 'unknown', package: selected.product.identifier });
    setIsPurchasing(true);
    const result = await purchasePackage(selected);
    setIsPurchasing(false);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const activeEntitlement = result.data.customerInfo.entitlements.active?.premium;
      const isVerifiedSubscription = Boolean(
        activeEntitlement?.isActive && activeEntitlement.verification !== 'FAILED',
      );
      const price = selected.product.price ?? 0;
      const currency = selected.product.currencyCode ?? 'AUD';
      track(
        'purchase_completed',
        { trigger: trigger ?? 'unknown', package: selected.product.identifier, price, currency },
        isVerifiedSubscription
          ? {
              verifiedSubscription: {
                transactionId: result.data.transaction.transactionIdentifier,
                value: price,
                currency,
                productId: result.data.productIdentifier,
                planId: selected.identifier,
                isTrial: activeEntitlement?.periodType === 'TRIAL',
              },
            }
          : undefined,
      );
      logMetaPurchase(price, currency, {
        content_name: selected.product.title,
        content_id: selected.product.identifier,
        content_type: 'product',
      });
      Alert.alert(
        'Welcome to Premium!',
        'Your subscription is active. Meal plans, Vibe Cooking, unlimited recipes and smart groceries — all yours.',
        [
          {
            text: 'Get Started',
            onPress: () => {
              closeSheet();
              if (isOnboarding) router.replace('/(tabs)/recipes');
            },
          },
        ],
      );
    } else {
      const friendly = friendlyPurchaseError(result.reason, result.error as Error | undefined);
      track('purchase_failed', {
        trigger: trigger ?? 'unknown',
        package: selected.product.identifier,
        reason: result.reason ?? 'unknown',
        cancelled: !friendly,
      });
      if (!friendly) return; // user-initiated cancel — stay silent
      presentFailure(friendly, () => handlePurchase());
    }
  }, [selected, closeSheet, isOnboarding, router, trigger]);

  const handleRestore = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsRestoring(true);
    const result = await restorePurchases();
    setIsRestoring(false);
    if (result.ok) {
      const hasActive = Object.keys(result.data.entitlements.active || {}).length > 0;
      if (hasActive) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Restored', 'Your purchases have been restored.', [{ text: 'OK', onPress: () => closeSheet() }]);
      } else {
        presentFailure(makeFailure('validation', { feature: 'subscription-restore-empty' }));
      }
    } else {
      presentFailure(makeFailure('unknown', { feature: 'subscription-restore' }), () => handleRestore());
    }
  }, [closeSheet]);

  if (!visible) return null;

  // ── Live prices ──
  const annualPrice = annual?.product.priceString ?? null;
  const annualPerWeek = annual?.product.pricePerWeekString ?? null;
  const monthlyPrice = monthly?.product.priceString ?? null;
  const monthlyPerWeek = monthly?.product.pricePerWeekString ?? null;
  const savePct =
    annual?.product.price && monthly?.product.price
      ? Math.round((1 - annual.product.price / (monthly.product.price * 12)) * 100)
      : null;

  const disclosure =
    plan === 'annual' && annualPrice
      ? `${annualPrice}/year, billed yearly. Auto-renews. Cancel anytime in Settings.`
      : monthlyPrice
        ? `${monthlyPrice}/month, billed monthly. Auto-renews. Cancel anytime in Settings.`
        : 'Cancel anytime in Settings. Auto-renews at the selected price.';

  const pageBg = isDark ? '#1f1f1f' : PAGE_BG;
  const titleColor = isDark ? '#E4EBD9' : BRAND_DARK;
  const rows = [FEATURES.slice(0, 3), FEATURES.slice(3, 6)];

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
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

        <View style={[styles.sheet, { backgroundColor: pageBg }]}>
          <Pressable
            onPress={handleClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={[styles.close, { backgroundColor: isDark ? 'rgba(40,40,40,0.9)' : '#FFFFFF' }]}
          >
            <X size={20} color={colors.ink} strokeWidth={2} />
          </Pressable>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ paddingBottom: 96 }}>
              {/* ── Garnish (decorative, behind content) ── */}
              <Image source={IMG.plate} contentFit="contain" style={styles.plate} pointerEvents="none" />
              <Image source={IMG.bowl} contentFit="contain" style={styles.bowl} pointerEvents="none" />
              {!isDark && <Image source={IMG.napkin} contentFit="contain" style={styles.napkin} pointerEvents="none" />}
              {!isDark && <Image source={IMG.leaf} contentFit="contain" style={styles.leaf} pointerEvents="none" />}

              {/* ── Headline ── */}
              <View style={{ paddingHorizontal: 30, marginTop: 80 }}>
                <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
                  Go{' '}
                  <Text style={[styles.titleSerif, { color: titleColor }]}>Premium</Text>
                </Text>
                <Text style={[styles.tagline, { color: colors.ink2 }]}>
                  More inspiration. Less effort.{'\n'}For a healthier, happier you.
                </Text>
              </View>

              {/* ── Feature grid ── */}
              <View style={{ paddingHorizontal: 14, marginTop: 26, gap: 18 }}>
                {rows.map((row, ri) => (
                  <View key={ri} style={{ flexDirection: 'row' }}>
                    {row.map(({ title, sub, Icon }, i) => (
                      <View key={title} style={{ flex: 1, flexDirection: 'row' }}>
                        {i > 0 && <View style={[styles.divider, { backgroundColor: colors.hair }]} />}
                        <View style={{ flex: 1, alignItems: 'center' }}>
                          <View style={[styles.iconCircle, { backgroundColor: isDark ? 'rgba(84,100,69,0.28)' : ICON_BG }]}>
                            <Icon size={20} color={isDark ? '#B9C7A8' : BRAND_DARK} strokeWidth={1.7} />
                          </View>
                          <Text style={[styles.featTitle, { color: colors.ink }]} numberOfLines={1}>
                            {title}
                          </Text>
                          <Text style={[styles.featSub, { color: colors.ink2 }]} numberOfLines={1} adjustsFontSizeToFit>
                            {sub}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </View>

              {/* ── Plans ── */}
              <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginTop: 30 }}>
                {annual && (
                  <PlanCard
                    selected={plan === 'annual'}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setPlan('annual');
                    }}
                    badge="BEST VALUE"
                    name="Annual"
                    price={annualPrice ?? '—'}
                    unit="/ year"
                    line={annualPerWeek ? `Just ${annualPerWeek}/week` : 'Billed yearly'}
                    pill={savePct && savePct > 0 ? `Save ${savePct}%` : undefined}
                    colors={colors}
                    isDark={isDark}
                  />
                )}
                <PlanCard
                  selected={plan === 'monthly'}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setPlan('monthly');
                  }}
                  name="Weekly"
                  price={monthlyPerWeek ?? monthlyPrice ?? '—'}
                  unit={monthlyPerWeek ? '/ week' : '/ month'}
                  line={monthlyPrice ? `${monthlyPrice} billed monthly` : 'Billed monthly'}
                  colors={colors}
                  isDark={isDark}
                />
              </View>

              {/* ── CTA ── */}
              <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
                <Pressable onPress={handlePurchase} disabled={isPurchasing || isLoading} accessibilityRole="button">
                  {({ pressed }) => (
                    <View style={[styles.cta, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}>
                      {isPurchasing || isLoading ? (
                        <ActivityIndicator color={designTokens.colors.cream} />
                      ) : (
                        <>
                          <Crown size={24} color={designTokens.colors.cream} strokeWidth={1.7} />
                          <Text style={styles.ctaText}>Go Premium</Text>
                          <ChevronRight size={22} color={designTokens.colors.cream} strokeWidth={2} style={{ position: 'absolute', right: 22 }} />
                        </>
                      )}
                    </View>
                  )}
                </Pressable>
                <Text style={[styles.disclosure, { color: colors.ink2 }]}>{disclosure}</Text>
              </View>

              {/* ── Restore ── */}
              <View style={{ alignItems: 'center', marginTop: 8 }}>
                <Pressable onPress={handleRestore} disabled={isRestoring} hitSlop={8} style={{ paddingVertical: 6, paddingHorizontal: 12 }}>
                  <Text style={{ fontFamily: designTokens.font.regular, fontSize: 15, color: colors.ink2, textDecorationLine: 'underline' }}>
                    {isRestoring ? 'Restoring…' : 'Restore purchases'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PlanCard({
  selected,
  onPress,
  badge,
  name,
  price,
  unit,
  line,
  pill,
  colors,
  isDark,
}: {
  selected: boolean;
  onPress: () => void;
  badge?: string;
  name: string;
  price: string;
  unit: string;
  line: string;
  pill?: string;
  colors: ReturnType<typeof getThemeColors>;
  isDark: boolean;
}) {
  const accent = isDark ? '#B9C7A8' : BRAND_DARK;
  const bg = selected ? (isDark ? 'rgba(84,100,69,0.22)' : '#EEF1E5') : isDark ? '#262626' : '#F6F2E9';
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }} accessibilityRole="radio" accessibilityState={{ selected }}>
      {({ pressed }) => (
        <View
          style={[
            styles.planCard,
            {
              borderWidth: selected ? 2 : 1,
              borderColor: selected ? CTA_GREEN : isDark ? '#333' : '#EEE8DC',
              backgroundColor: bg,
              transform: [{ scale: pressed ? 0.99 : 1 }],
            },
          ]}
        >
          {/* Faint leaf in the corner, as on the printed menu card */}
          <Leaf
            size={46}
            color={selected ? '#7E9A6A' : '#B8A88E'}
            strokeWidth={1.2}
            style={{ position: 'absolute', right: 8, bottom: 8, opacity: 0.35, transform: [{ rotate: '-20deg' }] }}
          />
          {badge && (
            <View style={styles.badge}>
              <Text style={{ fontFamily: designTokens.font.medium, fontSize: 12, letterSpacing: 0.5, color: '#FFFFFF' }}>{badge}</Text>
            </View>
          )}
          <View style={[styles.radio, { borderColor: selected ? CTA_GREEN : colors.ink3 }]}>
            {selected && <View style={[styles.radioDot, { backgroundColor: CTA_GREEN }]} />}
          </View>
          <Text style={{ fontFamily: designTokens.font.medium, fontSize: 17, color: colors.ink, marginTop: 20 }}>
            {name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
            <Text
              style={{ fontFamily: designTokens.font.semibold, fontSize: 26, letterSpacing: -0.8, color: selected ? accent : colors.ink, flexShrink: 1 }}
              adjustsFontSizeToFit
              numberOfLines={1}
            >
              {price}
            </Text>
            <Text style={{ fontFamily: designTokens.font.regular, fontSize: 13, color: colors.ink, marginLeft: 4 }}>{unit}</Text>
          </View>
          <Text style={{ fontFamily: designTokens.font.regular, fontSize: 13.5, color: colors.ink2, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>
            {line}
          </Text>
          {pill && (
            <View style={[styles.savePill, { backgroundColor: isDark ? 'rgba(84,100,69,0.3)' : '#DDE6CF' }]}>
              <Text style={{ fontFamily: designTokens.font.medium, fontSize: 13, color: accent }}>{pill}</Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '95%',
    overflow: 'hidden',
  },
  close: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  // Garnish — sized off a ~390pt-wide phone; they bleed off the right edge.
  plate: { position: 'absolute', top: 24, right: -150, width: 230, height: 230 },
  bowl: { position: 'absolute', bottom: -70, right: -64, width: 180, height: 180 },
  napkin: { position: 'absolute', bottom: 0, left: 0, width: 150, height: 100 },
  leaf: { position: 'absolute', bottom: 34, right: 118, width: 50, height: 52 },
  title: {
    fontFamily: designTokens.font.semibold,
    fontSize: 46,
    // Room for the taller serif "Premium" (56pt) so its ascenders aren't clipped.
    lineHeight: 72,
    paddingTop: 4,
    letterSpacing: -1.6,
  },
  titleSerif: {
    fontFamily: designTokens.font.serifItalic,
    fontStyle: serifItalicFontStyle,
    fontSize: 56,
    letterSpacing: -0.5,
  },
  tagline: { fontFamily: designTokens.font.regular, fontSize: 17, lineHeight: 24, marginTop: 8 },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: 4 },
  iconCircle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  featTitle: { fontFamily: designTokens.font.medium, fontSize: 14, marginTop: 8, letterSpacing: -0.2 },
  featSub: { fontFamily: designTokens.font.regular, fontSize: 12.5, marginTop: 1, paddingHorizontal: 2 },
  planCard: {
    flex: 1,
    minHeight: 140,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    overflow: 'visible',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 60,
    borderRadius: 999,
    backgroundColor: CTA_GREEN,
    shadowColor: '#1F3A24',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  ctaText: { fontFamily: designTokens.font.semibold, fontSize: 19, color: designTokens.colors.cream, letterSpacing: -0.3 },
  disclosure: {
    textAlign: 'center',
    marginTop: 12,
    fontFamily: designTokens.font.regular,
    fontSize: 12.5,
    lineHeight: 17,
    paddingHorizontal: 8,
  },
  badge: {
    position: 'absolute',
    top: -13,
    left: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#E46D46',
  },
  radio: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
  savePill: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
});
