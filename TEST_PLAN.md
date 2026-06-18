# Recipe Generation Fix - Test Plan

## Overview
This document outlines how to test the AI recipe generator fixes for strict preference enforcement and rule-based generation.

## Fixed Issues

### Issue 1: Vegan users receiving chicken recipes
**Status**: ✅ FIXED
- **Root Cause**: Simple `.includes()` matching caused false negatives; weak AI prompt
- **Fix Applied**:
  - Word-boundary regex matching: `new RegExp(\`\\b${product}\\b\`, 'i')`
  - Explicit vegan prohibitions in AI prompt (lines 616-625)
  - Dietary restriction validation with expanded keyword lists (lines 419-467)
  - Protein options filtered by dietary restriction (lines 715-721)

### Issue 2: Chicken Tikka Masala repeated 4 times (max should be 2)
**Status**: ✅ FIXED
- **Root Cause**: Used `filledSlots` loop counter instead of actual repeat count
- **Fix Applied**:
  - Changed to `totalRepeatsAdded` counter incremented only when recipe actually added (line 1325+)
  - Condition changed from `filledSlots < maxAllowedRepeats` to `totalRepeatsAdded < maxAllowedRepeats`

### Issue 3: Allow Repeats OFF still generating repeated recipes
**Status**: ✅ FIXED
- **Root Cause**: Failed validation recipes returned `null` with no retry, reducing total count
- **Fix Applied**:
  - Added retry loop after batch generation (lines 1188-1260)
  - Regenerates failed recipes up to 2 times with same logic
  - Ensures sufficient unique recipes generated before any repeat-filling executes

---

## Test Cases

### Test Case 1: Rule 1 - Allow Repeats OFF + Optimize Grocery ON
**Scenario**: 14-day meal plan (7 lunch/dinner only)

**Setup**:
- Allow Repeats: **OFF**
- Optimize Grocery: **ON**
- Meal Types: lunch, dinner
- Total Recipes: 14
- Dietary: Vegan

**Expected Results**:
- ✅ Generate 14 UNIQUE recipes (no repeats)
- ✅ Shared ingredients across recipes (grocery optimization)
- ✅ No animal products in any recipe (vegan enforcement)
- ✅ Console logs show: "Generating ALL 14 recipes as UNIQUE"
- ✅ Each recipe uses different protein (tofu, tempeh, lentils, chickpeas, beans, etc.)

**How to Test**:
1. Open app and go to Meal Planning
2. Create 14-day plan with:
   - Breakfast: OFF
   - Lunch: ON
   - Dinner: ON
   - Snacks: OFF
   - Dietary: Vegan
   - Allow Repeats: OFF
   - Optimize Grocery: ON
3. Check generated recipes:
   - Count unique recipe names (should be 14)
   - Verify no duplicates
   - Check ingredient lists for vegan compliance
   - Look for shared ingredients across recipes
4. Check console logs in LOGS tab for messages like:
   - "═══ RULE 1: Allow Repeats OFF ═══"
   - "Generating ALL 14 recipes as UNIQUE"
   - "✓ Grocery optimization ENABLED"

---

### Test Case 2: Rule 2 - Allow Repeats ON + Optimize Grocery OFF
**Scenario**: 14-day meal plan (7 lunch/dinner only)

**Setup**:
- Allow Repeats: **ON**
- Optimize Grocery: **OFF**
- Meal Types: lunch, dinner
- Total Recipes: 14
- Dietary: Normal (omnivore)

**Expected Results**:
- ✅ Generate 10 unique recipes (14 - 4 max repeats)
- ✅ Fill remaining 4 slots by repeating recipes (max 2 uses per recipe)
- ✅ Focus on protein variety (different proteins in first 10 recipes)
- ✅ Console logs show: "═══ RULE 2 & 3: Allow Repeats ON ═══"
- ✅ Console logs show: "Unique recipes to generate: 10"
- ✅ Console logs show: "Max repeats allowed: 4"

**How to Test**:
1. Open app and go to Meal Planning
2. Create 14-day plan with:
   - Breakfast: OFF
   - Lunch: ON
   - Dinner: ON
   - Snacks: OFF
   - Allow Repeats: ON
   - Optimize Grocery: OFF
3. Check generated recipes:
   - Count unique recipe names (should be 10)
   - Count repeated names (should be 4 total appearances for repeats)
   - Verify each recipe used max 2 times (original + 1 repeat)
   - Check that first 10 recipes use different proteins (chicken, beef, fish, tofu, etc.)
