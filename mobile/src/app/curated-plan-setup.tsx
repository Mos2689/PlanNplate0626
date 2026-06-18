// Curated Plan Setup — the planning step for a curated plan.
//
// Split out from curated-plan-detail.tsx so the landing page stays a clean
// "what is this plan" read, and ALL the planning choices live here:
//   • Duration (7 / 14 / 21 / custom)
//   • Cooking rhythm + per-meal cook style (grab&go / leftovers / cook)
//   • Start date
//   • Apply (with conflict handling + success ritual)
//
// The selections drive getScheduledMeals(), and Apply writes exactly what the
// user configured — including grab-&-go breakfasts that get NO recipe (just a
// labelled calendar slot) and leftover lunches sourced from the prior dinner.
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Check,
  BookOpen,
  UtensilsCrossed,
  Minus,
  Plus,
  ChefHat,
  Eraser,
  X,
  Ban,
  EggFried,
  Croissant,
  Refrigerator,
  Salad,
  CookingPot,
  Store,
  Sunrise,
  Sun,
  Moon,
  Flame,
  Layers,
  type LucideIcon,
} from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/lib/useColorScheme';
import {
  useMealPlanStore,
  type MealHabits,
  type BreakfastHabit,
  type LunchHabit,
  type DinnerHabit,
} from '@/lib/store';
import { useAuthStore } from '@/lib/auth-store';
import { useSubscriptionStore, useHasPremiumAccess, useIsPremiumResolved } from '@/lib/subscription-store';
import {
  CURATED_MEAL_PLANS,
  applyCuratedMealPlan,
  getScheduledMeals,
  type CuratedMealPlan,
  type CuratedMeal,
} from '@/lib/curated-meal-plans';
import {
  DEFAULT_BATCH_CONFIG,
  MAX_BATCH_RECIPES,
  type CookingPreferences,
  type CookStyle,
  type BatchConfig,
} from '@/lib/high-protein-plan';
import { clearMealSlotsInRange } from '@/lib/database';
import { designTokens } from '@/lib/design-tokens';
import {
  StickyScreenHeader,
  useStickyHeaderScroll,
} from '@/components/StickyScreenHeader';

