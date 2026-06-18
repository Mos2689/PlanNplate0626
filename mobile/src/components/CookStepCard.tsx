// CookStepCard — one instruction card rendered inside the Vibe
// Cooking "Steps" tab.
//
// Anatomy:
//
//   ╭──────────────────────────────────────────╮
//   │ ① │  Heat 2 tbsp olive oil in a heavy    │
//   │   │  pot over medium-high heat. Simmer   │
//   │   │  the onions for 8 minutes until      │
//   │   │  golden, stirring occasionally.      │
//   │   │  [⏱ 8 min]                            │
//   ╰──────────────────────────────────────────╯
//
// Tap the number disc → marks the step as done. The number flips
// to a check, the body dims, and the card softens. Long-press is
// reserved for future text-to-speech.
//
// `timerMinutes` (auto-detected upstream via `detectTimerMinutes`)
// is rendered as a tap-to-start pill. Tapping fires the
// `onStartTimer` callback — the parent screen owns the actual
// countdown (sticky chip at the top), so multiple cards can each
// have their own pill without interfering.

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Check, Timer } from 'lucide-react-native';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { designTokens, easing } from '@/lib/design-tokens';
import { formatTimerLabel } from '@/lib/vibe-theme';

const EASE = Easing.bezier(...easing.outStrong);

interface CookStepCardProps {
  /** 1-indexed step number for display. */
  number: number;
  /** Step body text. May contain "X min" / "X sec" auto-detected upstream. */
  text: string;
  /** Marked-done state (controlled by parent). */
  done: boolean;
  /** Vibe accent color — used on the active step number ring + the
   *  timer pill border. */
  accent: string;
  /** Softer wash of the accent — used as the timer pill background. */
  accentSoft: string;
  /** Auto-detected timer duration in MINUTES; null = no timer pill. */
  timerMinutes: number | null;
  /** Parent toggle handler for the done state. */
  onToggleDone: () => void;
  /** Parent handler for "start timer" tap on the pill. */
  onStartTimer: (minutes: number) => void;
  /** Whether THIS card's timer is the active running one — when true,
   *  the pill border + label flip to the accent color and pulse. */
  isTimerRunning: boolean;
  /** Cook Mode: elapsed fraction (0 → 1) of THIS card's running
   *  timer. Drives the depleting ring around the step-number disc.
   *  Only meaningful when `isTimerRunning === true`. */
  timerProgress?: number;
  /** Cook Mode: seconds remaining on THIS card's running timer.
   *  Drives the ring color phase (olive at <=30s, etc.). */
  timerSecondsRemaining?: number;
  /** Optional dark-mode hint. */
  isDark?: boolean;
}

// Ring geometry shared between step-card ring and any future
// progress-ring surfaces. Disc is 32, ring outer is 40 (4px gap),
// stroke is 2.5px.
const RING_SIZE = 40;
const RING_RADIUS = 17.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function CookStepCard({
  number,
  text,
  done,
  accent,
  accentSoft,
  timerMinutes,
  onToggleDone,
  onStartTimer,
  isTimerRunning,
  timerProgress,
  timerSecondsRemaining,
  isDark = false,
}: CookStepCardProps) {
  const t = useSharedValue(done ? 1 : 0);

  React.useEffect(() => {
    t.value = withSpring(done ? 1 : 0, { damping: 18, stiffness: 220 });
  }, [done, t]);

  const checkStyle = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ scale: 0.7 + t.value * 0.3 }],
  }));
  const numberStyle = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
  }));
  const bodyStyle = useAnimatedStyle(() => ({
    opacity: 1 - t.value * 0.45,
  }));

  const cardBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onToggleDone();
  };

  const handleStartTimer = () => {
    if (!timerMinutes) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onStartTimer(timerMinutes);
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 14,
        padding: 14,
        marginBottom: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: done ? (isDark ? '#2a2a2a' : designTokens.colors.hair2) : cardBorder,
        backgroundColor: done ? (isDark ? '#1a1a1a' : designTokens.colors.hair2) : cardBg,
      }}
    >
      {/* ── Number / check disc (tappable) ───────────────────
          Cook Mode: when this step's timer is running, an SVG
          ring wraps the disc and depletes from full → empty as
          time elapses. The ring color shifts olive in the warn
          (<=30s) and critical (<=10s) phases — matches the
          sticky pill above for visual continuity. */}
      <View
        style={{
          width: RING_SIZE,
          height: RING_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: -3, // counter the ring's extra 4px wrap so the disc still aligns to body baseline
        }}
      >
        {isTimerRunning && timerProgress != null && (
          <Svg
            width={RING_SIZE}
            height={RING_SIZE}
            style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
            pointerEvents="none"
          >
            {/* Track — faint disc-toned ring */}
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={isDark ? '#2a2a2a' : '#E8ECDF'}
              strokeWidth={2.5}
              fill="transparent"
            />
            {/* Progress — depletes via dashoffset. The phase color
                (sage normal, olive warn/critical) lives on this
                stroke; pulse on the parent View if we ever want it. */}
            <Circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={
                (timerSecondsRemaining ?? 31) > 30
                  ? accent
                  : designTokens.colors.olive
              }
              strokeWidth={2.5}
              strokeLinecap="round"
              fill="transparent"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * Math.max(0, Math.min(1, timerProgress))}
            />
          </Svg>
        )}
        <Pressable
          onPress={handleToggle}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 32,
            height: 32,
            borderRadius: 999,
            backgroundColor: done ? accent : isDark ? '#2a2a2a' : '#E8ECDF',
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: pressed ? 0.92 : 1 }],
          })}
        >
          {/* Number — fades out as the step is marked done */}
          <Animated.View style={[{ position: 'absolute' }, numberStyle]}>
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 14,
                color: isDark ? '#fff' : designTokens.colors.brand,
              }}
            >
              {number}
            </Text>
          </Animated.View>
          {/* Check — fades in */}
          <Animated.View style={checkStyle}>
            <Check size={16} color="#FFFFFF" strokeWidth={2.8} />
          </Animated.View>
        </Pressable>
      </View>

      {/* ── Body + optional timer pill ─────────────────────── */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Animated.Text
          style={[
            {
              fontFamily: designTokens.font.regular,
              fontSize: 14.5,
              lineHeight: 21,
              color: isDark ? '#ddd' : designTokens.colors.ink,
              letterSpacing: -0.05,
            },
            bodyStyle,
          ]}
        >
          {text}
        </Animated.Text>

        {timerMinutes != null && !done && (
          <>
            {/* Hairline anchors the timer pill to this step card */}
            <View
              style={{
                height: 1,
                backgroundColor: isDark ? '#2a2a2a' : designTokens.colors.hair2,
                marginTop: 14,
                marginBottom: 12,
              }}
            />
            <Pressable
              onPress={handleStartTimer}
              hitSlop={8}
              style={({ pressed }) => ({
                alignSelf: 'flex-start',
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              })}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 11,
                  paddingHorizontal: 16,
                  borderRadius: 999,
                  backgroundColor: accent,
                  shadowColor: accent,
                  shadowOpacity: 0.35,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 4,
                }}
              >
                <Timer size={15} color="#FFFFFF" strokeWidth={2.4} />
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 13,
                    letterSpacing: 0.1,
                    color: '#FFFFFF',
                  }}
                >
                  {isTimerRunning ? 'Running…' : `Start ${formatTimerLabel(timerMinutes)}`}
                </Text>
              </View>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
