// RecipePrepBanner — first-run status shown at the top of the Recipes tab
// while the dishes the user named during onboarding (step 1) are being built
// in the background. Mounted in (tabs)/recipes.tsx where the "your recipes are
// ready" nudge sits — this banner takes that slot while `recipePrep` is active,
// and hands back to the ready nudge once every dish has finished building.
//
// Reads `recipePrep` from the store ({ total, completed }). Renders null when
// there's nothing in flight, so callers can mount it unconditionally.
//
// Visual language mirrors the intro nudge: sage-tinted card, rounded icon disc,
// title + subtitle, plus a slim progress bar that fills as each recipe lands.

import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { CookingPot } from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { designTokens, easing } from '@/lib/design-tokens';
import { useMealPlanStore } from '@/lib/store';

const EASE = Easing.bezier(...easing.outStrong);

interface RecipePrepBannerProps {
  isDark?: boolean;
}

export function RecipePrepBanner({ isDark = false }: RecipePrepBannerProps) {
  const recipePrep = useMealPlanStore((s) => s.recipePrep);

  const total = recipePrep?.total ?? 0;
  const completed = Math.min(recipePrep?.completed ?? 0, total);
  const isDone = total > 0 && completed >= total;
  const progress = total > 0 ? completed / total : 0;

  // Animated fill for the progress bar (0..1 → width %).
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(progress, { duration: 420, easing: EASE });
  }, [progress, fill]);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, fill.value)) * 100}%`,
  }));

  // Gentle stirring wobble on the pot while dishes are still building.
  const wobble = useSharedValue(0);
  useEffect(() => {
    if (!isDone) {
      wobble.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          withTiming(-1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      );
    } else {
      cancelAnimation(wobble);
      wobble.value = withTiming(0, { duration: 200 });
    }
    return () => cancelAnimation(wobble);
  }, [isDone, wobble]);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${wobble.value * 12}deg` }],
  }));

  if (!recipePrep) return null;

  const title = isDone ? 'Your recipes are ready' : 'Creating your recipes';
  const subtitle = isDone
    ? "We've saved the dishes you told us about to your library."
    : "We're putting together the dishes you told us about. They'll show up here as each one is ready.";
  const countLabel = isDone ? `${total} added` : `${completed} of ${total} ready`;

  return (
    <Animated.View
      entering={FadeInDown.delay(80).springify()}
      exiting={FadeOut.duration(220)}
      style={{ paddingHorizontal: 20, paddingBottom: 16 }}
    >
      <View
        style={{
          flexDirection: 'row',
          gap: 12,
          paddingHorizontal: 13,
          paddingVertical: 13,
          borderRadius: 14,
          backgroundColor: isDark ? 'rgba(84,100,69,0.16)' : 'rgba(84,100,69,0.08)',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(139,155,120,0.28)' : 'rgba(84,100,69,0.18)',
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            backgroundColor: designTokens.colors.brand,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Animated.View style={iconStyle}>
            <CookingPot size={19} color={designTokens.colors.cream} strokeWidth={1.9} />
          </Animated.View>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 14.5,
                color: isDark ? '#cdd6c0' : '#2E3826',
                letterSpacing: -0.15,
              }}
              numberOfLines={1}
            >
              {title}
            </Text>
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 11.5,
                color: designTokens.colors.brand,
              }}
            >
              {countLabel}
            </Text>
          </View>

          <Text
            style={{
              marginTop: 3,
              fontFamily: designTokens.font.regular,
              fontSize: 12.5,
              lineHeight: 18,
              color: isDark ? '#a9a498' : designTokens.colors.ink2,
            }}
          >
            {subtitle}
          </Text>

          {/* Progress bar — fills as each dish lands. */}
          <View
            style={{
              marginTop: 11,
              height: 6,
              borderRadius: 999,
              overflow: 'hidden',
              backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(84,100,69,0.14)',
            }}
          >
            <Animated.View
              style={[
                {
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: designTokens.colors.brand,
                },
                fillStyle,
              ]}
            />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
