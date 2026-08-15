// Onboarding step 1 — "name the dishes you cook often", voice-first.
//
// Recreates the Claude Design prototype (`Voice Recipe Onboarding.dc.html`) as a
// phase-driven choreography on top of the app's existing Whisper pipeline:
//
//   idle      big breathing mic over a soft halo; headline + "OR / TYPE IT" visible
//   listening page furniture collapses away; mic fills with a gradient, pulsing
//             rings over a slow-spinning aurora, 5 bars driven by REAL mic metering
//   thinking  stage shrinks, blinking dots while Whisper + the dish splitter run
//   landing   the dish flies in on a check card, then flies out
//   done      the dish settles as a removable chip; CTA unlocks
//
// The prototype fakes recognition with a word-by-word timer. We can't: expo-av
// records, and text only exists once `openai-transcribe` (Whisper) and
// `parseDishNamesFromTranscript` come back ~1-3s later. `thinking` is the extra
// phase that covers that wait — everything else maps 1:1 to the prototype.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Keyboard } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  Check,
  ChefHat,
  ChevronRight,
  CirclePlus,
  CookingPot,
  Croissant,
  Keyboard as KeyboardIcon,
  Mic,
  Pencil,
  Salad,
  Soup,
  UtensilsCrossed,
  X,
} from 'lucide-react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { designTokens, easing, elevation, serifItalicFontStyle } from '@/lib/design-tokens';
import { apiFormCall } from '@/lib/api-router';
import { parseDishNamesFromTranscript, splitDishNames } from '@/lib/voice-dishes';
// Imported directly rather than threading eight callbacks through props: this
// component is onboarding step 1 and nothing else, so the coupling is honest.
// The tracker only ever sees counts and enums — never a dish name.
import {
  trackDishAdded,
  trackDishCaptureStarted,
  trackDishRemoved,
  trackDishRenamed,
  trackVoicePermissionDenied,
  trackVoiceRecordingStopped,
  trackVoiceTranscribeFailed,
  trackVoiceTranscribeSucceeded,
} from '@/lib/onboarding-analytics';
import type { DishInputMethod } from '@/lib/onboarding-analytics-policy';

// ── Stage geometry (verbatim from the prototype) ─────────────────────────────
const STAGE_W = 250;
const STAGE_H_OPEN = 250;
const STAGE_H_COMPACT = 136;
const MIC_IDLE = 168;
const MIC_LISTENING = 156;
const MIC_COMPACT = 96;
const RING = 190;
const HALO = 196;
const RING_CYCLE_MS = 2600;
const AURORA_SPIN_MS = 9000;
const BREATHE_MS = 4200;

// ── Processing ("thinking") motion ───────────────────────────────────────────
// Whisper + the dish splitter take 1-3s. Without motion the screen reads as
// crashed, so the mic disc becomes the loading indicator: cooking icons drift
// through it while two arcs orbit outside, and the copy advances.
const THINKING_ICONS = [CookingPot, ChefHat, Soup, Salad, Croissant, UtensilsCrossed];
const ICON_SLOT_MS = 900;
const ARC_SIZE = 132;
const ARC_OUTER_MS = 2600;
const ARC_INNER_MS = 3800;
const THINKING_LINES = ['Making sense of that…', 'Picking out the dishes…', 'Almost there…'];
const THINKING_LINE_MS = 1900;

// Post-transcription beats. The prototype waits 900ms before the hero leaves;
// we hold slightly less because the user has already waited out the Whisper
// round trip by this point.
const TRANSCRIPT_HOLD_MS = 350;
const HERO_HOLD_MS = 620;
const HERO_OUT_MS = 280;

const OUT_STRONG = Easing.bezier(...easing.outStrong);
const RING_EASE = Easing.bezier(0.22, 1, 0.36, 1);
const HERO_OUT_EASE = Easing.bezier(0.4, 0, 0.7, 0.2);
// The prototype's mic-resize curve is cubic-bezier(.34,1.4,.5,1) — an overshoot.
// A light spring is the honest RN equivalent.
const OVERSHOOT = { damping: 12, stiffness: 140 } as const;

type Phase = 'idle' | 'listening' | 'thinking' | 'landing' | 'done';

type Palette = {
  ink: string;
  ink2: string;
  ink3: string;
  hair: string;
  card: string;
  chip: string;
  chipHair: string;
};

function paletteFor(isDark: boolean): Palette {
  return isDark
    ? {
        ink: '#FFFFFF',
        ink2: '#888888',
        ink3: '#666666',
        hair: '#2a2a2a',
        card: '#1f1f1f',
        chip: '#20201c',
        chipHair: 'rgba(84,100,69,0.35)',
      }
    : {
        ink: designTokens.colors.ink,
        ink2: designTokens.colors.ink2,
        ink3: designTokens.colors.ink3,
        hair: designTokens.colors.hair,
        card: '#FFFFFF',
        chip: designTokens.colors.hair2,
        chipHair: 'rgba(84,100,69,0.14)',
      };
}

