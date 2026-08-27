// ManageMembershipSheet — the PREMIUM counterpart to PaywallSheet.
//
// Mounted globally in src/app/_layout.tsx. A paying member's membership entry
// points (the profile crown, the "Manage" buttons) call
// `useSubscriptionStore.getState().openManageMembership()` to bring this up —
// NOT the sales paywall. A subscriber should never be shown "buy Premium"
// pricing again; they see their status and a route to manage/cancel instead.
//
// Contents: current plan + renewal/expiry status, a short benefits recap, a
// "Manage subscription" button that opens the STORE-native management screen
// (Apple/Google require cancellation and plan changes to happen there, not
// in-app), and Restore purchases. No price tiers, no purchase CTA.
//
// Brand rules mirror PaywallSheet: olive eyebrow + italic headline word, sage
// accents, scale-free sliding sheet, X to dismiss.

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
  Linking,
  Platform,
} from 'react-native';
import {
  Crown,
  X,
  Check,
  ExternalLink,
  RotateCcw,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  getManagementInfo,
  restorePurchases,
  isRevenueCatEnabled,
  type SubscriptionManagementInfo,
} from '@/lib/revenuecatClient';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { designTokens, getThemeColors, serifItalicFontStyle } from '@/lib/design-tokens';
import { t } from '@/lib/platform-tokens';
import { track } from '@/lib/analytics';

// The store-native subscription management URLs, used when RevenueCat doesn't
// hand back a specific managementURL for this customer.
const STORE_MANAGE_URL =
  Platform.OS === 'android'
    ? 'https://play.google.com/store/account/subscriptions'
    : 'https://apps.apple.com/account/subscriptions';

// Everything a Premium member keeps. This is a reassurance recap, not an
// unlock pitch — no caps, no prices.
const BENEFITS: string[] = [
  'Unlimited AI meal plans',
  'Unlimited recipe imports & saves',
  'Smart Pantry meals',
  'Smart shopping lists',
];

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// A friendly plan name from the store product id (e.g. "monthly_sub_599" →
// "Premium · Monthly"). Falls back to plain "Premium".
function planLabel(productId: string | null): string {
  if (!productId) return 'Premium';
  const p = productId.toLowerCase();
  if (p.includes('annual') || p.includes('year')) return 'Premium · Annual';
  if (p.includes('month')) return 'Premium · Monthly';
  return 'Premium';
}

// One human line describing where the subscription stands.
function statusLine(info: SubscriptionManagementInfo | null): string {
  if (!info) return 'Active';
  const date = formatDate(info.expirationDate);
  if (!date) return 'Active';
  if (info.willRenew) return `Renews on ${date}`;
  return `Access until ${date} — won't renew`;
}

interface ManageMembershipSheetProps {
  isDark?: boolean;
}

