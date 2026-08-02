// The onboarding behaviour payloads.
//
// The rule this file exists to defend: the dishes a user speaks or types into
// onboarding step 1 are free-form personal text and must never reach a
// dashboard. That rule lives in onboarding-analytics-policy.ts, and the leak
// guard below is what keeps it true as properties get added later.
//
// Imports go straight to the policy module, not the emitter — the emitter pulls
// in PostHog, Firebase's native module probe and the auth store. Same reason
// share-orchestrator.test.ts imports failure/classify rather than the barrel.

import {
  buildOnboardingCompletedProps,
  buildPersonaUpdatedProps,
  deriveCookSignal,
  diffPersona,
  stepKeyForIndex,
  type CookProfileInput,
  type OnboardingCompletedInput,
  type PersonaSnapshot,
} from '../onboarding-analytics-policy';
import { buildFirebaseAnalyticsCommand } from '../firebase-analytics-policy';

const profile = (over: Partial<CookProfileInput> = {}): CookProfileInput => ({
  cuisineWeights: { Indian: 6, Italian: 2 },
  vegetarianOnly: false,
  ...over,
});

const completedInput = (
  over: Partial<OnboardingCompletedInput> = {},
): OnboardingCompletedInput => ({
  dishCount: 3,
  inputMethods: ['voice'],
  tastePicksCount: 2,
  tasteSuggestionsShown: 12,
  suggestionSource: 'profiled',
  profile: profile(),
  stepsCompleted: 2,
  durationMs: 42_000,
  ...over,
});

const persona = (over: Partial<PersonaSnapshot> = {}): PersonaSnapshot => ({
  dietaryRestrictions: [],
  allergies: [],
  cuisinePreferences: [],
  cookingSkillLevel: 'intermediate',
  household: 'couple',
  weeknightMinutes: 30,
  servingSize: 2,
  adventureLevel: 3,
  weeklyBudget: null,
  monthlyBudget: null,
  ...over,
});

describe('deriveCookSignal', () => {
  it('picks the highest-weighted cuisine', () => {
    expect(deriveCookSignal(profile()).dominant_cuisine).toBe('Indian');
  });

  it('breaks ties on name so the property is stable across runs', () => {
    const weights = { Thai: 4, Italian: 4, Indian: 4 };
    // Object key order is insertion order; a naive reduce would return 'Thai'.
    expect(deriveCookSignal(profile({ cuisineWeights: weights })).dominant_cuisine).toBe(
      'Indian',
    );
  });

  it('reports counts and the vegetarian flag', () => {
    const signal = deriveCookSignal(profile({ vegetarianOnly: true }));
    expect(signal.cuisine_diversity).toBe(2);
    expect(signal.vegetarian_only).toBe(true);
  });

  it('degrades to nulls rather than throwing when there is no profile', () => {
    expect(deriveCookSignal(null)).toEqual({
      dominant_cuisine: null,
      cuisine_diversity: 0,
      vegetarian_only: false,
    });
  });

  it('returns a null cuisine when nothing matched the library', () => {
    const signal = deriveCookSignal(profile({ cuisineWeights: {} }));
    expect(signal.dominant_cuisine).toBeNull();
    expect(signal.cuisine_diversity).toBe(0);
  });
});

describe('onboarding_completed payload', () => {
  it('carries the counts the live flow actually captures', () => {
    expect(buildOnboardingCompletedProps(completedInput())).toMatchObject({
      dish_count: 3,
      input_methods: ['voice'],
      taste_picks_count: 2,
      taste_suggestions_shown: 12,
      suggestion_source: 'profiled',
      steps_completed: 2,
      duration_ms: 42_000,
      dominant_cuisine: 'Indian',
      vegetarian_only: false,
    });
  });

  it('drops the persona properties the removed steps used to collect', () => {
    // These eleven were still being sent after the 5-step flow was deleted, by
    // which point every one of them was the same declared default for every
    // user. Their absence is the fix, so it is asserted rather than assumed.
    const props = buildOnboardingCompletedProps(completedInput());
    for (const stale of [
      'dietaryRestrictions',
      'allergies',
      'cuisinePreferences',
      'cookingSkillLevel',
      'household',
      'cookingDaysPerWeek',
      'weeknightMinutes',
      'equipment',
      'mealHabits',
      'priorities',
      'goals',
    ]) {
      expect(props).not.toHaveProperty(stale);
    }
  });

  it('copies input_methods so a later mutation cannot rewrite a sent event', () => {
    const methods: OnboardingCompletedInput['inputMethods'] = ['voice'];
    const props = buildOnboardingCompletedProps(completedInput({ inputMethods: methods }));
    methods.push('type');
    expect(props.input_methods).toEqual(['voice']);
  });
});

