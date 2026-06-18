// Curated Recipe Detail — read-only view of a single recipe that lives inside
// a curated plan (the Explore catalog). Curated recipes have no store `id`
// (they're only persisted when a plan is applied), so the regular
// recipe-detail.tsx can't render them. This screen looks the recipe up
// straight from CURATED_MEAL_PLANS by planId + recipe key (name slug).
import React, { useCallback, useMemo } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronLeft,
  Clock,
  Flame,
  Users,
  Coffee,
  Sun,
  Moon,
  Apple,
  Bookmark,
  BookmarkCheck,
  CalendarPlus,
  type LucideIcon,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/lib/useColorScheme';
import { DishImage } from '@/components/DishImage';
import {
  findCuratedRecipe,
  buildCuratedRecipe,
  curatedSourceIdFor,
} from '@/lib/curated-meal-plans';
import { useMealPlanStore } from '@/lib/store';
import { designTokens, elevation } from '@/lib/design-tokens';

const MEAL_TYPE_META: Record<
  'breakfast' | 'lunch' | 'dinner' | 'snack',
  { label: string; Icon: LucideIcon }
> = {
  breakfast: { label: 'Breakfast', Icon: Coffee },
  lunch: { label: 'Lunch', Icon: Sun },
  dinner: { label: 'Dinner', Icon: Moon },
  snack: { label: 'Snack', Icon: Apple },
};

