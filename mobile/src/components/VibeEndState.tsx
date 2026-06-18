// VibeEndState — full-screen takeover that fires when the user marks
// the last step of a Vibe Cooking session done.
//
// Anatomy (top → bottom):
//
//   ┌─────────────────────────────────────────┐
//   │      ✨ ✨   confetti puff   ✨ ✨        │
//   │                                         │
//   │           Eat the vibe.                 │   ← italic accent on "vibe"
//   │       You earned the Comfort            │
//   │           Blanket.                      │
//   │                                         │
//   │       😞   😐   🙂   😍   🤤            │   ← 5-face rating row
//   │                                         │
//   │      [ Cook this again ]                │   ← primary CTA (vibe-tinted)
//   │      [ Pick a new vibe ]                │   ← ghost CTA
//   └─────────────────────────────────────────┘
//
// The overlay is rendered as a sibling Modal so it sits above
// everything (sticky timer chip, bottom CTA bar, scroll content)
// without us needing to rewire the parent layout.
//
// Confetti: ~24 small particles, sage + cream tints, ~1.2s puff
// driven by Reanimated worklets. No third-party lib.

import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withSpring,
  withRepeat,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { designTokens, easing } from '@/lib/design-tokens';
import { VIBE_BY_ID, type VibeId } from '@/lib/vibe-inference';
import { getVibeTheme } from '@/lib/vibe-theme';

const EASE = Easing.bezier(...easing.outStrong);
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ── Confetti particle ────────────────────────────────────────────
// Each particle gets a deterministic-but-staggered launch with its
// own angle + distance + spin. Pure worklet, GPU-cheap.
interface ParticleConfig {
  size: number;
  color: string;
  startX: number;
  endX: number;
  endY: number;
  rotation: number;
  delay: number;
}

