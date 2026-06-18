<stack>
  Expo SDK 53, React Native 0.76.7, bun (not npm).
  React Query for server/async state.
  NativeWind + Tailwind v3 for styling.
  react-native-reanimated v3 for animations (preferred over Animated from react-native).
  react-native-gesture-handler for gestures.
  lucide-react-native for icons.
  All packages are pre-installed. DO NOT install new packages unless they are @expo-google-font packages or pure JavaScript helpers like lodash, dayjs, etc.
</stack>

<structure>
  src/app/          — Expo Router file-based routes (src/app/_layout.tsx is root). Add new screens to this folder.
  src/components/   — Reusable UI components. Add new components to this folder.
  src/lib/          — Utilities: cn.ts (className merge), example-context.ts (state pattern)
</structure>

<typescript>
  Explicit type annotations for useState: `useState<Type[]>([])` not `useState([])`
  Null/undefined handling: use optional chaining `?.` and nullish coalescing `??`
  Include ALL required properties when creating objects — TypeScript strict mode is enabled.
</typescript>

<environment>
  This project has migrated off Vibecode and runs as a standard Expo app.
  The user runs the dev server themselves (typically `bunx expo start`) and has full access to the terminal, source files, and git. You may suggest terminal commands, but do not run git commands or restart the dev server on the user's behalf unless they explicitly ask.
  Package manager is `bun` (not npm). Use `bun add` / `bunx`.
  Logs come from the Metro/Expo CLI terminal output that the user has open — there is no longer an `expo.log` file or a hosted LOGS tab. When you need to inspect logs, ask the user to paste the relevant Metro output.
  Environment variables live in `.env` (or `.env.local`) at the project root and are read via `expo-constants` / `process.env.EXPO_PUBLIC_*`. There is no ENV/API tab — direct the user to edit `.env` and restart Metro when adding new keys.
  For API keys (OpenAI, ElevenLabs, etc.), implement the functionality first, then ask the user to add the required `EXPO_PUBLIC_*` env var to `.env`.
  For placeholder images, use URLs from unsplash.com. No IMAGES tab — for user-uploaded assets, drop files into `assets/images/` and import them with `require(...)`.
  The user is technical and reads code. Communicate plainly and concretely; file paths and line numbers are useful, not noise.
</environment>


<forbidden_files>
  Do not edit: patches/, babel.config.js, metro.config.js, app.json, tsconfig.json, nativewind-env.d.ts
</forbidden_files>

<routing>
  Expo Router for file-based routing. Every file in src/app/ becomes a route.
  Never delete or refactor RootLayoutNav from src/app/_layout.tsx.

  <stack_router>
    src/app/_layout.tsx (root layout), src/app/index.tsx (matches '/'), src/app/settings.tsx (matches '/settings')
    Use <Stack.Screen options={{ title, headerStyle, ... }} /> inside pages to customize headers.
  </stack_router>

  <tabs_router>
    Only files registered in src/app/(tabs)/_layout.tsx become actual tabs.
    Unregistered files in (tabs)/ are routes within tabs, not separate tabs.
    Nested stacks create double headers — remove header from tabs, add stack inside each tab.
    At least 2 tabs or don't use tabs at all — single tab looks bad.
  </tabs_router>

  <router_selection>
    Games should avoid tabs — use full-screen stacks instead.
    For full-screen overlays/modals outside tabs: create route in src/app/ (not src/app/(tabs)/),
    then add `<Stack.Screen name="page" options={{ presentation: "modal" }} />` in src/app/_layout.tsx.
  </router_selection>

  <rules>
    Only ONE route can map to "/" — can't have both src/app/index.tsx and src/app/(tabs)/index.tsx.
    Dynamic params: use `const { id } = useLocalSearchParams()` from expo-router.
  </rules>
</routing>

