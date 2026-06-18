// UnlockReminderPill — soft persistent re-prompt for signed-in non-premium
// users on the home tab.
//
// Sits above the HomeHeader. Stays visible all the time (per design
// decision) so the user has a steady, low-pressure path back to the paywall
// after they dismiss it. Returns null when:
//   • The user is still an anonymous guest (the signup gate fires instead).
//   • The user already has Premium access.
//   • A plan generation is mid-flight (let the PendingGenerationBanner own
//     the attention surface — don't stack two banners).

import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/lib/auth-store';
import { useHasPremiumAccess, useSubscriptionStore } from '@/lib/subscription-store';
import { useMealPlanStore } from '@/lib/store';
import { designTokens } from '@/lib/design-tokens';
import { logMetaEvent } from '@/lib/meta-sdk';

export function UnlockReminderPill() {
  const isAnonymous = useAuthStore((s) => s.isAnonymous);
  const hasPremiumAccess = useHasPremiumAccess();
  const openPaywallSheet = useSubscriptionStore((s) => s.openPaywallSheet);
  const pendingGeneration = useMealPlanStore((s) => s.pendingGeneration);

  const shouldRender = !isAnonymous && !hasPremiumAccess && !pendingGeneration;

  // Log shown event once per app session — a ref keeps it idempotent across
  // re-renders without thrashing analytics on every store update.
  const shownLoggedRef = useRef(false);
  useEffect(() => {
    if (shouldRender && !shownLoggedRef.current) {
      shownLoggedRef.current = true;
      logMetaEvent('unlock_pill_shown', {});
    }
  }, [shouldRender]);

  if (!shouldRender) return null;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    logMetaEvent('unlock_pill_tapped', {});
    openPaywallSheet('pnp-second-tap');
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(120).springify()}
      style={{ alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 }}
    >
      <Pressable onPress={handlePress}>
        {({ pressed }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: 'rgba(125, 121, 80, 0.10)',
              borderWidth: 1,
              borderColor: 'rgba(125, 121, 80, 0.16)',
              transform: [{ scale: pressed ? 0.97 : 1 }],
            }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 12.5,
                color: designTokens.colors.olive,
                letterSpacing: -0.05,
              }}
            >
              Do more with PnP
            </Text>
            <ChevronRight size={13} color={designTokens.colors.olive} strokeWidth={2} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
