// Behavior Intelligence — pure functions that turn raw activity into
// human-readable insights.
//
// Three insights are surfaced today:
//   1. Planning habit  — usual day-of-week + hour, adaptive overdue flag
//   2. Cooking momentum — cooked/planned ratio for the week, current streak
//   3. Taste signals    — top cuisines + quick-vs-elaborate preference
//
// Everything here is intentionally PURE so it can be unit-tested in
// isolation with fixtures and so the React hook layer stays a thin
// wrapper. No store reads, no Date.now(), no globals — every input is
// passed in.
//
// Algorithm details:
//   - usualDayOfWeek / usualHour use the mode (most-frequent bucket),
//     only when eventCount >= 3 so we don't fabricate patterns from one
//     or two events.
//   - averageGapDays is the mean of consecutive deltas.
//   - isOverdue:
//       eventCount === 0 → false (handled by a different nudge)
//       eventCount === 1 → gap >= 7 days
//       eventCount >= 2  → gap >= max(7, avgGap * 1.5)
//   - cuisine vocab is intentionally narrow (10 entries) — broad enough
//     to capture the major lanes, narrow enough to keep signal clean.
//   - preferredSpeed buckets: ≤30 quick, 31–60 moderate, >60 elaborate.
//     Returns 'mixed' if no bucket has ≥60% share.

import type {
  PlanningEvent,
  CookingLog,
  RecipeRating,
  MealSlot,
  Recipe,
} from './store';

// ───────────────────────────────────────────────────────────────────────────────
// TYPES
// ───────────────────────────────────────────────────────────────────────────────

/**
 * A single day in the current-week "did the user plan via PnP Picks" strip
 * surfaced on the Profile tab. The array always has 7 entries — Monday first
 * (index 0) through Sunday (index 6) of the calendar week containing today.
 * See `computePlanningHabit` for derivation.
 */
export interface PlanningDayCell {
  /** Local-date key in `YYYY-MM-DD` form for this calendar day. */
  dateKey: string;
  /** Day-of-week letter for this date: `S | M | T | W | T | F | S`. */
  dayLetter: 'S' | 'M' | 'T' | 'W' | 'F';
  /** True when this entry represents today (always the last/rightmost cell). */
  isToday: boolean;
  /** True when at least one `PlanningEvent.createdAt` fell on this local date. */
  planned: boolean;
}

export interface PlanningHabitInsight {
  usualDayOfWeek: number | null;     // 0–6 (Sun–Sat), null when <3 events
  usualHour: number | null;          // 0–23, null when <3 events
  averageGapDays: number | null;     // null when <2 events
  lastPlanGapDays: number | null;    // null when 0 events
  isOverdue: boolean;
  eventCount: number;
  /** Current-week planning strip, Monday (index 0) → Sunday (index 6). */
  last7Days: PlanningDayCell[];
}

export interface CookingMomentumInsight {
  cookedThisWeek: number;            // planned recipes cooked so far this week (Mon→now)
  plannedThisWeek: number;           // mealSlots with a recipeId, full Monday→Sunday week
  currentStreakDays: number;         // consecutive days back from today
  longestStreakDays: number;
}

export interface TasteSignalsInsight {
  topCuisines: Array<{ name: string; count: number }>;
  preferredSpeed: 'quick' | 'moderate' | 'elaborate' | 'mixed' | null;
  avgPrepMinutes: number | null;
}

export interface BehaviorInsights {
  planningHabit: PlanningHabitInsight;
  cooking: CookingMomentumInsight;
  taste: TasteSignalsInsight;
}

export interface InferredGenerationContext {
  topCuisines: string[];
  preferQuick: boolean;
  usualMealTypes: Array<'breakfast' | 'lunch' | 'dinner' | 'snack'>;
}

// ───────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ───────────────────────────────────────────────────────────────────────────────

// Cuisine vocabulary — intentionally narrow. Any recipe tag that
// (case-insensitively) matches one of these counts as that cuisine.
const CUISINE_VOCAB = [
  'Italian',
  'Indian',
  'Mediterranean',
  'Asian',
  'Mexican',
  'Thai',
  'American',
  'French',
  'Middle Eastern',
  'Japanese',
] as const;

