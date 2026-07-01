import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import * as db from './database';
import { useAuthStore } from './auth-store';
import { useReviewStore } from './review-store';
import { normalizeIngredientName, getCanonicalIngredientName, shouldCombineIngredients, normalizeUnit } from './ingredient-aliases';
import { convertToBaseUnit, formatFromBaseUnit, canCombineIngredients, getCanonicalUnit } from './unit-conversion';
import { getAverageWeightWithConfidence, shouldConvertCountToWeight, getContainerVolumeML, getLiquidDensityGPerMl } from './average-weight-lookup-au';
import { validateIngredient, validateIngredients, splitCompoundIngredient } from './ingredient-validator';
import { generateRecipesOptimized } from './optimized-recipe-generation';
import { generateRecipeImage, type MealType, type GeneratedRecipeResponse } from './openai';
import {
  computeTasteProfile as deriveTasteProfile,
  composeTasteSignalsForGeneration,
  type TasteProfile,
} from './taste-profile';
import { getSkipReasonEffect } from './skip-reason-handler';
import { findExistingRecipe, normalizeRecipeSourceUrl } from './recipe-identity';
import { CURATED_GROCERY_CACHE } from './curated-grocery-cache';

// Debounce map to prevent cascading syncs
const mealSlotSyncQueue = new Map<string, ReturnType<typeof setTimeout>>();

// Seed Unsplash URLs used as placeholder hero images during the
// per-recipe streaming generation flow (see startBackgroundGeneration).
// Exported so other surfaces (e.g. the QuickActions thumbnail stack on
// the home tab) can filter them OUT when picking "real" recipe images
// to surface — a stock placeholder isn't a real personalized preview.
export const STOCK_RECIPE_PLACEHOLDER_IMAGES: readonly string[] = [
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400',
  'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400',
] as const;

export function isStockPlaceholderImage(url: string | undefined | null): boolean {
  if (!url) return false;
  return STOCK_RECIPE_PLACEHOLDER_IMAGES.includes(url);
}

// Mapping from temporary IDs to real database UUIDs.
// When addRecipe inserts into the DB and gets a real UUID back, it records
// the swap here so that stale closures (e.g. image generation callbacks)
// can resolve a temp ID to the real one.
const tempIdToRealId = new Map<string, string>();

/**
 * Canonical category mapping for ingredients
 * This ensures the same ingredient always goes to the same category
 * regardless of what the AI returns
 */
const INGREDIENT_CATEGORY_MAP: Record<string, 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other'> = {
  // Meat & Seafood - always in meat category
  'chicken': 'meat',
  'beef': 'meat',
  'pork': 'meat',
  'lamb': 'meat',
  'turkey': 'meat',
  'duck': 'meat',
  'fish': 'meat',
  'salmon': 'meat',
  'tuna': 'meat',
  'cod': 'meat',
  'shrimp': 'meat',
  'prawn': 'meat',
  'crab': 'meat',
  'lobster': 'meat',
  'anchovy': 'meat',
  'anchovy fillet': 'meat',
  'bacon': 'meat',
  'ham': 'meat',
  'sausage': 'meat',
  'mince': 'meat',
  'ground beef': 'meat',
  'ground pork': 'meat',
  'ground chicken': 'meat',
  'steak': 'meat',

  // Dairy - always in dairy category
  'milk': 'dairy',
  'cheese': 'dairy',
  'butter': 'dairy',
  'cream': 'dairy',
  'yogurt': 'dairy',
  'yoghurt': 'dairy',
  'sour cream': 'dairy',
  'mozzarella': 'dairy',
  'mozzarella ball': 'dairy',
  'parmesan': 'dairy',
  'cheddar': 'dairy',
  'feta': 'dairy',
  'egg': 'dairy',
  'eggs': 'dairy',

  // Produce - fresh vegetables and fruits
  'tomato': 'produce',
  'onion': 'produce',
  'garlic': 'produce',
  'carrot': 'produce',
  'celery': 'produce',
  'potato': 'produce',
  'bell pepper': 'produce',
  'lettuce': 'produce',
  'spinach': 'produce',
  'broccoli': 'produce',
  'cucumber': 'produce',
  'lemon': 'produce',
  'lime': 'produce',
  'ginger': 'produce',
  'basil': 'produce',
  'parsley': 'produce',
  'cilantro': 'produce',
  'coriander': 'produce',
  'mint': 'produce',
  'thyme': 'produce',
  'rosemary': 'produce',
  'olive': 'produce',
  'black olive': 'produce',
  'caper': 'produce',
  'mushroom': 'produce',
  'zucchini': 'produce',
  'eggplant': 'produce',
  'avocado': 'produce',
  'apple': 'produce',
  'banana': 'produce',
  'orange': 'produce',

  // Pantry - shelf-stable items
  'olive oil': 'pantry',
  'oil': 'pantry',
  'vegetable oil': 'pantry',
  'sesame oil': 'pantry',
  'vinegar': 'pantry',
  'balsamic': 'pantry',
  'balsamic glaze': 'pantry',
  'soy sauce': 'pantry',
  'salt': 'pantry',
  'sea salt': 'pantry',
  'black pepper': 'pantry',
  'ground pepper': 'pantry',
  'sugar': 'pantry',
  'flour': 'pantry',
  'rice': 'pantry',
  'pasta': 'pantry',
  'spaghetti': 'pantry',
  'penne': 'pantry',
  'noodle': 'pantry',
  'canned tomato': 'pantry',
  'tomato paste': 'pantry',
  'tomato sauce': 'pantry',
  'broth': 'pantry',
  'stock': 'pantry',
  'honey': 'pantry',
  'maple syrup': 'pantry',
  'paprika': 'pantry',
  'cumin': 'pantry',
  'oregano': 'pantry',
  'red pepper flake': 'pantry',
  'chili flake': 'pantry',
  // Spices + dry pantry — without these, ingredients fall through to the
  // recipe's own AI-tagged category and the same item can land in two
  // categories across recipes (which makes the aggregation key drift and
  // produces duplicate rows in the grocery list).
  'cinnamon': 'pantry',
  'nutmeg': 'pantry',
  'clove': 'pantry',
  'cardamom': 'pantry',
  'turmeric': 'pantry',
  'coriander seed': 'pantry',
  'mustard seed': 'pantry',
  'fennel seed': 'pantry',
  'bay leaf': 'pantry',
  'vanilla': 'pantry',
  'vanilla extract': 'pantry',
  'baking soda': 'pantry',
  'baking powder': 'pantry',
  'cocoa': 'pantry',
  'cocoa powder': 'pantry',
  'chia seed': 'pantry',
  'flax seed': 'pantry',
  'sesame seed': 'pantry',
  'sunflower seed': 'pantry',
  'pumpkin seed': 'pantry',
  // Grains, cereals, legumes
  'oat': 'pantry',
  'rolled oat': 'pantry',
  'quinoa': 'pantry',
  'couscous': 'pantry',
  'barley': 'pantry',
  'lentil': 'pantry',
  'chickpea': 'pantry',
  'black bean': 'pantry',
  'kidney bean': 'pantry',
  // Nuts + nut butters
  'walnut': 'pantry',
  'almond': 'pantry',
  'pecan': 'pantry',
  'cashew': 'pantry',
  'pistachio': 'pantry',
  'hazelnut': 'pantry',
  'peanut': 'pantry',
  'peanut butter': 'pantry',
  'almond butter': 'pantry',
  'tahini': 'pantry',
  // Dried fruit + sweeteners
  'raisin': 'pantry',
  'date': 'pantry',
  'cranberry': 'pantry',

  // Bakery
  'bread': 'bakery',
  'bun': 'bakery',
  'roll': 'bakery',
  'tortilla': 'bakery',
  'pita': 'bakery',
};

/**
 * Get the canonical category for an ingredient
 * This ensures consistent categorization across recipes
 */
function getCanonicalCategory(
  ingredientName: string,
  originalCategory: 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other'
): 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other' {
  const normalized = normalizeIngredientName(ingredientName).toLowerCase();

  // Check exact match first
  if (INGREDIENT_CATEGORY_MAP[normalized]) {
    return INGREDIENT_CATEGORY_MAP[normalized];
  }

  // Check if any key is contained in the normalized name
  for (const [key, category] of Object.entries(INGREDIENT_CATEGORY_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return category;
    }
  }

  // Fallback to original category
  return originalCategory;
}

/**
 * Combine two base-unit amounts of the SAME ingredient that may be in
 * different base systems (g / ml / piece).
 *
 * Used by the manual "combine duplicates" flow so that, e.g., merging
 * "200 g chicken" with "2 pieces chicken" sums correctly as grams (via the
 * count→weight table) instead of numerically mixing g and piece. Container
 * liquids reconcile count→volume the same way ("1 can coconut milk" + "400 ml"
 * → 800 mL).
 *
 * Falls back to a numeric add in the first amount's unit when no safe
 * conversion exists (genuinely incompatible, e.g. g + ml, or a counted item
 * with no average-weight / container-volume lookup).
 */
function combineBaseAmounts(
  qtyA: number,
  unitA: string,
  qtyB: number,
  unitB: string,
  ingredientName: string,
): { quantity: number; unit: string } {
  if (unitA === unitB) return { quantity: qtyA + qtyB, unit: unitA };

  const nameKey = normalizeIngredientName(ingredientName);
  const sides = [
    { qty: qtyA, unit: unitA },
    { qty: qtyB, unit: unitB },
  ];
  const countSide = sides.find((s) => s.unit === 'piece');
  const gramSide = sides.find((s) => s.unit === 'g');
  const mlSide = sides.find((s) => s.unit === 'ml');

  // count + weight → grams
  if (countSide && gramSide && shouldConvertCountToWeight(nameKey)) {
    const lookup = getAverageWeightWithConfidence(nameKey);
    if (lookup) {
      return { quantity: gramSide.qty + countSide.qty * lookup.weightG, unit: 'g' };
    }
  }

  // count + volume (container liquid) → millilitres
  if (countSide && mlSide) {
    const perMl = getContainerVolumeML(nameKey);
    if (perMl) {
      return { quantity: mlSide.qty + countSide.qty * perMl, unit: 'ml' };
    }
  }

  // weight + volume (known liquid) → reconcile via density, in the first
  // amount's unit. e.g. "200 g honey" + "30 mL honey" (density 1.42 g/mL).
  if (gramSide && mlSide) {
    const density = getLiquidDensityGPerMl(nameKey); // g per mL
    if (density) {
      return unitA === 'ml'
        ? { quantity: mlSide.qty + gramSide.qty / density, unit: 'ml' }
        : { quantity: gramSide.qty + mlSide.qty * density, unit: 'g' };
    }
  }

  // No safe conversion: keep the first amount's unit and add numerically.
  return { quantity: qtyA + qtyB, unit: unitA };
}

function debounceMealSlotSync(userId: string, slot: MealSlot, delayMs: number = 100) {
  const key = `${userId}:${slot.id}`;

  // Clear existing timer
  if (mealSlotSyncQueue.has(key)) {
    clearTimeout(mealSlotSyncQueue.get(key)!);
  }

  // Set new timer
  const timer = setTimeout(() => {
    db.upsertMealSlot(userId, slot).then((dbId) => {
      if (dbId && dbId !== slot.id) {
        console.log(`Meal slot ID updated in DB: ${slot.id} -> ${dbId}`);
        // Lazily update the store state directly (avoids TDZ reference issues)
        const currentState = useMealPlanStore.getState();
        useMealPlanStore.setState({
          mealSlots: currentState.mealSlots.map((s) =>
            s.id === slot.id ? { ...s, id: dbId } : s
          ),
        });
      }
    });
    mealSlotSyncQueue.delete(key);
  }, delayMs);

  mealSlotSyncQueue.set(key, timer);
}

// Types
export interface Ingredient {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  category: 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other';
  // Base unit storage for aggregation
  quantity_base?: number; // normalized quantity in base unit (ml, g, or piece)
  base_unit?: string; // base unit: ml, g, or piece
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  // Optional blurhash for `imageUrl` — generated offline by
  // scripts/generate-blurhashes.ts for curated recipes. When present,
  // <DishImage> paints it instantly while the WebP streams in. Optional
  // because user-imported / AI-generated recipes won't have one.
  blurhash?: string;
  cookTime: number; // in minutes
  prepTime: number; // in minutes
  servings: number;
  ingredients: Ingredient[];
  instructions: string[];
  tags: string[];
  calories?: number;
  isAIGenerated: boolean;
  isImported?: boolean; // true if imported from URL/text/image
  sourceUrl?: string; // original URL if imported from web
  isSaved: boolean;
  createdAt: string;
  violations?: string[]; // Allergen and preference violations for display
  // Stable identity for curated-plan recipes (e.g. "healthy-week::greek-yogurt-parfait").
  // Set once when a curated recipe is first applied; used by addRecipe's upsert so
  // re-applying the same curated plan reuses this row instead of duplicating it.
  // Immune to the user renaming their copy (the key is never recomputed from `name`).
  curatedSourceId?: string;
}

export interface MealSlot {
  id: string;
  date: string; // ISO date string
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  recipeId: string | null;
  customMealName?: string;
  servingOverride?: number; // Custom serving size for this meal slot
  curatedPlanId?: string; // Track which curated plan this meal came from
}

// ───────────────────────── Nudge engine types ─────────────────────────
export type CookStatus = 'cooked' | 'skipped' | 'swapped';
export type SkipReason =
  | 'no_time'
  | 'didnt_feel_like'
  | 'missing_ingredients'
  | 'takeout'
  | 'leftovers';
export type CookAgainIntent = 'yes' | 'maybe' | 'no';

export interface CookingLog {
  id: string;
  slotId: string;
  recipeId: string | null;
  status: CookStatus;
  cookedAt: string;
  skipReason?: SkipReason;
  actualMealEaten?: string;
  // ── Vibe Cooking signals ──
  // Set when the log originates from the Vibe Cooking flow (single-tap
  // mood-led cook). Feeds vibe-inference + the end-of-cook rating.
  vibeId?: string;
  // 1-5 emoji-face rating captured on the Vibe Cooking end state.
  // Optional: a user can finish a cook without rating it.
  vibeRating?: 1 | 2 | 3 | 4 | 5;
}

export interface RecipeRating {
  id: string;
  recipeId: string;
  stars: 1 | 2 | 3 | 4 | 5;
  cookAgain?: CookAgainIntent;
  ratedAt: string;
}

// Per-curated-plan rating. Parallel entity to RecipeRating —
// distinct enough that we want a separate row (planId vs recipeId,
// different prompt surface, different aggregation downstream) but
// the persistence + sync pattern is identical.
export interface MealPlanRating {
  id: string;
  planId: string;            // CuratedMealPlan.id
  stars: 1 | 2 | 3 | 4 | 5;
  cookAgain?: CookAgainIntent;
  ratedAt: string;
}

// One entry per PnP-Suggests generation that successfully produced
// recipes. Powers the Behavior Intelligence engine (planning habit,
// adaptive overdue flag, etc). Append-only, capped at 100 entries.
export interface PlanningEvent {
  id: string;
  createdAt: string;          // ISO timestamp of the tap → success moment
  days: number;               // plan length chosen at generation time
  mealTypes: Array<'breakfast' | 'lunch' | 'dinner' | 'snack'>; // which meal slots the user filled
}

// Ephemeral state describing an in-flight background generation job.
// Drives the top-of-tab "Crafting your week" progress banner. NOT
// persisted — if the app is killed mid-generation, the partial slots
// stay (they were already saved), but the banner clears on restart.
export interface PendingGenerationState {
  active: boolean;
  total: number;             // total recipes expected from the engine
  completed: number;         // total recipes accepted so far
  // Pill-row state. `days` is the number of pill segments to render;
  // `mealTypesPerDay` is the divisor for each pill's sub-fill width;
  // `dayRecipeCounts[i]` is how many recipes have landed for day i so
  // far (drives that pill's partial-fill bar AND determines when the
  // pill pops to fully-sage). `completedDays` is derived (count of
  // entries in dayRecipeCounts that have hit mealTypesPerDay) — kept
  // as a separate field so the eyebrow "DAY X OF Y" copy can read it
  // without recomputing every render.
  days: number;
  mealTypesPerDay: number;
  dayRecipeCounts: number[];
  completedDays: number;
  stage: 'starting' | 'generating' | 'finalizing' | 'done' | 'failed';
  startedAt: string;
  error?: string;
}

export interface GroceryItem {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  category: Ingredient['category'];
  isChecked: boolean;
  recipeIds: string[]; // recipes this item is from
  // Base unit storage for aggregation
  quantity_base?: number; // normalized quantity in base unit (ml, g, or piece)
  base_unit?: string; // base unit: ml, g, or piece
}

export interface SavedGroceryList {
  id: string;
  name: string;
  items: GroceryItem[];
  createdAt: string;
}

export interface SimilarIngredientVariant {
  itemId: string;
  displayName: string;
  quantity: number;
  baseUnit: string;
  displayQuantity: string;
}

export interface SimilarIngredientGroup {
  id: string;
  canonicalName: string;
  category: string;
  variants: SimilarIngredientVariant[];
}

export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  createdAt: string;
}

export type Household = 'solo' | 'couple' | 'family_kids' | 'roommates';
export type WeeknightMinutes = 15 | 30 | 45 | 60 | 90;
export type Priority = 'time' | 'cost' | 'variety' | 'health';
export type BreakfastHabit = 'skip' | 'cook' | 'grab';
export type LunchHabit = 'leftovers' | 'cook' | 'buy';
export type DinnerHabit = 'leftovers' | 'cook' | 'buy';

export interface MealHabits {
  breakfast: BreakfastHabit;
  lunch: LunchHabit;
  dinner: DinnerHabit;
}

// Derive prep-time bucket (quick/moderate/elaborate) from weeknight minutes.
// Keeps the existing recipe-time validation rules in openai.ts unchanged.
export function mealPrepTimeFromMinutes(
  minutes: WeeknightMinutes | undefined
): 'quick' | 'moderate' | 'elaborate' {
  if (!minutes) return 'moderate';
  if (minutes <= 30) return 'quick';
  if (minutes <= 60) return 'moderate';
  return 'elaborate';
}

// Derive a sensible default serving size from the household type.
export function servingSizeFromHousehold(household: Household | undefined): number {
  switch (household) {
    case 'solo':
      return 1;
    case 'couple':
      return 2;
    case 'family_kids':
      return 4;
    case 'roommates':
      return 3;
    default:
      return 2;
  }
}

// ── Monthly feature limits (paywall) ──
// Free, non-premium users get this many uses of each feature PER CALENDAR
// MONTH; exceeding the limit opens the paywall. Premium users are unlimited.
// "Get Groceries" and "Get Inspired" are intentionally NOT listed — they are
// free with no monthly restriction.
export type MonthlyFeature = 'planMeals' | 'addRecipe' | 'importRecipe' | 'vibe' | 'speakGrocery';

