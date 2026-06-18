// Nudge engine — pure functions that decide which nudge to show right now.
// No React, no Zustand. Easy to unit-test by passing fixed `now` values.

import type { CookingLog, MealSlot, Recipe, RecipeRating } from './store';

export type NudgeVariant = 'grocery-firsttime' | 'confirm' | 'rating';

export interface NudgeCardProps {
  eyebrow: string;
  title: string;
  message: string;
  primaryAction: string;
  secondaryAction: string;
}

export interface ActiveNudge {
  variant: NudgeVariant;
  cardProps: NudgeCardProps;
  dismissKey: string;
  // Data the sheet will need when the user taps "primary"
  payload: {
    yesterdayDateKey?: string;
    yesterdayMealSlots?: MealSlot[];
    weeklyRecipeIds?: string[];
  };
}

export interface NudgeInputs {
  now: Date;
  mealSlots: MealSlot[];
  recipes: Recipe[];
  cookingLogs: CookingLog[];
  recipeRatings: RecipeRating[];
  dismissals: Record<string, string>;
  lastWeeklyPromptAt: string | null;
  // True while the user is on a silent anonymous (not-yet-signed-up) session.
  // Retrospective nudges (confirm + rating) are hidden for guests entirely —
  // they only begin once the user has signed up AND the account is ≥ 7 days
  // old. The 'grocery-firsttime' handoff is unaffected.
  isAnonymous: boolean;
  // ISO timestamp of when the account was first created — sourced from the
  // auth user's `created_at` (set when the anonymous session is created, i.e.
  // true first-use, and preserved across anonymous→email linking). Used to
  // gate the retrospective nudges behind the "≥ 7 days since signup" rule so
  // brand-new users aren't asked to review a week they haven't lived.
  accountCreatedAt: string | null;
  // Counts surfaced to the engine purely so the 'grocery-firsttime' branch
  // can decide whether the user has ever built a grocery list. Kept as
  // counts (not full arrays) to make the engine cheap to call.
  groceryItemCount: number;
  savedGroceryListCount: number;
  hasCompletedOnboarding: boolean;
  // True while a background recipe-generation run is mid-stream
  // (pendingGeneration.stage ∈ {'starting','generating','finalizing','failed'}).
  // Used to hold the first-time grocery nudge back until the COMPLETE meal-
  // planning process is finished, instead of firing the moment the first
  // streamed recipe lands a slot.
  isGenerationInProgress: boolean;
}

// ───────────────────── Date utilities (local-time) ─────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/**
 * Sunday evening = local Sunday between 16:00 and 23:59. Re-enabled per the
 * "rating only weekly, not daily" change — previously this returned `true`
 * unconditionally, which caused the weekly rating nudge to fire on whichever
 * day the user first opened the app in a new calendar week.
 */
export function isSundayEvening(now: Date): boolean {
  return now.getDay() === 0 && now.getHours() >= 16;
}

/** Returns the YYYY-MM-DD of the most recent Sunday (today if today is Sunday). */
function currentWeekSundayKey(now: Date): string {
  const dow = now.getDay();
  return formatLocalDateKey(addDays(startOfDay(now), -dow));
}

// ───────────────────── Selectors ─────────────────────

/**
 * Past-week unlogged meal slots — every planned slot from the last 7 days
 * (excluding today and the future) that the user hasn't yet marked as cooked
 * or skipped. This is the trigger set for the weekly `confirm` nudge.
 */
export function getUnloggedPastWeekMeals(
  slots: MealSlot[],
  cookingLogs: CookingLog[],
  now: Date,
): MealSlot[] {
  const todayKey = formatLocalDateKey(startOfDay(now));
  const cutoffKey = formatLocalDateKey(addDays(startOfDay(now), -7));
  const loggedSlotIds = new Set(cookingLogs.map((l) => l.slotId));
  return slots.filter(
    (s) =>
      !!s.recipeId &&
      s.date >= cutoffKey &&
      s.date < todayKey &&
      !loggedSlotIds.has(s.id),
  );
}

