# How Recipes Are Categorized as Breakfast, Lunch, Dinner & Snack

## The Current Logic (Problem)

The meal type classification is **NOT based on recipe content** - it's based on **what the user selects during generation**.

### How It Currently Works:

1. **User selects meal types** when generating recipes
   - Example: User selects "Breakfast, Lunch, Dinner, Snack" for 20 recipes

2. **App cycles through selected types**
   ```typescript
   const mealType = mealTypes[i % mealTypes.length];
   // If user selected: ['breakfast', 'lunch', 'dinner', 'snack']
   // Recipe 0 → breakfast
   // Recipe 1 → lunch
   // Recipe 2 → dinner
   // Recipe 3 → snack
   // Recipe 4 → breakfast (cycles back)
   // Recipe 5 → lunch
   ```

3. **AI is told what type to generate**
   - Prompt says: `"Generate a snack recipe"`
   - AI generates a recipe for that meal type

4. **Recipe gets tagged with the assigned type**
   - Recipe tagged as "snack" (because app told it to generate snack)
   - **NOT** because the recipe is actually suitable for snacks

## Why "Spiced Lamb Meatballs with Tomato Sauce" is a Snack

### Example Scenario:
- User generates 20 recipes selecting all 4 meal types
- 20 recipes ÷ 4 meal types = 5 recipes per type
- Position 3, 7, 11, 15, 19 → Get assigned "snack"
- Lamb meatballs happened to land on position 3 → Tagged as "snack"

## The Problem

```
User Request: Generate 20 recipes for Breakfast, Lunch, Dinner, Snack

Expected Result:
- 5 recipes that ARE suitable for breakfast
- 5 recipes that ARE suitable for lunch
- 5 recipes that ARE suitable for dinner
- 5 recipes that ARE suitable for snacks (appetizers, light bites, etc)

Current Result:
- 20 recipes generated in random order
- Each one assigned a meal type sequentially
- Lamb meatballs = snack just because it was the 3rd recipe
- Could be a gourmet dinner dish, but tagged as snack
- Users see it in "Snack" category even though it's not a snack food
```

## Solution: Content-Based Classification

To fix this, we need to ask OpenAI to **classify the recipe content itself**, not just accept whatever type we assign.

### Implementation Approach:

**Option 1: Enhanced AI Prompt** (Recommended)
- Tell AI to generate a recipe that is SUITABLE for that meal type
- Add validation that checks if recipe matches the meal type
- Example: "Generate a snack recipe" → AI would generate appetizers, finger foods, light bites

**Option 2: AI Classification**
- Generate recipe first (any type)
- Use OpenAI to classify what meal types it's suitable for
- Example: Lamb meatballs → classified as ["lunch", "dinner", "main course"]

**Option 3: Rule-Based Classification** (Simpler)
- Check recipe properties: serving size, calories, prep time, ingredients
- Snacks: Usually < 200 cal, < 30 min, appetizer-like ingredients
- Breakfast: Usually 300-500 cal, dairy/eggs/grains prominent
- Lunch/Dinner: 500-800 cal, full meal ingredients

## Current Meal Type Tags

When recipes are saved, they get tagged with:
- AI-assigned meal type (breakfast/lunch/dinner/snack)
- User-added tags (vegan, quick, healthy, etc)

The meal type tag is **just a label**, not a classification based on content.

## What Needs to Change

To make meal type classification accurate:

1. **Update AI Prompt** to emphasize generating recipes suitable for that meal type
   - "Generate a SNACK recipe" should trigger appetizers/finger foods
   - "Generate a BREAKFAST recipe" should trigger morning-appropriate foods

2. **Add Validation** to check recipe against meal type
   - Example: If generating snack, validate serving size is appropriate
   - Example: If generating breakfast, check for breakfast-appropriate ingredients

3. **Improve Prompt Guidance** with examples
   - Tell AI what constitutes a good snack (bites, appetizers, light dishes)
   - Tell AI what constitutes breakfast (eggs, toast, cereals, pancakes, etc)

## Example Fix

```typescript
// Current prompt
let prompt = `Generate a ${mealType} recipe`;

// Better prompt
let prompt = `Generate a ${mealType} recipe that is SPECIFICALLY SUITABLE for ${mealType}`;

if (mealType === 'snack') {
  prompt += `
  A snack should be:
  - Light and easy to eat (finger food, bite-sized, or single serving)
  - Quick to prepare (< 20 minutes if possible)
  - Portion-appropriate for snacking (not a full meal)
  - Examples: appetizers, dips, finger foods, small bites, light spreads
  `;
} else if (mealType === 'breakfast') {
  prompt += `
  Breakfast should be:
  - Suitable for morning consumption
  - Include typical breakfast ingredients: eggs, toast, grains, fruit, dairy
  - Energizing and nutritious
  `;
}
// etc for lunch and dinner
```

## Current vs Recommended Behavior

| Scenario | Current | Recommended |
|----------|---------|-------------|
| Generate 20 recipes | Assigns meal types sequentially (1-5 breakfast, 6-10 lunch, etc) | Each recipe fits its assigned meal type |
| "Spiced Lamb Meatballs" | Gets labeled as "snack" because it's position 3 | Identified as lunch/dinner, not snack |
| User sees in Recipes | Lamb meatballs in "Snack" category | Lamb meatballs in "Lunch/Dinner" categories |
| User expectation | Find light snacks | Find substantial meal recipes |

---

**Would you like me to implement content-based classification?** This would make the meal type tags actually reflect what recipes are suitable for. 🎯