export const MONTHLY_FEATURE_LIMITS: Record<MonthlyFeature, number> = {
  planMeals: 5,
  addRecipe: 10,
  importRecipe: 10,
  vibe: 5,
  // Voice grocery entry: 5 SUCCESSFUL speak attempts per month (each attempt may
  // contain any number of items). Typing has no limit. Not shown on the paywall
  // feature list — exceeding it just pops the paywall with a contextual note.
  speakGrocery: 5,
};

// Calendar-month key, e.g. "2026-06". Usage counters reset when this changes.
export function currentMonthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export interface UserPreferences {
  dietaryRestrictions: string[];
  cuisinePreferences: string[];
  allergies: string[];
  servingSize: number;
  cookingSkillLevel: 'beginner' | 'intermediate' | 'advanced';
  mealPrepTime: 'quick' | 'moderate' | 'elaborate';
  hasCompletedOnboarding: boolean;
  profileSubtitle?: string;

  // ── Persona fields (all optional for backward compatibility) ──
  household?: Household;
  cookingDaysPerWeek?: number; // 1–7
  weeknightMinutes?: WeeknightMinutes;
  equipment?: string[];
  pantryStaples?: string[];
  weeklyBudget?: number | null; // null/undefined = no limit
  monthlyBudget?: number | null;
  priorities?: Priority[]; // ordered, length 2 (top-2)
  adventureLevel?: number; // 1–5
  goals?: string[];
  exploreCuisines?: string[];
  mealHabits?: MealHabits;

  // ── Free-trial gating ──
  // Set true after the user generates their first meal plan AND its grocery list.
  // Subsequent meal plan / recipe generations require premium.
  hasUsedFreeTrial?: boolean;

  // ── DEPRECATED — dormant post-trial tap counter ──
  // The 30-day client-side trial has been removed. This field is kept in
  // the persisted shape to avoid a migration for existing installs; nothing
  // reads or writes it anymore.
  postTrialPnpTapCount?: number;

  // ── AUTH-LAST signup gate — per-feature free-use counters ──
  // Counts the anonymous guest's free builds of each gated feature separately:
  // one plan (PnP Picks) and one grocery list are on the house. The signup gate
  // fires only once BOTH features have been used at least once — so clicking a
  // single button repeatedly never gates. Irrelevant once the user has a real
  // account.
  freePlanBuildsUsed?: number;
  freeGroceryBuildsUsed?: number;

  // ── Recipe-page feature free-use counters ──
  // Add recipe / Import recipe / Vibe cooking each get ONE free use; the 2nd
  // use opens the paywall (for non-premium users). Independent of the meal-plan
  // PnP/grocery signup gate above, and of each other.
  freeAddRecipeUsed?: number;
  freeImportRecipeUsed?: number;
  freeVibeUsed?: number;

  // ── Monthly feature usage (paywall limits) ──
  // Per-calendar-month usage counters for the gated features. `period` is the
  // month key ("YYYY-MM"); when the current month differs, the counts are
  // treated as 0 (a fresh month). See MONTHLY_FEATURE_LIMITS.
  monthlyFeatureUsage?: {
    period: string;
  } & Partial<Record<MonthlyFeature, number>>;

  // ── Review-prompt signal ──
  // Lifetime count of successfully completed plan generations. Used to fire the
  // in-app review prompt after the user has felt the value a few times.
  plansCompletedCount?: number;

  // ── DEPRECATED — dormant trial window ──
  // The 30-day client-side trial has been removed. This field is kept in
  // the persisted shape to avoid a migration for existing installs; nothing
  // reads or writes it anymore.
  trialEndsAt?: string | null;

  // ── Resume-onboarding persistence ──
  onboardingStep?: number; // 0-indexed step in the persona flow (after main onboarding)
}

interface MealPlanStore {
  // Hydration state
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;

  // Sync state
  isSyncing: boolean;
  lastSyncError: string | null;

  // User Profile
  userProfile: UserProfile | null;
  setUserProfile: (profile: Partial<UserProfile>) => void;
  clearUserProfile: () => void;

  // User Preferences
  preferences: UserPreferences;
  setPreferences: (preferences: Partial<UserPreferences>) => void;
  // DEPRECATED — dormant. The 30-day client-side trial has been removed
  // so nothing calls this anymore. Kept on the interface to avoid breaking
  // any external callers; safe to remove in a future cleanup.
  incrementPostTrialPnpTap: () => void;
  // Marks a free gated feature as used by an anonymous guest — 'plan' when they
  // build a plan (PnP Picks), 'grocery' when they build a grocery list.
  markFreeGatedAction: (kind: 'plan' | 'grocery') => void;
  // Bumps the free-use counter for a recipe-page feature (one free use each,
  // then the paywall). Independent of the signup gate.
  markRecipeFeatureUsed: (kind: 'add' | 'import' | 'vibe') => void;
  // ── Monthly feature usage (paywall limits) ──
  // Read the current month's usage for a feature (0 when the stored period is
  // a previous month) and record one use (resets the period on a new month).
  getMonthlyFeatureCount: (feature: MonthlyFeature) => number;
  recordMonthlyFeatureUse: (feature: MonthlyFeature) => void;

  // Recipes
  recipes: Recipe[];
  addRecipe: (recipe: Recipe) => string;
  updateRecipe: (id: string, updates: Partial<Recipe>) => void;
  deleteRecipe: (id: string) => void;
  toggleSaveRecipe: (id: string) => void;
  // Recipe duplicate detection: signatures (sorted member recipe ids) the user
  // chose to "keep all" for. Persisted so the SAME set isn't re-flagged next
  // session; adding a NEW similar recipe grows the group → new signature →
  // prompts again.
  dismissedDuplicateRecipeGroups: string[];
  dismissDuplicateRecipeGroup: (signature: string) => void;
  hasRecipeWithSourceUrl: (sourceUrl: string) => boolean;

  // Meal Plan
  mealSlots: MealSlot[];
  addMealToSlot: (slot: MealSlot) => void;
  removeMealFromSlot: (slotId: string) => void;
  removeMealFromSlotAsync: (slotId: string) => Promise<boolean>;
  updateMealSlot: (slotId: string, updates: Partial<MealSlot>) => void;
  clearWeekPlan: (startDate: string) => void;

  // Grocery List
  groceryItems: GroceryItem[];
  customGroceryItems: GroceryItem[];
  savedGroceryLists: SavedGroceryList[];
  similarIngredients: SimilarIngredientGroup[];

  // Currently Loaded Saved List (separate from grocery list)
  currentSavedListId: string | null;
  currentSavedListName: string | null;
  currentSavedListItems: GroceryItem[];

  generateGroceryList: (startDate: string, endDate: string) => void;
  combineSimilarIngredients: (groupId: string, selectedItemIds: string[]) => void;
  clearSimilarIngredients: () => void;
  toggleGroceryItem: (itemId: string) => void;
  addGroceryItem: (item: Omit<GroceryItem, 'id'>) => void;
  updateGroceryItem: (itemId: string, updates: Partial<GroceryItem>) => void;
  removeGroceryItem: (itemId: string) => void;
  toggleCustomGroceryItem: (itemId: string) => void;
  addCustomGroceryItem: (item: Omit<GroceryItem, 'id'>) => void;
  updateCustomGroceryItem: (itemId: string, updates: Partial<GroceryItem>) => void;
  removeCustomGroceryItem: (itemId: string) => void;
  updateCurrentSavedListItem: (itemId: string, updates: Partial<GroceryItem>) => void;
  clearGroceryList: () => void;
  clearCheckedItems: () => void;
  saveGroceryList: (name: string) => void;
  saveAndClearCheckedItems: (name: string) => boolean;
  updateSavedGroceryList: (listId: string, name: string) => boolean;
  deleteSavedGroceryList: (listId: string) => void;
  loadSavedGroceryList: (listId: string) => void;
  unloadSavedGroceryList: () => void;
  toggleCurrentSavedListItem: (itemId: string) => void;
  addCurrentSavedListItem: (item: Omit<GroceryItem, 'id'>) => void;
  removeCurrentSavedListItem: (itemId: string) => void;
  mergeIntoGroceryItem: (itemId: string, addedQuantity: string, addedUnit: string) => void;
  mergeIntoCurrentSavedListItem: (itemId: string, addedQuantity: string, addedUnit: string) => void;

  // View State
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  viewMode: 'weekly' | 'monthly';
  setViewMode: (mode: 'weekly' | 'monthly') => void;

  // Grocery List Date Range
  groceryStartDate: string | null;
  groceryEndDate: string | null;
  setGroceryDateRange: (startDate: string, endDate: string) => void;

  // ───── Nudge engine state ─────
  cookingLogs: CookingLog[];
  recipeRatings: RecipeRating[];
  mealPlanRatings: MealPlanRating[];   // ratings on curated meal plans
  nudgeDismissals: Record<string, string>; // nudgeKey → ISO timestamp
  lastWeeklyPromptAt: string | null;
  logCooking: (log: Omit<CookingLog, 'id'>) => void;
  logCookingBulk: (logs: Array<Omit<CookingLog, 'id'>>) => void;
  deleteCookingLog: (slotId: string) => void;
  rateRecipe: (rating: Omit<RecipeRating, 'id'>) => void;
  ratePlan: (rating: Omit<MealPlanRating, 'id'>) => void;
  dismissNudge: (key: string) => void;
  setLastWeeklyPromptAt: (iso: string) => void;

  // ───── Behavior Intelligence state ─────
  planningEvents: PlanningEvent[];        // append-only, capped at 100
  logPlanningEvent: (e: Omit<PlanningEvent, 'id'>) => void;

  // ───── Background generation state ─────
  pendingGeneration: PendingGenerationState | null;
  startBackgroundGeneration: (params: {
    selectedMealTypes: Array<'breakfast' | 'lunch' | 'dinner' | 'snack'>;
    days: number;
    enrichedInstructions: string;
    // Optional anchor date for the first generated day. Defaults to
    // today when omitted so legacy callers (preset-day flows) stay
    // byte-identical. When the caller has a specific calendar range
    // selected, pass the chosen start date here and the engine will
    // slot recipes into those exact dates.
    startDate?: Date;
    // Per-meal cook style chosen on the Plan-My-Meals screen. Cooked meals
    // are generated as recipes (they're in selectedMealTypes); every other
    // meal type gets a labelled placeholder slot reflecting the choice
    // (Skipped / Grab & go / Leftovers · <dish> / Buy out). Placeholders carry
    // no recipe, so they never reach the grocery list.
    mealHabits?: MealHabits;
    // Existing-recipe ids the user picked from their favourites — each is
    // dropped into the earliest matching-meal-type slot in the plan window,
    // replacing the AI recipe there. The AI still fills every other slot.
    presetFavoriteIds?: string[];
    // Cooking rhythm from the Plan-My-Meals screen.
    //   'daily' (default) → the per-day streaming flow: one fresh recipe per
    //     cooked meal slot per day, leftovers handled via mealHabits.
    //   'batch' → mirror the curated batch scheduler: cook N distinct mains on
    //     each cook day (stacked into that day's lunch slot) and fill every
    //     other main slot in the block with a "Leftovers · <dish>" placeholder,
    //     scaling each cook's serving size to cover the meals it feeds.
    cookStyle?: 'daily' | 'batch';
    // Only read when cookStyle === 'batch': which weekdays to cook on
    // (0 = Sun … 6 = Sat) and how many distinct recipes to cook each cook day.
    batch?: { cookDays: number[]; recipesPerCookDay: number };
  }) => void;

  // ───── Vibe Cooking hand-off (ephemeral) ─────
  // Set by generate-recipe.tsx when a vibe-flow generation succeeds.
  // Consumed by the /vibe-cooking route. NOT persisted — clears on
  // unmount or app restart. Decoupled like this so we don't pass
  // payloads through router params (size limits, encoding pain).
  lastVibeCook: { recipe: import('./openai').GeneratedRecipeResponse; vibeId: string } | null;
  setLastVibeCook: (
    payload: { recipe: import('./openai').GeneratedRecipeResponse; vibeId: string },
  ) => void;
  clearLastVibeCook: () => void;

  // ───── Taste profile + skip-reason handoff (ephemeral) ─────
  // Derived on demand from cookingLogs/recipes/preferences. Cached
  // here so callers (banner, debug UI) can read it without a
  // recompute; recomputed via computeTasteProfile() before each
  // generation run. NOT persisted — always rebuilt from source.
  tasteProfile: TasteProfile | null;
  // Ingredients to surface at the top of the next grocery list,
  // populated when the user skips a meal for "missing_ingredients".
  // Cleared by generateGroceryList once they've been bubbled.
  pendingPriorityIngredients: string[];
  // Most-recent-skip prompt hint + intensity hint, layered on top
  // of the TasteProfile when the next generation runs. Latest-wins
  // (not merged) — the most recent skip is the most relevant
  // signal. Cleared by startBackgroundGeneration on consumption.
  pendingGenerationHint: string;
  pendingPlanIntensity: number | null;
  // Recompute tasteProfile from current cookingLogs/recipes/prefs,
  // cache it on the store, and return it.
  computeTasteProfile: () => TasteProfile;
  setPendingPriorityIngredients: (ingredients: string[]) => void;
  clearPendingPriorityIngredients: () => void;
  setPendingSkipEffect: (hint: string, intensity: number | null) => void;
  clearPendingSkipEffect: () => void;

  // Sync methods
  loadUserData: (userId: string) => Promise<void>;
  clearAllData: () => void;
}

// Helper to generate unique IDs
const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

// When a meal is removed from the calendar, other slots that DEPEND on it no
// longer make sense and should be cleared alongside it. This returns the ids of
// those dependent slots (excluding the removed slot itself):
//   • BATCH / REPEATS — every other slot that uses the SAME recipe. Deleting a
//     recipe clears every occurrence of it on the plan.
//   • LEFTOVERS — slots that reheat this recipe: the AI flow's recipe-less
//     "Leftovers · <name>" placeholders, and the curated flow's "Leftover
//     <name>" variant recipe slots (minted with empty ingredients).
// No cook → no leftovers, so they go too.
function mealRemovalCascadeIds(
  mealSlots: MealSlot[],
  recipes: Recipe[],
  removed: MealSlot | undefined,
): string[] {
  if (!removed || !removed.recipeId) return [];
  const recipe = recipes.find((r) => r.id === removed.recipeId);
  const ids = new Set<string>();

  // Batch / repeats — the same recipe used in any other slot.
  for (const s of mealSlots) {
    if (s.id !== removed.id && s.recipeId === removed.recipeId) ids.add(s.id);
  }

  // Leftovers that depend on this recipe by name.
  if (recipe) {
    const aiLabel = `Leftovers · ${recipe.name}`; // AI placeholder leftovers
    const curatedLabel = `Leftover ${recipe.name}`; // curated variant naming
    const curatedLeftoverId = recipes.find((r) => r.name === curatedLabel)?.id;
    for (const s of mealSlots) {
      if (s.id === removed.id) continue;
      if (
        s.recipeId == null &&
        (s.customMealName === aiLabel || s.customMealName === curatedLabel)
      ) {
        ids.add(s.id);
      } else if (curatedLeftoverId && s.recipeId === curatedLeftoverId) {
        ids.add(s.id);
      }
    }
  }

  return [...ids];
}

// Reverse of the leftover serving-scale. When a "Leftovers · <dish>" placeholder
// is removed, the cook it reheated no longer needs to feed that extra meal, so
// we shrink that cook back down. Returns the source cook's slot id + its new
// servingOverride (undefined → drop the override once no leftovers remain).
// The source cook mirrors the placement rule, matched by recipe name:
//   • lunch leftover  → previous day's DINNER
//   • dinner leftover → SAME day's LUNCH
function leftoverServingAdjustment(
  mealSlots: MealSlot[],
  recipes: Recipe[],
  removed: MealSlot | undefined,
): { slotId: string; servingOverride: number | undefined } | null {
  const prefix = 'Leftovers · ';
  if (!removed || removed.recipeId || !removed.customMealName) return null;
  if (!removed.customMealName.startsWith(prefix)) return null;
  const dish = removed.customMealName.slice(prefix.length);

  const [y, m, d] = removed.date.split('-').map(Number);
  if (!y || !m || !d) return null;
  const nameOf = (s: MealSlot) => recipes.find((r) => r.id === s.recipeId)?.name;

  // Preferred (daily) source by exact date + meal type, matched by name:
  //   • lunch leftover  → previous day's DINNER
  //   • dinner leftover → SAME day's LUNCH
  let srcSlot: MealSlot | undefined;
  if (removed.mealType === 'lunch' || removed.mealType === 'dinner') {
    let srcKey: string;
    let srcMt: 'lunch' | 'dinner';
    if (removed.mealType === 'lunch') {
      const prevDate = new Date(y, m - 1, d);
      prevDate.setDate(prevDate.getDate() - 1);
      srcKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
      srcMt = 'dinner';
    } else {
      srcKey = removed.date;
      srcMt = 'lunch';
    }
    srcSlot = mealSlots.find(
      (s) => s.date === srcKey && s.mealType === srcMt && s.recipeId && nameOf(s) === dish,
    );
  }

  // Fallback (batch / cross-day): the nearest cooked slot by name on or before
  // the leftover's date. Batch leftovers reheat the block's cook-day dish, which
  // can be several days back and in a different meal slot — the exact-date rule
  // above won't find it, so we match by name and take the most recent cook.
  if (!srcSlot) {
    srcSlot = mealSlots
      .filter((s) => s.recipeId && s.date <= removed.date && nameOf(s) === dish)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))[0];
  }

  if (!srcSlot || !srcSlot.recipeId) return null;
  const base = recipes.find((r) => r.id === srcSlot.recipeId)?.servings;
  if (!base || base <= 0) return null;

  const current = srcSlot.servingOverride ?? base;
  const next = current - base;
  // Back at (or below) a single cook → drop the override entirely.
  return { slotId: srcSlot.id, servingOverride: next > base ? next : undefined };
}

// Generate proper UUID for grocery items (Supabase requires UUID format)
const generateGroceryItemId = () => uuidv4();

// Helper to check if a string is a valid UUID
const isValidUUID = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

// Get current user ID helper
const getCurrentUserId = (): string | null => {
  return useAuthStore.getState().currentUser?.id || null;
};

const defaultPreferences: UserPreferences = {
  dietaryRestrictions: [],
  cuisinePreferences: [],
  allergies: [],
  servingSize: 2,
  cookingSkillLevel: 'intermediate',
  mealPrepTime: 'moderate',
  hasCompletedOnboarding: false,
  // persona defaults are intentionally undefined so we can detect "not yet set"
  hasUsedFreeTrial: false,
  postTrialPnpTapCount: 0,
  freePlanBuildsUsed: 0,
  freeGroceryBuildsUsed: 0,
  freeAddRecipeUsed: 0,
  freeImportRecipeUsed: 0,
  freeVibeUsed: 0,
  trialEndsAt: null,
};

