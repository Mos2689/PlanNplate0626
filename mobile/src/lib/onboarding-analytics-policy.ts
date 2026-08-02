// Onboarding analytics — the PURE half.
//
// Split from onboarding-analytics.ts for the same reason
// firebase-analytics-policy.ts is split from firebase-analytics.ts: everything
// worth testing lives here, with no `track()`, no Platform, no store, and no
// native module in the import graph, so jest can exercise it directly.
//
// PRIVACY RULE, enforced by construction rather than by review:
// the dishes a user speaks or types are free-form personal text ("Mum's dal",
// "Dad's birthday curry"). They must never reach a dashboard. So the builders
// below accept COUNTS and a narrow structural profile — never a dish string —
// and every derivation destructures the exact fields it needs. This mirrors
// lib/share/analytics.ts, which accepts a hostname and never a full URL.
//
// `profileFrequentCooks()` (lib/frequent-cook-profiling.ts) returns
// `enteredText` and `enteredSlugs` alongside the fields we want. Those two ARE
// the raw dish text. `CookProfileInput` deliberately does not declare them, and
// nothing in this file may read them.

/** Steps of the live onboarding flow. Keys are stable across copy changes. */
export type OnboardingStepKey = 'your_cooking' | 'for_you';

/**
 * Step keys by index, parallel to STEP_NAMES in app/onboarding.tsx. Reporting
 * an index and a stable key alongside the display name is what makes the funnel
 * survive the next flow change — the previous 5-step funnel died precisely
 * because it was keyed on display names that no longer exist.
 */
export const ONBOARDING_STEP_KEYS: readonly OnboardingStepKey[] = [
  'your_cooking',
  'for_you',
];

export const stepKeyForIndex = (index: number): OnboardingStepKey | 'unknown' =>
  ONBOARDING_STEP_KEYS[index] ?? 'unknown';

/** How the user reached the step flow. */
export type OnboardingEntryPoint = 'welcome' | 'resumed' | 'direct';

/** Which capture path produced a dish. */
export type DishInputMethod = 'voice' | 'type';

/**
 * Why a voice capture failed. A bounded enum, never the underlying message —
 * error text carries file paths, ids and occasionally transcribed content.
 * Same discipline as failure/diagnostics.ts, which reports a fingerprint and
 * deliberately no raw message.
 */
export type VoiceFailureReason =
  | 'permission_denied'
  | 'start_error'
  | 'no_recording'
  | 'not_heard'
  | 'transcribe_error';

/** Whether the model split the transcript, or we fell back to naive splitting. */
export type DishSplitSource = 'model' | 'fallback';

/** Where the step-2 grid came from. */
export type SuggestionSource = 'profiled' | 'generic';

/**
 * The ONLY shape of `FrequentCookProfile` this module is allowed to see.
 * Structurally satisfied by profileFrequentCooks()'s return value.
 */
export interface CookProfileInput {
  cuisineWeights: Record<string, number>;
  vegetarianOnly: boolean;
}

/** Non-identifying taste signal derived from the dishes the user named. */
export interface CookSignal {
  dominant_cuisine: string | null;
  cuisine_diversity: number;
  vegetarian_only: boolean;
}

/**
 * Reduce a frequent-cook profile to three scalars.
 *
 * This is the replacement for the persona signal the deleted Diet and Cuisine
 * steps used to provide: it answers "what kind of cook is this" without asking
 * a single extra question, and without recording what they actually cook.
 *
 * Ties break on cuisine name so the same input always yields the same output —
 * otherwise the property would flicker between runs and be useless for
 * segmentation.
 */
export const deriveCookSignal = (profile: CookProfileInput | null): CookSignal => {
  if (!profile) {
    return { dominant_cuisine: null, cuisine_diversity: 0, vegetarian_only: false };
  }

  // Destructured explicitly: nothing else on the profile can reach the output.
  const { cuisineWeights, vegetarianOnly } = profile;
  const entries = Object.entries(cuisineWeights).filter(([, weight]) =>
    Number.isFinite(weight),
  );

  const dominant =
    entries.length === 0
      ? null
      : entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];

  return {
    dominant_cuisine: dominant,
    cuisine_diversity: entries.length,
    vegetarian_only: vegetarianOnly,
  };
};

