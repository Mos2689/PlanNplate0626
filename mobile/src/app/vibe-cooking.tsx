// Vibe Cooking — distinctive full-page recipe experience for the
// mood-led "Cook this vibe" flow.
//
// Flow (read top → bottom):
//
//   1. User picks a vibe on /generate-recipe and taps "Cook this vibe".
//   2. Generation succeeds → `setLastVibeCook({ recipe, vibeId })` +
//      router.push('/vibe-cooking'). The old bottom sheet is skipped.
//   3. This screen reads `lastVibeCook` from the meal-plan store
//      (no router params — see plan file for why).
//   4. Cinematic VibeHero up top, glanceable metrics, Ingredients
//      and Steps tabs below. Bottom CTA "Start cooking."
//   5. Start cooking → recipe added to library + cookingLog logged
//      as `intended` + keep-screen-awake activates.
//   6. Mark all steps done → VibeEndState overlay (confetti, italic
//      "Eat the vibe.", 5-emoji rating). Rate → log updates to
//      `cooked` + vibeRating. CTAs route the user onward.
//   7. Cleared from store on screen unmount.
//
// Brand rules preserved:
//   • One italic word per screen ("vibe" in the hero title via
//     italicWord prop; falls back to first noun if not detected).
//   • No Sparkles / ChefHat icons.
//   • Olive eyebrow + Instrument Serif italic for the hero title.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StatusBar,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Clock,
  Users,
  Flame,
  AlertTriangle,
  Bookmark,
  Timer as TimerIcon,
  X as XIcon,
  CirclePlus,
} from 'lucide-react-native';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  interpolate,
  Extrapolation,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';

import { useColorScheme } from '@/lib/useColorScheme';
import { designTokens, easing, elevation, getThemeColors } from '@/lib/design-tokens';
import {
  useMealPlanStore,
  type Recipe,
} from '@/lib/store';
import { VIBE_BY_ID, type VibeId } from '@/lib/vibe-inference';
import {
  getVibeTheme,
  detectTimerMinutes,
  formatTimerLabel,
  formatCountdown,
} from '@/lib/vibe-theme';
import { validateIngredients } from '@/lib/ingredient-validator';
import { VibeHero } from '@/components/VibeHero';
import { IngredientCheckRow } from '@/components/IngredientCheckRow';
import { CookStepCard } from '@/components/CookStepCard';
import { VibeEndState } from '@/components/VibeEndState';
import { VibeTimerCompleteSheet } from '@/components/VibeTimerCompleteSheet';
import { useTimerChime } from '@/lib/use-timer-chime';

const EASE = Easing.bezier(...easing.outStrong);
const { width: SCREEN_W } = Dimensions.get('window');
// Hero takes ~78% of screen width — cinematic but doesn't dominate.
const HERO_HEIGHT = Math.round(SCREEN_W * 0.78);
const COLLAPSE_AT = HERO_HEIGHT - 80; // px scroll at which the pinned title takes over