4. Check console logs for:
   - "═══ RULE 2 & 3: Allow Repeats ON ═══"
   - "Unique recipes to generate: 10"
   - "Max repeats allowed: 4"
   - "Filling 4 slots with repeated recipes"

---

### Test Case 3: Rule 3 - Allow Repeats ON + Optimize Grocery ON
**Scenario**: 14-day meal plan (7 lunch/dinner only)

**Setup**:
- Allow Repeats: **ON**
- Optimize Grocery: **ON**
- Meal Types: lunch, dinner
- Total Recipes: 14
- Dietary: Vegetarian

**Expected Results**:
- ✅ Generate 10 unique recipes (14 - 4 max repeats)
- ✅ Shared ingredients across recipes (grocery optimization)
- ✅ Fill remaining 4 slots by repeating recipes
- ✅ Focus on protein diversity AND cost-effectiveness
- ✅ No meat/fish in any recipe (vegetarian enforcement)
- ✅ Console logs show: "Rule 3: Grocery optimization ENABLED"

**How to Test**:
1. Open app and go to Meal Planning
2. Create 14-day plan with:
   - Breakfast: OFF
   - Lunch: ON
   - Dinner: ON
   - Snacks: OFF
   - Dietary: Vegetarian
   - Allow Repeats: ON
   - Optimize Grocery: ON
3. Check generated recipes:
   - Count unique recipe names (should be 10)
   - Count total recipes (should be 14)
   - Verify shared ingredients across recipes
   - Check vegetarian compliance (no chicken, beef, fish, etc.)
   - Verify proteins are diverse (tofu, paneer, lentils, chickpeas, eggs, etc.)
4. Check console logs for:
   - "Rule 3: Grocery optimization ENABLED"
   - "Shared ingredients: [list of 5-10 ingredients]"
   - "Protein diversity: Using 3 DIFFERENT proteins"

---

### Test Case 4: Vegan Strict Enforcement (All Rules)
**Scenario**: Apply vegan preference across all three rules

**Setup**:
- Dietary: **Vegan**
- Test with all three combinations:
  1. Allow Repeats OFF + Optimize Grocery ON
  2. Allow Repeats ON + Optimize Grocery OFF
  3. Allow Repeats ON + Optimize Grocery ON

**Expected Results for Each**:
- ✅ NO animal products in ANY recipe
  - No meat (chicken, beef, pork, lamb, turkey, duck, bacon)
  - No fish/seafood (salmon, tuna, shrimp, crab, anchovy)
  - No dairy (milk, cheese, butter, cream, yogurt, ghee)
  - No eggs or egg-based products
  - No honey or gelatin
- ✅ ONLY plant-based proteins: tofu, tempeh, seitan, lentils, chickpeas, beans, nuts, seeds
- ✅ All validation checks pass
- ✅ No retry loops due to dietary violations

**How to Test**:
1. Create meal plans with Dietary: Vegan for all three rule combinations
2. For each plan:
   - Go through all generated recipes
   - Check ingredients against vegan prohibition list
   - Verify proteins are plant-based only
   - Check console logs for validation messages
3. If ANY recipe contains animal products:
   - Check console logs for DIETARY VIOLATION messages
   - Verify retry logic kicked in
   - Ensure final recipe is vegan-compliant

---

## Validation Checklist

### Code-Level Validation (Check Console Logs)

**Rule 1 Logs**:
- [ ] "═══ RULE 1: Allow Repeats OFF ═══"
- [ ] "Generating ALL [X] recipes as UNIQUE"
- [ ] If grocery ON: "✓ Grocery optimization ENABLED"

**Rule 2 Logs**:
- [ ] "═══ RULE 2 & 3: Allow Repeats ON ═══"
- [ ] "Lunch/dinner meal count: [X]"
- [ ] "Max repeats allowed: [X]"
- [ ] "Unique recipes to generate: [X]"
- [ ] "Rule 2: Grocery optimization DISABLED"

**Rule 3 Logs**:
- [ ] "═══ RULE 2 & 3: Allow Repeats ON ═══"
- [ ] "Rule 3: Grocery optimization ENABLED"
- [ ] "Shared ingredients: [...]"

**Vegan Enforcement Logs**:
- [ ] If recipe generation fails: "[Validation] Recipe '[NAME]' has X violation(s)"
- [ ] Retry logs: "⚠️ X recipes failed validation, retrying..."
- [ ] Successful retries: "✓ Retry [X] successful"

**Batch Processing Logs**:
- [ ] "Processing batch [X] ([Y] recipes)..."
- [ ] "Batch complete: Generated [X] recipes"
- [ ] Shows protein diversity and format/technique variety

