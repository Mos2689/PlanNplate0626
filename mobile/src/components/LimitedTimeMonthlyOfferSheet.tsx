// LimitedTimeMonthlyOfferSheet — the 24-hour "$3.99/month, today only" offer.
//
// Fires ~30 days after the annual offer is dismissed, inside a 24-hour window
// (the offer-funnel store owns the timing). Purchases the SEPARATE discounted
// product monthly_sub_3.99. A live countdown to the window end drives the
// urgency; when it hits zero the sheet closes and the funnel ends.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, Pressable, Modal, ScrollView, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import {
  Crown, X, CalendarHeart, ShoppingBasket, Lightbulb, Download, type LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { PurchasesPackage } from 'react-native-purchases';
import {
  getPackage, getPackageByProductId, purchasePackage, restorePurchases, isRevenueCatEnabled,
} from '@/lib/revenuecatClient';
import { friendlyPurchaseError } from '@/lib/purchase-errors';
import { makeFailure, presentFailure } from '@/lib/failure';
import { useOfferFunnelStore } from '@/lib/offer-funnel-store';
import { designTokens, getThemeColors, serifItalicFontStyle } from '@/lib/design-tokens';
import { t } from '@/lib/platform-tokens';
import { track } from '@/lib/analytics';

const PROMO_PRODUCT_ID = 'monthly_sub_3.99';

const FEATURES: { title: string; Icon: LucideIcon }[] = [
  { title: 'Discover recipes', Icon: Lightbulb },
  { title: 'Meal plans', Icon: CalendarHeart },
  { title: 'Smart shopping lists', Icon: ShoppingBasket },
  { title: 'Import recipes', Icon: Download },
];

const pad = (n: number) => String(n).padStart(2, '0');
function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

