# Display Formatting Fix - Root Cause & Solution

## Root Cause Identified

The problem was **NOT** in the `formatFromBaseUnit()` function logic. The formatting was correct ("2 cups + 2 tbsp").

The real issue was in **how the formatted result was being stored and displayed**:

1. `formatFromBaseUnit()` returned: `"2 cups + 2 tbsp"` ✓ (correct)
2. This was stored in `item.quantity` ✓
3. BUT: `item.unit` was being set to the base unit: `"ml"` ❌
4. UI displayed: `{item.quantity} {item.unit}` = `"2 cups + 2 tbsp ml"` ❌

## The Fix (3 Changes)

### 1. **generateGroceryList() in store.ts**
- **Line 473**: Changed `unit: baseUnit` → `unit: ''`
- When creating new grocery items with formatted quantities, leave the unit field empty

### 2. **addGroceryItem() in store.ts**
- **Line 557**: Changed `unit: baseConversion.unit` → `unit: ''`
- **Line 586**: Added `unit: ''` to updated items
- When manually adding items that are converted, leave the unit field empty

### 3. **Grocery UI Display in grocery.tsx**
- **Line 151**: Changed `{item.quantity} {item.unit}` → `{item.quantity}{item.unit ? ` ${item.unit}` : ''}`
- Only show the unit field if it has a value (backward compatible with old data)

## Why This Works

```
New Items (converted with formatting):
- quantity: "2 cups + 2 tbsp"
- unit: ""
- Display: "2 cups + 2 tbsp" ✓

Old Items (fallback, not converted):
- quantity: "2"
- unit: "tbsp"
- Display: "2 tbsp" ✓

Result: No more "tbsp ml" or "cup ml" combinations!
```

## Backward Compatibility

The UI change makes this backward compatible:
- Old items with `unit` field still display correctly
- New items with empty `unit` field display without extra space
- Fallback conversion path (for unsupported units) still sets `unit` field as before

## Files Modified

1. **src/lib/store.ts** (3 changes)
   - Line 473: New items - set unit to empty
   - Line 557: Manually added items - set unit to empty
   - Line 586: Updated combined items - set unit to empty

2. **src/app/(tabs)/grocery.tsx** (1 change)
   - Line 151: UI - only show unit if not empty

## Testing

To verify the fix works:
1. Clear/regenerate grocery list (generates new items with `unit: ''`)
2. Add new ingredients manually (will have `unit: ''`)
3. Verify display shows:
   - "2 cups + 2 tbsp" (not "2 cups + 2 tbsp ml")
   - "8 tbsp" (not "8 tbsp ml")
   - "1 cup" (not "1 cup ml")

## Impact

✓ Fixes all instances of mixed unit display
✓ No UI breakage - uses conditional rendering
✓ Backward compatible with existing data
✓ Graceful fallback for non-converted units
