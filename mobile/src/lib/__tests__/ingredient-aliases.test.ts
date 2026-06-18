import {
  normalizeIngredientName,
  shouldCombineIngredients,
} from '../ingredient-aliases';

describe('normalizeIngredientName - descriptor stripping + alias resolution', () => {
  it('strips prep descriptors so "cooked day-old jasmine rice" normalizes to "rice"', () => {
    // The grocery-list duplication repro: this ingredient must collapse to the
    // same canonical key as a plain "rice" ingredient.
    expect(normalizeIngredientName('Cooked Day-old Jasmine Rice')).toBe('rice');
    expect(normalizeIngredientName('rice')).toBe('rice');
    expect(normalizeIngredientName('Cooked Day-old Jasmine Rice')).toBe(
      normalizeIngredientName('Rice'),
    );
  });

  it('resolves a plain variety alias to its canonical base ("jasmine rice" -> "rice")', () => {
    expect(normalizeIngredientName('jasmine rice')).toBe('rice');
    expect(normalizeIngredientName('basmati rice')).toBe('rice');
    expect(normalizeIngredientName('brown rice')).toBe('rice');
  });

  it('does NOT over-merge genuinely distinct varieties', () => {
    // "sweet" is not a prep descriptor, so sweet potato must stay distinct from potato.
    expect(normalizeIngredientName('sweet potato')).toBe('sweet potato');
    expect(normalizeIngredientName('sweet potato')).not.toBe(
      normalizeIngredientName('potato'),
    );

    // "snow" is not a prep descriptor; "frozen" is. snow pea must stay distinct
    // from a frozen pea (which strips down to "pea").
    expect(normalizeIngredientName('snow pea')).toBe('snow pea');
    expect(normalizeIngredientName('snow pea')).not.toBe(
      normalizeIngredientName('frozen pea'),
    );
  });

  it('still resolves existing whole-string aliases', () => {
    expect(normalizeIngredientName('extra virgin olive oil')).toBe('olive oil');
    expect(normalizeIngredientName('greek yogurt')).toBe('yogurt');
    expect(normalizeIngredientName('ground black pepper')).toBe('black pepper');
  });

  it('still singularizes unknown ingredients', () => {
    expect(normalizeIngredientName('bananas')).toBe('banana');
  });

  it('does not crash or empty out on a descriptor-only name', () => {
    // "cooked" alone has nothing left after stripping; fall back to the original.
    expect(normalizeIngredientName('cooked')).toBe('cooked');
  });
});

describe('shouldCombineIngredients - merges descriptor-laden duplicates', () => {
  it('merges "Cooked Day-old Jasmine Rice" with "Rice" when unit/category match', () => {
    expect(
      shouldCombineIngredients(
        'Cooked Day-old Jasmine Rice',
        'Rice',
        'g',
        'g',
        'pantry',
        'pantry',
      ),
    ).toBe(true);
  });

  it('does not merge sweet potato with potato', () => {
    expect(
      shouldCombineIngredients(
        'sweet potato',
        'potato',
        'g',
        'g',
        'produce',
        'produce',
      ),
    ).toBe(false);
  });
});
