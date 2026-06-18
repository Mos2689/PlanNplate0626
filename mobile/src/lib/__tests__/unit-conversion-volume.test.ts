/**
 * Unit Tests for canonical grocery-unit conversion.
 *
 * CONTRACT (post canonicalization):
 * - Every ingredient resolves to ONE canonical grocery family by NAME:
 *     • Liquids (milk, oil, water, broth, juice, sauces) → mL
 *     • Count produce (onion, garlic, tomato, capsicum, …) → piece
 *     • Everything else (rice, flour, oats, sugar, cheese, meat, spices) → g
 * - Solids given in cups convert to grams via a density table so that
 *   "2 cups rice" and "450 g rice" merge into ONE grocery line.
 *
 * getVolumeType() is retained for legacy liquid/solid detection and its
 * behaviour is unchanged; formatFromBaseUnit() still renders cups when given a
 * cup base unit (used elsewhere), so those blocks are kept intact.
 */

import {
  convertToBaseUnit,
  formatFromBaseUnit,
  getVolumeType,
} from '../unit-conversion';

describe('getVolumeType - legacy liquid/solid detection (unchanged)', () => {
  it('classifies grains/dry goods as solid', () => {
    expect(getVolumeType('rice')).toBe('solid');
    expect(getVolumeType('flour')).toBe('solid');
    expect(getVolumeType('oats')).toBe('solid');
    expect(getVolumeType('lentils')).toBe('solid');
    expect(getVolumeType('pasta')).toBe('solid');
    expect(getVolumeType('sugar')).toBe('solid');
    expect(getVolumeType('quinoa')).toBe('solid');
  });

  it('classifies pourable liquids as liquid', () => {
    expect(getVolumeType('milk')).toBe('liquid');
    expect(getVolumeType('olive oil')).toBe('liquid');
    expect(getVolumeType('water')).toBe('liquid');
    expect(getVolumeType('chicken broth')).toBe('liquid');
    expect(getVolumeType('lemon juice')).toBe('liquid');
    expect(getVolumeType('soy sauce')).toBe('liquid');
    expect(getVolumeType('honey')).toBe('liquid');
  });
});

