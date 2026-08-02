// Grocery screen — the pantry-check meter that replaced the charcoal hero card.
//
// The old card spent ~250px restating one fact four times (headline count, "0 of
// N", a % ring and a bar) and, at 0%, had nothing to report but "you haven't
// started". This says it once, in ~80px, with a unit the user can actually feel:
// ONE DOT PER ITEM. Tapping an item fills a dot, so the meter is built out of
// the same things the list is made of, and the shape of the task is visible
// before you begin.
//
// Dots fill left-to-right by COUNT, not by item identity — unchecking something
// in the middle would otherwise punch a hole in the meter. A single spring-driven
// shared value carries the frontier, so the dot at the boundary swells as it
// fills and its neighbour catches a hint of the overshoot.
import React, { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check, RotateCcw, Save } from 'lucide-react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { designTokens, elevation } from '@/lib/design-tokens';

const DOT_GAP = 5;
// Past this the dots stop being countable and start being noise (and three rows
// of them would cost the height we just saved) — fall back to a plain bar.
const MAX_DOTS = 60;

function dotSizeFor(total: number): number {
  if (total <= 24) return 7;
  if (total <= 40) return 6;
  return 5;
}

type Mode = 'pantry' | 'shopping';

function Dot({
  index,
  progress,
  size,
  accent,
  emptyBorder,
}: {
  index: number;
  progress: SharedValue<number>;
  size: number;
  accent: string;
  emptyBorder: string;
}) {
  const style = useAnimatedStyle(() => {
    // 0 = untouched, 1 = filled. The frontier dot sits somewhere between while
    // the spring settles.
    const t = Math.min(1, Math.max(0, progress.value - index));
    return {
      backgroundColor: interpolateColor(t, [0, 1], ['rgba(0,0,0,0)', accent]),
      borderColor: interpolateColor(t, [0, 1], [emptyBorder, accent]),
      // Swell through the middle of the fill, settle back at rest.
      transform: [{ scale: 1 + Math.sin(t * Math.PI) * 0.3 }],
    };
  });

  return (
    <Animated.View
      style={[
        style,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: size <= 5 ? 1.2 : 1.5,
        },
      ]}
    />
  );
}

function Bar({
  progress,
  total,
  accent,
  track,
}: {
  progress: SharedValue<number>;
  total: number;
  accent: string;
  track: string;
}) {
  const style = useAnimatedStyle(() => ({
    width: `${total > 0 ? (progress.value / total) * 100 : 0}%`,
  }));

  return (
    <View style={{ height: 7, borderRadius: 999, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View style={[style, { height: '100%', borderRadius: 999, backgroundColor: accent }]} />
    </View>
  );
}

type Props = {
  total: number;
  checked: number;
  /** `pantry` = tick what you already own; `shopping` = tick what's in the basket. */
  mode: Mode;
  /** Pantry mode only — save the un-ticked remainder as a shopping list. */
  onSave: () => void;
  /** Shopping mode only — untick everything. */
  onReset: () => void;
  isDark: boolean;
};

export function PantryProgress({ total, checked, mode, onSave, onReset, isDark }: Props) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(checked);

  useEffect(() => {
    progress.value = reduced ? checked : withSpring(checked, { damping: 15, stiffness: 130 });
  }, [checked, progress, reduced]);

  const remaining = total - checked;
  const started = checked > 0;
  const done = total > 0 && checked === total;
  const shopping = mode === 'shopping';

  const accent = shopping ? designTokens.colors.brand : designTokens.colors.olive;
  const cardBg = isDark ? '#1f1f1f' : designTokens.colors.cream;
  const cardHair = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const emptyBorder = isDark ? '#3a3a36' : designTokens.colors.emptyBorder;
  const ink = isDark ? '#FFFFFF' : designTokens.colors.ink;
  const ink3 = isDark ? '#7a776e' : designTokens.colors.ink3;
  const pillBg = isDark ? '#F6F2E9' : designTokens.colors.charcoal;
  const pillInk = isDark ? designTokens.colors.charcoal : '#F6F2E9';

  // The instruction the dismissible hint banner used to carry now lives here,
  // and only while it's still needed — the first tap answers it for good.
  const headline = done
    ? shopping
      ? `All ${total} purchased`
      : `All ${total} at home`
    : started
      ? `${remaining} left · ${checked} ${shopping ? 'in basket' : 'at home'}`
      : `${total} to ${shopping ? 'buy' : 'review'}`;
  const hint = shopping
    ? 'Tick items as they go in the basket'
    : 'Tap what you already have at home';

  const dotSize = dotSizeFor(total);
  const ActionIcon = shopping ? RotateCcw : Save;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={shopping ? 'Shopping progress' : 'Pantry check progress'}
      accessibilityValue={{ min: 0, max: total, now: checked }}
      style={{
        borderRadius: 16,
        paddingHorizontal: 13,
        paddingTop: 12,
        paddingBottom: 12,
        backgroundColor: cardBg,
        borderWidth: 1,
        borderColor: cardHair,
        ...elevation.card,
      }}
    >
      {/* The meter — one dot per item, or a bar once dots stop being countable */}
      <View
        style={{ marginBottom: 10 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {total <= MAX_DOTS ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: DOT_GAP }}>
            {Array.from({ length: total }, (_, i) => (
              <Dot
                key={i}
                index={i}
                progress={progress}
                size={dotSize}
                accent={accent}
                emptyBorder={emptyBorder}
              />
            ))}
          </View>
        ) : (
          <Bar progress={progress} total={total} accent={accent} track={emptyBorder} />
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {done && <Check size={14} color={accent} strokeWidth={2.6} />}
            <Text
              numberOfLines={1}
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 13.5,
                letterSpacing: -0.14,
                color: ink,
              }}
            >
              {headline}
            </Text>
          </View>
          {/* The instruction retires the moment the user proves they don't need it. */}
          {!started && (
            <Text
              numberOfLines={1}
              style={{
                marginTop: 3,
                fontFamily: designTokens.font.regular,
                fontSize: 11.5,
                color: ink3,
              }}
            >
              {hint}
            </Text>
          )}
        </View>

        {/* Saving a list you've reviewed nothing of isn't a real action, so the
            CTA only appears once there's something to save. */}
        {started && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              if (shopping) onReset();
              else onSave();
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 13,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: pillBg,
            }}
          >
            <ActionIcon size={13} color={pillInk} strokeWidth={1.9} />
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 12.5,
                letterSpacing: -0.12,
                color: pillInk,
              }}
            >
              {shopping ? 'Reset' : 'Save list'}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
