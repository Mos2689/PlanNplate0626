# Quick Add Section Logic

## Overview
The Quick Add section on the Meal Plan screen now displays recipes organized into three categories with 3 recipes per category.

## Categories

### 1. **Most Repeated** (Last 2 Weeks)
- **Logic**: Analyzes all meal slots from the last 14 days
- **Metric**: Counts how many times each recipe was used
- **Display**: Top 3 most frequently used recipes
- **Icon**: Trending Up (📈)

### 2. **Your Preferences** (Preference Matched)
- **Logic**: Filters recipes by user preferences with allergen checking
- **Matching Criteria**:
  - Matches user's dietary restrictions (if any)
  - Matches user's cuisine preferences (if any)
  - Excludes recipes with user's allergens
- **Priority**: Excludes recipes already shown in "Most Repeated"
- **Display**: Top 3 matching recipes
- **Icon**: Sparkles (✨)

### 3. **Favorites** (Saved Recipes)
- **Logic**: Shows recipes that user has marked as saved/favorite
- **Filter**: `isSaved === true`
- **Priority**: Excludes recipes from previous two categories
- **Display**: Top 3 favorite recipes
- **Icon**: Heart (❤️)

## Implementation Details

### Helper Functions
Located in `/mobile/src/lib/quick-add-logic.ts`:

- `getRecentlyUsedRecipes()` - Tracks usage in last 2 weeks
- `getPreferenceMatchedRecipes()` - Filters by dietary/cuisine preferences & allergens
- `getFavoriteRecipes()` - Returns saved recipes
- `getQuickAddRecipes()` - Combines all three categories
- `getQuickAddRecipesFlat()` - Returns flattened list for simple display

### Deduplication
Each category explicitly excludes recipes from previous categories to prevent duplicates:
1. Most Repeated gets priority
2. Preferences excludes Most Repeated
3. Favorites excludes both previous categories

### Data Used
- **MealSlots**: To track recipe usage and dates
- **AllRecipes**: Full recipe collection
- **UserPreferences**: Dietary restrictions, cuisine preferences, allergies
- **Recipe Properties**: `isSaved`, `tags`, `ingredients`

## UI/UX

- **Horizontal Scrolling**: Each category scrolls independently
- **Visual Hierarchy**: Category headers with icons and labels
- **Recipe Cards**: Display image, name, and total cook time
- **No Display**: If a category has no recipes, that section is hidden
- **Full Recipes List**: "See all" button still navigates to full recipes screen

## Display Example

```
Quick Add                                    See all

📈 Most Repeated
[Recipe 1]  [Recipe 2]  [Recipe 3] →

✨ Your Preferences
[Recipe 4]  [Recipe 5]  [Recipe 6] →

❤️ Favorites
[Recipe 7]  [Recipe 8]  [Recipe 9] →
```

## Performance
- All calculations memoized with `useMemo` to prevent unnecessary recalculations
- Only recalculates when `allMealSlots`, `allRecipes`, or `preferences` change
- Uses Set data structures for O(1) lookups during deduplication
