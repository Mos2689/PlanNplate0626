// Plan Meals — PlannPlate design language.
//
// Form-only UI now. The heavy generation work (LLM calls, image
// generation, ingredient validation, slot distribution, planning-event
// logging) lives in the store's `startBackgroundGeneration` action so
// this screen can fire-and-forget on tap and route the user to the
// Meal Planning tab instantly — recipes stream in behind the
// PendingGenerationBanner there.
//
// One italic word per screen ("meals" in the header). No Sparkles.
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Sun,
  Sunrise,
  Moon,
  Apple,
  Check,
  Utensils,
  // Premium icon swaps — no Sparkles, no Wand, no generic Cookie, no ChefHat.
  Flame,
  UtensilsCrossed,
  CalendarDays,
  CalendarRange,
  SlidersHorizontal,
  Clock,
  Package,
  Target,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/lib/useColorScheme';
import {
  useMealPlanStore,
  mergePersonaWithUserInstructions,
  type UserPreferences,
} from '@/lib/store';
import { type MealType } from '@/lib/openai';
import { useAuthStore } from '@/lib/auth-store';
import { designTokens } from '@/lib/design-tokens';
import { useBehaviorInsights } from '@/hooks/useBehaviorInsights';
import {
  getInferredGenerationContext,
  composeEnrichedInstructions,
} from '@/lib/behavior-insights';
import {
  useSubscriptionStore,
  useHasPremiumAccess,
} from '@/lib/subscription-store';
import { PlanTuneSheet } from '@/components/PlanTuneSheet';

// ───────────────────────────────────────────────────────────────────────────────
// CONSTANTS — preserved verbatim
// ───────────────────────────────────────────────────────────────────────────────

type PeriodId = 'day' | '3day' | 'week' | 'custom';

const PERIODS: {
  id: PeriodId;
  label: string;
  days: number;
  sublabel: string;
  Icon: any;
}[] = [
  { id: 'day',    label: 'Today',     days: 1, sublabel: '1 day',         Icon: Sunrise },
  { id: '3day',   label: '3 Days',    days: 3, sublabel: 'Quick stretch', Icon: CalendarDays },
  { id: 'week',   label: 'This Week', days: 7, sublabel: '7 days',        Icon: CalendarRange },
  { id: 'custom', label: 'Custom',    days: 5, sublabel: 'Pick a length', Icon: SlidersHorizontal },
];

