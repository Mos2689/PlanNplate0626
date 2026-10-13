// Free-week (rewarded-ad) status surfaces.
//
//   AdUnlockStatusCard  — Profile. During a free week: "Premium (Ad Unlock) ·
//                         ends Fri, 18 Oct". After it ends (D): "Free week ended"
//                         → opens the renewal sheet. Hidden for subscribers and
//                         for anyone who has never used a free week.
//   AdExpiryBanner      — Your Plate (B). Final 24 hours of a week, once per
//                         week: "Your free Premium week ends tomorrow".

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Crown, Clock, X, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { designTokens, getThemeColors } from '@/lib/design-tokens';
import { useColorScheme } from '@/lib/useColorScheme';
import { track } from '@/lib/analytics';
import { useIsPremium, useSubscriptionStore } from '@/lib/subscription-store';
import { useAdUnlockStore, useRerenderAt } from '@/lib/ad-unlock-store';
import { isUnlockActive, shouldShowExpiryBanner, EXPIRY_BANNER_MS } from '@/lib/ad-unlock-logic';
import { adUnlockAvailable } from '@/lib/rewarded-ad';

function formatEnd(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function AdUnlockStatusCard() {
  const isDark = useColorScheme() === 'dark';
  const colors = getThemeColors(isDark);
  const isPremium = useIsPremium();
  const unlockedUntil = useAdUnlockStore((s) => s.unlockedUntil);
  const unlockCount = useAdUnlockStore((s) => s.unlockCount);
  const openSheet = useAdUnlockStore((s) => s.openSheet);
  useRerenderAt(unlockedUntil);

  if (isPremium || unlockCount === 0 || unlockedUntil === null) return null;
  const active = isUnlockActive(unlockedUntil, Date.now());
  if (!active && !adUnlockAvailable()) return null;

  const onPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (active) {
      useSubscriptionStore.getState().openPaywallSheet('profile-banner');
    } else {
      track('ad_unlock_prompt_shown', { mode: 'renewal', trigger: 'profile-card' });
      openSheet('renewal');
    }
  };

  const bg = active
    ? isDark ? 'rgba(84,100,69,0.22)' : '#EEF2E6'
    : isDark ? 'rgba(228,109,70,0.18)' : '#FCE9E2';
  const titleColor = active ? colors.ink : isDark ? '#F0A48C' : '#B5412A';

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
      <Pressable onPress={onPress} accessibilityRole="button">
        {({ pressed }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              borderRadius: 20,
              padding: 14,
              backgroundColor: bg,
              transform: [{ scale: pressed ? 0.99 : 1 }],
            }}
          >
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                borderWidth: 1,
                borderColor: designTokens.colors.olive,
                backgroundColor: 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* The app's premium mark — same as the crown on the Profile header. */}
              <Crown size={20} color={designTokens.colors.olive} strokeWidth={1.7} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 16, color: titleColor }}>
                {active ? 'Premium (Ad Unlock)' : 'Free week ended'}
              </Text>
              <Text style={{ fontFamily: designTokens.font.regular, fontSize: 13, lineHeight: 18, color: colors.ink2, marginTop: 2 }}>
                {active
                  ? `Your free Premium week ends ${formatEnd(unlockedUntil)}`
                  : 'Watch a short video or go Premium to keep all features.'}
              </Text>
            </View>
            <ChevronRight size={20} color={colors.ink2} strokeWidth={1.8} />
          </View>
        )}
      </Pressable>
    </View>
  );
}

export function AdExpiryBanner() {
  const isDark = useColorScheme() === 'dark';
  const colors = getThemeColors(isDark);
  const isPremium = useIsPremium();
  const unlockedUntil = useAdUnlockStore((s) => s.unlockedUntil);
  const unlockCount = useAdUnlockStore((s) => s.unlockCount);
  const lastProactiveAt = useAdUnlockStore((s) => s.lastProactiveAt);
  const snoozeUntil = useAdUnlockStore((s) => s.snoozeUntil);
  const bannerDismissedFor = useAdUnlockStore((s) => s.bannerDismissedFor);
  const successShownFor = useAdUnlockStore((s) => s.successShownFor);
  const state = { unlockedUntil, unlockCount, lastProactiveAt, snoozeUntil, bannerDismissedFor, successShownFor };
  const openSheet = useAdUnlockStore((s) => s.openSheet);
  const dismissExpiryBanner = useAdUnlockStore((s) => s.dismissExpiryBanner);
  // Appear when the final 24 h starts, disappear when the week ends.
  useRerenderAt(state.unlockedUntil !== null ? state.unlockedUntil - EXPIRY_BANNER_MS : null);
  useRerenderAt(state.unlockedUntil);

  if (isPremium || !adUnlockAvailable() || !shouldShowExpiryBanner(state, Date.now())) return null;

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          borderRadius: 16,
          paddingVertical: 10,
          paddingLeft: 14,
          paddingRight: 10,
          backgroundColor: isDark ? 'rgba(214,160,60,0.18)' : '#FBF0D9',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(214,160,60,0.3)' : '#F1DFB4',
        }}
      >
        <Clock size={18} color={isDark ? '#E6C27A' : '#8A5A12'} strokeWidth={1.8} />
        <Text style={{ flex: 1, fontFamily: designTokens.font.regular, fontSize: 13, lineHeight: 18, color: colors.ink }}>
          Your free Premium week ends tomorrow.
        </Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            track('ad_unlock_prompt_shown', { mode: 'extend', trigger: 'expiry-banner' });
            dismissExpiryBanner();
            openSheet('extend');
          }}
          accessibilityRole="button"
        >
          {({ pressed }) => (
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: '#E46D46',
                backgroundColor: isDark ? 'transparent' : '#FFFFFF',
                opacity: pressed ? 0.8 : 1,
              }}
            >
              <Text style={{ fontFamily: designTokens.font.medium, fontSize: 12.5, color: '#D9573A' }}>Extend 7 days</Text>
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            track('ad_unlock_prompt_dismissed', { mode: 'expiry-banner' });
            dismissExpiryBanner();
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={{ padding: 4 }}
        >
          <X size={15} color={colors.ink3} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}
