// StickyScreenHeader — scroll-driven sticky compact header.
//
// Reusable header that fades in once the user scrolls past the editorial
// title block at the top of a screen. Pattern lifted from the recipes tab
// (src/app/(tabs)/recipes.tsx) so all the screens that used to feel
// "orphaned" (the curated meal plan flow) get the same affordance:
// title stays visible while scrolling, and a back chevron is always reachable.
//
// Usage:
//   const { scrollY, scrollHandler } = useStickyHeaderScroll();
//   return (
//     <View style={{ flex: 1 }}>
//       <SafeAreaView style={{ flex: 1 }} edges={['top']}>
//         <Animated.ScrollView onScroll={scrollHandler} scrollEventThrottle={16}>
//           {/* in-flow large title + content */}
//         </Animated.ScrollView>
//       </SafeAreaView>
//       <StickyScreenHeader scrollY={scrollY} title="Plans we've crafted" onBack={() => router.back()} />
//     </View>
//   );

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/lib/useColorScheme';
import { designTokens } from '@/lib/design-tokens';

interface StickyScreenHeaderProps {
  /** Shared value driven by the scroll handler from useStickyHeaderScroll(). */
  scrollY: SharedValue<number>;
  /** Title displayed centered when the header is fully visible. */
  title: string;
  /** Optional back handler; when omitted no chevron is rendered. */
  onBack?: () => void;
  /** Scroll px at which the fade starts. Default 80. */
  fadeStart?: number;
  /** Scroll px at which the header reaches full opacity. Default 140. */
  fadeEnd?: number;
}

/**
 * Hook companion to StickyScreenHeader. Returns the scrollY shared value and
 * a memoized animated scroll handler — feed both into the Animated.ScrollView /
 * Animated.FlatList that drives the screen, and pass scrollY into
 * <StickyScreenHeader />.
 */
export function useStickyHeaderScroll() {
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });
  return { scrollY, scrollHandler };
}

export function StickyScreenHeader({
  scrollY,
  title,
  onBack,
  fadeStart = 80,
  fadeEnd = 140,
}: StickyScreenHeaderProps) {
  const isDark = useColorScheme() === 'dark';
  const surfaceBg = isDark ? '#1a1a1a' : designTokens.colors.cream;
  const borderColor = isDark ? '#2a2a2a' : designTokens.colors.hair2;
  const ink = isDark ? '#fff' : designTokens.colors.ink;

  const overlayStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [fadeStart, fadeEnd],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const translateY = interpolate(
      scrollY.value,
      [fadeStart, fadeEnd],
      [-6, 0],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  const handleBack = () => {
    if (!onBack) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onBack();
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: surfaceBg,
          borderBottomWidth: 1,
          borderBottomColor: borderColor,
        },
        overlayStyle,
      ]}
    >
      <SafeAreaView edges={['top']}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            minHeight: 44,
          }}
        >
          {onBack ? (
            <Pressable
              onPress={handleBack}
              hitSlop={10}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeft size={22} color={ink} strokeWidth={1.9} />
            </Pressable>
          ) : (
            // Spacer matching the back-button footprint so the title stays
            // centered whether or not a back affordance is present.
            <View style={{ width: 36, height: 36 }} />
          )}

          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 15,
                color: ink,
                letterSpacing: -0.3,
                maxWidth: '85%',
              }}
            >
              {title}
            </Text>
          </View>

          {/* Right-side spacer keeps the title visually centered. */}
          <View style={{ width: 36, height: 36 }} />
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}
