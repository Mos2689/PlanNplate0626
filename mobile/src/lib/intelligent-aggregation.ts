/**
 * Intelligent Ingredient Aggregation
 * Implements smart aggregation rules that handle mixed unit types with confidence-based conversions
 */

import {
  NormalizedIngredient,
  getAverageWeightPerPiece,
  classifyUnitType,
} from './ingredient-normalizer';
import {
  getAverageWeightWithConfidence,
  shouldConvertCountToWeight,
} from './average-weight-lookup-au';
import { formatFromBaseUnit } from './unit-conversion';
import { ConversionMetadata, ConversionTracker } from './conversion-metadata';

export interface AggregatedIngredientResult {
  canonicalName: string;
  displayName: string; // For UI
  quantity: number; // In base unit
  baseUnit: string; // 'g', 'ml', or 'piece'
  displayQuantity: string; // Formatted string, e.g., "800 g"
  unitType: 'WEIGHT' | 'VOLUME' | 'COUNT';
  sources: Array<{ originalName: string; quantity: number; baseUnit: string }>;
  hasWeightConversion?: boolean; // True if COUNT was converted to WEIGHT
  conversionMetadata?: ConversionMetadata[]; // Internal tracking only, never displayed
}

/**
 * Rule 2: Count + Weight → Weight Wins (with Confidence-Based Conversion)
 * If the same ingredient appears as both COUNT and WEIGHT,
 * convert COUNT to WEIGHT using lookup table with confidence levels
 */
