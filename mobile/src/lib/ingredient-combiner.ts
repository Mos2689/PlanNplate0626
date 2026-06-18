/**
 * Ingredient Combiner
 * Combines ingredients only when they match exactly on:
 * - Canonical name
 * - Category
 * - Unit (display unit)
 * - Base unit
 *
 * Identifies similar ingredients with mismatched units for user review
 */

import { NormalizedIngredient } from './ingredient-normalizer';
import { formatFromBaseUnit } from './unit-conversion';

export interface CombinedIngredient {
  canonicalName: string;
  displayName: string;
  quantity: number; // in base unit
  baseUnit: string; // 'g', 'ml', or 'piece'
  displayQuantity: string;
  category: string;
  unitType: 'WEIGHT' | 'VOLUME' | 'COUNT';
  sources: Array<{ originalName: string; quantity: number; baseUnit: string }>;
}

export interface SimilarIngredient {
  canonicalName: string;
  category: string;
  variants: Array<{
    displayName: string;
    quantity: number;
    baseUnit: string;
    displayQuantity: string;
    unitType: 'WEIGHT' | 'VOLUME' | 'COUNT';
  }>;
}

/**
 * Create a key for exact matching: canonical name + category + unit + base unit
 */
function getExactMatchKey(
  canonicalName: string,
  category: string,
  baseUnit: string
): string {
  return `${canonicalName}|${category}|${baseUnit}`;
}

/**
 * Create a key for similarity: canonical name + category only
 */
function getSimilarityKey(canonicalName: string, category: string): string {
  return `${canonicalName}|${category}`;
}

/**
 * Combine ingredients only when they have exact unit matches
 * Returns combined ingredients and a list of similar items with mismatched units
 */
export function combineIngredientsWithExactUnitMatch(
  ingredients: Array<{
    canonicalName: string;
    displayName: string;
    quantity: number;
    baseUnit: string;
    category: string;
    unitType: 'WEIGHT' | 'VOLUME' | 'COUNT';
  }>
): {
  combined: CombinedIngredient[];
  similar: SimilarIngredient[];
} {
  const exactMatches = new Map<string, typeof ingredients>();
  const similarGroups = new Map<string, typeof ingredients>();

  // First pass: group by exact match key
  ingredients.forEach((ing) => {
    const exactKey = getExactMatchKey(ing.canonicalName, ing.category, ing.baseUnit);
    const similarKey = getSimilarityKey(ing.canonicalName, ing.category);

    // Add to exact match group
    if (!exactMatches.has(exactKey)) {
      exactMatches.set(exactKey, []);
    }
    exactMatches.get(exactKey)!.push(ing);

    // Also track in similar groups for later filtering
    if (!similarGroups.has(similarKey)) {
      similarGroups.set(similarKey, []);
    }
    similarGroups.get(similarKey)!.push(ing);
  });

  // Create combined ingredients from exact matches
  const combined: CombinedIngredient[] = [];

  exactMatches.forEach((items, key) => {
    if (items.length === 0) return;

    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const firstItem = items[0];

    combined.push({
      canonicalName: firstItem.canonicalName,
      displayName: firstItem.canonicalName,
      quantity: totalQuantity,
      baseUnit: firstItem.baseUnit,
      displayQuantity: formatFromBaseUnit(totalQuantity, firstItem.baseUnit),
      category: firstItem.category,
      unitType: firstItem.unitType,
      sources: items.map((item) => ({
        originalName: item.displayName,
        quantity: item.quantity,
        baseUnit: item.baseUnit,
      })),
    });
  });

  // Find similar ingredients (same canonical name + category but different units/baseUnits)
  const similar: SimilarIngredient[] = [];

  similarGroups.forEach((items, similarKey) => {
    // Get all unique base units for this ingredient
    const uniqueBaseUnits = new Set(items.map((i) => i.baseUnit));

    // Only flag as "similar" if there are multiple different units
    if (uniqueBaseUnits.size > 1) {
      const [canonicalName, category] = similarKey.split('|');
      similar.push({
        canonicalName,
        category,
        variants: items.map((item) => ({
          displayName: item.displayName,
          quantity: item.quantity,
          baseUnit: item.baseUnit,
          displayQuantity: formatFromBaseUnit(item.quantity, item.baseUnit),
          unitType: item.unitType,
        })),
      });
    }
  });

  return { combined, similar };
}

/**
 * Manually combine similar ingredients with different units
 * This is called when user confirms a manual combination
 */
export function manualCombineSimilarIngredients(
  similar: SimilarIngredient,
  selectedVariants: number[] // indices of variants to combine
): CombinedIngredient | null {
  if (selectedVariants.length === 0) return null;

  const selectedItems = selectedVariants
    .map((idx) => similar.variants[idx])
    .filter((v) => v !== undefined);

  if (selectedItems.length === 0) return null;

  // When manually combining mixed units, we can't truly aggregate
  // So we just pick the primary unit and note the others
  const primaryVariant = selectedItems[0];

  return {
    canonicalName: similar.canonicalName,
    displayName: similar.canonicalName,
    quantity: selectedItems.reduce((sum, v) => sum + v.quantity, 0),
    baseUnit: primaryVariant.baseUnit,
    displayQuantity: `${primaryVariant.quantity} ${primaryVariant.baseUnit} + ${selectedItems
      .slice(1)
      .map((v) => `${v.quantity} ${v.baseUnit}`)
      .join(' + ')}`,
    category: similar.category,
    unitType: primaryVariant.unitType,
    sources: selectedItems.map((item) => ({
      originalName: item.displayName,
      quantity: item.quantity,
      baseUnit: item.baseUnit,
    })),
  };
}
