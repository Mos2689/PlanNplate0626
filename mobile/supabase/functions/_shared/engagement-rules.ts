// Engagement rules — the pure decision logic behind the weekly/monthly email.
//
// Split out of engagement-dispatch so it can be tested. That module calls
// Deno.serve at import time, so importing it from a test would start a server;
// everything here is a plain function over plain data and can be driven from a
// test with fixed inputs, in the same spirit as src/lib/nudge-engine.ts on the
// client.
//
// Nothing here performs I/O, reads the clock, or touches the database.

// ── Local time ─────────────────────────────────────────────────────────────

export interface LocalClock {
  /** YYYY-MM-DD in the user's own zone. */
  date: string;
  /** 0=Sun .. 6=Sat, matching Postgres `extract(dow)`. */
  dow: number;
  /** Minutes since local midnight. */
  minutes: number;
  dayOfMonth: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/**
 * What time is it for someone in `timeZone`?
 *
 * Deno ships full ICU, so Intl handles offsets and DST. An unknown or
 * malformed zone — a client sending nonsense, or an IANA name that has since
 * been retired — falls back to UTC rather than throwing: being mailed at a
 * slightly odd hour beats being silently excluded forever.
 */
export function localClock(now: Date, timeZone: string): LocalClock {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    }).formatToParts(now);
  } catch {
    return timeZone === 'UTC'
      // Defensive: if even UTC fails the runtime is broken beyond rescue, and
      // recursing would spin forever.
      ? { date: '1970-01-01', dow: 4, minutes: 0, dayOfMonth: 1 }
      : localClock(now, 'UTC');
  }

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    dow: WEEKDAY_INDEX[get('weekday')] ?? 0,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    dayOfMonth: Number(get('day')),
  };
}

/** 'HH:MM' or 'HH:MM:SS' → minutes since midnight. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m ?? 0);
}

/**
 * ISO week key, e.g. '2026-W35'.
 *
 * ISO weeks are Monday-anchored, matching `date_trunc('week', ...)` in the
 * signal functions and `mondayOfWeek()` in the client's behavior-insights.
 * Note the year comes from the ISO week, not the calendar date, so the last
 * days of December can correctly belong to week 1 of the next year.
 */
