/**
 * Tests for duplicate detection — descriptor-only differences should group,
 * but distinct varieties sharing only a head noun should NOT.
 */

import { areDuplicateIngredients, findDuplicateIngredientGroups } from '../duplicate-ingredient-finder';

describe('areDuplicateIngredients', () => {
  it('groups prep-descriptor-only variants', () => {
    expect(areDuplicateIngredients('Paneer, Cubed', 'Paneer')).toBe(true);
    expect(areDuplicateIngredients('chopped onion', 'onion')).toBe(true);
    expect(areDuplicateIngredients('ground cumin', 'cumin')).toBe(true);
    expect(areDuplicateIngredients('cumin seed', 'cumin')).toBe(true);
  });

  it('groups plural / singular variants', () => {
    expect(areDuplicateIngredients('tomato', 'tomatoes')).toBe(true);
  });

  it('does NOT group distinct varieties that share only a head noun', () => {
    expect(areDuplicateIngredients('Snow Pea', 'Frozen Pea')).toBe(false);
    expect(areDuplicateIngredients('green chili', 'red chili')).toBe(false);
    expect(areDuplicateIngredients('sweet potato', 'potato')).toBe(false);
  });

  it('exact names always match', () => {
    expect(areDuplicateIngredients('rice', 'rice')).toBe(true);
  });
});

describe('findDuplicateIngredientGroups', () => {
  it('returns paneer group but not a pea group', () => {
    const items = [
      { id: '1', name: 'Paneer, Cubed', quantity: '200 g', unit: '' },
      { id: '2', name: 'Paneer', quantity: '600 g', unit: '' },
      { id: '3', name: 'Snow Pea', quantity: '200 g', unit: '' },
      { id: '4', name: 'Frozen Pea', quantity: '1 cup', unit: '' },
    ];
    const groups = findDuplicateIngredientGroups(items);
    // Exactly one group (paneer); peas stay separate.
    expect(groups.length).toBe(1);
    expect(groups[0].ingredientIds.sort()).toEqual(['1', '2']);
  });
});