<state>
  React Query for server/async state. Always use object API: `useQuery({ queryKey, queryFn })`.
  Never wrap RootLayoutNav directly.
  React Query provider must be outermost; nest other providers inside it.

  Use `useMutation` for async operations — no manual `setIsLoading` patterns.
  Wrap third-party lib calls (RevenueCat, etc.) in useQuery/useMutation for consistent loading states.
  Reuse query keys across components to share cached data — don't create duplicate providers.

  For local state, use Zustand. However, most state is server state, so use React Query for that.
  Always use a selector with Zustand to subscribe only to the specific slice of state you need (e.g., useStore(s => s.foo)) rather than the whole store to prevent unnecessary re-renders. Make sure that the value returned by the selector is a primitive. Do not execute store methods in selectors; select data/functions, then compute outside the selector.
  For persistence: use AsyncStorage inside context hook providers. Only persist necessary data.
  Split ephemeral from persisted state to avoid hydration bugs.
</state>

<safearea>
  Import from react-native-safe-area-context, NOT from react-native.
  Skip SafeAreaView inside tab stacks with navigation headers.
  Skip when using native headers from Stack/Tab navigator.
  Add when using custom/hidden headers.
  For games: use useSafeAreaInsets hook instead.
</safearea>

<data>
  Create realistic mock data when you lack access to real data.
  For image analysis: actually send to LLM don't mock.
</data>

<design>
  Don't hold back. This is mobile — design for touch, thumb zones, glanceability.
  Inspiration: iOS, Instagram, Airbnb, Coinbase, polished habit trackers.

  <avoid>
    Purple gradients on white, generic centered layouts, predictable patterns.
    Web-like designs on mobile. Overused fonts (Space Grotesk, Inter).
  </avoid>

  <do>
    Cohesive themes with dominant colors and sharp accents.
    High-impact animations: progress bars, button feedback, haptics.
    Depth via gradients and patterns, not flat solids.
    Install `@expo-google-fonts/{font-name}` for fonts (eg: `@expo-google-fonts/inter`)
    Use zeego for context menus and dropdowns (native feel). Lookup the documentation on zeego.dev to see how to use it.
  </do>
</design>

<mistakes>
  <styling>
    Use Nativewind for styling. Use cn() helper from src/lib/cn.ts to merge classNames when conditionally applying classNames or passing classNames via props.
    CameraView, LinearGradient, and Animated components DO NOT support className. Use inline style prop.
    Horizontal ScrollViews will expand vertically to fill flex containers. Add `style={{ flexGrow: 0 }}` to constrain height to content.
  </styling>

  <camera>
    Use CameraView from expo-camera, NOT the deprecated Camera import.
    import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
    Use style={{ flex: 1 }}, not className.
    Overlay UI must be absolute positioned inside CameraView.
  </camera>

  <react_native>
    No Node.js buffer in React Native — don't import from 'buffer'.
  </react_native>

  <ux>
    Use Pressable over TouchableOpacity.
    Use custom modals, not Alert.alert().
    Ensure keyboard is dismissable and doesn't obscure inputs. This is much harder to implement than it seems. You can use the react-native-keyboard-controller package to help with this. But, make sure to look up the documentation before implementing.
  </ux>

  <outdated_knowledge>
    Your react-native-reanimated and react-native-gesture-handler training may be outdated. Look up current docs before implementing.
  </outdated_knowledge>
</mistakes>

<appstore>
  Cannot assist with App Store or Google Play submission processes (app.json, eas.json, EAS CLI commands).
  For submission, the user owns the EAS workflow directly — `eas build` / `eas submit` from their own machine. Defer to their setup rather than prescribing one.
</appstore>

<skills>
You have access to a few skills in the `.claude/skills` folder. Use them to your advantage.
- ai-apis-like-chatgpt: Use this skill when the user asks you to make an app that requires an AI API.
- expo-docs: Use this skill when the user asks you to use an Expo SDK module or package that you might not know much about.
- frontend-app-design: Use this skill when the user asks you to design a frontend app component or screen.
</skills>

<ingredient_aggregation>
IMPORTANT: The meal planning app now has an intelligent ingredient aggregation system implemented.

Key Implementation Files:
1. src/lib/unit-conversion.ts - Core unit conversion logic (Volume→ml, Weight→g, Count→pieces)
2. src/lib/ingredient-aggregation.ts - Aggregation helper functions
3. src/lib/ingredient-aliases.ts - Ingredient name and unit normalization (updated)
4. src/lib/store.ts - Updated generateGroceryList() and addGroceryItem() (updated)

