# Graph Report - .  (2026-06-17)

## Corpus Check
- Large corpus: 253 files · ~767,302 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 1538 nodes · 3001 edges · 98 communities (90 shown, 8 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Package Mobile Components|Package Mobile Components]]
- [[_COMMUNITY_Lib Database Components|Lib Database Components]]
- [[_COMMUNITY_Components Vibe Components|Components Vibe Components]]
- [[_COMMUNITY_Lib Plan Components|Lib Plan Components]]
- [[_COMMUNITY_Lib Revenuecatclient Components|Lib Revenuecatclient Components]]
- [[_COMMUNITY_Eas Mobile Components|Eas Mobile Components]]
- [[_COMMUNITY_Lib Behavior Components|Lib Behavior Components]]
- [[_COMMUNITY_Lib Openai Components|Lib Openai Components]]
- [[_COMMUNITY_App Lib Components|App Lib Components]]
- [[_COMMUNITY_Onboarding App Components|Onboarding App Components]]
- [[_COMMUNITY_Options Components Components|Options Components Components]]
- [[_COMMUNITY_App Mobile Components|App Mobile Components]]
- [[_COMMUNITY_Plan Lib Components|Plan Lib Components]]
- [[_COMMUNITY_Lib Store Components|Lib Store Components]]
- [[_COMMUNITY_Components Src Components|Components Src Components]]
- [[_COMMUNITY_Ingredient Rules Components|Ingredient Rules Components]]
- [[_COMMUNITY_Ingredient Lib Components|Ingredient Lib Components]]
- [[_COMMUNITY_Lib Conversion Components|Lib Conversion Components]]
- [[_COMMUNITY_Mobile Package Components|Mobile Package Components]]
- [[_COMMUNITY_Tabs Grocery Components|Tabs Grocery Components]]
- [[_COMMUNITY_Lib Recipe Components|Lib Recipe Components]]
- [[_COMMUNITY_Components Tabs Components|Components Tabs Components]]
- [[_COMMUNITY_App Curated Components|App Curated Components]]
- [[_COMMUNITY_Recipe App Components|Recipe App Components]]
- [[_COMMUNITY_Tabs Preferences Components|Tabs Preferences Components]]
- [[_COMMUNITY_Lib High Components|Lib High Components]]
- [[_COMMUNITY_Duplicaterecipemodal Components Components|Duplicaterecipemodal Components Components]]
- [[_COMMUNITY_Lib Components Components|Lib Components Components]]
- [[_COMMUNITY_Components Vibeslider Components|Components Vibeslider Components]]
- [[_COMMUNITY_Lib Recipeimport Components|Lib Recipeimport Components]]
- [[_COMMUNITY_Lib Unit Components|Lib Unit Components]]
- [[_COMMUNITY_Lib Picks Components|Lib Picks Components]]
- [[_COMMUNITY_Nudge Engine Components|Nudge Engine Components]]
- [[_COMMUNITY_Lib Meal Components|Lib Meal Components]]
- [[_COMMUNITY_Curated App Components|Curated App Components]]
- [[_COMMUNITY_Index Supabase Components|Index Supabase Components]]
- [[_COMMUNITY_Lib Subscription Components|Lib Subscription Components]]
- [[_COMMUNITY_Package Mobile Components|Package Mobile Components]]
- [[_COMMUNITY_App Tabs Components|App Tabs Components]]
- [[_COMMUNITY_Lib Ingredient Components|Lib Ingredient Components]]
- [[_COMMUNITY_Lib Api Components|Lib Api Components]]
- [[_COMMUNITY_Image Library Components|Image Library Components]]
- [[_COMMUNITY_Cookconfirmsheet Components Components|Cookconfirmsheet Components Components]]
- [[_COMMUNITY_Components Quickactions Components|Components Quickactions Components]]
- [[_COMMUNITY_Lib Duplicate Components|Lib Duplicate Components]]
- [[_COMMUNITY_Scripts Test Components|Scripts Test Components]]
- [[_COMMUNITY_Lib Upload Components|Lib Upload Components]]
- [[_COMMUNITY_Scripts Generate Components|Scripts Generate Components]]
- [[_COMMUNITY_Components Profilesetupmodal Components|Components Profilesetupmodal Components]]
- [[_COMMUNITY_Pagersheet Components Components|Pagersheet Components Components]]
- [[_COMMUNITY_Components Pendinggenerationbanner Components|Components Pendinggenerationbanner Components]]
- [[_COMMUNITY_Ingredient Lib Components|Ingredient Lib Components]]
- [[_COMMUNITY_Weekstrip Components Components|Weekstrip Components Components]]
- [[_COMMUNITY_Lib Recipe Components|Lib Recipe Components]]
- [[_COMMUNITY_Errorboundary Components Components|Errorboundary Components Components]]
- [[_COMMUNITY_Lib Unit Components|Lib Unit Components]]
- [[_COMMUNITY_Lib Allergy Components|Lib Allergy Components]]
- [[_COMMUNITY_App Select Components|App Select Components]]
- [[_COMMUNITY_Pnpfavorites Components Components|Pnpfavorites Components Components]]
- [[_COMMUNITY_Config Metro Components|Config Metro Components]]
- [[_COMMUNITY_Tsconfig Mobile Components|Tsconfig Mobile Components]]
- [[_COMMUNITY_Duplicateingredientmodal Components Components|Duplicateingredientmodal Components Components]]
- [[_COMMUNITY_Lib Picks Components|Lib Picks Components]]
- [[_COMMUNITY_Lib Rate Components|Lib Rate Components]]
- [[_COMMUNITY_Lib Quick Components|Lib Quick Components]]
- [[_COMMUNITY_Lib Email Components|Lib Email Components]]
- [[_COMMUNITY_Lib Openai Components|Lib Openai Components]]
- [[_COMMUNITY_Lib Category Components|Lib Category Components]]
- [[_COMMUNITY_Monthyearpicker Components Components|Monthyearpicker Components Components]]
- [[_COMMUNITY_Functions Deno Components|Functions Deno Components]]
- [[_COMMUNITY_Lib Picks Components|Lib Picks Components]]
- [[_COMMUNITY_Picksforyou Components Components|Picksforyou Components Components]]
- [[_COMMUNITY_Components Themed Components|Components Themed Components]]
- [[_COMMUNITY_Similaringredientsmodal Components Components|Similaringredientsmodal Components Components]]
- [[_COMMUNITY_Eslint Config Components|Eslint Config Components]]
- [[_COMMUNITY_Shoppinglistcompletionmodal Components Components|Shoppinglistcompletionmodal Components Components]]
- [[_COMMUNITY_Lib Store Components|Lib Store Components]]
- [[_COMMUNITY_Successtoast Components Components|Successtoast Components Components]]
- [[_COMMUNITY_Tests Signup Components|Tests Signup Components]]
- [[_COMMUNITY_Lib Database Components|Lib Database Components]]
- [[_COMMUNITY_Progresscircle Components Components|Progresscircle Components Components]]
- [[_COMMUNITY_State Example Components|State Example Components]]
- [[_COMMUNITY_Users Pradi Components|Users Pradi Components]]
- [[_COMMUNITY_Tailwind Config Components|Tailwind Config Components]]

