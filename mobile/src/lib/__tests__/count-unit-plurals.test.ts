/**
 * Quick test to verify piece → pieces pluralization
 */

import { formatFromBaseUnit } from '../unit-conversion';

describe('Plural Display for Count Units', () => {
  it('should display singular form for 1 piece', () => {
    expect(formatFromBaseUnit(1, 'piece')).toBe('1');
  });

  it('should display plural "pieces" for multiple pieces', () => {
    expect(formatFromBaseUnit(2, 'piece')).toBe('2 pieces');
    expect(formatFromBaseUnit(3, 'piece')).toBe('3 pieces');
    expect(formatFromBaseUnit(10, 'piece')).toBe('10 pieces');
  });

  it('should handle other count units properly', () => {
    expect(formatFromBaseUnit(1, 'clove')).toBe('1 clove');
    expect(formatFromBaseUnit(2, 'clove')).toBe('2 cloves');

    expect(formatFromBaseUnit(1, 'can')).toBe('1 can');
    expect(formatFromBaseUnit(2, 'can')).toBe('2 cans');

    expect(formatFromBaseUnit(1, 'stalk')).toBe('1 stalk');
    expect(formatFromBaseUnit(2, 'stalk')).toBe('2 stalks');
  });

  it('should preserve already-plural units', () => {
    expect(formatFromBaseUnit(2, 'pieces')).toBe('2 pieces');
    expect(formatFromBaseUnit(2, 'cloves')).toBe('2 cloves');
    expect(formatFromBaseUnit(2, 'cans')).toBe('2 cans');
  });
});