How It Works:
- When generating grocery lists from meal plans, ingredients with different units are automatically combined
- Example: "2 cups olive oil" + "2 tbsp olive oil" → Shows as one line "2 cups + 2 tbsp"
- All units converted to base units for storage (ml for volume, g for weight, piece for count)
- Display converts back to human-friendly format following strict unit system rules
- Manual grocery item addition automatically combines with existing ingredients

Key Functions (from unit-conversion.ts):
- convertToBaseUnit(quantity, unit, ingredientName) → {quantity, unit, category}
- formatFromBaseUnit(baseQuantity, baseUnit, ingredientName) → string (e.g., "2 cups + 2 tbsp")
- canCombineIngredients(unit1, unit2, ingredientName1?, ingredientName2?) → boolean
- getBaseUnitCategory(ingredientName, userSpecifiedUnit?) → 'volume' | 'weight' | 'count'

Supported Units:
- Volume: tsp (5ml), tbsp (15ml), cup (240ml), ml, l
- Weight: g, kg, oz (28.35g), lb (453.6g)
- Count: piece, pieces, whole, head, heads, can, cans, jar, jars, bottle, bottles, slice, slices, strip, strips, stalk, stalks, clove, cloves, bulb, bulbs, bunch, bunches, handful, handfuls, pinch, pinches

Display Rules (Never Mix Unit Systems):
- Volumes ≥ 1 cup: Use cups + tbsp (e.g., "2 cups + 2 tbsp")
- Volumes 1 tbsp to <1 cup: Use tbsp + tsp (e.g., "3 tbsp + 2 tsp")
- Volumes <1 tbsp: Use tsp only (e.g., "2 tsp")
- Very small volumes <5ml: Use ml as fallback (e.g., "3 ml")
- Weights ≥ 1kg: Use kg only (e.g., "1.5 kg")
- Weights <1kg: Use g only (e.g., "250 g")
- Never append base unit symbols when kitchen units are used
- Maximum 2 units per ingredient, always from same system

Data Model:
Ingredient and GroceryItem interfaces now include:
- quantity: string (display quantity)
- unit: string (display unit)
- quantity_base?: number (storage in base unit)
- base_unit?: string (ml, g, or piece)

Error Handling:
- Gracefully falls back to non-aggregated mode if unit conversion fails
- Logs warnings for unsupported units
- Never breaks the grocery list generation

Testing:
The system has been tested with the Metro bundler and compiles without errors. The implementation:
1. Combines ingredients from multiple recipes
2. Handles different units of the same ingredient
3. Displays aggregated quantities in human-friendly format with coherent unit systems
4. Automatically combines manually added items with existing ingredients
5. Supports count-based units like cans, heads, stalks, slices, etc.
</ingredient_aggregation>

<recipe_generation_with_diversity>
IMPORTANT: The meal planning app has an intelligent recipe generation system with diversity enforcement, flexible repeat logic, and strict user preference validation.

Key Implementation Files:
- src/lib/openai.ts - Core recipe generation with protein, format, and technique diversity tracking

USER PREFERENCE VALIDATION:

All generated recipes are validated against user preferences:
1. **Allergies (STRICT)** - Recipes containing any allergen are rejected and regenerated
   - Includes common allergens: peanuts, tree nuts, milk, eggs, fish, shellfish, soy, wheat, sesame, mustard, celery, gluten, sulfites
   - Checks ingredient names, recipe description, and instructions
   - If recipe fails validation, it's discarded and regeneration is triggered

2. **Dietary Restrictions (STRICT)** - Recipes matching selected diet are enforced
   - Vegan: No animal products (meat, fish, eggs, dairy, honey)
   - Vegetarian: No meat or fish
   - Halal: No pork, alcohol
   - Kosher: No pork, shellfish
   - Gluten-free: No wheat, barley, rye
   - Keto/Low-carb: Limited high-carb ingredients

3. **Cuisine Preferences** - Recipes generated with preferred cuisines
   - Passed to AI prompt as "Preferred cuisines: [user selections]"
   - AI prioritizes chosen cuisines in recipe generation

4. **Prep Time Preference** - Recipes validated against time constraints
   - Quick: Max 30 minutes total (prep + cook)
   - Moderate: Max 60 minutes total
   - Elaborate: No time limit
   - If recipe exceeds limit, it's flagged and can be rejected

