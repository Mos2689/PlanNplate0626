// SelectRecipeScreen — PlannPlate Home design language
// (Geist fonts, hair borders, deep sage #546445, 18–20px radii)
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  X,
  Search,
  Clock,
  Check,
  Flame,
  Plus,
  Download,
  Sparkles,
  CheckSquare,
  Square,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useMealPlanStore, type Recipe, type MealSlot } from '@/lib/store';
import { useColorScheme } from '@/lib/useColorScheme';
import { designTokens, getThemeColors } from '@/lib/design-tokens';

// ── Helpers ──────────────────────────────────────────────────────────
function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', short: 'Brk' },
  { key: 'lunch', label: 'Lunch', short: 'Lun' },
  { key: 'dinner', label: 'Dinner', short: 'Din' },
  { key: 'snack', label: 'Snack', short: 'Snk' },
] as const;

const DAY_LETTERS_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const eyebrow = {
  fontFamily: designTokens.font.medium,
  fontSize: 11,
  letterSpacing: 0.66,
  textTransform: 'uppercase' as const,
  color: designTokens.colors.ink3,
};

// ── Recipe row ────────────────────────────────────────────────────────
interface RecipeItemProps {
  recipe: Recipe;
  isSelected: boolean;
  onSelect: () => void;
  isDark: boolean;
  index: number;
}

function RecipeItem({ recipe, isSelected, onSelect, isDark, index }: RecipeItemProps) {
  const colors = getThemeColors(isDark);
  const totalMin = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);

  return (
    <Animated.View entering={FadeInRight.delay(Math.min(index * 40, 240)).springify()}>
      <Pressable
        onPress={onSelect}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          marginBottom: 10,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: isSelected
            ? designTokens.colors.brand
            : designTokens.colors.hair,
          backgroundColor: colors.bg,
        }}
      >
        <Image
          source={{ uri: recipe.imageUrl }}
          style={{
            width: 64,
            height: 64,
            borderRadius: 14,
            backgroundColor: '#F4F0E8',
          }}
          contentFit="cover"
          transition={150}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 15,
              color: colors.ink,
              letterSpacing: -0.15,
              lineHeight: 19,
            }}
            numberOfLines={1}
          >
            {recipe.name}
          </Text>
          {recipe.description ? (
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 12,
                color: designTokens.colors.ink3,
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {recipe.description}
            </Text>
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginTop: 6,
            }}
          >
            {totalMin > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Clock size={11} color={designTokens.colors.ink2} strokeWidth={1.8} />
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 11.5,
                    color: designTokens.colors.ink2,
                  }}
                >
                  {totalMin} min
                </Text>
              </View>
            )}
            {recipe.calories ? (
              <>
                <View
                  style={{
                    width: 2,
                    height: 2,
                    borderRadius: 999,
                    backgroundColor: designTokens.colors.ink3,
                  }}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Flame size={11} color={designTokens.colors.ink2} strokeWidth={1.8} />
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 11.5,
                      color: designTokens.colors.ink2,
                    }}
                  >
                    {recipe.calories} cal
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        </View>
        {/* Selection indicator */}
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            borderWidth: isSelected ? 0 : 1,
            borderColor: colors.hair,
            backgroundColor: isSelected ? designTokens.colors.brand : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isSelected ? <Check size={16} color="#fff" strokeWidth={2.5} /> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────