const CUISINE_LOOKUP = new Map<string, string>(
  CUISINE_VOCAB.map((c) => [c.toLowerCase(), c]),
);

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// ───────────────────────────────────────────────────────────────────────────────
// HELPERS
// ───────────────────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Monday 00:00 of the calendar week containing `d` (local time).
 * JS `getDay()` is 0=Sun..6=Sat; Sunday maps back 6 days to the prior Monday.
 */
function mondayOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const dow = x.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + mondayOffset);
  return x;
}

function diffDays(a: Date, b: Date): number {
  return Math.floor((startOfDay(a).getTime() - startOfDay(b).getTime()) / MS_PER_DAY);
}

function mode<T>(values: T[]): T | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

// ───────────────────────────────────────────────────────────────────────────────
// PLANNING HABIT
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Local `YYYY-MM-DD` key derived from a Date's wall-clock components.
 * Inlined here (rather than importing the store helper of the same name)
 * to keep `behavior-insights.ts` free of store-layer imports. Semantics
 * are identical: zero-padded month/day, no timezone shift.
 */
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Sun-first day-of-week letters; the literal type matches PlanningDayCell. */
const DAY_LETTERS: PlanningDayCell['dayLetter'][] = [
  'S', // Sun
  'M', // Mon
  'T', // Tue
  'W', // Wed
  'T', // Thu
  'F', // Fri
  'S', // Sat
];

/**
 * Build the current-week strip for the Planning habit card.
 * Returns 7 cells for the calendar week containing `now`, Monday first
 * (index 0 = Monday) through Sunday (index 6). A cell is `planned` when at
 * least one event's `createdAt` falls on that local calendar date; days
 * later in the week than today come back `planned:false, isToday:false`.
 * Works regardless of event count (returns 7 empty cells when `events` is
 * empty).
 */
function buildWeekStrip(events: PlanningEvent[], now: Date): PlanningDayCell[] {
  const plannedDates = new Set<string>();
  for (const ev of events) {
    plannedDates.add(localDateKey(new Date(ev.createdAt)));
  }

  const todayKey = localDateKey(now);
  const monday = mondayOfWeek(now);

  const cells: PlanningDayCell[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = localDateKey(d);
    cells.push({
      dateKey: key,
      dayLetter: DAY_LETTERS[d.getDay()],
      isToday: key === todayKey,
      planned: plannedDates.has(key),
    });
  }
  return cells;
}

