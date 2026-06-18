/**
 * Ingredient aggregation helpers
 * Combines the conversion and aggregation logic with intelligent normalization
 */

import { convertToBaseUnit, formatFromBaseUnit, canCombineIngredients } from './unit-conversion';
import { normalizeIngredientName } from './ingredient-aliases';
import {
  normalizeIngredientForAggregation,
  NormalizedIngredient,
} from './ingredient-normalizer';
import {
  aggregateIngredientsIntelligently,
  AggregatedIngredientResult,
} from './intelligent-aggregation';

export interface AggregatedIngredient {
  name: string;
  quantity: number; // base quantity
  unit: string; // base unit
  category: string;
  displayQuantity: string; // formatted human-readable quantity
  sources: Array<{ quantity: string; unit: string }>; // original quantities that were combined
}

/**
 * Aggregates a list of ingredients with intelligent normalization
 * Handles mixed unit types, count-to-weight conversions, and descriptor stripping
 * This is the new primary aggregation method
 */
export function aggregateIngredientsIntelligent(
  ingredients: Array<{ name: string; quantity: number; baseUnit: string; category: string }>
): AggregatedIngredient[] {
  // First, normalize all ingredients
  const normalized = ingredients.map((ing) =>
    normalizeIngredientForAggregation({
      name: ing.name,
      quantity: ing.quantity,
      baseUnit: ing.baseUnit,
      category: ing.category as 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other',
    })
  );

  // Apply intelligent aggregation with all rules
  const aggregated = aggregateIngredientsIntelligently(normalized);

  // Convert to AggregatedIngredient format for backward compatibility
  return aggregated.map((agg) => ({
    name: agg.displayName,
    quantity: agg.quantity,
    unit: agg.baseUnit,
    category: 'produce', // TODO: preserve from sources
    displayQuantity: agg.displayQuantity,
    sources: agg.sources.map((s) => ({
      quantity: s.quantity.toString(),
      unit: s.baseUnit,
    })),
  }));
}

/**
 * Aggregates a list of ingredients with the same name and category
 * Converts all units to base unit and combines quantities (LEGACY VERSION)
 * Use aggregateIngredientsIntelligent for new code
 */
export function aggregateIngredients(
  ingredients: Array<{ name: string; quantity: string; unit: string; category: string }>
): AggregatedIngredient[] {
  // Group by normalized name + category
  const grouped = new Map<string, typeof ingredients>();

  ingredients.forEach((ing) => {
    const key = `${normalizeIngredientName(ing.name)}-${ing.category}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(ing);
  });

  // Aggregate each group
  const results: AggregatedIngredient[] = [];

  grouped.forEach((items) => {
    if (items.length === 0) return;

    const firstItem = items[0];
    let totalBaseQuantity = 0;
    let baseUnit = '';
    const sources: Array<{ quantity: string; unit: string }> = [];

    // Convert all to base unit and sum
    items.forEach((ing) => {
      try {
        const conversion = convertToBaseUnit(ing.quantity, ing.unit, ing.name);
        totalBaseQuantity += conversion.quantity;
        if (!baseUnit) {
          baseUnit = conversion.unit;
        }
        sources.push({ quantity: ing.quantity, unit: ing.unit });
      } catch (error) {
        console.warn(`Failed to convert ${ing.quantity} ${ing.unit} of ${ing.name}:`, error);
        // Fallback: try with a default unit
        try {
          const fallbackConversion = convertToBaseUnit(ing.quantity, 'g', ing.name);
          totalBaseQuantity += fallbackConversion.quantity;
          if (!baseUnit) {
            baseUnit = fallbackConversion.unit;
          }
          sources.push({ quantity: ing.quantity, unit: ing.unit });
        } catch (fallbackError) {
          console.warn(`Fallback also failed for ${ing.name}. Skipping.`);
        }
      }
    });

    results.push({
      name: firstItem.name,
      quantity: totalBaseQuantity,
      unit: baseUnit,
      category: firstItem.category,
      displayQuantity: formatFromBaseUnit(totalBaseQuantity, baseUnit, firstItem.name),
      sources,
    });
  });

  return results;
}

/**
 * Check if an ingredient should be combined with an existing one
 */
export function shouldCombineWithExisting(
  newIngredient: { name: string; unit: string },
  existingIngredient: { name: string; unit: string }
): boolean {
  const normalizedNew = normalizeIngredientName(newIngredient.name);
  const normalizedExisting = normalizeIngredientName(existingIngredient.name);

  if (normalizedNew !== normalizedExisting) {
    return false;
  }

  // Check if units can be combined
  return canCombineIngredients(newIngredient.unit, existingIngredient.unit, newIngredient.name, existingIngredient.name);
}

/**
 * Format a quantity with unit for display
 * Handles both base and display units
 */
export function formatIngredientQuantity(quantity: string | number, unit: string, ingredientName?: string): string {
  try {
    if (typeof quantity === 'string') {
      // Try to parse as base unit quantity
      const asNumber = parseFloat(quantity);
      if (!isNaN(asNumber)) {
        return formatFromBaseUnit(asNumber, unit, ingredientName);
      }
    } else {
      return formatFromBaseUnit(quantity, unit, ingredientName);
    }
  } catch (error) {
    console.warn(`Failed to format quantity: ${quantity} ${unit}`, error);
  }

  return `${quantity} ${unit}`;
}