/**
 * Returns up to 5 recipe IDs to surface for weekly rating.
 * Priority: recipes the user *confirmed cooked* in the last 7 days.
 * Fallback (per brief): if fewer than 5, top up with most-recently planned recipes.
 */
export function getWeeklyRatingRecipeIds(
  inputs: Pick<NudgeInputs, 'now' | 'mealSlots' | 'cookingLogs' | 'recipes'>,
): string[] {
  const { now, mealSlots, cookingLogs, recipes } = inputs;
  const cutoff = startOfDay(addDays(now, -7)).getTime();

  // 1. Confirmed-cooked recipes from the last 7 days (most recent first)
  const cookedIds: string[] = [];
  const seen = new Set<string>();
  const sortedLogs = [...cookingLogs]
    .filter((l) => l.status === 'cooked' && !!l.recipeId)
    .sort((a, b) => new Date(b.cookedAt).getTime() - new Date(a.cookedAt).getTime());
  for (const log of sortedLogs) {
    if (new Date(log.cookedAt).getTime() < cutoff) continue;
    if (!log.recipeId || seen.has(log.recipeId)) continue;
    if (!recipes.find((r) => r.id === log.recipeId)) continue;
    seen.add(log.recipeId);
    cookedIds.push(log.recipeId);
    if (cookedIds.length >= 5) return cookedIds;
  }

  // 2. Fallback: most recently planned recipes in last 7 days
  const recentSlots = [...mealSlots]
    .filter((s) => !!s.recipeId)
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const slot of recentSlots) {
    if (!slot.recipeId || seen.has(slot.recipeId)) continue;
    if (!recipes.find((r) => r.id === slot.recipeId)) continue;
    seen.add(slot.recipeId);
    cookedIds.push(slot.recipeId);
    if (cookedIds.length >= 5) break;
  }

  return cookedIds;
}

// ───────────────────── Dismissal/cooldown helpers ─────────────────────

/**
 * Confirm nudge dismissal is now WEEKLY (Sun-anchored), not daily.
 * Once dismissed in a calendar week, it stays hidden until next Sunday.
 */
export function isConfirmWeeklyDismissed(
  dismissals: Record<string, string>,
  now: Date,
): boolean {
  const key = `confirmWeekly:${currentWeekSundayKey(now)}`;
  return !!dismissals[key];
}

export function isWeeklyDismissed(
  dismissals: Record<string, string>,
  lastPromptAt: string | null,
  now: Date,
): boolean {
  const sundayKey = currentWeekSundayKey(now);
  if (dismissals[`weekly:${sundayKey}`]) return true;
  if (lastPromptAt) {
    const last = new Date(lastPromptAt);
    // If we already prompted on or after this week's Sunday, suppress
    const sundayStart = startOfDay(new Date(sundayKey)).getTime();
    if (last.getTime() >= sundayStart) return true;
  }
  return false;
}

/**
 * "After week 1 since signup" gate for the weekly rating nudge. Returns true
 * when the user is eligible (≥ 7 days past their UserProfile.createdAt). If
 * `createdAt` is missing (legacy users), treat as eligible.
 */
function isPastFirstWeekSinceSignup(now: Date, createdAt: string | null): boolean {
  if (!createdAt) return true;
  const ts = new Date(createdAt).getTime();
  if (Number.isNaN(ts)) return true;
  return now.getTime() - ts >= 7 * MS_PER_DAY;
}

// ───────────────────── Main entrypoint ─────────────────────

