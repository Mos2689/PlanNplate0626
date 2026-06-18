// PaywallSheet — the app's single paywall surface.
//
// Mounted globally in src/app/_layout.tsx; any caller fires
// `useSubscriptionStore.getState().openPaywallSheet(trigger)` to bring
// it up. Sliding sheet keeps the user's scroll/tab position intact.
//
// Design: one clean value pitch, four benefits, a single limited-time
// monthly offer, and a low-friction "continue free" exit. Deliberately
// quiet — no social-proof row, testimonials, or dual price anchors.
//
// Brand rules (locked):
//   • Olive eyebrow + italic word in the headline.
//   • Sage brand CTA, no purple/blue.
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
  Check,
  X,
  CalendarHeart,
  BookmarkPlus,
  Soup,
  ShoppingBasket,
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
import { designTokens, elevation, getThemeColors } from '@/lib/design-tokens';
import type { PurchasesPackage } from 'react-native-purchases';
import { logMetaPurchase } from '@/lib/meta-sdk';

// ── Value props ─────────────────────────────────────────────────────────
const PREMIUM_BENEFITS: Array<{ title: string; sub: string; Icon: LucideIcon }> = [
  {
    title: 'Plan my meals',
    sub: 'Fresh meal plans whenever you need them.',
    Icon: CalendarHeart,
  },
  {
    title: 'Save unlimited recipes',
    sub: 'Keep the recipes you love, from anywhere.',
    Icon: BookmarkPlus,
  },
  {
    title: 'Vibe Cooking',
    sub: 'Create recipes based on your mood and pantry.',
    Icon: Soup,
  },
  {
    title: 'Budget groceries',
    sub: 'Save on grocery bills — no more food waste.',
    Icon: ShoppingBasket,
  },
];

// ── Pricing (display) ───────────────────────────────────────────────────
// Marketing-fixed display values per product spec. Actual billing comes from
// the RevenueCat monthly package; keep these mirrored in App Store Connect /
// RevenueCat so the displayed offer matches what StoreKit charges.
const ORIGINAL_MONTHLY = 'AU$6.99';
const OFFER_MONTHLY = 'AU$3.99';

interface PaywallSheetProps {
  isDark?: boolean;
}

export function PaywallSheet({ isDark = false }: PaywallSheetProps) {
  const router = useRouter();
  const trigger = useSubscriptionStore((s) => s.paywallSheetTrigger);
  const closeSheet = useSubscriptionStore((s) => s.closePaywallSheet);
  // Onboarding mode: the sheet is the first thing after signup. We keep a
  // visible exit ("Not now, continue free") and route to the home tab on
  // either purchase or skip.
  const isOnboarding = trigger === 'onboarding';

  const colors = getThemeColors(isDark);
  const sheetBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const visible = trigger !== null;

  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [monthly, setMonthly] = useState<PurchasesPackage | null>(null);

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

  if (!visible) return null;

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
            <View style={{ paddingHorizontal: 24, paddingTop: 6, paddingBottom: 18 }}>
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
                PlanNplate Premium
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

            {/* Benefits list */}
            <View style={{ paddingHorizontal: 20, marginBottom: 18 }}>
              {PREMIUM_BENEFITS.map((b, idx) => {
                const Icon = b.Icon;
                return (
                  <View
                    key={b.title}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 11,
                      borderBottomWidth: idx < PREMIUM_BENEFITS.length - 1 ? 1 : 0,
                      borderBottomColor: colors.hair2,
                    }}
                  >
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 12,
                        backgroundColor: isDark
                          ? 'rgba(84, 100, 69, 0.18)'
                          : 'rgba(84, 100, 69, 0.10)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 14,
                      }}
                    >
                      <Icon size={19} color={designTokens.colors.brand} strokeWidth={1.9} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 14.5,
                          color: colors.ink,
                          letterSpacing: -0.15,
                        }}
                      >
                        {b.title}
                      </Text>
                      <Text
                        style={{
                          fontFamily: designTokens.font.regular,
                          fontSize: 12.5,
                          lineHeight: 17,
                          color: designTokens.colors.ink3,
                          marginTop: 1,
                        }}
                      >
                        {b.sub}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={{ paddingHorizontal: 16 }}>
              {/* Offer price card */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 16,
                  paddingHorizontal: 18,
                  borderRadius: 18,
                  borderWidth: 1.5,
                  borderColor: designTokens.colors.brand,
                  backgroundColor: 'rgba(84, 100, 69, 0.06)',
                  ...elevation.card,
                }}
              >
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 999,
                      backgroundColor: designTokens.colors.olive,
                      marginBottom: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 10,
                        color: '#F6F2E9',
                        letterSpacing: 0.4,
                        textTransform: 'uppercase',
                      }}
                    >
                      Limited-time offer
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 14,
                      color: colors.ink,
                      letterSpacing: -0.1,
                    }}
                  >
                    Monthly
                  </Text>
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 12,
                      color: designTokens.colors.ink3,
                      marginTop: 2,
                    }}
                  >
                    Cancel anytime
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 14,
                      color: designTokens.colors.ink3,
                      textDecorationLine: 'line-through',
                    }}
                  >
                    {ORIGINAL_MONTHLY}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 28,
                        color: colors.ink,
                        letterSpacing: -0.6,
                      }}
                    >
                      {OFFER_MONTHLY}
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 13,
                        color: designTokens.colors.ink2,
                        marginLeft: 3,
                      }}
                    >
                      /mo
                    </Text>
                  </View>
                </View>
              </View>

              {/* Primary CTA */}
              {isLoading ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator color={designTokens.colors.olive} />
                </View>
              ) : (
                <>
                  <Pressable
                    onPress={handlePurchase}
                    disabled={isPurchasing}
                    style={{ width: '100%', marginTop: 14 }}
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
                            <Crown size={18} color={designTokens.colors.cream} strokeWidth={1.9} />
                            <Text
                              style={{
                                fontFamily: designTokens.font.semibold,
                                fontSize: 16,
                                color: designTokens.colors.cream,
                                letterSpacing: -0.2,
                              }}
                            >
                              Continue with Premium
                            </Text>
                          </View>
                        )}
                      </View>
                    )}
                  </Pressable>

                  {/* Auto-renew disclosure — App Store reviewers expect this. */}
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

                  {/* Low-friction exit */}
                  <Pressable
                    onPress={handleClose}
                    hitSlop={6}
                    style={{
                      alignSelf: 'center',
                      marginTop: 14,
                      paddingVertical: 8,
                      paddingHorizontal: 16,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 14,
                        color: designTokens.colors.ink2,
                        letterSpacing: -0.1,
                      }}
                    >
                      Not now, continue free
                    </Text>
                  </Pressable>

                  {/* Restore link */}
                  <Pressable
                    onPress={handleRestore}
                    disabled={isRestoring}
                    hitSlop={6}
                    style={{
                      alignSelf: 'center',
                      marginTop: 2,
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
