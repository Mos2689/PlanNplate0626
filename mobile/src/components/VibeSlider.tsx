// VibeSlider — signature 5-position drag slider that replaces the
// star + cook-again combo. One gesture captures both signals.
//
// Visual anatomy:
//
//                 "A keeper."         ← caption, serif italic, morphs live
//   ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
//   ┃   ·   ·   ·   ·  ●           ┃ ← track 56px, cream tinted, animated fill
//   ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
//   skip   meh  good solid keeper   ← labels (10.5px caps)
//
// Behavior:
// - 5 snap points (1..5); thumb springs to nearest on release
// - Track fill (left of thumb) is olive-tinted gradient
// - Caption above thumb morphs as you drag — fades during transition
// - Haptic tick at each snap point during drag
// - Tap on a label or track snap-point also moves the thumb
//
// Emil's perf rules: all animations on translateX (HW-accelerated),
// no scale(0) entries, custom ease-out everywhere.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { designTokens, easing, elevation } from '@/lib/design-tokens';

export type VibePosition = 1 | 2 | 3 | 4 | 5;

const POSITIONS: VibePosition[] = [1, 2, 3, 4, 5];

const LABELS: Record<VibePosition, string> = {
  1: 'skip',
  2: 'meh',
  3: 'good',
  4: 'solid',
  5: 'keeper',
};

const CAPTIONS: Record<VibePosition, string> = {
  1: 'Not your thing.',
  2: 'Meh.',
  3: 'Decent.',
  4: 'Solid.',
  5: 'A keeper.',
};

// Derived intent from position (replaces the explicit cook-again step)
export function deriveCookAgain(pos: VibePosition): 'yes' | 'maybe' | 'no' {
  if (pos >= 4) return 'yes';
  if (pos === 3) return 'maybe';
  return 'no';
}

export interface VibeSliderProps {
  value: VibePosition | null;
  onChange: (pos: VibePosition) => void;
  // Optional: render a different caption (e.g. localized) by position
  captionFor?: (pos: VibePosition) => string;
}

const THUMB_SIZE = 44;
const TRACK_HEIGHT = 56;
const TRACK_INSET = 8; // padding inside track where thumb can travel