## God Nodes (most connected - your core abstractions)
1. `useMealPlanStore` - 55 edges
2. `Recipe` - 48 edges
3. `isSupabaseConfigured()` - 47 edges
4. `useSubscriptionStore` - 45 edges
5. `useAuthStore` - 39 edges
6. `useColorScheme()` - 33 edges
7. `cn()` - 32 edges
8. `MealSlot` - 24 edges
9. `UserPreferences` - 23 edges
10. `env` - 18 edges

## Surprising Connections (you probably didn't know these)
- `getCanonicalCategory()` --calls--> `normalizeIngredientName()`  [EXTRACTED]
  scripts/generate-curated-grocery-cache.ts → src/lib/ingredient-aliases.ts
- `generateCache()` --calls--> `convertToBaseUnit()`  [EXTRACTED]
  scripts/generate-curated-grocery-cache.ts → src/lib/unit-conversion.ts
- `generateCache()` --calls--> `normalizeIngredientName()`  [EXTRACTED]
  scripts/generate-curated-grocery-cache.ts → src/lib/ingredient-aliases.ts
- `generateCache()` --calls--> `validateIngredient()`  [EXTRACTED]
  scripts/generate-curated-grocery-cache.ts → src/lib/ingredient-validator.ts
- `CombineIngredientsPage()` --calls--> `useColorScheme()`  [INFERRED]
  src/app/combine-ingredients.tsx → src/lib/useColorScheme.web.ts