5. **Cooking Skill Level** - Passed to AI for appropriate complexity
   - Beginner: Simple, few steps
   - Intermediate: Standard recipes
   - Advanced: Complex techniques allowed

6. **Serving Size** - All recipes generated match user's preferred servings

Validation Process:
- After each recipe is generated by OpenAI, validateRecipeAgainstPreferences() is called
- If any violations found, recipe is discarded (returns null)
- Failed recipes trigger regeneration of that slot
- Comprehensive logging shows all validation failures

ALLOW REPEATS & GROCERY OPTIMIZATION LOGIC:

Allow Repeats Availability:
- Only enabled when lunch + dinner meals >= 3
- For less than 3 lunch/dinner meals combined: repeats are disabled automatically

Max Repeats Rules (based on total lunch + dinner meals):
- 3 meals: max 1 repeat total (recipes appear max 2 times)
- 5 meals: max 2 repeats total
- 9 meals: max 3 repeats total
- 14 meals: max 4 repeats total
- Each recipe can appear maximum 2 times (original + 1 repeat)

When Allow Repeats = ON (with 3+ lunch/dinner meals):
1. Generates FEWER unique recipes than total meals needed
2. Fills remaining slots by repeating lunch/dinner recipes (respecting max repeat limit)
3. SMART REPEATING: Dinner recipe → Next day's lunch (leftovers pattern)
   - Saves time in cooking (people cook dinner and use leftovers for lunch next day)
   - Dinner on Day 1 repeats as Lunch on Day 2
   - Then lunch recipes repeat as lunch on other days
4. If Grocery Optimization is also ON, applies ingredient optimization to these fewer unique recipes
5. Result: Minimal ingredients + practical recipe repetition for cooking efficiency

When Allow Repeats = OFF:
1. Generates ALL unique recipes (no repeats ever)
2. Maximizes recipe variety across the meal plan
3. If Grocery Optimization is ON, enforces strict diversity requirements below

Interaction Example:
- 6 meals (3 lunch + 3 dinner) with Allow Repeats ON:
  - Max 1 repeat allowed for 3 lunch/dinner meals
  - Generates fewer unique recipes (e.g., 2-3 unique)
  - Fills slots with smart repeating:
    - Day 1: Dinner (Recipe A)
    - Day 2: Lunch (Recipe A repeat from Day 1 dinner), Dinner (Recipe B)
    - Day 3: Lunch (Recipe B repeat from Day 2 dinner), Dinner (Recipe A)
  - Practical pattern: Cook dinner, use leftovers for next day's lunch
  - Minimal shared ingredients across recipes

Diversity Enforcement Strategy (applies when Grocery Optimization = ON):

1. **Protein Diversity (MANDATORY)**
   - 4 or fewer meals: 1+ protein source
   - 5-6 meals: 2+ different proteins (forced via aggressive exclusion)
   - 7+ meals: 3+ different proteins (forced via aggressive exclusion)
   - All used proteins are excluded from subsequent recipes (no protein reuse)
   - AI is explicitly told which proteins to AVOID and must pick from available list

2. **Format Diversity (MANDATORY)**
   - Tracks all formats already generated: stir-fry, curry, roast, soup, pasta, salad, bowl, sandwich, wrap, grill, etc.
   - AI is given list of previously used formats and MUST avoid them
   - Each recipe format must be different from all previous recipes

3. **Technique Diversity (MANDATORY)**
   - Tracks all techniques already used: pan-fry, oven-roast, simmer, grill, air-fry, steam, deep-fry, slow-cook, boil
   - AI is given list of previously used techniques and MUST avoid them
   - Each recipe technique must be different from all previous recipes

4. **Flavor System Detection**
   - Automatically classifies recipes by flavor: east-asian, south-asian, mediterranean, middle-eastern, western, fresh-citrus, latin, spicy
   - Used in validation to detect similar recipes

Implementation Details:

buildSingleRecipePrompt() parameters:
- previousFormats: string[] - Formats already used (e.g., ["stir-fry", "curry"])
- previousTechniques: string[] - Techniques already used (e.g., ["pan-fry", "simmer"])
- excludeProteins: string[] - Proteins to avoid (aggressively excludes all used proteins)
- Prompt explicitly states which formats/techniques/proteins to AVOID and why

