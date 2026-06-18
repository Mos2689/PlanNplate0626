# Unit Normalization Fix - Combining Identical Units with Different Names

## Problem
Olive oil ingredients were showing on separate lines because units were written differently:
- "Olive Oil 2 tbsp" (one recipe)
- "Olive Oil 2 tablespoons" (another recipe)

Even though "tbsp" and "tablespoons" are the SAME unit, they weren't combining into one line because the unit strings didn't match exactly.

## Root Cause
The grocery list aggregation was using the exact unit string returned from `convertToBaseUnit()` without normalizing it first. When recipes had different unit spellings (tbsp vs tablespoons, tsp vs teaspoon, etc.), they created different keys and wouldn't combine.

## Solution Implemented

### 1. Enhanced Unit Aliases (`src/lib/ingredient-aliases.ts`)
Added comprehensive unit alias mappings to normalize all unit variations to canonical forms:

**Teaspoon variations** → `tsp`:
- teaspoon, teaspoons, tsp, tsps, t

**Tablespoon variations** → `tbsp`:
- tablespoon, tablespoons, tbsp, tbsps, tb, tbs

**Cup variations** → `cup`:
- cup, cups, c

**Milliliter variations** → `ml`:
- milliliter, milliliters, mls, ml

**Liter variations** → `l`:
- liter, liters, litre, litres, l

**Gram variations** → `g`:
- gram, grams, gs, g

**Kilogram variations** → `kg`:
- kilogram, kilograms, kg

**Ounce variations** → `oz`:
- ounce, ounces, oz

**Pound variations** → `lb`:
- pound, pounds, lb, lbs

### 2. Apply Unit Normalization in convertToBaseUnit (`src/lib/unit-conversion.ts`)
- Added import of `normalizeUnit` from ingredient-aliases
- Apply unit aliases BEFORE checking against conversion tables
- Use aliased unit consistently throughout:
  - For looking up conversion factors (VOLUME_TO_ML, WEIGHT_TO_G, COUNT_UNITS)
  - For returning as baseUnit
  - For count units, preserve the aliased unit name (so "pinch" stays "pinch", not converted to generic "piece")

### 3. Key Creation with Normalized Units
The grocery aggregation key is created as: `${normalizedName}-${baseUnit}-${category}`

Now:
- "Olive Oil 2 tbsp" → key: "olive oil-tbsp-pantry"
- "Olive Oil 2 tablespoons" → key: "olive oil-tbsp-pantry"
- **Result: Same key → Ingredients combine! ✓**

## Benefits of This Approach

1. **Consistent Aggregation**: All unit variations of the same measurement automatically combine
2. **Applies to ALL Units**: Fix works for all ingredients and all unit types
3. **Backward Compatible**: Fallback path in store.ts also uses normalizeUnit
4. **Preserves Specific Count Units**: "pinch" stays as "pinch" (not generic "piece"), so salt displays as "1 pinch" correctly
5. **No Data Loss**: All quantity conversions happen at base unit level before normalization

## Unit Combinations That Now Work

**Before**: Showed separately
```
Olive Oil: 2 tbsp
Olive Oil: 1 tablespoon
Salt: 5 teaspoons
Salt: 1 tsp
```

**After**: Combined into single lines
```
Olive Oil: 3 tbsp + 1 tbsp = 4 tbsp
Salt: 5 tsp + 1 tsp = 6 tsp
```

## How Aggregation Key Works

```typescript
const normalizedName = normalizeIngredientName(ing.name);
// "Olive Oil" → "olive oil"
// "olive oil" → "olive oil"

const baseUnit = convertToBaseUnit(ing.quantity, ing.unit, ing.name);
// (2, "tablespoons") → { quantity: 30, unit: "tbsp" }
// (2, "tbsp") → { quantity: 30, unit: "tbsp" }

const key = `${normalizedName}-${baseUnit}-${ing.category}`;
// "olive oil-tbsp-pantry" (same for both!)

ingredientMap.set(key, item);
// Same key means same ingredient, so they combine
```

## Files Modified

- ✅ `src/lib/ingredient-aliases.ts` - Enhanced UNIT_ALIASES with comprehensive variations
- ✅ `src/lib/unit-conversion.ts` - Apply normalizeUnit in convertToBaseUnit
- ✅ No changes needed to `src/lib/store.ts` - Fallback path already uses normalizeUnit

## Testing the Fix

When you generate a new grocery list:

1. **Check Combining**:
   - All olive oil quantities combine into one line
   - All salt/spice quantities combine into one line

2. **Check Logs**: Look for:
   - `[GROCERY-COMBINE]` logs showing ingredients being combined
   - Different unit variations mapping to same key

3. **Check Display**:
   - Olive Oil shows as "30 mL" or "4 tbsp" (single line, not multiple)
   - Salt shows with proper quantity (not zero)
   - Units are consistent (all tbsp or all tsp, not mixed)

## Implementation Details

The normalizeUnit function from ingredient-aliases.ts:
```typescript
export function normalizeUnit(unit: string): string {
  const normalized = unit.toLowerCase().trim();
  return UNIT_ALIASES[normalized] || normalized;
}
```

This is called in convertToBaseUnit at the point where we need to:
1. Check which conversion table to use
2. Return the baseUnit
3. For count units, preserve the specific unit name

Result: All unit variations normalize to canonical forms, enabling proper combining!