## Communities (98 total, 8 thin omitted)

### Community 0 - "Package Mobile Components"
Cohesion: 0.01
Nodes (136): dependencies, @babel/plugin-proposal-export-namespace-from, @bottom-tabs/react-navigation, burnt, clsx, @codeherence/react-native-header, date-fns, eventemitter3 (+128 more)

### Community 1 - "Lib Database Components"
Cohesion: 0.07
Nodes (47): ensureUserTableEntry(), clearCheckedGroceryItems(), clearMealSlotsInRange(), clearUserGroceryItems(), DbMealSlot, DbUser, DbUserPreferences, deleteCookingLog() (+39 more)

### Community 2 - "Components Vibe Components"
Cohesion: 0.07
Nodes (36): EASE, HERO_HEIGHT, VibeCookingScreen(), { width: SCREEN_W }, CookStepCard(), CookStepCardProps, EASE, IngredientCheckRow() (+28 more)

### Community 3 - "Lib Plan Components"
Cohesion: 0.09
Nodes (38): getScheduledMeals(), buildFamilyBudgetMeals(), BUY_OUT_DINNER, BUY_OUT_LUNCH, FAMILY_BUDGET_BANK, GRAB_GO_BREAKFAST, RECIPES, BreakfastPref (+30 more)

### Community 4 - "Lib Revenuecatclient Components"
Cohesion: 0.08
Nodes (32): EASE, headlineForGeneratingStage(), headlineForTrigger(), PaywallSheet(), PaywallSheetProps, personaSublineFor(), PREMIUM_BENEFITS, styles (+24 more)

### Community 5 - "Eas Mobile Components"
Cohesion: 0.06
Nodes (36): distribution, build, development, preview, production, cli, version, developmentClient (+28 more)

### Community 6 - "Lib Behavior Components"
Cohesion: 0.08
Nodes (30): formatDateChip(), MEAL_TYPES, PeriodId, PERIODS, WEEKDAYS, BehaviorInsights, buildWeekStrip(), composeEnrichedInstructions() (+22 more)

### Community 7 - "Lib Openai Components"
Cohesion: 0.08
Nodes (31): determineIngredientCategory(), logIngredientValidationIssues(), BREAKFAST_DESSERT_TAGS, buildExcludeTerms(), callOpenAIDirect(), callOpenAIForRecipe(), COOKED_PLATED_TAGS, COOKING_FORM_TERMS (+23 more)

### Community 8 - "App Lib Components"
Cohesion: 0.10
Nodes (24): queryClient, RootLayoutNav(), unstable_settings, useProtectedRoute(), getTimeOfDayGreeting(), HERO_VIDEO, LoginScreen(), { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } (+16 more)

### Community 9 - "Onboarding App Components"
Cohesion: 0.06
Nodes (24): ALLERGY_OPTIONS, BREAKFAST_HABITS, COMMON_PANTRY, CUISINE_OPTIONS, CUISINE_PANTRY_MAP, DIETARY_OPTIONS, DINNER_HABITS, EQUIPMENT_OPTIONS (+16 more)

### Community 10 - "Options Components Components"
Cohesion: 0.12
Nodes (26): EditProfileModalProps, HouseholdDropdown(), MultiSelectSection(), MultiSelectSectionProps, useStyles(), Chip(), CLEAR, { height: SCREEN_HEIGHT } (+18 more)