describe('privacy: no dish text reaches a payload', () => {
  it('leaks nothing when the profile carries the raw fields alongside', () => {
    // profileFrequentCooks() really does return `enteredText` and
    // `enteredSlugs` — the literal dish names — next to the fields we want.
    // CookProfileInput doesn't declare them, but structural typing means they
    // arrive at runtime anyway, so this is the case that matters.
    const dishes = ["Mum's dal", 'Butter Chicken', 'Nonna lasagne'];
    const withRawText = {
      ...profile(),
      enteredText: dishes.join(' ').toLowerCase(),
      enteredSlugs: dishes.map((d) => d.toLowerCase().replace(/\s+/g, '-')),
      themeTokens: new Set(['dal', 'butter', 'chicken']),
      ingredientTokens: new Set(['lentil', 'chicken']),
    } as unknown as CookProfileInput;

    const serialised = JSON.stringify([
      deriveCookSignal(withRawText),
      buildOnboardingCompletedProps(completedInput({ profile: withRawText })),
    ]).toLowerCase();

    for (const token of ['dal', 'butter', 'chicken', 'lasagne', 'nonna', 'mum']) {
      expect(serialised).not.toContain(token);
    }
  });

  it('keeps persona payloads to counts and enums', () => {
    const props = buildPersonaUpdatedProps(
      persona({
        dietaryRestrictions: ['Vegetarian'],
        allergies: ['Peanuts', 'Shellfish'],
        cuisinePreferences: ['Indian', 'Thai', 'Italian'],
        weeklyBudget: 180,
      }),
      ['dietary_restrictions', 'allergies'],
      'edit_profile',
    );

    expect(props).toMatchObject({
      source: 'edit_profile',
      fields_changed: ['dietary_restrictions', 'allergies'],
      fields_changed_count: 2,
      diet_count: 1,
      allergy_count: 2,
      cuisine_count: 3,
      has_weekly_budget: true,
      has_monthly_budget: false,
    });
    // The selections themselves stay out, so the payload shape is uniform with
    // the rest of the module regardless of how the vocabularies grow.
    const serialised = JSON.stringify(props);
    expect(serialised).not.toContain('Vegetarian');
    expect(serialised).not.toContain('Peanuts');
    expect(serialised).not.toContain('180');
  });
});

describe('diffPersona', () => {
  it('reports nothing when the editor was opened and closed untouched', () => {
    expect(diffPersona(persona(), persona())).toEqual([]);
  });

  it('names each section that changed', () => {
    const changed = diffPersona(
      persona(),
      persona({
        allergies: ['Peanuts'],
        cookingSkillLevel: 'advanced',
        weeklyBudget: 200,
      }),
    );
    expect(changed.sort()).toEqual(['allergies', 'skill_level', 'weekly_budget']);
  });

  it('treats a reordered list as unchanged content but a resized one as changed', () => {
    expect(diffPersona(persona({ allergies: ['A'] }), persona({ allergies: ['A'] }))).toEqual(
      [],
    );
    expect(
      diffPersona(persona({ allergies: ['A'] }), persona({ allergies: ['A', 'B'] })),
    ).toEqual(['allergies']);
  });

  it('distinguishes a cleared budget from an unset one', () => {
    expect(diffPersona(persona({ weeklyBudget: 100 }), persona({ weeklyBudget: null })))
      .toEqual(['weekly_budget']);
  });
});

describe('step keys', () => {
  it('maps the two live steps and degrades for anything else', () => {
    expect(stepKeyForIndex(0)).toBe('your_cooking');
    expect(stepKeyForIndex(1)).toBe('for_you');
    // The previous funnel broke because it was keyed on display names that
    // stopped existing. An out-of-range index must not produce `undefined`.
    expect(stepKeyForIndex(4)).toBe('unknown');
  });
});

describe('Firebase isolation', () => {
  const behaviourEvents = [
    'onboarding_started',
    'onboarding_welcome_viewed',
    'onboarding_welcome_action',
    'onboarding_step_viewed',
    'onboarding_step_completed',
    'onboarding_step_back',
    'onboarding_abandoned',
    'onboarding_dish_capture_started',
    'onboarding_voice_permission_denied',
    'onboarding_voice_recording_stopped',
    'onboarding_voice_transcribe_succeeded',
    'onboarding_voice_transcribe_failed',
    'onboarding_dish_added',
    'onboarding_dish_removed',
    'onboarding_dish_renamed',
    'onboarding_taste_grid_viewed',
    'onboarding_taste_pick_toggled',
    'persona_updated',
  ];

  it.each(behaviourEvents)('%s stays out of Firebase', (event) => {
    expect(buildFirebaseAnalyticsCommand(event, { step_index: 0 })).toBeNull();
  });

  it('still converts onboarding_completed despite the rewritten payload', () => {
    // Firebase matches on the event NAME only, which is why replacing the
    // properties is safe for the Google Ads conversion.
    expect(
      buildFirebaseAnalyticsCommand(
        'onboarding_completed',
        buildOnboardingCompletedProps(completedInput()),
      ),
    ).toEqual({ name: 'onboarding_complete' });
  });
});