function ConfettiParticle({ cfg }: { cfg: ParticleConfig }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(cfg.delay, withTiming(1, { duration: 1100, easing: EASE }));
  }, [t, cfg.delay]);
  const style = useAnimatedStyle(() => {
    const x = interpolate(t.value, [0, 1], [cfg.startX, cfg.endX]);
    const y = interpolate(t.value, [0, 1], [0, cfg.endY]);
    const rot = interpolate(t.value, [0, 1], [0, cfg.rotation]);
    const opacity = interpolate(t.value, [0, 0.15, 0.85, 1], [0, 1, 1, 0]);
    return {
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${rot}deg` }],
      opacity,
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: SCREEN_W / 2,
          width: cfg.size,
          height: cfg.size * 0.35,
          borderRadius: 1,
          backgroundColor: cfg.color,
        },
        style,
      ]}
    />
  );
}

// ── Emoji-face rating row ────────────────────────────────────────
// 5 faces, monotone sad-to-elated. Tap → animates scale-up of the
// selected face, dims the rest, fires the parent's onRate handler.
const RATING_FACES: Array<{ emoji: string; label: string; value: 1 | 2 | 3 | 4 | 5 }> = [
  { emoji: '😞', label: 'Nope', value: 1 },
  { emoji: '😐', label: 'Meh', value: 2 },
  { emoji: '🙂', label: 'Good', value: 3 },
  { emoji: '😍', label: 'Loved it', value: 4 },
  { emoji: '🤤', label: 'Hit', value: 5 },
];

interface VibeEndStateProps {
  /** Whether the overlay is mounted/visible. */
  visible: boolean;
  /** The vibe the user just cooked — drives palette + tagline copy. */
  vibeId: VibeId;
  /** Recipe name — small subline reference (lowercase, looks like a label). */
  recipeName: string;
  /** Fires when a face is tapped. value = 1..5. */
  onRate: (value: 1 | 2 | 3 | 4 | 5) => void;
  /** "Cook this again" — regenerate with same vibe. */
  onCookAgain: () => void;
  /** "Pick a new vibe" — back to /generate-recipe. */
  onPickNewVibe: () => void;
}

export function VibeEndState({
  visible,
  vibeId,
  recipeName,
  onRate,
  onCookAgain,
  onPickNewVibe,
}: VibeEndStateProps) {
  const theme = getVibeTheme(vibeId);
  const vibe = VIBE_BY_ID[vibeId];

  // Confetti config — computed once per mount. Sage + cream tints
  // only (per brand: no neon). ~24 particles distributed across the
  // top of the screen, spraying outward and down.
  const particles: ParticleConfig[] = useMemo(() => {
    if (!visible) return [];
    const colors = [
      designTokens.colors.brand,    // sage
      designTokens.colors.brandDeep,
      designTokens.colors.olive,    // terracotta accent
      '#F4C76A',                    // soft gold
      designTokens.colors.cream,
    ];
    const N = 24;
    return Array.from({ length: N }).map((_, i) => {
      // Spread evenly around the centerline.
      const angle = (i / N) * Math.PI - Math.PI / 2; // -π/2 .. π/2
      const distance = 140 + Math.random() * 140;
      const startX = (Math.random() - 0.5) * 12;
      return {
        size: 6 + Math.random() * 6,
        color: colors[i % colors.length],
        startX,
        endX: startX + Math.cos(angle) * distance,
        endY: 80 + Math.abs(Math.sin(angle) * distance) + Math.random() * 80,
        rotation: (Math.random() - 0.5) * 540,
        delay: Math.random() * 220,
      };
    });
  }, [visible]);

  // Rating row state — local so we can animate the selected face.
  const [picked, setPicked] = React.useState<1 | 2 | 3 | 4 | 5 | null>(null);

  // Reveal animation drivers for the headline + body.
  const reveal = useSharedValue(0);
  useEffect(() => {
    if (!visible) {
      reveal.value = 0;
      setPicked(null);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    reveal.value = withDelay(60, withTiming(1, { duration: 520, easing: EASE }));
  }, [visible, reveal]);

  const headlineStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: interpolate(reveal.value, [0, 1], [12, 0]) }],
  }));

  const handlePickFace = (value: 1 | 2 | 3 | 4 | 5) => {
    Haptics.selectionAsync();
    setPicked(value);
    onRate(value);
  };

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // No-op — the overlay isn't dismissable except via the CTAs.
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: '#0F0E0B',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 28,
        }}
      >
        {/* ── Confetti layer ─────────────────────────────── */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: SCREEN_H * 0.18,
            left: 0,
            right: 0,
            height: 200,
          }}
        >
          {particles.map((p, i) => (
            <ConfettiParticle key={i} cfg={p} />
          ))}
        </View>

        {/* ── Tagline block ─────────────────────────────── */}
        <Animated.View style={[{ alignItems: 'center', marginBottom: 28 }, headlineStyle]}>
          <Text
            style={{
              fontFamily: designTokens.font.semibold,
              fontSize: 10.5,
              letterSpacing: 1.3,
              textTransform: 'uppercase',
              color: theme.accent,
              marginBottom: 8,
            }}
          >
            {vibe?.name ?? 'Vibe'} · {recipeName.length > 32 ? recipeName.slice(0, 32) + '…' : recipeName}
          </Text>
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 34,
              lineHeight: 40,
              letterSpacing: -0.7,
              color: '#FFFFFF',
              textAlign: 'center',
            }}
          >
            Eat the{' '}
            <Text
              style={{
                fontFamily: designTokens.font.serifItalic,
                fontStyle: 'italic',
                fontSize: 40,
                color: '#FFFFFF',
              }}
            >
              vibe
            </Text>
            .
          </Text>
          <Text
            style={{
              marginTop: 10,
              fontFamily: designTokens.font.regular,
              fontSize: 14.5,
              lineHeight: 20,
              letterSpacing: -0.1,
              color: 'rgba(255,255,255,0.72)',
              textAlign: 'center',
              maxWidth: 280,
            }}
          >
            You earned the {vibe?.name ?? 'vibe'}.
          </Text>
        </Animated.View>

        {/* ── Rating row ────────────────────────────────── */}
        <Animated.View
          style={[
            {
              flexDirection: 'row',
              gap: 8,
              marginBottom: 32,
            },
            headlineStyle,
          ]}
        >
          {RATING_FACES.map((f) => {
            const isPicked = picked === f.value;
            const isOther = picked != null && !isPicked;
            return (
              <Pressable
                key={f.value}
                onPress={() => handlePickFace(f.value)}
                hitSlop={4}
                style={({ pressed }) => ({
                  width: 52,
                  height: 60,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isPicked
                    ? theme.accentSoft
                    : 'rgba(255,255,255,0.06)',
                  borderWidth: 1,
                  borderColor: isPicked ? theme.accent : 'rgba(255,255,255,0.10)',
                  transform: [{ scale: pressed ? 0.94 : isPicked ? 1.08 : 1 }],
                  opacity: isOther ? 0.45 : 1,
                })}
              >
                <Text style={{ fontSize: 26 }}>{f.emoji}</Text>
              </Pressable>
            );
          })}
        </Animated.View>

        {/* ── CTAs ───────────────────────────────────────── */}
        <Animated.View style={[{ width: '100%', maxWidth: 360 }, headlineStyle]}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onCookAgain();
            }}
            style={({ pressed }) => ({
              paddingVertical: 16,
              borderRadius: 999,
              alignItems: 'center',
              backgroundColor: theme.accent,
              shadowColor: theme.ctaShadow,
              shadowOpacity: 0.4,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            })}
          >
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 15.5,
                color: theme.onAccent,
                letterSpacing: -0.2,
              }}
            >
              Cook this again
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPickNewVibe();
            }}
            style={({ pressed }) => ({
              alignSelf: 'center',
              marginTop: 12,
              paddingVertical: 10,
              paddingHorizontal: 16,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 13.5,
                color: 'rgba(255,255,255,0.72)',
                textDecorationLine: 'underline',
              }}
            >
              Pick a new vibe
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}