Recipe Generation Loop:
- Tracks usedFormats: string[] - Accumulates formats as recipes are generated
- Tracks usedTechniques: string[] - Accumulates techniques as recipes are generated
- Tracks usedProteins: Set<string> - Accumulates proteins as recipes are generated
- Passes lists to each recipe prompt for awareness
- Updates lists after each batch completes

Validation:
- classifyRecipeFamily() - Analyzes recipe name, description, ingredients, instructions to extract format/technique/flavor
- isSameRecipeFamily() - Checks if 2 recipes match on 2+ dimensions (too similar)
- validateRecipeDistinctness() - Validates all recipes have distinct families, logs conflicts

Logging:
- Batch completion logs show: proteins, formats, techniques used so far
- Example: "Batch complete: Generated 3 recipes, proteins: 2, formats: [stir-fry, curry], techniques: [pan-fry, simmer]"
- Validation warnings show: "Recipe A (stir-fry/pan-fry/mediterranean) similar to Recipe B"

Edge Cases Handled:
- If AI generates duplicate format/technique/protein despite instruction, validation catches it and logs warning
- Format/technique tracking applies when optimizeGrocery = true
- Protein exclusion also applies when allowRepeats = true (with or without optimizeGrocery)
- Repeats are automatically disabled if less than 3 lunch/dinner meals total
</recipe_generation_with_diversity>

<ingredient_quantity_validation>
IMPORTANT: The app now includes intelligent ingredient quantity and unit validation to fix common recipe generation issues, with METRIC UNITS ENFORCED throughout.

Key Implementation Files:
- src/lib/ingredient-validator.ts - Core validation logic with smart metric defaults
- src/lib/openai.ts - Updated prompt to enforce metric units only + sanitization layer (sanitizeRecipeIngredients())
- src/lib/unit-conversion.ts - Enhanced convertToBaseUnit() with graceful error handling + metric-only formatFromBaseUnit()

Issues Fixed:
1. **Zero or NaN Quantities**: Replaced with sensible defaults
2. **Missing Units**: Auto-assigned based on ingredient type using DEFAULT_UNITS_BY_INGREDIENT
3. **Invalid Units**: Replaced with metric alternatives from valid unit lists
4. **Imperial/US Units**: Automatically converted to metric at ingestion time
5. **Unknown Units**: Warnings logged but app continues (graceful degradation)

METRIC UNITS ENFORCED:
- Volume: mL, L (NO cups, tbsp, tsp, oz)
- Weight: g, kg (NO oz, lb)
- Count: piece, pieces, head, can, jar, bottle, slice, clove, stalk, bulb, bunch, handful, pinch

Smart Metric Defaults by Ingredient Type:
- **Spices**: salt, pepper, etc. → "5 ml" (metric equivalent of 1 tsp)
- **Produce**: garlic → "clove", onion → "piece", tomato → "piece"
- **Canned Items**: tomatoes → "can", coconut milk → "ml"
- **Oils**: olive oil, vegetable oil → "30 ml" (metric equivalent of 2 tbsp)
- **Liquids**: broth, milk → "ml"

Validation Pipeline:
1. **AI Generation**: OpenAI prompted to ONLY use metric units
2. **JSON Parsing**: Recipe JSON extracted from AI response
3. **Ingredient Sanitization**: validateIngredient() applied to each ingredient
   - Detects imperial/US units and converts to metric
   - Examples: tsp→5ml, tbsp→15ml, cup→240ml, oz→28.35g, lb→453.6g
4. **Issue Logging**: logIngredientValidationIssues() logs all fixes in console
5. **Recipe Return**: Sanitized recipe with metric units returned

Key Functions:
- validateIngredient(ingredient) → ValidatedIngredient - Validates, fixes, and converts to metric
- validateIngredients(ingredients) → ValidatedIngredient[] - Batch validation
- logIngredientValidationIssues(validated) - Logs validation warnings
- sanitizeRecipeIngredients(recipe) - Called after parsing each recipe from AI
- formatFromBaseUnit(quantity, unit) - METRIC ONLY display (mL, L, g, kg)