export function isoWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** First day of the month BEFORE `dateStr` — the month a monthly recap covers. */
export function previousMonthStart(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, '0')}-01`;
}

export function monthKey(monthStart: string): string {
  return monthStart.slice(0, 7);
}

/**
 * Is this the Nth occurrence of its weekday in its month?
 *
 * Monthly sends are "the first Wednesday", not "the 1st". A fixed date drifts
 * across the week and would eventually collide with the weekly Saturday send.
 */
export function isNthWeekdayOfMonth(clock: LocalClock, nth: number): boolean {
  return Math.floor((clock.dayOfMonth - 1) / 7) + 1 === nth;
}

// ── Eligibility ────────────────────────────────────────────────────────────

/**
 * Declarative `min_data` evaluation. Returns a suppression reason, or null to
 * proceed.
 *
 * The keys are the vocabulary a campaign row may use. Adding one means
 * deploying the function — that is the honest boundary of "server-driven":
 * thresholds are config, signals are code.
 */
export function meetsMinData(
  min: Record<string, unknown>,
  s: Record<string, any>,
): string | null {
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(v));

  if ('planned_count_min' in min && num(s.planned_count) < num(min.planned_count_min)) {
    return 'below_planned_count_min';
  }
  // Distinct from planned_count on purpose. `planned_count` is slots the user
  // has DECIDED (including "Leftovers · X" and "Buy out"); this is slots that
  // carry a recipe, and therefore ingredients. A week of leftovers is fully
  // planned but generates no shopping list.
  if (
    'planned_recipe_count_min' in min &&
    num(s.planned_recipe_count) < num(min.planned_recipe_count_min)
  ) {
    return 'below_planned_recipe_count_min';
  }
  if (min.requires_complete_prior_week === true && !s.has_complete_prior_week) {
    return 'no_complete_prior_week';
  }
  if (
    'repeat_candidates_min' in min &&
    (s.repeat_candidates?.length ?? 0) < num(min.repeat_candidates_min)
  ) {
    return 'no_repeat_candidates';
  }
  if ('library_count_min' in min && num(s.library_count) < num(min.library_count_min)) {
    return 'library_too_small';
  }
  if (
    'planning_event_count_min' in min &&
    num(s.planning_event_count) < num(min.planning_event_count_min)
  ) {
    return 'no_planning_history';
  }
  if ('orphan_count_min' in min && num(s.orphan_count) < num(min.orphan_count_min)) {
    return 'below_orphan_count_min';
  }
  if (
    'planned_meal_count_min' in min &&
    num(s.planned_meal_count) < num(min.planned_meal_count_min)
  ) {
    return 'month_too_thin';
  }
  if (
    'distinct_recipe_count_min' in min &&
    num(s.distinct_recipe_count) < num(min.distinct_recipe_count_min)
  ) {
    return 'month_too_repetitive';
  }
  if ('active_weeks_min' in min && num(s.active_weeks) < num(min.active_weeks_min)) {
    return 'month_not_active_enough';
  }
  return null;
}

/**
 * Campaign-specific triggers — the "why now, why this user" tests that aren't
 * expressible as a threshold. Returns a reason to stay quiet, or null.
 */
export function passesTrigger(campaignId: string, s: Record<string, any>): string | null {
  switch (campaignId) {
    case 'weekly_plan_unfinished': {
      // Started but not finished. Someone who has already planned their usual
      // number of meals has nothing unfinished, and telling them they're
      // behind when they aren't is the fastest way to lose a subscriber.
      const planned = Number(s.planned_count ?? 0);
      const typical = Number(s.typical_count ?? 0);
      if (planned <= 0) return 'nothing_started';
      if (typical <= 0) return 'no_baseline';
      if (planned >= typical) return 'week_already_complete';
      return null;
    }
    case 'weekly_grocery_ready': {
      // Recipes, not decided slots — see the note in meetsMinData.
      if (Number(s.planned_recipe_count ?? 0) < 3) return 'not_enough_planned';
      if (s.grocery_covered) return 'list_already_started';
      if (s.saved_list_since_plan) return 'list_already_saved';
      // The list IS the value here. No ingredient data, no email.
      const groups = Array.isArray(s.planned_ingredients) ? s.planned_ingredients : [];
      const any = groups.some((g: any) => Array.isArray(g?.ingredients) && g.ingredients.length);
      if (!any) return 'no_ingredient_data';
      return null;
    }
    case 'weekly_plan_next_week': {
      if (Number(s.planned_count ?? 0) > 0) return 'already_planning';
      // Without a head start this is just "you forgot", weekly, forever.
      if ((s.repeat_candidates?.length ?? 0) === 0) return 'no_head_start';
      return null;
    }
    case 'weekly_saved_rediscovery': {
      if ((s.orphan_recipes?.length ?? 0) === 0) return 'no_orphans';
      return null;
    }
    case 'monthly_meal_story':
      // Threshold-only; the rediscovery variant handles the shortfall.
      return null;
    default:
      return null;
  }
}

// ── Template variables ─────────────────────────────────────────────────────

export function templateVars(s: Record<string, any>): Record<string, unknown> {
  const candidates: any[] = Array.isArray(s.repeat_candidates) ? s.repeat_candidates : [];
  const orphans: any[] = Array.isArray(s.orphan_recipes) ? s.orphan_recipes : [];
  const top = s.most_planned_recipe;
  const fav = s.dormant_favourite;

  return {
    first_name: s.first_name ?? '',
    planned_count: s.planned_count ?? 0,
    planned_recipe_count: s.planned_recipe_count ?? 0,
    planned_meal_count: s.planned_meal_count ?? s.planned_count ?? 0,
    typical_count: s.typical_count ?? 0,
    unplanned_day_count: s.unplanned_day_count ?? 0,
    distinct_recipe_count: s.distinct_recipe_count ?? 0,
    month_name: s.month_name ?? '',
    week_name: s.week_name ?? '',
    repeat_candidate_1: candidates[0]?.name ?? '',
    repeat_candidate_2: candidates[1]?.name ?? '',
    recently_saved_recipe: orphans[0]?.name ?? '',
    days_since_saved: orphans[0]?.days_since_saved ?? 0,
    orphan_count: s.orphan_count ?? 0,
    most_planned_recipe: top?.name ?? '',
    most_planned_count: top?.count ?? 0,
    favourite_recipe: fav?.name ?? '',
    cook_count: fav?.cook_count ?? 0,
    gap_days: fav?.gap_days ?? 0,
    new_recipe_count: s.new_recipe_count ?? 0,
    saved_recipe_count: s.library_count ?? 0,
  };
}

/** Which recipe (if any) the CTA should open. */
export function ctaRecipeId(
  campaignId: string,
  variant: string,
  s: Record<string, any>,
): string | null {
  if (variant === 'rediscovery') return s.dormant_favourite?.id ?? null;
  if (campaignId === 'weekly_saved_rediscovery') return s.orphan_recipes?.[0]?.id ?? null;
  return null;
}
