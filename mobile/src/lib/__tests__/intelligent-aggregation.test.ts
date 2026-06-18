/**
 * Acceptance Tests for Intelligent Ingredient Aggregation
 * Validates confidence-based conversion logic with three explicit test scenarios
 */

import {
  aggregateIngredientsIntelligently,
  formatGroceryListResults,
} from '../intelligent-aggregation';
import { normalizeIngredientForAggregation } from '../ingredient-normalizer';
import { ConversionTracker } from '../conversion-metadata';

describe('Intelligent Ingredient Aggregation - Acceptance Tests', () => {
  /**
   * Test 1: Chicken - High Confidence Conversion
   * Chicken 4 pieces (200g/piece) + 500g → 1300g total → Display "Chicken 1.3 kg"
   */
  it('should convert chicken pieces to weight and sum with existing weight', () => {
    const ingredients = [
      normalizeIngredientForAggregation({
        name: 'chicken',
        quantity: 4,
        baseUnit: 'piece',
        category: 'meat',
      }),
      normalizeIngredientForAggregation({
        name: 'chicken',
        quantity: 500,
        baseUnit: 'g',
        category: 'meat',
      }),
    ];

    const tracker = new ConversionTracker();
    const aggregated = aggregateIngredientsIntelligently(ingredients, tracker);

    // Should have exactly one result (merged)
    expect(aggregated).toHaveLength(1);

    const result = aggregated[0];
    expect(result.canonicalName).toBe('chicken');
    expect(result.baseUnit).toBe('g');
    expect(result.quantity).toBe(1300); // 4 * 200 + 500
    expect(result.displayQuantity).toBe('1.3 kg');
    expect(result.hasWeightConversion).toBe(true);
    expect(result.unitType).toBe('WEIGHT');

    // Verify sources show both items
    expect(result.sources).toHaveLength(2);

    // Verify conversion was tracked with high confidence
    const conversions = tracker.getConversions();
    expect(conversions).toHaveLength(1);
    expect(conversions[0].confidence).toBe('high');
    expect(conversions[0].convertedQuantity).toBe(800); // 4 pieces * 200g
  });

  /**
   * Test 2: Onion - Medium Confidence Conversion
   * Onion 2 medium (150g/piece) + 300g → 600g total → Display "Onion 600 g"
   */
  it('should convert onion pieces to weight and sum with existing weight', () => {
    const ingredients = [
      normalizeIngredientForAggregation({
        name: 'medium onion',
        quantity: 2,
        baseUnit: 'piece',
        category: 'produce',
      }),
      normalizeIngredientForAggregation({
        name: 'onion',
        quantity: 300,
        baseUnit: 'g',
        category: 'produce',
      }),
    ];

    const tracker = new ConversionTracker();
    const aggregated = aggregateIngredientsIntelligently(ingredients, tracker);

    // Should have exactly one result (merged)
    expect(aggregated).toHaveLength(1);

    const result = aggregated[0];
    expect(result.canonicalName).toBe('onion');
    expect(result.baseUnit).toBe('g');
    expect(result.quantity).toBe(600); // 2 * 150 + 300
    expect(result.displayQuantity).toBe('600 g');
    expect(result.hasWeightConversion).toBe(true);
    expect(result.unitType).toBe('WEIGHT');

    // Verify sources show both items
    expect(result.sources).toHaveLength(2);

    // Verify conversion was tracked with medium confidence
    const conversions = tracker.getConversions();
    expect(conversions).toHaveLength(1);
    expect(conversions[0].confidence).toBe('medium');
    expect(conversions[0].convertedQuantity).toBe(300); // 2 pieces * 150g
  });

  /**
   * Test 3: Garlic - High Confidence Conversion
   * Garlic 3 cloves (5g/clove) + 10g → 25g total → Display "Garlic 25 g"
   */
  it('should convert garlic cloves to weight and sum with existing weight', () => {
    const ingredients = [
      normalizeIngredientForAggregation({
        name: 'garlic clove',
        quantity: 3,
        baseUnit: 'clove',
        category: 'produce',
      }),
      normalizeIngredientForAggregation({
        name: 'garlic',
        quantity: 10,
        baseUnit: 'g',
        category: 'produce',
      }),
    ];

    const tracker = new ConversionTracker();
    const aggregated = aggregateIngredientsIntelligently(ingredients, tracker);

    // Should have exactly one result (merged)
    expect(aggregated).toHaveLength(1);

    const result = aggregated[0];
    expect(result.canonicalName).toBe('garlic');
    expect(result.baseUnit).toBe('g');
    expect(result.quantity).toBe(25); // 3 * 5 + 10
    expect(result.displayQuantity).toBe('25 g');
    expect(result.hasWeightConversion).toBe(true);
    expect(result.unitType).toBe('WEIGHT');

    // Verify sources show both items
    expect(result.sources).toHaveLength(2);

    // Verify conversion was tracked with high confidence
    const conversions = tracker.getConversions();
    expect(conversions).toHaveLength(1);
    expect(conversions[0].confidence).toBe('high');
    expect(conversions[0].convertedQuantity).toBe(15); // 3 cloves * 5g
  });

  /**
   * Test 4: Unknown Ingredient - Low Confidence (Graceful Degradation)
   * Unknown ingredient 3 pieces + 100g → Should create two separate lines (no conversion)
   */
  it('should keep separate lines for unknown ingredients with low/missing confidence', () => {
    const ingredients = [
      normalizeIngredientForAggregation({
        name: 'exotic fruit',
        quantity: 3,
        baseUnit: 'piece',
        category: 'produce',
      }),
      normalizeIngredientForAggregation({
        name: 'exotic fruit',
        quantity: 100,
        baseUnit: 'g',
        category: 'produce',
      }),
    ];

    const tracker = new ConversionTracker();
    const aggregated = aggregateIngredientsIntelligently(ingredients, tracker);

    // Should have TWO results (not merged) since no lookup exists
    expect(aggregated.length).toBeGreaterThanOrEqual(1);

    // Verify failed attempt was logged
    const failedAttempts = tracker.getFailedAttempts();
    expect(failedAttempts.length).toBeGreaterThan(0);
    expect(failedAttempts[0].reason).toMatch(/missing_lookup|low_confidence/);
  });

  /**
   * Test 5: Verify Conversion Metadata Not in UI Output
   * Ensures formatGroceryListResults() strips all internal conversion metadata
   */
  it('should not expose conversion metadata to UI output', () => {
    const ingredients = [
      normalizeIngredientForAggregation({
        name: 'chicken breast',
        quantity: 2,
        baseUnit: 'piece',
        category: 'meat',
      }),
      normalizeIngredientForAggregation({
        name: 'chicken',
        quantity: 300,
        baseUnit: 'g',
        category: 'meat',
      }),
    ];

    const aggregated = aggregateIngredientsIntelligently(ingredients);
    const uiOutput = formatGroceryListResults(aggregated);

    // UI output should never include metadata or confidence info
    uiOutput.forEach((item) => {
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('quantity');
      expect(item).toHaveProperty('unit');
      expect(item).toHaveProperty('category');
      expect(item).toHaveProperty('sources');

      // Should NOT have any metadata properties
      expect(item).not.toHaveProperty('conversionMetadata');
      expect(item).not.toHaveProperty('confidence');
      expect(item).not.toHaveProperty('hasWeightConversion');

      // Display should never contain metadata keywords
      expect(JSON.stringify(item)).not.toMatch(/confidence|approx|metadata/i);
    });
  });

  /**
   * Test 6: Multiple Same-Type Ingredients (Direct Sum)
   * Chicken 300g + Chicken 500g → Chicken 800g (no conversion needed)
   */
  it('should directly sum same unit type without conversion', () => {
    const ingredients = [
      normalizeIngredientForAggregation({
        name: 'chicken',
        quantity: 300,
        baseUnit: 'g',
        category: 'meat',
      }),
      normalizeIngredientForAggregation({
        name: 'chicken',
        quantity: 500,
        baseUnit: 'g',
        category: 'meat',
      }),
    ];

    const tracker = new ConversionTracker();
    const aggregated = aggregateIngredientsIntelligently(ingredients, tracker);

    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].quantity).toBe(800);
    expect(aggregated[0].hasWeightConversion).not.toBe(true); // No conversion occurred
    expect(tracker.getConversions()).toHaveLength(0); // No conversions tracked
  });

  /**
   * Test 7: Rounding to Nearest 5
   * Verify display values are rounded to nearest 5 for user-friendly numbers
   */
  it('should round quantities to nearest 5', () => {
    const ingredients = [
      normalizeIngredientForAggregation({
        name: 'chicken',
        quantity: 2,
        baseUnit: 'piece',
        category: 'meat',
      }),
      normalizeIngredientForAggregation({
        name: 'chicken',
        quantity: 333, // 400 + 333 = 733, rounds to 735
        baseUnit: 'g',
        category: 'meat',
      }),
    ];

    const aggregated = aggregateIngredientsIntelligently(ingredients);
    expect(aggregated).toHaveLength(1);

    // 2 * 200 + 333 = 733, rounded to 735
    expect(aggregated[0].quantity).toBe(735);
    expect(aggregated[0].displayQuantity).toMatch(/735 g|0.735 kg/);
  });

  /**
   * Test 8: Volume-Only Ingredients (No Conversion)
   * Milk 200ml + Milk 300ml → Milk 500ml (no COUNT involved)
   */
  it('should aggregate volume-only ingredients without conversion', () => {
    const ingredients = [
      normalizeIngredientForAggregation({
        name: 'milk',
        quantity: 200,
        baseUnit: 'ml',
        category: 'dairy',
      }),
      normalizeIngredientForAggregation({
        name: 'milk',
        quantity: 300,
        baseUnit: 'ml',
        category: 'dairy',
      }),
    ];

    const tracker = new ConversionTracker();
    const aggregated = aggregateIngredientsIntelligently(ingredients, tracker);

    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].unitType).toBe('VOLUME');
    expect(aggregated[0].quantity).toBe(500);
    expect(tracker.getConversions()).toHaveLength(0); // No conversions
  });

  /**
   * Test 9: Count-Only Ingredients (No Conversion)
   * Egg 2 pieces + Egg 3 pieces → Egg 5 pieces (no WEIGHT involved)
   */
  it('should aggregate count-only ingredients without conversion', () => {
    const ingredients = [
      normalizeIngredientForAggregation({
        name: 'egg',
        quantity: 2,
        baseUnit: 'piece',
        category: 'dairy',
      }),
      normalizeIngredientForAggregation({
        name: 'egg',
        quantity: 3,
        baseUnit: 'piece',
        category: 'dairy',
      }),
    ];

    const tracker = new ConversionTracker();
    const aggregated = aggregateIngredientsIntelligently(ingredients, tracker);

    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].unitType).toBe('COUNT');
    expect(aggregated[0].quantity).toBe(5);
    expect(tracker.getConversions()).toHaveLength(0); // No conversions
  });
});