// ── Aurora — two soft colour blobs that rotate behind the mic while listening ─
// The prototype blurs two radial gradients by 26px. react-native-svg has no
// blur we can lean on cheaply, but a radial gradient that fades to zero over
// its whole radius reads the same at this scale.
const Aurora = React.memo(function Aurora() {
  return (
    <Svg width={STAGE_W} height={STAGE_W} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="auroraWarm" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={designTokens.colors.olive} stopOpacity={0.5} />
          <Stop offset="1" stopColor={designTokens.colors.olive} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="auroraSage" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={designTokens.colors.brand} stopOpacity={0.42} />
          <Stop offset="1" stopColor={designTokens.colors.brand} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx="32" cy="30" r="58" fill="url(#auroraWarm)" />
      <Circle cx="70" cy="68" r="58" fill="url(#auroraSage)" />
    </Svg>
  );
});

// ── Halo — the faint terracotta glow that sits under the resting mic ─────────
const Halo = React.memo(function Halo() {
  return (
    <Svg width={HALO} height={HALO} viewBox="0 0 100 100">
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
function PulseRing({
  delay,
  color,
  active,
  reduced,
}: {
  delay: number;
  color: string;
  active: boolean;
  reduced: boolean;
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
          width: RING,
          height: RING,
          borderRadius: RING / 2,
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

function CookingIconCycle({ size, reduced }: { size: number; reduced: boolean }) {
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
function ThinkingArc({
  duration,
  reverse,
  radius,
  dash,
  color,
  width,
  active,
  reduced,
}: {
  duration: number;
  reverse: boolean;
  radius: number;
  dash: number;
  color: string;
  width: number;
  active: boolean;
  reduced: boolean;
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
      <Svg width={ARC_SIZE} height={ARC_SIZE} viewBox="0 0 100 100">
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
// instead of a constant — so the bars genuinely track the user's voice.
function WaveBar({
  index,
  clock,
  level,
}: {
  index: number;
  clock: SharedValue<number>;
  level: SharedValue<number>;
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
          width: 5,
          height: '100%',
          borderRadius: 3,
          backgroundColor: index === 2 ? '#FFFFFF' : 'rgba(255,255,255,0.92)',
        },
      ]}
    />
  );
}

// ── Blinking dot — the "we're working on it" caret next to the transcript ────
function BlinkDot({ delay, reduced }: { delay: number; reduced: boolean }) {
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

// ── Captured dish chip ──────────────────────────────────────────────────────
// Tapping the label opens an inline rename (the old list's pencil affordance,
// without the pencil); the X removes.
function DishChip({
  dish,
  index,
  colors,
  editing,
  draft,
  onStartEdit,
  onChangeDraft,
  onCommitEdit,
  onRemove,
}: {
  dish: string;
  index: number;
  colors: Palette;
  editing: boolean;
  draft: string;
  onStartEdit: () => void;
  onChangeDraft: (t: string) => void;
  onCommitEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(14).stiffness(160).delay(index * 60)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        paddingLeft: 16,
        paddingRight: 10,
        paddingVertical: 11,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: editing ? designTokens.colors.brand : colors.chipHair,
        backgroundColor: colors.chip,
      }}
    >
      {editing ? (
        <TextInput
          value={draft}
          onChangeText={onChangeDraft}
          onSubmitEditing={onCommitEdit}
          onBlur={onCommitEdit}
          autoFocus
          returnKeyType="done"
          placeholder="Dish name"
          placeholderTextColor={colors.ink3}
          style={{
            flex: 1,
            fontFamily: designTokens.font.medium,
            fontSize: 15,
            color: colors.ink,
            padding: 0,
          }}
        />
      ) : (
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontFamily: designTokens.font.medium, fontSize: 15, color: colors.ink }}
        >
          {dish}
        </Text>
      )}
      {/* Edit (pencil) — hidden while already editing this row. */}
      {!editing && (
        <Pressable
          onPress={onStartEdit}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${dish}`}
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(84,100,69,0.10)',
          }}
        >
          <Pencil size={14} color={designTokens.colors.brand} strokeWidth={2} />
        </Pressable>
      )}
      <Pressable
        onPress={onRemove}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${dish}`}
        style={{
          width: 30,
          height: 30,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(84,100,69,0.10)',
        }}
      >
        <X size={13} color={designTokens.colors.brand} strokeWidth={2.6} />
      </Pressable>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  /** Dishes captured so far — owned by the onboarding screen. */
  dishes: string[];
  /** Cap (MAX_FREQUENT_COOKS). */
  max: number;
  /**
   * Parent owns the cap / dedupe rules; one raw string may name several dishes.
   * `method` is passed through purely so the screen can report which capture
   * paths a user actually used when onboarding completes — this step is a
   * voice-first bet and that's the number that tells us whether it landed.
   */
  onAdd: (raw: string, method: DishInputMethod) => void;
  onRemove: (dish: string) => void;
  onRename: (original: string, next: string) => void;
  /** Identity ribbon + step headline, rendered by the screen and collapsed by us. */
  header: React.ReactNode;
  isDark: boolean;
};

export function VoiceDishCapture({
  dishes,
  max,
  onAdd,
  onRemove,
  onRename,
  header,
  isDark,
}: Props) {
  const colors = paletteFor(isDark);
  const reduced = useReducedMotion();

  const [phase, setPhase] = useState<Phase>(dishes.length > 0 ? 'done' : 'idle');
  const [transcript, setTranscript] = useState('');
  const [hero, setHero] = useState<{ name: string; extra: number } | null>(null);
  const [heroLeaving, setHeroLeaving] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [thinkLine, setThinkLine] = useState(0);
  const [typing, setTyping] = useState(false);
  const [typeDraft, setTypeDraft] = useState('');
  const [editingDish, setEditingDish] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  const recordingRef = useRef<Audio.Recording | null>(null);
  // Guards against a double-tap / rapid re-render launching two createAsync
  // calls before the first has written recordingRef — that race also trips
  // "Only one Recording object can be prepared at a given time."
  const startingRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Consecutive failed voice attempts — after 2 we nudge the user to type instead.
  const voiceFailCountRef = useRef(0);
  const after = useCallback((ms: number, fn: () => void) => {
    timersRef.current.push(setTimeout(fn, ms));
  }, []);
  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const atMax = dishes.length >= max;
  const listening = phase === 'listening';
  const settled = phase === 'done' && dishes.length > 0;
  // `raised` collapses the page furniture (header + the OR/TYPE IT section) only
  // while the mic is actively in play. It must NOT stay collapsed in the resting
  // `settled` state, otherwise the type-it input disappears after the first dish
  // and taps fall through to the mic behind it — so the user can't add more by
  // typing. `compact` still shrinks the mic stage once settled.
  const raised = phase !== 'idle' && !settled;
  const compact = phase === 'thinking' || phase === 'landing' || settled;

  // ── Animation drivers ──────────────────────────────────────────────────────
  // Height and opacity run on separate values because the prototype fades
  // faster than it collapses (340ms vs 640ms).
  const headP = useSharedValue(0);
  const headOp = useSharedValue(1);
  const altP = useSharedValue(0);
  const altOp = useSharedValue(1);
  const stageH = useSharedValue(STAGE_H_OPEN);
  const micShell = useSharedValue(MIC_IDLE);
  const gradientOp = useSharedValue(0);
  const ringsOp = useSharedValue(0);
  const auroraOp = useSharedValue(0);
  const haloOp = useSharedValue(1);
  const pillOp = useSharedValue(1);
  const pillScale = useSharedValue(1);
  const statusOp = useSharedValue(1);
  const transcriptOp = useSharedValue(0);
  const chipsOp = useSharedValue(0);
  const chipsShift = useSharedValue(14);
  const breathe = useSharedValue(1);
  const spin = useSharedValue(0);
  const heroIn = useSharedValue(0);
  const heroOut = useSharedValue(0);
  const thinkOp = useSharedValue(0);
  const statusFade = useSharedValue(1);
  const level = useSharedValue(0.2);
  const waveClock = useSharedValue(0);

  // Natural heights of the two collapsible blocks. Until onLayout reports them
  // we leave height unset — pinning a guessed value would clip the content for
  // a frame on devices where it doesn't match.
  const [headH, setHeadH] = useState<number | null>(null);

  // Free-running clock for the waveform — the RN equivalent of the prototype's
  // requestAnimationFrame loop, kept on the UI thread.
  const frame = useFrameCallback((info) => {
    waveClock.value = info.timeSinceFirstFrame / 1000;
  }, false);

  useEffect(() => {
    frame.setActive(listening && !reduced);
  }, [listening, reduced, frame]);

  // Phase → every animated value, mirroring the prototype's renderVals().
  useEffect(() => {
    headP.value = withTiming(raised ? 1 : 0, { duration: 640, easing: OUT_STRONG });
    headOp.value = withTiming(raised ? 0 : 1, { duration: 340 });
    altP.value = withTiming(raised ? 1 : 0, { duration: 600, easing: OUT_STRONG });
    altOp.value = withTiming(raised ? 0 : 1, { duration: 320 });
    stageH.value = withTiming(compact ? STAGE_H_COMPACT : STAGE_H_OPEN, {
      duration: 620,
      easing: OUT_STRONG,
    });
    micShell.value = withSpring(
      listening ? MIC_LISTENING : compact ? MIC_COMPACT : MIC_IDLE,
      OVERSHOOT
    );
    gradientOp.value = withTiming(listening ? 1 : 0, { duration: 400 });
    ringsOp.value = withTiming(listening ? 1 : 0, { duration: 400 });
    auroraOp.value = withTiming(listening ? 0.85 : 0, { duration: 500 });
    haloOp.value = withTiming(listening ? 0 : 1, { duration: 500 });
    pillOp.value = withTiming(raised ? 0 : 1, { duration: 320 });
    pillScale.value = withSpring(listening ? 0.85 : 1, OVERSHOOT);
    statusOp.value = withTiming(phase === 'landing' ? 0 : 1, { duration: 300 });
    transcriptOp.value = withTiming(phase === 'thinking' ? 1 : 0, { duration: 400 });
    chipsOp.value = withTiming(settled ? 1 : 0, { duration: 450 });
    chipsShift.value = withTiming(settled ? 0 : 14, { duration: 560, easing: OUT_STRONG });
    thinkOp.value = withTiming(phase === 'thinking' ? 1 : 0, { duration: 320 });
  }, [
    phase,
    raised,
    compact,
    listening,
    settled,
    headP,
    headOp,
    altP,
    altOp,
    stageH,
    micShell,
    gradientOp,
    ringsOp,
    auroraOp,
    haloOp,
    pillOp,
    pillScale,
    statusOp,
    transcriptOp,
    chipsOp,
    chipsShift,
    thinkOp,
  ]);

  // Rotating "we're working on it" copy. The line swaps at the bottom of a
  // fade so the text never pops.
  const advanceThinkLine = useCallback(() => {
    setThinkLine((i) => (i + 1) % THINKING_LINES.length);
  }, []);

  useEffect(() => {
    if (phase !== 'thinking') {
      setThinkLine(0);
      statusFade.value = 1;
      return;
    }
    const id = setInterval(() => {
      statusFade.value = withSequence(
        withTiming(0, { duration: 180 }, (finished) => {
          if (finished) runOnJS(advanceThinkLine)();
        }),
        withTiming(1, { duration: 260 })
      );
    }, THINKING_LINE_MS);
    return () => clearInterval(id);
  }, [phase, statusFade, advanceThinkLine]);

  // The two ambient loops. Breathing stops while listening (the waveform is the
  // life in that state); the aurora only spins while there's something to spin.
  useEffect(() => {
    if (reduced || listening) {
      breathe.value = withTiming(1, { duration: 200 });
      return;
    }
    breathe.value = withRepeat(
      withTiming(1.045, { duration: BREATHE_MS / 2, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [listening, reduced, breathe]);

  useEffect(() => {
    if (reduced || !listening) {
      spin.value = 0;
      return;
    }
    spin.value = withRepeat(
      withTiming(1, { duration: AURORA_SPIN_MS, easing: Easing.linear }),
      -1,
      false
    );
  }, [listening, reduced, spin]);

  // Hero card in / out.
  useEffect(() => {
    if (!hero) {
      heroIn.value = 0;
      heroOut.value = 0;
      return;
    }
    if (heroLeaving) {
      heroOut.value = withTiming(1, { duration: HERO_OUT_MS, easing: HERO_OUT_EASE });
    } else {
      heroIn.value = 0;
      heroIn.value = withSpring(1, { damping: 11, stiffness: 150 });
    }
  }, [hero, heroLeaving, heroIn, heroOut]);

  // Removing the last chip returns the screen to its opening state.
  useEffect(() => {
    if (dishes.length === 0 && phase === 'done') setPhase('idle');
  }, [dishes.length, phase]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  // expo-av allows only ONE prepared Recording globally. If this component
  // unmounts while a recording is active/prepared (step swap, mid-record
  // navigation), the native recorder is orphaned and the NEXT mount's
  // createAsync throws "Only one Recording object can be prepared at a given
  // time." Unload it on unmount so nothing is ever left behind.
  useEffect(() => () => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    rec?.stopAndUnloadAsync().catch(() => {});
    Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
  }, []);

  // ── Animated styles ────────────────────────────────────────────────────────
  const headStyle = useAnimatedStyle(() => ({
    height: headH == null ? undefined : interpolate(headP.value, [0, 1], [headH, 0]),
    opacity: headOp.value,
    transform: [{ translateY: interpolate(headP.value, [0, 1], [0, -18]) }],
  }));
  const stageStyle = useAnimatedStyle(() => ({ height: stageH.value }));
  const micStyle = useAnimatedStyle(() => ({
    width: micShell.value,
    height: micShell.value,
    borderRadius: micShell.value / 2,
    transform: [{ scale: breathe.value }],
  }));
  const gradientStyle = useAnimatedStyle(() => ({ opacity: gradientOp.value }));
  const ringsStyle = useAnimatedStyle(() => ({ opacity: ringsOp.value }));
  const auroraStyle = useAnimatedStyle(() => ({
    opacity: auroraOp.value,
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: haloOp.value }));
  const pillStyle = useAnimatedStyle(() => ({
    opacity: pillOp.value,
    transform: [{ scale: pillScale.value }],
  }));
  const statusStyle = useAnimatedStyle(() => ({ opacity: statusOp.value }));
  const statusLineStyle = useAnimatedStyle(() => ({ opacity: statusFade.value }));
  const thinkStyle = useAnimatedStyle(() => ({ opacity: thinkOp.value }));
  const transcriptStyle = useAnimatedStyle(() => ({ opacity: transcriptOp.value }));
  const heroStyle = useAnimatedStyle(() => ({
    opacity: heroIn.value * (1 - heroOut.value),
    transform: [
      { translateY: interpolate(heroIn.value, [0, 1], [18, 0]) - heroOut.value * 26 },
      { scale: interpolate(heroIn.value, [0, 1], [0.9, 1]) - heroOut.value * 0.1 },
    ],
  }));

  // ── Voice → dish ───────────────────────────────────────────────────────────
  // The recorder lifecycle below is carried over verbatim from onboarding.tsx —
  // each guard fixes a real failure (see the inline notes). Don't simplify it.
  const failVoice = useCallback(
    // `countAsNotHeard` is true only when we recorded fine but couldn't make out
    // a dish. Hard errors (mic/permission/transcribe/no-recording) don't count
    // toward the "try typing instead" nudge.
    (message: string, countAsNotHeard = false) => {
      clearTimers();
      let displayMessage = message;
      if (countAsNotHeard) {
        // After 2 "not heard" attempts in a row, stop asking them to re-speak
        // and open the type field with a clear nudge instead.
        const failures = voiceFailCountRef.current + 1;
        voiceFailCountRef.current = failures;
        if (failures >= 2) {
          displayMessage = "Still not catching it — try typing it instead.";
          voiceFailCountRef.current = 0; // reset so the next run starts fresh
          setTyping(true); // the type input autoFocuses when it mounts
        }
      }
      setVoiceError(displayMessage);
      setTranscript('');
      setHero(null);
      setHeroLeaving(false);
      setPhase(dishes.length > 0 ? 'done' : 'idle');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    [clearTimers, dishes.length]
  );

  const landDishes = useCallback(
    (names: string[], text: string) => {
      voiceFailCountRef.current = 0; // a good capture clears the failure streak
      setTranscript(text);
      // The card should only promise what will actually fit — the parent caps
      // at `max`, so a 4-dish utterance with one slot left is just one dish.
      const accepted = Math.max(1, Math.min(names.length, max - dishes.length));
      after(TRANSCRIPT_HOLD_MS, () => {
        setHero({ name: names[0], extra: accepted - 1 });
        setHeroLeaving(false);
        setPhase('landing');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        after(HERO_HOLD_MS, () => setHeroLeaving(true));
        after(HERO_HOLD_MS + HERO_OUT_MS, () => {
          setHero(null);
          setHeroLeaving(false);
          setTranscript('');
          // Parent applies the cap + dedupe; it splits on commas, which is how
          // the previous implementation handed over multi-dish utterances too.
          onAdd(names.join(', '), 'voice');
          setPhase('done');
          // `accepted` already accounts for the cap, so this is the count that
          // actually lands — not the count the user said.
          const total = dishes.length + accepted;
          trackDishAdded('voice', accepted, total, total >= max);
        });
      });
    },
    [after, dishes.length, max, onAdd]
  );

  const transcribe = useCallback(
    async (uri: string) => {
      // Whisper plus the dish splitter is the slowest thing in onboarding and
      // the phase the user stares at, so the round trip is timed. Started here
      // rather than in stopVoice so the number is the network cost, not the
      // recorder teardown.
      const startedAt = Date.now();
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists) throw new Error('Audio file not found');
        const form = new FormData();
        form.append('file', { uri, type: 'audio/m4a', name: 'recording.m4a' } as any);
        form.append('model', 'whisper-1');
        const result = await apiFormCall<{ text: string }>('openai-transcribe', form);
        if (result.failure) throw result.failure;
        const text = (result.data?.text ?? '').trim();
        // Empty, too short, or a Whisper silence-hallucination → "not heard".
        if (splitDishNames(text).length === 0) {
          trackVoiceTranscribeFailed('not_heard', Date.now() - startedAt);
          failVoice("Didn't quite get that. Try again.", true);
          return;
        }
        // Whisper transcribes spoken lists without commas ("Butter Chicken
        // Shakshuka Bhindi Masala"), which naive splitting captures as one
        // dish. Ask the model to split it into distinct dishes; fall back to
        // the raw transcript if that fails or finds nothing.
        let names: string[] = [];
        try {
          names = await parseDishNamesFromTranscript(text);
        } catch (parseErr) {
          console.warn('[VoiceDishCapture] dish split failed, using raw transcript', parseErr);
        }
        // Which path produced the dishes is worth knowing: a high `fallback`
        // rate means the splitter model is failing quietly and multi-dish
        // utterances are being captured as one long dish.
        let splitSource: 'model' | 'fallback' = 'model';
        if (names.length === 0) {
          splitSource = 'fallback';
          names = splitDishNames(text);
        }
        if (names.length === 0) {
          trackVoiceTranscribeFailed('not_heard', Date.now() - startedAt);
          failVoice("Didn't quite get that. Try again.", true);
          return;
        }
        trackVoiceTranscribeSucceeded(Date.now() - startedAt, names.length, splitSource);
        landDishes(names, text);
      } catch (e) {
        console.error('[VoiceDishCapture] transcription failed', e);
        trackVoiceTranscribeFailed('transcribe_error', Date.now() - startedAt);
        failVoice('Could not transcribe. Please type instead.');
      }
    },
    [failVoice, landDishes]
  );

  const startVoice = useCallback(async () => {
    // Re-entrancy guard: a second call while the first is still preparing would
    // run createAsync twice (the ref isn't written until after the await).
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      setVoiceError(null);
      setElapsed(0);
      trackDishCaptureStarted('voice');
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        // The single biggest silent drop-off in a voice-first step — a user who
        // declines the mic here has no obvious way forward except noticing the
        // TYPE IT card, so this needs to be visible in the funnel.
        trackVoicePermissionDenied();
        setVoiceError('Microphone permission is required');
        return;
      }
      // expo-av allows only ONE active Recording. A recorder left behind by a
      // previous (possibly failed) run makes the next prepare fail with
      // "recorder not prepared" — so unload any lingering one first.
      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch {
          /* already unloaded / never prepared */
        }
        recordingRef.current = null;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // createAsync prepares AND starts atomically — avoids the prepare/start
      // race that intermittently throws "recorder not prepared". The status
      // callback is what feeds the waveform: HIGH_QUALITY already sets
      // isMeteringEnabled, so `metering` (dBFS) arrives every 80ms.
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        (status) => {
          if (typeof status.metering === 'number') {
            // −60dB (near silence) → 0, 0dB (clipping) → 1.
            const next = Math.max(0, Math.min(1, (status.metering + 60) / 60));
            level.value = withTiming(next, { duration: 90 });
          } else {
            // Some Android devices never report metering — fall back to the
            // prototype's own constant envelope so the bars still move.
            level.value = 0.45;
          }
          setElapsed((prev) => {
            const secs = Math.floor((status.durationMillis ?? 0) / 1000);
            return secs === prev ? prev : secs;
          });
        },
        80
      );
      recordingRef.current = recording;
      setPhase('listening');
    } catch (e) {
      console.error('[VoiceDishCapture] startVoice failed', e);
      trackVoiceTranscribeFailed('start_error');
      setVoiceError('Failed to start recording');
      setPhase(dishes.length > 0 ? 'done' : 'idle');
      // Never leave a half-initialised recorder around for the next attempt.
      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch {
          /* ignore */
        }
        recordingRef.current = null;
      }
    } finally {
      startingRef.current = false;
    }
  }, [dishes.length, level]);

  const stopVoice = useCallback(async () => {
    setPhase('thinking');
    trackVoiceRecordingStopped(elapsed);
    const recording = recordingRef.current;
    recordingRef.current = null;
    // No recorder means the start never took — bail out rather than sitting in
    // `thinking` forever waiting for a transcription that will never arrive.
    if (!recording) {
      trackVoiceTranscribeFailed('no_recording');
      failVoice('Could not process recording.');
      return;
    }
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (uri) await transcribe(uri);
      else {
        trackVoiceTranscribeFailed('no_recording');
        failVoice('Could not process recording.');
      }
    } catch (e) {
      console.error('[VoiceDishCapture] stopVoice failed', e);
      trackVoiceTranscribeFailed('no_recording');
      failVoice('Could not process recording.');
    } finally {
      // Release the iOS record session so the next prepare starts clean.
      try {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      } catch {
        /* ignore */
      }
    }
  }, [elapsed, failVoice, transcribe]);

  const onMicTap = useCallback(() => {
    if (phase === 'thinking' || phase === 'landing') return;
    if (listening) {
      stopVoice();
    } else if (!atMax) {
      // Switching to voice: drop any half-typed dish and dismiss the keyboard so
      // its on-screen dictation can't type into the field. Voice must capture
      // ONLY what's spoken, not the leftover typed text.
      setTyping(false);
      setTypeDraft('');
      Keyboard.dismiss();
      startVoice();
    }
  }, [atMax, listening, phase, startVoice, stopVoice]);

  // ── Type-it path ───────────────────────────────────────────────────────────
  const commitType = useCallback(() => {
    if (atMax || typeDraft.trim().length === 0) return;
    setVoiceError(null);
    trackDishCaptureStarted('type');
    // One typed entry may still name several dishes — the parent splits on
    // commas — so count what splitDishNames will actually yield, capped.
    const accepted = Math.max(
      1,
      Math.min(splitDishNames(typeDraft).length, max - dishes.length)
    );
    onAdd(typeDraft, 'type');
    const total = dishes.length + accepted;
    trackDishAdded('type', accepted, total, total >= max);
    setTypeDraft('');
    setPhase('done');
  }, [atMax, dishes.length, max, onAdd, typeDraft]);

  const commitEdit = useCallback(() => {
    if (!editingDish) return;
    onRename(editingDish, editDraft);
    // Only the count travels — a rename is a signal that transcription got the
    // dish wrong, and the corrected text is exactly what we must not record.
    trackDishRenamed(dishes.length);
    setEditingDish(null);
    setEditDraft('');
  }, [dishes.length, editDraft, editingDish, onRename]);

  const removeDish = useCallback(
    (dish: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (editingDish === dish) setEditingDish(null);
      onRemove(dish);
      trackDishRemoved(Math.max(0, dishes.length - 1));
    },
    [dishes.length, editingDish, onRemove]
  );

  // ── Copy ───────────────────────────────────────────────────────────────────
  const statusLabel = listening
    ? `Listening · ${formatElapsed(elapsed)} · tap to stop`
    : phase === 'thinking'
      ? THINKING_LINES[thinkLine]
      : settled
        ? atMax
          ? `That's all ${max} — you're set`
          : 'Tap to add another dish'
        : 'Tell us what you cook';

  const micDisabled = atMax || phase === 'thinking' || phase === 'landing';

  return (
    <KeyboardAwareScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, paddingTop: 4, paddingBottom: 28 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
    >
      {/* ── Header — collapses out of the way the moment you start ─────────── */}
      <Animated.View
        style={[headStyle, { overflow: 'hidden', paddingHorizontal: 24 }]}
        pointerEvents={raised ? 'none' : 'auto'}
      >
        <View onLayout={(e) => setHeadH(e.nativeEvent.layout.height)}>{header}</View>
      </Animated.View>

      {/* ── Stage: mic, status, transcript, chips ──────────────────────────────
          Fills & centres while capturing, but once dishes are settled it hugs
          its content so the OR / TYPE IT card below it stays on screen (lets the
          user keep adding manually alongside the list). ── */}
      <View
        style={{
          flex: settled ? undefined : 1,
          minHeight: 0,
          alignItems: 'center',
          justifyContent: settled ? 'flex-start' : 'center',
          paddingVertical: 8,
        }}
      >
        <Animated.View
          style={[
            stageStyle,
            { width: STAGE_W, alignItems: 'center', justifyContent: 'center' },
          ]}
        >
          <Animated.View style={[auroraStyle, { position: 'absolute' }]} pointerEvents="none">
            <Aurora />
          </Animated.View>

          <Animated.View style={[haloStyle, { position: 'absolute' }]} pointerEvents="none">
            <Halo />
          </Animated.View>

          <Animated.View
            style={[
              ringsStyle,
              { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
            ]}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <PulseRing delay={0} color="rgba(84,100,69,0.35)" active={listening} reduced={reduced} />
            <PulseRing delay={850} color="rgba(228,109,70,0.32)" active={listening} reduced={reduced} />
            <PulseRing delay={1700} color="rgba(84,100,69,0.22)" active={listening} reduced={reduced} />
          </Animated.View>

          {/* Orbiting arcs — only while we're waiting on the transcription */}
          <Animated.View
            style={[
              thinkStyle,
              { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
            ]}
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
              active={phase === 'thinking'}
              reduced={reduced}
            />
            <ThinkingArc
              duration={ARC_INNER_MS}
              reverse
              radius={39}
              dash={0.14}
              width={2}
              color={designTokens.colors.olive}
              active={phase === 'thinking'}
              reduced={reduced}
            />
          </Animated.View>

          {/* Mic — white collar + coloured disc */}
          <Pressable
            onPress={onMicTap}
            disabled={micDisabled}
            accessibilityRole="button"
            accessibilityLabel={
              listening
                ? 'Stop recording'
                : phase === 'thinking'
                  ? 'Transcribing your recording'
                  : 'Record the dishes you cook'
            }
            accessibilityState={{ busy: phase === 'thinking', disabled: micDisabled }}
            // Only dim for "you've hit the cap" — dimming while transcribing
            // made a working screen look broken.
            style={{ opacity: atMax ? 0.55 : 1 }}
          >
            <Animated.View
              style={[
                micStyle,
                {
                  backgroundColor: '#FFFFFF',
                  padding: 9,
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
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 46 }}
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                  >
                    {[0, 1, 2, 3, 4].map((i) => (
                      <WaveBar key={i} index={i} clock={waveClock} level={level} />
                    ))}
                  </View>
                ) : phase === 'thinking' ? (
                  <CookingIconCycle size={30} reduced={reduced} />
                ) : (
                  <Mic size={compact ? 28 : 34} color="#F6F2E9" strokeWidth={1.7} />
                )}
              </View>
            </Animated.View>
          </Pressable>

          {/* SPEAK IT pill — floats over the top of the rings */}
          <Animated.View
            pointerEvents="none"
            style={[
              pillStyle,
              {
                position: 'absolute',
                top: 22,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                paddingHorizontal: 15,
                paddingVertical: 7,
                borderRadius: 20,
                backgroundColor: designTokens.colors.olive,
                ...elevation.card,
              },
            ]}
          >
            <Mic size={11} color="#FFFFFF" strokeWidth={2.2} />
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 11,
                letterSpacing: 1.3,
                color: '#FFFFFF',
              }}
            >
              SPEAK IT
            </Text>
          </Animated.View>
        </Animated.View>

        {/* Status line */}
        <Animated.View
          style={[
            statusStyle,
            { height: 26, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
          ]}
        >
          <Animated.Text
            accessibilityLiveRegion="polite"
            style={[
              statusLineStyle,
              {
                fontFamily: designTokens.font.regular,
                fontSize: 13,
                color: voiceError ? designTokens.colors.notice : colors.ink3,
              },
            ]}
          >
            {voiceError ?? statusLabel}
          </Animated.Text>
        </Animated.View>

        {/* Transcript — what Whisper heard, in the brand's serif italic */}
        <Animated.View
          style={[
            transcriptStyle,
            {
              minHeight: 30,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 34,
            },
          ]}
          pointerEvents="none"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {transcript.length > 0 && (
              <Text
                numberOfLines={2}
                style={{
                  fontFamily: designTokens.font.serifItalic,
                  fontStyle: serifItalicFontStyle,
                  fontSize: 21,
                  lineHeight: 27,
                  textAlign: 'center',
                  color: colors.ink,
                }}
              >
                {transcript}
              </Text>
            )}
            {phase === 'thinking' && (
              <View style={{ flexDirection: 'row', gap: 3 }}>
                <BlinkDot delay={0} reduced={reduced} />
                <BlinkDot delay={200} reduced={reduced} />
                <BlinkDot delay={400} reduced={reduced} />
              </View>
            )}
          </View>
        </Animated.View>

        {/* Hero confirmation card — overlays the stage, then clears */}
        {hero && (
          <View
            pointerEvents="none"
            style={{
              ...StyleSheet.absoluteFillObject,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
          <Animated.View
            style={[
              heroStyle,
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 11,
                paddingVertical: 13,
                paddingLeft: 15,
                paddingRight: 20,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: 'rgba(84,100,69,0.16)',
                backgroundColor: colors.card,
                ...elevation.thumb,
              },
            ]}
          >
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                backgroundColor: designTokens.colors.brand,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Check size={14} color="#FFFFFF" strokeWidth={2.6} />
            </View>
            <View>
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 17,
                  letterSpacing: -0.2,
                  color: colors.ink,
                }}
              >
                {hero.name}
              </Text>
              {hero.extra > 0 && (
                <Text
                  style={{
                    marginTop: 2,
                    fontFamily: designTokens.font.regular,
                    fontSize: 12,
                    color: colors.ink3,
                  }}
                >
                  +{hero.extra} more
                </Text>
              )}
            </View>
          </Animated.View>
          </View>
        )}
      </View>

      {/* ── OR / TYPE IT / hint — shown whenever the mic isn't actively in play
          (idle or settled). Plain conditional render so it can never get stuck
          collapsed by the height animation. ── */}
      {!raised && (
        <View style={{ paddingHorizontal: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.hair }} />
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 10,
                letterSpacing: 2,
                color: colors.ink3,
              }}
            >
              OR
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.hair }} />
          </View>

          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setTyping((t) => !t);
            }}
            disabled={atMax}
            accessibilityRole="button"
            style={{ opacity: atMax ? 0.55 : 1 }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                padding: 13,
                borderRadius: 18,
                borderWidth: typing ? 1.5 : 1,
                borderColor: typing ? designTokens.colors.brand : colors.hair,
                backgroundColor: colors.card,
                ...elevation.card,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 13,
                  backgroundColor: designTokens.colors.brand,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <KeyboardIcon size={21} color="#F6F2E9" strokeWidth={1.6} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 13,
                    letterSpacing: 1.1,
                    color: colors.ink,
                    marginBottom: 5,
                  }}
                >
                  TYPE IT
                </Text>
                <Text
                  numberOfLines={2}
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12.5,
                    color: colors.ink2,
                  }}
                >
                  Enter the name of what you want to cook
                </Text>
              </View>
              <ChevronRight size={16} color={colors.ink3} strokeWidth={2} />
            </View>
          </Pressable>

          {typing && !atMax && (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 12 }}>
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 14,
                  height: 52,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.hair,
                  backgroundColor: colors.card,
                }}
              >
                <TextInput
                  value={typeDraft}
                  onChangeText={setTypeDraft}
                  onSubmitEditing={commitType}
                  autoFocus
                  returnKeyType="done"
                  placeholder="e.g. Butter Chicken"
                  placeholderTextColor={colors.ink3}
                  style={{
                    flex: 1,
                    fontFamily: designTokens.font.regular,
                    fontSize: 15,
                    color: colors.ink,
                    padding: 0,
                  }}
                />
              </View>
              <Pressable
                onPress={commitType}
                disabled={typeDraft.trim().length === 0}
                accessibilityRole="button"
                accessibilityLabel="Add dish"
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor:
                    typeDraft.trim().length === 0 ? colors.hair : designTokens.colors.brand,
                }}
              >
                <CirclePlus size={22} color={designTokens.colors.cream} strokeWidth={2} />
              </Pressable>
            </View>
          )}

          <View style={{ alignItems: 'center', marginTop: 14, marginBottom: 18 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 16,
                paddingVertical: 9,
                borderRadius: 20,
                backgroundColor: colors.chip,
              }}
            >
              <CookingPot size={13} color={colors.ink3} strokeWidth={1.7} />
              <Text
                style={{
                  fontFamily: designTokens.font.regular,
                  fontSize: 12.5,
                  color: colors.ink3,
                }}
              >
                Add up to {max} dishes you cook often.
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Captured dishes — the growing list sits BELOW the OR/TYPE IT card so
          the mic + manual-add options stay together at the top. */}
      {dishes.length > 0 && (
        <View style={{ width: '100%', paddingHorizontal: 24, marginTop: 6, gap: 8 }}>
          {dishes.map((dish, i) => (
            <DishChip
              key={dish}
              dish={dish}
              index={i}
              colors={colors}
              editing={editingDish === dish}
              draft={editDraft}
              onStartEdit={() => {
                setEditingDish(dish);
                setEditDraft(dish);
              }}
              onChangeDraft={setEditDraft}
              onCommitEdit={commitEdit}
              onRemove={() => removeDish(dish)}
            />
          ))}
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