// ── Helpers ──
function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function splitForItalic(title: string): { head: string; tail: string } {
  const trimmed = title.trim();
  const lastSpace = trimmed.lastIndexOf(' ');
  if (lastSpace === -1) return { head: '', tail: trimmed };
  return { head: trimmed.slice(0, lastSpace), tail: trimmed.slice(lastSpace + 1) };
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

// Meal-habit options — mirror the profile / onboarding "Meal habits" section
// so the cook-style picker here reads identically. Each option carries a
// bespoke Lucide line icon + an editorial accent tint (icon stroke + soft chip
// fill) so the picker reads designed, not defaulted.
type HabitOption<T extends string> = {
  id: T;
  label: string;
  Icon: LucideIcon;
};

// Daypart palette — the selected colour traces the arc of the day
// (sunrise → midday → dusk), echoing the sunrise/sun/moon glyphs. Each meal
// row owns one identity colour. The colour lives only on the ICON (+ a thin
// frame and check) — the tile and icon block stay white, so selections read
// quietly instead of as solid blocks.
const MEAL_THEME = {
  breakfast: '#B85A2E', // sunrise terracotta
  lunch: designTokens.colors.brand, // midday sage  (#546445)
  dinner: '#42526A', // dusk slate-indigo
} as const;

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

// Inclusive day count for a start→end date range (≥ 1).
function daysInclusive(a: Date, b: Date): number {
  const A = new Date(a);
  A.setHours(0, 0, 0, 0);
  const B = new Date(b);
  B.setHours(0, 0, 0, 0);
  const diff = Math.round((B.getTime() - A.getTime()) / 86400000);
  return Math.max(1, diff + 1);
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// First date on/after `date` whose weekday is one of `cookDays` (JS 0=Sun).
// Used to snap a batch plan's start onto a real cook day.
function snapToFirstCookDay(date: Date, cookDays: number[]): Date {
  if (!cookDays.length) return date;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    if (cookDays.includes(d.getDay())) return d;
    d.setDate(d.getDate() + 1);
  }
  return date;
}

// The scheduler now speaks the same 3-way habit vocabulary as the profile, so
// the habits pass straight through — each option (skip/grab, leftovers/buy)
// is honoured distinctly inside buildHighProteinMeals.
function habitsToCookPrefs(
  h: MealHabits,
  style: CookStyle,
  batch: BatchConfig,
): CookingPreferences {
  return { breakfast: h.breakfast, lunch: h.lunch, dinner: h.dinner, style, batch };
}

// Premium habit row — bespoke icon tiles (icon chip + label), a selected
// check-badge, press-spring, and a meal-time glyph on the section label.
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
  theme: string; // daypart identity colour for this meal's selected state
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

// A compact 2-option segmented control for the cooking-style pickers.
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

// ───────────────────────────────────────────────────────────────────────────────
// APPLY RITUAL — staged overlay shown while a curated plan is being applied.
// Each stage swaps the icon, copy, and sub-line. A hairline progress bar
// reflects the run from "preparing" to "placing"; the final "success" stage
// drops the progress bar and shows a celebratory card with day chips.
// ───────────────────────────────────────────────────────────────────────────────
type ApplyStage = 'idle' | 'preparing' | 'clearing' | 'seeding' | 'placing' | 'success';

const STAGE_ORDER: ApplyStage[] = ['preparing', 'clearing', 'seeding', 'placing'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ApplyRitualOverlay({
  stage,
  placedCount,
  totalMeals,
  durationDays,
  startDate,
  isDark,
  inkPrimary,
  inkSecondary,
  inkTertiary,
  cardBorder,
}: {
  stage: ApplyStage;
  placedCount: number;
  totalMeals: number;
  durationDays: number;
  startDate: Date;
  isDark: boolean;
  inkPrimary: string;
  inkSecondary: string;
  inkTertiary: string;
  cardBorder: string;
}) {
  const tint = isDark ? '#0F0E0A' : '#F6F2E9';

  // Day chip labels — Mon, Tue, ... starting from the plan's first day.
  const dayChips: { label: string; key: number }[] = [];
  const startDow = startDate.getDay();
  const monBasedStart = (startDow + 6) % 7;
  // Cap the chip row at 14 so a custom 21-day plan doesn't overflow.
  const chipCount = Math.min(durationDays, 14);
  for (let i = 0; i < chipCount; i++) {
    dayChips.push({ label: DAY_LABELS[(monBasedStart + i) % 7], key: i });
  }

  // Linear progress: 0–4 stages until placing (placing handles its own
  // 0→1 fill via placedCount / totalMeals).
  let progressRatio = 0;
  if (stage === 'preparing') progressRatio = 0.18;
  else if (stage === 'clearing') progressRatio = 0.42;
  else if (stage === 'seeding') progressRatio = 0.62;
  else if (stage === 'placing') {
    const t = totalMeals > 0 ? placedCount / totalMeals : 1;
    // Place segment runs from 0.62 → 1.0
    progressRatio = 0.62 + 0.38 * Math.min(1, Math.max(0, t));
  } else if (stage === 'success') progressRatio = 1;

  const stageMeta: Record<
    Exclude<ApplyStage, 'idle' | 'success'>,
    { Icon: LucideIcon; title: string; sub: string }
  > = {
    preparing: {
      Icon: CalendarIcon,
      title: 'Preparing your week',
      sub: `${durationDays} ${durationDays === 1 ? 'day' : 'days'} · ${totalMeals} meals`,
    },
    clearing: {
      Icon: Eraser,
      title: 'Clearing existing meals',
      sub: 'Making room on your calendar',
    },
    seeding: {
      Icon: BookOpen,
      title: 'Stocking your recipe book',
      sub: 'Saving the recipes for this plan',
    },
    placing: {
      Icon: UtensilsCrossed,
      title: 'Placing meals',
      sub: `${placedCount} of ${totalMeals}`,
    },
  };

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: tint,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
      }}
    >
      {stage === 'success' ? (
        <Animated.View
          entering={FadeInDown.springify()}
          style={{ alignItems: 'center', maxWidth: 360 }}
        >
          <Animated.View
            entering={FadeIn.duration(240)}
            style={{
              width: 76,
              height: 76,
              borderRadius: 999,
              backgroundColor: designTokens.colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 22,
              shadowColor: designTokens.colors.brandDeep,
              shadowOpacity: 0.3,
              shadowRadius: 22,
              shadowOffset: { width: 0, height: 10 },
              elevation: 6,
            }}
          >
            <Check size={34} color={designTokens.colors.cream} strokeWidth={2.6} />
          </Animated.View>
          <Text
            style={{
              fontFamily: designTokens.font.serifItalic,
              fontStyle: 'italic',
              fontSize: 46,
              color: isDark ? '#fff' : designTokens.colors.ink,
              letterSpacing: -0.7,
              lineHeight: 52,
              textAlign: 'center',
            }}
          >
            Applied.
          </Text>
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 15,
              color: inkSecondary,
              marginTop: 10,
              textAlign: 'center',
              letterSpacing: -0.1,
            }}
          >
            {durationDays} {durationDays === 1 ? 'day' : 'days'} · {totalMeals} meals planted.
          </Text>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 6,
              marginTop: 22,
            }}
          >
            {dayChips.map((chip, i) => (
              <Animated.View
                key={chip.key}
                entering={FadeInDown.delay(60 + i * 35).springify()}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: isDark ? '#1f1f1f' : '#fff',
                  borderWidth: 1,
                  borderColor: cardBorder,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Check size={11} color={designTokens.colors.brand} strokeWidth={2.6} />
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 11.5,
                    color: inkPrimary,
                    letterSpacing: -0.05,
                  }}
                >
                  {chip.label}
                </Text>
              </Animated.View>
            ))}
            {durationDays > chipCount && (
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: 'transparent',
                  borderWidth: 1,
                  borderColor: cardBorder,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 11.5,
                    color: inkTertiary,
                    letterSpacing: -0.05,
                  }}
                >
                  +{durationDays - chipCount}
                </Text>
              </View>
            )}
          </View>
        </Animated.View>
      ) : (
        <Animated.View
          key={stage}
          entering={FadeInDown.duration(220)}
          style={{ alignItems: 'center', width: '100%', maxWidth: 360 }}
        >
          {(() => {
            const meta = stageMeta[stage as Exclude<ApplyStage, 'idle' | 'success'>];
            const Icon = meta.Icon;
            return (
              <>
                <View
                  style={{
                    width: 62,
                    height: 62,
                    borderRadius: 18,
                    backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                    borderWidth: 1,
                    borderColor: cardBorder,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 18,
                    shadowColor: '#000',
                    shadowOpacity: 0.08,
                    shadowRadius: 14,
                    shadowOffset: { width: 0, height: 6 },
                    elevation: 3,
                  }}
                >
                  <Icon size={26} color={designTokens.colors.brand} strokeWidth={1.85} />
                </View>
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 20,
                    color: inkPrimary,
                    letterSpacing: -0.35,
                    textAlign: 'center',
                  }}
                >
                  {meta.title}
                </Text>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 13.5,
                    color: inkSecondary,
                    marginTop: 6,
                    textAlign: 'center',
                    letterSpacing: -0.05,
                  }}
                >
                  {meta.sub}
                </Text>
              </>
            );
          })()}

          {/* Hairline progress */}
          <View
            style={{
              width: '100%',
              maxWidth: 240,
              height: 4,
              borderRadius: 999,
              backgroundColor: isDark ? '#1f1f1f' : 'rgba(0,0,0,0.06)',
              marginTop: 24,
              overflow: 'hidden',
            }}
          >
            <Animated.View
              style={{
                width: `${Math.round(progressRatio * 100)}%`,
                height: '100%',
                borderRadius: 999,
                backgroundColor: designTokens.colors.brand,
              }}
            />
          </View>
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 10.5,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              color: inkTertiary,
              marginTop: 12,
            }}
          >
            Step {Math.min(STAGE_ORDER.indexOf(stage) + 1, STAGE_ORDER.length)} of {STAGE_ORDER.length}
          </Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// SCREEN