Imperial to Metric Conversion Map:
- 'tsp' → 5 mL
- 'tbsp' → 15 mL
- 'cup' → 240 mL
- 'oz' → 28.35 g
- 'lb' → 453.6 g

Valid Metric Units by Category:
- Volume: ml, l (only metric, no imperial or kitchen units)
- Weight: g, kg (only metric, no imperial)
- Count: piece, pieces, head, can, jar, bottle, slice, clove, stalk, bulb, bunch, handful, pinch

Example Fixes:
- {"name": "salt", "quantity": "0", "unit": "undefined"} → {"quantity": "5", "unit": "ml"}
- {"name": "garlic", "quantity": "NaN", "unit": ""} → {"quantity": "3", "unit": "clove"}
- {"name": "olive oil", "quantity": "2", "unit": "cup"} → {"quantity": "480", "unit": "ml"}
- {"name": "flour", "quantity": "1", "unit": "lb"} → {"quantity": "453.6", "unit": "g"}
- {"name": "salt", "quantity": "1", "unit": "tsp"} → {"quantity": "5", "unit": "ml"}

Unit Conversion Improvements:
- convertToBaseUnit() now gracefully handles 0 and NaN instead of throwing errors
- Logs warnings for invalid quantities/units instead of failing
- Fallback to sensible defaults (ml for volume, g for weight, piece for count)
- All internal storage uses base metric units (ml, g, piece)

Display & Aggregation Improvements:
- formatFromBaseUnit() ONLY displays metric units (mL/L, g/kg, pieces)
- Never displays cups, tbsp, tsp, oz, lb, or other imperial/US units
- aggregateIngredients() has fallback logic for failed conversions
- Continues aggregating other ingredients if one fails
- Never breaks grocery list generation

Grocery List Display Examples:
- 240 mL milk + 120 mL cream → "360 mL liquid dairy"
- 500 g chicken + 200 g chicken → "700 g chicken"
- 28.35 g salt + 5 mL salt (stored as 5g) → Combined metric display
- 1000 g flour → "1 kg flour"
- 500 mL oil → "0.5 L oil"
</ingredient_quantity_validation>

<intelligent_ingredient_normalization_and_aggregation>
IMPORTANT: The grocery list now uses a sophisticated multi-stage normalization and aggregation pipeline before displaying ingredients.

Key Implementation Files:
- src/lib/ingredient-normalizer.ts - Name normalization, descriptor stripping, unit type classification
- src/lib/intelligent-aggregation.ts - Smart aggregation with three rules and display rounding
- src/lib/ingredient-aggregation.ts - Bridge to new intelligent aggregation system

STAGE 1: NAME NORMALIZATION

Descriptor Stripping:
- Removes cooking descriptors: raw, cooked, fresh, dried, frozen, canned, boneless, skinless, ground, chopped, sliced, diced, minced, crushed, grated, shredded, melted, etc.
- Example: "fresh boneless chicken breast, chopped" → "chicken"
- Example: "diced canned tomato" → "tomato"

Alias Resolution:
- Handles common ingredient variations and consolidates them to canonical names
- Aliases:
  - chicken breast → chicken
  - beef steak → beef
  - bell pepper → pepper
  - cheddar cheese → cheese
  - olive oil → oil
  - chicken stock → broth
  - greek yogurt → yogurt
  - (30+ more common aliases defined)

Function: normalizeIngredientName(ingredientName) → canonicalName

STAGE 2: UNIT TYPE CLASSIFICATION

Every ingredient classified into one of three categories:
- WEIGHT: g, kg (chicken, flour, salt, butter, etc.)
- VOLUME: ml, l (milk, oil, broth, juice, etc.)
- COUNT: piece, pieces, head, can, clove, jar, bottle, slice, stalk, bulb, bunch, handful, pinch

Function: classifyUnitType(unit) → 'WEIGHT' | 'VOLUME' | 'COUNT'

STAGE 3: INTELLIGENT AGGREGATION RULES

Rule 1: Same Unit Type → Direct Sum
- When two ingredients have same canonical name AND same unit type
- Simply convert to base unit and sum quantities
- Example: "chicken 300 g" + "chicken 500 g" → "chicken 800 g"

