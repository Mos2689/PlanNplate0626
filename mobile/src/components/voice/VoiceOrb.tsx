// VoiceOrb — the microphone stage for add-recipe "Speak it" and grocery "Talk".
//
// Both screens used to draw their own: a mic glyph on a flat disc, scaled by a
// `withRepeat` timer that looked exactly the same whether the user was talking
// or had walked away. Onboarding had long since moved on to the prototype's
// stage — aurora, staggered rings, metered bars — and the gap between the two
// generations was obvious the moment you saw them in one session.
//
// This packages that stage as one component, scaled down for a modal and a
// bottom sheet. Onboarding keeps its own composition: its stage animates its
// own height and choreographs a transcript and a hero card through the same
// space, which is specific to capturing several dishes in a row. What the three
// now share is the vocabulary underneath (./primitives).
//
// Sizing is derived from `size` (the disc) so callers pick one number and the
// rings, aurora and bars stay in proportion.

import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Mic } from 'lucide-react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { designTokens, elevation } from '@/lib/design-tokens';
import {
  ARC_INNER_MS,
  ARC_OUTER_MS,
  Aurora,
  AURORA_SPIN_MS,
  CookingIconCycle,
  Halo,
  PulseRing,
  ThinkingArc,
  WaveBar,
} from './primitives';

export type VoiceOrbPhase = 'idle' | 'listening' | 'thinking';

interface Props {
  phase: VoiceOrbPhase;
  /**
   * Live mic amplitude, 0-1, owned by the screen's recorder callback. Drives the
   * bars — without it they fall back to a constant envelope and the orb is just
   * decoration.
   */
  level: SharedValue<number>;
  /** Diameter of the mic disc. The stage sizes itself around this. */
  size?: number;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

export function VoiceOrb({
  phase,
  level,
  size = 132,
  onPress,
  disabled = false,
  accessibilityLabel,
}: Props) {
  const reduced = useReducedMotion();

  const listening = phase === 'listening';
  const thinking = phase === 'thinking';

  // Proportions lifted from the onboarding stage (mic 156 inside a 250 stage,
  // 190 rings) so a smaller orb still reads as the same object.
  const stage = Math.round(size * 1.6);
  const ring = Math.round(size * 1.22);
  const arcStage = Math.round(size * 0.98);
  const barGap = Math.max(4, Math.round(size * 0.038));
  const barWidth = Math.max(3.5, Math.round(size * 0.038));

  // ── Aurora spin ───────────────────────────────────────────────────────────
  const spin = useSharedValue(0);
  useEffect(() => {
    if (reduced || !listening) {
      cancelAnimation(spin);
      return;
    }
    spin.value = withRepeat(
      withTiming(1, { duration: AURORA_SPIN_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(spin);
  }, [spin, listening, reduced]);

  const auroraStyle = useAnimatedStyle(() => ({
    opacity: withTiming(listening ? 1 : thinking ? 0.35 : 0, { duration: 260 }),
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: withTiming(listening ? 0 : 1, { duration: 260 }),
  }));

  // ── Disc gradient + breathing ─────────────────────────────────────────────
  const gradientStyle = useAnimatedStyle(() => ({
    opacity: withTiming(listening ? 1 : 0, { duration: 260 }),
  }));

  const breathe = useSharedValue(1);
  useEffect(() => {
    if (reduced || phase !== 'idle') {
      cancelAnimation(breathe);
      breathe.value = withTiming(1, { duration: 220 });
      return;
    }
    breathe.value = withRepeat(
      withTiming(1.045, { duration: 2100, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(breathe);
  }, [breathe, phase, reduced]);

  const discStyle = useAnimatedStyle(() => ({ transform: [{ scale: breathe.value }] }));

  // ── Wave clock ────────────────────────────────────────────────────────────
  // A frame callback rather than a repeating timing, because the bars need a
  // monotonic seconds value to phase-shift against — same as onboarding.
  const waveClock = useSharedValue(0);
  const frame = useFrameCallback((info) => {
    waveClock.value = info.timeSinceFirstFrame / 1000;
  }, false);

  useEffect(() => {
    frame.setActive(listening && !reduced);
  }, [frame, listening, reduced]);

  const body = (
    <View style={{ width: stage, height: stage, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[auroraStyle, { position: 'absolute' }]} pointerEvents="none">
        <Aurora size={stage} />
      </Animated.View>

      <Animated.View style={[haloStyle, { position: 'absolute' }]} pointerEvents="none">
        <Halo size={Math.round(size * 1.26)} />
      </Animated.View>

      <View
        style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <PulseRing delay={0} color="rgba(84,100,69,0.35)" active={listening} reduced={reduced} size={ring} />
        <PulseRing delay={850} color="rgba(228,109,70,0.32)" active={listening} reduced={reduced} size={ring} />
        <PulseRing delay={1700} color="rgba(84,100,69,0.22)" active={listening} reduced={reduced} size={ring} />
      </View>

      <View
        style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <ThinkingArc
          duration={ARC_OUTER_MS}
          reverse={false}
          radius={46}
          dash={0.26}
          width={2.6}
          color={designTokens.colors.brand}
          active={thinking}
          reduced={reduced}
          size={arcStage}
        />
        <ThinkingArc
          duration={ARC_INNER_MS}
          reverse
          radius={39}
          dash={0.14}
          width={2}
          color={designTokens.colors.olive}
          active={thinking}
          reduced={reduced}
          size={arcStage}
        />
      </View>

      {/* Mic — white collar + coloured disc, as onboarding */}
      <Animated.View
        style={[
          discStyle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: '#FFFFFF',
            padding: Math.max(6, Math.round(size * 0.058)),
            alignItems: 'center',
            justifyContent: 'center',
            ...elevation.thumb,
            shadowColor: designTokens.colors.brand,
            shadowOpacity: 0.3,
            shadowRadius: 18,
          },
        ]}
      >
        <View
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 999,
            overflow: 'hidden',
            backgroundColor: designTokens.colors.brand,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Animated.View
            style={[gradientStyle, { position: 'absolute', inset: 0 }]}
            pointerEvents="none"
          >
            <LinearGradient
              colors={[designTokens.colors.brand, designTokens.colors.brandDeep]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.8, y: 1 }}
              style={{ flex: 1 }}
            />
          </Animated.View>

          {listening ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: barGap,
                height: Math.round(size * 0.3),
              }}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {[0, 1, 2, 3, 4].map((i) => (
                <WaveBar key={i} index={i} clock={waveClock} level={level} width={barWidth} />
              ))}
            </View>
          ) : thinking ? (
            <CookingIconCycle size={Math.round(size * 0.22)} reduced={reduced} />
          ) : (
            <Mic size={Math.round(size * 0.26)} color="#F6F2E9" strokeWidth={1.7} />
          )}
        </View>
      </Animated.View>
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: thinking, disabled }}
      style={{ opacity: disabled ? 0.55 : 1 }}
    >
      {body}
    </Pressable>
  );
}