export function ManageMembershipSheet({ isDark = false }: ManageMembershipSheetProps) {
  const visible = useSubscriptionStore((s) => s.manageMembershipVisible);
  const closeSheet = useSubscriptionStore((s) => s.closeManageMembership);

  const colors = getThemeColors(isDark);
  const sheetBg = isDark ? '#1f1f1f' : '#FFFFFF';

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<SubscriptionManagementInfo | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Load the subscription snapshot each time the sheet opens, so renewal dates
  // and auto-renew state are current (they can change in the store between
  // opens). RevenueCat unavailable (e.g. dev/test store) → render the recap
  // and the store link without a status card.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setInfo(null);
    (async () => {
      const res = await getManagementInfo();
      if (cancelled) return;
      setInfo(res.ok ? res.data : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    closeSheet();
  }, [closeSheet]);

  const handleManage = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    track('manage_subscription_opened', { store: info?.store ?? Platform.OS });
    const url = info?.managementURL ?? STORE_MANAGE_URL;
    Linking.openURL(url).catch(() => {
      Linking.openURL(STORE_MANAGE_URL).catch(() => {});
    });
  }, [info]);

  const handleRestore = useCallback(async () => {
    if (restoring) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRestoring(true);
    try {
      const result = await restorePurchases();
      if (result.ok) {
        // Refresh the status snapshot after a restore.
        const refreshed = await getManagementInfo();
        setInfo(refreshed.ok ? refreshed.data : info);
        Alert.alert('Restored', 'Your purchases have been restored.');
      } else {
        Alert.alert('Nothing to restore', 'We couldn’t find any purchases to restore on this account.');
      }
    } finally {
      setRestoring(false);
    }
  }, [restoring, info]);

  const showStatusCard = isRevenueCatEnabled() && (loading || info !== null);

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
            contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 26 }}
          >
            {/* Eyebrow */}
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 12,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                color: designTokens.colors.olive,
                marginTop: 6,
              }}
            >
              Membership
            </Text>

            {/* Headline */}
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: t(30, 26),
                color: colors.ink,
                letterSpacing: t(-0.6, -0.45),
                marginTop: 8,
                lineHeight: t(35, 31),
              }}
            >
              You’re{' '}
              <Text
                style={{
                  fontFamily: designTokens.font.serifItalic,
                  fontStyle: serifItalicFontStyle,
                }}
              >
                Premium
              </Text>
            </Text>

            {/* Status card */}
            {showStatusCard && (
              <View
                style={{
                  marginTop: 18,
                  backgroundColor: designTokens.colors.brand,
                  borderRadius: 20,
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Crown size={18} color="#F4C76A" strokeWidth={1.9} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 16,
                        color: '#F6F2E9',
                        letterSpacing: -0.2,
                      }}
                      numberOfLines={1}
                    >
                      {loading ? 'PlannPlate Premium' : planLabel(info?.productIdentifier ?? null)}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                      {loading ? (
                        <ActivityIndicator size="small" color="rgba(246,242,233,0.7)" />
                      ) : (
                        <>
                          <CalendarClock size={12} color="rgba(246,242,233,0.7)" strokeWidth={1.9} />
                          <Text
                            style={{
                              fontFamily: designTokens.font.regular,
                              fontSize: 13,
                              color: 'rgba(246,242,233,0.75)',
                            }}
                            numberOfLines={1}
                          >
                            {statusLine(info)}
                          </Text>
                        </>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Benefits recap */}
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 12,
                letterSpacing: 1.1,
                textTransform: 'uppercase',
                color: colors.ink3,
                marginTop: 24,
                marginBottom: 10,
              }}
            >
              Everything you get
            </Text>
            <View style={{ gap: 11 }}>
              {BENEFITS.map((b) => (
                <View key={b} style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      backgroundColor: designTokens.colors.olive,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Check size={13} color="#FFFFFF" strokeWidth={2.4} />
                  </View>
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 15,
                      color: colors.ink,
                      letterSpacing: -0.1,
                    }}
                  >
                    {b}
                  </Text>
                </View>
              ))}
            </View>

            {/* Primary: manage subscription (store-native) */}
            <Pressable
              onPress={handleManage}
              style={{
                marginTop: 26,
                height: 54,
                borderRadius: 16,
                backgroundColor: designTokens.colors.brand,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <ExternalLink size={17} color="#F6F2E9" strokeWidth={2} />
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 16,
                  color: '#F6F2E9',
                  letterSpacing: -0.1,
                }}
              >
                Manage subscription
              </Text>
            </Pressable>
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 12.5,
                color: colors.ink3,
                textAlign: 'center',
                marginTop: 10,
                lineHeight: 17,
              }}
            >
              {Platform.OS === 'android'
                ? 'Cancel or change your plan in Google Play. Your access continues until the current period ends.'
                : 'Cancel or change your plan in the App Store. Your access continues until the current period ends.'}
            </Text>

            {/* Secondary: restore */}
            <Pressable
              onPress={handleRestore}
              disabled={restoring}
              style={{
                marginTop: 14,
                height: 46,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                opacity: restoring ? 0.6 : 1,
              }}
            >
              <RotateCcw size={14} color={colors.ink2} strokeWidth={1.9} />
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 14,
                  color: colors.ink2,
                  letterSpacing: -0.05,
                }}
              >
                {restoring ? 'Restoring…' : 'Restore purchases'}
              </Text>
            </Pressable>
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