Rule 2: Count + Weight → Smart Conversion Using Lookup Table
- When same ingredient appears as BOTH COUNT and WEIGHT
- Use INGREDIENT_AVERAGE_WEIGHTS lookup to convert COUNT to WEIGHT
- Predefined weights (per piece/unit):
  - Chicken breast: 200 g per piece
  - Garlic clove: 5 g per clove
  - Onion (medium): 150 g per piece
  - Tomato (medium): 150 g per piece
  - Egg: 50 g per piece
  - Mushroom: 15 g per piece
  - Carrot: 80 g per piece
  - Bell pepper: 150 g per piece
  - Lemon: 60 g per piece
  - Shrimp: 12 g per shrimp
  - (40+ more average weights defined)
- Example: "chicken 4 pieces + chicken 500 g"
  - Convert: 4 × 200g = 800g
  - Sum: 800g + 500g = 1300g total
  - Display: "chicken 1.3 kg"
- If no lookup exists: logs warning and keeps COUNT separate

Rule 3: Mixed Types Without Conversion
- If ingredients can't be converted (Volume + Count, for example)
- Creates separate grocery list entries
- Example: "milk 500 mL" and "eggs 3" stay as two separate lines

Function: aggregateIngredientsIntelligently(normalized) → AggregatedIngredientResult[]

STAGE 4: DISPLAY ROUNDING & FORMATTING

Rounding for User-Friendliness:
- Weight: rounded to nearest 5 g
  - 127 g → 125 g
  - 341 g → 340 g
  - 1234 g → 1235 g
- Volume: rounded to nearest 5 mL
  - 34 mL → 35 mL
  - 148 mL → 150 mL
  - 1234 mL → 1235 mL → 1.2 L
- Count: no rounding (whole numbers only)

Function: roundToNearestFive(value) → roundedValue
Function: formatFromBaseUnit(quantity, unit) → displayString (metric only: "250 g", "1.5 L", "3")

COMPLETE AGGREGATION EXAMPLE:

Input (from 3 recipes):
- Recipe 1: "500 g chicken"
- Recipe 2: "2 chicken breasts" (count: 2 pieces)
- Recipe 3: "600 g chicken"

Process:
1. Normalize all: canonical name "chicken", unit types WEIGHT, COUNT, WEIGHT
2. Group by canonical name "chicken"
3. Apply Rule 2: Convert COUNT to WEIGHT
   - 2 pieces × 200 g/piece = 400 g
4. Sum all WEIGHT: 500g + 400g + 600g = 1500g
5. Round: 1500g (already multiple of 5)
6. Format & display: "Chicken 1.5 kg (from 3 recipes)"

Key Data Structures:

NormalizedIngredient:
- canonicalName: "chicken"
- originalName: "fresh chicken breast"
- quantity: 200 (in base unit)
- baseUnit: "g"
- unitType: "WEIGHT"
- category: "meat"

AggregatedIngredientResult:
- canonicalName: "chicken"
- displayName: "chicken"
- quantity: 1500 (in base unit, pre-rounding)
- baseUnit: "g"
- displayQuantity: "1.5 kg" (formatted, post-rounding)
- unitType: "WEIGHT"
- sources: [{originalName, quantity, baseUnit}, ...]
- hasWeightConversion: boolean (true if COUNT was converted)

Benefits of This Approach:
1. **Robust Name Matching**: "boneless chicken breast" + "chicken breast, skinless" both aggregate as "chicken"
2. **Smart Unit Mixing**: "4 chicken pieces + 500g chicken" intelligently sums as weight
3. **Sensible Defaults**: 40+ ingredient average weights handle common cases
4. **Graceful Degradation**: Unmapped items create separate entries (no data loss)
5. **User-Friendly Display**: Rounded values and metric-only output
6. **Traceable Sources**: Each line shows how many recipes contributed

Function Hierarchy:
1. normalizeIngredientForAggregation(ingredient) → NormalizedIngredient
2. aggregateIngredientsIntelligently(normalized[]) → AggregatedIngredientResult[]
3. formatGroceryListResults(aggregated[]) → UI-ready format

Usage:
const normalized = ingredients.map(ing => normalizeIngredientForAggregation(ing));
const aggregated = aggregateIngredientsIntelligently(normalized);
const groceryListUI = formatGroceryListResults(aggregated);
</intelligent_ingredient_normalization_and_aggregation>