### Community 11 - "App Mobile Components"
Cohesion: 0.06
Nodes (30): edgeToEdgeEnabled, package, versionCode, projectId, typedRoutes, expo, android, experiments (+22 more)

### Community 12 - "Plan Lib Components"
Cohesion: 0.14
Nodes (22): CuratedMealPlanScreen(), CuratedPlanDetailScreen(), splitForItalic(), PnPSpecialCard(), PnPSpecialCardProps, PnPSpecialsProps, SocialProofRow(), SocialProofRowProps (+14 more)

### Community 13 - "Lib Store Components"
Cohesion: 0.08
Nodes (19): CachedGroceryItem, CURATED_GROCERY_CACHE, getSkipReasonEffect(), SkipReasonEffect, applySkipEffectFromLog(), defaultPreferences, Household, INGREDIENT_CATEGORY_MAP (+11 more)

### Community 14 - "Components Src Components"
Cohesion: 0.15
Nodes (19): CombineIngredientsPage(), CATEGORY_OPTIONS, ImportReviewScreen(), AccountManagementModal(), AccountManagementModalProps, ModalType, PausedAccountOverlay(), PausedFeatureBanner() (+11 more)

### Community 15 - "Ingredient Rules Components"
Cohesion: 0.11
Nodes (26): CANONICAL_COUNT, CANONICAL_LIQUIDS, CanonicalFamily, CanonicalGroceryUnit, classifyUnitToType(), convertToCanonicalGroceryBase(), DENSITY_G_PER_CUP, densityForCup() (+18 more)

### Community 16 - "Ingredient Lib Components"
Cohesion: 0.11
Nodes (20): INGREDIENT_ALIASES, normalizeIngredientName(), normalizeUnit(), shouldCombineIngredients(), UNIT_ALIASES, DEFAULT_QUANTITIES_BY_INGREDIENT, DEFAULT_UNITS_BY_INGREDIENT, getCorrectCategory() (+12 more)

### Community 17 - "Lib Conversion Components"
Cohesion: 0.13
Nodes (15): AVERAGE_WEIGHT_LOOKUP_AU, AverageWeightEntry, ConfidenceLevel, getAverageWeightWithConfidence(), hasHighConfidenceWeight(), shouldConvertCountToWeight(), ConversionMetadata, ConversionTracker (+7 more)

### Community 18 - "Mobile Package Components"
Cohesion: 0.08
Nodes (26): devDependencies, @babel/core, babel-plugin-module-resolver, blurhash, eslint, eslint-config-expo, eslint-config-prettier, eslint-plugin-prettier (+18 more)

### Community 19 - "Tabs Grocery Components"
Cohesion: 0.09
Nodes (19): AddItemModal(), AddItemModalProps, CATEGORY_CONFIG, CATEGORY_TINT, DateRangePickerModal(), DateRangePickerModalProps, DAYS, editDistance() (+11 more)

### Community 20 - "Lib Recipe Components"
Cohesion: 0.13
Nodes (20): extractProteinsFromRecipe(), GeneratedRecipeResponse, GenerateRecipeParams, parseFridgeIngredients(), parseFridgeIngredientsWithQuantity(), regenerateSingleRecipe(), calculateMaxRepeats(), estimateGenerationTime() (+12 more)

### Community 21 - "Components Tabs Components"
Cohesion: 0.10
Nodes (20): ConfirmDialog(), ConfirmDialogProps, eyebrowStyle, MealCard(), MealCardMeta, MealCardProps, MealCardState, MealTag (+12 more)

### Community 22 - "App Curated Components"
Cohesion: 0.10
Nodes (20): addDays(), ApplyStage, BREAKFAST_HABITS, CuratedPlanSetupScreen(), DAY_LABELS, daysInclusive(), DINNER_HABITS, formatDateKey() (+12 more)

### Community 23 - "Recipe App Components"
Cohesion: 0.10
Nodes (15): AnimatedCircle, LOADER_LABELS_PLAN, LOADER_LABELS_RECIPE, MEAL_TYPE_TINT, MEAL_TYPES, STOCK_IMAGES, WEEKDAYS, InferredFridgeChips() (+7 more)

