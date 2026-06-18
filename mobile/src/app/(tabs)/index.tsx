// HomeScreen - PlannPlate Home design
// Main meal plan tab — restores full feature set from the previous screen in the new UI.
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronRight, AlertTriangle, Trash2 } from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInRight,
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useMealPlanStore, isStockPlaceholderImage, type MealSlot, type Recipe } from '@/lib/store';
import { VIBES } from '@/lib/vibe-inference';
import { useActiveNudge } from '@/hooks/useActiveNudge';
import { useAuthStore } from '@/lib/auth-store';
import {
  useUserAvatar,
  useUserName,
  useIsAccountPaused,
  useHasPremiumAccess,
  useIsPremiumResolved,
  useSubscriptionStore,
} from '@/lib/subscription-store';
import { useColorScheme } from '@/lib/useColorScheme';
import { designTokens, getThemeColors } from '@/lib/design-tokens';
import {
  checkRecipeForAllergens,
  type RecipeAllergenInfo,
} from '@/lib/allergy-checker';
import {
  isDateSelectable,
  getMinimumAllowedDate,
} from '@/lib/date-restrictions';
import { HomeHeader } from '@/components/HomeHeader';
import { WeekStrip } from '@/components/WeekStrip';
import { MealCard, type MealCardState } from '@/components/MealCard';
import { NudgeCard } from '@/components/NudgeCard';
import { QuickActions } from '@/components/QuickActions';
import { PnPFavorites, type FavoriteRecipe } from '@/components/PnPFavorites';
import { MealSlotSheet } from '@/components/MealSlotSheet';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ServingAdjustmentModal } from '@/components/ServingAdjustmentModal';
import { PausedFeatureBanner } from '@/components/PausedFeatureBanner';
import { MonthYearPicker } from '@/components/MonthYearPicker';
import { PendingGenerationBanner } from '@/components/PendingGenerationBanner';
import { UnlockReminderPill } from '@/components/UnlockReminderPill';
import { CookConfirmSheet } from '@/components/CookConfirmSheet';
import { WeeklyRatingSheet } from '@/components/WeeklyRatingSheet';
import { UserAvatarDisplay } from '@/components/ProfileSetupModal';

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', time: '7:30 AM' },
  { key: 'lunch', label: 'Lunch', time: '1:00 PM' },
  { key: 'dinner', label: 'Dinner', time: '7:00 PM' },
  { key: 'snack', label: 'Snack', time: '4:00 PM' },
] as const;

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const DAYS_BEFORE_TODAY = 7;
const DAYS_AFTER_TODAY = 38;

// Cold-start fallback for the PnP Picks tile thumbnail stack. Three
// hand-picked vibe assets that already ship in the app bundle —
// brand-consistent food photography, no network call, available
// before the user has generated their first recipe. Chosen for
// visual variety (warm braise + bright bowl + plated dish) so the
// preview stack never looks monotone. The home tab tops up the
// user's real recent recipes from this list when they have fewer
// than 3 of their own.
const COLD_START_THUMBS: Array<string | number> = [
  VIBES.find((v) => v.id === 'comfort')?.localImage,
  VIBES.find((v) => v.id === 'glow')?.localImage,
  VIBES.find((v) => v.id === 'showoff')?.localImage,
].filter((x): x is string | number => x != null);

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/** Local YYYY-MM-DD key — matches how slot.date is stored (see select-recipe.tsx). */
function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parse YYYY-MM-DD as a local-time Date (avoid UTC-midnight shift). */
function parseLocalDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return startOfDay(new Date());
  return new Date(y, m - 1, d);
}