export function selectActiveNudge(inputs: NudgeInputs): ActiveNudge | null {
  const {
    now,
    mealSlots,
    cookingLogs,
    dismissals,
    lastWeeklyPromptAt,
    isAnonymous,
    accountCreatedAt,
    groceryItemCount,
    savedGroceryListCount,
    hasCompletedOnboarding,
    isGenerationInProgress,
  } = inputs;

  // Retrospective nudges (confirm + rating) are suppressed for anonymous
  // guests and for anyone still inside their first week since signup, so
  // brand-new users aren't asked to look back on a week they haven't lived.
  const isNewOrGuest =
    isAnonymous || !isPastFirstWeekSinceSignup(now, accountCreatedAt);

  // ── 1. First-time grocery handoff (one-shot, highest priority) ──
  // Onboarded user has a plan but has never built a grocery list yet.
  // Self-resolves the moment they generate any list (groceryItemCount > 0
  // OR savedGroceryListCount > 0) and stays dismissed forever once tapped
  // "Got it" (persisted via nudgeDismissals['grocery-firsttime:default']).
  //
  // CRITICAL: gate on !isGenerationInProgress. Background generation streams
  // recipes in one at a time, so the moment the first recipe lands a slot
  // `hasUpcomingPlannedMeal` would flip true and the nudge would fire mid-
  // stream. We wait until the whole plan is finished ('done' or cleared)
  // before nudging the user toward grocery.
  if (
    !isGenerationInProgress &&
    hasCompletedOnboarding &&
    groceryItemCount === 0 &&
    savedGroceryListCount === 0 &&
    !dismissals['grocery-firsttime:default']
  ) {
    const todayKey = formatLocalDateKey(startOfDay(now));
    const hasUpcomingPlannedMeal = mealSlots.some(
      (s) => !!s.recipeId && s.date >= todayKey,
    );
    if (hasUpcomingPlannedMeal) {
      return {
        variant: 'grocery-firsttime',
        dismissKey: 'grocery-firsttime:default',
        cardProps: {
          eyebrow: 'Next step',
          title: 'Your meals are planned',
          message: 'Build your grocery list by tapping the Grocery button.',
          primaryAction: 'Open grocery',
          secondaryAction: 'Got it',
        },
        payload: {},
      };
    }
  }

  // ── 2. Cooking confirmation (WEEKLY, past-7-day window) ──
  // Fires at most once per Sun-anchored calendar week, any day, as long as
  // there is at least one unlogged planned meal from the past 7 days. Auto-
  // resolves once every past-week slot is logged.
  const unloggedPastWeek = getUnloggedPastWeekMeals(mealSlots, cookingLogs, now);
  if (
    !isNewOrGuest &&
    unloggedPastWeek.length > 0 &&
    !isConfirmWeeklyDismissed(dismissals, now)
  ) {
    const n = unloggedPastWeek.length;
    return {
      variant: 'confirm',
      dismissKey: `confirmWeekly:${currentWeekSundayKey(now)}`,
      cardProps: {
        eyebrow: 'A look back',
        title:
          n === 1
            ? 'How did this week land?'
            : "How did this week's meals land?",
        message:
          n === 1
            ? "One meal from this week is still unrated. Tell me what really happened — even if it was takeout."
            : `${n} meals from this week are still unrated. Tell me what really happened — even the takeout.`,
        primaryAction: 'Look back',
        secondaryAction: 'Skip this week',
      },
      // Carry the most recent unlogged date in the existing yesterdayDateKey
      // field so the existing MealSlotSheet "confirm" entry point keeps
      // working — it focuses on the latest unrated day.
      payload: {
        yesterdayDateKey: unloggedPastWeek
          .map((s) => s.date)
          .sort()
          .pop(),
        yesterdayMealSlots: unloggedPastWeek,
      },
    };
  }

  // ── 3. Weekly rating (Sunday evening, AFTER first week since signup) ──
  if (
    isSundayEvening(now) &&
    !isNewOrGuest &&
    !isWeeklyDismissed(dismissals, lastWeeklyPromptAt, now)
  ) {
    const ids = getWeeklyRatingRecipeIds(inputs);
    if (ids.length > 0) {
      return {
        variant: 'rating',
        dismissKey: `weekly:${currentWeekSundayKey(now)}`,
        cardProps: {
          eyebrow: 'Sunday slow-down',
          title:
            ids.length === 1
              ? 'How did the week land?'
              : 'Which meals were keepers?',
          message:
            ids.length === 1
              ? 'One recipe to look back on. A minute, that’s it.'
              : `${ids.length} recipes worth a glance. Tap stars on what stuck.`,
          primaryAction: 'Open journal',
          secondaryAction: 'Not tonight',
        },
        payload: { weeklyRecipeIds: ids },
      };
    }
  }

  return null;
}
