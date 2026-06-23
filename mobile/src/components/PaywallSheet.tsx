// PaywallSheet — the app's single paywall surface.
//
// Mounted globally in src/app/_layout.tsx; any caller fires
// `useSubscriptionStore.getState().openPaywallSheet(trigger)` to bring
// it up. Sliding sheet keeps the user's scroll/tab position intact.
//
// Design: a two-option plan toggle (Free / Monthly). The pane below swaps to
// show what each tier offers — the free tier lists every feature with its
// monthly cap, the monthly tier shows everything unlimited at the offer price.
// A single "Continue" CTA acts on the selected tier: continue free (dismiss)
// or start the monthly purchase. No separate "not now" exit — the Free tab IS
// the free path. "Most popular" badge sits on the Monthly tab.
//
// Brand rules (locked):
//   • Olive eyebrow + italic word in the headline.
//   • Sage brand accents, no purple/blue.
//   • scale-on-press for every Pressable.
//   • No Sparkles / ChefHat icons.

import React, { useEffect, useState, useCallback } from 'react';
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
import {
  Crown,
  X,
  CalendarHeart,
  BookmarkPlus,
  Soup,
  ShoppingBasket,
  Lightbulb,
  Download,
  type LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  isRevenueCatEnabled,
} from '@/lib/revenuecatClient';
import { friendlyPurchaseError } from '@/lib/purchase-errors';
import { useRouter } from 'expo-router';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { MONTHLY_FEATURE_LIMITS } from '@/lib/store';
import { designTokens, getThemeColors } from '@/lib/design-tokens';
import type { PurchasesPackage } from 'react-native-purchases';
import { logMetaPurchase } from '@/lib/meta-sdk';

// ── Feature rows ────────────────────────────────────────────────────────────
// One ordered list of features; each tier supplies its own value per feature.
// Free caps are sourced from MONTHLY_FEATURE_LIMITS so the sheet never drifts
// from the actual gating. Get inspired / Get groceries are always unlimited.
type FeatureRow = { title: string; Icon: LucideIcon; free: string; premium: string };

const FEATURES: FeatureRow[] = [
  { title: 'Get inspired', Icon: Lightbulb, free: 'Unlimited', premium: 'Unlimited' },
  { title: 'Get groceries', Icon: ShoppingBasket, free: 'Unlimited', premium: 'Unlimited' },
  {
    title: 'Plan my meals',
    Icon: CalendarHeart,
    free: `${MONTHLY_FEATURE_LIMITS.planMeals} / month`,
    premium: 'Unlimited',
  },
  {
    title: 'Add recipe',
    Icon: BookmarkPlus,
    free: `${MONTHLY_FEATURE_LIMITS.addRecipe} / month`,
    premium: 'Unlimited',
  },
  {
    title: 'Import recipe',
    Icon: Download,
    free: `${MONTHLY_FEATURE_LIMITS.importRecipe} / month`,
    premium: 'Unlimited',
  },
  {
    title: 'Vibe cooking',
    Icon: Soup,
    free: `${MONTHLY_FEATURE_LIMITS.vibe} / month`,
    premium: 'Unlimited',
  },
];

// ── Pricing (display) ───────────────────────────────────────────────────
// Marketing-fixed display values per product spec. Actual billing comes from
// the RevenueCat monthly package; keep these mirrored in App Store Connect /
// RevenueCat so the displayed offer matches what StoreKit charges.
const ORIGINAL_MONTHLY = 'AU$6.99';
const OFFER_MONTHLY = 'AU$3.99';

type PlanTab = 'free' | 'monthly';

interface PaywallSheetProps {
  isDark?: boolean;
}

