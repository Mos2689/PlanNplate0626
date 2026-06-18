// Explore Meals — recipe catalog.
//
// Instead of listing the 5 curated plans as cards, this screen surfaces ALL
// recipes that live inside those plans. A browser at the top switches between
// the 5 plans; below it, the selected plan's recipes are grouped into separate
// sections by meal type (Breakfast / Lunch / Dinner / Snack). Tapping a recipe
// opens its read-only detail (curated-recipe-detail).
//
// Visual language matches the rest of the curated flow — olive eyebrow caps,
// italic on exactly one word ("recipes"), sage selection, scale-on-press.
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DishImage } from '@/components/DishImage';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Coffee,
  Sun,
  Moon,
  Apple,
  type LucideIcon,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/lib/useColorScheme';
import {
  CURATED_MEAL_PLANS,
  getCuratedPlanRecipes,
  type CuratedRecipeEntry,
} from '@/lib/curated-meal-plans';
import { designTokens, elevation } from '@/lib/design-tokens';
import {
  StickyScreenHeader,
  useStickyHeaderScroll,
} from '@/components/StickyScreenHeader';

// Section order + per-meal identity (icon). Snack only renders when a plan
// actually has snacks.
type MealTypeId = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const MEAL_TYPE_ORDER: { id: MealTypeId; label: string; Icon: LucideIcon }[] = [
  { id: 'breakfast', label: 'Breakfast', Icon: Coffee },
  { id: 'lunch', label: 'Lunch', Icon: Sun },
  { id: 'dinner', label: 'Dinner', Icon: Moon },
  { id: 'snack', label: 'Snack', Icon: Apple },
];

// ───────────────────────────────────────────────────────────────────────────────
// SCREEN
// ───────────────────────────────────────────────────────────────────────────────