// Inline calendar opens when the user picks the Custom period
// option. Constants below are duplicated from generate-recipe.tsx
// for this round — extracting a shared <DateRangeCalendar /> is
// future cleanup. Keep the values in lock-step with that screen.
const MAX_PLAN_DAYS = 14;
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateChip(date: Date | null): string {
  if (!date) return 'Select';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Returns 35–42 cells for a month grid: null for the leading empty
// slots (Sun-anchored), then Date for every day in the month.
function getCalendarDays(year: number, month: number): Array<Date | null> {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();
  const days: Array<Date | null> = [];
  for (let i = 0; i < startDayOfWeek; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
  return days;
}

function startOfTodayLocal(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

// Per-meal accent: dinner gets the olive (terracotta) tint so the row
// reads with a warm-cool rhythm instead of a single repeated color.
// `Apple` is used for Snack (freed UtensilsCrossed up for the CTA, where
// it carries the same "set the table" meaning as on the QuickActions hero).
const MEAL_TYPES: { id: MealType; label: string; Icon: any; accent: 'sage' | 'olive' }[] = [
  { id: 'breakfast', label: 'Breakfast', Icon: Coffee, accent: 'sage' },
  { id: 'lunch',     label: 'Lunch',     Icon: Sun,    accent: 'sage' },
  { id: 'snack',     label: 'Snack',     Icon: Apple,  accent: 'sage' },
  { id: 'dinner',    label: 'Dinner',    Icon: Moon,   accent: 'olive' },
];

// Stock images, formatDateKey, and per-recipe persistence/distribution
// have moved into the store's `startBackgroundGeneration` action so the
// screen can fire-and-forget. Nothing about the generation pipeline
// lives here anymore — this file is pure form UI.

// Smart defaults — preserved verbatim
function defaultMealTypesFromPersona(prefs: ReturnType<typeof useMealPlanStore.getState>['preferences']): MealType[] {
  const out: MealType[] = [];
  const habits = prefs.mealHabits;
  if (!habits) {
    return ['lunch', 'dinner'];
  }
  if (habits.breakfast === 'cook' || habits.breakfast === 'grab') out.push('breakfast');
  if (habits.lunch === 'cook' || habits.lunch === 'leftovers') out.push('lunch');
  if (habits.dinner === 'cook' || habits.dinner === 'leftovers') out.push('dinner');
  return out.length > 0 ? out : ['lunch', 'dinner'];
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

  // Paywall gate: non-premium, non-in-trial users see the value-first
  // paywall sheet while the engine builds their first plan. Premium /
  // in-trial users (paid subscribers, grandfathered, or already-skipped
  // users still inside their 30-day soft trial) skip the sheet and
  // navigate straight to /(tabs) as before.
  const hasPremiumAccess = useHasPremiumAccess();
  const openPaywallSheet = useSubscriptionStore((s) => s.openPaywallSheet);

  // ─── AUTH-LAST signup gate ───
  // Gate fires once the anonymous guest has built their first plan.
  // Any subsequent plan build sends them to signup first.
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

  const [period, setPeriod] = useState<PeriodId>('week');

  // ── Custom-range calendar state ──
  // Calendar lives inline on this screen and opens only when the
  // user picks the Custom period. `startDate` defaults to today so
  // the engine has a sensible anchor when the user hasn't touched
  // the calendar yet (preset paths use this exact anchor as well).
  // `customSelectingEnd` is the two-tap state machine: false → next
  // tap sets start; true → next tap sets end. After end is set it
  // flips back to false so a third tap resets the start.
  const [startDate, setStartDate] = useState<Date>(() => startOfTodayLocal());
  const [endDate, setEndDate] = useState<Date | null>(() => {
    // Initial period is 'week' (7 days) — seed endDate so the days
    // memo + summary card render correctly on first paint.
    const e = startOfTodayLocal();
    e.setDate(e.getDate() + 6);
    return e;
  });
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => startOfTodayLocal());
  const [customSelectingEnd, setCustomSelectingEnd] = useState(false);

  // ── Per-plan overrides (ephemeral) ──
  // The user can tap the tune icon in the header to spin up a bottom
  // sheet that lets them tweak ANY editable preference just for this
  // generation. Overrides never reach the store, the DB, or the saved
  // profile — they live and die in this screen's state. The merged
  // view (`effectivePreferences`) feeds the seed for selectedMealTypes,
  // the summary card, and the persona-instructions composition.
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

  const [selectedMealTypes, setSelectedMealTypes] = useState<MealType[]>(
    () => defaultMealTypesFromPersona(preferences)
  );

  // ── Derived ──
  // For custom mode, count inclusive days between start and end
  // (1 day when no end picked yet). For preset modes, the period
  // table is the source of truth — but endDate is kept in sync by
  // the preset handler so the calendar reflects the same range when
  // the user toggles back to Custom.
  const days = useMemo(() => {
    if (period === 'custom') {
      if (!endDate) return 1;
      const diffMs = endDate.getTime() - startDate.getTime();
      return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);
    }
    return PERIODS.find((p) => p.id === period)?.days ?? 7;
  }, [period, startDate, endDate]);

  // Calendar grid + month label derive entirely from calendarMonth.
  const calendarDays = useMemo(
    () => getCalendarDays(calendarMonth.getFullYear(), calendarMonth.getMonth()),
    [calendarMonth],
  );
  const monthYearLabel = useMemo(
    () => calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    [calendarMonth],
  );

  // Past-month nav guard — we never let the user travel back to a
  // month that's entirely before today, since past dates aren't
  // selectable anyway.
  const canNavigatePrevMonth = useMemo(() => {
    const today = startOfTodayLocal();
    const prevMonthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 0);
    return prevMonthEnd >= today;
  }, [calendarMonth]);

  const navigateCalendarMonth = useCallback(
    (direction: 'prev' | 'next') => {
      if (direction === 'prev' && !canNavigatePrevMonth) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCalendarMonth((prev) => {
        const next = new Date(prev);
        next.setMonth(next.getMonth() + (direction === 'next' ? 1 : -1));
        return next;
      });
    },
    [canNavigatePrevMonth],
  );

  const totalMeals = useMemo(
    () => days * Math.max(selectedMealTypes.length, 1),
    [days, selectedMealTypes.length]
  );

  const canGenerate = selectedMealTypes.length > 0 && !isPlanInFlight;

  // ── Handlers ──
  const toggleMealType = useCallback((mt: MealType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMealTypes((prev) =>
      prev.includes(mt) ? prev.filter((x) => x !== mt) : [...prev, mt]
    );
  }, []);

  // Fire-and-forget generation. The heavy lifting (LLM calls, image
  // generation, slot distribution, planning-event logging) lives in the
  // store's `startBackgroundGeneration` action so the user can navigate
  // to /(tabs) immediately and watch the plan stream in behind the
  // progress banner — instead of staring at a spinner here for 30–60s.
  //
  // Value-first paywall: non-premium, non-in-trial users see the
  // PaywallSheet's 'generating-plan' branch on top of THIS screen while
  // the engine works. They watch the AI build their plan in real time;
  // the sheet owns the next route (auto-close + nav to /(tabs) on
  // completion, or immediate nav on Maybe-later / Subscribe). For paid
  // and in-trial users, we navigate to /(tabs) instantly as before.
  const handleGenerate = useCallback(() => {
    if (!canGenerate) return;

    // Signup gate: an anonymous guest who has already built BOTH a plan and a
    // grocery list is sent to signup before building another. (Leak-proof
    // backstop — the home PnP button gates too, but this covers direct nav.)
    if (shouldGateSignup) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/signup');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    // Use the override-merged preferences and pipe the one-time note
    // through mergePersonaWithUserInstructions' existing `userInstructions`
    // arg — same plumbing the screen has always used, just enriched.
    const personaInstructions = mergePersonaWithUserInstructions(
      effectivePreferences,
      oneTimeNote.trim() || undefined,
    );
    const soft = getInferredGenerationContext(insights);
    const enrichedInstructions = composeEnrichedInstructions(personaInstructions || '', soft);

    startBackgroundGeneration({
      selectedMealTypes,
      days,
      enrichedInstructions,
      // Anchor the slot dates on the user's picked start (custom
      // calendar) or implicitly today (preset paths, where
      // startDate was synced to today by the preset handler).
      startDate,
    });

    // Mark the plan feature used (only matters while anonymous).
    if (isAnonymous) markFreeGatedAction('plan');

    // AUTH-LAST: no paywall here anymore. Every user lands on /(tabs) and
    // watches the plan stream in via the PendingGenerationBanner. The paywall
    // now appears only AFTER signup, and signup itself is gated on the user's
    // 2nd PnP-Picks / Build-Grocery action (see home + grocery screens).
    router.replace('/(tabs)');
  }, [
    canGenerate,
    selectedMealTypes,
    effectivePreferences,
    oneTimeNote,
    days,
    startDate,
    insights,
    router,
    startBackgroundGeneration,
    isAnonymous,
    shouldGateSignup,
    freeGroceryBuildsUsed,
    markFreeGatedAction,
  ]);

  // ── Token-driven style helpers ──────────────────────────────────────────
  const surfaceBg = isDark ? '#1a1a1a' : '#FFFFFF';
  const cardBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const hair2 = isDark ? '#2a2a2a' : designTokens.colors.hair2;
  const inkPrimary = isDark ? '#fff' : designTokens.colors.ink;
  const inkSecondary = isDark ? '#888' : designTokens.colors.ink2;
  const inkTertiary = isDark ? '#666' : designTokens.colors.ink3;

  const eyebrowStyle = {
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
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 160 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header row — back button on the left, plan-tune trigger on
              the right. Identical chrome bookends the screen, the tune
              tile picks up a small olive status dot when overrides are
              active so the user knows their adjustments are in effect. */}
          <Animated.View
            entering={FadeInDown.springify()}
            style={{
              paddingHorizontal: 16,
              paddingTop: 4,
              paddingBottom: 4,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                // After onboarding the stack has no valid parent to pop to
                // (onboarding used router.replace), so navigating to the
                // home tabs prevents landing on login/signup accidentally.
                if (from === 'onboarding') {
                  router.replace('/(tabs)');
                } else {
                  router.back();
                }
              }}
              hitSlop={10}
              style={{ width: 40, height: 40 }}
            >
              {({ pressed }) => (
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
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                  }}
                >
                  <ChevronLeft size={22} color={inkPrimary} strokeWidth={1.9} />
                </View>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowTuneSheet(true);
              }}
              hitSlop={10}
              style={{ width: 40, height: 40 }}
              accessibilityLabel={
                hasOverrides
                  ? 'Tune preferences for this plan (overrides active)'
                  : 'Tune preferences for this plan'
              }
            >
              {({ pressed }) => (
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
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                  }}
                >
                  <SlidersHorizontal
                    size={18}
                    color={inkPrimary}
                    strokeWidth={1.9}
                  />
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
              )}
            </Pressable>
          </Animated.View>

          {/* Header — olive eyebrow + italic-on-"meals" title + warmer subtitle */}
          <Animated.View
            entering={FadeInDown.delay(80).springify()}
            style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4 }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 11,
                letterSpacing: 1.3,
                textTransform: 'uppercase',
                color: designTokens.colors.olive,
                marginBottom: 10,
              }}
            >
              PnP Picks
            </Text>
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 28,
                color: inkPrimary,
                letterSpacing: -0.56,
              }}
            >
              Plan your{' '}
              <Text
                style={{
                  fontFamily: designTokens.font.serifItalic,
                  fontStyle: 'italic',
                  fontSize: 32,
                  letterSpacing: -0.32,
                }}
              >
                meals
              </Text>
            </Text>
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 14.5,
                lineHeight: 22,
                color: inkSecondary,
                marginTop: 10,
              }}
            >
              A thoughtful stretch of meals, picked just for you.
            </Text>
          </Animated.View>

          {/* Reassurance chips — non-interactive trust row */}
          <Animated.View
            entering={FadeInDown.delay(140).springify()}
            style={{
              paddingHorizontal: 24,
              marginTop: 14,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            {[
              { Icon: Clock, label: 'Your time' },
              { Icon: Package, label: 'Your pantry' },
              { Icon: Target, label: 'Your goals' },
            ].map(({ Icon, label }) => (
              <View
                key={label}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: cardBorder,
                  backgroundColor: isDark ? '#1f1f1f' : designTokens.colors.cream,
                }}
              >
                <Icon size={11} color={inkSecondary} strokeWidth={1.9} />
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 12,
                    color: inkSecondary,
                    letterSpacing: -0.05,
                  }}
                >
                  {label}
                </Text>
              </View>
            ))}
          </Animated.View>

          {/* Period selector */}
          <Animated.View
            entering={FadeInRight.delay(160).springify()}
            style={{ paddingHorizontal: 24, marginTop: 26 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Calendar size={12} color={inkTertiary} strokeWidth={1.8} />
              <Text style={eyebrowStyle}>Time frame</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              {PERIODS.map((p) => {
                const isSelected = period === p.id;
                const Icon = p.Icon;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setPeriod(p.id);
                      // Sync startDate + endDate to the preset so the
                      // calendar (and any downstream readers) reflect
                      // the same range as the chip selection. Custom
                      // resets endDate to null + waits for the user's
                      // first tap.
                      if (p.id === 'custom') {
                        setStartDate(startOfTodayLocal());
                        setEndDate(null);
                        setCustomSelectingEnd(false);
                        setCalendarMonth(startOfTodayLocal());
                      } else {
                        const newStart = startOfTodayLocal();
                        setStartDate(newStart);
                        if (p.days === 1) {
                          setEndDate(newStart);
                        } else {
                          const newEnd = new Date(newStart);
                          newEnd.setDate(newEnd.getDate() + p.days - 1);
                          setEndDate(newEnd);
                        }
                      }
                    }}
                    style={{ flex: 1 }}
                  >
                    {({ pressed }) => (
                      <View
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 14,
                          borderRadius: 18,
                          borderWidth: isSelected ? 0 : 1,
                          borderColor: cardBorder,
                          backgroundColor: isSelected
                            ? designTokens.colors.brand
                            : cardBg,
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 92,
                          transform: [{ scale: pressed ? 0.98 : 1 }],
                        }}
                      >
                        <Icon
                          size={20}
                          color={
                            isSelected
                              ? designTokens.colors.cream
                              : designTokens.colors.olive
                          }
                          strokeWidth={1.85}
                        />
                        <Text
                          style={{
                            fontFamily: designTokens.font.semibold,
                            fontSize: 13,
                            color: isSelected
                              ? designTokens.colors.cream
                              : inkPrimary,
                            marginTop: 8,
                            letterSpacing: -0.15,
                          }}
                          numberOfLines={1}
                        >
                          {p.label}
                        </Text>
                        <Text
                          style={{
                            fontFamily: designTokens.font.regular,
                            fontSize: 10.5,
                            color: isSelected
                              ? 'rgba(246,242,233,0.78)'
                              : inkTertiary,
                            marginTop: 2,
                            letterSpacing: 0.1,
                          }}
                          numberOfLines={1}
                        >
                          {p.sublabel}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Custom date-range calendar — mirrors the pattern from
                generate-recipe.tsx. Two-tap range picker (start, end)
                with a 14-day cap enforced both visually (dimmed days
                beyond the cap during end-selection) and behaviorally
                (the tap handler ignores days outside the cap). */}
            {period === 'custom' && (
              <Animated.View
                entering={FadeInDown.springify()}
                style={{
                  marginTop: 14,
                  padding: 16,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: cardBorder,
                  backgroundColor: cardBg,
                }}
              >
                {/* Start / End summary row */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingBottom: 14,
                    marginBottom: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: hair2,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[eyebrowStyle, { marginBottom: 4 }]}>Start</Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 16,
                        color: inkPrimary,
                        letterSpacing: -0.16,
                      }}
                    >
                      {formatDateChip(startDate)}
                    </Text>
                  </View>
                  <View
                    style={{ width: 16, height: 1, backgroundColor: cardBorder }}
                  />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={[eyebrowStyle, { marginBottom: 4 }]}>End</Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 16,
                        color: endDate ? inkPrimary : inkTertiary,
                        letterSpacing: -0.16,
                      }}
                    >
                      {formatDateChip(endDate)}
                    </Text>
                  </View>
                </View>

                {/* Hint copy in olive — tells the user what the next
                    tap will do. Matches generate-recipe.tsx exactly. */}
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12.5,
                    color: designTokens.colors.olive,
                    textAlign: 'center',
                    marginBottom: 12,
                  }}
                >
                  {customSelectingEnd ? 'Tap to set end date' : 'Tap to set start date'}
                </Text>

                {/* Month nav row */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 12,
                  }}
                >
                  <Pressable
                    onPress={() => navigateCalendarMonth('prev')}
                    disabled={!canNavigatePrevMonth}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: cardBorder,
                      backgroundColor: cardBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: !canNavigatePrevMonth ? 0.45 : 1,
                    }}
                  >
                    <ChevronLeft size={16} color={inkPrimary} strokeWidth={1.7} />
                  </Pressable>
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 16,
                      color: inkPrimary,
                      letterSpacing: -0.16,
                    }}
                  >
                    {monthYearLabel}
                  </Text>
                  <Pressable
                    onPress={() => navigateCalendarMonth('next')}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: cardBorder,
                      backgroundColor: cardBg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ChevronRight size={16} color={inkPrimary} strokeWidth={1.7} />
                  </Pressable>
                </View>

                {/* Weekday header row */}
                <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                  {WEEKDAYS.map((day, index) => (
                    <View
                      key={index}
                      style={{ width: '14.28%', alignItems: 'center' }}
                    >
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 11,
                          letterSpacing: 0.55,
                          textTransform: 'uppercase',
                          color: inkTertiary,
                        }}
                      >
                        {day}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Calendar grid */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {calendarDays.map((day, index) => {
                    if (!day) {
                      return (
                        <View
                          key={`empty-${index}`}
                          style={{ width: '14.28%', height: 40 }}
                        />
                      );
                    }
                    const dayKey = formatDateKey(day);
                    const startKey = formatDateKey(startDate);
                    const endKey = endDate ? formatDateKey(endDate) : null;
                    const today = startOfTodayLocal();
                    const isPast = day < today;
                    const isStart = dayKey === startKey;
                    const isEnd = !!(endKey && dayKey === endKey);
                    const isInRange =
                      !!endDate && day > startDate && day < endDate;
                    const isToday = dayKey === formatDateKey(today);
                    const isHighlight = isStart || isEnd;
                    // 14-day cap visualization — only dim future days
                    // while the user is in end-pick mode, so first-tap
                    // browsing isn't artificially constrained.
                    const dayCap = new Date(startDate);
                    dayCap.setDate(dayCap.getDate() + MAX_PLAN_DAYS - 1);
                    const isBeyondCap =
                      customSelectingEnd && day > dayCap;
                    const isDisabled = isPast || isBeyondCap;
                    return (
                      <Pressable
                        key={dayKey}
                        onPress={() => {
                          if (isDisabled) return;
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          // Two-tap state machine: first tap sets the
                          // start (or restarts if user changes mind);
                          // second tap sets the end with a cap check
                          // and a same-day-or-before swap.
                          if (!customSelectingEnd) {
                            const normalized = new Date(day);
                            normalized.setHours(0, 0, 0, 0);
                            setStartDate(normalized);
                            setEndDate(null);
                            setCustomSelectingEnd(true);
                          } else {
                            const normalized = new Date(day);
                            normalized.setHours(0, 0, 0, 0);
                            if (normalized.getTime() === startDate.getTime()) {
                              // Same-day plan
                              setEndDate(normalized);
                              setCustomSelectingEnd(false);
                            } else if (normalized > startDate) {
                              // Respect the cap defensively (UI dims
                              // these, but a tap could still slip
                              // through on a stale render).
                              const capCheck = new Date(startDate);
                              capCheck.setDate(
                                capCheck.getDate() + MAX_PLAN_DAYS - 1,
                              );
                              if (normalized <= capCheck) {
                                setEndDate(normalized);
                                setCustomSelectingEnd(false);
                              }
                            } else {
                              // User tapped before the current start —
                              // swap: new start = tapped day, end =
                              // previous start. Cap is naturally
                              // satisfied (diff strictly smaller).
                              setEndDate(startDate);
                              setStartDate(normalized);
                              setCustomSelectingEnd(false);
                            }
                          }
                        }}
                        disabled={isDisabled}
                        style={{
                          width: '14.28%',
                          height: 40,
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: isDisabled ? 0.32 : 1,
                        }}
                      >
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 999,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isHighlight
                              ? designTokens.colors.brand
                              : isInRange
                                ? '#E8ECDF'
                                : 'transparent',
                            borderWidth:
                              isToday && !isHighlight && !isInRange ? 1 : 0,
                            borderColor: cardBorder,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: isHighlight
                                ? designTokens.font.semibold
                                : designTokens.font.regular,
                              fontSize: 13.5,
                              color: isHighlight
                                ? designTokens.colors.cream
                                : isInRange
                                  ? designTokens.colors.brand
                                  : inkPrimary,
                            }}
                          >
                            {day.getDate()}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Selection confirmation tail + 14-day cap hint */}
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 11.5,
                    color: inkTertiary,
                    marginTop: 14,
                    textAlign: 'center',
                    letterSpacing: -0.05,
                  }}
                >
                  {endDate
                    ? `${days} day${days === 1 ? '' : 's'} · ${formatDateChip(startDate)} → ${formatDateChip(endDate)}`
                    : `Up to ${MAX_PLAN_DAYS} days per plan.`}
                </Text>
              </Animated.View>
            )}
          </Animated.View>

          {/* Meal types */}
          <Animated.View
            entering={FadeInRight.delay(220).springify()}
            style={{ paddingHorizontal: 24, marginTop: 26 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Utensils size={12} color={inkTertiary} strokeWidth={1.8} />
              <Text style={eyebrowStyle}>Meals to include</Text>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {MEAL_TYPES.map(({ id, label, Icon, accent }) => {
                const isSelected = selectedMealTypes.includes(id);
                const accentBg =
                  accent === 'olive'
                    ? designTokens.colors.olive
                    : designTokens.colors.brand;
                // Disc colors:
                //   unselected → solid accent disc, cream icon
                //   selected   → chip turns sage; disc inverts to cream bg + accent icon
                //                so the disc still carries identity inside the filled state.
                const discBg = isSelected ? designTokens.colors.cream : accentBg;
                const discFg = isSelected ? accentBg : '#F6F2E9';
                return (
                  <Pressable key={id} onPress={() => toggleMealType(id)}>
                    {({ pressed }) => (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          paddingLeft: 6,
                          paddingRight: 14,
                          paddingVertical: 6,
                          borderRadius: 999,
                          borderWidth: isSelected ? 0 : 1,
                          borderColor: cardBorder,
                          backgroundColor: isSelected
                            ? designTokens.colors.brand
                            : cardBg,
                          transform: [{ scale: pressed ? 0.98 : 1 }],
                        }}
                      >
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 999,
                            backgroundColor: discBg,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Icon size={15} color={discFg} strokeWidth={1.9} />
                        </View>
                        <Text
                          style={{
                            fontFamily: designTokens.font.semibold,
                            fontSize: 13.5,
                            color: isSelected
                              ? designTokens.colors.cream
                              : inkPrimary,
                            letterSpacing: -0.15,
                          }}
                        >
                          {label}
                        </Text>
                        {isSelected && (
                          <Check
                            size={13}
                            color={designTokens.colors.cream}
                            strokeWidth={2.4}
                          />
                        )}
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>

          {/* Summary card */}
          <Animated.View
            entering={FadeInDown.delay(280).springify()}
            style={{ paddingHorizontal: 24, marginTop: 26 }}
          >
            <View
              style={{
                padding: 18,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: cardBorder,
                backgroundColor: isDark ? '#1f1f1f' : designTokens.colors.cream,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Flame size={11} color={designTokens.colors.olive} strokeWidth={2} />
                <Text style={eyebrowStyle}>Plan summary</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 40,
                    color: inkPrimary,
                    letterSpacing: -0.8,
                  }}
                >
                  {totalMeals}
                </Text>
                <Text
                  style={{
                    marginLeft: 10,
                    fontFamily: designTokens.font.regular,
                    fontSize: 14.5,
                    color: inkSecondary,
                  }}
                >
                  recipe{totalMeals !== 1 ? 's' : ''} across {days} day{days !== 1 ? 's' : ''}
                </Text>
              </View>

              {/* Micro-breakdown — reflects exactly which meal types × days */}
              {selectedMealTypes.length > 0 && (
                <View
                  style={{
                    marginTop: 12,
                    paddingTop: 12,
                    borderTopWidth: 1,
                    borderTopColor: hair2,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 12.5,
                      color: inkSecondary,
                      letterSpacing: -0.1,
                    }}
                  >
                    {MEAL_TYPES.filter((mt) => selectedMealTypes.includes(mt.id))
                      .map(
                        (mt) =>
                          `${days} ${mt.label.toLowerCase()}${days !== 1 ? 's' : ''}`,
                      )
                      .join(' · ')}
                  </Text>
                </View>
              )}

              <Text
                style={{
                  fontFamily: designTokens.font.regular,
                  fontSize: 12,
                  lineHeight: 17,
                  color: inkTertiary,
                  marginTop: 10,
                }}
                numberOfLines={2}
              >
                Weighted by {effectivePreferences.priorities?.join(', ') || 'balanced defaults'}
                {effectivePreferences.weeknightMinutes
                  ? ` · ~${effectivePreferences.weeknightMinutes} min/meal`
                  : ''}
                {effectivePreferences.weeklyBudget
                  ? ` · $${effectivePreferences.weeklyBudget}/wk`
                  : ''}
                {hasOverrides ? ' · tuned for this plan' : ''}
              </Text>
            </View>
          </Animated.View>

          {/* Generation progress UI now lives on the Meal Planning tab as
              <PendingGenerationBanner /> — we navigate there instantly on
              CTA tap so the user is never stuck waiting on this screen. */}
        </ScrollView>

        {/* Sticky CTA */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 24,
            paddingTop: 14,
            paddingBottom: 28,
            backgroundColor: surfaceBg,
            borderTopWidth: 1,
            borderTopColor: hair2,
          }}
        >
          <Pressable
            onPress={handleGenerate}
            disabled={!canGenerate}
            style={{ width: '100%' }}
          >
            {({ pressed }) => (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  paddingVertical: 18,
                  borderRadius: 999,
                  backgroundColor: canGenerate
                    ? designTokens.colors.brand
                    : hair2,
                  opacity: 1,
                  shadowColor: canGenerate
                    ? designTokens.colors.brandDeep
                    : 'transparent',
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
                  {isPlanInFlight ? 'Plan in progress…' : 'Build my plan'}
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
              Pick at least one meal type to continue.
            </Text>
          )}
        </View>
      </SafeAreaView>

      {/* Per-plan preference overrides — slides up from the bottom.
          Draft state is isolated inside the sheet; the screen only
          learns about changes when the user commits via "Use for
          this plan", so backdrop/X/drag dismissals are loss-less. */}
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
