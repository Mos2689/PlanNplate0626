// Plan Meals — PlannPlate design language.
//
// Re-skinned to mirror the curated "Plan setup" screen (see
// curated-plan-setup.tsx): a single Meal-plan-duration tile that opens a
// date-range calendar, a "How you like to cook" section (cooking rhythm +
// per-meal cook-style rows), and a sticky CTA.
//
// The underlying work is still AI generation: the per-meal habits drive
// WHICH meal types get generated (a "cook" habit = generate a recipe for
// that slot), and the cooking rhythm + habits are folded into the
// generation instructions. The heavy lifting (LLM calls, image
// generation, slot distribution, planning-event logging) still lives in
// the store's `startBackgroundGeneration` action so this screen can
// fire-and-forget on tap and route the user to the Meal Planning tab
// instantly — recipes stream in behind the PendingGenerationBanner there.
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Check,
  ChefHat,
  Flame,
  Layers,
  Sunrise,
  Sun,
  Moon,
  Ban,
  EggFried,
  Croissant,
  Refrigerator,
  Salad,
  CookingPot,
  Store,
  UtensilsCrossed,
  Minus,
  Plus,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/lib/useColorScheme';
import {
  useMealPlanStore,
  mergePersonaWithUserInstructions,
  type UserPreferences,
  type MealHabits,
  type BreakfastHabit,
  type LunchHabit,
  type DinnerHabit,
} from '@/lib/store';
import { MONTHLY_FEATURE_LIMITS } from '@/lib/store';
import { type MealType } from '@/lib/openai';
import { useAuthStore } from '@/lib/auth-store';
import {
  useHasPremiumAccess,
  useIsPremiumResolved,
  useSubscriptionStore,
} from '@/lib/subscription-store';
import { designTokens } from '@/lib/design-tokens';
import { useBehaviorInsights } from '@/hooks/useBehaviorInsights';
import {
  getInferredGenerationContext,
  composeEnrichedInstructions,
} from '@/lib/behavior-insights';
import {
  DEFAULT_BATCH_CONFIG,
  MAX_BATCH_RECIPES,
  type CookStyle,
  type BatchConfig,
} from '@/lib/high-protein-plan';
import { PlanTuneSheet } from '@/components/PlanTuneSheet';