export default function CuratedMealPlanScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const plans = CURATED_MEAL_PLANS;
  const [selectedPlanId, setSelectedPlanId] = useState<string>(plans[0]?.id ?? '');

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) ?? plans[0],
    [plans, selectedPlanId],
  );

  // Recipes for the active plan, grouped into meal-type sections (deduped by
  // name slug inside getCuratedPlanRecipes).
  const sections = useMemo(() => {
    if (!selectedPlan) return [];
    const recipes = getCuratedPlanRecipes(selectedPlan);
    return MEAL_TYPE_ORDER.map(({ id, label, Icon }) => ({
      id,
      label,
      Icon,
      items: recipes.filter((r) => r.mealType === id),
    })).filter((s) => s.items.length > 0);
  }, [selectedPlan]);

  const totalRecipes = useMemo(
    () => sections.reduce((sum, s) => sum + s.items.length, 0),
    [sections],
  );

  // ── Token-driven style helpers ──
  const surfaceBg = isDark ? '#1a1a1a' : '#FFFFFF';
  const cardBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const inkPrimary = isDark ? '#fff' : designTokens.colors.ink;
  const inkSecondary = isDark ? '#888' : designTokens.colors.ink2;
  const inkTertiary = isDark ? '#666' : designTokens.colors.ink3;

  const { scrollY, scrollHandler } = useStickyHeaderScroll();

  const openRecipe = (entry: CuratedRecipeEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(
      `/curated-recipe-detail?planId=${entry.planId}&recipe=${entry.key}` as any,
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: surfaceBg }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* ─── Back button ─── */}
        <Animated.View
          entering={FadeInDown.springify()}
          style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 }}
        >
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
        </Animated.View>

        {/* ─── Editorial header ─── */}
        <Animated.View
          entering={FadeInDown.delay(80).springify()}
          style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 14 }}
        >
          <Text
            style={{
              fontFamily: designTokens.font.semibold,
              fontSize: 11,
              letterSpacing: 1.3,
              textTransform: 'uppercase',
              color: designTokens.colors.olive,
              marginBottom: 10,
            }}
          >
            EXPLORE · {plans.length} PLANS
          </Text>
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 28,
              color: inkPrimary,
              letterSpacing: -0.56,
            }}
          >
            Get{' '}
            <Text
              style={{
                fontFamily: designTokens.font.serifItalic,
                fontStyle: 'italic',
                fontSize: 32,
                letterSpacing: -0.32,
              }}
            >
              Inspired
            </Text>
          </Text>
        </Animated.View>

        {/* ─── Plan browser (horizontal tabs) ─── */}
        <View style={{ paddingBottom: 6 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
            style={{ flexGrow: 0 }}
          >
            {plans.map((plan) => {
              const selected = plan.id === selectedPlan?.id;
              return (
                <Pressable
                  key={plan.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedPlanId(plan.id);
                  }}
                >
                  {({ pressed }) => (
                    <View
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 999,
                        borderWidth: selected ? 0 : 1,
                        borderColor: cardBorder,
                        backgroundColor: selected ? designTokens.colors.brand : cardBg,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 13.5,
                          color: selected ? designTokens.colors.cream : inkPrimary,
                          letterSpacing: -0.15,
                        }}
                      >
                        {plan.name}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ─── Recipes for the selected plan, grouped by meal type ─── */}
        <Animated.ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 36, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        >
          {/* Count line for the active plan */}
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 13,
              color: inkTertiary,
              paddingHorizontal: 24,
              marginBottom: 8,
              letterSpacing: -0.05,
            }}
          >
            {totalRecipes} {totalRecipes === 1 ? 'recipe' : 'recipes'} in {selectedPlan?.name}
          </Text>

          {sections.map((section, sIdx) => {
            const SectionIcon = section.Icon;
            return (
              <View key={`${selectedPlan?.id}-${section.id}`} style={{ marginTop: sIdx === 0 ? 8 : 20 }}>
                {/* Section header */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingHorizontal: 24,
                    marginBottom: 12,
                  }}
                >
                  <SectionIcon size={15} color={designTokens.colors.olive} strokeWidth={2} />
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 11,
                      letterSpacing: 1.1,
                      textTransform: 'uppercase',
                      color: designTokens.colors.olive,
                    }}
                  >
                    {section.label}
                  </Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: cardBorder }} />
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 12,
                      color: inkTertiary,
                    }}
                  >
                    {section.items.length}
                  </Text>
                </View>

                {/* Recipe cards */}
                {section.items.map((entry, idx) => {
                  const r = entry.recipe;
                  const totalMin = (r.prepTime || 0) + (r.cookTime || 0);
                  return (
                    <Animated.View
                      key={`${section.id}-${entry.key}`}
                      entering={FadeInDown.delay(40 + idx * 40).springify()}
                      style={{ paddingHorizontal: 16, marginBottom: 10 }}
                    >
                      <Pressable onPress={() => openRecipe(entry)} style={{ width: '100%' }}>
                        {({ pressed }) => (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 12,
                              borderRadius: 18,
                              borderWidth: 1,
                              borderColor: cardBorder,
                              backgroundColor: cardBg,
                              padding: 10,
                              ...elevation.card,
                              transform: [{ scale: pressed ? 0.985 : 1 }],
                            }}
                          >
                            {/* Thumbnail */}
                            <View
                              style={{
                                width: 78,
                                height: 78,
                                borderRadius: 13,
                                overflow: 'hidden',
                                backgroundColor: '#F4F0E8',
                              }}
                            >
                              <DishImage
                                url={r.imageUrl}
                                blurhash={r.blurhash}
                                width={220}
                                style={{ width: '100%', height: '100%' }}
                              />
                            </View>

                            {/* Text */}
                            <View style={{ flex: 1, paddingRight: 4 }}>
                              <Text
                                style={{
                                  fontFamily: designTokens.font.semibold,
                                  fontSize: 15,
                                  color: inkPrimary,
                                  letterSpacing: -0.2,
                                }}
                                numberOfLines={2}
                              >
                                {r.name}
                              </Text>

                              {r.description ? (
                                <Text
                                  style={{
                                    fontFamily: designTokens.font.regular,
                                    fontSize: 12.5,
                                    lineHeight: 17,
                                    color: inkSecondary,
                                    marginTop: 3,
                                  }}
                                  numberOfLines={1}
                                >
                                  {r.description}
                                </Text>
                              ) : null}

                              {/* Meta row */}
                              {(totalMin > 0 || r.calories) && (
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 12,
                                    marginTop: 7,
                                  }}
                                >
                                  {totalMin > 0 && (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                      <Clock size={12} color={inkTertiary} strokeWidth={1.9} />
                                      <Text
                                        style={{
                                          fontFamily: designTokens.font.medium,
                                          fontSize: 11.5,
                                          color: inkTertiary,
                                        }}
                                      >
                                        {totalMin} min
                                      </Text>
                                    </View>
                                  )}
                                  {!!r.calories && (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                      <Flame size={12} color={inkTertiary} strokeWidth={1.9} />
                                      <Text
                                        style={{
                                          fontFamily: designTokens.font.medium,
                                          fontSize: 11.5,
                                          color: inkTertiary,
                                        }}
                                      >
                                        {r.calories} cal
                                      </Text>
                                    </View>
                                  )}
                                </View>
                              )}
                            </View>

                            <ChevronRight size={18} color={inkTertiary} strokeWidth={1.85} />
                          </View>
                        )}
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>
            );
          })}
        </Animated.ScrollView>
      </SafeAreaView>

      {/* Sticky compact header — fades in past the editorial title block. */}
      <StickyScreenHeader
        scrollY={scrollY}
        title="Get Inspired"
        onBack={() => router.back()}
      />
    </View>
  );
}
