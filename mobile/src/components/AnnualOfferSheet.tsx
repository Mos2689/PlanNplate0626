// AnnualOfferSheet — the one-time "$29.99 for your first year" intro offer.
//
// Fires once, ever, the first time the paywall is dismissed without buying (the
// offer-funnel store gates this). The purchase is the SAME monthly $6.99 package
// (product monthly_sub_599); StoreKit applies its "pay up front, 1 year" intro
// automatically for eligible users, then renews at $6.99/month. We only ever
// show this to intro-eligible users, so the price we promise is the price they
// pay.

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, Modal, ScrollView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import {
  Crown, X, CalendarHeart, BookmarkPlus, Soup, ShoppingBasket, Lightbulb, Download,
  type LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { PurchasesPackage } from 'react-native-purchases';
import { getPackage, purchasePackage, restorePurchases, isRevenueCatEnabled } from '@/lib/revenuecatClient';
import { friendlyPurchaseError } from '@/lib/purchase-errors';
import { makeFailure, presentFailure } from '@/lib/failure';
import { useOfferFunnelStore } from '@/lib/offer-funnel-store';
import { designTokens, getThemeColors, serifItalicFontStyle } from '@/lib/design-tokens';
import { t } from '@/lib/platform-tokens';
import { track } from '@/lib/analytics';

const FEATURES: { title: string; Icon: LucideIcon }[] = [
  { title: 'Discover recipes', Icon: Lightbulb },
  { title: 'Smart shopping lists', Icon: ShoppingBasket },
  { title: 'Meal plans', Icon: CalendarHeart },
  { title: 'Save recipes', Icon: BookmarkPlus },
  { title: 'Import recipes', Icon: Download },
  { title: 'Smart Pantry meals', Icon: Soup },
];

// "AU$29.99" → "AU$0.57" (floored, so the per-week claim never overstates).
function perWeekString(priceString?: string | null): string | null {
  if (!priceString) return null;
  const m = priceString.match(/([^\d.,]*)\s*([\d.,]+)/);
  if (!m) return null;
  const prefix = m[1].trim();
  const num = parseFloat(m[2].replace(/,/g, ''));
  if (!isFinite(num) || num <= 0) return null;
  const weekly = Math.floor((num / 52) * 100) / 100;
  return `${prefix}${weekly.toFixed(2)}`;
}

export function AnnualOfferSheet({ isDark = false }: { isDark?: boolean }) {
  const visible = useOfferFunnelStore((s) => s.activeOffer === 'annual');
  const dismissAnnual = useOfferFunnelStore((s) => s.dismissAnnual);
  const markConverted = useOfferFunnelStore((s) => s.markConverted);

  const colors = getThemeColors(isDark);
  const sheetBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBg = isDark ? '#181818' : designTokens.colors.cream;
  const hair = isDark ? '#2a2a2a' : designTokens.colors.hair;

  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      if (!isRevenueCatEnabled()) { if (!cancelled) setLoading(false); return; }
      const res = await getPackage('$rc_monthly');
      if (cancelled) return;
      if (res.ok) setPkg(res.data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [visible]);

  useEffect(() => {
    if (visible) track('annual_offer_viewed', {});
  }, [visible]);

  const product: any = pkg?.product;
  const introPriceString: string = product?.introPrice?.priceString ?? 'AU$29.99';
  const standardPriceString: string = product?.priceString ?? 'AU$6.99';
  const perWeek = perWeekString(introPriceString);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    track('annual_offer_dismissed', {});
    dismissAnnual();
  }, [dismissAnnual]);

  const handleClaim = useCallback(async () => {
    if (!pkg) {
      presentFailure(makeFailure('not-configured', { feature: 'subscription' }));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    track('annual_offer_purchase_started', { package: pkg.product.identifier });
    setPurchasing(true);
    const result = await purchasePackage(pkg);
    setPurchasing(false);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      track('annual_offer_purchase_completed', { package: pkg.product.identifier });
      markConverted();
      Alert.alert(
        'Welcome to Premium!',
        'Your first year is unlocked. Meal plans, unlimited recipes and smart groceries — all yours.',
        [{ text: 'Get Started' }],
      );
    } else {
      const friendly = friendlyPurchaseError(result.reason, result.error as Error | undefined);
      track('annual_offer_purchase_failed', { reason: result.reason ?? 'unknown', cancelled: !friendly });
      if (!friendly) return; // user cancelled — keep the sheet open
      presentFailure(friendly, () => handleClaim());
    }
  }, [pkg, markConverted]);

  const handleRestore = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);
    if (result.ok && Object.keys(result.data.entitlements.active || {}).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      markConverted();
      Alert.alert('Restored', 'Your purchases have been restored.');
    } else if (result.ok) {
      presentFailure(makeFailure('validation', { feature: 'subscription-restore-empty' }));
    } else {
      presentFailure(makeFailure('unknown', { feature: 'subscription-restore' }), () => handleRestore());
    }
  }, [markConverted]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={handleClose} presentationStyle="overFullScreen" statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={[styles.sheet, { backgroundColor: sheetBg }]}>
          <View style={styles.handleWrap}><View style={styles.handle} /></View>
          <Pressable onPress={handleClose} hitSlop={10} style={[styles.x, { backgroundColor: designTokens.colors.hair2 }]}>
            <X size={16} color={colors.ink} strokeWidth={1.9} />
          </Pressable>

          <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            {/* Header */}
            <View style={{ paddingHorizontal: 24, paddingTop: 6, paddingBottom: 14 }}>
              <Text style={styles.eyebrow}>Exclusive</Text>
              <Text style={{ fontFamily: designTokens.font.medium, fontSize: t(27, 23), color: colors.ink, letterSpacing: t(-0.54, -0.38), lineHeight: t(33, 29) }}>
                Just for{' '}
                <Text style={{ fontFamily: designTokens.font.serifItalic, fontStyle: serifItalicFontStyle, fontSize: t(31, 27) }}>you</Text>
              </Text>
            </View>

            {/* Price block */}
            <View style={{ paddingHorizontal: 20 }}>
              <View style={{ borderWidth: 1, borderColor: hair, borderRadius: 18, backgroundColor: cardBg, padding: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  {loading ? (
                    <ActivityIndicator color={designTokens.colors.brand} />
                  ) : (
                    <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 32, color: colors.ink, letterSpacing: -0.5 }}>
                      {introPriceString}
                    </Text>
                  )}
                  <View style={{ marginLeft: 'auto', backgroundColor: designTokens.colors.olive, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 }}>
                    <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 12, color: '#fff' }}>One-time offer</Text>
                  </View>
                </View>
                <Text style={{ marginTop: 8, fontFamily: designTokens.font.regular, fontSize: 12.5, color: colors.ink2 }}>
                  Your first year for {introPriceString}.{perWeek ? ` Just ${perWeek}/week.` : ''}
                </Text>
              </View>
            </View>

            {/* Features */}
            <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
              {FEATURES.map(({ title, Icon }, i) => (
                <View key={title} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: hair }}>
                  <Icon size={20} color={designTokens.colors.brand} strokeWidth={1.7} />
                  <Text style={{ fontFamily: designTokens.font.medium, fontSize: 15, color: colors.ink }}>{title}</Text>
                  <View style={{ marginLeft: 'auto', backgroundColor: isDark ? '#242a1e' : '#EEF1E9', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 }}>
                    <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 12, color: isDark ? '#b9c7a5' : '#41502F' }}>Unlimited</Text>
                  </View>
                </View>
              ))}
            </View>

          </ScrollView>

          {/* Pinned CTA footer — a solid sage button, always visible and clear
              of the home indicator regardless of content height. */}
          <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 30, borderTopWidth: 1, borderTopColor: hair, backgroundColor: sheetBg }}>
            <Pressable onPress={handleClaim} disabled={purchasing || loading} style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
              backgroundColor: designTokens.colors.brand, borderRadius: 999, paddingVertical: 16,
              opacity: purchasing ? 0.8 : pressed ? 0.9 : 1,
            })}>
              {purchasing ? <ActivityIndicator color={designTokens.colors.cream} /> : (
                <>
                  <Crown size={19} color={designTokens.colors.cream} strokeWidth={1.8} />
                  <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 16, color: designTokens.colors.cream }}>Claim one-time offer</Text>
                </>
              )}
            </Pressable>
            <Text style={{ marginTop: 12, textAlign: 'center', fontFamily: designTokens.font.regular, fontSize: 12, lineHeight: 18, color: colors.ink3 }}>
              {introPriceString} for the first year, then {standardPriceString}/month. Auto-renews. Cancel anytime in Settings.
            </Text>
            <Pressable onPress={handleRestore} hitSlop={8} style={{ marginTop: 11, alignItems: 'center' }}>
              <Text style={{ fontFamily: designTokens.font.regular, fontSize: 13, color: colors.ink2, textDecorationLine: 'underline' }}>
                {restoring ? 'Restoring…' : 'Restore purchases'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, maxHeight: '92%', paddingBottom: 18, overflow: 'hidden' },
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { width: 36, height: 5, borderRadius: 999, backgroundColor: '#D8D4C9' },
  x: { position: 'absolute', top: 16, right: 14, width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  eyebrow: { fontFamily: designTokens.font.semibold, fontSize: 10.5, letterSpacing: 1.3, textTransform: 'uppercase', color: designTokens.colors.olive, marginBottom: 8 },
});