// ───────────────────────────────────────────────────────────────────────────────

export default function CuratedPlanSetupScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const addRecipe = useMealPlanStore((s) => s.addRecipe);
  const addMealToSlot = useMealPlanStore((s) => s.addMealToSlot);
  const preferences = useMealPlanStore((s) => s.preferences);
  // Premium gate inputs — curated apply is a Premium feature for signed-up
  // users. Anonymous guests are allowed one curated apply before the
  // existing signup gate fires on their next gated action.
  const isAnonymous = useAuthStore((s) => s.isAnonymous);
  const currentUserId = useAuthStore((s) => s.currentUser?.id);
  const hasPremiumAccess = useHasPremiumAccess();
  const isPremiumResolved = useIsPremiumResolved();
  const openPaywallSheet = useSubscriptionStore((s) => s.openPaywallSheet);

  const plan = useMemo<CuratedMealPlan | undefined>(
    () => CURATED_MEAL_PLANS.find((p) => p.id === id),
    [id],
  );

  // ── State ──
  // Meal-plan duration = the start the user actually picked (the "anchor") plus
  // a length in days. The effective start shown/used is derived from these —
  // in batch mode it snaps to the first cook day, but always FROM the anchor,
  // so it can move back to an earlier day (e.g. today) when that day becomes a
  // cook day.
  const [pickedStart, setPickedStart] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [lengthDays, setLengthDays] = useState<number>(() =>
    plan ? parseInt(plan.duration.split('-')[0], 10) : 7,
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  // In-progress range while the calendar modal is open.
  const [tempStart, setTempStart] = useState<Date | null>(null);
  const [tempEnd, setTempEnd] = useState<Date | null>(null);

  // Multi-stage apply ritual. Each stage maps to a card in the overlay so the
  // user sees a sense of progress instead of a static spinner.
  // idle → preparing → (clearing — replace only) → seeding → placing → success
  const [applyStage, setApplyStage] = useState<ApplyStage>('idle');
  const [placedCount, setPlacedCount] = useState(0);
  const isApplying = applyStage !== 'idle';
  const [conflictVisible, setConflictVisible] = useState(false);

  // Cooking style is seeded from the user's saved meal habits (profile) and
  // can be tweaked here. Rhythm + batch config sit alongside it.
  const [mealHabits, setMealHabits] = useState<MealHabits>(
    preferences?.mealHabits ?? { breakfast: 'cook', lunch: 'leftovers', dinner: 'cook' },
  );
  const [cookStyle, setCookStyle] = useState<CookStyle>('daily');
  const [batch, setBatch] = useState<BatchConfig>(DEFAULT_BATCH_CONFIG);

  // ── Tokenized style helpers ──
  const surfaceBg = isDark ? '#1a1a1a' : '#FFFFFF';
  const cardBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const hair2 = isDark ? '#2a2a2a' : designTokens.colors.hair2;
  const inkPrimary = isDark ? '#fff' : designTokens.colors.ink;
  const inkSecondary = isDark ? '#888' : designTokens.colors.ink2;
  const inkTertiary = isDark ? '#666' : designTokens.colors.ink3;

  // ── Derived ──
  const schedulable = !!plan?.schedulable;
  const cookDays = batch.cookDays;
  const recipesPerCookDay = batch.recipesPerCookDay;

  // Effective plan window. In batch mode the start snaps forward to the first
  // cook day — but anchored on `pickedStart`, so changing cook days re-snaps
  // from the user's choice rather than from a previously-snapped date.
  const rangeStart =
    cookStyle === 'batch' && cookDays.length > 0
      ? snapToFirstCookDay(pickedStart, cookDays)
      : pickedStart;
  const durationDays = Math.max(1, lengthDays);
  const rangeEnd = addDays(rangeStart, durationDays - 1);
  const selectedStartDate = rangeStart;
  // Weekday (0=Sun) of the start date — lands batch cook days correctly.
  const startWeekday = rangeStart.getDay();

  // Map the user's meal habits + rhythm + batch onto the scheduler's model.
  const cookPrefs = useMemo<CookingPreferences>(
    () => habitsToCookPrefs(mealHabits, cookStyle, batch),
    [mealHabits, cookStyle, batch],
  );

  const scheduledMeals = useMemo<CuratedMeal[]>(
    () => (plan ? getScheduledMeals(plan, durationDays, cookPrefs, startWeekday) : []),
    [plan, durationDays, cookPrefs, startWeekday],
  );

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
      // No real cap — clamp only to the number of distinct recipes that exist.
      recipesPerCookDay: Math.min(
        MAX_BATCH_RECIPES,
        Math.max(1, b.recipesPerCookDay + delta),
      ),
    }));
  }, []);

  // ── Calendar (duration) handlers ──
  const openCalendar = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Seed the calendar with the user's actual pick (the anchor), not the
    // snapped effective start, so they edit their own choice.
    setTempStart(pickedStart);
    setTempEnd(addDays(pickedStart, durationDays - 1));
    setCalendarOpen(true);
  }, [pickedStart, durationDays]);

  const onCalendarDayPress = useCallback(
    (dateString: string) => {
      const [y, m, d] = dateString.split('-').map(Number);
      const picked = new Date(y, m - 1, d);
      Haptics.selectionAsync();
      // Start a fresh range when nothing pending or a full range already set.
      if (!tempStart || (tempStart && tempEnd)) {
        setTempStart(picked);
        setTempEnd(null);
      } else if (picked.getTime() < tempStart.getTime()) {
        setTempStart(picked);
        setTempEnd(null);
      } else {
        setTempEnd(picked);
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
    // Store the user's pick as the anchor + length; the effective (snapped)
    // start is derived from these.
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
    // Guard against runaway loops.
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

  // ── Apply flow ──
  // Drives a multi-stage overlay so the user sees what's happening:
  //   preparing → (clearing if replace) → seeding → placing → success
  // Each stage holds long enough to read (200–700 ms) — total perceived
  // time stays around 2 s. The actual store mutations are still synchronous.
  const executeApplyMealPlan = useCallback(
    async (mode: 'replace' | 'keep') => {
      if (!plan) return;
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setPlacedCount(0);
        setApplyStage('preparing');
        await wait(450);

        const dateKey = formatDateKey(selectedStartDate);
        const endDate = new Date(selectedStartDate);
        endDate.setDate(endDate.getDate() + durationDays);

        if (mode === 'replace') {
          setApplyStage('clearing');
          const startDateStr = formatDateKey(selectedStartDate);
          const endDateStr = formatDateKey(endDate);
          const userId = useAuthStore.getState().currentUser?.id;
          if (userId) {
            const ok = await clearMealSlotsInRange(userId, startDateStr, endDateStr);
            if (!ok) {
              console.warn('[CuratedPlanSetup] Failed to clear meal slots from db');
            }
          }
          useMealPlanStore.setState((state) => ({
            mealSlots: state.mealSlots.filter(
              (slot) => !(slot.date >= startDateStr && slot.date < endDateStr),
            ),
          }));
          await wait(450);
        }

        setApplyStage('seeding');
        await wait(450);
        applyCuratedMealPlan(
          plan,
          dateKey,
          addRecipe,
          addMealToSlot,
          scheduledMeals,
          preferences?.servingSize,
        );

        // Placing — tick the counter from 0 → total over ~700 ms so the user
        // feels the meals dropping into the calendar one by one.
        setApplyStage('placing');
        const total = Math.max(1, scheduledMeals.length);
        const stepMs = Math.max(20, Math.floor(700 / total));
        for (let i = 1; i <= total; i++) {
          setPlacedCount(i);
          if (i < total) await wait(stepMs);
        }
        await wait(200);

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setApplyStage('success');
        await wait(1200);
        router.replace('/(tabs)' as any);
        // Reset for re-entry — fires after navigation, harmless if unmounted.
        setApplyStage('idle');
      } catch (error) {
        console.error('[CuratedPlanSetup] apply failed', error);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setApplyStage('idle');
      }
    },
    [plan, selectedStartDate, durationDays, scheduledMeals, addRecipe, addMealToSlot, router, preferences?.servingSize],
  );

  const handleApply = useCallback(async () => {
    if (!plan || isApplying) return;
    // Premium gate — applying a curated meal plan is a Premium feature.
    // Anonymous guests can apply one curated plan to see the magic; their
    // next gated action lands them on signup → paywall.
    if (!isAnonymous && !hasPremiumAccess) {
      if (!isPremiumResolved) {
        // Subscription state still resolving — re-sync and no-op rather
        // than risk gating a paying user during cold start.
        if (currentUserId) {
          void useSubscriptionStore.getState().syncWithRevenueCat(currentUserId);
        }
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      openPaywallSheet('curated-plans');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const startDateStr = formatDateKey(selectedStartDate);
    const endDate = new Date(selectedStartDate);
    endDate.setDate(endDate.getDate() + durationDays);
    const endDateStr = formatDateKey(endDate);

    const mealSlots = useMealPlanStore.getState().mealSlots;
    const hasConflict = mealSlots.some(
      (slot) => slot.date >= startDateStr && slot.date < endDateStr,
    );

    if (hasConflict) {
      setConflictVisible(true);
      return;
    }
    await executeApplyMealPlan('keep');
  }, [plan, isApplying, selectedStartDate, durationDays, executeApplyMealPlan, isAnonymous, hasPremiumAccess, isPremiumResolved, currentUserId, openPaywallSheet]);

  // Sticky compact header — must run before any early return so React keeps
  // hook order stable across the plan-not-found branch.
  const sticky = useStickyHeaderScroll();

  // ── Plan not found ──
  if (!plan) {
    return (
      <View style={{ flex: 1, backgroundColor: surfaceBg }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
            <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40, height: 40 }}>
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
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 17,
                color: inkSecondary,
                textAlign: 'center',
              }}
            >
              We couldn't find that plan.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const titleSplit = splitForItalic(plan.name);
  const rangeLabel = `${shortDate(rangeStart)} – ${shortDate(rangeEnd)}`;

  return (
    <View style={{ flex: 1, backgroundColor: surfaceBg }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
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
          <Pressable onPress={() => router.back()} hitSlop={10}>
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
              {titleSplit.head}
              {titleSplit.head ? ' ' : ''}
              <Text
                style={{ fontFamily: designTokens.font.serifItalic, fontStyle: 'italic' }}
              >
                {titleSplit.tail}
              </Text>
            </Text>
          </View>
        </View>

        <Animated.ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          onScroll={sticky.scrollHandler}
          scrollEventThrottle={16}
        >
          {/* ── Meal plan duration (start → end via calendar) ── */}
          <Animated.View
            entering={FadeInDown.delay(60).springify()}
            style={{ paddingHorizontal: 24, marginTop: 8 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <CalendarIcon size={12} color={inkTertiary} strokeWidth={1.8} />
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 11,
                  letterSpacing: 0.55,
                  textTransform: 'uppercase',
                  color: inkTertiary,
                }}
              >
                Meal plan duration
              </Text>
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
                      {durationDays} {durationDays === 1 ? 'day' : 'days'} · tap to change
                    </Text>
                  </View>
                  <ChevronRight size={18} color={inkTertiary} strokeWidth={1.85} />
                </View>
              )}
            </Pressable>

            {/* Batch plans must begin on a cook day — explain the snap. */}
            {cookStyle === 'batch' && (
              <Text
                style={{
                  fontFamily: designTokens.font.regular,
                  fontSize: 12,
                  color: inkTertiary,
                  marginTop: 8,
                  lineHeight: 17,
                }}
              >
                Starts on your first cook day —{' '}
                {rangeStart.toLocaleDateString('en-US', { weekday: 'long' })}.
              </Text>
            )}
          </Animated.View>

          {/* ── Cooking style ── */}
          {schedulable && (
            <Animated.View
              entering={FadeInDown.delay(120).springify()}
              style={{ paddingHorizontal: 24, marginTop: 18 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <ChefHat size={12} color={inkTertiary} strokeWidth={1.8} />
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 11,
                    letterSpacing: 0.55,
                    textTransform: 'uppercase',
                    color: inkTertiary,
                  }}
                >
                  How you like to cook
                </Text>
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

              {cookStyle === 'daily' ? null : (
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
                      const sel = cookDays.includes(idx);
                      return (
                        <Pressable
                          key={idx}
                          onPress={() => toggleCookDay(idx)}
                          style={{ flex: 1 }}
                        >
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
                      marginBottom: 12,
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
                        disabled={recipesPerCookDay <= 1}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: cardBorder,
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: recipesPerCookDay <= 1 ? 0.4 : 1,
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
                        {recipesPerCookDay}
                      </Text>
                      <Pressable
                        onPress={() => stepRecipesPerCookDay(1)}
                        hitSlop={8}
                        disabled={recipesPerCookDay >= MAX_BATCH_RECIPES}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: cardBorder,
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: recipesPerCookDay >= MAX_BATCH_RECIPES ? 0.4 : 1,
                        }}
                      >
                        <Plus size={15} color={inkPrimary} strokeWidth={2} />
                      </Pressable>
                    </View>
                  </View>

                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 12,
                      color: inkTertiary,
                      marginTop: 2,
                      lineHeight: 17,
                    }}
                  >
                    You cook fresh on each chosen day and eat leftovers (lunch +
                    dinner) until the next cook day. Breakfast follows your pick
                    below.
                  </Text>
                </>
              )}

              {/* Per-meal habits — what you actually cook in each slot. */}
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
          )}

          {/* ── Preview the day-by-day plan with these picks ── */}
          <Animated.View
            entering={FadeInDown.delay(220).springify()}
            style={{ paddingHorizontal: 24, marginTop: 14 }}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const q =
                  `id=${plan.id}` +
                  `&start=${formatDateKey(selectedStartDate)}` +
                  `&duration=${durationDays}` +
                  `&bfast=${cookPrefs.breakfast}` +
                  `&lunch=${cookPrefs.lunch}` +
                  `&dinner=${cookPrefs.dinner}` +
                  `&style=${cookPrefs.style}` +
                  `&cookDays=${(cookPrefs.batch?.cookDays ?? []).join('-')}` +
                  `&recipesPerCookDay=${cookPrefs.batch?.recipesPerCookDay ?? 2}`;
                router.push(`/curated-plan-browse?${q}` as any);
              }}
              style={{ width: '100%' }}
            >
              {({ pressed }) => (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    paddingVertical: 11,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: cardBorder,
                    backgroundColor: isDark ? '#1f1f1f' : designTokens.colors.cream,
                    transform: [{ scale: pressed ? 0.985 : 1 }],
                  }}
                >
                  <BookOpen size={16} color={designTokens.colors.olive} strokeWidth={1.85} />
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 14,
                      color: inkPrimary,
                      letterSpacing: -0.15,
                    }}
                  >
                    Preview {durationDays} days day-by-day
                  </Text>
                  <ChevronRight size={16} color={inkTertiary} strokeWidth={1.85} />
                </View>
              )}
            </Pressable>
          </Animated.View>

        </Animated.ScrollView>

        {/* Sticky bottom CTA */}
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
          <Pressable onPress={handleApply} disabled={isApplying} style={{ width: '100%' }}>
            {({ pressed }) => (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  paddingVertical: 15,
                  borderRadius: 999,
                  backgroundColor: designTokens.colors.brand,
                  opacity: isApplying ? 0.85 : 1,
                  shadowColor: designTokens.colors.brandDeep,
                  shadowOpacity: 0.22,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 4,
                  transform: [{ scale: pressed && !isApplying ? 0.985 : 1 }],
                }}
              >
                {isApplying ? (
                  <>
                    <ActivityIndicator size="small" color={designTokens.colors.cream} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 16,
                        color: designTokens.colors.cream,
                        letterSpacing: -0.2,
                      }}
                    >
                      Applying…
                    </Text>
                  </>
                ) : (
                  <>
                    <UtensilsCrossed size={20} color={designTokens.colors.cream} strokeWidth={1.85} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 16,
                        color: designTokens.colors.cream,
                        letterSpacing: -0.25,
                      }}
                    >
                      Apply {durationDays}-day plan
                    </Text>
                    <ChevronRight size={18} color={designTokens.colors.cream} strokeWidth={1.9} />
                  </>
                )}
              </View>
            )}
          </Pressable>
        </View>

        {/* Apply ritual overlay — staged so the user sees what's happening */}
        {applyStage !== 'idle' && (
          <ApplyRitualOverlay
            stage={applyStage}
            placedCount={placedCount}
            totalMeals={scheduledMeals.length}
            durationDays={durationDays}
            startDate={selectedStartDate}
            isDark={isDark}
            inkPrimary={inkPrimary}
            inkSecondary={inkSecondary}
            inkTertiary={inkTertiary}
            cardBorder={cardBorder}
          />
        )}
      </SafeAreaView>

      {/* Sticky compact header — fades in when the scroll passes the editorial
          title block. Outside SafeAreaView so it paints into the status-bar
          inset itself. Native Modals portal above this regardless of order. */}
      <StickyScreenHeader
        scrollY={sticky.scrollY}
        title={plan.name}
        onBack={() => router.back()}
      />

      {/* ── Conflict modal — centered so it can't be hidden by the sticky CTA ── */}
      <Modal
        visible={conflictVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConflictVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'center',
            paddingHorizontal: 24,
          }}
        >
          <Pressable
            onPress={() => setConflictVisible(false)}
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
          />
          <Animated.View
            entering={FadeInDown.springify()}
            style={{
              borderRadius: 24,
              backgroundColor: surfaceBg,
              padding: 22,
              borderWidth: 1,
              borderColor: cardBorder,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
              elevation: 12,
            }}
          >
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 999,
                backgroundColor: isDark ? 'rgba(228,109,70,0.18)' : 'rgba(228,109,70,0.12)',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <CalendarIcon size={24} color={designTokens.colors.olive} strokeWidth={1.85} />
            </View>
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 18,
                color: inkPrimary,
                letterSpacing: -0.25,
              }}
            >
              Some days already have meals
            </Text>
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 14,
                lineHeight: 20,
                color: inkSecondary,
                marginTop: 8,
              }}
            >
              Your selected dates overlap with meals already on your calendar. Choose how to handle the overlap.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <Pressable
                onPress={() => {
                  setConflictVisible(false);
                  executeApplyMealPlan('keep');
                }}
                style={{ flex: 1 }}
              >
                {({ pressed }) => (
                  <View
                    style={{
                      paddingVertical: 14,
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
                      Add alongside
                    </Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                onPress={() => {
                  setConflictVisible(false);
                  executeApplyMealPlan('replace');
                }}
                style={{ flex: 1 }}
              >
                {({ pressed }) => (
                  <View
                    style={{
                      paddingVertical: 14,
                      borderRadius: 999,
                      backgroundColor: designTokens.colors.olive,
                      alignItems: 'center',
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 14,
                        color: designTokens.colors.cream,
                      }}
                    >
                      Replace existing
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>

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
    </View>
  );
}
