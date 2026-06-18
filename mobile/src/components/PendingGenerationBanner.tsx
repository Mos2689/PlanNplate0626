// PendingGenerationBanner — top-of-tab status while recipes stream in.
// Mounted in (tabs)/index.tsx between the greeting block and the meal cards.
//
// Visual anatomy:
//
//   [🍲] CRAFTING YOUR WEEK · DAY 2 OF 7                  (olive eyebrow caps)
//        Crafting your recipes                            (stage caption)
//   ━━━ ━━━ ━─░ ░░░ ░░░ ░░░ ░░░                          (segmented pills)
//        full full partial+shimmer  empty…                (sub-fill within each pill)
//
// Pill model — driven by `progress: 0..1`:
//   • progress === 0     → empty (hair-color background)
//   • 0 < progress < 1   → sub-filled (sage width animates smoothly)
//                          Plus shimmer overlay on the FIRST such pill
//                          (the "active" day the engine is currently
//                          working on).
//   • progress === 1     → fully sage. On the transition, scale-Y pops
//                          (1 → 1.5 → 1) to mark "day complete."
//
// Each recipe arrival ticks the corresponding pill forward by
// (1 / mealTypesPerDay). So with 3 meal types per day, pill fills in
// thirds: 33% → 67% → 100% (pop). Every recipe is a visible tick — no
// long waits for "the whole day" to complete.

import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  LayoutChangeEvent,
  Animated as RNAnimated,
  Easing as RNEasing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CookingPot, Check, AlertCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInUp,
  FadeOutUp,
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  withSpring,
  Easing,
  cancelAnimation,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useMealPlanStore } from '@/lib/store';
import { designTokens, easing, elevation, getThemeColors } from '@/lib/design-tokens';

interface PendingGenerationBannerProps {
  isDark?: boolean;
}

const EASE = Easing.bezier(...easing.outStrong);

// Rotating caption pools — make the banner feel alive by cycling
// through evocative food-themed micro-copy while the engine works.
// Lines stay short (≤32 chars) so they fit on one line. Lowercase
// trailing ellipsis adds the "still going" feel; punctuation kept
// soft (no exclamation marks) to match the brand voice.
const GENERATING_CAPTIONS = [
  'Crafting your recipes',
  'Browsing your pantry…',
  'Picking fresh produce…',
  'Toasting the spices…',
  'Balancing flavours…',
  'Stirring something good…',
  'Tasting and adjusting…',
  'Plotting tomorrow already…',
  'Sourcing the right cut…',
  'Folding in the herbs…',
];

const FINALIZING_CAPTIONS = [
  'Plating up the images',
  'Garnishing for the camera…',
  'Adjusting the lighting…',
  'Final styling touch…',
  'Wiping the plate edges…',
  'One last seasoning pass…',
];

// Pure helper so the rotating-caption logic is testable without React.
// Picks the next index from a pool, avoiding the current one when
// possible — gives a "shuffled" feel without consecutive repeats.
function nextCaptionIndex(currentIdx: number, poolSize: number): number {
  if (poolSize <= 1) return 0;
  let candidate = Math.floor(Math.random() * poolSize);
  if (candidate === currentIdx) {
    candidate = (candidate + 1) % poolSize;
  }
  return candidate;
}