function computePlanningHabit(
  events: PlanningEvent[],
  now: Date,
): PlanningHabitInsight {
  const eventCount = events.length;
  const last7Days = buildWeekStrip(events, now);

  if (eventCount === 0) {
    return {
      usualDayOfWeek: null,
      usualHour: null,
      averageGapDays: null,
      lastPlanGapDays: null,
      isOverdue: false,
      eventCount: 0,
      last7Days,
    };
  }

  // Sort by createdAt ascending so gap math is straightforward.
  const sorted = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const dates = sorted.map((e) => new Date(e.createdAt));

  // Average gap (mean of consecutive deltas in days)
  let averageGapDays: number | null = null;
  if (dates.length >= 2) {
    let totalDays = 0;
    for (let i = 1; i < dates.length; i++) {
      totalDays += (dates[i].getTime() - dates[i - 1].getTime()) / MS_PER_DAY;
    }
    averageGapDays = totalDays / (dates.length - 1);
  }

  // Last gap (days from most recent event to now)
  const lastDate = dates[dates.length - 1];
  const lastPlanGapDays = (now.getTime() - lastDate.getTime()) / MS_PER_DAY;

  // Overdue threshold: max(7, avgGap * 1.5). Single-event users get
  // the 7-day default.
  const overdueThreshold =
    averageGapDays !== null ? Math.max(7, averageGapDays * 1.5) : 7;
  const isOverdue = lastPlanGapDays >= overdueThreshold;

  // Mode of day-of-week and hour — only meaningful with ≥3 events.
  let usualDayOfWeek: number | null = null;
  let usualHour: number | null = null;
  if (eventCount >= 3) {
    usualDayOfWeek = mode(dates.map((d) => d.getDay()));
    usualHour = mode(dates.map((d) => d.getHours()));
  }

  return {
    usualDayOfWeek,
    usualHour,
    averageGapDays,
    lastPlanGapDays,
    isOverdue,
    eventCount,
    last7Days,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// COOKING MOMENTUM
// ───────────────────────────────────────────────────────────────────────────────

function computeCookingMomentum(
  cookingLogs: CookingLog[],
  mealSlots: MealSlot[],
  now: Date,
): CookingMomentumInsight {
  // Monday→Sunday calendar week, so the momentum denominator matches the
  // "This week · planned" tile on the Profile screen exactly (the FULL week's
  // planned recipes, not just the so-far slice). `cookedThisWeek` is still the
  // count cooked up to now — you can't cook a future meal — giving a
  // "cooked N of the week's M planned" progress figure.
  const today = startOfDay(now);
  const weekStart = mondayOfWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const cookedThisWeek = cookingLogs.filter((l) => {
    if (l.status !== 'cooked') return false;
    const t = new Date(l.cookedAt).getTime();
    return t >= weekStart.getTime() && t <= now.getTime();
  }).length;

  const plannedThisWeek = mealSlots.filter((s) => {
    if (!s.recipeId) return false;
    if (!s.date) return false;
    // mealSlot.date is 'YYYY-MM-DD'
    const parts = s.date.split('-');
    if (parts.length !== 3) return false;
    const slotDate = new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2]),
    );
    return slotDate >= weekStart && slotDate <= weekEnd;
  }).length;

  // Streak — consecutive days back from today with ≥1 cooked log.
  const cookedDays = new Set<string>(
    cookingLogs
      .filter((l) => l.status === 'cooked')
      .map((l) => {
        const d = startOfDay(new Date(l.cookedAt));
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      }),
  );

  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  let currentStreakDays = 0;
  for (let i = 0; i < 365; i++) {
    const probe = new Date(today);
    probe.setDate(probe.getDate() - i);
    if (cookedDays.has(dayKey(probe))) {
      currentStreakDays++;
    } else {
      break;
    }
  }

  // Longest streak — walk a sorted list of unique cooked-day timestamps.
  const sortedDayMs = Array.from(cookedDays)
    .map((k) => {
      const [y, m, dd] = k.split('-').map(Number);
      return new Date(y, m, dd).getTime();
    })
    .sort((a, b) => a - b);
  let longestStreakDays = 0;
  let run = 0;
  for (let i = 0; i < sortedDayMs.length; i++) {
    if (i === 0 || sortedDayMs[i] - sortedDayMs[i - 1] === MS_PER_DAY) {
      run++;
    } else {
      run = 1;
    }
    if (run > longestStreakDays) longestStreakDays = run;
  }

  return {
    cookedThisWeek,
    plannedThisWeek,
    currentStreakDays,
    longestStreakDays,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// TASTE SIGNALS
// ───────────────────────────────────────────────────────────────────────────────

function computeTasteSignals(
  cookingLogs: CookingLog[],
  recipeRatings: RecipeRating[],
  recipes: Recipe[],
): TasteSignalsInsight {
  const recipeById = new Map(recipes.map((r) => [r.id, r]));

  // Source recipes: cooked logs first; fall back to ≥4-star ratings if
  // fewer than 5 cooked logs exist.
  const cookedRecipes: Recipe[] = [];
  for (const l of cookingLogs) {
    if (l.status !== 'cooked' || !l.recipeId) continue;
    const r = recipeById.get(l.recipeId);
    if (r) cookedRecipes.push(r);
  }

  let sourceRecipes = cookedRecipes;
  if (cookedRecipes.length < 5) {
    const ratedRecipes: Recipe[] = [];
    for (const rating of recipeRatings) {
      if (rating.stars < 4) continue;
      const r = recipeById.get(rating.recipeId);
      if (r) ratedRecipes.push(r);
    }
    // Combine, dedupe by id
    const merged = new Map<string, Recipe>();
    for (const r of cookedRecipes) merged.set(r.id, r);
    for (const r of ratedRecipes) merged.set(r.id, r);
    sourceRecipes = Array.from(merged.values());
  }

  // Cuisine ranking — intersect each recipe's tags with CUISINE_VOCAB.
  const cuisineCounts = new Map<string, number>();
  for (const r of sourceRecipes) {
    if (!r.tags) continue;
    for (const tag of r.tags) {
      const canonical = CUISINE_LOOKUP.get(tag.toLowerCase());
      if (canonical) {
        cuisineCounts.set(canonical, (cuisineCounts.get(canonical) ?? 0) + 1);
      }
    }
  }
  const topCuisines = Array.from(cuisineCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // Speed bucketing — total minutes = cookTime + prepTime
  let avgPrepMinutes: number | null = null;
  let preferredSpeed: TasteSignalsInsight['preferredSpeed'] = null;
  if (sourceRecipes.length >= 3) {
    let quick = 0;
    let moderate = 0;
    let elaborate = 0;
    let totalMin = 0;
    for (const r of sourceRecipes) {
      const t = (r.cookTime || 0) + (r.prepTime || 0);
      if (t <= 0) continue;
      totalMin += t;
      if (t <= 30) quick++;
      else if (t <= 60) moderate++;
      else elaborate++;
    }
    const total = quick + moderate + elaborate;
    if (total > 0) {
      avgPrepMinutes = Math.round(totalMin / total);
      const dominant = Math.max(quick, moderate, elaborate);
      if (dominant / total >= 0.6) {
        preferredSpeed =
          dominant === quick ? 'quick' : dominant === moderate ? 'moderate' : 'elaborate';
      } else {
        preferredSpeed = 'mixed';
      }
    }
  }

  return {
    topCuisines,
    preferredSpeed,
    avgPrepMinutes,
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ───────────────────────────────────────────────────────────────────────────────

export interface ComputeBehaviorInsightsInput {
  now: Date;
  planningEvents: PlanningEvent[];
  cookingLogs: CookingLog[];
  mealSlots: MealSlot[];
  recipes: Recipe[];
  recipeRatings: RecipeRating[];
}

export function computeBehaviorInsights(
  input: ComputeBehaviorInsightsInput,
): BehaviorInsights {
  return {
    planningHabit: computePlanningHabit(input.planningEvents, input.now),
    cooking: computeCookingMomentum(
      input.cookingLogs,
      input.mealSlots,
      input.now,
    ),
    taste: computeTasteSignals(
      input.cookingLogs,
      input.recipeRatings,
      input.recipes,
    ),
  };
}

// Soft-context object fed back into the recipe-generation prompt. Only
// populated fields are surfaced — a brand-new user (no signal) returns
// `{ topCuisines: [], preferQuick: false, usualMealTypes: [] }`.
export function getInferredGenerationContext(
  insights: BehaviorInsights,
): InferredGenerationContext {
  return {
    topCuisines: insights.taste.topCuisines.map((c) => c.name),
    preferQuick: insights.taste.preferredSpeed === 'quick',
    usualMealTypes: [], // intentionally empty — derived directly at call site
                       // from planningEvents if we ever decide to lean on it.
  };
}

// Composes the final string passed to the LLM by appending observed
// taste signals as low-weight soft context. Explicit prefs (already
// baked into `personaInstructions`) still take precedence — these are
// additive hints, not constraints. Brand-new users with no signal get
// the unmodified personaInstructions string back.
export function composeEnrichedInstructions(
  personaInstructions: string,
  soft: InferredGenerationContext,
): string {
  const parts: string[] = [];
  if (soft.topCuisines.length > 0) {
    parts.push(
      `Lean toward cuisines the user actually cooks: ${soft.topCuisines.join(', ')}.`,
    );
  }
  if (soft.preferQuick) {
    parts.push(
      'Default to quick weeknight meals (≤30 min total) unless context says otherwise.',
    );
  }
  if (parts.length === 0) return personaInstructions;
  return `${personaInstructions}\n\nObserved taste signals: ${parts.join(' ')}`;
}

// ───────────────────────────────────────────────────────────────────────────────
// FORMATTING HELPERS (used by the Profile UI to keep render code clean)
// ───────────────────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatUsualDay(dow: number | null): string | null {
  if (dow === null) return null;
  return `${DAY_NAMES[dow]}s`;
}

export function formatUsualHour(hour: number | null): string | null {
  if (hour === null) return null;
  if (hour === 0) return '12 am';
  if (hour === 12) return '12 pm';
  if (hour < 12) return `${hour} am`;
  return `${hour - 12} pm`;
}

export function formatGapDays(days: number | null): string | null {
  if (days === null) return null;
  const rounded = Math.round(days);
  if (rounded <= 0) return 'today';
  if (rounded === 1) return '1 day';
  return `${rounded} days`;
}