/**
 * Builds a natural-language instruction string from persona fields so the AI
 * can tailor recipes to the user's household, time, equipment, budget, etc.
 * Always appends an ANZ household grounding line so generated recipes match
 * Australian/NZ naming and weeknight-classic rotations regardless of persona.
 *
 * Returned text is fed into Rule #1.5 in openai.ts — it takes precedence over
 * cuisine/skill/prep-time preferences but NEVER overrides allergies (Rule #1).
 */
export function buildPersonaInstructions(prefs: UserPreferences): string {
  const lines: string[] = [];

  if (prefs.household) {
    const householdLabel: Record<string, string> = {
      solo: 'cooking for one person',
      couple: 'cooking for a couple',
      family_kids: 'cooking for a family with kids (kid-friendly flavors preferred)',
      roommates: 'cooking for roommates sharing meals',
    };
    const label = householdLabel[prefs.household];
    if (label) lines.push(`Household: ${label}.`);
  }

  if (typeof prefs.cookingDaysPerWeek === 'number' && prefs.cookingDaysPerWeek > 0) {
    lines.push(`Plans to cook ${prefs.cookingDaysPerWeek} day(s) per week.`);
  }

  if (typeof prefs.weeknightMinutes === 'number') {
    lines.push(`Weeknight cooking budget: about ${prefs.weeknightMinutes} minutes per meal.`);
  }

  if (prefs.equipment && prefs.equipment.length > 0) {
    lines.push(`Available kitchen equipment: ${prefs.equipment.join(', ')}.`);
  }

  if (prefs.pantryStaples && prefs.pantryStaples.length > 0) {
    lines.push(`Pantry already has: ${prefs.pantryStaples.join(', ')}. Prefer recipes that use these.`);
  }

  // Derive weekly cooked-meal count from mealHabits × cookingDaysPerWeek so the
  // per-meal cost target reflects the user's actual cadence. Habits are only
  // counted when explicitly set to 'cook' (skip/grab/buy/leftovers don't
  // consume the grocery budget). Falls back to 10 meals/week when fields
  // are missing — the assumption the user verified ("$100 → 10 meals → $10").
  const cookedMealsPerDay =
    (prefs.mealHabits?.breakfast === 'cook' ? 1 : 0) +
    (prefs.mealHabits?.lunch === 'cook' ? 1 : 0) +
    (prefs.mealHabits?.dinner === 'cook' ? 1 : 0);
  const cookDays = typeof prefs.cookingDaysPerWeek === 'number' && prefs.cookingDaysPerWeek > 0
    ? prefs.cookingDaysPerWeek
    : 7;
  const derivedMealsPerWeek = cookedMealsPerDay * cookDays;
  const mealsPerWeek = derivedMealsPerWeek > 0 ? derivedMealsPerWeek : 10;

  if (typeof prefs.weeklyBudget === 'number' && prefs.weeklyBudget > 0) {
    const perMeal = prefs.weeklyBudget / mealsPerWeek;
    lines.push(
      `Weekly grocery budget target: ~A$${prefs.weeklyBudget}. Per-meal grocery cost target: ~A$${perMeal.toFixed(0)} per meal (A$${prefs.weeklyBudget} ÷ ~${mealsPerWeek} cooked meals/week). Prefer cost-effective proteins (chicken thigh, beef mince, eggs, legumes, tofu) over premium cuts (eye fillet, salmon, scallops). Use seasonal veg and keep ingredient counts tight to stay within target.`
    );
  }
  if (typeof prefs.monthlyBudget === 'number' && prefs.monthlyBudget > 0) {
    const perMealMonthly = prefs.monthlyBudget / (mealsPerWeek * 4.33);
    lines.push(
      `Monthly grocery budget target: ~A$${prefs.monthlyBudget}. Per-meal grocery cost target: ~A$${perMealMonthly.toFixed(0)} per meal (A$${prefs.monthlyBudget} ÷ ~${Math.round(mealsPerWeek * 4.33)} cooked meals/month). Prefer cost-effective proteins and seasonal veg.`
    );
  }

  if (prefs.priorities && prefs.priorities.length > 0) {
    lines.push(`Top priorities (in order): ${prefs.priorities.join(' > ')}.`);
  }

  if (typeof prefs.adventureLevel === 'number') {
    const tone =
      prefs.adventureLevel <= 2
        ? 'familiar, comfort-food style'
        : prefs.adventureLevel >= 4
        ? 'adventurous and novel'
        : 'a mix of familiar and new';
    lines.push(`Adventure level: ${prefs.adventureLevel}/5 — favor ${tone} dishes.`);
  }

  if (prefs.goals && prefs.goals.length > 0) {
    lines.push(`Health/lifestyle goals: ${prefs.goals.join(', ')}.`);
  }

  if (prefs.mealHabits) {
    const habitDescriptions: string[] = [];
    if (prefs.mealHabits.breakfast) {
      const breakfastMap: Record<string, string> = {
        skip: 'usually skips breakfast',
        cook: 'cooks breakfast at home',
        grab: 'grabs a quick breakfast on the go',
      };
      habitDescriptions.push(breakfastMap[prefs.mealHabits.breakfast]);
    }
    if (prefs.mealHabits.lunch) {
      const lunchMap: Record<string, string> = {
        leftovers: 'eats leftovers for lunch',
        cook: 'cooks lunch fresh',
        buy: 'buys lunch out',
      };
      habitDescriptions.push(lunchMap[prefs.mealHabits.lunch]);
    }
    if (prefs.mealHabits.dinner) {
      const dinnerMap: Record<string, string> = {
        leftovers: 'eats leftovers for dinner',
        cook: 'cooks dinner fresh',
        buy: 'buys dinner out',
      };
      habitDescriptions.push(dinnerMap[prefs.mealHabits.dinner]);
    }
    if (habitDescriptions.length > 0) {
      lines.push(`Meal habits: ${habitDescriptions.join('; ')}.`);
    }
  }

  // ── ANZ household grounding (always emitted) ──────────────────────
  // App is shipped in Australia / New Zealand. Without this the model
  // defaults to US naming ("bell pepper", "ground beef", "cilantro") and
  // US-popular dishes the user wouldn't actually cook on a weeknight here.
  lines.push(
    'Cooking context: Australia / New Zealand household. Use AU/NZ ingredient names (capsicum not bell pepper, mince not ground meat, coriander not cilantro, zucchini not courgette, prawns not shrimp, eggplant not aubergine). Quantities in metric; prices in AUD reflecting Coles/Woolworths weekly specials. Favour dishes commonly cooked in AU/NZ homes — for each selected cuisine, prefer weeknight classics households actually rotate (Italian → spaghetti bolognese, carbonara, baked pasta, risotto; Indian → butter chicken, dal, beef/lamb curry, biryani; Asian/Chinese → stir-fry, fried rice, san choy bow, sweet & sour; Thai → pad thai, green/red curry, basil chicken; Japanese → teriyaki chicken, katsu, donburi; Korean → bulgogi, bibimbap; Mexican → tacos, burrito bowls, fajitas; Mediterranean/Greek → chicken souvlaki, Greek salad, pita plates; American → burgers, BBQ chicken, mac & cheese). Avoid hard-to-source US-only ingredients (e.g. Old Bay, Velveeta, biscuits-and-gravy components).'
  );

  return lines.join(' ');
}

/**
 * Merges persona-derived instructions with the user's free-text instructions
 * from the generate screen. User text takes precedence (appended last) so the
 * existing Rule #1.5 in openai.ts continues to honor explicit user overrides.
 */
export function mergePersonaWithUserInstructions(
  prefs: UserPreferences,
  userInstructions?: string
): string | undefined {
  const persona = buildPersonaInstructions(prefs);
  const user = (userInstructions ?? '').trim();
  if (!persona && !user) return undefined;
  if (persona && user) return `${persona}\n\nUser added: ${user}`;
  return persona || user;
}

// Applies the side effect of a cooking log when the user provided a
// skipReason — currently this means surfacing the recipe's
// ingredients at the top of the next grocery list when the skip
// reason was "missing_ingredients". Kept here (vs. inside the
// store method body) so logCooking and logCookingBulk can share
// it without duplication.
function applySkipEffectFromLog(
  get: () => MealPlanStore,
  set: (partial: Partial<MealPlanStore> | ((state: MealPlanStore) => Partial<MealPlanStore>)) => void,
  log: CookingLog,
): void {
  if (log.status !== 'skipped' || !log.skipReason) return;
  const recipe = log.recipeId
    ? get().recipes.find((r) => r.id === log.recipeId)
    : undefined;
  const effect = getSkipReasonEffect(log.skipReason, recipe?.name, recipe?.ingredients);

  // Priority ingredients: union with whatever's already pending so
  // multiple skips during the week all bubble to the next list.
  if (effect.priorityIngredients && effect.priorityIngredients.length > 0) {
    const existing = get().pendingPriorityIngredients;
    const merged = Array.from(new Set([...existing, ...effect.priorityIngredients]));
    set({ pendingPriorityIngredients: merged });
  }

  // Generation hint + plan intensity: latest-wins (overwrite). The
  // most recent skip is the most relevant signal — averaging across
  // mixed reasons would mute the strongest signal. Cleared on
  // consumption by startBackgroundGeneration.
  set({
    pendingGenerationHint: effect.generationHint,
    pendingPlanIntensity: effect.planIntensity,
  });
}