### Community 24 - "Tabs Preferences Components"
Cohesion: 0.13
Nodes (19): EditProfileModal(), useBehaviorInsights(), formatGapDays(), formatUsualDay(), formatUsualHour(), servingSizeFromHousehold(), useAccountStatus(), useIsPremium() (+11 more)

### Community 25 - "Lib High Components"
Cohesion: 0.11
Nodes (22): BATCH_MAINS, BatchBlock, BatchConfig, BREAKFAST_WEEKDAY_EASY, BREAKFAST_WEEKEND_COOK, breakfastMeal(), buildHighProteinMeals(), BUY_OUT_DINNER (+14 more)

### Community 26 - "Duplicaterecipemodal Components Components"
Cohesion: 0.12
Nodes (18): areDuplicates(), COOKING_FORMAT_WORDS, DESCRIPTOR_WORDS, DuplicateBanner(), DuplicateBannerProps, DuplicateGroup, DuplicateRecipeModal(), DuplicateRecipeModalProps (+10 more)

### Community 27 - "Lib Components Components"
Cohesion: 0.15
Nodes (20): SlotEntry, actionPillStyle, MealSlotSheet(), MealSlotSheetProps, ServingAdjustmentModalProps, RecipeAllergenInfo, UserData, ActiveNudge (+12 more)

### Community 28 - "Components Vibeslider Components"
Cohesion: 0.13
Nodes (14): PlanRatingPrompt(), PlanRatingPromptProps, CAPTIONS, deriveCookAgain(), LABELS, POSITIONS, styles, VibePosition (+6 more)

### Community 29 - "Lib Recipeimport Components"
Cohesion: 0.18
Nodes (18): IngredientInput, ImportMethod, ImportRecipeScreen(), DbGroceryItem, DbRecipe, isOpenAIConfigured(), callOpenAIDirect(), cleanHtmlContent() (+10 more)

### Community 30 - "Lib Unit Components"
Cohesion: 0.16
Nodes (16): shouldCombineWithExisting(), canCombineIngredients(), convertToBaseUnit(), COUNT_UNITS, getBaseUnit(), getBaseUnitCategory(), getCanonicalUnit(), getVolumeType() (+8 more)

### Community 31 - "Lib Picks Components"
Cohesion: 0.22
Nodes (17): detectActiveMealTypes(), detectUserPatterns(), fitsPrepTime(), getCurrentWeekKey(), getDateNDaysAgo(), getPatternBasedPicks(), getRuleBasedPicks(), hashPreferences() (+9 more)

### Community 32 - "Nudge Engine Components"
Cohesion: 0.25
Nodes (17): addDays(), currentWeekSundayKey(), formatLocalDateKey(), getUnloggedPastWeekMeals(), getWeeklyRatingRecipeIds(), isConfirmWeeklyDismissed(), isPastFirstWeekSinceSignup(), isSundayEvening() (+9 more)

### Community 33 - "Lib Meal Components"
Cohesion: 0.16
Nodes (17): BREAKFAST_INDICATORS, ClassificationResult, classifyRecipeByContent(), DINNER_INDICATORS, getClassificationReport(), LUNCH_INDICATORS, MealTypeScore, scoreRecipeForMealType() (+9 more)

### Community 34 - "Curated App Components"
Cohesion: 0.14
Nodes (11): CuratedPlanBrowseScreen(), lastWord(), MEAL_TYPE_ICON, MEAL_TYPE_ORDER, { width: SCREEN_WIDTH }, DishImage(), DishImageProps, CuratedMeal (+3 more)

### Community 35 - "Index Supabase Components"
Cohesion: 0.24
Nodes (5): callGemini(), convertMessagesToGemini(), verifyAuth(), corsHeaders, checkRateLimit()

### Community 36 - "Lib Subscription Components"
Cohesion: 0.22
Nodes (13): PaywallRedirect(), PlanMealsScreen(), PostSignupWelcome(), styles, UnlockReminderPill(), RecipeFeature, usedField(), PaywallTrigger (+5 more)

