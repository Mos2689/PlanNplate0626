// Voice stage primitives — the motion vocabulary shared by every microphone
// surface in the app.
//
// These were written for onboarding step 1 (VoiceDishCapture), recreating the
// Claude Design prototype: a slow-spinning aurora behind a gradient mic disc,
// three staggered rings pulsing out of it, five bars driven by REAL mic
// metering, and a cooking-icon carousel for the transcription wait.
//
// They lived as private functions in that one file, so the two OTHER voice
// surfaces — add-recipe "Speak it" and grocery "Talk" — were still on the
// first-generation treatment: a mic glyph on a fixed scale loop that moved
// identically whether the user was shouting or silent. Lifting these out is
// what lets all three share one look; the alternative was a second copy that
// would drift the first time anyone touched it.
//
// Everything here is presentational and SIZE-PARAMETERISED. Phase logic, mic
// levels and recorder lifecycles belong to the screens; none of it leaks in.

import React, { useEffect } from 'react';
import { View } from 'react-native';
import {
  ChefHat,
  CookingPot,
  Croissant,
  Salad,
  Soup,
  UtensilsCrossed,
} from 'lucide-react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { designTokens } from '@/lib/design-tokens';

export const RING_CYCLE_MS = 2600;
export const AURORA_SPIN_MS = 9000;
export const RING_EASE = Easing.bezier(0.22, 1, 0.36, 1);

// ── Processing ("thinking") motion ───────────────────────────────────────────
// Whisper takes 1-3s. Without motion the screen reads as crashed, so the mic
// disc becomes the loading indicator: cooking icons drift through it while two
// arcs orbit outside.
export const THINKING_ICONS = [CookingPot, ChefHat, Soup, Salad, Croissant, UtensilsCrossed];
export const ICON_SLOT_MS = 900;
export const ARC_OUTER_MS = 2600;
export const ARC_INNER_MS = 3800;

// ── Aurora — two soft colour blobs that rotate behind the mic while listening ─
// The prototype blurs two radial gradients by 26px. react-native-svg has no
// blur we can lean on cheaply, but a radial gradient that fades to zero over
// its whole radius reads the same at this scale.
//
// GEOMETRY IS LOAD-BEARING: each blob must fade to fully transparent BEFORE it
// reaches the viewBox edge. The original pair (r=58 centred at 32,30 and 70,68)
// spilled well outside 0-100 and was clipped to the square canvas — at the
// top-left corner the warm blob was still at ~12% opacity when it hit the edge,
// so the "soft glow" was actually a hard-edged square. Spinning it turned that
// into a rotating rectangle behind the mic, which is what it looked like on
// device. Radius 37 centred at (37,37) and (63,63) touches each edge at exactly
// the point the gradient reaches zero, so the canvas boundary is invisible and
// the rotation reads as light moving rather than a shape turning.
export const Aurora = React.memo(function Aurora({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="auroraWarm" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={designTokens.colors.olive} stopOpacity={0.5} />
          <Stop offset="0.55" stopColor={designTokens.colors.olive} stopOpacity={0.22} />
          <Stop offset="1" stopColor={designTokens.colors.olive} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="auroraSage" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={designTokens.colors.brand} stopOpacity={0.42} />
          <Stop offset="0.55" stopColor={designTokens.colors.brand} stopOpacity={0.18} />
          <Stop offset="1" stopColor={designTokens.colors.brand} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx="37" cy="37" r="37" fill="url(#auroraWarm)" />
      <Circle cx="63" cy="63" r="37" fill="url(#auroraSage)" />
    </Svg>
  );
});

// ── Halo — the faint terracotta glow that sits under the resting mic ─────────
export const Halo = React.memo(function Halo({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={designTokens.colors.olive} stopOpacity={0.13} />
          <Stop offset="0.62" stopColor={designTokens.colors.olive} stopOpacity={0.05} />
          <Stop offset="1" stopColor={designTokens.colors.olive} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx="50" cy="50" r="50" fill="url(#halo)" />
    </Svg>
  );
});

// ── Pulse ring — one of three concentric rings expanding out of the mic ──────
// Keyframe from the prototype: scale .72 → 1.28 and opacity .55 → 0 by 70%,
// then held until the cycle restarts.
export function PulseRing({
  delay,
  color,
  active,
  reduced,
  size,
}: {
  delay: number;
  color: string;
  active: boolean;
  reduced: boolean;
  size: number;
}) {
  const p = useSharedValue(0);

  useEffect(() => {
    // Idle is where the user spends most of their time — don't burn UI-thread
    // frames on rings nobody can see.
    if (reduced || !active) {
      cancelAnimation(p);
      p.value = 0;
      return;
    }
    p.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: RING_CYCLE_MS, easing: RING_EASE }), -1, false)
    );
    return () => cancelAnimation(p);
  }, [delay, p, active, reduced]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.7, 1], [0.55, 0, 0]),
    transform: [{ scale: interpolate(p.value, [0, 0.7, 1], [0.72, 1.28, 1.28]) }],
  }));

  return (
    <Animated.View
      style={[
        style,
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: color,
        },
      ]}
    />
  );
}

