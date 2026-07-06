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
import { designTokens, serifItalicFontStyle } from '@/lib/design-tokens';
import { t } from '@/lib/platform-tokens';

const WELCOME_DURATION_MS = 1200;

export function PostSignupWelcome() {
  const welcome = useSubscriptionStore((s) => s.postSignupWelcome);
  const hidePostSignupWelcome = useSubscriptionStore((s) => s.hidePostSignupWelcome);

  const visible = !!welcome?.visible;
  const name = welcome?.name ?? '';

  useEffect(() => {
    if (!visible) return;
    // One success haptic on the celebratory reveal.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Show the welcome card, then simply dismiss it. We deliberately do NOT
    // open the paywall after signup — the paywall now appears only when a
    // feature's monthly usage limit is exceeded (Plan My Meals, Vibe, Import,
    // Add recipe, Speak grocery) or when the user taps an upgrade CTA.
    const t = setTimeout(() => {
      hidePostSignupWelcome();
    }, WELCOME_DURATION_MS);

    return () => clearTimeout(t);
  }, [visible, hidePostSignupWelcome]);

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
    fontSize: t(28, 24),
    color: designTokens.colors.ink,
    letterSpacing: t(-0.5, -0.35),
    textAlign: 'center',
    lineHeight: t(36, 32),
  },
  headlineItalic: {
    fontFamily: designTokens.font.serifItalic,
    fontStyle: serifItalicFontStyle,
    fontSize: t(32, 28),
    letterSpacing: t(-0.4, -0.28),
  },
  subline: {
    fontFamily: designTokens.font.regular,
    fontSize: t(15, 14),
    color: designTokens.colors.ink2,
    marginTop: 12,
    letterSpacing: -0.1,
    textAlign: 'center',
  },
});