// Helper function to format date as YYYY-MM-DD in local timezone
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const useMealPlanStore = create<MealPlanStore>()(
  persist(
    (set, get) => ({
      // Hydration state
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),

      // Sync state
      isSyncing: false,
      lastSyncError: null,

      // User Profile
      userProfile: null,
      setUserProfile: (profile) =>
        set((state) => {
          if (state.userProfile) {
            return { userProfile: { ...state.userProfile, ...profile } };
          }
          return {
            userProfile: {
              id: generateId(),
              name: profile.name || 'User',
              email: profile.email,
              avatarUrl: profile.avatarUrl,
              createdAt: new Date().toISOString(),
            },
          };
        }),
      clearUserProfile: () => set({ userProfile: null }),

      // Initial state
      preferences: defaultPreferences,
      recipes: [],
      mealSlots: [],
      groceryItems: [],
      customGroceryItems: [],
      savedGroceryLists: [],
      similarIngredients: [],
      currentSavedListId: null,
      currentSavedListName: null,
      currentSavedListItems: [],
      selectedDate: formatLocalDate(new Date()),
      viewMode: 'weekly',
      groceryStartDate: null,
      groceryEndDate: null,

      // ───── Nudge engine state ─────
      cookingLogs: [],
      recipeRatings: [],
      mealPlanRatings: [],
      nudgeDismissals: {},
      dismissedDuplicateRecipeGroups: [],
      lastWeeklyPromptAt: null,

      // ───── Behavior Intelligence state ─────
      planningEvents: [],

      // ───── Background generation state ─────
      pendingGeneration: null,

      // ───── Vibe Cooking hand-off (ephemeral) ─────
      lastVibeCook: null,
      setLastVibeCook: (payload) => set({ lastVibeCook: payload }),
      clearLastVibeCook: () => set({ lastVibeCook: null }),

      // ───── Taste profile + skip-reason handoff (ephemeral) ─────
      tasteProfile: null,
      pendingPriorityIngredients: [],
      pendingGenerationHint: '',
      pendingPlanIntensity: null,
      computeTasteProfile: () => {
        const { cookingLogs, recipes, preferences } = get();
        const profile = deriveTasteProfile({ cookingLogs, recipes, preferences });
        set({ tasteProfile: profile });
        return profile;
      },
      setPendingPriorityIngredients: (ingredients) =>
        set({ pendingPriorityIngredients: ingredients }),
      clearPendingPriorityIngredients: () =>
        set({ pendingPriorityIngredients: [] }),
      setPendingSkipEffect: (hint, intensity) =>
        set({ pendingGenerationHint: hint, pendingPlanIntensity: intensity }),
      clearPendingSkipEffect: () =>
        set({ pendingGenerationHint: '', pendingPlanIntensity: null }),

      logPlanningEvent: (event) => {
        const newEvent: PlanningEvent = { ...event, id: uuidv4() };
        set((state) => {
          // Cap at 100 most recent entries — bounded growth, plenty of
          // history for any meaningful pattern derivation.
          const merged = [...state.planningEvents, newEvent];
          const trimmed = merged.length > 100 ? merged.slice(merged.length - 100) : merged;
          return { planningEvents: trimmed };
        });
        const userId = getCurrentUserId();
        if (userId) {
          db.insertPlanningEvent(userId, newEvent).catch((err) =>
            console.warn('[BEHAVIOR] Failed to sync planning event:', err)
          );
        }
      },

      // ─────────────────────────────────────────────────────────────────
      // Background recipe generation — fire-and-forget.
      //
      // Lifts the heavy lifting that used to live inline in
      // /plan-meals' handleGenerate out of the screen and into the store
      // so the user can navigate to /(tabs)/index immediately while the
      // work continues in the background.
      //
      // Key UX shifts vs. the old inline flow:
      //   1. Per-recipe streaming via the engine's onRecipeReady — each
      //      recipe lands in a meal slot the moment it finishes (cached,
      //      generated, repeated, or safety-net), so cards stream in
      //      one-by-one instead of all-at-once.
      //   2. Image generation runs IN PARALLEL per recipe (was serial in
      //      the old loop). Each recipe is saved with a stock placeholder
      //      first; the real AI image swaps in via updateRecipe when its
      //      Promise resolves. Roughly halves perceived wait for a full
      //      week plan.
      //   3. pendingGeneration drives the top-of-tab progress banner —
      //      the only place the user sees the work happening.
      // ─────────────────────────────────────────────────────────────────
      startBackgroundGeneration: ({ selectedMealTypes, days, enrichedInstructions, startDate: startDateParam, mealHabits: planMealHabits, presetFavoriteIds, cookStyle, batch: batchConfig }) => {
        // Guard: never let two generations run concurrently. The screen
        // disables its CTA when pendingGeneration.active is true, but
        // double-guard here in case anything slips through.
        const current = get().pendingGeneration;
        if (current?.active) {
          console.warn('[BG-GEN] Refusing to start — generation already in flight.');
          return;
        }

        const preferences = get().preferences;
        const totalMeals = days * Math.max(selectedMealTypes.length, 1);
        const lunchHabit = preferences.mealHabits?.lunch;
        const wantsLeftovers = lunchHabit === 'leftovers';
        // Repetition is OFF for the daily flow: every cooked lunch/dinner is a
        // DISTINCT recipe — no reusing a dinner as the next day's lunch.
        // Reduced-variety patterns live elsewhere, so the engine never needs to
        // repeat a generated recipe:
        //   • "leftovers" habit → recipe-less "Leftovers · <dish>" placeholders
        //     (see the placeholder block below) — the cook itself stays unique.
        //   • batch cooking → its own dedicated flow above.
        // When the curated "Get Inspired" bank runs out of qualifying recipes,
        // the engine falls back to OpenAI for fresh UNIQUE ones (never a repeat).
        const allowRepeats = false;
        console.log(
          `[BG-GEN] days=${days}, lunch habit=${lunchHabit ?? 'unset'} → allowRepeats=${allowRepeats} (daily flow is always unique), crossMealRepeats=${wantsLeftovers}`
        );
        const startedAt = new Date().toISOString();

        // Shared closure state — tracks day distribution as each recipe
        // arrives. Per-recipe streaming model: each recipe lands in its
        // slot the moment it arrives from the engine; no buffering. Pill
        // sub-fill is computed from `dayRecipeCounts` in the store state
        // so each new recipe ticks the corresponding pill forward.
        //
        // Anchor date: caller can pass `startDate` (from the calendar
        // picker on plan-meals); otherwise default to today so the
        // preset flows behave exactly as they did before. Normalize
        // to midnight so the per-recipe `setDate(... + dayIndex)`
        // math doesn't accidentally roll over the day boundary on
        // late-evening generations.
        const startDate = startDateParam ? new Date(startDateParam) : new Date();
        startDate.setHours(0, 0, 0, 0);
        const dayTracker: Record<string, number> = {};
        selectedMealTypes.forEach((mt) => {
          dayTracker[mt] = 0;
        });
        const numMealTypes = selectedMealTypes.length;
        let streamSlotIndex = 0;
        const pendingImageJobs: Promise<unknown>[] = [];

        // Seed banner state
        set({
          pendingGeneration: {
            active: true,
            total: totalMeals,
            completed: 0,
            days,
            mealTypesPerDay: numMealTypes,
            dayRecipeCounts: new Array(days).fill(0),
            completedDays: 0,
            stage: 'starting',
            startedAt,
          },
        });

        // Stock-image placeholders — pulled from the module-scope
        // STOCK_RECIPE_PLACEHOLDER_IMAGES export so the home tab can
        // recognize them and skip them when picking real recipe
        // images for the QuickActions thumbnail stack.
        const pickStock = () =>
          STOCK_RECIPE_PLACEHOLDER_IMAGES[
            Math.floor(Math.random() * STOCK_RECIPE_PLACEHOLDER_IMAGES.length)
          ];

        const formatDateKey = (d: Date): string => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${dd}`;
        };

        // Per-recipe handler — fires once for every recipe the engine
        // yields, in arrival order. Immediately writes to the store
        // (addRecipe + addMealToSlot) so the meal card animates into
        // its slot, then fires image generation in parallel, then
        // updates banner state (per-day count + derived completedDays).
        // No buffering — streaming is the whole point.
        const handleRecipeReady = (
          r: Parameters<typeof generateRecipeImage>[0] extends string
            ? any
            : any,
        ) => {
          try {
            const idx = streamSlotIndex++;

            const mealType =
              r.mealType && selectedMealTypes.includes(r.mealType)
                ? (r.mealType as MealType)
                : (selectedMealTypes[idx % numMealTypes] as MealType);

            const validated = validateIngredients(
              (r.ingredients || []).map((ing: any) => ({
                name: ing.name,
                quantity: ing.quantity,
                unit: ing.unit,
                category: ing.category as
                  | 'produce'
                  | 'dairy'
                  | 'meat'
                  | 'pantry'
                  | 'frozen'
                  | 'bakery'
                  | 'other',
              })),
            );

            // Curated recipes ship with a real hero image — use it directly.
            // AI recipes get a stock placeholder now and an AI image later.
            const hasCuratedImage = typeof r.imageUrl === 'string' && r.imageUrl.length > 0;
            const placeholderImage = hasCuratedImage ? r.imageUrl : pickStock();

            const recipe: Recipe = {
              id: '',
              name: r.name,
              description: r.description,
              imageUrl: placeholderImage,
              ...(r.blurhash ? { blurhash: r.blurhash } : {}),
              cookTime: r.cookTime,
              prepTime: r.prepTime,
              servings: r.servings,
              ingredients: validated.map((ing, i) => ({
                id: `gen-${idx}-${i}`,
                name: ing.name,
                quantity: ing.quantity,
                unit: ing.unit,
                category: ing.category,
              })),
              instructions: r.instructions,
              tags: [...(r.tags || []), mealType],
              calories: r.calories,
              isAIGenerated: true,
              isSaved: false,
              createdAt: new Date().toISOString(),
            };

            const dayIndex =
              dayTracker[mealType] ?? Math.floor(idx / numMealTypes);
            if (dayTracker[mealType] !== undefined) {
              dayTracker[mealType]++;
            }

            // Immediate flush — meal card lands in its slot now.
            const recipeId = get().addRecipe(recipe);
            const recipeDate = new Date(startDate);
            recipeDate.setDate(recipeDate.getDate() + dayIndex);
            const slot: MealSlot = {
              id: '',
              date: formatDateKey(recipeDate),
              mealType,
              recipeId,
            };
            get().addMealToSlot(slot);

            // Fire image gen in PARALLEL — non-blocking. Stock image
            // shows immediately; AI image swaps in via updateRecipe
            // when its promise resolves. Curated recipes already carry their
            // real hero image, so we skip generation entirely for them.
            if (!hasCuratedImage) {
              const imageJob = generateRecipeImage(
                recipe.name,
                recipe.description,
                recipe.ingredients,
              )
                .then((url) => {
                  if (url) get().updateRecipe(recipeId, { imageUrl: url });
                })
                .catch(() => {
                  /* stock image stays — graceful degradation */
                });
              pendingImageJobs.push(imageJob);
            }

            // Update banner state — bump per-day count, recompute the
            // total completed and the count of fully-completed days.
            set((state) => {
              if (!state.pendingGeneration) return {};
              const counts = state.pendingGeneration.dayRecipeCounts.slice();
              const safeIdx = Math.min(
                Math.max(dayIndex, 0),
                counts.length - 1,
              );
              counts[safeIdx] = (counts[safeIdx] ?? 0) + 1;
              const completedDays = counts.filter(
                (c) => c >= state.pendingGeneration!.mealTypesPerDay,
              ).length;
              return {
                pendingGeneration: {
                  ...state.pendingGeneration,
                  completed: state.pendingGeneration.completed + 1,
                  dayRecipeCounts: counts,
                  completedDays,
                },
              };
            });
          } catch (err) {
            console.error('[BG-GEN] handleRecipeReady failed for one recipe:', err);
          }
        };

        // Shared completion — runs for both the daily and batch paths. Marks
        // the banner done, bumps the lifetime plan counter (and asks for a
        // review once the user has felt the value a few times), then clears the
        // banner after a brief "Plan ready ✓" hold.
        const finishGeneration = (completedCount: number) => {
          set((state) =>
            state.pendingGeneration
              ? {
                  pendingGeneration: {
                    ...state.pendingGeneration,
                    stage: 'done',
                    completed: completedCount,
                    completedDays: days,
                  },
                }
              : {},
          );
          set((state) => ({
            preferences: {
              ...state.preferences,
              plansCompletedCount: (state.preferences.plansCompletedCount ?? 0) + 1,
            },
          }));
          const planCount = get().preferences.plansCompletedCount ?? 0;
          const uid = getCurrentUserId();
          if (uid) {
            db.upsertUserPreferences(uid, get().preferences).catch(() => {});
          }
          // Ask for a review right after the user's FIRST completed plan — the
          // natural "aha" moment for a new user. maybePrompt still self-gates
          // (once per session, ≥3-day snooze, never after review/dismiss), so
          // existing users who are already past their first plan aren't spammed.
          if (planCount >= 1) {
            setTimeout(() => useReviewStore.getState().maybePrompt(), 1200);
          }
          setTimeout(() => {
            set((state) =>
              state.pendingGeneration?.stage === 'done'
                ? { pendingGeneration: null }
                : {},
            );
          }, 1800);
        };

        // Kick off the engine — completion handlers below run in the
        // microtask queue so the UI can paint the banner before this
        // synchronous setup returns control to plan-meals.handleGenerate.
        (async () => {
          try {
            set((state) =>
              state.pendingGeneration
                ? {
                    pendingGeneration: { ...state.pendingGeneration, stage: 'generating' },
                  }
                : {},
            );

            // Compose the taste-signals fragment from the user's
            // cooking history + onboarding cuisines and append it to
            // the user's free-text instructions. Empty string for
            // cold-start users so behavior matches the pre-feedback
            // pipeline byte-for-byte until we have signal.
            //
            // Per-generation skip-effect overrides (most recent skip)
            // are layered on top via the options arg, then cleared
            // immediately so they only fire once. clearPendingSkipEffect()
            // runs BEFORE the engine call so a downstream throw can't
            // leave stale hints to leak into the next attempt.
            const profile = get().computeTasteProfile();
            const { pendingGenerationHint, pendingPlanIntensity } = get();
            const tasteSignals = composeTasteSignalsForGeneration(profile, {
              generationHint: pendingGenerationHint,
              planIntensity: pendingPlanIntensity,
            });
            get().clearPendingSkipEffect();
            const finalInstructions = [enrichedInstructions, tasteSignals]
              .filter((s) => s && s.trim().length > 0)
              .join('\n\n');

            // ═══════════════════════════════════════════════════════════════
            // BATCH COOKING FLOW
            // ───────────────────────────────────────────────────────────────
            // Mirror the curated batch scheduler: cook N distinct mains on each
            // cook day (all stacked into that day's LUNCH slot as real recipes),
            // and fill every other main slot in the block with a recipe-less
            // "Leftovers · <dish>" placeholder. Each cook's serving size scales
            // to the number of meals it feeds (fresh lunch + its leftovers), so
            // the grocery list buys enough and nothing is double-counted (the
            // leftover slots carry no ingredients).
            if (cookStyle === 'batch') {
              const cfg = batchConfig ?? { cookDays: [0, 3], recipesPerCookDay: 2 };
              const recipesN = Math.max(1, Math.floor(cfg.recipesPerCookDay || 1));
              const startWeekday = startDate.getDay(); // 0 = Sun … 6 = Sat

              // Batch blocks: day 0 is always a cook day; add each chosen weekday
              // that falls in range. Each block feeds until the next cook day.
              const chosenDays = cfg.cookDays && cfg.cookDays.length ? cfg.cookDays : [0, 3];
              const offsets = new Set<number>([0]);
              for (let d = 0; d < days; d++) {
                if (chosenDays.includes((startWeekday + d) % 7)) offsets.add(d);
              }
              const sorted = [...offsets].sort((a, b) => a - b);
              const blocks = sorted
                .map((off, i) => ({ cookOffset: off, days: (sorted[i + 1] ?? days) - off }))
                .filter((b) => Math.min(b.days, days - b.cookOffset) > 0);

              const breakfastCooked = selectedMealTypes.includes('breakfast');
              const totalMains = blocks.length * recipesN;

              // ── Favourites ──
              // The user's picked favourites become cooked dishes first; the
              // engine generates only the remainder. Each favourite's meal type
              // is read from its tags: lunch/dinner (or untagged) → a batch MAIN
              // (cooked in a lunch slot, since batch cooks at lunch); breakfast →
              // a breakfast slot. Snacks have no batch slot and are skipped. Each
              // favourite is used at most once.
              const favMealTypeOf = (recipe: Recipe): MealType | null =>
                (['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).find((mt) =>
                  (recipe.tags || []).map((t) => t.toLowerCase()).includes(mt),
                ) ?? null;
              const favRecipes: Recipe[] = [];
              const seenFav = new Set<string>();
              for (const id of presetFavoriteIds ?? []) {
                if (seenFav.has(id)) continue;
                seenFav.add(id);
                const r = get().recipes.find((x) => x.id === id);
                if (r) favRecipes.push(r);
              }
              const mainFavs = favRecipes
                .filter((r) => {
                  const mt = favMealTypeOf(r);
                  return mt === 'lunch' || mt === 'dinner' || mt === null;
                })
                .slice(0, totalMains);
              const breakfastFavs = breakfastCooked
                ? favRecipes.filter((r) => favMealTypeOf(r) === 'breakfast').slice(0, days)
                : [];

              const mainsToGenerate = Math.max(0, totalMains - mainFavs.length);
              const genTotal = (breakfastCooked ? days : 0) + mainsToGenerate;

              // Banner counts only the recipes we actually generate (cooked mains
              // still needed + cooked breakfasts) — favourites + leftovers aren't.
              set((state) =>
                state.pendingGeneration
                  ? { pendingGeneration: { ...state.pendingGeneration, total: genTotal } }
                  : {},
              );

              // Generate the remaining cooked mains (as dinners) + any cooked
              // breakfasts. allowRepeats off → every generated main is distinct.
              const batchMealTypes: MealType[] = breakfastCooked
                ? ['breakfast', 'dinner']
                : ['dinner'];
              const generated =
                genTotal > 0
                  ? await generateRecipesOptimized(
                      {
                        mealTypes: batchMealTypes,
                        preferences,
                        recipesToGenerate: genTotal,
                        useCache: true,
                        optimizeGrocery: true,
                        allowRepeats: false,
                        crossMealRepeats: false,
                        additionalInstructions: undefined,
                        customCookingInstructions: finalInstructions,
                        numberOfDays: days,
                        startDate: formatDateKey(startDate),
                      },
                      {
                        onProgress: (p) =>
                          set((state) =>
                            state.pendingGeneration
                              ? { pendingGeneration: { ...state.pendingGeneration, completed: p.completed } }
                              : {},
                          ),
                      },
                    )
                  : [];

              const breakfasts = generated.filter((r) => r.mealType === 'breakfast');
              const generatedMains = generated.filter((r) => r.mealType !== 'breakfast');

              // Build a Recipe row from a generated recipe; returns its id.
              // Curated picks keep their hero image; AI picks get a stock image
              // now + a generated image swapped in later.
              let matIdx = 0;
              const materialize = (r: GeneratedRecipeResponse, slotMealType: MealType): string => {
                const idx = matIdx++;
                const validated = validateIngredients(
                  (r.ingredients || []).map((ing) => ({
                    name: ing.name,
                    quantity: ing.quantity,
                    unit: ing.unit,
                    category: ing.category as Ingredient['category'],
                  })),
                );
                const hasCuratedImage =
                  typeof r.imageUrl === 'string' && r.imageUrl.length > 0;
                const recipe: Recipe = {
                  id: '',
                  name: r.name,
                  description: r.description,
                  imageUrl: hasCuratedImage ? (r.imageUrl as string) : pickStock(),
                  ...(r.blurhash ? { blurhash: r.blurhash } : {}),
                  cookTime: r.cookTime,
                  prepTime: r.prepTime,
                  servings: r.servings,
                  ingredients: validated.map((ing, i) => ({
                    id: `gen-b-${idx}-${i}`,
                    name: ing.name,
                    quantity: ing.quantity,
                    unit: ing.unit,
                    category: ing.category,
                  })),
                  instructions: r.instructions,
                  tags: [...(r.tags || []), slotMealType],
                  calories: r.calories,
                  isAIGenerated: true,
                  isSaved: false,
                  createdAt: new Date().toISOString(),
                };
                const recipeId = get().addRecipe(recipe);
                if (!hasCuratedImage) {
                  const job = generateRecipeImage(
                    recipe.name,
                    recipe.description,
                    recipe.ingredients,
                  )
                    .then((url) => {
                      if (url) get().updateRecipe(recipeId, { imageUrl: url });
                    })
                    .catch(() => {});
                  pendingImageJobs.push(job);
                }
                return recipeId;
              };

              // Unified cooked-dish list: favourites first (existing recipe rows,
              // reused as-is — never re-materialized, so no duplicate rows), then
              // the freshly generated mains (materialized into recipe rows).
              type BatchDish = { recipeId: string; name: string; servings: number };
              const resolvedDishes: BatchDish[] = [];
              for (const fav of mainFavs) {
                resolvedDishes.push({ recipeId: fav.id, name: fav.name, servings: fav.servings });
              }
              for (const gm of generatedMains) {
                resolvedDishes.push({
                  recipeId: materialize(gm, 'lunch'),
                  name: gm.name,
                  servings: gm.servings,
                });
              }

              // Breakfast favourites take the earliest cooked-breakfast days (in
              // order); the rest of the days use the generated breakfasts.
              const breakfastFavQueue = [...breakfastFavs];
              let genBfastPtr = 0;
              const breakfastHabit = planMealHabits?.breakfast ?? 'cook';
              const placeBreakfast = (dk: string) => {
                if (breakfastHabit === 'skip') return;
                if (breakfastHabit === 'grab') {
                  get().addMealToSlot({
                    id: '', date: dk, mealType: 'breakfast', recipeId: null, customMealName: 'Grab & go',
                  });
                  return;
                }
                const fav = breakfastFavQueue.shift();
                if (fav) {
                  get().addMealToSlot({ id: '', date: dk, mealType: 'breakfast', recipeId: fav.id });
                  return;
                }
                const b = breakfasts[genBfastPtr++];
                if (!b) return;
                const rid = materialize(b, 'breakfast');
                get().addMealToSlot({ id: '', date: dk, mealType: 'breakfast', recipeId: rid });
              };

              // Lay out each block.
              let dishPtr = 0;
              for (const block of blocks) {
                const blockDays = Math.min(block.days, days - block.cookOffset);
                const dishes = resolvedDishes.slice(dishPtr, dishPtr + recipesN);
                dishPtr += dishes.length;

                // No cooked dish available (generation came up short) — still
                // place breakfasts so the days aren't blank, then move on.
                if (dishes.length === 0) {
                  for (let k = 0; k < blockDays; k++) {
                    const d = block.cookOffset + k;
                    const date = new Date(startDate);
                    date.setDate(date.getDate() + d);
                    placeBreakfast(formatDateKey(date));
                  }
                  continue;
                }

                // The household eats exactly 2 × blockDays main meals this block
                // (one lunch + one dinner per day). The cooked dishes collectively
                // cover those — and ONLY those — so the sum of their serving sizes
                // equals the block's real need. Distribute the meals round-robin
                // across the dishes; each dish's serving = base × meals it covers.
                // (Previously each dish also counted a "+1 fresh lunch", so N
                // dishes over-counted the cook-day lunch by N−1 meals.)
                const totalMainMeals = 2 * blockDays;
                const mealsByDish = new Array(dishes.length).fill(0);
                for (let i = 0; i < totalMainMeals; i++) mealsByDish[i % dishes.length]++;

                const dishNames = dishes.map((dish) => dish.name);
                let leftIdx = 0;
                const nextLeftoverName = () => {
                  const n = dishNames[leftIdx % dishNames.length];
                  leftIdx++;
                  return n;
                };

                for (let k = 0; k < blockDays; k++) {
                  const d = block.cookOffset + k;
                  const date = new Date(startDate);
                  date.setDate(date.getDate() + d);
                  const dk = formatDateKey(date);

                  placeBreakfast(dk);

                  if (k === 0) {
                    // Cook day — every distinct dish lands in the lunch slot as a
                    // real recipe, sized to cover its fresh meal + its leftovers.
                    dishes.forEach((dish, di) => {
                      const base =
                        dish.servings && dish.servings > 0
                          ? dish.servings
                          : preferences.servingSize || 1;
                      get().addMealToSlot({
                        id: '', date: dk, mealType: 'lunch', recipeId: dish.recipeId,
                        servingOverride: base * mealsByDish[di],
                      });
                    });
                    // Cook-day dinner reheats one of today's cooks.
                    get().addMealToSlot({
                      id: '', date: dk, mealType: 'dinner', recipeId: null,
                      customMealName: `Leftovers · ${nextLeftoverName()}`,
                    });
                  } else {
                    // Gap days — lunch + dinner are both leftovers.
                    get().addMealToSlot({
                      id: '', date: dk, mealType: 'lunch', recipeId: null,
                      customMealName: `Leftovers · ${nextLeftoverName()}`,
                    });
                    get().addMealToSlot({
                      id: '', date: dk, mealType: 'dinner', recipeId: null,
                      customMealName: `Leftovers · ${nextLeftoverName()}`,
                    });
                  }
                }
              }

              // Wait for image jobs (capped) so cards have art, then finish.
              await Promise.race([
                Promise.allSettled(pendingImageJobs),
                new Promise((resolve) => setTimeout(resolve, 60000)),
              ]);
              finishGeneration(genTotal);
              return; // batch flow complete — skip the daily path below
            }

            await generateRecipesOptimized(
              {
                mealTypes: selectedMealTypes as MealType[],
                preferences,
                recipesToGenerate: totalMeals,
                useCache: true,
                optimizeGrocery: true,
                allowRepeats,
                crossMealRepeats: wantsLeftovers,
                additionalInstructions: undefined,
                customCookingInstructions: finalInstructions,
                // Item 1 & 2: the engine needs the true plan length (repeat
                // policy) and the window's anchor date (breakfast weekday vs
                // weekend no-cook/cooked rules).
                numberOfDays: days,
                startDate: formatDateKey(startDate),
              },
              {
                onProgress: (p) => {
                  set((state) =>
                    state.pendingGeneration
                      ? {
                          pendingGeneration: {
                            ...state.pendingGeneration,
                            completed: p.completed,
                          },
                        }
                      : {},
                  );
                },
                onRecipeReady: handleRecipeReady,
              },
            );

            // All recipes have landed (each was flushed to the store
            // immediately on arrival, no buffer to drain). Mark
            // finalizing while images continue resolving in the
            // background.
            set((state) =>
              state.pendingGeneration
                ? {
                    pendingGeneration: {
                      ...state.pendingGeneration,
                      stage: 'finalizing',
                      completed: streamSlotIndex,
                      completedDays: days,
                    },
                  }
                : {},
            );

            // Log the successful planning event for the Behavior
            // Intelligence engine — moved here from plan-meals so it
            // fires regardless of which entry point initiated the run.
            get().logPlanningEvent({
              createdAt: startedAt,
              days,
              mealTypes: selectedMealTypes,
            });

            // ── Drop user-picked favourites into the plan ──
            // Each favourite is placed in a slot of ITS OWN meal type
            // (breakfast → breakfast, lunch → lunch, dinner → dinner) so dishes
            // land in the right place, and at most ONCE in the window. Done
            // BEFORE the leftover placeholders below so a favourite that lands on
            // a dinner is the one a leftover reheats.
            try {
              if (presetFavoriteIds && presetFavoriteIds.length) {
                const MEAL_ORDER: Array<'breakfast' | 'lunch' | 'dinner' | 'snack'> = [
                  'breakfast',
                  'lunch',
                  'dinner',
                  'snack',
                ];
                // The meal type a recipe belongs to, read from its tags.
                const mealTypeOf = (
                  recipe: Recipe,
                ): 'breakfast' | 'lunch' | 'dinner' | 'snack' | null => {
                  const tags = (recipe.tags || []).map((t) => t.toLowerCase());
                  return MEAL_ORDER.find((mt) => tags.includes(mt)) ?? null;
                };
                const windowStartKey = formatDateKey(startDate);
                const windowEnd = new Date(startDate);
                windowEnd.setDate(windowEnd.getDate() + days);
                const windowEndKey = formatDateKey(windowEnd);
                const usedSlotIds = new Set<string>();
                const placedFav = new Set<string>();
                for (const favId of presetFavoriteIds) {
                  if (placedFav.has(favId)) continue; // one placement per favourite
                  const fav = get().recipes.find((r) => r.id === favId);
                  if (!fav) continue;
                  const recipeMt = mealTypeOf(fav);
                  // Route to the recipe's own meal type when that meal is cooked
                  // in this plan; a tagless recipe falls back to the first cooked
                  // meal type; a recipe whose meal type isn't cooked is skipped
                  // (e.g. a breakfast favourite when breakfast is set to Skip).
                  let mt: 'breakfast' | 'lunch' | 'dinner' | undefined;
                  if (recipeMt && recipeMt !== 'snack' && selectedMealTypes.includes(recipeMt)) {
                    mt = recipeMt;
                  } else if (!recipeMt) {
                    mt = selectedMealTypes.find((m) => m !== 'snack') as
                      | 'breakfast'
                      | 'lunch'
                      | 'dinner'
                      | undefined;
                  } else {
                    continue;
                  }
                  if (!mt) continue;
                  const slot = get()
                    .mealSlots.filter(
                      (s) =>
                        s.mealType === mt &&
                        !!s.recipeId &&
                        !usedSlotIds.has(s.id) &&
                        s.date >= windowStartKey &&
                        s.date < windowEndKey,
                    )
                    .sort((a, b) => a.date.localeCompare(b.date))[0];
                  if (!slot) continue; // no free slot of this meal type left
                  usedSlotIds.add(slot.id);
                  placedFav.add(favId);
                  get().updateMealSlot(slot.id, { recipeId: favId });
                }
              }
            } catch (e) {
              console.warn('[BG-GEN] favourite placement failed', e);
            }

            // ── Non-cooked meals → labelled placeholder slots ──
            // All recipe slots are placed by now (handleRecipeReady ran for
            // every generated recipe). Cooked meals exist as recipe slots; for
            // every OTHER meal type the user configured, drop a RECIPE-LESS
            // placeholder slot (no recipeId) carrying just a label, so the
            // choice shows on the planning calendar:
            //   • skip → "Skipped"   • grab → "Grab & go"   • buy → "Buy out"
            //   • leftovers → "Leftovers · <last night's dinner>" (names the
            //     dish; no image). If there's no prior dinner (e.g. day 1), the
            //     slot is left blank — no placeholder.
            // Because placeholders carry no recipeId, the grocery generator
            // (which only reads slots with a recipeId) never adds ingredients —
            // a leftover can never double-count the dinner it reheats.
            try {
              if (planMealHabits) {
                // Find a COOKED slot (has a recipe) of a given meal type on a date.
                const cookedSlotOn = (dk: string, mt: 'lunch' | 'dinner') =>
                  get().mealSlots.find(
                    (x) => x.date === dk && x.mealType === mt && x.recipeId,
                  );
                // Source cook ("date|mealType") → how many leftover meals reheat
                // it. Keyed by date+type (not slot id) so it survives any async
                // slot-id remaps before we scale the cook at the end.
                const leftoverDeps = new Map<string, number>();
                const bumpDep = (date: string, mt: 'lunch' | 'dinner') =>
                  leftoverDeps.set(`${date}|${mt}`, (leftoverDeps.get(`${date}|${mt}`) ?? 0) + 1);

                for (let i = 0; i < days; i++) {
                  const d = new Date(startDate);
                  d.setDate(d.getDate() + i);
                  const dk = formatDateKey(d);
                  const prev = new Date(startDate);
                  prev.setDate(prev.getDate() + i - 1);
                  const prevDk = formatDateKey(prev);

                  (['breakfast', 'lunch', 'dinner'] as const).forEach((mt) => {
                    // Cooked meals already have a real recipe slot.
                    if (selectedMealTypes.includes(mt)) return;
                    // Don't stack a duplicate on top of an existing slot.
                    if (get().mealSlots.some((s) => s.date === dk && s.mealType === mt)) return;

                    const habit =
                      mt === 'breakfast'
                        ? planMealHabits.breakfast
                        : mt === 'lunch'
                          ? planMealHabits.lunch
                          : planMealHabits.dinner;

                    let label: string | null = null;
                    if (habit === 'leftovers') {
                      // Resolve the cooked meal this leftover reheats:
                      //   • lunch leftover  → previous day's cooked DINNER (dinner[d-1])
                      //   • dinner leftover → SAME day's cooked LUNCH      (lunch[d])
                      // Symmetric: a leftover reheats the most recent cooked meal
                      // before it (yesterday's dinner for lunch; today's lunch for dinner).
                      let srcDate: string | null = null;
                      let srcMt: 'lunch' | 'dinner' | null = null;
                      if (mt === 'lunch' && i > 0) {
                        srcDate = prevDk;
                        srcMt = 'dinner';
                      } else if (mt === 'dinner') {
                        srcDate = dk;
                        srcMt = 'lunch';
                      }
                      if (!srcDate || !srcMt) return; // nothing yet to reheat → blank
                      const srcSlot = cookedSlotOn(srcDate, srcMt);
                      const srcName = srcSlot
                        ? get().recipes.find((r) => r.id === srcSlot.recipeId)?.name ?? null
                        : null;
                      if (!srcSlot || !srcName) return; // no cooked source → blank
                      label = `Leftovers · ${srcName}`;
                      bumpDep(srcDate, srcMt);
                    } else if (habit === 'skip') {
                      label = 'Skipped';
                    } else if (habit === 'grab') {
                      label = 'Grab & go';
                    } else if (habit === 'buy') {
                      label = 'Buy out';
                    }
                    if (!label) return;

                    get().addMealToSlot({
                      id: '',
                      date: dk,
                      mealType: mt,
                      recipeId: null,
                      customMealName: label,
                    });
                  });
                }

                // Last day spills over (dinner-cook + lunch-leftover pattern only):
                // the FINAL night's dinner is still batched for the next day's
                // lunch — which falls just outside the plan window. Place that
                // leftover lunch on the following day and register the dependency
                // so it's scaled (and shrinks on delete) like any in-window leftover.
                // (The mirror dinner-leftover case reheats the SAME day's lunch, so
                // it never spills past the window — no symmetric block needed.)
                if (
                  planMealHabits.lunch === 'leftovers' &&
                  selectedMealTypes.includes('dinner')
                ) {
                  const lastDate = new Date(startDate);
                  lastDate.setDate(lastDate.getDate() + (days - 1));
                  const lastKey = formatDateKey(lastDate);
                  const lastDinnerSlot = cookedSlotOn(lastKey, 'dinner');
                  const lastDinnerName = lastDinnerSlot
                    ? get().recipes.find((r) => r.id === lastDinnerSlot.recipeId)?.name ?? null
                    : null;
                  const nextDate = new Date(startDate);
                  nextDate.setDate(nextDate.getDate() + days); // day after the window
                  const nextKey = formatDateKey(nextDate);
                  if (
                    lastDinnerSlot &&
                    lastDinnerName &&
                    !get().mealSlots.some((s) => s.date === nextKey && s.mealType === 'lunch')
                  ) {
                    get().addMealToSlot({
                      id: '',
                      date: nextKey,
                      mealType: 'lunch',
                      recipeId: null,
                      customMealName: `Leftovers · ${lastDinnerName}`,
                    });
                    bumpDep(lastKey, 'dinner');
                  }
                }

                // Scale every cook that feeds leftovers: a cook for N people that
                // also covers another meal must yield N × (1 + leftovers) servings,
                // so the recipe's grocery quantities scale up. The home card then
                // shows the larger serving count, and generateGroceryList multiplies
                // ingredients by servingOverride / recipe.servings.
                leftoverDeps.forEach((count, key) => {
                  const [srcDate, srcMt] = key.split('|') as [string, 'lunch' | 'dinner'];
                  const slot = cookedSlotOn(srcDate, srcMt);
                  if (!slot || !slot.recipeId) return;
                  const base = get().recipes.find((r) => r.id === slot.recipeId)?.servings;
                  const perMeal = base && base > 0 ? base : get().preferences.servingSize || 1;
                  get().updateMealSlot(slot.id, {
                    servingOverride: perMeal * (1 + count),
                  });
                });
              }
            } catch (e) {
              console.warn('[BG-GEN] placeholder slot creation failed', e);
            }

            // Wait for image jobs to settle (with a 60s safety cap so we
            // never leave the banner stuck).
            await Promise.race([
              Promise.allSettled(pendingImageJobs),
              new Promise((resolve) => setTimeout(resolve, 60000)),
            ]);

            finishGeneration(streamSlotIndex);
          } catch (err: any) {
            console.error('[BG-GEN] Generation failed:', err);
            set((state) =>
              state.pendingGeneration
                ? {
                    pendingGeneration: {
                      ...state.pendingGeneration,
                      stage: 'failed',
                      error: err?.message ?? 'Something hiccuped',
                    },
                  }
                : {},
            );
          }
        })();
      },

      logCooking: (log) => {
        const newLog: CookingLog = { ...log, id: uuidv4() };
        set((state) => ({ cookingLogs: [...state.cookingLogs, newLog] }));
        applySkipEffectFromLog(get, set, newLog);
        const userId = getCurrentUserId();
        if (userId) {
          db.insertCookingLog(userId, newLog).catch((err) =>
            console.warn('[NUDGE] Failed to sync cooking log:', err)
          );
        }
      },

      logCookingBulk: (logs) => {
        const newLogs: CookingLog[] = logs.map((l) => ({ ...l, id: uuidv4() }));
        set((state) => ({ cookingLogs: [...state.cookingLogs, ...newLogs] }));
        newLogs.forEach((log) => applySkipEffectFromLog(get, set, log));
        const userId = getCurrentUserId();
        if (userId) {
          db.insertCookingLogsBulk(userId, newLogs).catch((err) =>
            console.warn('[NUDGE] Failed to sync cooking logs:', err)
          );
        }
      },

      deleteCookingLog: (slotId) => {
        set((state) => ({
          cookingLogs: state.cookingLogs.filter((l) => l.slotId !== slotId),
        }));
        const userId = getCurrentUserId();
        if (userId) {
          db.deleteCookingLog(userId, slotId).catch((err) =>
            console.warn('[NUDGE] Failed to delete cooking log:', err)
          );
        }
      },

      rateRecipe: (rating) => {
        const newRating: RecipeRating = { ...rating, id: uuidv4() };
        set((state) => {
          // Replace existing rating for the same recipe (one rating per recipe)
          const filtered = state.recipeRatings.filter(
            (r) => r.recipeId !== newRating.recipeId
          );
          return { recipeRatings: [...filtered, newRating] };
        });
        const userId = getCurrentUserId();
        if (userId) {
          db.upsertRecipeRating(userId, newRating).catch((err) =>
            console.warn('[NUDGE] Failed to sync recipe rating:', err)
          );
        }
      },

      // Per-curated-plan rating — mirrors rateRecipe's "one rating
      // per row, replace on re-rate" semantics. The Supabase sync
      // targets the new `meal_plan_ratings` table (own migration).
      ratePlan: (rating) => {
        const newRating: MealPlanRating = { ...rating, id: uuidv4() };
        set((state) => {
          const filtered = state.mealPlanRatings.filter(
            (r) => r.planId !== newRating.planId,
          );
          return { mealPlanRatings: [...filtered, newRating] };
        });
        const userId = getCurrentUserId();
        if (userId) {
          db.upsertMealPlanRating(userId, newRating).catch((err) =>
            console.warn('[NUDGE] Failed to sync meal plan rating:', err)
          );
        }
      },

      dismissNudge: (key) => {
        set((state) => ({
          nudgeDismissals: { ...state.nudgeDismissals, [key]: new Date().toISOString() },
        }));
      },

      dismissDuplicateRecipeGroup: (signature) => {
        set((state) =>
          state.dismissedDuplicateRecipeGroups.includes(signature)
            ? {}
            : { dismissedDuplicateRecipeGroups: [...state.dismissedDuplicateRecipeGroups, signature] },
        );
      },

      setLastWeeklyPromptAt: (iso) => set({ lastWeeklyPromptAt: iso }),

      // Preferences - with sync
      setPreferences: (newPreferences) => {
        set((state) => ({
          preferences: { ...state.preferences, ...newPreferences },
        }));

        // Sync to database
        const userId = getCurrentUserId();
        if (userId) {
          const { preferences } = get();
          db.upsertUserPreferences(userId, preferences);
        }
      },

      // Post-trial PnP tap counter — bump only when called. The
      // gating logic at the call site (QuickActions handleQuickAction)
      // is responsible for deciding whether to invoke this (post-trial
      // user) or skip it (in-trial / premium user).
      incrementPostTrialPnpTap: () => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            postTrialPnpTapCount:
              (state.preferences.postTrialPnpTapCount ?? 0) + 1,
          },
        }));
        const userId = getCurrentUserId();
        if (userId) {
          const { preferences } = get();
          db.upsertUserPreferences(userId, preferences).catch(() => {
            /* best-effort sync — local count is the source of truth */
          });
        }
      },

      // Per-feature free-use marker — bump the matching counter when an
      // anonymous guest builds a plan or a grocery list. The call site gates to
      // signup only once BOTH counters are >= 1.
      markFreeGatedAction: (kind) => {
        set((state) => ({
          preferences: {
            ...state.preferences,
            ...(kind === 'plan'
              ? { freePlanBuildsUsed: (state.preferences.freePlanBuildsUsed ?? 0) + 1 }
              : { freeGroceryBuildsUsed: (state.preferences.freeGroceryBuildsUsed ?? 0) + 1 }),
          },
        }));
        const userId = getCurrentUserId();
        if (userId) {
          const { preferences } = get();
          db.upsertUserPreferences(userId, preferences).catch(() => {
            /* best-effort sync — local counts are the source of truth */
          });
        }
      },

      // Recipe-page feature free-use counter — bump 'add' / 'import' / 'vibe'.
      markRecipeFeatureUsed: (kind) => {
        const field =
          kind === 'add'
            ? 'freeAddRecipeUsed'
            : kind === 'import'
              ? 'freeImportRecipeUsed'
              : 'freeVibeUsed';
        set((state) => ({
          preferences: {
            ...state.preferences,
            [field]: (state.preferences[field] ?? 0) + 1,
          },
        }));
        const userId = getCurrentUserId();
        if (userId) {
          const { preferences } = get();
          db.upsertUserPreferences(userId, preferences).catch(() => {
            /* best-effort sync — local counts are the source of truth */
          });
        }
      },

      // ── Monthly feature usage (paywall limits) ──
      getMonthlyFeatureCount: (feature) => {
        const usage = get().preferences.monthlyFeatureUsage;
        const period = currentMonthKey();
        if (!usage || usage.period !== period) return 0;
        return usage[feature] ?? 0;
      },

      recordMonthlyFeatureUse: (feature) => {
        set((state) => {
          const period = currentMonthKey();
          const cur = state.preferences.monthlyFeatureUsage;
          // Start a fresh bucket when the stored period is a previous month
          // (or nothing has been recorded yet).
          const base =
            cur && cur.period === period ? cur : { period };
          return {
            preferences: {
              ...state.preferences,
              monthlyFeatureUsage: {
                ...base,
                [feature]: (base[feature] ?? 0) + 1,
              },
            },
          };
        });
        const userId = getCurrentUserId();
        if (userId) {
          const { preferences } = get();
          db.upsertUserPreferences(userId, preferences).catch(() => {
            /* best-effort sync — local counts are the source of truth */
          });
        }
      },

      // Recipes - with sync
      addRecipe: (recipe) => {
        // ── UPSERT: prevent duplicate library rows ──
        // If a recipe with the same source-aware identity already exists
        // (curatedSourceId → sourceUrl → name+ingredient-signature), reuse it
        // instead of appending. This is the single dedup gate every add path
        // funnels through: AI generation, curated-plan apply, import, manual.
        // The linear scan also sees rows added earlier in the same batch
        // (e.g. a curated plan applying many meals), so within-batch dedup is free.
        const existing = findExistingRecipe(get().recipes, recipe);
        if (existing) {
          // Backfill a real image if the existing row lacks one and the
          // incoming copy has it — but never create a second row.
          if (!existing.imageUrl && recipe.imageUrl) {
            get().updateRecipe(existing.id, { imageUrl: recipe.imageUrl });
          }
          return existing.id;
        }

        const tempId = recipe.id || generateId();
        const newRecipe = { ...recipe, id: tempId };

        set((state) => ({
          recipes: [...state.recipes, newRecipe],
        }));

        // Sync to database and update with real ID
        const userId = getCurrentUserId();
        if (userId) {
          // Check if this looks like a database UUID already (length > 20 chars, contains hyphens)
          const isLikelyDbId = tempId.length > 20 && tempId.includes('-');

          if (isLikelyDbId) {
            // This is likely already a database ID, just sync without triggering cascading updates
            db.insertRecipe(userId, newRecipe).catch(() => {
              // Recipe probably already exists, silently ignore
            });
          } else {
            // This is a new temp ID, need to sync and update
            db.insertRecipe(userId, newRecipe).then((dbId) => {
              if (dbId && dbId !== tempId) {
                console.log(`Recipe ID updated: ${tempId} -> ${dbId}`);
                // Record the mapping so stale closures can resolve the temp ID
                tempIdToRealId.set(tempId, dbId);

                // Check if the recipe was updated in the store while database insert was pending
                const latestRecipe = get().recipes.find((r) => r.id === tempId);

                // Update the local recipe with the database-generated ID
                const currentState = get();
                const affectedSlots = currentState.mealSlots.filter(
                  (s) => s.recipeId === tempId
                );

                console.log(`Found ${affectedSlots.length} meal slots to update`);

                set((state) => ({
                  recipes: state.recipes.map((r) =>
                    r.id === tempId ? { ...r, id: dbId } : r
                  ),
                  // Also update any meal slots that reference this recipe
                  mealSlots: state.mealSlots.map((s) =>
                    s.recipeId === tempId ? { ...s, recipeId: dbId } : s
                  ),
                }));

                if (latestRecipe) {
                  // Sync any changes (like generated image URL) that happened in the meantime
                  const { id, ...recipeFields } = latestRecipe;
                  db.updateRecipe(userId, dbId, recipeFields);
                }

                // Update affected meal slots in the database with the new recipe ID
                affectedSlots.forEach((slot) => {
                  console.log(`Syncing meal slot for date ${slot.date}, type ${slot.mealType} with recipe ${dbId}`);
                  // Use debounced sync to prevent cascading database calls
                  debounceMealSlotSync(userId, { ...slot, recipeId: dbId }, 500);
                });
              }
            });
          }
        }

        // Loving a recipe — if this save brings the library to 3+ saved
        // recipes, nudge for a review (self-gates on snooze/session).
        if (newRecipe.isSaved) {
          const savedCount = get().recipes.filter((r) => r.isSaved).length;
          if (savedCount >= 3) {
            setTimeout(() => useReviewStore.getState().maybePrompt(), 800);
          }
        }

        return tempId;
      },

      updateRecipe: (id, updates) => {
        // The caller may hold a stale temp ID that was already swapped for a
        // real UUID by addRecipe's async DB callback. Resolve to the current
        // ID so both the local patch and the DB call target the right row.
        let resolvedId = id;

        // Check if this temp ID was already swapped for a real UUID
        const mappedId = tempIdToRealId.get(id);
        if (mappedId) {
          resolvedId = mappedId;
        }

        const currentRecipes = get().recipes;
        const match = currentRecipes.find((r) => r.id === resolvedId);
        if (!match) {
          // Recipe not found under either the original or mapped ID — bail.
          console.warn(`[updateRecipe] Recipe not found for id=${id} (resolved=${resolvedId})`);
          return;
        }
        resolvedId = match.id;

        set((state) => ({
          recipes: state.recipes.map((r) =>
            r.id === resolvedId ? { ...r, ...updates } : r
          ),
        }));

        // Sync to database — only if the resolved ID is a valid UUID,
        // otherwise the DB insert hasn't returned yet and will handle it.
        const userId = getCurrentUserId();
        if (userId && isValidUUID(resolvedId)) {
          db.updateRecipe(userId, resolvedId, updates);
        }
      },

      deleteRecipe: (id) => {
        set((state) => ({
          recipes: state.recipes.filter((r) => r.id !== id),
        }));

        // Sync to database
        const userId = getCurrentUserId();
        if (userId) {
          db.deleteRecipe(userId, id);
        }
      },

      toggleSaveRecipe: (id) => {
        const recipe = get().recipes.find((r) => r.id === id);
        const newIsSaved = recipe ? !recipe.isSaved : true;

        set((state) => ({
          recipes: state.recipes.map((r) =>
            r.id === id ? { ...r, isSaved: newIsSaved } : r
          ),
        }));

        // Sync to database — resolve stale temp IDs and skip non-UUID IDs
        const resolvedSaveId = tempIdToRealId.get(id) || id;
        const userId = getCurrentUserId();
        if (userId && isValidUUID(resolvedSaveId)) {
          db.updateRecipe(userId, resolvedSaveId, { isSaved: newIsSaved });
        }

        // Loving a recipe — once the library hits 3+ saved, nudge for a review.
        if (newIsSaved) {
          const savedCount = get().recipes.filter((r) => r.isSaved).length;
          if (savedCount >= 3) {
            setTimeout(() => useReviewStore.getState().maybePrompt(), 800);
          }
        }
      },

      hasRecipeWithSourceUrl: (sourceUrl) => {
        const recipes = get().recipes;
        console.log('[STORE] Checking for duplicate sourceUrl:', sourceUrl);
        console.log('[STORE] Total recipes in store:', recipes.length);

        // Use the shared canonical-URL normalizer so this guard and addRecipe's
        // upsert agree on what counts as the "same" source URL.
        const normalizeUrl = normalizeRecipeSourceUrl;

        const normalizedInput = normalizeUrl(sourceUrl);
        console.log('[STORE] Normalized input URL:', normalizedInput);
        console.log('[STORE] Recipes with sourceUrl:', recipes.filter(r => r.sourceUrl).map(r => ({ name: r.name, sourceUrl: r.sourceUrl, normalized: normalizeUrl(r.sourceUrl || '') })));

        const hasMatch = recipes.some((r) => {
          if (!r.sourceUrl) return false;
          const normalizedRecipeUrl = normalizeUrl(r.sourceUrl);
          const match = normalizedRecipeUrl === normalizedInput;
          if (match) {
            console.log('[STORE] MATCH FOUND:', r.name, normalizedRecipeUrl, '===', normalizedInput);
          }
          return match;
        });
        console.log('[STORE] Match found:', hasMatch);
        return hasMatch;
      },

      // Meal Plan - with sync
      addMealToSlot: (slot) => {
        // Resolve stale temp recipe IDs — the caller may hold a temp ID
        // (e.g. from a URL param) that was already swapped for a real UUID
        // by addRecipe's async DB callback. Without this, the new slot
        // would reference an ID that no longer matches any recipe.
        let resolvedRecipeId = slot.recipeId;
        if (resolvedRecipeId) {
          const mappedId = tempIdToRealId.get(resolvedRecipeId);
          if (mappedId) {
            resolvedRecipeId = mappedId;
          } else if (!get().recipes.some((r) => r.id === resolvedRecipeId)) {
            // The temp ID isn't in the map yet, but the recipe with that ID
            // is also gone from the store — scan for the recipe by name as a
            // last resort (covers edge cases where the map was GC'd).
            // This is a no-op if the ID is valid.
          }
        }

        const resolvedSlot = { ...slot, recipeId: resolvedRecipeId };
        const slotWithId = { ...resolvedSlot, id: resolvedSlot.id || generateId() };

        set((state) => {
          // Check if this exact recipe is already added for this date and meal type
          const isDuplicate = state.mealSlots.some(
            (s) => s.date === slotWithId.date && s.mealType === slotWithId.mealType && s.recipeId === slotWithId.recipeId
          );

          // If it's a duplicate, don't add it again
          if (isDuplicate) {
            return state;
          }

          // Always add as a new slot to support multiple recipes per meal type
          return { mealSlots: [...state.mealSlots, slotWithId] };
        });

        // Sync to database when the slot is in a syncable state:
        //   • recipe-less placeholder (Skipped / Grab & go / Buy out /
        //     Leftovers) — recipeId is null, persist it now so it survives the
        //     next DB sync instead of being wiped as a local-only row.
        //   • real recipe slot with a valid UUID.
        // A temp (non-UUID) recipeId is the one case we defer — the addRecipe
        // callback re-syncs that slot once the real UUID lands.
        const userId = getCurrentUserId();
        if (
          userId &&
          (!slotWithId.recipeId || isValidUUID(slotWithId.recipeId))
        ) {
          db.upsertMealSlot(userId, slotWithId).then((dbId) => {
            if (dbId && dbId !== slotWithId.id) {
              console.log(`Meal slot ID updated in DB: ${slotWithId.id} -> ${dbId}`);
              set((state) => ({
                mealSlots: state.mealSlots.map((s) =>
                  s.id === slotWithId.id ? { ...s, id: dbId } : s
                ),
              }));
            }
          });
        }
      },

      removeMealFromSlot: (slotId: string) => {
        const { mealSlots, recipes } = get();
        const removed = mealSlots.find((s) => s.id === slotId);
        const cascadeIds = mealRemovalCascadeIds(mealSlots, recipes, removed);
        const idsToRemove = new Set([slotId, ...cascadeIds]);
        // Removing a leftover → shrink the dinner that fed it back down.
        const servingAdj = leftoverServingAdjustment(mealSlots, recipes, removed);

        set((state) => ({
          mealSlots: state.mealSlots.filter((s) => !idsToRemove.has(s.id)),
        }));

        if (servingAdj) {
          get().updateMealSlot(servingAdj.slotId, {
            servingOverride: servingAdj.servingOverride,
          });
        }

        // Sync to database (async, fire-and-forget is OK for UI responsiveness)
        const userId = getCurrentUserId();
        if (userId) {
          idsToRemove.forEach((id) => {
            db.deleteMealSlot(userId, id).catch((error) => {
              console.error('[STORE] Failed to delete meal slot from database:', error);
            });
          });
        }
      },

      // New async version for when we need to wait for deletion to complete
      removeMealFromSlotAsync: async (slotId: string) => {
        const { mealSlots, recipes } = get();
        const removed = mealSlots.find((s) => s.id === slotId);
        const cascadeIds = mealRemovalCascadeIds(mealSlots, recipes, removed);
        const idsToRemove = new Set([slotId, ...cascadeIds]);
        // Removing a leftover → shrink the dinner that fed it back down.
        const servingAdj = leftoverServingAdjustment(mealSlots, recipes, removed);

        set((state) => ({
          mealSlots: state.mealSlots.filter((s) => !idsToRemove.has(s.id)),
        }));

        if (servingAdj) {
          get().updateMealSlot(servingAdj.slotId, {
            servingOverride: servingAdj.servingOverride,
          });
        }

        // Sync to database and wait for completion
        const userId = getCurrentUserId();
        if (userId) {
          const results = await Promise.all(
            [...idsToRemove].map((id) => db.deleteMealSlot(userId, id)),
          );
          const success = results.every(Boolean);
          if (!success) {
            console.error('[STORE] Failed to delete meal slot(s) from database');
          }
          return success;
        }
        return false;
      },

      updateMealSlot: (slotId, updates) => {
        let updatedSlot: MealSlot | null = null;

        set((state) => {
          const newSlots = state.mealSlots.map((s) => {
            if (s.id === slotId) {
              const newSlot = { ...s, ...updates };
              updatedSlot = newSlot;
              return newSlot;
            }
            return s;
          });
          return { mealSlots: newSlots };
        });

        // Sync the update to the database
        const userId = getCurrentUserId();
        const slotToSync = updatedSlot as MealSlot | null;
        if (userId && slotToSync) {
          // If the slot ID is a standard UUID (from DB), use direct update by ID
          // This correctly handles swaps where recipe_id changes
          const isDbId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(slotId);
          if (isDbId) {
            db.updateMealSlotById(userId, slotId, {
              recipeId: slotToSync.recipeId,
              customMealName: slotToSync.customMealName ?? null,
              servingOverride: slotToSync.servingOverride ?? null,
              curatedPlanId: slotToSync.curatedPlanId ?? null,
            }).catch((error) => {
              console.error('[STORE] Failed to update meal slot in database:', error);
            });
          } else if (slotToSync.recipeId && isValidUUID(slotToSync.recipeId)) {
            // Temp ID slot — use upsert (will insert as new row)
            debounceMealSlotSync(userId, slotToSync, 500);
          }
        }
      },

      clearWeekPlan: (startDate) => {
        const start = new Date(startDate);
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        const endDateStr = formatLocalDate(end);

        set((state) => ({
          mealSlots: state.mealSlots.filter((s) => {
            const slotDate = new Date(s.date);
            return slotDate < start || slotDate >= end;
          }),
        }));

        // Sync to database
        const userId = getCurrentUserId();
        if (userId) {
          db.clearMealSlotsInRange(userId, startDate, endDateStr);
        }
      },

      // Grocery List - with sync
      generateGroceryList: (startDate, endDate) => {
        const { mealSlots, recipes } = get();

        const slotsInRange = mealSlots.filter((s) => {
          // Only slots with a real recipe contribute ingredients. Placeholder
          // slots (Skipped / Grab & go / Buy out / Leftovers) carry no
          // recipeId, so they're naturally excluded — a leftover never
          // re-adds the dinner it reheats.
          return s.date >= startDate && s.date <= endDate && s.recipeId;
        });

        // Use ingredient name + CANONICAL unit as key for intelligent combining
        // This ensures "4 eggs" + "2 g egg" combine into one egg entry
        // The canonical unit is the preferred display unit for each ingredient type
        const ingredientMap = new Map<string, GroceryItem>();

        console.log(`[GROCERY] ========== GENERATING GROCERY LIST ==========`);
        console.log(`[GROCERY] Date range: ${startDate} to ${endDate}`);
        console.log(`[GROCERY] Total recipes in store: ${recipes.length}`);
        console.log(`[GROCERY] Found ${slotsInRange.length} meal slots with recipes`);

        slotsInRange.forEach((slot, slotIndex) => {
          const recipe = recipes.find((r) => r.id === slot.recipeId);
          if (!recipe) {
            console.log(`[GROCERY] WARNING: Recipe not found for slot ${slot.id} with recipeId ${slot.recipeId}`);
            return;
          }

          console.log(`[GROCERY] Slot ${slotIndex + 1}/${slotsInRange.length}: ${slot.date} ${slot.mealType} - ${recipe.name} (${recipe.ingredients.length} ingredients)`);

          // Calculate serving multiplier based on serving override
          const servingMultiplier = slot.servingOverride ? slot.servingOverride / recipe.servings : 1;

          // ADDITIVE FAST PATH for Curated Meal Plans
          // Bypasses runtime processing and uses pre-calculated perfectly uniform ingredients
          // to ensure zero duplication
          if (recipe.curatedSourceId && CURATED_GROCERY_CACHE[recipe.curatedSourceId]) {
            console.log(`[GROCERY] FAST PATH: Using pre-calculated static cache for curated recipe ${recipe.curatedSourceId}`);
            const cachedItems = CURATED_GROCERY_CACHE[recipe.curatedSourceId];
            
            cachedItems.forEach(cachedIng => {
              const adjustedBaseQty = cachedIng.quantity_base * servingMultiplier;
              // Re-derive the key from name + base unit only (category is
              // intentionally omitted) so curated rows aggregate cleanly with
              // rows emitted by the regular path below. The cached
              // `normalizedKey` historically baked in a category suffix
              // (e.g. "rolled oat-g-pantry"), which split rows whenever the
              // AI-generated counterpart was tagged differently.
              const cachedNormalizedName = normalizeIngredientName(cachedIng.canonicalName);
              const key = `${cachedNormalizedName}-${cachedIng.base_unit}`;
              
              const existing = ingredientMap.get(key);
              if (existing && existing.quantity_base != null) {
                const summedBase = existing.quantity_base + adjustedBaseQty;
                existing.quantity_base = summedBase;
                existing.quantity = formatFromBaseUnit(summedBase, cachedIng.base_unit, cachedIng.canonicalName);
                if (slot.recipeId && !existing.recipeIds.includes(slot.recipeId)) {
                  existing.recipeIds.push(slot.recipeId);
                }
              } else {
                const displayQuantity = formatFromBaseUnit(adjustedBaseQty, cachedIng.base_unit, cachedIng.canonicalName);
                ingredientMap.set(key, {
                  id: generateGroceryItemId(),
                  // Use Title-Case canonical so curated rows display the
                  // same as regular-path rows ("Rolled Oat", not the raw
                  // lowercase form stored in the cache).
                  name: getCanonicalIngredientName(cachedIng.canonicalName),
                  quantity: displayQuantity,
                  unit: '',
                  category: cachedIng.category,
                  isChecked: false,
                  recipeIds: [slot.recipeId!],
                  quantity_base: adjustedBaseQty,
                  base_unit: cachedIng.base_unit,
                });
              }
            });
            return; // Skip normal processing for this recipe
          }

          // Split any compound ingredient names ("Olive Oil + 2 tsp Cumin")
          // into separate ingredients first, so they land on their own grocery
          // rows instead of one glued line. Safety net for recipes that were
          // saved before sanitization split them at generation time.
          recipe.ingredients.flatMap(splitCompoundIngredient).forEach((ing) => {
            try {
              // Convert ingredient quantity to base unit
              const baseConversion = convertToBaseUnit(ing.quantity, ing.unit, ing.name);
              const adjustedBaseQty = baseConversion.quantity * servingMultiplier;

              // Key on normalized name + ACTUAL base unit only. Category is
              // intentionally excluded: it's a display/grouping concern, not
              // an identity one. Including it caused the same ingredient
              // tagged differently across recipes (e.g. "rolled oat" as
              // 'pantry' in one recipe vs 'other' in another) to split into
              // two grocery rows. The base unit is still part of the key so
              // genuinely incompatible quantities (e.g. "600 g barramundi"
              // vs "2 pieces barramundi") stay separate.
              const normalizedName = normalizeIngredientName(ing.name);
              const canonicalCategory = getCanonicalCategory(ing.name, ing.category);
              const key = `${normalizedName}-${baseConversion.unit}`;

              // Log for debugging
              console.log(`[GROCERY-ING] ${ing.name}: qty=${ing.quantity} unit=${ing.unit} → normalized=${normalizedName} baseUnit=${baseConversion.unit} category=${ing.category}→${canonicalCategory} key=${key}`);

              const canonicalName = getCanonicalIngredientName(ing.name);

              // HIGH-CONFIDENCE AUTO-COMBINE: the key is
              // normalizedName-baseUnit-canonicalCategory, so only the SAME
              // canonical ingredient in the SAME base unit & category sums.
              // Genuinely ambiguous cases (e.g. "600 g barramundi" vs
              // "2 pieces barramundi" — different base units) get different
              // keys, stay separate, and fall through to the review modal.
              const existing = ingredientMap.get(key);
              if (existing && existing.quantity_base != null) {
                const summedBase = existing.quantity_base + adjustedBaseQty;
                existing.quantity_base = summedBase;
                existing.quantity = formatFromBaseUnit(summedBase, baseConversion.unit, ing.name);
                if (slot.recipeId && !existing.recipeIds.includes(slot.recipeId)) {
                  existing.recipeIds.push(slot.recipeId);
                }
              } else {
                // Format using actual base conversion unit (g, ml, piece), not canonical
                const displayQuantity = formatFromBaseUnit(adjustedBaseQty, baseConversion.unit, ing.name);
                ingredientMap.set(key, {
                  id: generateGroceryItemId(),
                  name: canonicalName,
                  quantity: displayQuantity,
                  unit: '', // Leave unit empty since formatFromBaseUnit includes everything
                  category: canonicalCategory, // Use canonical category instead of original
                  isChecked: false,
                  recipeIds: [slot.recipeId!],
                  quantity_base: adjustedBaseQty,
                  base_unit: baseConversion.unit, // Store actual base unit
                });
              }
            } catch (error) {
              // Log error but continue processing other ingredients
              console.warn(
                `Failed to convert unit for ${ing.name} with quantity ${ing.quantity} ${ing.unit}:`,
                error
              );
              // Fallback: add without base-unit conversion (backwards compatible).
              // Still sum same-key entries (same normalized name + unit + category).
              const normalizedName = normalizeIngredientName(ing.name);
              const normalizedUnit = normalizeUnit(ing.unit);
              // Drop category from the key — same reason as the primary
              // path above. Two recipes tagging the same ingredient with
              // different categories must still merge.
              const key = `${normalizedName}-${normalizedUnit}`;
              const baseQty = parseFloat(String(ing.quantity)) || 0;
              const adjustedQty = baseQty * servingMultiplier;
              const canonicalName = getCanonicalIngredientName(ing.name);

              const existing = ingredientMap.get(key);
              if (existing) {
                const summed = (parseFloat(existing.quantity) || 0) + adjustedQty;
                existing.quantity = summed.toString();
                if (slot.recipeId && !existing.recipeIds.includes(slot.recipeId)) {
                  existing.recipeIds.push(slot.recipeId);
                }
              } else {
                ingredientMap.set(key, {
                  id: generateGroceryItemId(),
                  name: canonicalName,
                  quantity: adjustedQty.toString(),
                  unit: normalizedUnit,
                  category: ing.category,
                  isChecked: false,
                  recipeIds: [slot.recipeId!],
                });
              }
            }
          });
        });

        // ── Count→Weight reconciliation pass ────────────────────────────
        // If the same canonical ingredient appears as BOTH a `piece`-keyed
        // row and a `g`-keyed row AND the average-weight lookup is high
        // enough confidence to convert (cinnamon stick → 3g, garlic clove
        // → 5g, etc.), fold the piece quantity into the gram row and drop
        // the piece row. This catches the mixed-unit case that the
        // (name, base_unit) key intentionally splits on for safety.
        const keysByName = new Map<string, { gramKey?: string; mlKey?: string; pieceKey?: string }>();
        ingredientMap.forEach((item, key) => {
          const nameKey = normalizeIngredientName(item.name);
          const slot = keysByName.get(nameKey) ?? {};
          if (item.base_unit === 'g') slot.gramKey = key;
          else if (item.base_unit === 'ml') slot.mlKey = key;
          else if (item.base_unit === 'piece') slot.pieceKey = key;
          keysByName.set(nameKey, slot);
        });
        keysByName.forEach(({ gramKey, pieceKey }, nameKey) => {
          if (!gramKey || !pieceKey) return;
          if (!shouldConvertCountToWeight(nameKey)) return;
          const lookup = getAverageWeightWithConfidence(nameKey);
          if (!lookup) return;
          const pieceItem = ingredientMap.get(pieceKey);
          const gramItem = ingredientMap.get(gramKey);
          if (!pieceItem || !gramItem || gramItem.quantity_base == null) return;
          const pieceCount = pieceItem.quantity_base ?? parseFloat(pieceItem.quantity) ?? 0;
          if (!pieceCount) return;
          const convertedG = pieceCount * lookup.weightG;
          const summedG = gramItem.quantity_base + convertedG;
          gramItem.quantity_base = summedG;
          gramItem.quantity = formatFromBaseUnit(summedG, 'g', gramItem.name);
          // Carry the piece row's recipe attribution onto the merged row.
          pieceItem.recipeIds.forEach((rid) => {
            if (!gramItem.recipeIds.includes(rid)) gramItem.recipeIds.push(rid);
          });
          ingredientMap.delete(pieceKey);
          console.log(
            `[GROCERY] count→weight: merged ${pieceCount} × ${lookup.weightG}g of ${nameKey} into the weight row (${summedG}g total).`,
          );
        });

        // ── Count→Volume reconciliation pass ────────────────────────────
        // Same idea as count→weight, but for LIQUIDS sold by the container.
        // If a canonical liquid appears as BOTH an `ml`-keyed row and a
        // `piece`-keyed row AND it's in the curated container-volume lookup
        // (so a counted "piece" reliably means one can/carton — e.g.
        // "1 can coconut milk" = 400 mL), fold the count into the mL row and
        // drop the piece row. Deliberately curated: only liquids where a
        // counted unit is unambiguously a container, never produce.
        keysByName.forEach(({ mlKey, pieceKey }, nameKey) => {
          if (!mlKey || !pieceKey) return;
          if (!ingredientMap.has(pieceKey)) return; // already consumed by the gram pass
          const perContainerMl = getContainerVolumeML(nameKey);
          if (!perContainerMl) return;
          const mlItem = ingredientMap.get(mlKey);
          const pieceItem = ingredientMap.get(pieceKey);
          if (!mlItem || !pieceItem || mlItem.quantity_base == null) return;
          const pieceCount = pieceItem.quantity_base ?? parseFloat(pieceItem.quantity) ?? 0;
          if (!pieceCount) return;
          const convertedMl = pieceCount * perContainerMl;
          const summedMl = mlItem.quantity_base + convertedMl;
          mlItem.quantity_base = summedMl;
          mlItem.quantity = formatFromBaseUnit(summedMl, 'ml', mlItem.name);
          pieceItem.recipeIds.forEach((rid) => {
            if (!mlItem.recipeIds.includes(rid)) mlItem.recipeIds.push(rid);
          });
          ingredientMap.delete(pieceKey);
          console.log(
            `[GROCERY] count→volume: merged ${pieceCount} × ${perContainerMl}mL of ${nameKey} into the volume row (${summedMl}mL total).`,
          );
        });

        const groceryItems = Array.from(ingredientMap.values());

        // Surface pending priority ingredients (from recent
        // "missing_ingredients" skips) at the top of the list.
        // Matching is normalized-name based so "tomatoes" matches
        // an item stored as "tomato". Items keep their relative
        // order otherwise.
        const priorityRaw = get().pendingPriorityIngredients;
        if (priorityRaw.length > 0) {
          const prioritySet = new Set(
            priorityRaw.map((n) => normalizeIngredientName(n).toLowerCase()),
          );
          groceryItems.sort((a, b) => {
            const aHit = prioritySet.has(normalizeIngredientName(a.name).toLowerCase()) ? 1 : 0;
            const bHit = prioritySet.has(normalizeIngredientName(b.name).toLowerCase()) ? 1 : 0;
            return bHit - aHit;
          });
          get().clearPendingPriorityIngredients();
        }

        console.log(`[GROCERY] ========== GENERATION COMPLETE ==========`);
        console.log(`[GROCERY] Unique keys in map: ${ingredientMap.size}`);
        console.log(`[GROCERY] Final list has ${groceryItems.length} items`);
        console.log(`[GROCERY] Items by category:`);
        const categoryCount: Record<string, number> = {};
        groceryItems.forEach(item => {
          categoryCount[item.category] = (categoryCount[item.category] || 0) + 1;
        });
        Object.entries(categoryCount).forEach(([cat, count]) => {
          console.log(`[GROCERY]   ${cat}: ${count} items`);
        });
        set({ groceryItems });

        // Sync to database. replaceUserGroceryItems wipes + reinserts ALL of the
        // user's grocery rows, so we must persist the union of generated +
        // custom items — otherwise regenerating the list silently drops the
        // user's manually-added custom items from the DB.
        const userId = getCurrentUserId();
        if (userId) {
          db.replaceUserGroceryItems(userId, [...groceryItems, ...get().customGroceryItems]);
        }

        // Find similar ingredients (same name + category but different units)
        const similarMap = new Map<string, GroceryItem[]>();
        groceryItems.forEach((item) => {
          const key = `${normalizeIngredientName(item.name)}-${item.category}`;
          if (!similarMap.has(key)) {
            similarMap.set(key, []);
          }
          similarMap.get(key)!.push(item);
        });

        const similarGroups: SimilarIngredientGroup[] = [];
        similarMap.forEach((items, key) => {
          // Only flag as similar if items have different base units
          const uniqueUnits = new Set(items.map((i) => i.base_unit));
          if (uniqueUnits.size > 1) {
            const [canonicalName, category] = key.split('-');
            similarGroups.push({
              id: generateGroceryItemId(),
              canonicalName,
              category: category as any,
              variants: items.map((item) => ({
                itemId: item.id,
                displayName: item.name,
                quantity: item.quantity_base || parseFloat(item.quantity) || 0,
                baseUnit: item.base_unit || item.unit || 'piece',
                displayQuantity: item.quantity,
              })),
            });
          }
        });

        set({ similarIngredients: similarGroups });

        // First-run paywall gating: once the user has generated a grocery list with
        // at least one slot, flip `hasUsedFreeTrial` so subsequent planning flows
        // require a subscription. Idempotent — only writes when not already set.
        if (slotsInRange.length > 0 && !get().preferences.hasUsedFreeTrial) {
          set((state) => ({
            preferences: { ...state.preferences, hasUsedFreeTrial: true },
          }));
        }
      },

      combineSimilarIngredients: (groupId, selectedItemIds) => {
        const { similarIngredients, groceryItems } = get();
        const group = similarIngredients.find((g) => g.id === groupId);
        if (!group || selectedItemIds.length < 2) return;

        const selectedItems = groceryItems.filter((item) => selectedItemIds.includes(item.id));
        if (selectedItems.length < 2) return;

        // Calculate total quantity (using first item's unit as primary)
        const primaryItem = selectedItems[0];
        const totalQuantity = selectedItems.reduce((sum, item) => sum + (item.quantity_base || 0), 0);

        // Create combined item
        const combinedItem: GroceryItem = {
          ...primaryItem,
          quantity_base: totalQuantity,
          base_unit: primaryItem.base_unit || 'piece',
          quantity: formatFromBaseUnit(totalQuantity, primaryItem.base_unit || 'piece', primaryItem.name),
          unit: '',
          recipeIds: Array.from(new Set([...selectedItems.flatMap((i) => i.recipeIds)])),
        };

        // Remove old items and add combined item
        set((state) => ({
          groceryItems: [
            ...state.groceryItems.filter((item) => !selectedItemIds.includes(item.id)),
            combinedItem,
          ],
          similarIngredients: state.similarIngredients.filter((g) => g.id !== groupId),
        }));

        // Sync to database
        const userId = getCurrentUserId();
        if (userId) {
          selectedItemIds.forEach((id) => {
            db.deleteGroceryItem(userId, id);
          });
          db.insertGroceryItem(userId, combinedItem);
        }
      },

      clearSimilarIngredients: () => {
        set({ similarIngredients: [] });
      },

      toggleGroceryItem: (itemId) => {
        let newIsChecked = false;

        set((state) => ({
          groceryItems: state.groceryItems.map((item) => {
            if (item.id === itemId) {
              newIsChecked = !item.isChecked;
              return { ...item, isChecked: newIsChecked };
            }
            return item;
          }),
        }));

        // Sync to database only if ID is a valid UUID
        const userId = getCurrentUserId();
        if (userId && isValidUUID(itemId)) {
          db.updateGroceryItem(userId, itemId, { isChecked: newIsChecked });
        }
      },

      addGroceryItem: (item) => {
        try {
          // Convert new item to base unit
          const baseConversion = convertToBaseUnit(item.quantity, item.unit, item.name);
          const displayQuantity = formatFromBaseUnit(baseConversion.quantity, baseConversion.unit, item.name);

          const newItem = {
            ...item,
            id: generateGroceryItemId(),
            quantity: displayQuantity,
            unit: '', // Leave unit empty since displayQuantity includes everything
            quantity_base: baseConversion.quantity,
            base_unit: baseConversion.unit,
          };

          // Check if ingredient already exists (by normalized name + base unit)
          const normalizedName = normalizeIngredientName(item.name);
          const baseUnit = baseConversion.unit;

          set((state) => {
            const existingIndex = state.groceryItems.findIndex(
              (g) =>
                normalizeIngredientName(g.name) === normalizedName &&
                (g.base_unit || g.unit) === baseUnit
            );

            if (existingIndex >= 0) {
              // Combine with existing item
              const existing = state.groceryItems[existingIndex];
              const existingBaseQty = existing.quantity_base || parseFloat(existing.quantity) || 0;
              const newBaseQty = existingBaseQty + baseConversion.quantity;

              const updated = {
                ...existing,
                quantity_base: newBaseQty,
                base_unit: baseUnit,
                quantity: formatFromBaseUnit(newBaseQty, baseUnit, existing.name),
                unit: '', // Leave empty since formatFromBaseUnit includes everything
              };

              return {
                groceryItems: state.groceryItems.map((item, i) => (i === existingIndex ? updated : item)),
              };
            } else {
              // Add as new item
              return {
                groceryItems: [...state.groceryItems, newItem],
              };
            }
          });

          // Sync to database
          const userId = getCurrentUserId();
          if (userId) {
            const state = get();
            // Re-fetch and sync all items to ensure consistency
            db.replaceUserGroceryItems(userId, state.groceryItems);
          }
        } catch (error) {
          // Fallback: add without conversion
          console.warn(`Failed to convert unit for ${item.name}:`, error);
          const newItem = { ...item, id: generateGroceryItemId() };

          set((state) => ({
            groceryItems: [...state.groceryItems, newItem],
          }));

          // Sync to database
          const userId = getCurrentUserId();
          if (userId) {
            db.insertGroceryItem(userId, newItem);
          }
        }
      },

      removeGroceryItem: (itemId) => {
        set((state) => ({
          groceryItems: state.groceryItems.filter((item) => item.id !== itemId),
        }));

        // Sync to database
        const userId = getCurrentUserId();
        if (userId) {
          db.deleteGroceryItem(userId, itemId);
        }
      },

      updateGroceryItem: (itemId, updates) => {
        set((state) => ({
          groceryItems: state.groceryItems.map((item) =>
            item.id === itemId ? { ...item, ...updates } : item
          ),
        }));

        // Sync to database
        const userId = getCurrentUserId();
        if (userId && isValidUUID(itemId)) {
          db.updateGroceryItem(userId, itemId, updates);
        }
      },

      toggleCustomGroceryItem: (itemId) => {
        let newIsChecked = false;

        set((state) => ({
          customGroceryItems: state.customGroceryItems.map((item) => {
            if (item.id === itemId) {
              newIsChecked = !item.isChecked;
              return { ...item, isChecked: newIsChecked };
            }
            return item;
          }),
        }));

        // Sync to database only if ID is a valid UUID
        const userId = getCurrentUserId();
        if (userId && isValidUUID(itemId)) {
          db.updateGroceryItem(userId, itemId, { isChecked: newIsChecked });
        }
      },

      addCustomGroceryItem: (item) => {
        try {
          // Convert new item to base unit
          const baseConversion = convertToBaseUnit(item.quantity, item.unit, item.name);
          const displayQuantity = formatFromBaseUnit(baseConversion.quantity, baseConversion.unit, item.name);

          const newItem = {
            ...item,
            id: generateGroceryItemId(),
            quantity: displayQuantity,
            unit: '', // Leave unit empty since displayQuantity includes everything
            quantity_base: baseConversion.quantity,
            base_unit: baseConversion.unit,
          };

          // Check if ingredient already exists (by normalized name + base unit)
          const normalizedName = normalizeIngredientName(item.name);
          const baseUnit = baseConversion.unit;

          set((state) => {
            const existingIndex = state.customGroceryItems.findIndex(
              (g) =>
                normalizeIngredientName(g.name) === normalizedName &&
                (g.base_unit || g.unit) === baseUnit
            );

            if (existingIndex >= 0) {
              // Combine with existing item
              const existing = state.customGroceryItems[existingIndex];
              const existingBaseQty = existing.quantity_base || parseFloat(existing.quantity) || 0;
              const newBaseQty = existingBaseQty + baseConversion.quantity;

              const updated = {
                ...existing,
                quantity_base: newBaseQty,
                base_unit: baseUnit,
                quantity: formatFromBaseUnit(newBaseQty, baseUnit, existing.name),
                unit: '', // Leave empty since formatFromBaseUnit includes everything
              };

              return {
                customGroceryItems: state.customGroceryItems.map((item, i) => (i === existingIndex ? updated : item)),
              };
            } else {
              // Add as new item
              return {
                customGroceryItems: [...state.customGroceryItems, newItem],
              };
            }
          });

          // Sync to database
          const userId = getCurrentUserId();
          if (userId) {
            const state = get();
            // Re-fetch and sync all items to ensure consistency
            db.replaceUserGroceryItems(userId, [...state.groceryItems, ...state.customGroceryItems]);
          }
        } catch (error) {
          // Fallback: add without conversion
          console.warn(`Failed to convert unit for ${item.name}:`, error);
          const newItem = { ...item, id: generateGroceryItemId() };

          set((state) => ({
            customGroceryItems: [...state.customGroceryItems, newItem],
          }));

          // Sync to database
          const userId = getCurrentUserId();
          if (userId) {
            db.insertGroceryItem(userId, newItem);
          }
        }
      },

      mergeIntoGroceryItem: (itemId, addedQuantity, addedUnit) => {
        try {
          set((state) => {
            // Search in groceryItems first, then customGroceryItems
            const groceryIndex = state.groceryItems.findIndex((g) => g.id === itemId);
            if (groceryIndex >= 0) {
              const existing = state.groceryItems[groceryIndex];
              const incoming = convertToBaseUnit(addedQuantity, addedUnit, existing.name);
              const existingBaseQty = existing.quantity_base || parseFloat(existing.quantity) || 0;
              const existingUnit = existing.base_unit || incoming.unit;
              const combined = combineBaseAmounts(
                existingBaseQty, existingUnit, incoming.quantity, incoming.unit, existing.name,
              );
              const updated = {
                ...existing,
                quantity_base: combined.quantity,
                base_unit: combined.unit,
                quantity: formatFromBaseUnit(combined.quantity, combined.unit, existing.name),
                unit: '',
              };
              return {
                groceryItems: state.groceryItems.map((item, i) => (i === groceryIndex ? updated : item)),
              };
            }
            const customIndex = state.customGroceryItems.findIndex((g) => g.id === itemId);
            if (customIndex >= 0) {
              const existing = state.customGroceryItems[customIndex];
              const incoming = convertToBaseUnit(addedQuantity, addedUnit, existing.name);
              const existingBaseQty = existing.quantity_base || parseFloat(existing.quantity) || 0;
              const existingUnit = existing.base_unit || incoming.unit;
              const combined = combineBaseAmounts(
                existingBaseQty, existingUnit, incoming.quantity, incoming.unit, existing.name,
              );
              const updated = {
                ...existing,
                quantity_base: combined.quantity,
                base_unit: combined.unit,
                quantity: formatFromBaseUnit(combined.quantity, combined.unit, existing.name),
                unit: '',
              };
              return {
                customGroceryItems: state.customGroceryItems.map((item, i) => (i === customIndex ? updated : item)),
              };
            }
            return {};
          });
          // Sync to database
          const userId = getCurrentUserId();
          if (userId) {
            const state = get();
            db.replaceUserGroceryItems(userId, [...state.groceryItems, ...state.customGroceryItems]);
          }
        } catch (error) {
          console.warn(`Failed to merge grocery item ${itemId}:`, error);
        }
      },

      removeCustomGroceryItem: (itemId) => {
        set((state) => ({
          customGroceryItems: state.customGroceryItems.filter((item) => item.id !== itemId),
        }));

        // Sync to database
        const userId = getCurrentUserId();
        if (userId) {
          db.deleteGroceryItem(userId, itemId);
        }
      },

      updateCustomGroceryItem: (itemId, updates) => {
        set((state) => ({
          customGroceryItems: state.customGroceryItems.map((item) =>
            item.id === itemId ? { ...item, ...updates } : item
          ),
        }));

        // Sync to database
        const userId = getCurrentUserId();
        if (userId && isValidUUID(itemId)) {
          db.updateGroceryItem(userId, itemId, updates);
        }
      },

      clearGroceryList: () => {
        set({ groceryItems: [] });

        // Sync to database
        const userId = getCurrentUserId();
        if (userId) {
          db.clearUserGroceryItems(userId);
        }
      },

      clearCheckedItems: () => {
        set((state) => ({
          groceryItems: state.groceryItems.filter((item) => !item.isChecked),
          customGroceryItems: state.customGroceryItems.filter((item) => !item.isChecked),
        }));

        // Sync to database
        const userId = getCurrentUserId();
        if (userId) {
          db.clearCheckedGroceryItems(userId);
        }
      },

      saveGroceryList: (name) => {
        const state = get();

        // Combine meal items and custom items, remove checked items
        const uncheckedMealItems = state.groceryItems.filter(item => !item.isChecked);
        const uncheckedCustomItems = state.customGroceryItems.filter(item => !item.isChecked);

        // Combine all items WITHOUT deduplication to preserve all items
        // The items are already properly combined during generateGroceryList
        const allItems = [...uncheckedMealItems, ...uncheckedCustomItems];
        const combinedItems = allItems.map(item => ({ ...item, isChecked: false }));

        // Check if we're at max capacity (4 lists)
        if (state.savedGroceryLists.length >= 4) {
          console.warn('[STORE] Maximum of 4 saved grocery lists reached');
          return;
        }

        const newList: SavedGroceryList = {
          id: uuidv4(), // Use proper UUID for database compatibility
          name,
          items: combinedItems,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          savedGroceryLists: [...state.savedGroceryLists, newList],
        }));

        // Sync to database
        const userId = getCurrentUserId();
        if (userId) {
          db.saveSavedGroceryList(userId, newList);
          console.log('[STORE] Saved grocery list:', newList.name);
        }
      },

      saveAndClearCheckedItems: (name: string) => {
        const state = get();

        // Get only unchecked items to save (items still to buy, not already checked off)
        const uncheckedMealItems = state.groceryItems.filter(item => !item.isChecked);
        const uncheckedCustomItems = state.customGroceryItems.filter(item => !item.isChecked);

        // Combine all unchecked items WITHOUT deduplication to preserve all items
        const allItems = [...uncheckedMealItems, ...uncheckedCustomItems];

        // Don't deduplicate here - just preserve all items as-is
        // The items are already properly combined during generateGroceryList
        const combinedItems = allItems.map(item => ({ ...item, isChecked: false }));

        // Check if we're at max capacity (4 lists)
        if (state.savedGroceryLists.length >= 4) {
          console.warn('[STORE] Maximum of 4 saved grocery lists reached');
          return false;
        }

        // Create new saved list
        const newList: SavedGroceryList = {
          id: uuidv4(), // Use proper UUID for database compatibility
          name,
          items: combinedItems,
          createdAt: new Date().toISOString(),
        };

        // Save list and CLEAR the grocery list completely
        // Once saved to shopping list, the grocery list should be empty to avoid confusion
        set((state) => ({
          savedGroceryLists: [...state.savedGroceryLists, newList],
          groceryItems: [], // Clear all grocery items
          customGroceryItems: [], // Clear all custom items
          groceryStartDate: null, // Reset date range
          groceryEndDate: null,
        }));

        // Sync to database
        const userId = getCurrentUserId();
        if (userId) {
          db.saveSavedGroceryList(userId, newList);
          db.clearUserGroceryItems(userId); // Clear ALL items from database
          console.log('[STORE] Saved grocery list and cleared grocery section:', newList.name);
        }

        return true;
      },

      updateSavedGroceryList: (listId: string, name: string) => {
        const state = get();

        // Check if list exists
        const existingList = state.savedGroceryLists.find(list => list.id === listId);
        if (!existingList) {
          console.warn('[STORE] Cannot update: Saved grocery list not found:', listId);
          return false;
        }

        // Get ALL items from currentSavedListItems (both checked and unchecked)
        const allItems = [...state.currentSavedListItems];

        if (allItems.length === 0) {
          console.warn('[STORE] Cannot update: No items to save');
          return false;
        }

        // Combine and deduplicate items, preserving isChecked state
        const itemMap = new Map<string, GroceryItem>();
        allItems.forEach(item => {
          const key = `${item.name.toLowerCase()}-${item.category}`;
          if (itemMap.has(key)) {
            const existing = itemMap.get(key)!;
            // Simple quantity addition for now
            const existingQty = parseFloat(existing.quantity) || 0;
            const newQty = parseFloat(item.quantity) || 0;
            existing.quantity = String(existingQty + newQty);
            // Preserve checked state: if either is checked, keep it checked
            existing.isChecked = existing.isChecked || item.isChecked;
          } else {
            itemMap.set(key, { ...item });
          }
        });

        const deduplicatedItems = Array.from(itemMap.values());

        // Update the existing list (keep original createdAt)
        const updatedList: SavedGroceryList = {
          ...existingList,
          name,
          items: deduplicatedItems,
          // Keep original createdAt - don't update it
        };

        set((state) => ({
          savedGroceryLists: state.savedGroceryLists.map(list =>
            list.id === listId ? updatedList : list
          ),
        }));

        // Sync to database using upsert
        const userId = getCurrentUserId();
        if (userId) {
          db.saveSavedGroceryList(userId, updatedList).then((success) => {
            if (success) {
              console.log('[STORE] Updated saved grocery list:', name, `(${deduplicatedItems.length} items)`);
            } else {
              console.error('[STORE] Failed to update saved grocery list:', listId);
            }
          });
        }

        return true;
      },

      deleteSavedGroceryList: (listId) => {
        set((state) => ({
          savedGroceryLists: state.savedGroceryLists.filter(list => list.id !== listId),
        }));

        // Sync to database - use async operation but don't block the UI
        const userId = getCurrentUserId();
        if (userId) {
          db.deleteSavedGroceryList(userId, listId).then((success) => {
            if (success) {
              console.log('[STORE] Confirmed delete from database:', listId);
            } else {
              console.warn('[STORE] Failed to delete from database:', listId);
              // Optionally: re-add the list to state if database delete fails
              // For now, we keep it deleted locally to match user expectations
            }
          }).catch((error) => {
            console.error('[STORE] Error deleting from database:', error);
          });
        }
      },

      loadSavedGroceryList: (listId) => {
        const state = get();
        const savedList = state.savedGroceryLists.find(list => list.id === listId);

        if (!savedList) {
          console.warn('[STORE] Saved grocery list not found:', listId);
          return;
        }

        // Load into separate currentSavedList state (NOT into groceryItems/customGroceryItems)
        // Preserve the isChecked state from the saved list
        set({
          currentSavedListId: listId,
          currentSavedListName: savedList.name,
          currentSavedListItems: savedList.items.map(item => ({
            ...item,
            id: generateGroceryItemId(), // Generate new IDs for editing
            // Keep the isChecked state from the saved list
            isChecked: item.isChecked || false,
            recipeIds: [],
          })),
        });

        console.log('[STORE] Loaded saved grocery list:', savedList.name, `(${savedList.items.length} items)`);
      },

      unloadSavedGroceryList: () => {
        set({
          currentSavedListId: null,
          currentSavedListName: null,
          currentSavedListItems: [],
        });
        console.log('[STORE] Unloaded saved grocery list');
      },

      toggleCurrentSavedListItem: (itemId) => {
        set((state) => ({
          currentSavedListItems: state.currentSavedListItems.map((item) =>
            item.id === itemId ? { ...item, isChecked: !item.isChecked } : item
          ),
        }));

        // Auto-sync to database
        const state = get();
        if (state.currentSavedListId && state.currentSavedListName) {
          const updatedList = {
            id: state.currentSavedListId,
            name: state.currentSavedListName,
            items: state.currentSavedListItems.map((item) =>
              item.id === itemId ? { ...item, isChecked: !item.isChecked } : item
            ),
            createdAt: state.savedGroceryLists.find(l => l.id === state.currentSavedListId)?.createdAt || new Date().toISOString(),
          };

          // Update local savedGroceryLists as well
          set((s) => ({
            savedGroceryLists: s.savedGroceryLists.map(list =>
              list.id === state.currentSavedListId ? updatedList : list
            ),
          }));

          const userId = getCurrentUserId();
          if (userId) {
            db.saveSavedGroceryList(userId, updatedList);
          }
        }
      },

      addCurrentSavedListItem: (item) => {
        const newItem = {
          ...item,
          id: generateGroceryItemId(),
        };

        set((state) => ({
          currentSavedListItems: [...state.currentSavedListItems, newItem],
        }));

        // Auto-sync to database
        const state = get();
        if (state.currentSavedListId && state.currentSavedListName) {
          const updatedList = {
            id: state.currentSavedListId,
            name: state.currentSavedListName,
            items: state.currentSavedListItems,
            createdAt: state.savedGroceryLists.find(l => l.id === state.currentSavedListId)?.createdAt || new Date().toISOString(),
          };

          // Update local savedGroceryLists as well
          set((s) => ({
            savedGroceryLists: s.savedGroceryLists.map(list =>
              list.id === state.currentSavedListId ? updatedList : list
            ),
          }));

          const userId = getCurrentUserId();
          if (userId) {
            db.saveSavedGroceryList(userId, updatedList);
            console.log('[STORE] Auto-saved new item to saved list:', newItem.name);
          }
        }
      },

      mergeIntoCurrentSavedListItem: (itemId, addedQuantity, addedUnit) => {
        try {
          set((state) => {
            const idx = state.currentSavedListItems.findIndex((g) => g.id === itemId);
            if (idx < 0) return {};
            const existing = state.currentSavedListItems[idx];
            const incoming = convertToBaseUnit(addedQuantity, addedUnit, existing.name);
            const existingBaseQty = existing.quantity_base || parseFloat(existing.quantity) || 0;
            const existingUnit = existing.base_unit || incoming.unit;
            const combined = combineBaseAmounts(
              existingBaseQty, existingUnit, incoming.quantity, incoming.unit, existing.name,
            );
            const updated = {
              ...existing,
              quantity_base: combined.quantity,
              base_unit: combined.unit,
              quantity: formatFromBaseUnit(combined.quantity, combined.unit, existing.name),
              unit: '',
            };
            return {
              currentSavedListItems: state.currentSavedListItems.map((item, i) => (i === idx ? updated : item)),
            };
          });

          const state = get();
          if (state.currentSavedListId && state.currentSavedListName) {
            const updatedList = {
              id: state.currentSavedListId,
              name: state.currentSavedListName,
              items: state.currentSavedListItems,
              createdAt: state.savedGroceryLists.find(l => l.id === state.currentSavedListId)?.createdAt || new Date().toISOString(),
            };
            set((s) => ({
              savedGroceryLists: s.savedGroceryLists.map(list =>
                list.id === state.currentSavedListId ? updatedList : list
              ),
            }));
            const userId = getCurrentUserId();
            if (userId) {
              db.saveSavedGroceryList(userId, updatedList);
              console.log('[STORE] Auto-saved merged item to saved list');
            }
          }
        } catch (error) {
          console.warn(`Failed to merge saved list item ${itemId}:`, error);
        }
      },

      removeCurrentSavedListItem: (itemId) => {
        set((state) => ({
          currentSavedListItems: state.currentSavedListItems.filter(item => item.id !== itemId),
        }));

        // Auto-sync to database
        const state = get();
        if (state.currentSavedListId && state.currentSavedListName) {
          const updatedList = {
            id: state.currentSavedListId,
            name: state.currentSavedListName,
            items: state.currentSavedListItems,
            createdAt: state.savedGroceryLists.find(l => l.id === state.currentSavedListId)?.createdAt || new Date().toISOString(),
          };

          // Update local savedGroceryLists as well
          set((s) => ({
            savedGroceryLists: s.savedGroceryLists.map(list =>
              list.id === state.currentSavedListId ? updatedList : list
            ),
          }));

          const userId = getCurrentUserId();
          if (userId) {
            db.saveSavedGroceryList(userId, updatedList);
            console.log('[STORE] Auto-saved after removing item from saved list');
          }
        }
      },

      updateCurrentSavedListItem: (itemId, updates) => {
        set((state) => ({
          currentSavedListItems: state.currentSavedListItems.map((item) =>
            item.id === itemId ? { ...item, ...updates } : item
          ),
        }));

        // Auto-sync to database
        const state = get();
        if (state.currentSavedListId && state.currentSavedListName) {
          const updatedList = {
            id: state.currentSavedListId,
            name: state.currentSavedListName,
            items: state.currentSavedListItems,
            createdAt: state.savedGroceryLists.find(l => l.id === state.currentSavedListId)?.createdAt || new Date().toISOString(),
          };

          // Update local savedGroceryLists as well
          set((s) => ({
            savedGroceryLists: s.savedGroceryLists.map(list =>
              list.id === state.currentSavedListId ? updatedList : list
            ),
          }));

          const userId = getCurrentUserId();
          if (userId) {
            db.saveSavedGroceryList(userId, updatedList);
            console.log('[STORE] Auto-saved after updating item in saved list');
          }
        }
      },

      // View State
      setSelectedDate: (date) => set({ selectedDate: date }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setGroceryDateRange: (startDate, endDate) =>
        set({ groceryStartDate: startDate, groceryEndDate: endDate }),

      // Load user data from database
      loadUserData: async (userId: string) => {
        set({ isSyncing: true, lastSyncError: null });

        try {
          console.log('[STORE] Fetching user data from database...');
          const data = await db.fetchAllUserData(userId);
          const savedGroceryLists = await db.fetchUserSavedGroceryLists(userId);
          const [remoteCookingLogs, remoteRecipeRatings, remotePlanningEvents] = await Promise.all([
            db.fetchCookingLogs(userId).catch(() => []),
            db.fetchRecipeRatings(userId).catch(() => []),
            db.fetchPlanningEvents(userId).catch(() => [] as PlanningEvent[]),
          ]);

          console.log('[STORE] Data fetched:', {
            hasPreferences: !!data.preferences,
            recipesCount: data.recipes?.length || 0,
            mealSlotsCount: data.mealSlots?.length || 0,
            groceryItemsCount: data.groceryItems?.length || 0,
            savedListsCount: savedGroceryLists?.length || 0,
          });

          // RE-VALIDATE all recipe ingredients when loading from database
          // This ensures any recipes with old invalid units (e.g., chicken in mL) are corrected
          const validatedRecipes = (data.recipes || []).map((recipe) => ({
            ...recipe,
            ingredients: (recipe.ingredients || []).map((ing) => {
              // Safety check: skip validation if ingredient data is malformed
              if (!ing || typeof ing !== 'object' || !ing.name) {
                console.warn('[STORE] Skipping malformed ingredient:', ing);
                return ing;
              }
              try {
                const validated = validateIngredient(ing);
                // Only log if unit changed
                if (ing.unit !== validated.unit && ing.name.toLowerCase().includes('chicken')) {
                  console.log(`[DB LOAD] Correcting ${ing.name}: "${ing.quantity} ${ing.unit}" → "${validated.quantity} ${validated.unit}"`);
                }
                return {
                  ...ing,
                  quantity: validated.quantity,
                  unit: validated.unit,
                };
              } catch (validationError) {
                console.warn(`[DB LOAD] Failed to validate ingredient ${ing.name}:`, validationError);
                return ing;
              }
            }),
          }));

          // Merge remote nudge data with whatever was persisted locally
          // (local wins on conflict by id — local writes are always more recent
          // than the last sync round-trip).
          const localState = get();
          const mergedLogs = (() => {
            const byId = new Map(remoteCookingLogs.map((l) => [l.id, l]));
            for (const l of (localState.cookingLogs || [])) byId.set(l.id, l);
            return Array.from(byId.values());
          })();
          const mergedRatings = (() => {
            const byRecipe = new Map(
              remoteRecipeRatings.map((r) => [r.recipeId, r]),
            );
            for (const r of (localState.recipeRatings || [])) byRecipe.set(r.recipeId, r);
            return Array.from(byRecipe.values());
          })();
          // Planning events: same id-keyed merge as cookingLogs. Trim to
          // the most recent 100 (sorted by createdAt asc) to match the
          // logPlanningEvent cap.
          const mergedPlanningEvents = (() => {
            const byId = new Map(remotePlanningEvents.map((e) => [e.id, e]));
            for (const e of (localState.planningEvents || [])) byId.set(e.id, e);
            const all = Array.from(byId.values()).sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );
            return all.length > 100 ? all.slice(all.length - 100) : all;
          })();

          // Fold locally-persisted free-credit counters back into the DB
          // payload. Both `freePlanBuildsUsed` and `freeGroceryBuildsUsed`
          // are local-only — `mapDbPreferences` doesn't read them and
          // `upsertUserPreferences` doesn't write them. Without this fold,
          // every cold start replaces the rehydrated counters with `undefined`
          // and zeroes the anonymous-guest signup gate (the user gets fresh
          // free credits after each app relaunch).
          const localPrefs = localState.preferences;
          const mergedPreferences = data.preferences
            ? {
                ...data.preferences,
                freePlanBuildsUsed:
                  data.preferences.freePlanBuildsUsed ?? localPrefs.freePlanBuildsUsed ?? 0,
                freeGroceryBuildsUsed:
                  data.preferences.freeGroceryBuildsUsed ?? localPrefs.freeGroceryBuildsUsed ?? 0,
                // Monthly paywall-limit usage is local-only (not stored in the
                // DB), so fold the rehydrated value back in or a cold start
                // would zero the month's counts and hand out fresh allowances.
                monthlyFeatureUsage:
                  data.preferences.monthlyFeatureUsage ?? localPrefs.monthlyFeatureUsage,
                // Completed-plan counter (drives the review prompt) — keep the
                // higher of remote/local so a sync can't rewind it.
                plansCompletedCount: Math.max(
                  data.preferences.plansCompletedCount ?? 0,
                  localPrefs.plansCompletedCount ?? 0,
                ),
              }
            : defaultPreferences;

          set({
            preferences: mergedPreferences,
            recipes: validatedRecipes,
            mealSlots: data.mealSlots || [],
            groceryItems: data.groceryItems || [],
            customGroceryItems: [],
            // Limit to 4 saved lists, sorted by most recent first
            savedGroceryLists: (savedGroceryLists || [])
              .map((list: any) => ({
                id: list.id,
                name: list.name,
                items: list.items || [],
                createdAt: list.created_at,
              }))
              .sort((a: SavedGroceryList, b: SavedGroceryList) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              )
              .slice(0, 4),
            cookingLogs: mergedLogs,
            recipeRatings: mergedRatings,
            planningEvents: mergedPlanningEvents,
            isSyncing: false,
          });

          console.log('User data loaded:', {
            recipes: validatedRecipes.length,
            mealSlots: data.mealSlots?.length || 0,
            groceryItems: data.groceryItems.length,
          });
        } catch (error) {
          console.error('Error loading user data:', error);
          set({
            isSyncing: false,
            lastSyncError: 'Failed to load data from server'
          });
        }
      },

      // Clear all data (for logout)
      clearAllData: () => {
        set({
          userProfile: null,
          preferences: defaultPreferences,
          recipes: [],
          mealSlots: [],
          groceryItems: [],
          customGroceryItems: [],
          savedGroceryLists: [],
          currentSavedListId: null,
          currentSavedListName: null,
          currentSavedListItems: [],
          selectedDate: formatLocalDate(new Date()),
          viewMode: 'weekly',
          cookingLogs: [],
          recipeRatings: [],
          mealPlanRatings: [],
          nudgeDismissals: {},
          lastWeeklyPromptAt: null,
          planningEvents: [],
          pendingGeneration: null,
        });
      },
    }),
    {
      name: 'meal-plan-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        // Only persist user preferences and profile - NOT recipes/meals
        // Recipes and mealSlots are loaded from Supabase on app startup
        userProfile: state.userProfile,
        preferences: state.preferences,
        // Nudge engine data — offline-first, also synced to Supabase
        cookingLogs: state.cookingLogs,
        recipeRatings: state.recipeRatings,
        mealPlanRatings: state.mealPlanRatings,
        nudgeDismissals: state.nudgeDismissals,
        dismissedDuplicateRecipeGroups: state.dismissedDuplicateRecipeGroups,
        lastWeeklyPromptAt: state.lastWeeklyPromptAt,
        // Behavior Intelligence — offline-first, also synced to Supabase
        planningEvents: state.planningEvents,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