export function VibeSlider({ value, onChange, captionFor }: VibeSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const usable = Math.max(trackWidth - TRACK_INSET * 2 - THUMB_SIZE, 0);

  // Snap positions in pixels (centers of each of 5 slots)
  const snapXs = useMemo(() => {
    if (usable === 0) return [0, 0, 0, 0, 0];
    const step = usable / 4; // 4 gaps between 5 positions
    return POSITIONS.map((_, i) => TRACK_INSET + i * step);
  }, [usable]);

  // Live x position of the thumb
  const x = useSharedValue(0);
  // Caption opacity (for crossfade morph)
  const captionOpacity = useSharedValue(0);
  // Current caption text (kept in JS state because RN Text doesn't animate strings)
  const [displayedPosition, setDisplayedPosition] = useState<VibePosition | null>(value);

  // Sync external value → thumb position
  useEffect(() => {
    if (value && snapXs.length > 0) {
      x.value = withSpring(snapXs[value - 1], { damping: 18, stiffness: 380 });
      setDisplayedPosition(value);
      captionOpacity.value = withTiming(1, {
        duration: 220,
        easing: Easing.bezier(...easing.outStrong),
      });
    } else if (value === null) {
      x.value = withSpring(snapXs[0] ?? 0, { damping: 18, stiffness: 380 });
      captionOpacity.value = withTiming(0, { duration: 160 });
    }
  }, [value, snapXs, x, captionOpacity]);

  // Note: this is only called from JS (handleSnapTap). For the worklet
  // version, we inline the math inside .onEnd() to keep it worklet-safe.
  const nearestPosition = (px: number): VibePosition => {
    let best: VibePosition = 1;
    let bestDist = Infinity;
    for (let i = 0; i < snapXs.length; i++) {
      const d = Math.abs(snapXs[i] - px);
      if (d < bestDist) {
        bestDist = d;
        best = POSITIONS[i];
      }
    }
    return best;
  };

  const commitPosition = useCallback(
    (pos: VibePosition) => {
      if (pos !== value) {
        Haptics.selectionAsync();
      }
      // Update caption text immediately, fade in if it wasn't visible before.
      // (Avoids worklet callback-chain crashes from the previous fade-out-swap-fade-in version.)
      setDisplayedPosition(pos);
      captionOpacity.value = withTiming(1, {
        duration: 200,
        easing: Easing.bezier(0.23, 1, 0.32, 1),
      });
      onChange(pos);
    },
    [value, onChange, captionOpacity],
  );

  // ─────── Gesture ───────
  const startX = useSharedValue(0);
  // We pass the snap positions into the worklet via a sharedValue so the
  // gesture handler always reads the current measured layout.
  const maxX = snapXs[snapXs.length - 1] ?? 0;

  const pan = Gesture.Pan()
    .activeOffsetX([-2, 2])
    .onStart(() => {
      'worklet';
      startX.value = x.value;
    })
    .onUpdate((e) => {
      'worklet';
      if (maxX === 0) return;
      const next = Math.max(
        TRACK_INSET,
        Math.min(maxX, startX.value + e.translationX),
      );
      x.value = next;
    })
    .onEnd(() => {
      'worklet';
      if (maxX === 0) return;
      // Inline nearest-snap math (worklet-safe — no JS function calls)
      const xVal = x.value;
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < snapXs.length; i++) {
        const d = Math.abs(snapXs[i] - xVal);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      const pos = (bestIdx + 1) as VibePosition;
      x.value = withSpring(snapXs[bestIdx], { damping: 18, stiffness: 380 });
      runOnJS(commitPosition)(pos);
    });

  // ─────── Tap on label/track ───────
  const handleSnapTap = (pos: VibePosition) => {
    x.value = withSpring(snapXs[pos - 1], { damping: 18, stiffness: 380 });
    commitPosition(pos);
  };

  // ─────── Styles (animated) ───────
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  const fillStyle = useAnimatedStyle(() => {
    // Width of the filled portion of the track (from left to thumb center)
    const width = x.value + THUMB_SIZE / 2 + TRACK_INSET;
    // Color shifts from cool muted to warm olive as thumb moves right
    const t = usable > 0 ? Math.min(1, Math.max(0, x.value / usable)) : 0;
    const bg = interpolateColor(
      t,
      [0, 0.5, 1],
      ['#EFEBE0', '#F0D4C2', designTokens.colors.olive],
    );
    return {
      width,
      backgroundColor: bg,
      opacity: 0.55 + t * 0.45,
    };
  });

  const captionAnimStyle = useAnimatedStyle(() => ({
    opacity: captionOpacity.value,
    transform: [
      {
        translateY: interpolate(captionOpacity.value, [0, 1], [4, 0]),
      },
    ],
  }));

  const captionText = displayedPosition
    ? captionFor?.(displayedPosition) ?? CAPTIONS[displayedPosition]
    : '';

  return (
    <View style={styles.wrap}>
      {/* Caption */}
      <View style={styles.captionWrap}>
        <Animated.Text style={[styles.caption, captionAnimStyle]}>{captionText}</Animated.Text>
      </View>

      {/* Track */}
      <View
        style={styles.track}
        onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        {/* Filled portion (animated) */}
        <Animated.View style={[styles.fill, fillStyle]} />

        {/* Tick marks (taps move thumb) */}
        {snapXs.map((sx, i) => (
          <Pressable
            key={i}
            onPress={() => handleSnapTap(POSITIONS[i])}
            hitSlop={14}
            style={[
              styles.tick,
              {
                left: sx + THUMB_SIZE / 2 - 2,
                backgroundColor:
                  value && POSITIONS[i] <= value ? 'rgba(255,255,255,0.6)' : '#C9C5BB',
              },
            ]}
          />
        ))}

        {/* Thumb */}
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.thumb, thumbStyle]}>
            <View style={styles.thumbInner} />
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Labels */}
      <View style={styles.labelsRow}>
        {POSITIONS.map((p) => {
          const active = value === p;
          return (
            <Pressable
              key={p}
              onPress={() => handleSnapTap(p)}
              hitSlop={6}
              style={styles.labelTap}
            >
              <Text
                style={[
                  styles.label,
                  active && styles.labelActive,
                ]}
              >
                {LABELS[p]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  captionWrap: {
    height: 30,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  caption: {
    // Brand rule: only ONE italic word per screen (already used in the
    // sheet header). The slider caption is plain Geist medium — distinct
    // via size + color, not via italic.
    fontFamily: designTokens.font.medium,
    fontSize: 20,
    color: designTokens.colors.brandDeep,
    letterSpacing: -0.2,
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: 999,
    backgroundColor: '#EFEBE0',
    borderWidth: 1,
    borderColor: designTokens.colors.hair,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 999,
  },
  tick: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 999,
    top: TRACK_HEIGHT / 2 - 2,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    top: (TRACK_HEIGHT - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 999,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.thumb,
  },
  thumbInner: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: designTokens.colors.olive,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: TRACK_INSET + THUMB_SIZE / 2 - 14, // align with snap centers
  },
  labelTap: {
    paddingVertical: 4,
    minWidth: 44,
    alignItems: 'center',
  },
  label: {
    fontFamily: designTokens.font.semibold,
    fontSize: 10.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: designTokens.colors.ink3,
  },
  labelActive: {
    color: designTokens.colors.olive,
  },
});