function getStripDates(centerDate: Date): Date[] {
  const center = startOfDay(centerDate);
  const start = new Date(center);
  start.setDate(start.getDate() - DAYS_BEFORE_TODAY);
  const total = DAYS_BEFORE_TODAY + 1 + DAYS_AFTER_TODAY;
  const dates: Date[] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function formatMinutes(min: number): string {
  if (!min || min <= 0) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

type DisplayMeal = {
  slot: string;
  mealTypeKey: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  state: MealCardState;
  title?: string;
  image?: string;
  meta?: {
    time?: string;
    duration?: string;
    calories?: string;
    servings?: string;
  };
  tag?: { label: string; tone?: 'olive' };
  recipeId?: string;
  slotId?: string;
  recipeCount: number;
  hasAllergens: boolean;
  firstRecipe?: Recipe;
  firstAllergenInfo?: RecipeAllergenInfo;
};

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = getThemeColors(isDark);

  // ---- URL params (from select-recipe, generate-recipe, etc.) ---------
  const params = useLocalSearchParams<{
    scrollToDate?: string;
    mealPlanDate?: string;
    _ts?: string;
  }>();
  const incomingDateParam = params.scrollToDate || params.mealPlanDate;
  const incomingTs = params._ts;

  // ---- Store subscriptions --------------------------------------------
  const currentUser = useAuthStore((s) => s.currentUser);
  const avatarUrl = useUserAvatar();
  // Onboarding writes the user's real name into userSubscription.name via
  // updateProfile(). For anonymous guests, currentUser.name falls back to
  // the literal string 'User' (no email, no metadata.name), so prefer the
  // subscription-store name when it's a real value.
  const subscriptionName = useUserName();
  const fallbackAuthName =
    currentUser?.name && currentUser.name !== 'User' ? currentUser.name : null;
  const displayName = subscriptionName || fallbackAuthName;
  const isPaused = useIsAccountPaused();
  const mealSlots = useMealPlanStore((s) => s.mealSlots);
  const recipes = useMealPlanStore((s) => s.recipes);
  const preferences = useMealPlanStore((s) => s.preferences);
  const selectedDateKey = useMealPlanStore((s) => s.selectedDate);
  const setSelectedDateInStore = useMealPlanStore((s) => s.setSelectedDate);
  const removeMealFromSlot = useMealPlanStore((s) => s.removeMealFromSlot);
  const updateMealSlot = useMealPlanStore((s) => s.updateMealSlot);
  
  // ---- Nudge engine ----------------------------------------------------
  const activeNudge = useActiveNudge();
  const cookingLogs = useMealPlanStore((s) => s.cookingLogs) || [];
  const recipeRatings = useMealPlanStore((s) => s.recipeRatings) || [];
  const dismissNudge = useMealPlanStore((s) => s.dismissNudge);
  const logCooking = useMealPlanStore((s) => s.logCooking);
  const logCookingBulk = useMealPlanStore((s) => s.logCookingBulk);
  const deleteCookingLog = useMealPlanStore((s) => s.deleteCookingLog);
  const rateRecipe = useMealPlanStore((s) => s.rateRecipe);
  const setLastWeeklyPromptAt = useMealPlanStore((s) => s.setLastWeeklyPromptAt);

  // ---- Local UI state --------------------------------------------------
  const [nudgeSheet, setNudgeSheet] = useState<'confirm' | 'rating' | null>(null);
  const [sheet, setSheet] = useState<{
    visible: boolean;
    mealTypeKey: typeof MEAL_TYPES[number]['key'] | null;
  }>({ visible: false, mealTypeKey: null });
  const [servingModal, setServingModal] = useState<{
    visible: boolean;
    slotId: string | null;
    recipe: Recipe | null;
    servingOverride: number | undefined;
  }>({ visible: false, slotId: null, recipe: null, servingOverride: undefined });
  const [allergenModal, setAllergenModal] = useState<{
    visible: boolean;
    info: RecipeAllergenInfo | null;
    recipeName: string;
  }>({ visible: false, info: null, recipeName: '' });
  const [confirmDelete, setConfirmDelete] = useState<{
    visible: boolean;
    mealTypeKey: typeof MEAL_TYPES[number]['key'] | null;
    mealTypeLabel: string;
    slotIds: string[];
  }>({ visible: false, mealTypeKey: null, mealTypeLabel: '', slotIds: [] });

  // ---- Refs ------------------------------------------------------------
  const mainScrollRef = useRef<ScrollView>(null);
  const quickActionsYRef = useRef<number>(0);

  // Sticky compact header: fades in once the greeting block scrolls past the top.
  const scrollY = useSharedValue(0);
  const stickyScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });
  const stickyHeaderStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [60, 110], [0, 1], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [60, 110], [-6, 0], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  // ---- Derived: selected date as Date ---------------------------------
  const selectedDate = useMemo(() => parseLocalDateKey(selectedDateKey), [selectedDateKey]);

  // ---- Date restrictions ----------------------------------------------
  const minAllowedDate = useMemo(
    () =>
      currentUser?.createdAt
        ? getMinimumAllowedDate(currentUser.createdAt)
        : undefined,
    [currentUser?.createdAt],
  );
  const canSelect = useCallback(
    (date: Date) => {
      if (!currentUser?.createdAt) return true;
      return isDateSelectable(date, currentUser.createdAt);
    },
    [currentUser?.createdAt],
  );

  // ---- Strip dates (45 days centered around selection) ----------------
  const stripDates = useMemo(() => getStripDates(selectedDate), [selectedDate]);

  // ---- Quick recipe lookup --------------------------------------------
  const recipeById = useMemo(() => {
    const map = new Map<string, Recipe>();
    for (const r of recipes) map.set(r.id, r);
    return map;
  }, [recipes]);

  // ---- The Favorites — recipes loved / rated highly in the last 7 days ----
  // Sources: explicit recipe ratings (≥4★) + Vibe-Cooking end ratings (≥4),
  // both timestamped so we can window to the past week. One entry per recipe
  // (the most recent, highest signal), newest first. Empty on a fresh account.
  const favoriteRecipes = useMemo<FavoriteRecipe[]>(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    const byId = new Map<string, FavoriteRecipe>();

    const consider = (recipeId: string | null, stars: number, atISO?: string) => {
      if (!recipeId || stars < 4 || !atISO) return;
      const at = new Date(atISO).getTime();
      if (Number.isNaN(at) || at < weekAgo) return;
      const recipe = recipeById.get(recipeId);
      if (!recipe) return;
      const existing = byId.get(recipeId);
      if (!existing || at > existing.at) {
        byId.set(recipeId, { recipe, stars: Math.max(stars, existing?.stars ?? 0), at });
      } else if (stars > existing.stars) {
        byId.set(recipeId, { ...existing, stars });
      }
    };

    recipeRatings.forEach((r) => consider(r.recipeId, r.stars, r.ratedAt));
    cookingLogs.forEach((l) => consider(l.recipeId, l.vibeRating ?? 0, l.cookedAt));

    return Array.from(byId.values())
      .sort((a, b) => b.at - a.at)
      .slice(0, 6);
  }, [recipeRatings, cookingLogs, recipeById]);

  // ---- PnP Picks tile thumbnail stack ---------------------------------
  // Up to 3 most-recent recipe images with REAL hero photos (skipping
  // the seed stock placeholders that get assigned during streaming
  // generation before the AI image lands). Topped up with VIBES
  // cold-start assets when the user has fewer than 3 of their own,
  // so the tile never looks empty for new accounts.
  const recentThumbnails = useMemo<Array<string | number>>(() => {
    const real = recipes
      .filter((r) => r.imageUrl && !isStockPlaceholderImage(r.imageUrl))
      .slice()
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, 3)
      .map((r) => r.imageUrl as string);
    if (real.length >= 3) return real;
    return [...real, ...COLD_START_THUMBS].slice(0, 3);
  }, [recipes]);

  // ---- Allergen map (per recipe in the selected day) ------------------
  const dayRecipeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of mealSlots) {
      if (s.date === selectedDateKey && s.recipeId) ids.add(s.recipeId);
    }
    return ids;
  }, [mealSlots, selectedDateKey]);

  const recipeAllergenMap = useMemo(() => {
    const map: Record<string, RecipeAllergenInfo> = {};
    for (const id of dayRecipeIds) {
      const r = recipeById.get(id);
      if (r) map[id] = checkRecipeForAllergens(r, preferences.allergies);
    }
    return map;
  }, [dayRecipeIds, recipeById, preferences.allergies]);

  // ---- Snap to incoming date param ------------------------------------
  useFocusEffect(
    useCallback(() => {
      if (!incomingDateParam) return;
      setSelectedDateInStore(incomingDateParam);
    }, [incomingDateParam, incomingTs, setSelectedDateInStore]),
  );

  // ---- Build week strip data ------------------------------------------
  const weekDays = useMemo(() => {
    let lastMonth = -1;
    return stripDates.map((date) => {
      const dayKey = formatLocalDateKey(date);
      const daySlots = mealSlots.filter((s) => s.recipeId && s.date === dayKey);
      const isSelected = sameDay(date, selectedDate);
      const monthIdx = date.getMonth();
      const showMonth = monthIdx !== lastMonth;
      lastMonth = monthIdx;

      let status: 'cooked' | 'planned' | 'skipped' | 'empty' | 'today' = 'empty';
      let partial: 'skipped' | undefined = undefined;

      if (isSelected) {
        status = 'today';
      } else if (daySlots.length === 0) {
        status = 'empty';
      } else {
        const logsForDay = daySlots.map((s) => {
          const slotLogs = cookingLogs.filter((l) => l.slotId === s.id);
          if (slotLogs.length === 0) return null;
          return [...slotLogs].sort((a, b) => b.cookedAt.localeCompare(a.cookedAt))[0];
        });

        const allLogged = logsForDay.every((l) => l !== null);
        const anyCooked = logsForDay.some((l) => l?.status === 'cooked');
        const anySkipped = logsForDay.some((l) => l?.status === 'skipped' || l?.status === 'swapped');

        if (allLogged) {
          if (anyCooked && anySkipped) {
            status = 'cooked';
            partial = 'skipped';
          } else if (anyCooked) {
            status = 'cooked';
          } else {
            status = 'skipped';
          }
        } else {
          if (anyCooked) {
            status = 'cooked';
            partial = 'skipped';
          } else {
            status = 'planned';
          }
        }
      }

      return {
        day: DAY_LETTERS[date.getDay()],
        date: date.getDate(),
        status,
        partial,
        isToday: isSelected,
        monthLabel: showMonth ? MONTH_LABELS[monthIdx] : undefined,
        disabled: !canSelect(date),
      };
    });
  }, [stripDates, mealSlots, cookingLogs, selectedDate, canSelect]);

  const selectedIndex = useMemo(
    () => stripDates.findIndex((d) => sameDay(d, selectedDate)),
    [stripDates, selectedDate],
  );

  // ---- Per-meal-type groupings (supports multiple recipes per slot) ---
  const mealTypeData = useMemo(() => {
    const data: Record<string, { slots: MealSlot[]; recipes: Recipe[] }> = {};
    for (const mt of MEAL_TYPES) {
      // Include recipe-less placeholder slots (e.g. "Grab & go") so they still
      // surface on the calendar — they carry a customMealName instead of a recipe.
      const slots = mealSlots.filter(
        (s) =>
          s.date === selectedDateKey &&
          s.mealType === mt.key &&
          (s.recipeId || s.customMealName),
      );
      const r = slots
        .map((s) => (s.recipeId ? recipeById.get(s.recipeId) : undefined))
        .filter((x): x is Recipe => !!x);
      data[mt.key] = { slots, recipes: r };
    }
    return data;
  }, [mealSlots, selectedDateKey, recipeById]);

  // ---- Build DisplayMeal[] for the four cards -------------------------
  const selectedDayMeals = useMemo<DisplayMeal[]>(() => {
    return MEAL_TYPES.map((mt): DisplayMeal => {
      const { slots, recipes: rs } = mealTypeData[mt.key];
      const placeholderSlot = slots.find((s) => !s.recipeId && s.customMealName);

      // Recipe-less placeholder (e.g. "Grab & go") — show the label, no recipe.
      if (rs.length === 0 && placeholderSlot) {
        const isCookedP = cookingLogs.some(
          (l) => l.slotId === placeholderSlot.id && l.status === 'cooked',
        );
        return {
          slot: mt.label,
          mealTypeKey: mt.key,
          state: isCookedP ? 'cooked' : mt.key === 'snack' ? 'planned-mini' : 'planned',
          title: placeholderSlot.customMealName,
          meta: { time: mt.time },
          tag: isCookedP ? { label: 'Done' } : undefined,
          slotId: placeholderSlot.id,
          recipeCount: slots.length,
          hasAllergens: false,
        };
      }

      if (slots.length === 0 || rs.length === 0) {
        return {
          slot: mt.label,
          mealTypeKey: mt.key,
          state: 'empty',
          meta: { time: mt.time },
          recipeCount: 0,
          hasAllergens: false,
        };
      }
      const firstSlot = slots[0];
      const firstRecipe = rs[0];
      const totalMin = (firstRecipe.prepTime ?? 0) + (firstRecipe.cookTime ?? 0);
      const servings = firstSlot.servingOverride ?? firstRecipe.servings ?? 1;
      const calories = firstRecipe.calories;
      const info = recipeAllergenMap[firstRecipe.id];
      const isCooked = cookingLogs.some((l) => l.slotId === firstSlot.id && l.status === 'cooked');

      return {
        slot: mt.label,
        mealTypeKey: mt.key,
        state: isCooked ? 'cooked' : (mt.key === 'snack' ? 'planned-mini' : 'planned'),
        title: firstRecipe.name,
        image: firstRecipe.imageUrl,
        meta: {
          time: mt.time,
          duration: formatMinutes(totalMin) || undefined,
          calories: calories ? `${calories} cal` : undefined,
          servings: `${servings} ${servings === 1 ? 'serving' : 'servings'}`,
        },
        tag: isCooked ? { label: 'Cooked' } : undefined,
        recipeId: firstRecipe.id,
        slotId: firstSlot.id,
        recipeCount: slots.length,
        hasAllergens: !!info?.hasAllergens,
        firstRecipe,
        firstAllergenInfo: info,
      };
    });
  }, [mealTypeData, recipeAllergenMap, cookingLogs]);

  // ---- Weekly stats (Mon–Sun of the selected week) --------------------
  const weeklyStats = useMemo(() => {
    const weekStart = new Date(selectedDate);
    const dow = weekStart.getDay();
    const daysToMonday = dow === 0 ? 6 : dow - 1;
    weekStart.setDate(weekStart.getDate() - daysToMonday);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const startKey = formatLocalDateKey(weekStart);
    const endKey = formatLocalDateKey(weekEnd);
    const count = mealSlots.filter(
      (s) =>
        s.recipeId &&
        s.mealType !== 'snack' &&
        s.date >= startKey &&
        s.date < endKey,
    ).length;
    return count;
  }, [selectedDate, mealSlots]);

  // ---- Handlers --------------------------------------------------------
  const handleDayPress = useCallback(
    (_day: unknown, index: number) => {
      const date = stripDates[index];
      if (!canSelect(date)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      Haptics.selectionAsync();
      setSelectedDateInStore(formatLocalDateKey(date));
    },
    [stripDates, canSelect, setSelectedDateInStore],
  );

  const handleMonthYearChange = useCallback(
    (date: Date) => {
      if (!canSelect(date)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedDateInStore(formatLocalDateKey(date));
    },
    [canSelect, setSelectedDateInStore],
  );

  const handleMealPress = useCallback(
    (meal: DisplayMeal) => {
      if (isPaused) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (meal.state === 'empty') {
        // Empty slot → jump to recipe picker so user can add one
        router.push({
          pathname: '/select-recipe',
          params: { date: selectedDateKey, mealType: meal.mealTypeKey },
        } as any);
      } else {
        // Any planned slot (1 recipe or N) → open the management sheet for consistency.
        // From the sheet the user can tap a row to drill into recipe-detail.
        setSheet({ visible: true, mealTypeKey: meal.mealTypeKey });
      }
    },
    [router, selectedDateKey, isPaused],
  );

  const handleMealSwap = useCallback(
    (meal: DisplayMeal) => {
      if (isPaused) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (meal.state === 'empty' || !meal.slotId) {
        router.push({
          pathname: '/select-recipe',
          params: { date: selectedDateKey, mealType: meal.mealTypeKey },
        } as any);
        return;
      }
      router.push({
        pathname: '/select-recipe',
        params: {
          date: selectedDateKey,
          mealType: meal.mealTypeKey,
          swap: 'true',
          slotId: meal.slotId,
        },
      } as any);
    },
    [router, selectedDateKey, isPaused],
  );

  const handleMealView = useCallback(
    (meal: DisplayMeal) => {
      if (meal.recipeId) router.push(`/recipe-detail?id=${meal.recipeId}` as any);
    },
    [router],
  );

  const handleAllergenPress = useCallback((recipe: Recipe, info: RecipeAllergenInfo) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    // Close the sheet first if it's open (RN can't stack two Modals reliably).
    setSheet({ visible: false, mealTypeKey: null });
    setTimeout(() => {
      setAllergenModal({ visible: true, info, recipeName: recipe.name });
    }, 250);
  }, []);

  const handleMealLongPress = useCallback(
    (meal: DisplayMeal) => {
      if (meal.recipeCount === 0 || isPaused) return;
      const data = mealTypeData[meal.mealTypeKey];
      setConfirmDelete({
        visible: true,
        mealTypeKey: meal.mealTypeKey,
        mealTypeLabel: meal.slot.toLowerCase(),
        slotIds: data.slots.map((s) => s.id),
      });
    },
    [mealTypeData, isPaused],
  );

  const handleConfirmDelete = useCallback(() => {
    confirmDelete.slotIds.forEach((id) => removeMealFromSlot(id));
    setConfirmDelete({ visible: false, mealTypeKey: null, mealTypeLabel: '', slotIds: [] });
  }, [confirmDelete.slotIds, removeMealFromSlot]);

  const handleOpenServingModal = useCallback((slot: MealSlot, recipe: Recipe) => {
    // RN can't stack two Modals — close the slot sheet first, then open the serving modal
    // on the next frame so iOS/Android actually animate it in.
    setSheet({ visible: false, mealTypeKey: null });
    setTimeout(() => {
      setServingModal({
        visible: true,
        slotId: slot.id,
        recipe,
        servingOverride: slot.servingOverride,
      });
    }, 250); // match the sheet's slide-out animation duration
  }, []);

  const handleSaveServingSize = useCallback(
    (servingSize: number) => {
      if (servingModal.slotId) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        updateMealSlot(servingModal.slotId, { servingOverride: servingSize });
      }
      setServingModal({ visible: false, slotId: null, recipe: null, servingOverride: undefined });
    },
    [servingModal.slotId, updateMealSlot],
  );

  const handleSheetAdd = useCallback(() => {
    if (!sheet.mealTypeKey) return;
    setSheet({ visible: false, mealTypeKey: null });
    // `lockDate=true` tells select-recipe to hide the multi-date picker — the user
    // came from a specific slot in a specific day and wants to add to THAT day only.
    router.push({
      pathname: '/select-recipe',
      params: {
        date: selectedDateKey,
        mealType: sheet.mealTypeKey,
        lockDate: 'true',
      },
    } as any);
  }, [router, selectedDateKey, sheet.mealTypeKey]);

  const handleSheetSwap = useCallback(
    (slot: MealSlot) => {
      setSheet({ visible: false, mealTypeKey: null });
      router.push({
        pathname: '/select-recipe',
        params: {
          date: selectedDateKey,
          mealType: slot.mealType,
          swap: 'true',
          slotId: slot.id,
        },
      } as any);
    },
    [router, selectedDateKey],
  );

  const handleSheetView = useCallback(
    (recipeId: string) => {
      setSheet({ visible: false, mealTypeKey: null });
      router.push(`/recipe-detail?id=${recipeId}` as any);
    },
    [router],
  );

  const handleSheetRemove = useCallback(
    (slotId: string) => {
      removeMealFromSlot(slotId);
    },
    [removeMealFromSlot],
  );

  // Re-entry guard: when a PnP Suggests plan is already streaming in
  // (banner visible above), tapping PnP Suggests should no-op rather
  // than open a second concurrent generation. The selector reads a
  // primitive so we don't re-render this screen unnecessarily.
  const isPlanInFlight = useMealPlanStore(
    (s) => s.pendingGeneration?.active === true,
  );
  // Canonical premium-access gate. Drives the crown badge on the avatar
  // and the home-tab PnP paywall trigger for signed-up non-subscribers.
  const hasPremiumAccess = useHasPremiumAccess();
  // `isPremium=false` is the default during the cold-start race before
  // `syncWithRevenueCat` resolves. Without this guard, a paying user
  // tapping PnP Suggests in that window would see the paywall.
  const isPremiumResolved = useIsPremiumResolved();
  const openPaywallSheet = useSubscriptionStore((s) => s.openPaywallSheet);

  // ─── AUTH-LAST signup gate ───
  // An anonymous guest gets ONE free plan build. After that, any subsequent
  // interaction (PnP Picks, grocery, explore, etc.) gates to signup.
  // All data created during the anonymous session is preserved because
  // signup uses updateUser() to link the same user ID to an email.
  const isAnonymous = useAuthStore((s) => s.isAnonymous);
  const currentUserId = useAuthStore((s) => s.currentUser?.id);
  const freePlanBuildsUsed = useMealPlanStore(
    (s) => s.preferences.freePlanBuildsUsed ?? 0,
  );
  const freeGroceryBuildsUsed = useMealPlanStore(
    (s) => s.preferences.freeGroceryBuildsUsed ?? 0,
  );
  const markFreeGatedAction = useMealPlanStore((s) => s.markFreeGatedAction);
  const shouldGateSignup =
    isAnonymous && freePlanBuildsUsed >= 1 && freeGroceryBuildsUsed >= 1;

  const handleQuickAction = useCallback(
    (item: { title: string }) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const t = item.title.toLowerCase();
      if (t.includes('grocery')) {
        if (shouldGateSignup) {
          router.push('/signup');
          return;
        }
        if (isAnonymous) markFreeGatedAction('grocery');
        router.push('/grocery');
      }
      // "Explore meals" → opens the curated catalog of PnP special plans.
      // No signup gate here: this is a browse-only catalog, always free.
      else if (t.includes('explore')) {
        router.push('/curated-meal-plan');
      }
      // "PnP Suggests" → opens the curated multi-day plan flow.
      // (Replaces the old "Generate recipe" slot — single-recipe generation
      // is still reachable from the Recipes tab and select-recipe footer.)
      else if (t.includes('suggests') || t.includes('pnp')) {
        if (isPlanInFlight) {
          // Plan already streaming — banner above already explains it.
          // No-op rather than queue a second concurrent generation.
          return;
        }
        // ─── Signup gate (anonymous guest, post-first-plan) ───
        if (shouldGateSignup) {
          router.push('/signup');
          return;
        }
        if (isAnonymous) markFreeGatedAction('plan');
        // ─── Premium gate ───
        // Signed-up, non-premium → hard paywall. Anonymous guests are
        // governed by the signup gate above + the free-tier counters, so
        // they pass through and reach plan-meals for their free build.
        if (!isAnonymous && !hasPremiumAccess) {
          if (!isPremiumResolved) {
            // Subscription status hasn't settled yet — kick a re-sync and
            // no-op this tap rather than gate a possibly-paying user.
            if (currentUserId) {
              void useSubscriptionStore.getState().syncWithRevenueCat(currentUserId);
            }
            return;
          }
          openPaywallSheet('pnp-second-tap');
          return;
        }
        router.push('/plan-meals');
      } else if (t.includes('vibe')) {
        if (shouldGateSignup) {
          router.push('/signup');
          return;
        }
        router.push('/generate-recipe');
      }
    },
    [router, isPlanInFlight, hasPremiumAccess, isPremiumResolved, currentUserId, openPaywallSheet, shouldGateSignup, isAnonymous, freeGroceryBuildsUsed, markFreeGatedAction],
  );

  const cookedRecipeIds = useMemo(
    () =>
      new Set(
        cookingLogs
          .filter((l) => l.status === 'cooked' && !!l.recipeId)
          .map((l) => l.recipeId as string),
      ),
    [cookingLogs],
  );

  const cookedSlotIds = useMemo(
    () =>
      new Set(
        cookingLogs
          .filter((l) => l.status === 'cooked')
          .map((l) => l.slotId),
      ),
    [cookingLogs],
  );

  const handleToggleCooked = useCallback(
    (slot: MealSlot) => {
      const isAlreadyCooked = cookedSlotIds.has(slot.id);
      deleteCookingLog(slot.id);
      if (!isAlreadyCooked) {
        logCooking({
          slotId: slot.id,
          recipeId: slot.recipeId,
          status: 'cooked',
          cookedAt: new Date().toISOString(),
        });
      }
    },
    [cookedSlotIds, deleteCookingLog, logCooking],
  );

  const handleNudgePrimary = useCallback(() => {
    if (!activeNudge) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (activeNudge.variant === 'confirm') {
      setNudgeSheet('confirm');
    } else if (activeNudge.variant === 'rating') {
      // NOTE: we DO NOT set lastWeeklyPromptAt here — doing so would mark the
      // nudge as dismissed, which causes the engine to recompute the active
      // nudge mid-render and wipe payload.weeklyRecipeIds before the sheet
      // appears. We set it instead on sheet close / submit.
      setNudgeSheet('rating');
    } else if (activeNudge.variant === 'grocery-firsttime') {
      // First-time onboarding handoff. The nudge auto-resolves once the user
      // actually generates a list (groceryItems > 0), so we don't need to
      // record any dismissal here — tapping primary just routes them in.
      router.push('/(tabs)/grocery');
    }
  }, [activeNudge, router]);

  const handleNudgeSecondary = useCallback(() => {
    if (!activeNudge) return;
    Haptics.selectionAsync();
    if (activeNudge.variant === 'rating') {
      setLastWeeklyPromptAt(new Date().toISOString());
    }
    dismissNudge(activeNudge.dismissKey);
  }, [activeNudge, dismissNudge, setLastWeeklyPromptAt]);

  const handleNudgeDismiss = useCallback(() => {
    if (!activeNudge) return;
    if (activeNudge.variant === 'rating') {
      setLastWeeklyPromptAt(new Date().toISOString());
    }
    dismissNudge(activeNudge.dismissKey);
  }, [activeNudge, dismissNudge, setLastWeeklyPromptAt]);

  // ---- Greeting / labels ----------------------------------------------
  const greetingWord = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  })();

  const getGreetingSubtitle = () => {
    const dayLabel = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });
    const plannedCount = selectedDayMeals.filter((m) => m.state !== 'empty').length;
    if (plannedCount === 0) return `${dayLabel} — ready to fill your plate?`;
    if (plannedCount === 1) return `${dayLabel} — one meal planned, nice start!`;
    if (plannedCount === 2) return `${dayLabel} — two meals planned, looking good!`;
    return `${dayLabel} — ${plannedCount} meals planned, you're all set!`;
  };

  const isTodaySelected = sameDay(selectedDate, new Date());
  const headingLabel = isTodaySelected
    ? 'Today'
    : selectedDate.toLocaleDateString('en-US', { weekday: 'long' });
  const headingSubLabel = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  // ---- Active sheet data ----------------------------------------------
  const sheetData = useMemo(() => {
    if (!sheet.mealTypeKey) return null;
    return mealTypeData[sheet.mealTypeKey] ?? null;
  }, [sheet.mealTypeKey, mealTypeData]);

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <Animated.ScrollView
          ref={mainScrollRef as any}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
          onScroll={stickyScrollHandler}
          scrollEventThrottle={16}
        >
          {/* Header with greeting — compact MonthYearPicker now tucks
              into the greeting line's right-side trailing slot instead
              of getting its own row below the banner. */}
          <Animated.View entering={FadeInDown.delay(50).springify()}>
            <HomeHeader
              userName={displayName ?? undefined}
              userInitial={displayName?.[0] || 'U'}
              avatarUrl={avatarUrl}
              // Crown badge visible for paid subscribers only — visual
              // status symbol that adds gentle ownership ("I'm a Premium
              // user").
              isPremium={hasPremiumAccess}
              isDark={isDark}
              greetingWord={greetingWord}
              subtitleMessage={getGreetingSubtitle()}
              onAvatarPress={() => {
                Haptics.selectionAsync();
                router.push('/(tabs)/preferences' as any);
              }}
              trailingSlot={
                <MonthYearPicker
                  selectedDate={selectedDate}
                  onDateChange={handleMonthYearChange}
                  minDate={minAllowedDate}
                  isDark={isDark}
                  compact
                />
              }
            />
          </Animated.View>

          {/* Soft re-prompt — only renders for signed-in non-premium users
              when no plan generation is in flight. Tap → opens paywall. */}
          <UnlockReminderPill />

          {/* Background generation banner — visible only while a
              PnP-Suggests plan is being streamed in. Self-dismisses
              when complete or on failure tap-to-retry. */}
          <PendingGenerationBanner isDark={isDark} />

          {/* Week strip + weekly stats */}
          <Animated.View entering={FadeInDown.delay(180).springify()}>
            <WeekStrip
              days={weekDays}
              onDayPress={handleDayPress}
              isDark={isDark}
              scrollToIndex={selectedIndex}
            />
            <View
              style={{
                alignItems: 'center',
                marginTop: -6,
                paddingBottom: 10,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 12,
                  color: colors.ink2,
                }}
              >
                {weeklyStats === 0
                  ? 'No meals planned this week'
                  : weeklyStats === 1
                  ? '1 meal planned this week'
                  : `${weeklyStats} meals planned this week`}
              </Text>
            </View>
          </Animated.View>

          {/* Paused banner */}
          {isPaused && (
            <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
              <PausedFeatureBanner compact />
            </View>
          )}

          {/* Nudge card — driven by the nudge engine */}
          {activeNudge && !isPaused && (
            <Animated.View entering={FadeInDown.delay(240).springify()}>
              <NudgeCard
                eyebrow={activeNudge.cardProps.eyebrow}
                title={activeNudge.cardProps.title}
                message={activeNudge.cardProps.message}
                primaryAction={activeNudge.cardProps.primaryAction}
                secondaryAction={activeNudge.cardProps.secondaryAction}
                onPrimaryAction={handleNudgePrimary}
                onSecondaryAction={handleNudgeSecondary}
                onDismiss={handleNudgeDismiss}
              />
            </Animated.View>
          )}

          {/* Selected day's meals */}
          <Animated.View
            entering={FadeInDown.delay(300).springify()}
            style={{ paddingHorizontal: 16, paddingBottom: 26 }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 12,
              }}
            >
              <View>
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 19,
                    color: colors.ink,
                    letterSpacing: -0.38,
                  }}
                >
                  {headingLabel}
                </Text>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12.5,
                    color: colors.ink3,
                    marginTop: 1,
                  }}
                >
                  {headingSubLabel}
                </Text>
              </View>
            </View>

            {/* Meal cards */}
            <View style={{ gap: 10 }}>
              {selectedDayMeals.map((meal, index) => (
                <Animated.View
                  key={`${meal.slot}-${index}`}
                  entering={FadeInRight.delay(index * 50).springify()}
                >
                  <MealCard
                    slot={meal.slot}
                    title={meal.title}
                    image={meal.image}
                    meta={meal.meta}
                    state={meal.state}
                    tag={meal.tag}
                    recipeCount={meal.recipeCount}
                    hasAllergens={meal.hasAllergens}
                    isRestricted={isPaused}
                    isDark={isDark}
                    onPress={() => handleMealPress(meal)}
                    onSwapPress={() => handleMealSwap(meal)}
                    onViewPress={() => handleMealView(meal)}
                    onLongPress={() => handleMealLongPress(meal)}
                    onCountChipPress={() =>
                      setSheet({ visible: true, mealTypeKey: meal.mealTypeKey })
                    }
                    onAllergenPress={() => {
                      if (meal.firstRecipe && meal.firstAllergenInfo) {
                        handleAllergenPress(meal.firstRecipe, meal.firstAllergenInfo);
                      }
                    }}
                  />
                </Animated.View>
              ))}
            </View>
          </Animated.View>

          {/* Quick actions */}
          <Animated.View
            entering={FadeInDown.delay(360).springify()}
            onLayout={(e) => {
              quickActionsYRef.current = e.nativeEvent.layout.y;
            }}
          >
            <QuickActions
              items={[
                // Hero primary tile — PnP Suggests is the headline behaviour
                // we want users to reach for. Curated plans = our differentiator.
                // While a plan is streaming in, swap the subtitle so the user
                // sees the same affordance reflecting the banner state above.
                {
                  icon: 'utensils',
                  title: 'PnP Picks',
                  subtitle: isPlanInFlight
                    ? 'Plan in progress…'
                    : 'A plan, picked for you',
                  variant: 'primary',
                  thumbnails: recentThumbnails,
                },
                { icon: 'cart', title: 'Build grocery list', subtitle: 'Ready for this week' },
                // Sits beside grocery in the secondary 2-col row. Routes to
                // the curated catalog (PnP Specials / special plan options).
                { icon: 'compass', title: 'Explore meals', subtitle: 'PnP curated plans' },
              ]}
              onActionPress={handleQuickAction}
              isDark={isDark}
              isRestricted={isPaused}
            />
          </Animated.View>

          {/* The Favorites — recipes the user loved / rated highly in the
              past week. Empty (with a gentle prompt) on a fresh account. */}
          <Animated.View entering={FadeInDown.delay(420).springify()}>
            <PnPFavorites
              favorites={favoriteRecipes}
              onRecipePress={(recipeId) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(`/recipe-detail?id=${recipeId}` as any);
              }}
              isDark={isDark}
            />
          </Animated.View>
        </Animated.ScrollView>
      </SafeAreaView>

      {/* PaywallSheet is mounted globally in src/app/_layout.tsx so it
          works from any tab/screen — no duplicate mount needed here. */}

      {/* Sticky compact header — outside SafeAreaView (sits on top of everything) */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
            borderBottomWidth: 1,
            borderBottomColor: isDark ? '#2a2a2a' : designTokens.colors.hair2,
          },
          stickyHeaderStyle,
        ]}
      >
        <SafeAreaView edges={['top']}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              paddingHorizontal: 20,
              paddingVertical: 10,
            }}
          >
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                router.push('/(tabs)/preferences' as any);
              }}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                overflow: 'hidden',
              }}
            >
              <UserAvatarDisplay
                size={32}
                avatarUrl={avatarUrl}
                name={displayName || 'User'}
              />
            </Pressable>

            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                textAlign: 'center',
                fontFamily: designTokens.font.medium,
                fontSize: 15,
                color: isDark ? '#fff' : designTokens.colors.ink,
                letterSpacing: -0.3,
              }}
            >
              Good {greetingWord}
              {displayName ? `, ${displayName.split(' ')[0]}` : ''}
            </Text>

            {/* Symmetry spacer */}
            <View style={{ width: 32 }} />
          </View>
        </SafeAreaView>
      </Animated.View>

      {/* ---- Recipes-management bottom sheet ---- */}
      {sheet.visible && sheet.mealTypeKey && sheetData && (
        <MealSlotSheet
          visible={sheet.visible}
          mealTypeLabel={MEAL_TYPES.find((m) => m.key === sheet.mealTypeKey)?.label ?? ''}
          slots={sheetData.slots}
          recipes={sheetData.recipes}
          allergenMap={recipeAllergenMap}
          cookedSlotIds={cookedSlotIds}
          isDark={isDark}
          isRestricted={isPaused}
          onClose={() => setSheet({ visible: false, mealTypeKey: null })}
          onAdd={handleSheetAdd}
          onView={handleSheetView}
          onSwap={handleSheetSwap}
          onRemove={handleSheetRemove}
          onOpenServing={handleOpenServingModal}
          onAllergenPress={handleAllergenPress}
          onToggleCooked={handleToggleCooked}
        />
      )}

      {/* ---- Serving adjustment modal ---- */}
      <ServingAdjustmentModal
        visible={servingModal.visible}
        recipe={servingModal.recipe}
        currentServingOverride={servingModal.servingOverride}
        onClose={() =>
          setServingModal({ visible: false, slotId: null, recipe: null, servingOverride: undefined })
        }
        onSave={handleSaveServingSize}
      />

      {/* ---- Long-press delete-all confirmation ---- */}
      <ConfirmDialog
        visible={confirmDelete.visible}
        title="Delete all recipes?"
        message={
          confirmDelete.slotIds.length > 0
            ? `This will remove ${confirmDelete.slotIds.length} ${confirmDelete.mealTypeLabel} recipe${
                confirmDelete.slotIds.length === 1 ? '' : 's'
              } from this day.`
            : undefined
        }
        icon={<Trash2 size={26} color={designTokens.colors.olive} />}
        iconBg="rgba(228,109,70,0.15)"
        confirmLabel="Yes"
        cancelLabel="No"
        confirmColor={designTokens.colors.olive}
        isDark={isDark}
        onConfirm={handleConfirmDelete}
        onCancel={() =>
          setConfirmDelete({ visible: false, mealTypeKey: null, mealTypeLabel: '', slotIds: [] })
        }
      />

      {/* ---- Allergen detail modal ---- */}
      <Modal
        visible={allergenModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setAllergenModal({ visible: false, info: null, recipeName: '' })}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 28,
          }}
        >
          <View
            style={{
              width: '100%',
              backgroundColor: colors.bg,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: colors.hair,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 18,
                borderBottomWidth: 1,
                borderBottomColor: colors.hair2,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  backgroundColor: '#F5A623',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <AlertTriangle size={18} color="#fff" strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 16,
                    color: colors.ink,
                    letterSpacing: -0.16,
                  }}
                >
                  Allergen warning
                </Text>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12.5,
                    color: colors.ink3,
                    marginTop: 1,
                  }}
                  numberOfLines={1}
                >
                  {allergenModal.recipeName}
                </Text>
              </View>
            </View>

            <View style={{ padding: 18 }}>
              <Text
                style={{
                  fontFamily: designTokens.font.regular,
                  fontSize: 13.5,
                  color: colors.ink2,
                  marginBottom: 10,
                  lineHeight: 19,
                }}
              >
                This recipe contains ingredients that may trigger your allergies:
              </Text>
              {allergenModal.info?.allergens.map((allergen, idx) => (
                <View
                  key={allergen}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 8,
                    borderBottomWidth:
                      idx < (allergenModal.info?.allergens.length ?? 0) - 1 ? 1 : 0,
                    borderBottomColor: colors.hair2,
                  }}
                >
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 999,
                      backgroundColor: 'rgba(245,166,35,0.2)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 10,
                    }}
                  >
                    <AlertTriangle size={13} color="#F5A623" strokeWidth={2.2} />
                  </View>
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 14,
                      color: colors.ink,
                    }}
                  >
                    {allergen}
                  </Text>
                </View>
              ))}
              {allergenModal.info && allergenModal.info.ingredients.length > 0 && (
                <View
                  style={{
                    marginTop: 14,
                    padding: 12,
                    borderRadius: 12,
                    backgroundColor: colors.pill,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 10.5,
                      letterSpacing: 0.5,
                      textTransform: 'uppercase',
                      color: colors.ink3,
                      marginBottom: 4,
                    }}
                  >
                    Ingredients with allergens
                  </Text>
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 13,
                      color: colors.ink,
                      lineHeight: 18,
                    }}
                  >
                    {allergenModal.info.ingredients.join(', ')}
                  </Text>
                </View>
              )}
            </View>

            <View style={{ padding: 18, paddingTop: 0 }}>
              <Pressable
                onPress={() =>
                  setAllergenModal({ visible: false, info: null, recipeName: '' })
                }
                style={{
                  paddingVertical: 13,
                  borderRadius: 14,
                  alignItems: 'center',
                  backgroundColor: designTokens.colors.brand,
                }}
              >
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 14.5,
                    color: '#fff',
                    letterSpacing: -0.145,
                  }}
                >
                  Got it
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---- Cook confirmation sheet (yesterday) ---- */}
      <CookConfirmSheet
        visible={nudgeSheet === 'confirm'}
        dateLabel={
          activeNudge?.payload.yesterdayDateKey
            ? (() => {
                const d = parseLocalDateKey(activeNudge.payload.yesterdayDateKey);
                const wk = d.toLocaleDateString(undefined, { weekday: 'short' });
                return `${wk}, ${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`;
              })()
            : 'yesterday'
        }
        entries={(activeNudge?.payload.yesterdayMealSlots ?? []).map((slot) => ({
          slot,
          recipe: slot.recipeId ? recipeById.get(slot.recipeId) ?? null : null,
        }))}
        isDark={isDark}
        onClose={() => setNudgeSheet(null)}
        onSubmit={(logs) => {
          logCookingBulk(
            logs.map((l) => ({
              slotId: l.slotId,
              recipeId: l.recipeId,
              status: l.status,
              cookedAt: new Date().toISOString(),
              skipReason: l.skipReason,
              actualMealEaten: l.actualMealEaten,
            })),
          );
          setNudgeSheet(null);
        }}
      />

      {/* ---- Weekly rating sheet (Sunday) ---- */}
      <WeeklyRatingSheet
        visible={nudgeSheet === 'rating'}
        recipes={(activeNudge?.payload.weeklyRecipeIds ?? [])
          .map((id) => recipeById.get(id))
          .filter((r): r is Recipe => !!r)}
        cookedRecipeIds={cookedRecipeIds}
        isDark={isDark}
        onClose={() => {
          // Mark this week's prompt as shown so the nudge doesn't re-fire
          // until next Sunday. Done on close (not on open) so the sheet
          // keeps its payload while the user interacts with it.
          setLastWeeklyPromptAt(new Date().toISOString());
          setNudgeSheet(null);
        }}
        onSubmit={(ratings) => {
          const ratedAt = new Date().toISOString();
          ratings.forEach((r) =>
            rateRecipe({
              recipeId: r.recipeId,
              stars: r.stars,
              cookAgain: r.cookAgain,
              ratedAt,
            }),
          );
          setLastWeeklyPromptAt(ratedAt);
          setNudgeSheet(null);
        }}
      />
    </View>
  );
}