### Community 37 - "Package Mobile Components"
Cohesion: 0.12
Nodes (15): main, name, private, scripts, android, ios, lint, postinstall (+7 more)

### Community 38 - "App Tabs Components"
Cohesion: 0.20
Nodes (13): AddRecipeScreen(), GenerateRecipeScreen(), RootLayout(), OnboardingScreen(), RecipeDetailScreen(), PendingGenerationBanner(), useActiveNudge(), useRecipeFeatureGate() (+5 more)

### Community 39 - "Lib Ingredient Components"
Cohesion: 0.15
Nodes (7): AggregatedIngredient, aggregateIngredientsIntelligent(), formatIngredientQuantity(), CombinedIngredient, SimilarIngredient, NormalizedIngredient, formatFromBaseUnit()

### Community 40 - "Lib Api Components"
Cohesion: 0.21
Nodes (8): ParsedRecipe, apiCall(), apiDelete(), apiFormCall(), ApiResponse, EdgeFunctionResponse, getValidAccessToken(), supabase

### Community 41 - "Image Library Components"
Cohesion: 0.26
Nodes (13): calculateMatchScore(), DISH_TYPES, entryHasProtein(), extractMeaningfulWords(), extractProtein(), IGNORE_WORDS, IMAGE_LIBRARY, ImageLibraryEntry (+5 more)

### Community 42 - "Cookconfirmsheet Components Components"
Cohesion: 0.22
Nodes (11): CookConfirmSheet(), CookConfirmSheetProps, journalSentence(), MEAL_LABEL, MealPage(), PageMode, SKIP_REASONS, SlotLog (+3 more)

### Community 43 - "Components Quickactions Components"
Cohesion: 0.18
Nodes (8): DEFAULT_ACTIONS, QuickActionItem, QuickActions(), QuickActionsProps, SECONDARY_ACCENTS, THUMB_OPACITY, VibeHeartIcon(), VibeHeartIconProps

### Community 44 - "Lib Duplicate Components"
Cohesion: 0.29
Nodes (8): areDuplicateIngredients(), DuplicateIngredientGroup, findDuplicateIngredientGroups(), getCoreWords(), getSignificantWords(), MODIFIER_WORDS, STOP_WORDS, wordOverlapScore()

### Community 45 - "Scripts Test Components"
Cohesion: 0.20
Nodes (7): applyCuratedMealPlan(), CURATED_MEAL_PLANS, milks, plan, store, updatedStore, plan

### Community 46 - "Lib Upload Components"
Cohesion: 0.20
Nodes (7): AnimatedScrollView, { width: SCREEN_WIDTH }, PickedFile, pickImage(), takePhoto(), uploadFile(), UploadResult

### Community 47 - "Scripts Generate Components"
Cohesion: 0.29
Nodes (10): computeBlurhash(), DATA_FILES, __dirname, fetchImageBytes(), findImgConst(), hasNearbyBlurhash(), injectBlurhash(), LIB_DIR (+2 more)

### Community 48 - "Components Profilesetupmodal Components"
Cohesion: 0.24
Nodes (9): getTimeGreetingWord(), HomeHeader(), HomeHeaderProps, DEFAULT_AVATARS, ProfileSetupModal(), ProfileSetupModalProps, UserAvatarDisplay(), UserAvatarProps (+1 more)

### Community 49 - "Pagersheet Components Components"
Cohesion: 0.25
Nodes (7): EASE_OUT, PagerSheet(), PagerSheetHeader, PagerSheetProps, renderTitleWithEmphasis(), styles, { width: SCREEN_WIDTH }

### Community 50 - "Components Pendinggenerationbanner Components"
Cohesion: 0.22
Nodes (5): DayPillProps, EASE, FINALIZING_CAPTIONS, GENERATING_CAPTIONS, PendingGenerationBannerProps