function aggregateRuleCountPlusWeight(
  ingredients: NormalizedIngredient[],
  tracker: ConversionTracker = new ConversionTracker()
): AggregatedIngredientResult[] {
  const grouped = new Map<string, NormalizedIngredient[]>();

  // Group by canonical name only (ignoring unit type)
  ingredients.forEach((ing) => {
    const key = ing.canonicalName;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(ing);
  });

  const results: AggregatedIngredientResult[] = [];
  const conversionTracker = tracker;

  grouped.forEach((items, canonicalName) => {
    // Find WEIGHT and COUNT items
    const weightItems = items.filter((i) => i.unitType === 'WEIGHT');
    const countItems = items.filter((i) => i.unitType === 'COUNT');
    const volumeItems = items.filter((i) => i.unitType === 'VOLUME');

    // Rule 2a: If both WEIGHT and COUNT exist, attempt confidence-based conversion
    if (weightItems.length > 0 && countItems.length > 0) {
      let totalWeightG = weightItems.reduce((sum, item) => sum + item.quantity, 0);
      let hasConversion = false;
      const conversions: ConversionMetadata[] = [];

      // Try to convert each COUNT item to WEIGHT using confidence-aware lookup
      countItems.forEach((countItem) => {
        // Only convert if lookup exists AND confidence is high or medium
        if (shouldConvertCountToWeight(canonicalName)) {
          const lookup = getAverageWeightWithConfidence(canonicalName);
          if (lookup) {
            const convertedWeight = countItem.quantity * lookup.weightG;
            totalWeightG += convertedWeight;
            hasConversion = true;

            // Track the conversion with metadata
            const metadata: ConversionMetadata = {
              ingredient: canonicalName,
              originalUnit: countItem.baseUnit as any,
              originalQuantity: countItem.quantity,
              convertedUnit: 'g',
              convertedQuantity: convertedWeight,
              conversionSource: 'AVERAGE_WEIGHT_LOOKUP_AU',
              confidence: lookup.confidence,
              description: lookup.description,
            };
            conversions.push(metadata);
            conversionTracker.logConversion(metadata);
          }
        } else {
          // Log failed attempt
          const lookup = getAverageWeightWithConfidence(canonicalName);
          conversionTracker.logFailedAttempt({
            ingredient: canonicalName,
            originalUnit: countItem.baseUnit,
            originalQuantity: countItem.quantity,
            reason: lookup ? 'low_confidence' : 'missing_lookup',
          });
        }
      });

      // If we successfully converted at least some COUNT items, return as WEIGHT
      if (hasConversion) {
        results.push({
          canonicalName,
          displayName: canonicalName,
          quantity: totalWeightG,
          baseUnit: 'g',
          displayQuantity: formatFromBaseUnit(totalWeightG, 'g'),
          unitType: 'WEIGHT',
          sources: [...weightItems, ...countItems].map((item) => ({
            originalName: item.originalName,
            quantity: item.quantity,
            baseUnit: item.baseUnit,
          })),
          hasWeightConversion: true,
          conversionMetadata: conversions, // Internal tracking only
        });
        return;
      }
    }

    // Rule 2b: Only one type exists - aggregate that type
    if (weightItems.length > 0 && countItems.length === 0 && volumeItems.length === 0) {
      const totalWeight = weightItems.reduce((sum, item) => sum + item.quantity, 0);
      results.push({
        canonicalName,
        displayName: canonicalName,
        quantity: totalWeight,
        baseUnit: 'g',
        displayQuantity: formatFromBaseUnit(totalWeight, 'g'),
        unitType: 'WEIGHT',
        sources: weightItems.map((item) => ({
          originalName: item.originalName,
          quantity: item.quantity,
          baseUnit: item.baseUnit,
        })),
      });
      return;
    }

    if (volumeItems.length > 0 && weightItems.length === 0 && countItems.length === 0) {
      const totalVolume = volumeItems.reduce((sum, item) => sum + item.quantity, 0);
      // Use the base unit from the first item (could be 'ml' for liquids or 'cup' for solids)
      const volumeBaseUnit = volumeItems[0].baseUnit;
      results.push({
        canonicalName,
        displayName: canonicalName,
        quantity: totalVolume,
        baseUnit: volumeBaseUnit,
        displayQuantity: formatFromBaseUnit(totalVolume, volumeBaseUnit, canonicalName),
        unitType: 'VOLUME',
        sources: volumeItems.map((item) => ({
          originalName: item.originalName,
          quantity: item.quantity,
          baseUnit: item.baseUnit,
        })),
      });
      return;
    }

    if (countItems.length > 0 && weightItems.length === 0 && volumeItems.length === 0) {
      const totalCount = countItems.reduce((sum, item) => sum + item.quantity, 0);
      results.push({
        canonicalName,
        displayName: canonicalName,
        quantity: totalCount,
        baseUnit: 'piece',
        displayQuantity: formatFromBaseUnit(totalCount, 'piece'),
        unitType: 'COUNT',
        sources: countItems.map((item) => ({
          originalName: item.originalName,
          quantity: item.quantity,
          baseUnit: item.baseUnit,
        })),
      });
      return;
    }

    // Rule 3: Mixed types with no clear conversion - keep separate
    // This shouldn't happen often, but handle it by keeping count separate
    if (volumeItems.length > 0 && countItems.length > 0) {
      // Volume + Count: can't easily convert, keep as separate entries
      // First add volume aggregation
      if (volumeItems.length > 0) {
        const totalVolume = volumeItems.reduce((sum, item) => sum + item.quantity, 0);
        // Use the base unit from the first item (could be 'ml' for liquids or 'cup' for solids)
        const volumeBaseUnit = volumeItems[0].baseUnit;
        results.push({
          canonicalName,
          displayName: canonicalName,
          quantity: totalVolume,
          baseUnit: volumeBaseUnit,
          displayQuantity: formatFromBaseUnit(totalVolume, volumeBaseUnit, canonicalName),
          unitType: 'VOLUME',
          sources: volumeItems.map((item) => ({
            originalName: item.originalName,
            quantity: item.quantity,
            baseUnit: item.baseUnit,
          })),
        });
      }

      // Then add count
      if (countItems.length > 0) {
        const totalCount = countItems.reduce((sum, item) => sum + item.quantity, 0);
        results.push({
          canonicalName: `${canonicalName} (pieces)`,
          displayName: `${canonicalName} (pieces)`,
          quantity: totalCount,
          baseUnit: 'piece',
          displayQuantity: formatFromBaseUnit(totalCount, 'piece'),
          unitType: 'COUNT',
          sources: countItems.map((item) => ({
            originalName: item.originalName,
            quantity: item.quantity,
            baseUnit: item.baseUnit,
          })),
        });
      }
    }

    // Rule 3b: Weight + Count with no conversion (failed lookup or low confidence)
    if (weightItems.length > 0 && countItems.length > 0) {
      // First add weight aggregation
      if (weightItems.length > 0) {
        const totalWeight = weightItems.reduce((sum, item) => sum + item.quantity, 0);
        results.push({
          canonicalName,
          displayName: canonicalName,
          quantity: totalWeight,
          baseUnit: 'g',
          displayQuantity: formatFromBaseUnit(totalWeight, 'g'),
          unitType: 'WEIGHT',
          sources: weightItems.map((item) => ({
            originalName: item.originalName,
            quantity: item.quantity,
            baseUnit: item.baseUnit,
          })),
        });
      }

      // Then add count
      if (countItems.length > 0) {
        const totalCount = countItems.reduce((sum, item) => sum + item.quantity, 0);
        results.push({
          canonicalName: `${canonicalName} (pieces)`,
          displayName: `${canonicalName} (pieces)`,
          quantity: totalCount,
          baseUnit: 'piece',
          displayQuantity: formatFromBaseUnit(totalCount, 'piece'),
          unitType: 'COUNT',
          sources: countItems.map((item) => ({
            originalName: item.originalName,
            quantity: item.quantity,
            baseUnit: item.baseUnit,
          })),
        });
      }
    }

    // Rule 3c: Weight + Volume with no count. Canonicalization upstream makes
    // this rare (a given ingredient resolves to ONE family), but legacy data
    // could still produce it. Emit BOTH so the ingredient is never silently
    // dropped — they surface as separate reviewable lines.
    if (weightItems.length > 0 && volumeItems.length > 0 && countItems.length === 0) {
      const totalWeight = weightItems.reduce((sum, item) => sum + item.quantity, 0);
      results.push({
        canonicalName,
        displayName: canonicalName,
        quantity: totalWeight,
        baseUnit: 'g',
        displayQuantity: formatFromBaseUnit(totalWeight, 'g'),
        unitType: 'WEIGHT',
        sources: weightItems.map((item) => ({
          originalName: item.originalName,
          quantity: item.quantity,
          baseUnit: item.baseUnit,
        })),
      });

      const totalVolume = volumeItems.reduce((sum, item) => sum + item.quantity, 0);
      const volumeBaseUnit = volumeItems[0].baseUnit;
      results.push({
        canonicalName: `${canonicalName} (volume)`,
        displayName: `${canonicalName} (volume)`,
        quantity: totalVolume,
        baseUnit: volumeBaseUnit,
        displayQuantity: formatFromBaseUnit(totalVolume, volumeBaseUnit, canonicalName),
        unitType: 'VOLUME',
        sources: volumeItems.map((item) => ({
          originalName: item.originalName,
          quantity: item.quantity,
          baseUnit: item.baseUnit,
        })),
      });
    }
  });

  return results;
}

