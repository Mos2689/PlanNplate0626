// The rule that keeps onboarding dishes photo-free.
//
// `keepsPlaceholderImage` is consulted from four places that can each write an
// automatically-sourced photo onto an EXISTING recipe row (two meal-plan image
// jobs, addRecipe's backfill, and the vibe-cooking save). They all reach those
// rows through `addRecipe`, which upserts — so a dish the user named during
// onboarding can surface again days later with a different id path and get a
// stock photo bolted on. These cases pin the rule those guards depend on.

import {
  FREQUENT_COOK_TAG,
  isDefaultRecipeImage,
  keepsPlaceholderImage,
} from '../recipe-image';

describe('keepsPlaceholderImage', () => {
  it('holds for a dish captured during onboarding', () => {
    expect(keepsPlaceholderImage({ tags: ['dinner', FREQUENT_COOK_TAG] })).toBe(true);
  });

  it('does not hold for an ordinary recipe', () => {
    expect(keepsPlaceholderImage({ tags: ['dinner', 'quick'] })).toBe(false);
  });

  it('tolerates the tag arriving in a different case', () => {
    // Tags are round-tripped through Supabase and edited by hand in places;
    // a case difference must not silently re-enable stock photos.
    expect(keepsPlaceholderImage({ tags: ['Frequent-Cook'] })).toBe(true);
  });

  it('treats missing, empty and null tag lists as opt-out', () => {
    expect(keepsPlaceholderImage({})).toBe(false);
    expect(keepsPlaceholderImage({ tags: [] })).toBe(false);
    expect(keepsPlaceholderImage({ tags: null })).toBe(false);
  });
});

describe('isDefaultRecipeImage', () => {
  it('reports the empty image an onboarding dish is saved with', () => {
    // buildFrequentCookRecipes writes '' deliberately; DishImage reads this to
    // decide between the branded placeholder and a network fetch.
    expect(isDefaultRecipeImage('')).toBe(true);
    expect(isDefaultRecipeImage('   ')).toBe(true);
    expect(isDefaultRecipeImage(undefined)).toBe(true);
  });

  it('does not mistake a real photo for the placeholder', () => {
    expect(isDefaultRecipeImage('https://images.pexels.com/photos/1234/food.jpeg')).toBe(false);
  });
});