export function LimitedTimeMonthlyOfferSheet({ isDark = false }: { isDark?: boolean }) {
  const visible = useOfferFunnelStore((s) => s.activeOffer === 'monthly');
  const dismissMonthly = useOfferFunnelStore((s) => s.dismissMonthly);
  const markConverted = useOfferFunnelStore((s) => s.markConverted);
  const windowEnd = useOfferFunnelStore((s) => s.monthlyWindowEnd);

  const colors = getThemeColors(isDark);
  const sheetBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBg = isDark ? '#181818' : designTokens.colors.cream;
  const hair = isDark ? '#2a2a2a' : designTokens.colors.hair;

  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pkg, setPkg] = useState<PurchasesPackage | null>(null);
  const [wasPriceString, setWasPriceString] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number>(() => {
    const end = windowEnd();
    return end == null ? 0 : Math.max(0, end - Date.now());
  });
  const expiredRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      if (!isRevenueCatEnabled()) { if (!cancelled) setLoading(false); return; }
      const [promo, standard] = await Promise.all([
        getPackageByProductId(PROMO_PRODUCT_ID),
        getPackage('$rc_monthly'),
      ]);
      if (cancelled) return;
      if (promo.ok) setPkg(promo.data);
      if (standard.ok && standard.data) setWasPriceString(standard.data.product.priceString ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [visible]);

  useEffect(() => {
    if (visible) { track('monthly_offer_viewed', {}); expiredRef.current = false; }
  }, [visible]);

  // Live countdown — closes the sheet when the window elapses.
  useEffect(() => {
    if (!visible) return;
    const tick = () => {
      const end = windowEnd();
      const left = end == null ? 0 : Math.max(0, end - Date.now());
      setRemaining(left);
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        dismissMonthly();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [visible, windowEnd, dismissMonthly]);

  const promoPriceString: string = pkg?.product.priceString ?? 'AU$3.99';

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    track('monthly_offer_dismissed', {});
    dismissMonthly();
  }, [dismissMonthly]);

  const handleGet = useCallback(async () => {
    if (!pkg) { presentFailure(makeFailure('not-configured', { feature: 'subscription' })); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    track('monthly_offer_purchase_started', { package: pkg.product.identifier });
    setPurchasing(true);
    const result = await purchasePackage(pkg);
    setPurchasing(false);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      track('monthly_offer_purchase_completed', { package: pkg.product.identifier });
      markConverted();
      Alert.alert('Welcome to Premium!', 'Your subscription is active — enjoy everything PlanNplate.', [{ text: 'Get Started' }]);
    } else {
      const friendly = friendlyPurchaseError(result.reason, result.error as Error | undefined);
      track('monthly_offer_purchase_failed', { reason: result.reason ?? 'unknown', cancelled: !friendly });
      if (!friendly) return;
      presentFailure(friendly, () => handleGet());
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

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            <View style={{ paddingHorizontal: 24, paddingTop: 6, paddingBottom: 12 }}>
              <Text style={styles.eyebrow}>24-hour offer</Text>
              <Text style={{ fontFamily: designTokens.font.medium, fontSize: t(27, 23), color: colors.ink, letterSpacing: t(-0.54, -0.38), lineHeight: t(33, 29) }}>
                {promoPriceString}/month,{' '}
                <Text style={{ fontFamily: designTokens.font.serifItalic, fontStyle: serifItalicFontStyle, fontSize: t(31, 27) }}>today only</Text>
              </Text>

              {/* Countdown chip */}
              <View style={{ marginTop: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'rgba(228,109,70,0.10)', borderWidth: 1, borderColor: 'rgba(228,109,70,0.32)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: designTokens.colors.oliveDeep }}>Ends in</Text>
                <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 15, color: designTokens.colors.oliveDeep, fontVariant: ['tabular-nums'] }}>{formatRemaining(remaining)}</Text>
              </View>
            </View>

            {/* Price block */}
            <View style={{ paddingHorizontal: 20 }}>
              <View style={{ borderWidth: 1, borderColor: hair, borderRadius: 18, backgroundColor: cardBg, padding: 16, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
                {loading ? <ActivityIndicator color={designTokens.colors.brand} /> : (
                  <>
                    {wasPriceString ? (
                      <Text style={{ fontFamily: designTokens.font.regular, fontSize: 16, color: colors.ink3, textDecorationLine: 'line-through' }}>{wasPriceString}</Text>
                    ) : null}
                    <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 32, color: colors.ink, letterSpacing: -0.5 }}>{promoPriceString}</Text>
                    <Text style={{ fontFamily: designTokens.font.regular, fontSize: 14, color: colors.ink2 }}>/ month</Text>
                  </>
                )}
                <View style={{ marginLeft: 'auto', backgroundColor: designTokens.colors.olive, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, alignSelf: 'center' }}>
                  <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 12, color: '#fff' }}>Today only</Text>
                </View>
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

            {/* CTA */}
            <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
              <Pressable onPress={handleGet} disabled={purchasing || loading} style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
                backgroundColor: designTokens.colors.brand, borderRadius: 999, paddingVertical: 16,
                opacity: purchasing || loading ? 0.7 : pressed ? 0.9 : 1,
              })}>
                {purchasing ? <ActivityIndicator color={designTokens.colors.cream} /> : (
                  <>
                    <Crown size={19} color={designTokens.colors.cream} strokeWidth={1.8} />
                    <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 16, color: designTokens.colors.cream }}>Get {promoPriceString}/month</Text>
                  </>
                )}
              </Pressable>
              <Text style={{ marginTop: 12, textAlign: 'center', fontFamily: designTokens.font.regular, fontSize: 12, lineHeight: 18, color: colors.ink3 }}>
                {promoPriceString}/month while the offer is active. Auto-renews. Cancel anytime in Settings.
              </Text>
              <Pressable onPress={handleRestore} hitSlop={8} style={{ marginTop: 11, alignItems: 'center' }}>
                <Text style={{ fontFamily: designTokens.font.regular, fontSize: 13, color: colors.ink2, textDecorationLine: 'underline' }}>
                  {restoring ? 'Restoring…' : 'Restore purchases'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
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