export function PaywallSheet({ isDark = false }: PaywallSheetProps) {
  const router = useRouter();
  const trigger = useSubscriptionStore((s) => s.paywallSheetTrigger);
  const closeSheet = useSubscriptionStore((s) => s.closePaywallSheet);
  const isOnboarding = trigger === 'onboarding';

  const colors = getThemeColors(isDark);
  const sheetBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const visible = trigger !== null;

  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [monthly, setMonthly] = useState<PurchasesPackage | null>(null);
  // Lead with the paid plan; the Free tab is one tap away.
  const [tab, setTab] = useState<PlanTab>('monthly');

  // Reset to the Monthly tab each time the sheet opens.
  useEffect(() => {
    if (visible) setTab('monthly');
  }, [visible]);

  // Load the monthly offering whenever the sheet opens. RevenueCat caches the
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
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Onboarding's only route forward is this sheet — skipping lands the user
    // on the home tab (gated actions re-fire the paywall later).
    if (isOnboarding) router.replace('/(tabs)');
    closeSheet();
  }, [closeSheet, isOnboarding, router]);

  const handlePurchase = useCallback(async () => {
    if (!monthly) {
      Alert.alert('Unavailable', 'No subscription package available right now.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPurchasing(true);
    const result = await purchasePackage(monthly);
    setIsPurchasing(false);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const price = (monthly.product as any).price || 0;
      const currency = (monthly.product as any).currencyCode || 'AUD';
      logMetaPurchase(price, currency, {
        content_name: monthly.product.title,
        content_id: monthly.product.identifier,
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
              if (isOnboarding) router.replace('/(tabs)');
            },
          },
        ],
      );
    } else {
      const friendly = friendlyPurchaseError(
        result.reason,
        result.error as Error | undefined,
      );
      if (!friendly) return; // user-initiated cancel — stay silent
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
  }, [monthly, closeSheet, isOnboarding, router]);

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

  // Continue acts on the selected tier.
  const handleContinue = useCallback(() => {
    if (tab === 'free') {
      handleClose();
    } else {
      handlePurchase();
    }
  }, [tab, handleClose, handlePurchase]);

  if (!visible) return null;

  const isMonthly = tab === 'monthly';

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
        {/* Tap-outside-to-dismiss */}
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

        <View style={[styles.sheet, { backgroundColor: sheetBg }]}>
          {/* Drag handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          {/* Close X */}
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

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {/* Header */}
            <View style={{ paddingHorizontal: 24, paddingTop: 6, paddingBottom: 16 }}>
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 10.5,
                  letterSpacing: 1.3,
                  textTransform: 'uppercase',
                  color: designTokens.colors.olive,
                  marginBottom: 8,
                }}
              >
                Membership
              </Text>
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 27,
                  color: colors.ink,
                  letterSpacing: -0.54,
                  lineHeight: 33,
                }}
              >
                Do{' '}
                <Text
                  style={{
                    fontFamily: designTokens.font.serifItalic,
                    fontStyle: 'italic',
                    fontSize: 31,
                  }}
                >
                  more
                </Text>{' '}
                with PlanNplate
              </Text>
            </View>

            {/* Plan toggle */}
            <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
              <View
                style={{
                  flexDirection: 'row',
                  gap: 6,
                  backgroundColor: colors.hair2,
                  borderRadius: 999,
                  padding: 4,
                }}
              >
                <PlanTabButton
                  label="Free"
                  sub="$0 · always"
                  active={tab === 'free'}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setTab('free');
                  }}
                  colors={colors}
                />
                <PlanTabButton
                  label="Monthly"
                  sub={`${OFFER_MONTHLY} / mo`}
                  active={tab === 'monthly'}
                  badge="Most popular"
                  onPress={() => {
                    Haptics.selectionAsync();
                    setTab('monthly');
                  }}
                  colors={colors}
                />
              </View>
            </View>

            {/* Pane */}
            <View style={{ paddingHorizontal: 16 }}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: isMonthly ? designTokens.colors.brand : colors.hair,
                  borderRadius: 20,
                  paddingHorizontal: 16,
                  paddingTop: 14,
                  paddingBottom: 6,
                  backgroundColor: isMonthly
                    ? 'rgba(84, 100, 69, 0.05)'
                    : colors.bg,
                }}
              >
                {/* Pane header */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    marginBottom: 2,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 15,
                      color: colors.ink,
                      letterSpacing: -0.2,
                    }}
                  >
                    {isMonthly ? 'Premium' : 'Free plan'}
                  </Text>
                  {isMonthly ? (
                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                      <Text
                        style={{
                          fontFamily: designTokens.font.regular,
                          fontSize: 13,
                          color: designTokens.colors.ink3,
                          textDecorationLine: 'line-through',
                          marginRight: 6,
                        }}
                      >
                        {ORIGINAL_MONTHLY}
                      </Text>
                      <Text
                        style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 15,
                          color: colors.ink,
                        }}
                      >
                        {OFFER_MONTHLY}
                      </Text>
                      <Text
                        style={{
                          fontFamily: designTokens.font.regular,
                          fontSize: 12,
                          color: designTokens.colors.ink2,
                          marginLeft: 2,
                        }}
                      >
                        /mo
                      </Text>
                    </View>
                  ) : (
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 13,
                        color: designTokens.colors.ink3,
                      }}
                    >
                      $0 forever
                    </Text>
                  )}
                </View>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12,
                    color: designTokens.colors.ink3,
                    marginBottom: 2,
                  }}
                >
                  {isMonthly
                    ? 'Every feature, no monthly caps'
                    : 'Generous monthly caps, no card needed'}
                </Text>

                {/* Feature rows */}
                {FEATURES.map((f, idx) => {
                  const value = isMonthly ? f.premium : f.free;
                  const unlimited = value === 'Unlimited';
                  const Icon = f.Icon;
                  return (
                    <View
                      key={f.title}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 9,
                        borderTopWidth: 1,
                        borderTopColor: colors.hair2,
                      }}
                    >
                      <Icon
                        size={18}
                        color={
                          isMonthly ? designTokens.colors.brand : designTokens.colors.ink2
                        }
                        strokeWidth={1.8}
                      />
                      <Text
                        style={{
                          flex: 1,
                          fontFamily: designTokens.font.medium,
                          fontSize: 14.5,
                          color: colors.ink,
                          letterSpacing: -0.12,
                          marginLeft: 11,
                        }}
                      >
                        {f.title}
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: 9,
                          paddingVertical: 4,
                          borderRadius: 999,
                          backgroundColor: unlimited
                            ? 'rgba(84, 100, 69, 0.12)'
                            : colors.hair2,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: designTokens.font.semibold,
                            fontSize: 11.5,
                            color: unlimited
                              ? designTokens.colors.brand
                              : designTokens.colors.ink2,
                          }}
                        >
                          {value}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* CTA */}
              {isLoading ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator color={designTokens.colors.olive} />
                </View>
              ) : (
                <>
                  <Pressable
                    onPress={handleContinue}
                    disabled={isPurchasing}
                    style={{ width: '100%', marginTop: 16 }}
                  >
                    {({ pressed }) => (
                      <View
                        style={{
                          alignItems: 'center',
                          justifyContent: 'center',
                          paddingVertical: 15,
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
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            {isMonthly && (
                              <Crown
                                size={18}
                                color={designTokens.colors.cream}
                                strokeWidth={1.9}
                              />
                            )}
                            <Text
                              style={{
                                fontFamily: designTokens.font.semibold,
                                fontSize: 16,
                                color: designTokens.colors.cream,
                                letterSpacing: -0.2,
                              }}
                            >
                              Continue
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </Pressable>

                  {/* Auto-renew disclosure — App Store reviewers expect this. */}
                  {isMonthly && (
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
                      {OFFER_MONTHLY}/month after the offer. Auto-renews. Cancel anytime in Settings.
                    </Text>
                  )}

                  {/* Restore link */}
                  <Pressable
                    onPress={handleRestore}
                    disabled={isRestoring}
                    hitSlop={6}
                    style={{
                      alignSelf: 'center',
                      marginTop: isMonthly ? 10 : 14,
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 12.5,
                        color: designTokens.colors.ink3,
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

// ── Plan toggle button ──────────────────────────────────────────────────────
function PlanTabButton({
  label,
  sub,
  active,
  badge,
  onPress,
  colors,
}: {
  label: string;
  sub: string;
  active: boolean;
  badge?: string;
  onPress: () => void;
  colors: ReturnType<typeof getThemeColors>;
}) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      {({ pressed }) => (
        <View
          style={{
            borderRadius: 999,
            paddingVertical: 9,
            paddingHorizontal: 8,
            alignItems: 'center',
            backgroundColor: active ? designTokens.colors.brand : 'transparent',
            transform: [{ scale: pressed ? 0.98 : 1 }],
          }}
        >
          {badge ? (
            <View
              style={{
                position: 'absolute',
                top: -16,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: designTokens.colors.olive,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 9,
                  letterSpacing: 0.3,
                  textTransform: 'uppercase',
                  color: '#F6F2E9',
                }}
              >
                {badge}
              </Text>
            </View>
          ) : null}
          <Text
            style={{
              fontFamily: designTokens.font.semibold,
              fontSize: 14,
              letterSpacing: -0.1,
              color: active ? designTokens.colors.cream : colors.ink,
            }}
          >
            {label}
          </Text>
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 11,
              marginTop: 1,
              color: active ? 'rgba(246,242,233,0.78)' : designTokens.colors.ink3,
            }}
          >
            {sub}
          </Text>
        </View>
      )}
    </Pressable>
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