export default function CuratedRecipeDetailScreen() {
  const router = useRouter();
  const { planId, recipe: recipeKey } = useLocalSearchParams<{
    planId: string;
    recipe: string;
  }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const entry = planId && recipeKey ? findCuratedRecipe(planId, recipeKey) : undefined;

  // ── Save / add-to-plan wiring ──
  // addRecipe upserts on curatedSourceId, so a recipe can never be saved
  // twice; the same identity also dedupes against rows created when the
  // parent plan is applied.
  const recipes = useMealPlanStore((s) => s.recipes);
  const addRecipe = useMealPlanStore((s) => s.addRecipe);
  const toggleSaveRecipe = useMealPlanStore((s) => s.toggleSaveRecipe);

  const sourceId = entry ? curatedSourceIdFor(entry) : '';
  const existing = useMemo(
    () => (sourceId ? recipes.find((r) => r.curatedSourceId === sourceId) : undefined),
    [recipes, sourceId],
  );
  const isSaved = !!existing?.isSaved;

  const handleSave = useCallback(() => {
    if (!entry || isSaved) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (existing) {
      // Already in the library (e.g. from applying its plan) — just flip the
      // saved flag so it shows under "Your recipes" saved filter.
      toggleSaveRecipe(existing.id);
    } else {
      addRecipe(buildCuratedRecipe(entry, true));
    }
  }, [entry, isSaved, existing, addRecipe, toggleSaveRecipe]);

  const handleAddToMealPlan = useCallback(() => {
    if (!entry) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Ensure the recipe is in the library to get a stable id (dedupes; keeps
    // any existing saved state), then reuse the same add-to-plan flow the
    // "Your recipes" detail uses.
    const id = addRecipe(buildCuratedRecipe(entry, isSaved));
    router.push({
      pathname: '/select-recipe',
      params: { recipeId: id, mode: 'add-to-plan' },
    });
  }, [entry, isSaved, addRecipe, router]);

  // ── Token-driven style helpers ──
  const surfaceBg = isDark ? '#1a1a1a' : '#FFFFFF';
  const cardBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const hair2 = isDark ? '#2a2a2a' : designTokens.colors.hair2;
  const inkPrimary = isDark ? '#fff' : designTokens.colors.ink;
  const inkSecondary = isDark ? '#888' : designTokens.colors.ink2;
  const inkTertiary = isDark ? '#666' : designTokens.colors.ink3;

  const BackButton = () => (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.back();
      }}
      hitSlop={10}
      style={{ width: 40, height: 40 }}
    >
      {({ pressed }) => (
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: cardBg,
            borderWidth: 1,
            borderColor: cardBorder,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: pressed ? 0.94 : 1 }],
          }}
        >
          <ChevronLeft size={22} color={inkPrimary} strokeWidth={1.9} />
        </View>
      )}
    </Pressable>
  );

  // ── Not found ──
  if (!entry) {
    return (
      <View style={{ flex: 1, backgroundColor: surfaceBg }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
            <BackButton />
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 17,
                color: inkSecondary,
                textAlign: 'center',
              }}
            >
              We couldn't find that recipe.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const { recipe, mealType, planName } = entry;
  const meta = MEAL_TYPE_META[mealType];
  const totalMin = (recipe.prepTime || 0) + (recipe.cookTime || 0);

  const statItems: { Icon: LucideIcon; label: string; value: string }[] = [];
  if (totalMin > 0) statItems.push({ Icon: Clock, label: 'Total time', value: `${totalMin} min` });
  if (recipe.calories) statItems.push({ Icon: Flame, label: 'Calories', value: `${recipe.calories}` });
  if (recipe.servings) statItems.push({ Icon: Users, label: 'Serves', value: `${recipe.servings}` });

  return (
    <View style={{ flex: 1, backgroundColor: surfaceBg }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Back button */}
          <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6 }}>
            <BackButton />
          </View>

          {/* Hero image */}
          <Animated.View
            entering={FadeInDown.springify()}
            style={{ paddingHorizontal: 16 }}
          >
            <View
              style={{
                width: '100%',
                aspectRatio: 4 / 3,
                borderRadius: 24,
                overflow: 'hidden',
                backgroundColor: '#F4F0E8',
                borderWidth: 1,
                borderColor: cardBorder,
                ...elevation.card,
              }}
            >
              <DishImage
                url={recipe.imageUrl}
                blurhash={recipe.blurhash}
                width={1000}
                style={{ width: '100%', height: '100%' }}
              />
            </View>
          </Animated.View>

          {/* Title block */}
          <Animated.View
            entering={FadeInDown.delay(80).springify()}
            style={{ paddingHorizontal: 24, paddingTop: 18 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <meta.Icon size={13} color={designTokens.colors.olive} strokeWidth={2} />
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 11,
                  letterSpacing: 1.3,
                  textTransform: 'uppercase',
                  color: designTokens.colors.olive,
                }}
              >
                {meta.label} · {planName}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 26,
                color: inkPrimary,
                letterSpacing: -0.5,
              }}
            >
              {recipe.name}
            </Text>
            {recipe.description ? (
              <Text
                style={{
                  fontFamily: designTokens.font.regular,
                  fontSize: 14.5,
                  lineHeight: 22,
                  color: inkSecondary,
                  marginTop: 10,
                }}
              >
                {recipe.description}
              </Text>
            ) : null}
          </Animated.View>

          {/* Stat row */}
          {statItems.length > 0 && (
            <Animated.View
              entering={FadeInDown.delay(140).springify()}
              style={{
                flexDirection: 'row',
                gap: 10,
                paddingHorizontal: 24,
                marginTop: 18,
              }}
            >
              {statItems.map(({ Icon, label, value }) => (
                <View
                  key={label}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: cardBorder,
                    backgroundColor: isDark ? '#1f1f1f' : designTokens.colors.cream,
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Icon size={16} color={designTokens.colors.olive} strokeWidth={1.9} />
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 15,
                      color: inkPrimary,
                      letterSpacing: -0.2,
                    }}
                  >
                    {value}
                  </Text>
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 10.5,
                      letterSpacing: 0.4,
                      textTransform: 'uppercase',
                      color: inkTertiary,
                    }}
                  >
                    {label}
                  </Text>
                </View>
              ))}
            </Animated.View>
          )}

          {/* Ingredients */}
          {recipe.ingredients?.length > 0 && (
            <Animated.View
              entering={FadeInDown.delay(200).springify()}
              style={{ paddingHorizontal: 24, marginTop: 28 }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 11,
                  letterSpacing: 0.55,
                  textTransform: 'uppercase',
                  color: inkTertiary,
                  marginBottom: 12,
                }}
              >
                Ingredients
              </Text>
              <View
                style={{
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: cardBorder,
                  backgroundColor: cardBg,
                  paddingHorizontal: 16,
                }}
              >
                {recipe.ingredients.map((ing, idx) => (
                  <View
                    key={ing.id || `${ing.name}-${idx}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      paddingVertical: 12,
                      borderTopWidth: idx === 0 ? 0 : 1,
                      borderTopColor: hair2,
                    }}
                  >
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: designTokens.font.regular,
                        fontSize: 14,
                        color: inkPrimary,
                        letterSpacing: -0.1,
                      }}
                    >
                      {ing.name}
                    </Text>
                    {(ing.quantity || ing.unit) && (
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 13,
                          color: inkSecondary,
                        }}
                      >
                        {`${ing.quantity ?? ''} ${ing.unit ?? ''}`.trim()}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </Animated.View>
          )}

          {/* Instructions */}
          {recipe.instructions?.length > 0 && (
            <Animated.View
              entering={FadeInDown.delay(260).springify()}
              style={{ paddingHorizontal: 24, marginTop: 28 }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 11,
                  letterSpacing: 0.55,
                  textTransform: 'uppercase',
                  color: inkTertiary,
                  marginBottom: 12,
                }}
              >
                Method
              </Text>
              <View style={{ gap: 14 }}>
                {recipe.instructions.map((step, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', gap: 12 }}>
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 999,
                        backgroundColor: designTokens.colors.brand,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 1,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 12.5,
                          color: designTokens.colors.cream,
                        }}
                      >
                        {idx + 1}
                      </Text>
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: designTokens.font.regular,
                        fontSize: 14.5,
                        lineHeight: 22,
                        color: inkPrimary,
                        letterSpacing: -0.1,
                      }}
                    >
                      {step}
                    </Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}

          {/* Tags */}
          {recipe.tags?.length > 0 && (
            <Animated.View
              entering={FadeInDown.delay(320).springify()}
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 6,
                paddingHorizontal: 24,
                marginTop: 28,
              }}
            >
              {recipe.tags.map((t) => (
                <View
                  key={t}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: cardBorder,
                    backgroundColor: isDark ? '#181814' : designTokens.colors.cream,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 11.5,
                      color: inkSecondary,
                      letterSpacing: -0.05,
                    }}
                  >
                    {t}
                  </Text>
                </View>
              ))}
            </Animated.View>
          )}
        </ScrollView>

        {/* Sticky action bar — Save + Add to meal plan */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            flexDirection: 'row',
            gap: 10,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 28,
            backgroundColor: surfaceBg,
            borderTopWidth: 1,
            borderTopColor: hair2,
          }}
        >
          <Pressable onPress={handleSave} disabled={isSaved} style={{ flexBasis: 130 }}>
            {({ pressed }) => (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  paddingVertical: 15,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: isSaved ? designTokens.colors.olive : cardBorder,
                  backgroundColor: isSaved
                    ? isDark
                      ? 'rgba(108,122,90,0.18)'
                      : 'rgba(108,122,90,0.10)'
                    : cardBg,
                  transform: [{ scale: pressed && !isSaved ? 0.98 : 1 }],
                }}
              >
                {isSaved ? (
                  <BookmarkCheck size={17} color={designTokens.colors.olive} strokeWidth={2} />
                ) : (
                  <Bookmark size={17} color={inkPrimary} strokeWidth={1.9} />
                )}
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 14.5,
                    color: isSaved ? designTokens.colors.olive : inkPrimary,
                    letterSpacing: -0.15,
                  }}
                >
                  {isSaved ? 'Saved' : 'Save'}
                </Text>
              </View>
            )}
          </Pressable>

          <Pressable onPress={handleAddToMealPlan} style={{ flex: 1 }}>
            {({ pressed }) => (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 15,
                  borderRadius: 999,
                  backgroundColor: designTokens.colors.brand,
                  shadowColor: designTokens.colors.brandDeep,
                  shadowOpacity: 0.22,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 7 },
                  elevation: 4,
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                }}
              >
                <CalendarPlus size={19} color={designTokens.colors.cream} strokeWidth={1.9} />
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 15,
                    color: designTokens.colors.cream,
                    letterSpacing: -0.2,
                  }}
                >
                  Add to meal plan
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