// ── Cooking-icon carousel ───────────────────────────────────────────────────
// One linear clock walks through the icon list; every icon derives its own
// opacity / drift / scale from its distance to the clock, so neighbours cross-
// fade into each other and nothing ever mounts or unmounts mid-animation.
function CookingIcon({
  Icon,
  index,
  count,
  clock,
  size,
}: {
  Icon: typeof CookingPot;
  index: number;
  count: number;
  clock: SharedValue<number>;
  size: number;
}) {
  const style = useAnimatedStyle(() => {
    // Distance from the clock to this icon's slot, wrapped the short way round
    // so the hand-off from the last icon back to the first is seamless.
    let local = clock.value - index;
    const half = count / 2;
    if (local > half) local -= count;
    if (local < -half) local += count;
    return {
      opacity: interpolate(local, [-1, -0.34, 0.34, 1], [0, 1, 1, 0], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(local, [-1, 0, 1], [13, 0, -13], Extrapolation.CLAMP) },
        { scale: interpolate(local, [-1, 0, 1], [0.7, 1, 0.7], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <Animated.View style={[style, { position: 'absolute' }]}>
      <Icon size={size} color="#F6F2E9" strokeWidth={1.7} />
    </Animated.View>
  );
}

export function CookingIconCycle({ size, reduced }: { size: number; reduced: boolean }) {
  const clock = useSharedValue(0);

  useEffect(() => {
    if (reduced) return; // a single resting icon is enough
    clock.value = withRepeat(
      withTiming(THINKING_ICONS.length, {
        duration: THINKING_ICONS.length * ICON_SLOT_MS,
        easing: Easing.linear,
      }),
      -1,
      false
    );
    return () => cancelAnimation(clock);
  }, [clock, reduced]);

  return (
    <View
      style={{ alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {THINKING_ICONS.map((Icon, i) => (
        <CookingIcon
          key={i}
          Icon={Icon}
          index={i}
          count={THINKING_ICONS.length}
          clock={clock}
          size={size}
        />
      ))}
    </View>
  );
}

// ── Orbiting arcs — the "we're working" ring around the disc ─────────────────
export function ThinkingArc({
  duration,
  reverse,
  radius,
  dash,
  color,
  width,
  active,
  reduced,
  size,
}: {
  duration: number;
  reverse: boolean;
  radius: number;
  dash: number;
  color: string;
  width: number;
  active: boolean;
  reduced: boolean;
  size: number;
}) {
  const spin = useSharedValue(0);

  useEffect(() => {
    if (reduced || !active) {
      cancelAnimation(spin);
      return;
    }
    spin.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [duration, spin, active, reduced]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * (reverse ? -360 : 360)}deg` }],
  }));

  const circumference = 2 * Math.PI * radius;

  return (
    <Animated.View style={[style, { position: 'absolute' }]} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={width}
          strokeLinecap="round"
          strokeDasharray={`${circumference * dash} ${circumference}`}
        />
      </Svg>
    </Animated.View>
  );
}

// ── Waveform bar ────────────────────────────────────────────────────────────
// Same maths as the prototype's rAF loop, except `env` is the live mic level
// instead of a constant — so the bars genuinely track the user's voice. This is
// the part that makes the stage feel alive rather than decorative, and the
// reason the screens using it have to meter their recorders.
export function WaveBar({
  index,
  clock,
  level,
  width = 5,
}: {
  index: number;
  clock: SharedValue<number>;
  level: SharedValue<number>;
  width?: number;
}) {
  const style = useAnimatedStyle(() => {
    const env = 0.35 + level.value * 0.65;
    const wobble = Math.abs(Math.sin(clock.value * (2.1 + index * 0.55) + index));
    const scaleY = 0.18 + wobble * 0.82 * env * (index === 2 ? 1 : 0.8);
    return { transform: [{ scaleY }] };
  });

  return (
    <Animated.View
      style={[
        style,
        {
          width,
          height: '100%',
          borderRadius: 3,
          backgroundColor: index === 2 ? '#FFFFFF' : 'rgba(255,255,255,0.92)',
        },
      ]}
    />
  );
}

// ── Blinking dot — the "we're working on it" caret next to the transcript ────
export function BlinkDot({ delay, reduced }: { delay: number; reduced: boolean }) {
  const p = useSharedValue(reduced ? 1 : 0.25);

  useEffect(() => {
    if (reduced) return;
    p.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 550, easing: Easing.inOut(Easing.ease) }), -1, true)
    );
  }, [delay, p, reduced]);

  const style = useAnimatedStyle(() => ({ opacity: p.value }));

  return (
    <Animated.View
      style={[
        style,
        { width: 4, height: 4, borderRadius: 2, backgroundColor: designTokens.colors.olive },
      ]}
    />
  );
}