### Community 51 - "Ingredient Lib Components"
Cohesion: 0.33
Nodes (8): classifyUnitType(), DESCRIPTORS_TO_STRIP, getAverageWeightPerPiece(), INGREDIENT_AVERAGE_WEIGHTS_LEGACY, normalizeIngredientForAggregation(), normalizeIngredientName(), stripDescriptors(), UnitType

### Community 52 - "Weekstrip Components Components"
Cohesion: 0.22
Nodes (5): DayData, DayStatus, STATUS_COLORS, WeekStrip(), WeekStripProps

### Community 53 - "Lib Recipe Components"
Cohesion: 0.46
Nodes (7): getCanonicalIngredientName(), curatedNameSlug(), findExistingRecipe(), getRecipeDedupKey(), ingredientSignature(), normalizeRecipeName(), normalizeRecipeSourceUrl()

### Community 54 - "Errorboundary Components Components"
Cohesion: 0.25
Nodes (4): ErrorBoundary, Props, State, styles

### Community 55 - "Lib Unit Components"
Cohesion: 0.25
Nodes (7): butter1, butter2, displayButter, displayOil, oil1, oil2, smallVolume

### Community 56 - "Lib Allergy Components"
Cohesion: 0.36
Nodes (7): ALLERGEN_KEYWORDS, AllergenMatch, checkMealPlanForAllergens(), checkRecipeForAllergens(), formatAllergenWarning(), getUniqueAllergens(), ingredientContainsAllergen()

### Community 57 - "App Select Components"
Cohesion: 0.29
Nodes (6): DAY_LETTERS_FULL, eyebrow, formatLocalDateKey(), MEAL_TYPES, RecipeItemProps, SelectRecipeScreen()

### Community 58 - "Pnpfavorites Components Components"
Cohesion: 0.25
Nodes (3): FavoriteRecipe, PnPFavorites(), PnPFavoritesProps

### Community 59 - "Config Metro Components"
Cohesion: 0.25
Nodes (7): config, fs, { getDefaultConfig }, path, sharedFolder, sharedFolderExists, { withNativeWind }

