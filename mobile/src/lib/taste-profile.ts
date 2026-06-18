// Pure derivation of a user's taste profile from cooking history +
// onboarding signals. No store access. Consumed by the meal-plan
// generation pipeline so recipes adapt to what users actually cook,
// skip, and rate — closing the feedback loop the rest of the app
// already captures but never reads.

import type { CookingLog, Recipe, UserPreferences } from './store';
import { VIBE_BY_ID, type VibeId } from './vibe-inference';

// Allowlist of cuisines we know the onboarding flow can emit.
// Kept in sync with CUISINE_OPTIONS in src/app/onboarding.tsx — any
// new cuisine added there should be appended here so the matcher
// can attribute cooked/skipped recipes to it.
const KNOWN_CUISINES = [
  'Italian',
  'Mexican',
  'Asian',
  'Japanese',
  'Chinese',
  'Indian',
  'Thai',
  'Mediterranean',
  'American',
  'Korean',
  'French',
  'Greek',
] as const;

export interface TasteProfile {
  // Cuisines the user has consistently skipped or rated low — the
  // generator should avoid these even if they appear in saved
  // cuisinePreferences (onboarding bias vs. demonstrated behavior).
  suppressedCuisines: string[];
  // Vibe IDs whose average rating is poor. Surfaced for the vibe
  // deck to deprioritize; not currently fed into the recipe prompt.
  suppressedVibes: string[];
  // Cold-start bootstrap from onboarding's exploreCuisines, minus
  // anything that's since been suppressed.
  exploreCuisines: string[];
  // Derived plan-length default. -1 means we don't have a signal
  // (preference unset). Callers must not override an explicit user
  // selection with this — surface it as a default only.
  suggestedPlanDays: number;
  // 0 = cold start, 1 = established. Linear ramp at 5 cooked recipes.
  // Lets downstream consumers gate behavior (e.g., only show
  // "based on your taste" copy once we actually have signal).
  confidenceScore: number;
}

