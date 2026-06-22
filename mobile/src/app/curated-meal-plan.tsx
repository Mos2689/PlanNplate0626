// Get Inspired — Pinterest-style explore feed for curated recipes.
//
// Replaces the previous plans-as-tabs + meal-type-section layout with a
// two-column masonry of recipes from the user's chosen curated plan.
// Saving a recipe upserts a row into the library (deduped by
// curatedSourceId), and the floating "Add saved to plan" CTA carries the
// saved ids over to /plan-meals so the user can place them on the calendar.
//
// Design language: editorial header (italic "inspired"), olive eyebrow caps,
// sage primary, terracotta accent, hairline borders, Geist + Instrument Serif.
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import {
  Bookmark,
  Clock,
  Flame,
  Plus,
  Sparkles,
  Sun,
  Salad,
  Moon,
  Cookie,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import {
  StickyScreenHeader,
  useStickyHeaderScroll,
} from '@/components/StickyScreenHeader';
import { useColorScheme } from '@/lib/useColorScheme';
import { designTokens, getThemeColors } from '@/lib/design-tokens';
import {
  CURATED_MEAL_PLANS,
  getCuratedPlanRecipes,
  curatedSourceIdFor,
  buildCuratedRecipe,
  type CuratedRecipeEntry,
} from '@/lib/curated-meal-plans';
import { useMealPlanStore } from '@/lib/store';

// ───────────────────────────────────────────────────────────────────────────────
// MEAL TYPE FILTER
// ───────────────────────────────────────────────────────────────────────────────

type MealFilter = 'all' | 'breakfast' | 'lunch' | 'dinner' | 'snack';

const MEAL_TYPES: { id: MealFilter; label: string; Icon: React.ComponentType<any> }[] = [
  { id: 'all', label: 'All', Icon: Sparkles },
  { id: 'breakfast', label: 'Breakfast', Icon: Sun },
  { id: 'lunch', label: 'Lunch', Icon: Salad },
  { id: 'dinner', label: 'Dinner', Icon: Moon },
  { id: 'snack', label: 'Snack', Icon: Cookie },
];

// ───────────────────────────────────────────────────────────────────────────────
// MASONRY HEIGHT HASH — deterministic so a given recipe always renders at the
// same height; gives the Pinterest rhythm without storing imgH per recipe.
// ───────────────────────────────────────────────────────────────────────────────

const HEIGHT_BUCKETS = [200, 220, 240, 260, 280];

function hashHeight(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % HEIGHT_BUCKETS.length;
  return HEIGHT_BUCKETS[idx];
}

// ───────────────────────────────────────────────────────────────────────────────
// CARD
// ───────────────────────────────────────────────────────────────────────────────

interface PinCardProps {
  entry: CuratedRecipeEntry;
  saved: boolean;
  index: number;
  onPress: () => void;
  onToggleSave: () => void;
  onQuickAdd: () => void;
  colors: ReturnType<typeof getThemeColors>;
}

function PinCard({
  entry,
  saved,
  index,
  onPress,
  onToggleSave,
  onQuickAdd,
  colors,
}: PinCardProps) {
  const recipe = entry.recipe;
  const imgH = hashHeight(entry.key);
  const totalMin = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);
  const calories = recipe.calories ?? 0;

  return (
    <Animated.View
      entering={FadeInUp.delay(Math.min(index * 40, 360)).springify()}
      style={{ marginBottom: 10 }}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          borderRadius: 18,
          backgroundColor: colors.bg,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        })}
      >
        {/* Image with overlay chrome */}
        <View
          style={{
            position: 'relative',
            width: '100%',
            height: imgH,
            borderRadius: 18,
            overflow: 'hidden',
            backgroundColor: '#F4F0E8',
          }}
        >
          <Image
            source={{ uri: recipe.imageUrl }}
            placeholder={recipe.blurhash ? { blurhash: recipe.blurhash } : undefined}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={150}
          />

          {/* Save / bookmark */}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onToggleSave();
            }}
            hitSlop={8}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 30,
              height: 30,
              borderRadius: 999,
              backgroundColor: saved ? designTokens.colors.olive : 'rgba(255,255,255,0.92)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Bookmark
              size={14}
              color={saved ? '#fff' : designTokens.colors.ink}
              fill={saved ? '#fff' : 'transparent'}
              strokeWidth={1.8}
            />
          </Pressable>

          {/* Time chip */}
          {totalMin > 0 && (
            <View
              style={{
                position: 'absolute',
                bottom: 8,
                left: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 9,
                paddingVertical: 4,
                paddingLeft: 7,
                borderRadius: 999,
                backgroundColor: 'rgba(21,20,15,0.62)',
              }}
            >
              <Clock size={11} color="#FAF7F0" strokeWidth={2} />
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 11,
                  letterSpacing: -0.05,
                  color: '#FAF7F0',
                }}
              >
                {totalMin} min
              </Text>
            </View>
          )}
        </View>

        {/* Title + footer */}
        <View style={{ paddingHorizontal: 4, paddingTop: 8, paddingBottom: 6 }}>
          <Text
            numberOfLines={2}
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 13.5,
              letterSpacing: -0.13,
              lineHeight: 17.5,
              color: colors.ink,
            }}
          >
            {recipe.name}
          </Text>
          <View
            style={{
              marginTop: 4,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {calories > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Flame size={11} color={colors.ink3} strokeWidth={1.7} />
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 11.5,
                    color: colors.ink3,
                  }}
                >
                  {calories} cal
                </Text>
              </View>
            ) : (
              <View />
            )}
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onQuickAdd();
              }}
              hitSlop={6}
              style={{
                width: 24,
                height: 24,
                borderRadius: 999,
                backgroundColor: colors.hair2,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Plus size={13} color={colors.ink2} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// SCREEN
// ───────────────────────────────────────────────────────────────────────────────

export default function CuratedMealPlanScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const colors = getThemeColors(isDark);
  const { scrollY, scrollHandler } = useStickyHeaderScroll();

  // Store reads
  const recipes = useMealPlanStore((s) => s.recipes);
  const addRecipe = useMealPlanStore((s) => s.addRecipe);
  const toggleSaveRecipe = useMealPlanStore((s) => s.toggleSaveRecipe);

  const plans = CURATED_MEAL_PLANS;
  const [selectedPlanId, setSelectedPlanId] = useState<string>(plans[0]?.id ?? '');
  const [mealFilter, setMealFilter] = useState<MealFilter>('all');

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) ?? plans[0],
    [plans, selectedPlanId],
  );

  // Per-plan entries (memoized; deduped by name slug inside getCuratedPlanRecipes).
  const planEntries = useMemo(() => {
    if (!selectedPlan) return [] as CuratedRecipeEntry[];
    return getCuratedPlanRecipes(selectedPlan);
  }, [selectedPlan]);

  // Plan counts for the pill row — recomputed once.
  const planCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of plans) m.set(p.id, getCuratedPlanRecipes(p).length);
    return m;
  }, [plans]);

  // curatedSourceId -> stored recipe meta. Used to derive saved state and to
  // toggle the right row without re-adding it.
  const curatedSavedMap = useMemo(() => {
    const m = new Map<string, { id: string; isSaved: boolean }>();
    for (const r of recipes) {
      if (r.curatedSourceId) {
        m.set(r.curatedSourceId, { id: r.id, isSaved: !!r.isSaved });
      }
    }
    return m;
  }, [recipes]);

  // Filtered list — apply meal-type filter only after plan selection.
  const filtered = useMemo(() => {
    if (mealFilter === 'all') return planEntries;
    return planEntries.filter((e) => e.mealType === mealFilter);
  }, [planEntries, mealFilter]);

  // Split into two columns for masonry. Alternating index keeps heights mixed.
  const { leftCol, rightCol } = useMemo(() => {
    const left: CuratedRecipeEntry[] = [];
    const right: CuratedRecipeEntry[] = [];
    filtered.forEach((e, i) => {
      if (i % 2 === 0) left.push(e);
      else right.push(e);
    });
    return { leftCol: left, rightCol: right };
  }, [filtered]);

  // Saved entries (current view) — drives the floating CTA.
  const savedEntries = useMemo(() => {
    return planEntries.filter((e) => curatedSavedMap.get(curatedSourceIdFor(e))?.isSaved);
  }, [planEntries, curatedSavedMap]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router]);

  const handleSelectPlan = useCallback((id: string) => {
    Haptics.selectionAsync();
    setSelectedPlanId(id);
  }, []);

  const handleSelectMeal = useCallback((id: MealFilter) => {
    Haptics.selectionAsync();
    setMealFilter(id);
  }, []);

  const handleOpenRecipe = useCallback(
    (entry: CuratedRecipeEntry) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({
        pathname: '/curated-recipe-detail',
        params: { planId: entry.planId, key: entry.key },
      } as any);
    },
    [router],
  );

  const handleToggleSave = useCallback(
    (entry: CuratedRecipeEntry) => {
      const sourceId = curatedSourceIdFor(entry);
      const existing = curatedSavedMap.get(sourceId);
      if (existing) {
        toggleSaveRecipe(existing.id);
      } else {
        addRecipe(buildCuratedRecipe(entry, true));
      }
    },
    [curatedSavedMap, toggleSaveRecipe, addRecipe],
  );

  const handleQuickAdd = useCallback(
    (entry: CuratedRecipeEntry) => {
      const sourceId = curatedSourceIdFor(entry);
      const existing = curatedSavedMap.get(sourceId);
      // Ensure a library row exists before opening the slot picker. If the
      // user hasn't saved the recipe yet, mint it now (not as "saved"),
      // matching the recipes-tab quick-add behaviour.
      let id = existing?.id;
      if (!id) {
        id = addRecipe(buildCuratedRecipe(entry, false));
      }
      router.push({
        pathname: '/select-recipe',
        params: { recipeId: id, mode: 'add-to-plan' },
      } as any);
    },
    [curatedSavedMap, addRecipe, router],
  );

  const handleAddSavedToPlan = useCallback(() => {
    if (savedEntries.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ids = savedEntries
      .map((e) => curatedSavedMap.get(curatedSourceIdFor(e))?.id)
      .filter((id): id is string => !!id);
    router.push({
      pathname: '/plan-meals',
      params: { savedRecipeIds: ids.join(',') },
    } as any);
  }, [savedEntries, curatedSavedMap, router]);

  // Eyebrow color stays olive in both light and dark — terracotta accents
  // remain warm and legible against either bg.
  const olive = designTokens.colors.olive;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <Animated.ScrollView
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Editorial header ───────────────────────────────────── */}
          <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 14, height: 1, backgroundColor: olive }} />
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 11,
                  letterSpacing: 1.54,
                  textTransform: 'uppercase',
                  color: olive,
                }}
              >
                Explore · {plans.length} Plans
              </Text>
            </View>
            <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 36,
                  letterSpacing: -0.9,
                  color: colors.ink,
                  lineHeight: 38,
                }}
              >
                Get{' '}
              </Text>
              <Text
                style={{
                  fontFamily: designTokens.font.serifItalic,
                  fontStyle: 'italic',
                  fontSize: 42,
                  letterSpacing: -1.05,
                  color: colors.ink,
                  lineHeight: 44,
                }}
              >
                inspired
              </Text>
            </View>
            <Text
              style={{
                marginTop: 8,
                fontFamily: designTokens.font.regular,
                fontSize: 14.5,
                lineHeight: 20.3,
                color: colors.ink2,
                maxWidth: 320,
              }}
            >
              Save what you love. Add it to your plan when you&apos;re ready.
            </Text>
          </View>

          {/* ── Plan pills ────────────────────────────────────────── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 18, alignItems: 'center' }}
            style={{ flexGrow: 0 }}
          >
            {plans.map((p) => {
              const on = p.id === selectedPlanId;
              const count = planCounts.get(p.id) ?? 0;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => handleSelectPlan(p.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 7,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 999,
                    backgroundColor: on
                      ? designTokens.colors.brand
                      : isDark
                        ? colors.surface
                        : '#FFFFFF',
                    borderWidth: 1,
                    borderColor: on
                      ? designTokens.colors.brand
                      : isDark
                        ? colors.hair
                        : '#DCD8CC',
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: on ? designTokens.font.semibold : designTokens.font.medium,
                      fontSize: 13.5,
                      letterSpacing: -0.05,
                      color: on ? '#FFFFFF' : colors.ink,
                    }}
                  >
                    {p.name}
                  </Text>
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 11,
                      fontVariant: ['tabular-nums'],
                      color: on ? 'rgba(255,255,255,0.72)' : colors.ink3,
                    }}
                  >
                    {count}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* ── Meal-type segmented bar ───────────────────────────── */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                gap: 4,
                padding: 4,
                borderRadius: 14,
                backgroundColor: colors.hair2,
              }}
            >
              {MEAL_TYPES.map((m) => {
                const on = m.id === mealFilter;
                const Icon = m.Icon;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => handleSelectMeal(m.id)}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      gap: 3,
                      paddingHorizontal: 4,
                      paddingVertical: 8,
                      borderRadius: 11,
                      backgroundColor: on ? colors.bg : 'transparent',
                      shadowColor: '#15140F',
                      shadowOpacity: on ? 0.06 : 0,
                      shadowRadius: on ? 2 : 0,
                      shadowOffset: { width: 0, height: 1 },
                      elevation: on ? 1 : 0,
                    }}
                  >
                    <Icon
                      size={15}
                      color={on ? designTokens.colors.brand : colors.ink2}
                      strokeWidth={on ? 1.8 : 1.5}
                    />
                    <Text
                      style={{
                        fontFamily: on ? designTokens.font.semibold : designTokens.font.medium,
                        fontSize: 11,
                        letterSpacing: -0.05,
                        color: on ? colors.ink : colors.ink2,
                      }}
                    >
                      {m.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Summary line ──────────────────────────────────────── */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              marginBottom: 14,
            }}
          >
            <Text style={{ fontFamily: designTokens.font.regular, fontSize: 13, color: colors.ink2 }}>
              <Text style={{ fontFamily: designTokens.font.semibold, color: colors.ink }}>
                {filtered.length}
              </Text>{' '}
              recipes
              {mealFilter !== 'all' && (
                <Text style={{ color: colors.ink3 }}> · {mealFilter}</Text>
              )}
            </Text>
            <Text
              style={{
                fontFamily: designTokens.font.serifItalic,
                fontStyle: 'italic',
                fontSize: 14,
                color: colors.ink2,
              }}
            >
              Most loved
            </Text>
          </View>

          {/* ── Masonry grid (two columns) ────────────────────────── */}
          {filtered.length === 0 ? (
            <View style={{ alignItems: 'center', paddingHorizontal: 20, paddingVertical: 32 }}>
              <Text
                style={{
                  fontFamily: designTokens.font.regular,
                  fontSize: 13.5,
                  color: colors.ink3,
                  textAlign: 'center',
                }}
              >
                No recipes match this filter. Try another meal type.
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 10 }}>
              <View style={{ flex: 1 }}>
                {leftCol.map((entry, i) => {
                  const sourceId = curatedSourceIdFor(entry);
                  const saved = !!curatedSavedMap.get(sourceId)?.isSaved;
                  return (
                    <PinCard
                      key={`${entry.planId}-${entry.key}`}
                      entry={entry}
                      saved={saved}
                      index={i * 2}
                      onPress={() => handleOpenRecipe(entry)}
                      onToggleSave={() => handleToggleSave(entry)}
                      onQuickAdd={() => handleQuickAdd(entry)}
                      colors={colors}
                    />
                  );
                })}
              </View>
              <View style={{ flex: 1 }}>
                {rightCol.map((entry, i) => {
                  const sourceId = curatedSourceIdFor(entry);
                  const saved = !!curatedSavedMap.get(sourceId)?.isSaved;
                  return (
                    <PinCard
                      key={`${entry.planId}-${entry.key}`}
                      entry={entry}
                      saved={saved}
                      index={i * 2 + 1}
                      onPress={() => handleOpenRecipe(entry)}
                      onToggleSave={() => handleToggleSave(entry)}
                      onQuickAdd={() => handleQuickAdd(entry)}
                      colors={colors}
                    />
                  );
                })}
              </View>
            </View>
          )}

          {/* ── End marker ────────────────────────────────────────── */}
          {filtered.length > 0 && (
            <View
              style={{
                marginTop: 18,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 20,
              }}
            >
              <View style={{ flex: 1, height: 1, backgroundColor: colors.hair }} />
              <Text
                style={{
                  fontFamily: designTokens.font.serifItalic,
                  fontStyle: 'italic',
                  fontSize: 13,
                  color: colors.ink2,
                }}
              >
                that&apos;s the plan
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.hair }} />
            </View>
          )}
        </Animated.ScrollView>

        {/* ── Floating "Add saved to plan" CTA ───────────────────── */}
        {savedEntries.length > 0 && (
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 24,
              alignItems: 'center',
            }}
          >
            <Pressable
              onPress={handleAddSavedToPlan}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingLeft: 12,
                paddingRight: 16,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: designTokens.colors.ink,
                shadowColor: '#15140F',
                shadowOpacity: 0.32,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 6 },
                elevation: 6,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  backgroundColor: designTokens.colors.olive,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 11,
                    fontVariant: ['tabular-nums'],
                    color: '#fff',
                  }}
                >
                  {savedEntries.length}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 13,
                  letterSpacing: -0.05,
                  color: '#FAF7F0',
                }}
              >
                Add saved to plan
              </Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>

      <StickyScreenHeader scrollY={scrollY} title="Get Inspired" onBack={handleBack} />
    </View>
  );
}