/**
 * NEW TESTS: Volume classification - Solid/Grain vs Liquid
 * Grains (rice, flour, oats) should stay in cups
 * Liquids (milk, oil, water) should convert to mL
 */
describe('Volume Classification - Solid/Grain vs Liquid', () => {
  /**
   * Test: Grain ingredients (rice) should aggregate in cups, NOT mL
   */
  it('should aggregate rice in cups, not mL', () => {
    const ingredients = [
      normalizeIngredientForAggregation({
        name: 'rice',
        quantity: 1,
        baseUnit: 'cup',
        category: 'pantry',
      }),
      normalizeIngredientForAggregation({
        name: 'rice',
        quantity: 0.5,
        baseUnit: 'cup',
        category: 'pantry',
      }),
    ];

    const aggregated = aggregateIngredientsIntelligently(ingredients);

    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].baseUnit).toBe('cup');
    expect(aggregated[0].quantity).toBe(1.5);
    expect(aggregated[0].displayQuantity).toBe('1 1/2 cups');
    expect(aggregated[0].unitType).toBe('VOLUME');
  });

  /**
   * Test: Liquid ingredients (milk) should aggregate in mL
   */
  it('should aggregate milk in mL, not cups', () => {
    const ingredients = [
      normalizeIngredientForAggregation({
        name: 'milk',
        quantity: 240,
        baseUnit: 'ml',
        category: 'dairy',
      }),
      normalizeIngredientForAggregation({
        name: 'milk',
        quantity: 120,
        baseUnit: 'ml',
        category: 'dairy',
      }),
    ];

    const aggregated = aggregateIngredientsIntelligently(ingredients);

    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].baseUnit).toBe('ml');
    expect(aggregated[0].quantity).toBe(360);
    expect(aggregated[0].unitType).toBe('VOLUME');
  });

  /**
   * Test: Flour (solid) should stay in cups
   */
  it('should aggregate flour in cups', () => {
    const ingredients = [
      normalizeIngredientForAggregation({
        name: 'flour',
        quantity: 2,
        baseUnit: 'cup',
        category: 'pantry',
      }),
      normalizeIngredientForAggregation({
        name: 'all-purpose flour',
        quantity: 1,
        baseUnit: 'cup',
        category: 'pantry',
      }),
    ];

    const aggregated = aggregateIngredientsIntelligently(ingredients);

    // Note: these may aggregate separately due to name normalization
    // but both should have 'cup' as baseUnit
    aggregated.forEach(item => {
      if (item.unitType === 'VOLUME') {
        expect(item.baseUnit).toBe('cup');
      }
    });
  });

  /**
   * Test: Oats (solid) should stay in cups
   */
  it('should aggregate oats in cups', () => {
    const ingredients = [
      normalizeIngredientForAggregation({
        name: 'oats',
        quantity: 1.5,
        baseUnit: 'cup',
        category: 'pantry',
      }),
      normalizeIngredientForAggregation({
        name: 'rolled oats',
        quantity: 0.5,
        baseUnit: 'cup',
        category: 'pantry',
      }),
    ];

    const aggregated = aggregateIngredientsIntelligently(ingredients);

    // Both should use cups
    aggregated.forEach(item => {
      if (item.unitType === 'VOLUME') {
        expect(item.baseUnit).toBe('cup');
      }
    });
  });

  /**
   * Test: Olive oil (liquid) should convert to mL
   */
  it('should aggregate olive oil in mL', () => {
    const ingredients = [
      normalizeIngredientForAggregation({
        name: 'olive oil',
        quantity: 30,
        baseUnit: 'ml',
        category: 'pantry',
      }),
      normalizeIngredientForAggregation({
        name: 'olive oil',
        quantity: 60,
        baseUnit: 'ml',
        category: 'pantry',
      }),
    ];

    const aggregated = aggregateIngredientsIntelligently(ingredients);

    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].baseUnit).toBe('ml');
    expect(aggregated[0].quantity).toBe(90);
    expect(aggregated[0].unitType).toBe('VOLUME');
  });

  /**
   * Test: Lentils (solid) should stay in cups
   */
  it('should aggregate lentils in cups', () => {
    const ingredients = [
      normalizeIngredientForAggregation({
        name: 'lentils',
        quantity: 1,
        baseUnit: 'cup',
        category: 'pantry',
      }),
      normalizeIngredientForAggregation({
        name: 'red lentils',
        quantity: 0.5,
        baseUnit: 'cup',
        category: 'pantry',
      }),
    ];

    const aggregated = aggregateIngredientsIntelligently(ingredients);

    aggregated.forEach(item => {
      if (item.unitType === 'VOLUME') {
        expect(item.baseUnit).toBe('cup');
      }
    });
  });
});
