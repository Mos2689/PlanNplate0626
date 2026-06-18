// PostSignupWelcome — the celebratory beat between signup success and the
// paywall sheet.
//
// Mounted globally in _layout.tsx alongside <PaywallSheet>. The signup
// screen fires `showPostSignupWelcome(firstName)` after auth succeeds,
// this component renders for ~1.2 s, then hides itself AND opens the
// 'onboarding' paywall — so the tone shifts from transactional ask to
// celebration ("Welcome, Mira. Your week is saved.") before the upsell.
//
// Not persisted. A force-quit during the welcome cleanly resets it.

import React, { useEffect } from 'react';
import { View, Text, Modal, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { designTokens } from '@/lib/design-tokens';

const WELCOME_DURATION_MS = 1200;

export function PostSignupWelcome() {
  const welcome = useSubscriptionStore((s) => s.postSignupWelcome);
  const hidePostSignupWelcome = useSubscriptionStore((s) => s.hidePostSignupWelcome);
  const openPaywallSheet = useSubscriptionStore((s) => s.openPaywallSheet);

  const visible = !!welcome?.visible;
  const name = welcome?.name ?? '';

  useEffect(() => {
    if (!visible) return;
    // One success haptic — replaces the haptic that used to fire in signup.tsx
    // so the user gets the buzz on the celebratory reveal, not on submit.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    let cancelled = false;
    const initial = setTimeout(() => {
      // After the welcome card, wait briefly for the subscription store to
      // resolve before deciding whether to open the paywall. A user signing
      // up with a store account that already holds the entitlement should
      // never see the upsell.
      const start = Date.now();
      const tick = () => {
        if (cancelled) return;
        const s = useSubscriptionStore.getState();
        const resolved = !s.isLoading && s._initializingUserId === null;
        const elapsed = Date.now() - start;
        if (!resolved && elapsed < 2500) {
          setTimeout(tick, 100);
          return;
        }
        hidePostSignupWelcome();
        if (!s.isPremium) openPaywallSheet('onboarding');
      };
      tick();
    }, WELCOME_DURATION_MS);

    return () => {
      cancelled = true;
      clearTimeout(initial);
    };
  }, [visible, hidePostSignupWelcome, openPaywallSheet]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <Animated.View entering={FadeInDown.springify()} style={styles.card}>
          <View style={styles.iconCircle}>
            <Check size={28} color={designTokens.colors.cream} strokeWidth={2.6} />
          </View>
          <Text style={styles.headline}>
            Welcome,{' '}
            <Text style={styles.headlineItalic}>{name}</Text>
            <Text style={styles.headline}>.</Text>
          </Text>
          <Text style={styles.subline}>Your week is saved.</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: designTokens.colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: designTokens.colors.olive,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: designTokens.colors.olive,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  headline: {
    fontFamily: designTokens.font.medium,
    fontSize: 28,
    color: designTokens.colors.ink,
    letterSpacing: -0.5,
    textAlign: 'center',
    lineHeight: 36,
  },
  headlineItalic: {
    fontFamily: designTokens.font.serifItalic,
    fontStyle: 'italic',
    fontSize: 32,
    letterSpacing: -0.4,
  },
  subline: {
    fontFamily: designTokens.font.regular,
    fontSize: 15,
    color: designTokens.colors.ink2,
    marginTop: 12,
    letterSpacing: -0.1,
    textAlign: 'center',
  },
});