/** Inputs to the terminal onboarding event. All counts and enums. */
export interface OnboardingCompletedInput {
  dishCount: number;
  /** Which capture paths the user actually used, in first-use order. */
  inputMethods: DishInputMethod[];
  tastePicksCount: number;
  tasteSuggestionsShown: number;
  suggestionSource: SuggestionSource;
  profile: CookProfileInput | null;
  stepsCompleted: number;
  durationMs: number | null;
}

/**
 * Properties for `onboarding_completed`.
 *
 * This deliberately does NOT carry dietaryRestrictions / allergies /
 * cuisinePreferences / cookingSkillLevel / household / cookingDaysPerWeek /
 * weeknightMinutes / equipment / mealHabits / priorities / goals, which the
 * previous payload sent. Those screens were removed with the old flow, so the
 * state behind them is now frozen at its declared default for every user — the
 * properties looked like persona data but were eleven constants. Persona now
 * arrives from EditProfileModal via `persona_updated`, which is the surface
 * that actually collects it.
 */
export const buildOnboardingCompletedProps = (
  input: OnboardingCompletedInput,
): Record<string, unknown> => ({
  dish_count: input.dishCount,
  input_methods: [...input.inputMethods],
  taste_picks_count: input.tastePicksCount,
  taste_suggestions_shown: input.tasteSuggestionsShown,
  suggestion_source: input.suggestionSource,
  steps_completed: input.stepsCompleted,
  duration_ms: input.durationMs ?? undefined,
  ...deriveCookSignal(input.profile),
});

/** Persona fields tracked for change detection in EditProfileModal. */
export interface PersonaSnapshot {
  dietaryRestrictions: string[];
  allergies: string[];
  cuisinePreferences: string[];
  cookingSkillLevel: string;
  household: string | undefined;
  weeknightMinutes: number | undefined;
  servingSize: number;
  adventureLevel: number | undefined;
  weeklyBudget: number | null | undefined;
  monthlyBudget: number | null | undefined;
}

const sameList = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((value, i) => value === b[i]);

/**
 * Which persona fields changed between opening and closing the editor.
 *
 * EditProfileModal writes each toggle straight to the store with no draft
 * state, so per-toggle events would be pure noise (five taps to pick five
 * cuisines is one decision, not five). Diffing a snapshot gives one event per
 * editing session, which is the unit a funnel actually wants.
 */
export const diffPersona = (
  before: PersonaSnapshot,
  after: PersonaSnapshot,
): string[] => {
  const changed: string[] = [];
  if (!sameList(before.dietaryRestrictions, after.dietaryRestrictions)) {
    changed.push('dietary_restrictions');
  }
  if (!sameList(before.allergies, after.allergies)) changed.push('allergies');
  if (!sameList(before.cuisinePreferences, after.cuisinePreferences)) {
    changed.push('cuisine_preferences');
  }
  if (before.cookingSkillLevel !== after.cookingSkillLevel) changed.push('skill_level');
  if (before.household !== after.household) changed.push('household');
  if (before.weeknightMinutes !== after.weeknightMinutes) changed.push('weeknight_minutes');
  if (before.servingSize !== after.servingSize) changed.push('serving_size');
  if (before.adventureLevel !== after.adventureLevel) changed.push('adventure_level');
  if (before.weeklyBudget !== after.weeklyBudget) changed.push('weekly_budget');
  if (before.monthlyBudget !== after.monthlyBudget) changed.push('monthly_budget');
  return changed;
};

/**
 * Properties for `persona_updated`. Counts and enums only — the selected diets
 * and cuisines come from fixed vocabularies (lib/preference-options.ts) so the
 * *names* would be safe, but counts are what the funnel segments on and keeping
 * the payload uniform with the rest of this module is worth more than the
 * detail. `fields_changed` says which sections the user actually touched.
 */
export const buildPersonaUpdatedProps = (
  after: PersonaSnapshot,
  fieldsChanged: string[],
  source: string,
): Record<string, unknown> => ({
  source,
  fields_changed: [...fieldsChanged],
  fields_changed_count: fieldsChanged.length,
  diet_count: after.dietaryRestrictions.length,
  allergy_count: after.allergies.length,
  cuisine_count: after.cuisinePreferences.length,
  skill_level: after.cookingSkillLevel,
  household: after.household,
  weeknight_minutes: after.weeknightMinutes,
  serving_size: after.servingSize,
  adventure_level: after.adventureLevel,
  has_weekly_budget: after.weeklyBudget != null,
  has_monthly_budget: after.monthlyBudget != null,
});