// Heuristic: pick a verb-adjacent emphasis word for the hero italic.
// Prefer words >= 4 chars; skip the first 2 words (often boring
// articles like "Slow-braised"). Falls back to the last word.
function pickItalicWord(title: string): string {
  const parts = title.split(/\s+/).filter((p) => /^[A-Za-z][A-Za-z'-]+$/.test(p));
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  const candidates = parts
    .map((w, i) => ({ w, i }))
    .filter(({ w, i }) => i >= 1 && w.length >= 4 && !/^(with|and|the|for|over|under|onto|into|from)$/i.test(w));
  if (candidates.length === 0) return parts[parts.length - 1];
  // Prefer the LAST suitable word so the italic feels like a tail
  // ornament — visually balanced with the brand's editorial style.
  return candidates[candidates.length - 1].w;
}

export default function VibeCookingScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = getThemeColors(isDark);
  const insets = useSafeAreaInsets();

  // Keep the screen awake while the user is cooking — this is THE
  // moment they don't want to fiddle with their phone.
  useKeepAwake();

  // ── Read the handoff payload ─────────────────────────────────
  const lastVibeCook = useMealPlanStore((s) => s.lastVibeCook);
  const clearLastVibeCook = useMealPlanStore((s) => s.clearLastVibeCook);
  const addRecipe = useMealPlanStore((s) => s.addRecipe);
  const logCooking = useMealPlanStore((s) => s.logCooking);

  const recipe = lastVibeCook?.recipe ?? null;
  const vibeId = (lastVibeCook?.vibeId ?? null) as VibeId | null;
  const vibe = vibeId ? VIBE_BY_ID[vibeId] : null;
  const theme = getVibeTheme(vibeId);
  const surfaceBg = isDark ? '#0F0E0B' : '#FFFFFF';
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;

  // NOTE: we intentionally do NOT clear `lastVibeCook` on unmount.
  // Keeping it lets the generate-recipe screen show a "Resume last
  // vibe" pill so the user can return to this exact recipe after an
  // accidental back. The payload is cleared explicitly via the
  // end-state CTAs ("Cook again" / "Pick a new vibe") or when the
  // user dismisses the resume pill.

  // ── Local cook-mode state ────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'ingredients' | 'steps'>('ingredients');
  const [ingredientChecks, setIngredientChecks] = useState<boolean[]>(() =>
    (recipe?.ingredients ?? []).map(() => false),
  );
  const [stepDone, setStepDone] = useState<boolean[]>(() =>
    (recipe?.instructions ?? []).map(() => false),
  );
  const [hasStartedCooking, setHasStartedCooking] = useState(false);
  const [endStateVisible, setEndStateVisible] = useState(false);
  // Tracks the cooking-log entry ID for this session so the
  // end-state rating can update the same row.
  const sessionSlotIdRef = useRef<string | null>(null);
  const savedRecipeIdRef = useRef<string | null>(null);

  // ── Timer state (one global running timer at a time) ─────────
  // Indexed by step number; -1 = none running. Countdown ticks via
  // setInterval clearing on unmount; total seconds tracked separately
  // so display reflects exact remaining time.
  //
  // Cook Mode additions:
  //   • `timerInitialSeconds` is captured at handleStartTimer so the
  //     progress bar can compute the elapsed ratio without us having
  //     to thread "what did this timer start at" through callbacks.
  //   • `lastFinishedStepIdx` survives the zero-tick (which clears
  //     timerStepIdx itself) so the time's-up overlay knows which
  //     step it's confirming. Cleared on overlay dismissal.
  //   • Screen-wake-lock is handled globally by the screen-level
  //     `useKeepAwake()` call above (around line 113), so no
  //     additional toggle is needed when timers start/stop.
  const [timerStepIdx, setTimerStepIdx] = useState<number>(-1);
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number>(0);
  const [timerInitialSeconds, setTimerInitialSeconds] = useState<number>(0);
  const [lastFinishedStepIdx, setLastFinishedStepIdx] = useState<number>(-1);

  // Audio: bell-style chime fires on zero-tick alongside the haptic.
  // Hook is failure-tolerant — if the bundled asset is the placeholder
  // (or fails to load), the chime no-ops and the rest of the flow is
  // unaffected. See use-timer-chime.ts header for the swap-in spec.
  const { playChime } = useTimerChime();

  useEffect(() => {
    if (timerStepIdx < 0) return;
    const id = setInterval(() => {
      setTimerSecondsLeft((prev) => {
        if (prev <= 1) {
          // Zero-tick: fire the multi-sensory completion moment.
          // Sound + haptic together cover all phone positions
          // (face-up, face-down, on-silent). Then capture which
          // step just finished so the overlay can render its
          // context, and clear the running-timer state so the
          // sticky pill disappears (overlay is the replacement).
          playChime();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setLastFinishedStepIdx(timerStepIdx);
          setTimerStepIdx(-1);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timerStepIdx, playChime]);

  const handleStartTimer = useCallback((stepIdx: number, minutes: number) => {
    const seconds = Math.round(minutes * 60);
    setTimerStepIdx(stepIdx);
    setTimerSecondsLeft(seconds);
    setTimerInitialSeconds(seconds);
    // Starting a new timer also dismisses any lingering "time's up"
    // overlay for a previously completed step — the new countdown
    // is the user's current focus.
    setLastFinishedStepIdx(-1);
  }, []);

  const cancelTimer = useCallback(() => {
    Haptics.selectionAsync();
    setTimerStepIdx(-1);
    setTimerSecondsLeft(0);
    setTimerInitialSeconds(0);
  }, []);

  // ── Derived: progress + phase ─────────────────────────────────
  // Progress is the elapsed fraction (0 → 1). Phase drives the
  // pill/step-card color shift + the critical-phase pulse anim.
  const timerProgress = useMemo(() => {
    if (timerInitialSeconds <= 0) return 0;
    return Math.max(
      0,
      Math.min(1, 1 - timerSecondsLeft / timerInitialSeconds),
    );
  }, [timerSecondsLeft, timerInitialSeconds]);

  const timerPhase: 'normal' | 'warn' | 'critical' = useMemo(() => {
    if (timerSecondsLeft > 30) return 'normal';
    if (timerSecondsLeft > 10) return 'warn';
    return 'critical';
  }, [timerSecondsLeft]);

  // Pulse animation for the critical phase. Shared value loops only
  // when phase === 'critical' AND a timer is running, so the pill is
  // visually quiet in the warn/normal phases.
  const pulseScale = useSharedValue(1);
  useEffect(() => {
    if (timerStepIdx >= 0 && timerPhase === 'critical') {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.045, { duration: 420, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 420, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 220 });
    }
  }, [timerStepIdx, timerPhase, pulseScale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  // Phase → background color override. Normal stays on the vibe's
  // theme accent; warn/critical swap to olive so the user has an
  // unmistakable visual cue without any reading required.
  const pillAccent =
    timerPhase === 'normal'
      ? theme.accent
      : designTokens.colors.olive;

  // ── Scroll handler (drives hero parallax + pinned title) ─────
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const pinnedTitleStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [COLLAPSE_AT * 0.65, COLLAPSE_AT],
      [0, 1],
      { extrapolateLeft: Extrapolation.CLAMP, extrapolateRight: Extrapolation.CLAMP },
    );
    return { opacity };
  });

  // ── Derived metrics ──────────────────────────────────────────
  const totalMinutes = (recipe?.prepTime ?? 0) + (recipe?.cookTime ?? 0);
  const activeMinutes = recipe?.prepTime ?? 0;
  const waitingMinutes = recipe?.cookTime ?? 0;
  const ingredientCount = recipe?.ingredients.length ?? 0;
  const remainingIngredients = ingredientChecks.filter((c) => !c).length;
  const stepCount = recipe?.instructions.length ?? 0;
  const completedSteps = stepDone.filter(Boolean).length;
  const violations = recipe?.violations ?? [];

  // Italic-word selection for the hero title.
  const italicWord = useMemo(
    () => (recipe ? pickItalicWord(recipe.name) : ''),
    [recipe?.name],
  );

  // ── Empty state (no payload — user deep-linked or hot-reloaded) ──
  if (!recipe || !vibeId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: surfaceBg }}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
          <Text
            style={{
              fontFamily: designTokens.font.semibold,
              fontSize: 10.5,
              letterSpacing: 1.3,
              textTransform: 'uppercase',
              color: designTokens.colors.olive,
              marginBottom: 10,
            }}
          >
            VIBE COOKING
          </Text>
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 22,
              letterSpacing: -0.4,
              color: colors.ink,
              textAlign: 'center',
              marginBottom: 18,
            }}
          >
            Pick a {''}
            <Text style={{ fontFamily: designTokens.font.serifItalic, fontStyle: 'italic', fontSize: 26 }}>
              vibe
            </Text>{' '}
            to cook.
          </Text>
          <Pressable
            onPress={() => router.replace('/generate-recipe')}
            style={({ pressed }) => ({
              paddingVertical: 12,
              paddingHorizontal: 22,
              borderRadius: 999,
              backgroundColor: designTokens.colors.brand,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            })}
          >
            <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 14, color: designTokens.colors.cream }}>
              Pick a vibe
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Lazy-save the recipe to the library on first save action ──
  // Shared by both "Start cooking" and "Add to plan" — whichever
  // fires first persists; subsequent calls return the same id.
  const ensureRecipeSaved = useCallback((): string => {
    if (savedRecipeIdRef.current) return savedRecipeIdRef.current;
    const validatedIngredients = validateIngredients(
      recipe.ingredients.map((ing) => ({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        category: (ing as any).category as
          | 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other',
      })),
    );
    const recipeToSave: Recipe = {
      id: '',
      name: recipe.name,
      description: recipe.description,
      imageUrl: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80',
      cookTime: recipe.cookTime,
      prepTime: recipe.prepTime,
      servings: recipe.servings,
      ingredients: validatedIngredients.map((ing, i) => ({
        id: `vibe-${i}`,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        category: ing.category,
      })),
      instructions: recipe.instructions,
      tags: [
        ...recipe.tags,
        ...(recipe.mealType ? [recipe.mealType] : []),
        'vibe-cooking',
        `vibe:${vibeId}`,
      ],
      calories: recipe.calories,
      isAIGenerated: true,
      isSaved: false,
      createdAt: new Date().toISOString(),
      violations: recipe.violations,
    };
    const realRecipeId = addRecipe(recipeToSave);
    savedRecipeIdRef.current = realRecipeId;
    return realRecipeId;
  }, [recipe, vibeId, addRecipe]);

  // ── Initialize cook session on mount ─────────────────────────
  // No explicit "Start cooking" button anymore — the screen is
  // browse-first. We save the recipe to the library + open a cook
  // slot id as soon as the user lands so the end-state flow and
  // cooking log still fire when all steps get checked off.
  useEffect(() => {
    if (!recipe || !vibeId) return;
    ensureRecipeSaved();
    if (!sessionSlotIdRef.current) {
      sessionSlotIdRef.current = `vibe-${Date.now()}`;
    }
    if (!hasStartedCooking) setHasStartedCooking(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.name, vibeId]);

  // ── Add to meal plan — reuses select-recipe picker ───────────
  const handleAddToPlan = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const recipeId = ensureRecipeSaved();
    router.push({
      pathname: '/select-recipe',
      params: { recipeId, mode: 'add-to-plan' },
    } as any);
  }, [router, ensureRecipeSaved]);

  // ── Mark all steps done → flip to 'cooked' + show end state ──
  useEffect(() => {
    if (!hasStartedCooking) return;
    if (stepCount === 0) return;
    if (completedSteps < stepCount) return;
    if (endStateVisible) return;

    // All steps complete. Append a `cooked` log (the prior
    // `intended` log stays as the planning trace). Rating is
    // applied on top via a second log when the user taps a face
    // — we keep both rows so the engine sees the full lifecycle.
    if (sessionSlotIdRef.current) {
      logCooking({
        slotId: `${sessionSlotIdRef.current}-cooked`,
        recipeId: savedRecipeIdRef.current,
        status: 'cooked',
        cookedAt: new Date().toISOString(),
        vibeId: vibeId ?? undefined,
      });
    }
    setEndStateVisible(true);
  }, [completedSteps, stepCount, hasStartedCooking, endStateVisible, logCooking, vibeId]);

  const handleRate = useCallback(
    (value: 1 | 2 | 3 | 4 | 5) => {
      // Tag the rating onto a separate log row so the engine has
      // both the cook event and the user's verdict.
      if (sessionSlotIdRef.current) {
        logCooking({
          slotId: `${sessionSlotIdRef.current}-rated`,
          recipeId: savedRecipeIdRef.current,
          status: 'cooked',
          cookedAt: new Date().toISOString(),
          vibeId: vibeId ?? undefined,
          vibeRating: value,
        });
      }
    },
    [logCooking, vibeId],
  );

  const handleCookAgain = useCallback(() => {
    setEndStateVisible(false);
    clearLastVibeCook();
    // Re-route to the generator with the vibe pre-selected so the
    // user can hit "Cook this vibe" again. The selection itself
    // happens inside generate-recipe (which already supports the
    // vibe-selection state); we just send them there.
    router.replace('/generate-recipe');
  }, [router, clearLastVibeCook]);

  const handlePickNewVibe = useCallback(() => {
    setEndStateVisible(false);
    clearLastVibeCook();
    router.replace('/generate-recipe');
  }, [router, clearLastVibeCook]);

  // Toggle handlers — memoized so the rows don't churn re-renders.
  const toggleIngredient = useCallback((idx: number) => {
    setIngredientChecks((prev) => {
      const next = [...prev];
      next[idx] = !next[idx];
      return next;
    });
  }, []);

  const toggleStep = useCallback((idx: number) => {
    setStepDone((prev) => {
      const next = [...prev];
      next[idx] = !next[idx];
      return next;
    });
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: surfaceBg }}>
      <StatusBar barStyle={theme.statusBarStyle === 'light' ? 'light-content' : 'dark-content'} />

      {/* ── Pinned compact title strip (appears on scroll) ───── */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            paddingTop: insets.top,
            paddingBottom: 10,
            paddingHorizontal: 16,
            backgroundColor: surfaceBg + 'F2',
            borderBottomWidth: 1,
            borderBottomColor: cardBorder,
            zIndex: 20,
          },
          pinnedTitleStyle,
        ]}
      >
        <Text
          numberOfLines={1}
          style={{
            fontFamily: designTokens.font.semibold,
            fontSize: 15.5,
            color: colors.ink,
            letterSpacing: -0.2,
          }}
        >
          {recipe.name}
        </Text>
      </Animated.View>

      {/* ── Sticky timer chip (only while a timer is running) ──
          Cook Mode: pill background shifts olive in warn/critical
          phases. A thin cream progress bar at the bottom depletes
          from 100% → 0% as the timer winds down (we chose a bar
          over a perimeter ring because the pill is a rounded-rect,
          not a circle — a bottom bar reads cleanly at this size).
          A subtle pulse animation kicks in at <=10s remaining. */}
      {timerStepIdx >= 0 && (
        <Animated.View
          entering={FadeIn.duration(220).easing(EASE)}
          pointerEvents="box-none"
          style={[
            {
              position: 'absolute',
              top: insets.top + 8,
              alignSelf: 'center',
              zIndex: 30,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingLeft: 12,
              paddingRight: 6,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: pillAccent,
              shadowColor: theme.ctaShadow,
              shadowOpacity: 0.36,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 4,
              overflow: 'hidden',
            },
            pulseStyle,
          ]}
        >
          <TimerIcon size={13} color={theme.onAccent} strokeWidth={2.2} />
          <Text
            style={{
              fontFamily: designTokens.font.semibold,
              fontSize: 13,
              color: theme.onAccent,
              letterSpacing: 0.3,
            }}
          >
            Step {timerStepIdx + 1} · {formatCountdown(timerSecondsLeft)}
          </Text>
          <Pressable
            onPress={cancelTimer}
            hitSlop={8}
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.18)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <XIcon size={11} color={theme.onAccent} strokeWidth={2.4} />
          </Pressable>

          {/* Progress bar — pinned to bottom edge of the pill,
              width shrinks as elapsed fraction grows. Cream tint
              for legibility on every phase color. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 2,
              backgroundColor: 'rgba(255,255,255,0.18)',
            }}
          >
            <View
              style={{
                height: '100%',
                width: `${Math.max(0, (1 - timerProgress) * 100)}%`,
                backgroundColor: 'rgba(255,255,255,0.85)',
              }}
            />
          </View>
        </Animated.View>
      )}

      {/* ── Time's-up overlay ─────────────────────────────────
          Mounts the instant a timer hits zero. Coaches the cook
          on what just finished (echoes the step text) and offers
          three actions: Done, +1 min, Snooze 30s. Extending
          restarts the timer on the same step. */}
      <VibeTimerCompleteSheet
        visible={lastFinishedStepIdx >= 0}
        stepNumber={lastFinishedStepIdx + 1}
        stepText={
          lastFinishedStepIdx >= 0 && recipe?.instructions?.[lastFinishedStepIdx]
            ? recipe.instructions[lastFinishedStepIdx]
            : ''
        }
        onDone={() => setLastFinishedStepIdx(-1)}
        onExtend={(seconds) => {
          // Restart the same step's timer for `seconds`. The
          // overlay dismisses; the sticky pill re-appears.
          const stepIdx = lastFinishedStepIdx;
          setLastFinishedStepIdx(-1);
          if (stepIdx >= 0) {
            handleStartTimer(stepIdx, seconds / 60);
          }
        }}
        isDark={isDark}
      />

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {/* ── Hero ─────────────────────────────────────────── */}
        <VibeHero
          vibeId={vibeId}
          title={recipe.name}
          italicWord={italicWord}
          scrollY={scrollY}
          height={HERO_HEIGHT}
          collapseAt={COLLAPSE_AT}
          onBack={() => router.back()}
        />

        {/* ── Body (brand-neutral, accent-tinted) ──────────── */}
        <View
          style={{
            backgroundColor: surfaceBg,
            paddingHorizontal: 18,
            paddingTop: 26,
            marginTop: -22,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
          }}
        >
          {/* Description (short, brand-neutral) */}
          {recipe.description ? (
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 14.5,
                lineHeight: 21,
                color: isDark ? '#bbb' : designTokens.colors.ink2,
                marginBottom: 18,
              }}
            >
              {recipe.description}
            </Text>
          ) : null}

          {/* ── Glanceable metrics — 3 equal tiles ─────────── */}
          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              marginBottom: 18,
            }}
          >
            {/* Time */}
            <View
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 10,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: cardBorder,
                backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                ...elevation.card,
              }}
            >
              <Clock size={18} color={theme.accent} strokeWidth={2} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 18,
                      letterSpacing: -0.4,
                      color: colors.ink,
                    }}
                  >
                    {totalMinutes}
                  </Text>
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 10,
                      color: isDark ? '#888' : designTokens.colors.ink3,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                    }}
                  >
                    min
                  </Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 2,
                    fontFamily: designTokens.font.regular,
                    fontSize: 10,
                    color: isDark ? '#888' : designTokens.colors.ink3,
                    letterSpacing: -0.05,
                  }}
                >
                  {activeMinutes}a · {waitingMinutes}w
                </Text>
              </View>
            </View>

            {/* Servings */}
            <View
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 10,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: cardBorder,
                backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                ...elevation.card,
              }}
            >
              <Users size={18} color={theme.accent} strokeWidth={2} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 18,
                      letterSpacing: -0.4,
                      color: colors.ink,
                    }}
                  >
                    {recipe.servings}
                  </Text>
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 10,
                      color: isDark ? '#888' : designTokens.colors.ink3,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                    }}
                  >
                    serves
                  </Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 2,
                    fontFamily: designTokens.font.regular,
                    fontSize: 10,
                    color: isDark ? '#888' : designTokens.colors.ink3,
                    letterSpacing: -0.05,
                  }}
                >
                  portions
                </Text>
              </View>
            </View>

            {/* Calories */}
            <View
              style={{
                flex: 1,
                paddingVertical: 12,
                paddingHorizontal: 10,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: cardBorder,
                backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                ...elevation.card,
              }}
            >
              <Flame size={18} color={theme.accent} strokeWidth={2} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 18,
                      letterSpacing: -0.4,
                      color: colors.ink,
                    }}
                  >
                    {recipe.calories}
                  </Text>
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 10,
                      color: isDark ? '#888' : designTokens.colors.ink3,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                    }}
                  >
                    cal
                  </Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 2,
                    fontFamily: designTokens.font.regular,
                    fontSize: 10,
                    color: isDark ? '#888' : designTokens.colors.ink3,
                    letterSpacing: -0.05,
                  }}
                >
                  per serve
                </Text>
              </View>
            </View>
          </View>

          {/* ── Violations banner (allergen/diet) ───────────── */}
          {violations.length > 0 && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 10,
                padding: 12,
                marginBottom: 16,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: 'rgba(228, 109, 70, 0.35)',
                backgroundColor: 'rgba(228, 109, 70, 0.08)',
              }}
            >
              <AlertTriangle size={16} color={designTokens.colors.olive} strokeWidth={2} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 11,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    color: designTokens.colors.olive,
                  }}
                >
                  Heads up
                </Text>
                <Text
                  style={{
                    marginTop: 3,
                    fontFamily: designTokens.font.regular,
                    fontSize: 13,
                    lineHeight: 18,
                    color: isDark ? '#ddd' : designTokens.colors.ink2,
                  }}
                >
                  {violations.slice(0, 2).join(' · ')}
                </Text>
              </View>
            </View>
          )}

          {/* ── Tab strip (Ingredients / Steps) ─────────────── */}
          <View
            style={{
              flexDirection: 'row',
              padding: 4,
              borderRadius: 999,
              backgroundColor: isDark ? '#1a1a1a' : designTokens.colors.hair2,
              marginTop: 4,
              marginBottom: 16,
            }}
          >
            {(['ingredients', 'steps'] as const).map((tab) => {
              const active = activeTab === tab;
              const count = tab === 'ingredients' ? ingredientCount : stepCount;
              return (
                <Pressable
                  key={tab}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setActiveTab(tab);
                  }}
                  style={{ flex: 1 }}
                >
                  <View
                    style={{
                      paddingVertical: 10,
                      borderRadius: 999,
                      alignItems: 'center',
                      backgroundColor: active ? (isDark ? '#262626' : '#FFFFFF') : 'transparent',
                      ...(active ? elevation.card : {}),
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 13.5,
                        letterSpacing: active ? -0.05 : 0.1,
                        color: active ? colors.ink : isDark ? '#888' : designTokens.colors.ink3,
                      }}
                    >
                      {tab === 'ingredients' ? 'Ingredients' : 'Steps'} · {count}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* ── Tab body ────────────────────────────────────── */}
          {activeTab === 'ingredients' ? (
            <View style={{ marginBottom: 16 }}>
              {/* Signature progress header */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                  paddingHorizontal: 2,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 10,
                      letterSpacing: 1.4,
                      textTransform: 'uppercase',
                      color: theme.accent,
                    }}
                  >
                    Mise en place
                  </Text>
                  <Text
                    style={{
                      marginTop: 4,
                      fontFamily: designTokens.font.regular,
                      fontSize: 13,
                      color: isDark ? '#888' : designTokens.colors.ink3,
                      letterSpacing: -0.05,
                    }}
                  >
                    Tap to check items off as you gather them
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 13,
                    color: isDark ? '#fff' : designTokens.colors.ink,
                    letterSpacing: -0.2,
                  }}
                >
                  {ingredientCount - remainingIngredients}/{ingredientCount}
                </Text>
              </View>

              {/* Thin accent progress bar */}
              <View
                style={{
                  height: 3,
                  borderRadius: 999,
                  backgroundColor: isDark ? '#1a1a1a' : designTokens.colors.hair2,
                  marginBottom: 14,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    height: '100%',
                    width: `${ingredientCount > 0 ? ((ingredientCount - remainingIngredients) / ingredientCount) * 100 : 0}%`,
                    backgroundColor: theme.accent,
                    borderRadius: 999,
                  }}
                />
              </View>

              {/* Ingredient card */}
              <View
                style={{
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: cardBorder,
                  backgroundColor: isDark ? '#141414' : '#FFFFFF',
                  overflow: 'hidden',
                  ...elevation.card,
                }}
              >
                {recipe.ingredients.map((ing, i) => (
                  <IngredientCheckRow
                    key={i}
                    name={ing.name}
                    quantity={`${ing.quantity} ${ing.unit}`.trim()}
                    checked={ingredientChecks[i] ?? false}
                    accent={theme.accent}
                    accentSoft={theme.accentSoft}
                    onToggle={() => toggleIngredient(i)}
                    showDivider={i < recipe.ingredients.length - 1}
                    isDark={isDark}
                  />
                ))}
              </View>
            </View>
          ) : (
            <View style={{ marginBottom: 16 }}>
              {recipe.instructions.map((step, i) => (
                <CookStepCard
                  key={i}
                  number={i + 1}
                  text={step}
                  done={stepDone[i] ?? false}
                  accent={theme.accent}
                  accentSoft={theme.accentSoft}
                  timerMinutes={detectTimerMinutes(step)}
                  onToggleDone={() => toggleStep(i)}
                  onStartTimer={(minutes) => handleStartTimer(i, minutes)}
                  isTimerRunning={timerStepIdx === i}
                  // Cook Mode: feed live progress + phase signals so
                  // the step number can render its own depleting
                  // ring synchronized with the sticky pill above.
                  timerProgress={timerStepIdx === i ? timerProgress : undefined}
                  timerSecondsRemaining={timerStepIdx === i ? timerSecondsLeft : undefined}
                  isDark={isDark}
                />
              ))}
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {/* ── Bottom: Add to meal plan (matches recipe-detail.tsx) ── */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 20,
          paddingTop: 14,
          paddingBottom: Math.max(insets.bottom, 16) + 8,
          backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: isDark ? '#2a2a2a' : designTokens.colors.hair2,
        }}
      >
        <Pressable
          onPress={handleAddToPlan}
          style={({ pressed }) => ({
            opacity: pressed ? 0.9 : 1,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          })}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 15,
              borderRadius: 999,
              backgroundColor: '#546445',
              shadowColor: '#546445',
              shadowOpacity: 0.25,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 3,
            }}
          >
            <CirclePlus size={18} color="#FAF7F0" strokeWidth={1.8} />
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 15,
                color: '#FAF7F0',
              }}
            >
              Add to meal{' '}
              <Text
                style={{
                  fontFamily: designTokens.font.serifItalic,
                  fontStyle: 'italic',
                  fontSize: 17,
                  color: '#FAF7F0',
                }}
              >
                plan
              </Text>
            </Text>
          </View>
        </Pressable>
      </View>

      {/* ── End-state overlay ───────────────────────────────── */}
      <VibeEndState
        visible={endStateVisible}
        vibeId={vibeId}
        recipeName={recipe.name}
        onRate={handleRate}
        onCookAgain={handleCookAgain}
        onPickNewVibe={handlePickNewVibe}
      />
    </View>
  );
}