/**
 * Round display value to nearest 5
 * Examples: 34 → 35, 127 → 125, 10 → 10
 */
function roundToNearestFive(value: number): number {
  return Math.round(value / 5) * 5;
}

/**
 * Main intelligent aggregation function
 * Applies all three rules in sequence with confidence-based conversions
 */
export function aggregateIngredientsIntelligently(
  ingredients: NormalizedIngredient[],
  tracker?: ConversionTracker
): AggregatedIngredientResult[] {
  // Apply Rule 2 & 3 (count+weight conversion and mixed types)
  const aggregated = aggregateRuleCountPlusWeight(ingredients, tracker);

  // Round display values - but only for g/ml, NOT for cups
  return aggregated.map((agg) => {
    // Don't round cups - they use fractions (1/4, 1/2, etc.)
    if (agg.baseUnit === 'cup' || agg.baseUnit === 'cups') {
      return {
        ...agg,
        displayQuantity: formatFromBaseUnit(agg.quantity, agg.baseUnit, agg.canonicalName),
      };
    }

    // Don't round count-based units
    if (agg.baseUnit === 'piece') {
      return {
        ...agg,
        displayQuantity: formatFromBaseUnit(agg.quantity, 'piece'),
      };
    }

    // Round g and ml to nearest 5
    return {
      ...agg,
      quantity: roundToNearestFive(agg.quantity),
      displayQuantity: formatFromBaseUnit(roundToNearestFive(agg.quantity), agg.baseUnit),
    };
  });
}

/**
 * Convert aggregated results to final grocery list format
 * Ready for UI display (NEVER includes conversion metadata or confidence info)
 */
export function formatGroceryListResults(
  aggregated: AggregatedIngredientResult[]
): Array<{
  name: string;
  quantity: string;
  unit: string;
  category: string;
  sources: number; // How many recipes contributed
}> {
  return aggregated.map((item) => ({
    name: item.displayName,
    quantity: item.displayQuantity.split(' ')[0], // Extract just the number
    unit: item.displayQuantity.split(' ')[1] || '', // Extract just the unit
    category: 'produce', // TODO: preserve category from sources
    sources: item.sources.length,
  }));
}