function attributeCuisine(recipe: Recipe | undefined): string | null {
  if (!recipe) return null;
  const haystack = [
    ...(recipe.tags ?? []),
    recipe.name,
    recipe.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  for (const cuisine of KNOWN_CUISINES) {
    if (haystack.includes(cuisine.toLowerCase())) return cuisine;
  }
  return null;
}

export interface ComputeTasteProfileInput {
  cookingLogs: CookingLog[];
  recipes: Recipe[];
  preferences: UserPreferences;
}

export function computeTasteProfile(input: ComputeTasteProfileInput): TasteProfile {
  const { cookingLogs, recipes, preferences } = input;
  const recipeById = new Map(recipes.map((r) => [r.id, r]));

  const cuisineSkipCounts = new Map<string, number>();
  const cuisineVibeRatings = new Map<string, number[]>();
  const vibeRatings = new Map<string, number[]>();
  let cookedCount = 0;

  for (const log of cookingLogs) {
    const recipe = log.recipeId ? recipeById.get(log.recipeId) : undefined;
    const cuisine = attributeCuisine(recipe);

    if (log.status === 'cooked') cookedCount += 1;

    if (log.status === 'skipped' && cuisine) {
      cuisineSkipCounts.set(cuisine, (cuisineSkipCounts.get(cuisine) ?? 0) + 1);
    }

    if (typeof log.vibeRating === 'number') {
      if (cuisine) {
        const list = cuisineVibeRatings.get(cuisine) ?? [];
        list.push(log.vibeRating);
        cuisineVibeRatings.set(cuisine, list);
      }
      if (log.vibeId) {
        const list = vibeRatings.get(log.vibeId) ?? [];
        list.push(log.vibeRating);
        vibeRatings.set(log.vibeId, list);
      }
    }
  }

  const suppressedCuisines: string[] = [];
  for (const cuisine of KNOWN_CUISINES) {
    const skips = cuisineSkipCounts.get(cuisine) ?? 0;
    const ratings = cuisineVibeRatings.get(cuisine) ?? [];
    const avg = ratings.length
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : null;
    if (skips >= 2) {
      suppressedCuisines.push(cuisine);
    } else if (avg !== null && ratings.length >= 2 && avg <= 2.5) {
      suppressedCuisines.push(cuisine);
    }
  }

  const suppressedVibes: string[] = [];
  for (const [vibeId, ratings] of vibeRatings) {
    if (ratings.length < 2) continue;
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    if (avg <= 2) suppressedVibes.push(vibeId);
  }

  const onboardingExplore = preferences.exploreCuisines ?? [];
  const exploreCuisines = onboardingExplore.filter(
    (c) => !suppressedCuisines.includes(c),
  );

  const suggestedPlanDays =
    typeof preferences.cookingDaysPerWeek === 'number' && preferences.cookingDaysPerWeek > 0
      ? Math.min(7, Math.max(1, Math.round(preferences.cookingDaysPerWeek)))
      : -1;

  const confidenceScore = Math.min(1, cookedCount / 5);

  return {
    suppressedCuisines,
    suppressedVibes,
    exploreCuisines,
    suggestedPlanDays,
    confidenceScore,
  };
}

// Optional per-generation overlay layered on top of the profile.
// Threaded through from the most recent skip event so the prompt
// can react to "the user just bailed on a meal because they had
// no time" without a second derivation pass through the logs.
export interface TasteSignalOverrides {
  // Free-text hint from skip-reason-handler.ts. Appended verbatim
  // when non-empty.
  generationHint?: string;
  // 1–5. <=2 → simplify, >=4 → can be elaborate, 3/null → no-op.
  planIntensity?: number | null;
}

// Renders the profile as a prompt fragment. Returns empty string for
// cold-start users so the existing prompt remains untouched —
// callers can append unconditionally. The `overrides` arg lets the
// caller layer transient per-generation signals (most recent skip
// effect) on top without having to re-derive them from logs.
export function composeTasteSignalsForGeneration(
  profile: TasteProfile,
  overrides?: TasteSignalOverrides,
): string {
  const lines: string[] = [];

  if (profile.suppressedCuisines.length > 0) {
    lines.push(
      `Avoid these cuisines — the user has skipped or rated them poorly in the past: ${profile.suppressedCuisines.join(', ')}.`,
    );
  }

  if (profile.exploreCuisines.length > 0 && profile.confidenceScore < 0.6) {
    lines.push(
      `The user expressed interest in trying these cuisines during onboarding — favor them when picking dishes: ${profile.exploreCuisines.join(', ')}.`,
    );
  }

  // Vibe suppression — used only as a profiling signal on the
  // meal-plan prompt, NEVER as a UX filter in the Vibe Cooking
  // deck. Translate IDs to human names so the prompt is readable.
  if (profile.suppressedVibes.length > 0) {
    const names = profile.suppressedVibes
      .map((id) => VIBE_BY_ID[id as VibeId]?.name)
      .filter((n): n is string => !!n);
    if (names.length > 0) {
      lines.push(
        `The user has rated ${names.map((n) => `"${n}"`).join(', ')} cooking sessions poorly in the past — favor recipes that contrast those moods (different energy, technique, or flavor profile).`,
      );
    }
  }

  // Cadence — derived from preferences.cookingDaysPerWeek. Sent
  // as a hint regardless of plan length: if the requested plan is
  // longer than the user's typical cadence, leftover-friendly
  // dishes keep the plan feasible; if shorter, no harm.
  if (profile.suggestedPlanDays > 0) {
    lines.push(
      `The user typically cooks ${profile.suggestedPlanDays} day(s) a week — favor recipes whose leftovers stretch to the next day so a longer plan still feels achievable.`,
    );
  }

  // Per-generation overrides — most-recent-skip wins. Emitted
  // last so they're the closest text to the recipe-generation
  // instructions and carry the strongest weight in practice.
  if (overrides?.planIntensity != null) {
    if (overrides.planIntensity <= 2) {
      lines.push(
        'Keep recipes simple and quick — the user has limited time or energy right now.',
      );
    } else if (overrides.planIntensity >= 4) {
      lines.push(
        'The user has bandwidth for more elaborate techniques — feel free to suggest multi-step dishes.',
      );
    }
  }

  if (overrides?.generationHint && overrides.generationHint.trim().length > 0) {
    lines.push(overrides.generationHint.trim());
  }

  return lines.length > 0 ? `Taste signals from past cooking:\n${lines.join('\n')}` : '';
}