export default function SelectRecipeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    mealType?: string;
    date?: string;
    recipeId?: string;
    mode?: string;
    swap?: string;
    slotId?: string;
    /** When 'true', hide the multi-date picker — user is locked to params.date */
    lockDate?: string;
  }>();

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = getThemeColors(isDark);

  const recipes = useMealPlanStore((s) => s.recipes);
  const addMealToSlot = useMealPlanStore((s) => s.addMealToSlot);
  const updateMealSlot = useMealPlanStore((s) => s.updateMealSlot);
  const mealSlots = useMealPlanStore((s) => s.mealSlots);

  const initialMealTypes = params.mealType ? [params.mealType] : ['dinner'];
  const initialDate = params.date ? params.date : formatLocalDateKey(new Date());

  const initialSelectedRecipeIds = useMemo(() => {
    if (params.recipeId) return [params.recipeId];
    const existing = mealSlots
      .filter((slot) => slot.date === initialDate && initialMealTypes.includes(slot.mealType))
      .map((slot) => slot.recipeId)
      .filter((id): id is string => id !== null);
    return existing;
  }, [params.recipeId, mealSlots, initialDate, initialMealTypes]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>(initialSelectedRecipeIds);
  const [dateMealTypeMap, setDateMealTypeMap] = useState<Record<string, string[]>>({
    [initialDate]: initialMealTypes,
  });

  const selectedDates = useMemo(
    () => Object.keys(dateMealTypeMap).sort(),
    [dateMealTypeMap],
  );

  const totalSlotCount = useMemo(
    () => Object.values(dateMealTypeMap).reduce((sum, types) => sum + types.length, 0),
    [dateMealTypeMap],
  );

  const isAddToSlotMode = params.mode === 'add-to-plan' && !!params.recipeId;
  const isSwapMode = params.swap === 'true';
  // When locked (user tapped "Add" on a specific meal slot), the date picker
  // and per-date meal-type grid are hidden — the slot is already chosen.
  const isDateLocked = params.lockDate === 'true';

  const filteredRecipes = useMemo(() => {
    let results = recipes;
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      results = results.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          r.tags.some((t) => t.toLowerCase().includes(query)),
      );
    }
    return [...results].sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
  }, [recipes, searchQuery]);

  const handleSelectRecipe = useCallback(
    (recipeId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedRecipeIds((prev) => {
        if (prev.includes(recipeId)) return prev.filter((id) => id !== recipeId);
        if (isSwapMode) return [recipeId];
        return [...prev, recipeId];
      });
    },
    [isSwapMode],
  );

  const handleSelectAll = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (selectedRecipeIds.length === filteredRecipes.length) {
      setSelectedRecipeIds([]);
    } else {
      setSelectedRecipeIds(filteredRecipes.map((r) => r.id));
    }
  }, [filteredRecipes, selectedRecipeIds.length]);

  const handleToggleDate = useCallback(
    (date: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setDateMealTypeMap((prev) => {
        if (date in prev) {
          const next = { ...prev };
          delete next[date];
          return next;
        }
        return { ...prev, [date]: initialMealTypes };
      });
    },
    [initialMealTypes],
  );

  const handleToggleMealTypeForDate = useCallback(
    (date: string, mealType: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setDateMealTypeMap((prev) => {
        const current = prev[date] ?? [];
        const next = current.includes(mealType)
          ? current.filter((t) => t !== mealType)
          : [...current, mealType];
        return { ...prev, [date]: next };
      });
    },
    [],
  );

  const handleConfirm = useCallback(() => {
    if (selectedRecipeIds.length === 0 || totalSlotCount === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const slotId = params.slotId;
    if (isSwapMode && slotId) {
      updateMealSlot(slotId, { recipeId: selectedRecipeIds[0] });
      router.back();
      return;
    }

    selectedRecipeIds.forEach((recipeId) => {
      Object.entries(dateMealTypeMap).forEach(([date, mealTypes]) => {
        mealTypes.forEach((mealType) => {
          addMealToSlot({
            id: '',
            date,
            mealType: mealType as MealSlot['mealType'],
            recipeId,
          });
        });
      });
    });

    const earliestDate = selectedDates.length > 0 ? selectedDates.sort()[0] : null;
    if (earliestDate) {
      router.replace({
        pathname: '/(tabs)',
        params: { scrollToDate: earliestDate, _ts: String(Date.now()) },
      });
    } else {
      router.back();
    }
  }, [
    selectedRecipeIds,
    dateMealTypeMap,
    totalSlotCount,
    addMealToSlot,
    updateMealSlot,
    router,
    isSwapMode,
    params.slotId,
    selectedDates,
  ]);

  // Generate next 14 days for date picker
  const dateOptions = useMemo(() => {
    const dates: string[] = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(formatLocalDateKey(date));
    }
    return dates;
  }, []);

  const allSelected =
    filteredRecipes.length > 0 && selectedRecipeIds.length === filteredRecipes.length;

  const title = isSwapMode
    ? 'Swap recipe'
    : isAddToSlotMode
    ? 'Add to meal plan'
    : 'Select recipes';

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <Animated.View
          entering={FadeInDown.delay(50).springify()}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 14,
          }}
        >
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.hair,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.bg,
            }}
          >
            <X size={18} color={colors.ink} strokeWidth={1.6} />
          </Pressable>
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 17,
              color: colors.ink,
              letterSpacing: -0.34,
            }}
          >
            {title}
          </Text>
          <View style={{ width: 40 }} />
        </Animated.View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 140 }}
        >
          {/* Date selector — hidden in swap mode, AND when the caller locked the date
              (e.g. coming from a specific meal slot on the meal plan). */}
          {!isSwapMode && !isDateLocked && (
            <Animated.View
              entering={FadeInDown.delay(120).springify()}
              style={{ paddingBottom: 18 }}
            >
              <Text style={[eyebrow, { paddingHorizontal: 20, marginBottom: 8 }]}>
                Select dates
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
              >
                {dateOptions.map((date) => {
                  const isSelected = selectedDates.includes(date);
                  const dateObj = new Date(date);
                  const isToday = date === formatLocalDateKey(new Date());
                  return (
                    <Pressable
                      key={date}
                      onPress={() => handleToggleDate(date)}
                      style={{
                        width: 56,
                        alignItems: 'center',
                        paddingVertical: 10,
                        borderRadius: 14,
                        backgroundColor: isSelected
                          ? designTokens.colors.brand
                          : 'transparent',
                        borderWidth: isSelected ? 0 : 1,
                        borderColor: colors.hair,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 10.5,
                          letterSpacing: 0.4,
                          textTransform: 'uppercase',
                          color: isSelected
                            ? 'rgba(255,255,255,0.7)'
                            : designTokens.colors.ink3,
                        }}
                      >
                        {isToday ? 'Today' : DAY_LETTERS_FULL[dateObj.getDay()]}
                      </Text>
                      <Text
                        style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 17,
                          letterSpacing: -0.34,
                          marginTop: 4,
                          color: isSelected ? '#fff' : colors.ink,
                        }}
                      >
                        {dateObj.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {selectedDates.length > 0 && (
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12,
                    color: designTokens.colors.ink2,
                    paddingHorizontal: 20,
                    marginTop: 8,
                  }}
                >
                  {selectedDates.length} date{selectedDates.length !== 1 ? 's' : ''} selected
                </Text>
              )}
            </Animated.View>
          )}

          {/* Per-date meal type schedule — lets users add more meal types or
              dates. Hidden in swap mode and when the target slot is locked
              (the date + meal type are already chosen). */}
          {!isSwapMode && !isDateLocked && selectedDates.length > 0 && (
            <Animated.View
              entering={FadeInDown.delay(160).springify()}
              style={{ paddingHorizontal: 16, paddingBottom: 18 }}
            >
              <Text style={[eyebrow, { paddingHorizontal: 4, marginBottom: 8 }]}>
                Meal types per date
              </Text>
              {selectedDates.map((date, index) => {
                const selectedTypes = dateMealTypeMap[date] ?? [];
                const dateObj = new Date(date);
                const isToday = date === formatLocalDateKey(new Date());
                const dayLabel = isToday ? 'Today' : DAY_LETTERS_FULL[dateObj.getDay()];

                return (
                  <Animated.View
                    key={date}
                    entering={FadeInDown.delay(index * 40).springify()}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 12,
                      marginBottom: 8,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: colors.hair,
                      backgroundColor: colors.bg,
                    }}
                  >
                    <View style={{ width: 60 }}>
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 11,
                          letterSpacing: 0.44,
                          textTransform: 'uppercase',
                          color: designTokens.colors.ink3,
                        }}
                      >
                        {dayLabel}
                      </Text>
                      <Text
                        style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 18,
                          letterSpacing: -0.36,
                          color: colors.ink,
                          marginTop: 2,
                        }}
                      >
                        {dateObj.getDate()}
                      </Text>
                    </View>
                    <View
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        gap: 6,
                      }}
                    >
                      {MEAL_TYPES.map((mt) => {
                        const isSel = selectedTypes.includes(mt.key);
                        return (
                          <Pressable
                            key={mt.key}
                            onPress={() => handleToggleMealTypeForDate(date, mt.key)}
                            style={{
                              flex: 1,
                              paddingVertical: 9,
                              borderRadius: 12,
                              backgroundColor: isSel
                                ? designTokens.colors.brand
                                : 'transparent',
                              borderWidth: isSel ? 0 : 1,
                              borderColor: colors.hair,
                              alignItems: 'center',
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: designTokens.font.medium,
                                fontSize: 11.5,
                                color: isSel ? '#fff' : designTokens.colors.ink2,
                                letterSpacing: -0.115,
                              }}
                            >
                              {mt.short}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Animated.View>
                );
              })}
              {totalSlotCount > 0 && (
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12,
                    color: designTokens.colors.ink2,
                    paddingHorizontal: 4,
                  }}
                >
                  {totalSlotCount} slot{totalSlotCount !== 1 ? 's' : ''} across{' '}
                  {selectedDates.length} date{selectedDates.length !== 1 ? 's' : ''}
                </Text>
              )}
            </Animated.View>
          )}

          {/* Quick-add navigation buttons */}
          <Animated.View
            entering={FadeInDown.delay(200).springify()}
            style={{ paddingHorizontal: 16, paddingBottom: 18 }}
          >
            <Text style={[eyebrow, { paddingHorizontal: 4, marginBottom: 8 }]}>
              Add a recipe
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                {
                  label: 'New',
                  icon: <Plus size={16} color={designTokens.colors.brand} strokeWidth={1.8} />,
                  onPress: () => router.push('/add-recipe'),
                },
                {
                  label: 'Import',
                  icon: (
                    <Download size={16} color={designTokens.colors.brand} strokeWidth={1.8} />
                  ),
                  onPress: () => router.push('/import-recipe'),
                },
                {
                  label: 'AI',
                  icon: (
                    <Sparkles size={16} color={designTokens.colors.olive} strokeWidth={1.8} />
                  ),
                  onPress: () => router.push('/generate-recipe'),
                },
              ].map((btn) => (
                <Pressable
                  key={btn.label}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    btn.onPress();
                  }}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingVertical: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: colors.hair,
                    backgroundColor: colors.bg,
                  }}
                >
                  {btn.icon}
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 13.5,
                      color: colors.ink,
                      letterSpacing: -0.135,
                    }}
                  >
                    {btn.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>

          {/* Search bar */}
          {!isAddToSlotMode && (
            <Animated.View
              entering={FadeInDown.delay(240).springify()}
              style={{ paddingHorizontal: 16, paddingBottom: 14 }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.hair,
                  backgroundColor: colors.bg,
                  gap: 10,
                }}
              >
                <Search size={17} color={designTokens.colors.ink3} strokeWidth={1.6} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search recipes…"
                  placeholderTextColor={designTokens.colors.ink3}
                  style={{
                    flex: 1,
                    fontFamily: designTokens.font.regular,
                    fontSize: 14.5,
                    color: colors.ink,
                    padding: 0,
                  }}
                />
              </View>
            </Animated.View>
          )}

          {/* Recipe list */}
          <View style={{ paddingHorizontal: 16 }}>
            {/* Header row */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
                paddingHorizontal: 4,
              }}
            >
              <Text style={eyebrow}>
                {isAddToSlotMode
                  ? 'Recipe'
                  : `${filteredRecipes.length} recipe${filteredRecipes.length === 1 ? '' : 's'}`}
              </Text>

              {!isAddToSlotMode && filteredRecipes.length > 0 && (
                <Pressable
                  onPress={handleSelectAll}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  {allSelected ? (
                    <CheckSquare size={16} color={designTokens.colors.brand} strokeWidth={1.8} />
                  ) : (
                    <Square size={16} color={designTokens.colors.ink2} strokeWidth={1.6} />
                  )}
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 12.5,
                      color: allSelected
                        ? designTokens.colors.brand
                        : designTokens.colors.ink2,
                      letterSpacing: -0.125,
                    }}
                  >
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Selection count chip */}
            {!isAddToSlotMode && selectedRecipeIds.length > 0 && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: designTokens.colors.brand,
                  alignSelf: 'flex-start',
                  marginBottom: 12,
                }}
              >
                <Check size={13} color="#fff" strokeWidth={2.5} />
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 12,
                    color: '#fff',
                    letterSpacing: -0.12,
                  }}
                >
                  {selectedRecipeIds.length} selected
                </Text>
              </View>
            )}

            {/* Preview card when adding a specific recipe to a slot */}
            {isAddToSlotMode && selectedRecipeIds[0]
              ? (() => {
                  const recipe = recipes.find((r) => r.id === selectedRecipeIds[0]);
                  if (!recipe) return null;
                  const totalMin = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);
                  return (
                    <View
                      style={{
                        flexDirection: 'row',
                        gap: 12,
                        padding: 14,
                        marginBottom: 16,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: designTokens.colors.brand,
                        backgroundColor: colors.bg,
                      }}
                    >
                      <Image
                        source={{ uri: recipe.imageUrl }}
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 14,
                          backgroundColor: '#F4F0E8',
                        }}
                        contentFit="cover"
                        transition={150}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            fontFamily: designTokens.font.semibold,
                            fontSize: 16,
                            color: colors.ink,
                            letterSpacing: -0.16,
                          }}
                          numberOfLines={1}
                        >
                          {recipe.name}
                        </Text>
                        <Text
                          style={{
                            fontFamily: designTokens.font.regular,
                            fontSize: 12,
                            color: designTokens.colors.ink3,
                            marginTop: 4,
                          }}
                          numberOfLines={2}
                        >
                          {recipe.description}
                        </Text>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            marginTop: 6,
                          }}
                        >
                          {totalMin > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                              <Clock
                                size={11}
                                color={designTokens.colors.ink2}
                                strokeWidth={1.8}
                              />
                              <Text
                                style={{
                                  fontFamily: designTokens.font.regular,
                                  fontSize: 11.5,
                                  color: designTokens.colors.ink2,
                                }}
                              >
                                {totalMin} min
                              </Text>
                            </View>
                          )}
                          {recipe.calories ? (
                            <>
                              <View
                                style={{
                                  width: 2,
                                  height: 2,
                                  borderRadius: 999,
                                  backgroundColor: designTokens.colors.ink3,
                                }}
                              />
                              <View
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                              >
                                <Flame
                                  size={11}
                                  color={designTokens.colors.ink2}
                                  strokeWidth={1.8}
                                />
                                <Text
                                  style={{
                                    fontFamily: designTokens.font.regular,
                                    fontSize: 11.5,
                                    color: designTokens.colors.ink2,
                                  }}
                                >
                                  {recipe.calories} cal
                                </Text>
                              </View>
                            </>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  );
                })()
              : filteredRecipes.map((recipe, index) => (
                  <RecipeItem
                    key={recipe.id}
                    recipe={recipe}
                    isSelected={selectedRecipeIds.includes(recipe.id)}
                    onSelect={() => handleSelectRecipe(recipe.id)}
                    isDark={isDark}
                    index={index}
                  />
                ))}

            {/* Empty state */}
            {filteredRecipes.length === 0 && !isAddToSlotMode && (
              <View style={{ alignItems: 'center', paddingVertical: 50 }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: colors.hair,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 14,
                  }}
                >
                  <Search size={22} color={designTokens.colors.ink3} strokeWidth={1.6} />
                </View>
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 15,
                    color: colors.ink,
                    letterSpacing: -0.15,
                  }}
                >
                  No recipes found
                </Text>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 13,
                    color: designTokens.colors.ink3,
                    marginTop: 4,
                  }}
                >
                  Try a different search term
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Confirm button (sticky) */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 20,
            paddingTop: 14,
            paddingBottom: 28,
            backgroundColor: colors.bg,
            borderTopWidth: 1,
            borderTopColor: colors.hair2,
          }}
        >
          <Pressable
            onPress={handleConfirm}
            disabled={selectedRecipeIds.length === 0 || totalSlotCount === 0}
            style={{
              paddingVertical: 15,
              borderRadius: 16,
              alignItems: 'center',
              backgroundColor:
                selectedRecipeIds.length > 0 && totalSlotCount > 0
                  ? designTokens.colors.brand
                  : designTokens.colors.hair2,
            }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 15,
                color:
                  selectedRecipeIds.length > 0 && totalSlotCount > 0
                    ? '#fff'
                    : designTokens.colors.ink3,
                letterSpacing: -0.15,
              }}
            >
              {isSwapMode
                ? selectedRecipeIds.length > 0
                  ? 'Swap recipe'
                  : 'Select a recipe'
                : isAddToSlotMode
                ? totalSlotCount > 0
                  ? `Add ${totalSlotCount} slot${totalSlotCount !== 1 ? 's' : ''}`
                  : 'Select meal types'
                : selectedRecipeIds.length > 0
                ? `Add ${selectedRecipeIds.length} recipe${selectedRecipeIds.length !== 1 ? 's' : ''}`
                : 'Select recipes'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