function staticCaption(
  stage: 'starting' | 'done' | 'failed',
): string {
  switch (stage) {
    case 'starting':
      return 'Starting…';
    case 'done':
      return 'Plan ready';
    case 'failed':
      return 'Something hiccuped — tap to retry';
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — single segmented day pill, progress-driven
// ───────────────────────────────────────────────────────────────────────────────

interface DayPillProps {
  progress: number;   // 0..1 — share of this day's meals that have landed
  isActive: boolean;  // true if this is the first pill where progress < 1
  width: number;
}

function DayPill({ progress, isActive, width }: DayPillProps) {
  // Width of the inner sage fill (tweened on every progress change)
  const fillWidth = useSharedValue(0);
  // scaleY drives the pop animation when the pill crosses to 100%
  const scaleY = useSharedValue(1);
  // Shimmer translateX for the active pill
  const shimmerX = useSharedValue(-1);
  // Track whether we've crossed to "full" so we only pop once per pill
  const wasFullRef = useRef(false);

  // Tween the sub-fill width whenever progress changes
  useEffect(() => {
    const target = Math.max(0, Math.min(1, progress)) * width;
    fillWidth.value = withTiming(target, {
      duration: 360,
      easing: EASE,
    });
    // Trigger pop on the 1.0 crossover (only once)
    const justBecameFull = progress >= 1 && !wasFullRef.current;
    if (justBecameFull) {
      wasFullRef.current = true;
      scaleY.value = withSequence(
        withTiming(1.5, { duration: 140, easing: EASE }),
        withSpring(1, { damping: 12, stiffness: 200 }),
      );
    } else if (progress < 1) {
      wasFullRef.current = false;
    }
  }, [progress, width, fillWidth, scaleY]);

  // Shimmer loop — runs only while this pill is the active one
  useEffect(() => {
    if (isActive) {
      shimmerX.value = -1;
      shimmerX.value = withRepeat(
        withTiming(1, { duration: 1200, easing: EASE }),
        -1,
        false,
      );
    } else {
      cancelAnimation(shimmerX);
      shimmerX.value = -1;
    }
    return () => {
      cancelAnimation(shimmerX);
    };
  }, [isActive, shimmerX]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: scaleY.value }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: fillWidth.value,
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value * width }],
  }));

  return (
    <Animated.View
      style={[
        {
          width,
          height: 6,
          borderRadius: 999,
          backgroundColor: designTokens.colors.hair,
          overflow: 'hidden',
        },
        containerStyle,
      ]}
    >
      {/* Sage sub-fill — animates width smoothly per progress change */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            borderRadius: 999,
            backgroundColor: designTokens.colors.brand,
          },
          fillStyle,
        ]}
      />

      {/* Shimmer overlay — only on the active pill. Sits on TOP of the
          sub-fill so the user sees both "how far we've gotten" + a live
          "working on it now" sweep. */}
      {isActive && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: '100%',
            },
            shimmerStyle,
          ]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={[
              'rgba(84, 100, 69, 0)',
              'rgba(84, 100, 69, 0.55)',
              'rgba(84, 100, 69, 0)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
    </Animated.View>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ───────────────────────────────────────────────────────────────────────────────

export function PendingGenerationBanner({ isDark = false }: PendingGenerationBannerProps) {
  const router = useRouter();
  const pending = useMealPlanStore((s) => s.pendingGeneration);
  const colors = getThemeColors(isDark);
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;

  // Icon motion — built on React Native's classic `Animated` API
  // (NOT Reanimated). Multiple Reanimated patterns failed to render
  // motion on this specific element in production, so we use the
  // battle-tested native-driver path here. The outer banner still uses
  // Reanimated's layout animations (FadeInUp/FadeOutUp) — only the
  // icon glyph swaps to the built-in Animated.
  //
  // Single driver `iconT` ramps 0 → 1 → 0 forever. We interpolate it
  // into three transform axes at the View level:
  //   • scale     1 → 1.22 (24% growth, unmissable)
  //   • rotate   -15° → 15° (stirring wobble)
  //   • translateY 0 → -3 (subtle bob, like a lid lifting)
  // useNativeDriver:true keeps the loop running on the UI thread off
  // the JS bridge — 60fps even under heavy generation work.
  const isInFlight =
    pending?.active === true &&
    pending.stage !== 'done' &&
    pending.stage !== 'failed';

  const iconT = useRef(new RNAnimated.Value(0)).current;
  const loopRef = useRef<RNAnimated.CompositeAnimation | null>(null);

  useEffect(() => {
    // Stop any previous loop before deciding what to do next.
    if (loopRef.current) {
      loopRef.current.stop();
      loopRef.current = null;
    }
    if (isInFlight) {
      iconT.setValue(0);
      const loop = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(iconT, {
            toValue: 1,
            duration: 900,
            easing: RNEasing.inOut(RNEasing.quad),
            useNativeDriver: true,
          }),
          RNAnimated.timing(iconT, {
            toValue: 0,
            duration: 900,
            easing: RNEasing.inOut(RNEasing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      loopRef.current = loop;
      loop.start();
    } else {
      RNAnimated.timing(iconT, {
        toValue: 0,
        duration: 220,
        easing: RNEasing.out(RNEasing.quad),
        useNativeDriver: true,
      }).start();
    }
    return () => {
      if (loopRef.current) {
        loopRef.current.stop();
        loopRef.current = null;
      }
    };
  }, [isInFlight, iconT]);

  // Three transform outputs — all driven by the same iconT 0..1 ramp.
  // Using `interpolate` on the Animated.Value keeps everything on the
  // native side via useNativeDriver.
  const iconScale = iconT.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.22],
  });
  const iconRotate = iconT.interpolate({
    inputRange: [0, 1],
    outputRange: ['-15deg', '15deg'],
  });
  const iconTranslateY = iconT.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -3, 0],
  });

  // ─── Rotating caption ──────────────────────────────────────────────
  // While we're in `generating` or `finalizing`, cycle through evocative
  // food-themed micro-copy every ~3.5s. Makes the banner feel like the
  // chef is actually doing things rather than a frozen spinner. Static
  // stages (`starting` / `done` / `failed`) use their fixed line.
  const [captionIdx, setCaptionIdx] = React.useState(0);
  // Reset the index whenever we enter a new rotating stage so the
  // sequence starts fresh (and the first message is the canonical one).
  React.useEffect(() => {
    if (pending?.stage === 'generating' || pending?.stage === 'finalizing') {
      setCaptionIdx(0);
    }
  }, [pending?.stage]);
  React.useEffect(() => {
    const stage = pending?.stage;
    if (stage !== 'generating' && stage !== 'finalizing') return;
    const pool =
      stage === 'generating' ? GENERATING_CAPTIONS : FINALIZING_CAPTIONS;
    const id = setInterval(() => {
      setCaptionIdx((prev) => nextCaptionIndex(prev, pool.length));
    }, 3500);
    return () => clearInterval(id);
  }, [pending?.stage]);

  const captionText = (() => {
    const stage = pending?.stage;
    if (!stage) return '';
    if (stage === 'generating') {
      return GENERATING_CAPTIONS[captionIdx % GENERATING_CAPTIONS.length];
    }
    if (stage === 'finalizing') {
      return FINALIZING_CAPTIONS[captionIdx % FINALIZING_CAPTIONS.length];
    }
    return staticCaption(stage);
  })();

  // Measure container width so each pill = (rowWidth - (n-1)*gap) / n
  const [rowWidth, setRowWidth] = React.useState(0);
  const handleRowLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== rowWidth) setRowWidth(w);
  };

  const days = pending?.days ?? 0;
  const completedDays = pending?.completedDays ?? 0;
  const mealTypesPerDay = pending?.mealTypesPerDay ?? 1;
  const dayRecipeCounts = pending?.dayRecipeCounts ?? [];
  const PILL_GAP = 6;
  const pillWidth = useMemo(() => {
    if (!rowWidth || !days) return 0;
    const totalGap = PILL_GAP * Math.max(0, days - 1);
    return Math.max(8, Math.floor((rowWidth - totalGap) / days));
  }, [rowWidth, days]);

  // Find the first not-yet-full pill — that's the "active" one that
  // shimmers. Once everything is full, no pill is active.
  const activePillIdx = useMemo(() => {
    if (!pending) return -1;
    if (pending.stage === 'done') return -1;
    for (let i = 0; i < days; i++) {
      if ((dayRecipeCounts[i] ?? 0) < mealTypesPerDay) return i;
    }
    return -1;
  }, [pending, days, dayRecipeCounts, mealTypesPerDay]);

  if (!pending) return null;

  const isFailed = pending.stage === 'failed';
  const isDone = pending.stage === 'done';

  const eyebrowText = isFailed
    ? 'PLAN PAUSED'
    : isDone
      ? `PLAN READY · ${days} OF ${days}`
      : `CRAFTING YOUR WEEK · DAY ${Math.min(completedDays + 1, days)} OF ${days}`;

  const handleRetry = () => {
    if (!isFailed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/plan-meals');
  };

  return (
    <Animated.View
      entering={FadeInUp.springify().damping(18).stiffness(220)}
      exiting={FadeOutUp.duration(220).easing(EASE)}
      style={{
        marginHorizontal: 16,
        marginTop: 6,
        marginBottom: 12,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: cardBorder,
        backgroundColor: colors.bg,
        paddingHorizontal: 14,
        paddingTop: 14,
        paddingBottom: 16,
        ...elevation.card,
      }}
    >
      <Pressable
        onPress={isFailed ? handleRetry : undefined}
        disabled={!isFailed}
        style={{ width: '100%' }}
      >
        {/* Header row — icon disc + eyebrow + stage caption */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 11,
            marginBottom: 14,
          }}
        >
          {/* Disc is a plain View — stable dimensions + bg color.
              Animation lives on the inner Animated.View wrapping the
              icon glyph, so the transforms never compete with the
              disc's layout-affecting styles. */}
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              // Solid fills across all three states — no pastel tints.
              // In-flight + failed share olive; done flips to brand sage.
              backgroundColor: isDone
                ? designTokens.colors.brand
                : designTokens.colors.olive,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <RNAnimated.View
              style={{
                transform: [
                  { translateY: iconTranslateY },
                  { scale: iconScale },
                  { rotate: iconRotate },
                ],
              }}
            >
              {isFailed ? (
                <AlertCircle
                  size={17}
                  color={designTokens.colors.cream}
                  strokeWidth={2}
                />
              ) : isDone ? (
                <Check
                  size={17}
                  color={designTokens.colors.cream}
                  strokeWidth={2.4}
                />
              ) : (
                <CookingPot
                  size={17}
                  color={designTokens.colors.cream}
                  strokeWidth={1.9}
                />
              )}
            </RNAnimated.View>
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 10.5,
                letterSpacing: 1.3,
                textTransform: 'uppercase',
                color: designTokens.colors.olive,
              }}
              numberOfLines={1}
            >
              {eyebrowText}
            </Text>
            {/* Caption is keyed by the actual text so React remounts the
                Text node on every rotation (not just on stage change),
                triggering FadeIn/FadeOut for a smooth crossfade between
                each evocative micro-copy line. */}
            <Animated.Text
              key={captionText}
              entering={FadeIn.duration(260).easing(EASE)}
              exiting={FadeOut.duration(180).easing(EASE)}
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 13.5,
                color: colors.ink,
                letterSpacing: -0.15,
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {captionText}
            </Animated.Text>
          </View>
        </View>

        {/* Segmented day pills — one per day in the plan. Each pill's
            sub-fill width is driven by dayRecipeCounts so it ticks
            forward on every individual recipe arrival, not just on
            whole-day completions. */}
        {!isFailed && days > 0 && (
          <View
            onLayout={handleRowLayout}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: PILL_GAP,
              width: '100%',
            }}
          >
            {pillWidth > 0 &&
              Array.from({ length: days }).map((_, idx) => {
                const raw = dayRecipeCounts[idx] ?? 0;
                const progress = isDone
                  ? 1
                  : Math.max(0, Math.min(1, raw / mealTypesPerDay));
                return (
                  <DayPill
                    key={idx}
                    progress={progress}
                    isActive={idx === activePillIdx}
                    width={pillWidth}
                  />
                );
              })}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
