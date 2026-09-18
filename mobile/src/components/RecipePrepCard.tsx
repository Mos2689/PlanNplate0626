// RecipePrepCard — the reserved grid tile for a dish the user named during
// onboarding, shown while its recipe is still being generated.
//
// When onboarding finishes, those dishes are built in the background. Each one
// used to appear at index 0 of a createdAt-sorted grid the moment it resolved,
// shoving every other card down a row — five dishes meant five unannounced
// jumps while the user was reading. This tile holds that dish's place from the
// first frame, carrying the name the user actually spoke.
//
// IT IS NOT A LOADING SKELETON. It renders exactly what the finished card will
// render — the same RecipePlaceholder art (these recipes deliberately ship
// without a photo; see lib/recipe-image.ts) and the same title in the same
// position. So when the real recipe lands, nothing visibly moves or swaps: the
// card simply gains its meta line and its quick-add buttons. A shimmer sweep
// and a "Preparing…" label were tried here first and read as machinery —
// announcing work the user did not ask to watch.
//
// GEOMETRY MUST TRACK RecipeGridCard. Width, margin, radius, border, the 1:1
// media square and the title inset are copied from it deliberately — any drift
// and the grid would shift at the exact moment we are trying to keep it still.

import React, { useEffect } from 'react';
import { View, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { designTokens, getThemeColors } from '@/lib/design-tokens';
import { RecipePlaceholder } from '@/components/RecipePlaceholder';

// Same expression as RecipeGridCard: 20px page padding ×2 + 12px column gap.
const GRID_CARD_W = (Dimensions.get('window').width - 40 - 12) / 2;

// A slow, shallow breath. Enough to read as alive, far too gentle to scan as a
// progress indicator — the banner above the grid already reports progress.
const BREATHE_MS = 2200;
const BREATHE_MIN = 0.72;

interface RecipePrepCardProps {
  /** The dish name exactly as the user spoke or typed it. */
  name: string;
  isDark?: boolean;
}

export const RecipePrepCard = React.memo(function RecipePrepCard({
  name,
  isDark = false,
}: RecipePrepCardProps) {
  const colors = getThemeColors(isDark);
  const reduced = useReducedMotion();

  const breath = useSharedValue(1);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(breath);
      breath.value = 1;
      return;
    }
    breath.value = withRepeat(
      withTiming(BREATHE_MIN, { duration: BREATHE_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(breath);
  }, [breath, reduced]);

  // Only the title breathes. Pulsing the whole tile would drag the placeholder
  // art with it and make the grid look like it is flickering.
  const titleStyle = useAnimatedStyle(() => ({ opacity: breath.value }));

  return (
    <Animated.View
      // A plain fade, no spring: the springify() the real cards use overshoots,
      // and five of them arriving out of order is what read as jerky.
      entering={FadeIn.duration(260)}
      style={{ width: GRID_CARD_W, marginBottom: 12 }}
      accessible
      accessibilityLabel={`${name}, being added to your recipes`}
    >
      <View
        style={{
          borderRadius: 16,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.hair,
          backgroundColor: colors.bg,
        }}
      >
        <View style={{ position: 'relative' }}>
          {/* The same art the finished card will show, so resolving is not a swap. */}
          <RecipePlaceholder style={{ width: '100%', aspectRatio: 1 }} />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.78)']}
            locations={[0.4, 1]}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: '38%' }}
            pointerEvents="none"
          />
          {/* `right: 84` matches the real card, where that gap holds the two
              quick-add buttons. Keeping it means the title does not shift by a
              pixel when those buttons appear. */}
          <View style={{ position: 'absolute', left: 10, right: 84, bottom: 10 }}>
            <Animated.Text
              numberOfLines={1}
              style={[
                titleStyle,
                {
                  fontFamily: designTokens.font.semibold,
                  fontSize: 14,
                  color: '#FFFFFF',
                  letterSpacing: -0.2,
                },
              ]}
            >
              {name}
            </Animated.Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
});
