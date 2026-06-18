# Grocery List - Duplicate Item Detection

## Feature Added

When adding an item to the grocery list, the app now detects **fuzzy duplicate matches** and asks the user whether to:
- **Combine with existing** — merge quantities (store auto-handles unit conversion)
- **Add as separate item** — keep as distinct line item with a `(2)` suffix

## Implementation Details

### File Modified
- `/home/user/workspace/mobile/src/app/(tabs)/grocery.tsx`

### How It Works

1. **Fuzzy Matching Algorithm** (Lines 53-75)
   - Exact match (lowercased, trimmed)
   - Substring match (e.g., "avocado" ⊂ "ripe avocado")
   - Levenshtein edit distance < 35% (catches typos and plurals)

2. **Compatibility Check** (Lines 77-85)
   - Only shows popup if names match AND:
     - Same category (Produce, Dairy, Meat, etc.)
     - Compatible unit types (both liquids, both weights, or both pieces)
   - This prevents false positives (e.g., "2 cups milk" vs "500ml milk" auto-merge correctly)

3. **Duplicate Dialog** (Lines 434-483 in modal JSX)
   - Shows existing item details (name, quantity)
   - Two action buttons with haptics
   - Smooth animation (FadeInDown)

4. **Separation Logic** (Lines 265-272)
   - "Add separately" appends `(2)` / `(3)` / etc. suffix
   - Count based on fuzzy-matching items
   - Bypasses store's auto-merge logic

### Code Flow

```
User taps "Add to List"
    ↓
Check: fuzzy name match + same category + compatible units?
    ├─ YES → Show duplicate dialog with pending item
    │         User chooses combine/separate
    │         → Call onAdd() with/without suffix
    │
    └─ NO → Add item immediately
            Store handles unit conversion if applicable
```

### Examples

| Existing | Adding | Action | Result |
|----------|--------|--------|--------|
| Milk (2 cups) | Milk (1 cup) | Combine | Merge to 3 cups |
| Milk (500ml) | Milk (2 cups) | Auto-combine | Store converts & merges |
| Avocado | Avocados | Popup → Combine | Single row, aggregated |
| Avocado | Avocados | Popup → Separate | "Avocado" + "Avocados (2)" |
| Chicken (Meat) | Chicken (Pantry) | Auto-add | Different categories, no popup |

### Unit Conversion Support

Base units recognized:
- **Liquids**: ml, l, cup, cups, tbsp, tsp, fl oz, gallon
- **Weight**: g, kg, oz, lb, lbs, mg
- **Countables**: pieces (default)

When combining "2 cups" + "500ml", store's `convertToBaseUnit()` handles the math.

---

## Benefits

✅ **Prevents accidental duplicates** — User intent is clear
✅ **Smart matching** — Catches typos & singular/plural variants
✅ **Unit-aware** — Only prompts when truly mergeable
✅ **Flexible** — User can choose combine or separate
✅ **No data loss** — "Separate" items are preserved with unique names

---

## Testing

Try these scenarios:
1. Add "milk", then add "Milk" → Popup appears
2. Add "avocado (2 units)", then add "avocado" → Popup appears, can combine
3. Add "chicken (Meat)", then add "chicken (Pantry)" → No popup, adds separate (different categories)
4. Add "2 cups milk", then add "500ml milk" → Popup appears, combine auto-converts units