describe('convertToBaseUnit - canonical grocery families', () => {
  describe('Solids/grains canonicalize to grams (via density)', () => {
    it('converts rice cups → grams (185 g/cup)', () => {
      const r = convertToBaseUnit(2, 'cup', 'rice');
      expect(r.unit).toBe('g');
      expect(r.quantity).toBeCloseTo(370, 0);
    });

    it('converts rice tbsp → grams', () => {
      const r = convertToBaseUnit(4, 'tbsp', 'rice'); // 60 mL = 0.25 cup → 46.25 g
      expect(r.unit).toBe('g');
      expect(r.quantity).toBeCloseTo(46.25, 1);
    });

    it('keeps rice grams as grams (so cup-rice and gram-rice MERGE)', () => {
      const r = convertToBaseUnit(450, 'g', 'rice');
      expect(r.unit).toBe('g');
      expect(r.quantity).toBe(450);
    });

    it('converts flour / oats / lentils cups → grams', () => {
      expect(convertToBaseUnit(1.5, 'cup', 'flour').unit).toBe('g');
      expect(convertToBaseUnit(1.5, 'cup', 'flour').quantity).toBeCloseTo(180, 0);
      expect(convertToBaseUnit(1, 'cup', 'oats').quantity).toBeCloseTo(90, 0);
      expect(convertToBaseUnit(2, 'cups', 'lentils').quantity).toBeCloseTo(380, 0);
    });
  });

  describe('Liquids canonicalize to mL', () => {
    it('converts milk cups → mL', () => {
      const r = convertToBaseUnit(1, 'cup', 'milk');
      expect(r.unit).toBe('ml');
      expect(r.quantity).toBe(240);
    });

    it('converts oil tbsp → mL', () => {
      const r = convertToBaseUnit(2, 'tbsp', 'olive oil');
      expect(r.unit).toBe('ml');
      expect(r.quantity).toBe(30);
    });

    it('converts water cups → mL and keeps broth mL', () => {
      expect(convertToBaseUnit(2, 'cup', 'water').quantity).toBe(480);
      expect(convertToBaseUnit(500, 'ml', 'chicken broth').quantity).toBe(500);
    });
  });

  describe('Count produce canonicalizes to pieces', () => {
    it('keeps whole-count produce as pieces', () => {
      expect(convertToBaseUnit(1, 'piece', 'onion').unit).toBe('piece');
      expect(convertToBaseUnit(2, 'piece', 'zucchini').unit).toBe('piece');
      expect(convertToBaseUnit(3, 'piece', 'carrot').unit).toBe('piece');
    });

    it('resolves capsicum/bell pepper to pieces regardless of supplied unit', () => {
      expect(convertToBaseUnit(1, 'cup', 'bell pepper').unit).toBe('piece');
      expect(convertToBaseUnit(0.5, 'cup', 'chopped onion').unit).toBe('piece');
    });

    it('resolves canned count produce to pieces', () => {
      expect(convertToBaseUnit(1, 'can', 'tomato').unit).toBe('piece');
      expect(convertToBaseUnit(2, 'cans', 'diced tomato').unit).toBe('piece');
    });
  });

  describe('Non-grain solids and unknowns canonicalize to grams', () => {
    it('resolves olives / feta / capers / berries to grams', () => {
      expect(convertToBaseUnit(1, 'cup', 'kalamata olives').unit).toBe('g');
      expect(convertToBaseUnit(1, 'cup', 'feta cheese').unit).toBe('g');
      expect(convertToBaseUnit(0.25, 'cup', 'capers').unit).toBe('g');
      expect(convertToBaseUnit(2, 'cup', 'mixed berries').unit).toBe('g');
    });

    it('resolves unknown ingredient given in cups to grams (generic density)', () => {
      const r = convertToBaseUnit(1, 'cup', 'some random ingredient');
      expect(r.unit).toBe('g');
      expect(r.quantity).toBeCloseTo(150, 0);
    });
  });
});

describe('Aggregation scenario - same ingredient, mixed units, now MERGES', () => {
  it('rice in cups + rice in grams share base unit g and sum', () => {
    const a = convertToBaseUnit(2, 'cup', 'rice');   // 370 g
    const b = convertToBaseUnit(450, 'g', 'rice');   // 450 g
    expect(a.unit).toBe('g');
    expect(b.unit).toBe('g');
    expect(a.quantity + b.quantity).toBeCloseTo(820, 0);
  });

  it('milk in cups + milk in mL share base unit ml and sum', () => {
    const a = convertToBaseUnit(1, 'cup', 'milk');   // 240 ml
    const b = convertToBaseUnit(100, 'ml', 'milk');  // 100 ml
    expect(a.unit).toBe('ml');
    expect(b.unit).toBe('ml');
    expect(a.quantity + b.quantity).toBe(340);
  });

  it('olive oil tbsp + cup aggregate in mL', () => {
    const a = convertToBaseUnit(2, 'tbsp', 'olive oil');  // 30
    const b = convertToBaseUnit(0.25, 'cup', 'olive oil'); // 60
    expect(a.quantity + b.quantity).toBe(90);
  });
});

describe('formatFromBaseUnit - display formatting (unchanged)', () => {
  it('formats grams / kg', () => {
    expect(formatFromBaseUnit(370, 'g')).toBe('370 g');
    expect(formatFromBaseUnit(1000, 'g')).toBe('1 kg');
  });

  it('formats mL / L', () => {
    expect(formatFromBaseUnit(240, 'ml')).toBe('240 mL');
    expect(formatFromBaseUnit(1000, 'ml')).toBe('1 L');
    expect(formatFromBaseUnit(1500, 'ml')).toBe('1.5 L');
  });

  it('still renders cups when explicitly given a cup base unit', () => {
    expect(formatFromBaseUnit(1, 'cup')).toBe('1 cup');
    expect(formatFromBaseUnit(0.5, 'cup')).toBe('1/2 cup');
    expect(formatFromBaseUnit(2, 'cup')).toBe('2 cups');
  });
});