// ───────────────────────────────────────────────────────────────────────────────
// HELPERS & CONSTANTS
// ───────────────────────────────────────────────────────────────────────────────

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function startOfTodayLocal(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Inclusive day count for a start→end range (≥ 1).
function daysInclusive(a: Date, b: Date): number {
  const A = new Date(a);
  A.setHours(0, 0, 0, 0);
  const B = new Date(b);
  B.setHours(0, 0, 0, 0);
  const diff = Math.round((B.getTime() - A.getTime()) / 86400000);
  return Math.max(1, diff + 1);
}

// Weekday chips for the batch cook-day picker. `idx` is the JS weekday
// (0 = Sun) so it lines up with Date.getDay() and the scheduler.
const WEEKDAYS: { idx: number; short: string }[] = [
  { idx: 1, short: 'Mon' },
  { idx: 2, short: 'Tue' },
  { idx: 3, short: 'Wed' },
  { idx: 4, short: 'Thu' },
  { idx: 5, short: 'Fri' },
  { idx: 6, short: 'Sat' },
  { idx: 0, short: 'Sun' },
];
const MAX_COOK_DAYS = 3;
const MAX_PLAN_DAYS = 14;

// Daypart palette — the selected colour traces the arc of the day
// (sunrise → midday → dusk). Mirrors curated-plan-setup.tsx.
const MEAL_THEME = {
  breakfast: '#B85A2E', // sunrise terracotta
  lunch: designTokens.colors.brand, // midday sage
  dinner: '#42526A', // dusk slate-indigo
} as const;

type HabitOption<T extends string> = {
  id: T;
  label: string;
  Icon: LucideIcon;
};

const BREAKFAST_HABITS: HabitOption<BreakfastHabit>[] = [
  { id: 'skip', label: 'Skip', Icon: Ban },
  { id: 'cook', label: 'Cook', Icon: EggFried },
  { id: 'grab', label: 'Grab & go', Icon: Croissant },
];
const LUNCH_HABITS: HabitOption<LunchHabit>[] = [
  { id: 'leftovers', label: 'Leftovers', Icon: Refrigerator },
  { id: 'cook', label: 'Cook fresh', Icon: Salad },
  { id: 'buy', label: 'Buy out', Icon: Store },
];
const DINNER_HABITS: HabitOption<DinnerHabit>[] = [
  { id: 'leftovers', label: 'Leftovers', Icon: Refrigerator },
  { id: 'cook', label: 'Cook fresh', Icon: CookingPot },
  { id: 'buy', label: 'Buy out', Icon: Store },
];

// ───────────────────────────────────────────────────────────────────────────────
// REUSABLE PICKERS — copied from curated-plan-setup.tsx so this screen reads
// identically. Extracting a shared module is future cleanup.
// ───────────────────────────────────────────────────────────────────────────────

function HabitRow<T extends string>({
  label,
  glyph: Glyph,
  theme,
  options,
  selected,
  onSelect,
  isDark,
}: {
  label: string;
  glyph: LucideIcon;
  theme: string;
  options: HabitOption<T>[];
  selected: T;
  onSelect: (id: T) => void;
  isDark: boolean;
}) {
  const labelColor = isDark ? '#8c8c8c' : designTokens.colors.ink3;
  const restBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const restBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const ink = isDark ? '#fff' : designTokens.colors.ink;
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Glyph size={13} color={theme} strokeWidth={2} />
        <Text
          style={{
            fontFamily: designTokens.font.medium,
            fontSize: 12.5,
            color: labelColor,
            letterSpacing: -0.1,
          }}
        >
          {label}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {options.map((opt) => {
          const sel = selected === opt.id;
          const Icon = opt.Icon;
          return (
            <Pressable
              key={opt.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(opt.id);
              }}
              style={{ flex: 1 }}
            >
              {({ pressed }) => (
                <View
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 6,
                    borderRadius: 14,
                    borderWidth: sel ? 1.5 : 1,
                    borderColor: sel ? theme : restBorder,
                    backgroundColor: restBg,
                    alignItems: 'center',
                    gap: 6,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                    shadowColor: theme,
                    shadowOpacity: sel ? 0.12 : 0,
                    shadowRadius: sel ? 9 : 0,
                    shadowOffset: { width: 0, height: sel ? 4 : 0 },
                    elevation: sel ? 2 : 0,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isDark ? '#262626' : '#FFFFFF',
                      borderWidth: 1,
                      borderColor: restBorder,
                    }}
                  >
                    <Icon
                      size={17}
                      color={sel ? theme : isDark ? '#6f6f6f' : designTokens.colors.ink3}
                      strokeWidth={sel ? 2.1 : 1.9}
                    />
                  </View>
                  <Text
                    style={{
                      fontFamily: sel ? designTokens.font.semibold : designTokens.font.medium,
                      fontSize: 12,
                      color: sel ? ink : isDark ? '#9a9a9a' : designTokens.colors.ink2,
                      letterSpacing: -0.1,
                    }}
                    numberOfLines={1}
                  >
                    {opt.label}
                  </Text>
                  {sel && (
                    <View
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: theme,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Check size={11} color={designTokens.colors.cream} strokeWidth={3} />
                    </View>
                  )}
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  isDark,
}: {
  label: string;
  options: { value: T; label: string; Icon?: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
  isDark: boolean;
}) {
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const ink = isDark ? '#fff' : designTokens.colors.ink;
  const inkTertiary = isDark ? '#888' : designTokens.colors.ink3;
  const restBg = isDark ? '#1f1f1f' : '#FFFFFF';
  return (
    <View style={{ marginBottom: 12 }}>
      <Text
        style={{
          fontFamily: designTokens.font.medium,
          fontSize: 12.5,
          color: inkTertiary,
          marginBottom: 6,
          letterSpacing: -0.1,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {options.map((opt) => {
          const sel = opt.value === value;
          const Icon = opt.Icon;
          return (
            <Pressable
              key={opt.value}
              onPress={() => {
                Haptics.selectionAsync();
                onChange(opt.value);
              }}
              style={{ flex: 1 }}
            >
              {({ pressed }) => (
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 7,
                    paddingVertical: 12,
                    paddingHorizontal: 6,
                    borderRadius: 12,
                    borderWidth: sel ? 0 : 1,
                    borderColor: cardBorder,
                    backgroundColor: sel ? designTokens.colors.brand : restBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  }}
                >
                  {Icon && (
                    <Icon
                      size={15}
                      color={sel ? designTokens.colors.cream : designTokens.colors.brand}
                      strokeWidth={2}
                    />
                  )}
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 12.5,
                      color: sel ? designTokens.colors.cream : ink,
                      letterSpacing: -0.1,
                    }}
                    numberOfLines={1}
                  >
                    {opt.label}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Compose a short natural-language note describing the cooking rhythm and
// per-meal habits, appended to the AI generation instructions so the plan
// respects the user's batch/daily + skip/grab/leftovers choices.
function describeCookingPlan(
  cookStyle: CookStyle,
  mealHabits: MealHabits,
  batch: BatchConfig,
): string {
  const parts: string[] = [];
  if (cookStyle === 'batch') {
    parts.push(
      `Batch cooking: cook fresh on ${batch.cookDays.length} day(s) each week, ` +
        `${batch.recipesPerCookDay} recipe(s) per cook day, eating leftovers between cook days.`,
    );
  } else {
    parts.push('Cooking daily — fresh meals each day.');
  }
  parts.push(
    `Meal approach — breakfast: ${mealHabits.breakfast}, ` +
      `lunch: ${mealHabits.lunch}, dinner: ${mealHabits.dinner}.`,
  );
  return parts.join(' ');
}

// ───────────────────────────────────────────────────────────────────────────────
// SCREEN
// ───────────────────────────────────────────────────────────────────────────────

export default function PlanMealsScreen() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const preferences = useMealPlanStore((s) => s.preferences);
  const startBackgroundGeneration = useMealPlanStore(
    (s) => s.startBackgroundGeneration,
  );
  // Guard re-entry — if a generation is already in flight the CTA should
  // tell the user instead of silently no-op'ing.
  const isPlanInFlight = useMealPlanStore(
    (s) => s.pendingGeneration?.active === true,
  );

  // Behavior intelligence — biases the LLM toward cuisines the user
  // actually cooks and quick meals if they lean that way.
  const insights = useBehaviorInsights();

  // ─── AUTH-LAST signup gate ───
  // Gate fires once the anonymous guest has built their first plan.
  const isAnonymous = useAuthStore((s) => s.isAnonymous);
  const freePlanBuildsUsed = useMealPlanStore(
    (s) => s.preferences.freePlanBuildsUsed ?? 0,
  );
  const freeGroceryBuildsUsed = useMealPlanStore(
    (s) => s.preferences.freeGroceryBuildsUsed ?? 0,
  );
  const markFreeGatedAction = useMealPlanStore((s) => s.markFreeGatedAction);
  const shouldGateSignup =
    isAnonymous && freePlanBuildsUsed >= 1 && freeGroceryBuildsUsed >= 1;

  // ── Monthly paywall limit (Plan My Meals) ──
  // Registered non-premium users get MONTHLY_FEATURE_LIMITS.planMeals plan
  // builds per calendar month; the next build opens the paywall. Premium is
  // unlimited; anonymous guests are governed by the signup gate above.
  const currentUserId = useAuthStore((s) => s.currentUser?.id);
  const hasPremiumAccess = useHasPremiumAccess();
  const isPremiumResolved = useIsPremiumResolved();
  const openPaywallSheet = useSubscriptionStore((s) => s.openPaywallSheet);
  const recordMonthlyFeatureUse = useMealPlanStore((s) => s.recordMonthlyFeatureUse);

  // ── Duration state ──
  // The user picks a start anchor + a length in days via the calendar modal.
  // `days` derives from lengthDays.
  const [pickedStart, setPickedStart] = useState<Date>(() => startOfTodayLocal());
  const [lengthDays, setLengthDays] = useState<number>(7);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [tempStart, setTempStart] = useState<Date | null>(null);
  const [tempEnd, setTempEnd] = useState<Date | null>(null);

  // ── Cooking style ──
  // Seeded from the user's saved meal habits (profile), tweakable here.
  const [mealHabits, setMealHabits] = useState<MealHabits>(
    preferences?.mealHabits ?? { breakfast: 'cook', lunch: 'leftovers', dinner: 'cook' },
  );
  const [cookStyle, setCookStyle] = useState<CookStyle>('daily');
  const [batch, setBatch] = useState<BatchConfig>(DEFAULT_BATCH_CONFIG);

  // ── Per-plan overrides (ephemeral) — Tune sheet ──
  const [overrides, setOverrides] = useState<Partial<UserPreferences>>({});
  const [oneTimeNote, setOneTimeNote] = useState<string>('');
  const [showTuneSheet, setShowTuneSheet] = useState(false);

  const effectivePreferences = useMemo<UserPreferences>(
    () => ({ ...preferences, ...overrides }),
    [preferences, overrides],
  );
  const hasOverrides = useMemo(
    () => Object.keys(overrides).length > 0 || oneTimeNote.trim().length > 0,
    [overrides, oneTimeNote],
  );

  // ── Derived ──
  const days = Math.max(1, lengthDays);
  const rangeStart = pickedStart;
  const rangeEnd = addDays(rangeStart, days - 1);
  const rangeLabel = `${shortDate(rangeStart)} – ${shortDate(rangeEnd)}`;

  // Which meal types to GENERATE recipes for. A "cook" habit means we
  // generate a fresh recipe for that slot; skip/grab/leftovers/buy don't
  // need a generated recipe. In batch mode lunch + dinner are always cooked
  // fresh (on cook days), so they're always generated.
  const selectedMealTypes = useMemo<MealType[]>(() => {
    const out: MealType[] = [];
    if (mealHabits.breakfast === 'cook') out.push('breakfast');
    if (cookStyle === 'batch') {
      out.push('lunch', 'dinner');
    } else {
      if (mealHabits.lunch === 'cook') out.push('lunch');
      if (mealHabits.dinner === 'cook') out.push('dinner');
    }
    return out;
  }, [mealHabits, cookStyle]);

  const canGenerate = selectedMealTypes.length > 0 && !isPlanInFlight;

  // ── Batch-cook handlers ──
  const toggleCookDay = useCallback((weekday: number) => {
    Haptics.selectionAsync();
    setBatch((b) => {
      const cur = b.cookDays;
      let next: number[];
      if (cur.includes(weekday)) {
        next = cur.filter((d) => d !== weekday);
        if (next.length === 0) return b; // keep at least one cook day
      } else {
        if (cur.length >= MAX_COOK_DAYS) return b; // soft cap
        next = [...cur, weekday].sort((a, c) => a - c);
      }
      return { ...b, cookDays: next };
    });
  }, []);

  const stepRecipesPerCookDay = useCallback((delta: number) => {
    Haptics.selectionAsync();
    setBatch((b) => ({
      ...b,
      recipesPerCookDay: Math.min(
        MAX_BATCH_RECIPES,
        Math.max(1, b.recipesPerCookDay + delta),
      ),
    }));
  }, []);

  // ── Calendar (duration) handlers ──
  const openCalendar = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTempStart(pickedStart);
    setTempEnd(addDays(pickedStart, days - 1));
    setCalendarOpen(true);
  }, [pickedStart, days]);

  const onCalendarDayPress = useCallback(
    (dateString: string) => {
      const [y, m, d] = dateString.split('-').map(Number);
      const picked = new Date(y, m - 1, d);
      Haptics.selectionAsync();
      if (!tempStart || (tempStart && tempEnd)) {
        setTempStart(picked);
        setTempEnd(null);
      } else if (picked.getTime() < tempStart.getTime()) {
        setTempStart(picked);
        setTempEnd(null);
      } else {
        // Respect the 14-day cap defensively.
        const capped = daysInclusive(tempStart, picked) <= MAX_PLAN_DAYS;
        if (capped) setTempEnd(picked);
      }
    },
    [tempStart, tempEnd],
  );

  const confirmRange = useCallback(() => {
    if (!tempStart) {
      setCalendarOpen(false);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPickedStart(tempStart);
    setLengthDays(daysInclusive(tempStart, tempEnd ?? tempStart));
    setCalendarOpen(false);
  }, [tempStart, tempEnd]);

  // Period-marked dates for the calendar (brand-coloured span).
  const calendarMarks = useMemo(() => {
    const marks: Record<string, any> = {};
    if (!tempStart) return marks;
    const brand = designTokens.colors.brand;
    const cream = designTokens.colors.cream;
    const startKey = formatDateKey(tempStart);
    const end = tempEnd ?? tempStart;
    const cur = new Date(tempStart);
    const endKey = formatDateKey(end);
    let guard = 0;
    while (cur.getTime() <= end.getTime() && guard < 400) {
      const k = formatDateKey(cur);
      marks[k] = {
        color: brand,
        textColor: cream,
        startingDay: k === startKey,
        endingDay: k === endKey,
      };
      cur.setDate(cur.getDate() + 1);
      guard++;
    }
    return marks;
  }, [tempStart, tempEnd]);

  // ── Generate (fire-and-forget) ──
  const handleGenerate = useCallback(() => {
    if (!canGenerate) return;

    // Signup gate: an anonymous guest who's already built BOTH a plan and a
    // grocery list is sent to signup before building another.
    if (shouldGateSignup) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/signup');
      return;
    }

    // Monthly paywall limit — registered non-premium users get a fixed number
    // of plan builds per month; beyond that the paywall opens.
    if (!isAnonymous && !hasPremiumAccess) {
      if (!isPremiumResolved) {
        // Subscription state hasn't settled — kick a re-sync and no-op so a
        // paying user doesn't see the paywall during the cold-start race.
        if (currentUserId) {
          void useSubscriptionStore.getState().syncWithRevenueCat(currentUserId);
        }
        return;
      }
      const used = useMealPlanStore.getState().getMonthlyFeatureCount('planMeals');
      if (used >= MONTHLY_FEATURE_LIMITS.planMeals) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        openPaywallSheet('pnp-second-tap');
        return;
      }
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    const personaInstructions = mergePersonaWithUserInstructions(
      effectivePreferences,
      oneTimeNote.trim() || undefined,
    );
    const soft = getInferredGenerationContext(insights);
    // Fold the cooking rhythm + per-meal habits into the instructions so the
    // generated plan reflects the user's batch/daily + cook-style choices.
    const cookingNote = describeCookingPlan(cookStyle, mealHabits, batch);
    const enrichedInstructions = composeEnrichedInstructions(
      `${personaInstructions || ''} ${cookingNote}`.trim(),
      soft,
    );

    startBackgroundGeneration({
      selectedMealTypes,
      days,
      enrichedInstructions,
      startDate: rangeStart,
    });

    if (isAnonymous) markFreeGatedAction('plan');
    // Count this build toward the monthly limit (non-premium only).
    if (!hasPremiumAccess) recordMonthlyFeatureUse('planMeals');

    router.replace('/(tabs)');
  }, [
    canGenerate,
    selectedMealTypes,
    effectivePreferences,
    oneTimeNote,
    days,
    rangeStart,
    cookStyle,
    mealHabits,
    batch,
    insights,
    router,
    startBackgroundGeneration,
    isAnonymous,
    shouldGateSignup,
    markFreeGatedAction,
    hasPremiumAccess,
    isPremiumResolved,
    currentUserId,
    openPaywallSheet,
    recordMonthlyFeatureUse,
  ]);

  // ── Token-driven style helpers ──
  const surfaceBg = isDark ? '#1a1a1a' : '#FFFFFF';
  const cardBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const hair2 = isDark ? '#2a2a2a' : designTokens.colors.hair2;
  const inkPrimary = isDark ? '#fff' : designTokens.colors.ink;
  const inkSecondary = isDark ? '#888' : designTokens.colors.ink2;
  const inkTertiary = isDark ? '#666' : designTokens.colors.ink3;

  const sectionEyebrow = {
    fontFamily: designTokens.font.medium,
    fontSize: 11,
    letterSpacing: 0.55,
    textTransform: 'uppercase' as const,
    color: inkTertiary,
  };

  return (
    <View style={{ flex: 1, backgroundColor: surfaceBg }}>
      <LinearGradient
        colors={['rgba(228,109,70,0.06)', 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.3, y: 0.6 }}
        style={{ position: 'absolute', top: 0, right: 0, width: 320, height: 320 }}
        pointerEvents="none"
      />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header — back + eyebrow + italic title, tune trigger on the right */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingTop: 4,
            paddingBottom: 8,
          }}
        >
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (from === 'onboarding') {
                router.replace('/(tabs)');
              } else {
                router.back();
              }
            }}
            hitSlop={10}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: cardBg,
                borderWidth: 1,
                borderColor: cardBorder,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeft size={22} color={inkPrimary} strokeWidth={1.9} />
            </View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 11,
                letterSpacing: 1.3,
                textTransform: 'uppercase',
                color: designTokens.colors.olive,
              }}
            >
              Plan setup
            </Text>
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 18,
                color: inkPrimary,
                letterSpacing: -0.3,
              }}
              numberOfLines={1}
            >
              Plan your{' '}
              <Text style={{ fontFamily: designTokens.font.serifItalic, fontStyle: 'italic' }}>
                meals
              </Text>
            </Text>
          </View>

          {/* Tune trigger — per-plan preference overrides (budget, time, etc.) */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowTuneSheet(true);
            }}
            hitSlop={10}
            accessibilityLabel={
              hasOverrides
                ? 'Tune preferences for this plan (overrides active)'
                : 'Tune preferences for this plan'
            }
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: cardBg,
                borderWidth: 1,
                borderColor: cardBorder,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <SlidersHorizontal size={18} color={inkPrimary} strokeWidth={1.9} />
              {hasOverrides && (
                <View
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: designTokens.colors.olive,
                    borderWidth: 1.5,
                    borderColor: cardBg,
                  }}
                />
              )}
            </View>
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Meal plan duration ── */}
          <Animated.View
            entering={FadeInDown.delay(60).springify()}
            style={{ paddingHorizontal: 24, marginTop: 8 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <CalendarIcon size={12} color={inkTertiary} strokeWidth={1.8} />
              <Text style={sectionEyebrow}>Meal plan duration</Text>
            </View>

            <Pressable onPress={openCalendar} style={{ width: '100%' }}>
              {({ pressed }) => (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: cardBorder,
                    backgroundColor: cardBg,
                    transform: [{ scale: pressed ? 0.99 : 1 }],
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: designTokens.colors.brand,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CalendarIcon size={19} color={designTokens.colors.cream} strokeWidth={1.9} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 15.5,
                        color: inkPrimary,
                        letterSpacing: -0.2,
                      }}
                    >
                      {rangeLabel}
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 12.5,
                        color: inkTertiary,
                        marginTop: 2,
                      }}
                    >
                      {days} {days === 1 ? 'day' : 'days'} · tap to change
                    </Text>
                  </View>
                  <ChevronRight size={18} color={inkTertiary} strokeWidth={1.85} />
                </View>
              )}
            </Pressable>
          </Animated.View>

          {/* ── How you like to cook ── */}
          <Animated.View
            entering={FadeInDown.delay(120).springify()}
            style={{ paddingHorizontal: 24, marginTop: 18 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <ChefHat size={12} color={inkTertiary} strokeWidth={1.8} />
              <Text style={sectionEyebrow}>How you like to cook</Text>
            </View>

            <SegmentedControl
              label="Cooking rhythm"
              value={cookStyle}
              onChange={setCookStyle}
              options={[
                { value: 'daily', label: 'Cook daily', Icon: Flame },
                { value: 'batch', label: 'Batch cook', Icon: Layers },
              ]}
              isDark={isDark}
            />

            {cookStyle === 'batch' && (
              <>
                {/* Cook-day picker */}
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 12.5,
                    color: isDark ? '#888' : designTokens.colors.ink3,
                    marginBottom: 6,
                    letterSpacing: -0.1,
                  }}
                >
                  Cook on
                </Text>
                <View style={{ flexDirection: 'row', gap: 5, marginBottom: 14 }}>
                  {WEEKDAYS.map(({ idx, short }) => {
                    const sel = batch.cookDays.includes(idx);
                    return (
                      <Pressable key={idx} onPress={() => toggleCookDay(idx)} style={{ flex: 1 }}>
                        {({ pressed }) => (
                          <View
                            style={{
                              paddingVertical: 10,
                              borderRadius: 11,
                              borderWidth: sel ? 0 : 1,
                              borderColor: cardBorder,
                              backgroundColor: sel
                                ? designTokens.colors.brand
                                : isDark
                                  ? '#1f1f1f'
                                  : '#FFFFFF',
                              alignItems: 'center',
                              transform: [{ scale: pressed ? 0.96 : 1 }],
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: designTokens.font.semibold,
                                fontSize: 11.5,
                                color: sel ? designTokens.colors.cream : inkPrimary,
                                letterSpacing: -0.2,
                              }}
                            >
                              {short}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                {/* Recipes per cook day */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: cardBorder,
                    backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                    marginBottom: 14,
                  }}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 13.5,
                        color: inkPrimary,
                        letterSpacing: -0.1,
                      }}
                    >
                      Recipes each cook day
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 11.5,
                        color: inkTertiary,
                        marginTop: 2,
                      }}
                    >
                      Distinct dishes you cook; extras repeat as leftovers
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    <Pressable
                      onPress={() => stepRecipesPerCookDay(-1)}
                      hitSlop={8}
                      disabled={batch.recipesPerCookDay <= 1}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: cardBorder,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: batch.recipesPerCookDay <= 1 ? 0.4 : 1,
                      }}
                    >
                      <Minus size={15} color={inkPrimary} strokeWidth={2} />
                    </Pressable>
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 16,
                        color: inkPrimary,
                        minWidth: 16,
                        textAlign: 'center',
                      }}
                    >
                      {batch.recipesPerCookDay}
                    </Text>
                    <Pressable
                      onPress={() => stepRecipesPerCookDay(1)}
                      hitSlop={8}
                      disabled={batch.recipesPerCookDay >= MAX_BATCH_RECIPES}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: cardBorder,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: batch.recipesPerCookDay >= MAX_BATCH_RECIPES ? 0.4 : 1,
                      }}
                    >
                      <Plus size={15} color={inkPrimary} strokeWidth={2} />
                    </Pressable>
                  </View>
                </View>
              </>
            )}

            {/* Per-meal habits — what you actually do in each slot. */}
            <View style={{ marginTop: 10 }}>
              <HabitRow
                label="Breakfast"
                glyph={Sunrise}
                theme={MEAL_THEME.breakfast}
                options={BREAKFAST_HABITS}
                selected={mealHabits.breakfast}
                onSelect={(id) => setMealHabits((m) => ({ ...m, breakfast: id }))}
                isDark={isDark}
              />

              {cookStyle === 'daily' && (
                <>
                  <HabitRow
                    label="Lunch"
                    glyph={Sun}
                    theme={MEAL_THEME.lunch}
                    options={LUNCH_HABITS}
                    selected={mealHabits.lunch}
                    onSelect={(id) => setMealHabits((m) => ({ ...m, lunch: id }))}
                    isDark={isDark}
                  />
                  <HabitRow
                    label="Dinner"
                    glyph={Moon}
                    theme={MEAL_THEME.dinner}
                    options={DINNER_HABITS}
                    selected={mealHabits.dinner}
                    onSelect={(id) => setMealHabits((m) => ({ ...m, dinner: id }))}
                    isDark={isDark}
                  />
                </>
              )}
            </View>
          </Animated.View>
        </ScrollView>

        {/* Sticky CTA */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 24,
            paddingTop: 10,
            paddingBottom: 22,
            backgroundColor: surfaceBg,
            borderTopWidth: 1,
            borderTopColor: hair2,
          }}
        >
          <Pressable onPress={handleGenerate} disabled={!canGenerate} style={{ width: '100%' }}>
            {({ pressed }) => (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  paddingVertical: 15,
                  borderRadius: 999,
                  backgroundColor: canGenerate ? designTokens.colors.brand : hair2,
                  shadowColor: canGenerate ? designTokens.colors.brandDeep : 'transparent',
                  shadowOpacity: 0.22,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: canGenerate ? 4 : 0,
                  transform: [{ scale: pressed && canGenerate ? 0.985 : 1 }],
                }}
              >
                <UtensilsCrossed
                  size={20}
                  color={canGenerate ? designTokens.colors.cream : inkTertiary}
                  strokeWidth={1.85}
                />
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 16,
                    color: canGenerate ? designTokens.colors.cream : inkTertiary,
                    letterSpacing: -0.25,
                  }}
                >
                  {isPlanInFlight ? 'Plan in progress…' : `Build ${days}-day plan`}
                </Text>
                {!isPlanInFlight && (
                  <ChevronRight
                    size={18}
                    color={canGenerate ? designTokens.colors.cream : inkTertiary}
                    strokeWidth={1.9}
                  />
                )}
              </View>
            )}
          </Pressable>
          {selectedMealTypes.length === 0 && (
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 12,
                textAlign: 'center',
                color: inkTertiary,
                marginTop: 8,
              }}
            >
              Pick “Cook” for at least one meal to build a plan.
            </Text>
          )}
        </View>
      </SafeAreaView>

      {/* ── Date-range calendar modal (Meal plan duration) ── */}
      <Modal
        visible={calendarOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            justifyContent: 'center',
            paddingHorizontal: 20,
          }}
        >
          <View
            style={{
              borderRadius: 24,
              backgroundColor: surfaceBg,
              overflow: 'hidden',
              paddingBottom: 14,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 18,
                paddingTop: 16,
                paddingBottom: 8,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 16,
                  color: inkPrimary,
                  letterSpacing: -0.25,
                }}
              >
                {tempStart && tempEnd
                  ? `${shortDate(tempStart)} – ${shortDate(tempEnd)} · ${daysInclusive(
                      tempStart,
                      tempEnd,
                    )} days`
                  : tempStart
                    ? `${shortDate(tempStart)} · pick an end date`
                    : 'Pick a start date'}
              </Text>
              <Pressable onPress={() => setCalendarOpen(false)} hitSlop={10}>
                <X size={20} color={inkTertiary} strokeWidth={2} />
              </Pressable>
            </View>

            <Calendar
              minDate={formatDateKey(new Date())}
              markingType="period"
              markedDates={calendarMarks}
              onDayPress={(d: { dateString: string }) => onCalendarDayPress(d.dateString)}
              theme={{
                calendarBackground: surfaceBg,
                monthTextColor: inkPrimary,
                dayTextColor: inkPrimary,
                textDisabledColor: isDark ? '#3a3a3a' : '#cdcdcd',
                todayTextColor: designTokens.colors.olive,
                arrowColor: designTokens.colors.olive,
                textSectionTitleColor: inkTertiary,
                textDayFontFamily: designTokens.font.regular,
                textMonthFontFamily: designTokens.font.semibold,
                textDayHeaderFontFamily: designTokens.font.medium,
              }}
            />

            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 11.5,
                color: inkTertiary,
                textAlign: 'center',
                marginTop: 2,
                marginBottom: 6,
              }}
            >
              Up to {MAX_PLAN_DAYS} days per plan.
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 18, marginTop: 6 }}>
              <Pressable
                onPress={() => {
                  setTempStart(null);
                  setTempEnd(null);
                }}
                style={{ flex: 1 }}
              >
                {({ pressed }) => (
                  <View
                    style={{
                      paddingVertical: 13,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: cardBorder,
                      backgroundColor: cardBg,
                      alignItems: 'center',
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 14,
                        color: inkPrimary,
                      }}
                    >
                      Clear
                    </Text>
                  </View>
                )}
              </Pressable>
              <Pressable onPress={confirmRange} disabled={!tempStart} style={{ flex: 1.4 }}>
                {({ pressed }) => (
                  <View
                    style={{
                      paddingVertical: 13,
                      borderRadius: 999,
                      backgroundColor: designTokens.colors.brand,
                      alignItems: 'center',
                      opacity: tempStart ? 1 : 0.5,
                      transform: [{ scale: pressed && tempStart ? 0.98 : 1 }],
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 14,
                        color: designTokens.colors.cream,
                      }}
                    >
                      Set dates
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Per-plan preference overrides — slides up from the bottom. */}
      <PlanTuneSheet
        visible={showTuneSheet}
        basePreferences={preferences}
        overrides={overrides}
        oneTimeNote={oneTimeNote}
        onChange={(nextOverrides, nextNote) => {
          setOverrides(nextOverrides);
          setOneTimeNote(nextNote);
        }}
        onClose={() => setShowTuneSheet(false)}
        isDark={isDark}
      />
    </View>
  );
}