### Community 60 - "Tsconfig Mobile Components"
Cohesion: 0.25
Nodes (7): compilerOptions, paths, strict, exclude, extends, include, @/*

### Community 61 - "Duplicateingredientmodal Components Components"
Cohesion: 0.25
Nodes (6): ConfirmationState, DuplicateIngredientBanner(), DuplicateIngredientBannerProps, DuplicateIngredientGroup, DuplicateIngredientModal(), DuplicateIngredientModalProps

### Community 62 - "Lib Picks Components"
Cohesion: 0.39
Nodes (7): validateIngredients(), generateRecipe(), generateAIPicks(), generateLocalId(), PLACEHOLDER_IMAGES, buildPersonaInstructions(), mergePersonaWithUserInstructions()

### Community 63 - "Lib Rate Components"
Cohesion: 0.39
Nodes (6): checkRateLimit(), getDetailedStatus(), getRateLimitStatus(), getRemainingCallsText(), incrementRateLimit(), RateLimitStatus

### Community 64 - "Lib Quick Components"
Cohesion: 0.57
Nodes (6): deduplicateRecipes(), getFavoriteRecipes(), getPreferenceMatchedRecipes(), getQuickAddRecipes(), getQuickAddRecipesFlat(), getRecentlyUsedRecipes()

### Community 65 - "Lib Email Components"
Cohesion: 0.38
Nodes (4): markWelcomeEmailSent(), sendVerificationEmail(), sendWelcomeEmail(), wasWelcomeEmailSent()

### Community 66 - "Lib Openai Components"
Cohesion: 0.38
Nodes (7): calculateRequiredProteinDiversity(), classifyRecipeFamily(), generateMealPlan(), isSameRecipeFamily(), validateProteinDiversity(), validateRecipeAgainstPreferences(), validateRecipeDistinctness()

### Community 67 - "Lib Category Components"
Cohesion: 0.29
Nodes (6): CATEGORY_PATTERNS, EXCLUSION_PATTERNS, getCategoryGuidancePrompt(), IngredientCategory, getMealTypePromptGuidance(), buildSingleRecipePrompt()

### Community 68 - "Monthyearpicker Components Components"
Cohesion: 0.33
Nodes (5): MONTHS, MonthYearPicker(), MonthYearPickerProps, SHORT_MONTHS, styles

### Community 69 - "Functions Deno Components"
Cohesion: 0.33
Nodes (5): compilerOptions, lib, strict, imports, @supabase/supabase-js

### Community 70 - "Lib Picks Components"
Cohesion: 0.53
Nodes (5): buildKey(), CacheEntry, clearCachedAIPicks(), getCachedAIPicks(), setCachedAIPicks()

### Community 71 - "Picksforyou Components Components"
Cohesion: 0.40
Nodes (3): mockPicks, PickItem, PicksForYouProps

### Community 74 - "Eslint Config Components"
Cohesion: 0.50
Nodes (3): { defineConfig }, expoConfig, pluginQuery

### Community 75 - "Shoppinglistcompletionmodal Components Components"
Cohesion: 0.50
Nodes (3): ShoppingListCompletionModal(), ShoppingListCompletionModalProps, styles

### Community 76 - "Lib Store Components"
Cohesion: 0.50
Nodes (4): GroceryItem, SavedGroceryList, InferLikelyFridgeIngredientsInput, GroceryItemRowProps

### Community 80 - "Lib Database Components"
Cohesion: 0.67
Nodes (3): AccountStatus, UserSubscription, SubscriptionStore

## Knowledge Gaps
- **611 isolated node(s):** `name`, `slug`, `version`, `scheme`, `orientation` (+606 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Recipe` connect `Lib Components Components` to `Lib Database Components`, `Components Vibe Components`, `Lib Plan Components`, `Lib Behavior Components`, `Lib Store Components`, `Components Src Components`, `Components Tabs Components`, `Recipe App Components`, `Lib High Components`, `Duplicaterecipemodal Components Components`, `Components Vibeslider Components`, `Lib Picks Components`, `Nudge Engine Components`, `Lib Meal Components`, `Curated App Components`, `Lib Api Components`, `Cookconfirmsheet Components Components`, `Lib Upload Components`, `Lib Recipe Components`, `Lib Allergy Components`, `App Select Components`, `Pnpfavorites Components Components`, `Lib Picks Components`, `Lib Quick Components`, `Lib Picks Components`, `Lib Store Components`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `useMealPlanStore` connect `App Tabs Components` to `Components Vibe Components`, `Lib Revenuecatclient Components`, `Lib Behavior Components`, `App Lib Components`, `Onboarding App Components`, `Options Components Components`, `Plan Lib Components`, `Lib Store Components`, `Components Src Components`, `Tabs Grocery Components`, `Components Tabs Components`, `App Curated Components`, `Recipe App Components`, `Tabs Preferences Components`, `Duplicaterecipemodal Components Components`, `Lib Subscription Components`, `Lib Api Components`, `Scripts Test Components`, `Lib Upload Components`, `Components Pendinggenerationbanner Components`, `App Select Components`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `useAuthStore` connect `App Lib Components` to `Lib Subscription Components`, `App Tabs Components`, `Lib Behavior Components`, `Onboarding App Components`, `Options Components Components`, `Lib Store Components`, `Components Src Components`, `Components Profilesetupmodal Components`, `Tabs Grocery Components`, `Components Tabs Components`, `App Curated Components`, `Recipe App Components`, `Tabs Preferences Components`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `name`, `slug`, `version` to the rest of the system?**
  _611 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Package Mobile Components` be split into smaller, more focused modules?**
  _Cohesion score 0.014705882352941176 - nodes in this community are weakly interconnected._
- **Should `Lib Database Components` be split into smaller, more focused modules?**
  _Cohesion score 0.07390648567119155 - nodes in this community are weakly interconnected._
- **Should `Components Vibe Components` be split into smaller, more focused modules?**
  _Cohesion score 0.07312925170068027 - nodes in this community are weakly interconnected._