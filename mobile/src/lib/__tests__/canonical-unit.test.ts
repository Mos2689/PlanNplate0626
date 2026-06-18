/**
 * Tests for canonical grocery-unit resolution.
 *
 * CONTRACT: every ingredient resolves to ONE canonical grocery unit by NAME,
 * independent of the unit a recipe used — so all variants merge in the
 * grocery list:
 *   • Liquids → 'ml'
 *   • Count produce (egg, onion, garlic, tomato, capsicum, …) → 'piece'
 *   • Everything else (rice, flour, oats, sugar, cheese, meat, spices) → 'g'
 */

import { getCanonicalUnit, convertToBaseUnit } from '../unit-conversion';
import { normalizeIngredientName } from '../ingredient-aliases';

describe('Canonical Unit Resolution', () => {
  describe('Count-based produce → piece', () => {
    it('resolves egg to piece', () => {
      expect(getCanonicalUnit('egg')).toBe('piece');
      expect(getCanonicalUnit('eggs')).toBe('piece');
      expect(getCanonicalUnit('large egg')).toBe('piece');
    });

    it('resolves onion / capsicum / zucchini / carrot to piece', () => {
      expect(getCanonicalUnit('onion')).toBe('piece');
      expect(getCanonicalUnit('red onion')).toBe('piece');
      expect(getCanonicalUnit('bell pepper')).toBe('piece');
      expect(getCanonicalUnit('zucchini')).toBe('piece');
      expect(getCanonicalUnit('carrot')).toBe('piece');
    });
  });

  describe('Grains / dry solids → g (NOT cups — this is the dedup fix)', () => {
    it('resolves rice / flour / oats to g', () => {
      expect(getCanonicalUnit('rice')).toBe('g');
      expect(getCanonicalUnit('white rice')).toBe('g');
      expect(getCanonicalUnit('flour')).toBe('g');
      expect(getCanonicalUnit('all-purpose flour')).toBe('g');
      expect(getCanonicalUnit('oats')).toBe('g');
    });

    it('resolves non-grain solids (olives, feta) to g', () => {
      expect(getCanonicalUnit('olives')).toBe('g');
      expect(getCanonicalUnit('kalamata olives')).toBe('g');
      expect(getCanonicalUnit('feta cheese')).toBe('g');
    });

    it('resolves spices to g', () => {
      expect(getCanonicalUnit('salt')).toBe('g');
      expect(getCanonicalUnit('pepper')).toBe('piece'); // "pepper" = capsicum (count)
      expect(getCanonicalUnit('black pepper')).toBe('g');
    });
  });

  describe('Liquids → ml', () => {
    it('resolves water / milk / oil / broth / juice to ml', () => {
      expect(getCanonicalUnit('water')).toBe('ml');
      expect(getCanonicalUnit('milk')).toBe('ml');
      expect(getCanonicalUnit('olive oil')).toBe('ml');
      expect(getCanonicalUnit('chicken broth')).toBe('ml');
      expect(getCanonicalUnit('lemon juice')).toBe('ml');
    });
  });

  describe('Weight-based proteins / unknowns → g', () => {
    it('resolves meat to g', () => {
      expect(getCanonicalUnit('chicken')).toBe('g');
      expect(getCanonicalUnit('beef')).toBe('g');
    });

    it('resolves unknown ingredient to g (default)', () => {
      expect(getCanonicalUnit('some random ingredient')).toBe('g');
    });
  });
});

describe('Aggregation keys with canonical units', () => {
  it('rice in cups and rice in grams produce the SAME grocery key', () => {
    // Both resolve to base unit 'g' → same key → they merge.
    const a = convertToBaseUnit(2, 'cup', 'rice');
    const b = convertToBaseUnit(450, 'g', 'rice');
    expect(a.unit).toBe('g');
    expect(b.unit).toBe('g');
    const norm = normalizeIngredientName('rice');
    expect(`${norm}-${a.unit}-pantry`).toBe(`${norm}-${b.unit}-pantry`);
  });

  it('egg in pieces and egg given in grams both key on piece via canonical unit', () => {
    expect(getCanonicalUnit('egg')).toBe('piece');
    // convertToBaseUnit converts grams of a count item to pieces via avg weight.
    const fromGrams = convertToBaseUnit(100, 'g', 'egg'); // ~50 g/egg → ~2 pieces
    expect(fromGrams.unit).toBe('piece');
    expect(fromGrams.quantity).toBeCloseTo(2, 0);
  });

  it('onion in pieces and onion in grams share canonical piece unit', () => {
    expect(getCanonicalUnit('onion')).toBe('piece');
    const fromGrams = convertToBaseUnit(150, 'g', 'onion'); // ~150 g/onion → ~1
    expect(fromGrams.unit).toBe('piece');
  });

  it('oil in cups and tbsp aggregate in ml', () => {
    const a = convertToBaseUnit(2, 'cup', 'olive oil');  // 480
    const b = convertToBaseUnit(2, 'tbsp', 'olive oil'); // 30
    expect(a.unit).toBe('ml');
    expect(b.unit).toBe('ml');
    expect(a.quantity + b.quantity).toBe(510);
  });
});
