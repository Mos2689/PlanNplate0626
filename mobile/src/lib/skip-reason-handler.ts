// Maps a user's skip reason (captured on CookConfirmSheet) into
// downstream effects: a hint for the generator and, when relevant,
// a list of ingredients to surface at the top of the next grocery
// list. The reasons themselves are defined in store.ts as
// SkipReason; keep this file's switch in sync.

import type { Ingredient, SkipReason } from './store';

export interface SkipReasonEffect {
  // Natural-language hint appended to future recipe-generation
  // prompts. Empty string means no hint.
  generationHint: string;
  // 1–5 scale. <=2 means keep it simple/quick; >=4 means user has
  // bandwidth for more elaborate cooking. 3 is neutral / no signal.
  planIntensity: number;
  // Ingredients to bubble to the top of the next grocery list.
  // Populated for missing_ingredients only.
  priorityIngredients?: string[];
}

export function getSkipReasonEffect(
  reason: SkipReason,
  _recipeName?: string,
  ingredients?: Ingredient[],
): SkipReasonEffect {
  switch (reason) {
    case 'missing_ingredients':
      return {
        generationHint:
          'The user recently skipped a meal because they were missing ingredients — favor recipes that use common pantry staples and overlap with ingredients from other planned meals.',
        planIntensity: 3,
        priorityIngredients: (ingredients ?? []).map((i) => i.name),
      };
    case 'no_time':
      return {
        generationHint:
          'The user recently skipped a meal due to time pressure — favor quick recipes that take 15–25 minutes total.',
        planIntensity: 2,
      };
    case 'takeout':
      return {
        generationHint:
          'The user recently chose takeout instead of cooking — suggest easy, satisfying "better than takeout" recipes that beat ordering out on time and cost.',
        planIntensity: 2,
      };
    case 'didnt_feel_like':
      return {
        generationHint:
          'The user recently skipped a meal because they didn\'t feel like cooking it — increase variety and lean into novel, energizing dishes.',
        planIntensity: 3,
      };
    case 'leftovers':
      return {
        generationHint:
          'The user often uses leftovers for the next meal — keep planning a dinner→next-day-lunch leftovers pattern where possible.',
        planIntensity: 3,
      };
    default:
      return { generationHint: '', planIntensity: 3 };
  }
}