---

## Expected Console Output Example

### Rule 1 Example: 14 Unique, Vegan, Grocery ON
```
═══ RULE 1: Allow Repeats OFF ═══
Generating ALL 14 recipes as UNIQUE
✓ Grocery optimization ENABLED: shared ingredients + protein diversity applied
Generating 14 unique recipes in batches of 3...
Processing batch 1 (3 recipes)...
Batch complete: Generated 3 recipes (0 failed), proteins: 3, formats: [stir-fry, curry, bowl]
Processing batch 2 (3 recipes)...
Batch complete: Generated 3 recipes (0 failed), proteins: 6, formats: [stir-fry, curry, bowl, soup, salad, wrap]
...
✓ Recipe generation complete: 14 recipes (0 cached, 14 generated, 0 failed)
```

### Rule 2 Example: 10 Unique + 4 Repeats, Omnivore, Grocery OFF
```
═══ RULE 2 & 3: Allow Repeats ON ═══
Lunch/dinner meal count: 14
Max repeats allowed: 4
Unique recipes to generate: 10
✓ Rule 2: Grocery optimization DISABLED - focus on protein variety & palatability
Generating 10 unique recipes in batches of 3...
Processing batch 1 (3 recipes)...
Batch complete: Generated 3 recipes (0 failed), proteins: 3
...
Filling 4 slots with repeated recipes (max repeats allowed: 4, max 2 uses per recipe)
Repeating recipe 1 (Grilled Chicken): 1 repeat
Repeating recipe 3 (Baked Salmon): 1 repeat
Repeating recipe 5 (Beef Tacos): 1 repeat
Repeating recipe 7 (Tofu Stir-Fry): 1 repeat
✓ Recipe generation complete: 14 recipes (0 cached, 10 generated, 0 failed, 4 repeated)
```

---

## Debugging Tips

### If recipes are repeated when Allow Repeats = OFF:
1. Check console logs for "RULE 1" messages
2. Verify `allowRepeats` flag is correctly passed to `generateMealPlan()`
3. Look for DIETARY VIOLATION messages indicating failed validations
4. Check retry logic: should see "X recipes failed validation, retrying"

### If recipes contain forbidden ingredients:
1. Check console for DIETARY VIOLATION messages
2. Verify validation function is using word-boundary regex
3. Check AI prompt for dietary restrictions section
4. Verify protein options are filtered by dietary restriction

### If same protein appears twice in first 10 recipes:
1. Check usedProteins tracking in logs
2. Verify protein exclusion list is passed to buildSingleRecipePrompt()
3. Look for retry logs if protein diversity was a reason for failure

### If generation takes too long:
1. Check for excessive retry loops in logs
2. Verify API rate limits aren't being exceeded
3. Look for "X recipes failed validation, retrying..." messages
4. Consider increasing batch size or reducing retry attempts

---

## Success Criteria

✅ **All tests pass when**:
1. Rule 1: Generate exactly uniqueRecipesToGenerate recipes with no repeats
2. Rule 2: Generate uniqueRecipesToGenerate unique + maxAllowedRepeats repeats
3. Rule 3: Generate uniqueRecipesToGenerate unique + maxAllowedRepeats repeats with shared ingredients
4. Vegan: 100% of recipes are animal-product free
5. Vegetarian: 100% of recipes contain no meat/fish/shellfish
6. No repeated recipes when Allow Repeats = OFF
7. Each recipe in first 10 uses different protein (Rule 2 & 3)
8. Console logs show correct rule and meal count information

---

## Files Modified

- `/home/user/workspace/mobile/src/lib/openai.ts`
  - Lines 362-503: `validateRecipeAgainstPreferences()` - Added hasSpecialRequest parameter, expanded allergen lists, word-boundary matching
  - Lines 533-767: `buildSingleRecipePrompt()` - Added explicit dietary rule enforcement, protein filtering, variety hints
  - Lines 1006-1081: Recipe count calculation - Fixed Rule 1/2/3 logic
  - Lines 1101-1116: Protein exclusion - Applied to all rules
  - Lines 1174-1260: Retry logic - Regenerates failed recipes up to 2 times
  - Lines 890-924: `generateRecipe()` - Added retry loop with validation
  - Lines 1288-1344: `regenerateSingleRecipe()` - Added same retry logic

---

## Next Steps

1. Run all test cases above
2. Monitor console logs in LOGS tab
3. Report any failures with screenshot and console output
4. If all tests pass: Feature is ready for production ✅
