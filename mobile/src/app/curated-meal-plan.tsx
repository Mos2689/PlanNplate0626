// Get Inspired — Pinterest-style explore feed for the full recipe library.
//
// Backed by INSPIRED_RECIPES (the 667-recipe "Get Inspired" bank, each with a
// public Supabase Storage photo). The top-right VERTICAL filter picks the
// active dimension — Meal Type · Cuisine · Dietary · Cooking Time — and the
// HORIZONTAL chip row below shows that dimension's sub-categories. Selecting a
// recipe mints a library row (deduped by curatedSourceId `inspired::<id>`),
// and the floating "Add saved to plan" CTA carries saved ids to /plan-meals.
//
// Design language: editorial header (italic "inspired"), sage primary,
// terracotta accent, hairline borders, Geist + Instrument Serif.
import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Keyboard, Dimensions, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring, interpolate, Extrapolation } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import {
  Bookmark,
  ChevronLeft,
  Clock,
  Flame,
  Plus,
  Utensils,
  Globe,
  Leaf,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import {
  StickyScreenHeader,
  useStickyHeaderScroll,
} from '@/components/StickyScreenHeader';
import { useColorScheme } from '@/lib/useColorScheme';
import { designTokens, getThemeColors, serifItalicFontStyle } from '@/lib/design-tokens';
import { INSPIRED_RECIPES, type InspiredRecipe } from '@/lib/inspired-recipe-library';
import { useMealPlanStore } from '@/lib/store';
import { inspiredToRecipe } from '@/lib/inspired-adapters';

// ───────────────────────────────────────────────────────────────────────────────
// FILTER DIMENSIONS (vertical) + their sub-categories (horizontal)
// ───────────────────────────────────────────────────────────────────────────────

type Dimension = 'meal' | 'cuisine' | 'dietary' | 'time';

const DIMENSIONS: { id: Dimension; label: string; Icon: React.ComponentType<any> }[] = [
  { id: 'meal', label: 'Meal', Icon: Utensils },
  { id: 'cuisine', label: 'Cuisine', Icon: Globe },
  { id: 'dietary', label: 'Diet', Icon: Leaf },
  { id: 'time', label: 'Time', Icon: Clock },
];

const MEAL_ORDER = ['Breakfast', 'Lunch/Dinner', 'Snack', 'Appetiser', 'Side Dish', 'Dessert', 'Drink'];
const CUISINE_ORDER = ['Italian', 'Mexican', 'Asian', 'Japanese', 'Chinese', 'Indian', 'Thai', 'Mediterranean', 'American', 'Korean', 'French', 'Greek'];
const DIETARY_ORDER = ['Vegetarian', 'Vegan', 'Pescatarian', 'Pesca', 'Gluten-Free', 'Dairy-Free', 'Keto', 'Low-Carb', 'Paleo', 'Halal', 'Kosher', 'Low-Sodium'];

// Cumulative cooking-time buckets — "≤30 min" includes everything at or under
// 30 minutes, and so on.
const TIME_BUCKETS: { label: string; max: number }[] = [
  { label: '≤15 min', max: 15 },
  { label: '≤30 min', max: 30 },
  { label: '≤60 min', max: 60 },
  { label: '≤90 min', max: 90 },
  { label: '≤120 min', max: 120 },
];

// Sub-category lists derived once from the (static) library. Each is prefixed
// with "All" and contains only values that actually appear in the data.
const SUBCATS: Record<Dimension, string[]> = (() => {
  const meals = new Set<string>();
  const cuisines = new Set<string>();
  const diets = new Set<string>();
  for (const r of INSPIRED_RECIPES) {
    meals.add(r.mealType);
    cuisines.add(r.cuisine);
    for (const d of r.dietary) if (d && d !== 'None') diets.add(d);
  }
  const ordered = (present: Set<string>, order: string[]) => [
    ...order.filter((v) => present.has(v)),
    ...[...present].filter((v) => !order.includes(v)).sort(),
  ];
  return {
    meal: ['All', ...ordered(meals, MEAL_ORDER)],
    cuisine: ['All', ...ordered(cuisines, CUISINE_ORDER)],
    dietary: ['All', ...ordered(diets, DIETARY_ORDER)],
    time: ['All', ...TIME_BUCKETS.map((b) => b.label)],
  };
})();

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

const PAGE_SIZE = 40;

// ───────────────────────────────────────────────────────────────────────────────
// CARD
// ───────────────────────────────────────────────────────────────────────────────

interface PinCardProps {
  recipe: InspiredRecipe;
  saved: boolean;
  index: number;
  onPress: () => void;
  onToggleSave: () => void;
  onQuickAdd: () => void;
  colors: ReturnType<typeof getThemeColors>;
}

function PinCard({ recipe, saved, index, onPress, onToggleSave, onQuickAdd, colors }: PinCardProps) {
  const imgH = hashHeight(recipe.id);
  const totalMin = recipe.totalMinutes;
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
                  style={{ fontFamily: designTokens.font.regular, fontSize: 11.5, color: colors.ink3 }}
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

  const recipes = useMealPlanStore((s) => s.recipes);
  const addRecipe = useMealPlanStore((s) => s.addRecipe);
  const toggleSaveRecipe = useMealPlanStore((s) => s.toggleSaveRecipe);

  const [dimension, setDimension] = useState<Dimension>('meal');
  const [subFilter, setSubFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const isSearchOpen = useSharedValue(0);
  const searchInputRef = useRef<TextInput>(null);

  // Filter dropdown (Meal · Cuisine · Dietary · Time)
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 120, right: 20 });
  const dropdownRef = useRef<View>(null);
  const activeDim = DIMENSIONS.find((d) => d.id === dimension) ?? DIMENSIONS[0];

  // Reset paging whenever the effective filter changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [dimension, subFilter, searchQuery]);

  const olive = designTokens.colors.olive;
  const brand = designTokens.colors.brand;
  const subCats = SUBCATS[dimension];

  // curatedSourceId (`inspired::<id>`) -> stored recipe meta, for saved state.
  const inspiredSavedMap = useMemo(() => {
    const m = new Map<string, { id: string; isSaved: boolean }>();
    for (const r of recipes) {
      if (r.curatedSourceId?.startsWith('inspired::')) {
        m.set(r.curatedSourceId, { id: r.id, isSaved: !!r.isSaved });
      }
    }
    return m;
  }, [recipes]);

  const savedInspired = useMemo(
    () => recipes.filter((r) => r.curatedSourceId?.startsWith('inspired::') && r.isSaved),
    [recipes],
  );

  // Filtered pool — search spans the whole library; otherwise apply the
  // active dimension + sub-category.
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q) return INSPIRED_RECIPES.filter((r) => r.name.toLowerCase().includes(q));
    if (subFilter === 'All') return INSPIRED_RECIPES;
    return INSPIRED_RECIPES.filter((r) => {
      switch (dimension) {
        case 'meal':
          return r.mealType === subFilter;
        case 'cuisine':
          return r.cuisine === subFilter;
        case 'dietary':
          return r.dietary.includes(subFilter);
        case 'time': {
          const b = TIME_BUCKETS.find((x) => x.label === subFilter);
          return b ? r.totalMinutes <= b.max : true;
        }
        default:
          return true;
      }
    });
  }, [dimension, subFilter, searchQuery]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const { leftCol, rightCol } = useMemo(() => {
    const left: InspiredRecipe[] = [];
    const right: InspiredRecipe[] = [];
    visible.forEach((r, i) => {
      if (i % 2 === 0) left.push(r);
      else right.push(r);
    });
    return { leftCol: left, rightCol: right };
  }, [visible]);

  const handleToggleSearch = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isSearchOpen.value === 1) {
      isSearchOpen.value = withSpring(0, { damping: 16, stiffness: 200 });
      setSearchQuery('');
      Keyboard.dismiss();
    } else {
      isSearchOpen.value = withSpring(1, { damping: 16, stiffness: 200 });
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isSearchOpen]);

  const screenWidth = Dimensions.get('window').width;
  const maxWidth = screenWidth - 40;
  const searchStyle = useAnimatedStyle(() => ({
    width: interpolate(isSearchOpen.value, [0, 1], [50, maxWidth], Extrapolation.CLAMP),
  }));

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router]);

  const handleSelectDimension = useCallback((d: Dimension) => {
    Haptics.selectionAsync();
    setDimension(d);
    setSubFilter('All');
  }, []);

  const openMenu = useCallback(() => {
    Haptics.selectionAsync();
    const node = dropdownRef.current as unknown as { measureInWindow?: Function } | null;
    if (node?.measureInWindow) {
      node.measureInWindow((x: number, y: number, w: number, h: number) => {
        setMenuPos({ top: y + h + 6, right: Math.max(12, screenWidth - (x + w)) });
        setMenuOpen(true);
      });
    } else {
      setMenuOpen(true);
    }
  }, [screenWidth]);

  const handleSelectSub = useCallback((s: string) => {
    Haptics.selectionAsync();
    setSubFilter(s);
  }, []);

  const handleOpenRecipe = useCallback(
    (r: InspiredRecipe) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      let id = inspiredSavedMap.get(`inspired::${r.id}`)?.id;
      if (!id) id = addRecipe(inspiredToRecipe(r, false));
      // Pass the stable curatedSourceId too: addRecipe swaps the temp id for a
      // real DB id async, so `id` can go stale before recipe-detail resolves it.
      router.push({
        pathname: '/recipe-detail',
        // readOnly: this is the library preview — recipe-detail hides edit/
        // delete and always renders the pristine library version (never a
        // personal edited copy).
        params: { id, sourceId: `inspired::${r.id}`, readOnly: '1' },
      } as any);
    },
    [inspiredSavedMap, addRecipe, router],
  );

  const handleToggleSave = useCallback(
    (r: InspiredRecipe) => {
      const existing = inspiredSavedMap.get(`inspired::${r.id}`);
      if (existing) {
        toggleSaveRecipe(existing.id);
      } else {
        addRecipe(inspiredToRecipe(r, true));
      }
    },
    [inspiredSavedMap, toggleSaveRecipe, addRecipe],
  );

  const handleQuickAdd = useCallback(
    (r: InspiredRecipe) => {
      let id = inspiredSavedMap.get(`inspired::${r.id}`)?.id;
      if (!id) id = addRecipe(inspiredToRecipe(r, false));
      router.push({
        pathname: '/select-recipe',
        params: { recipeId: id, mode: 'add-to-plan', sourceId: `inspired::${r.id}` },
      } as any);
    },
    [inspiredSavedMap, addRecipe, router],
  );

  const handleAddSavedToPlan = useCallback(() => {
    const ids = savedInspired.map((r) => r.id);
    if (ids.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: '/plan-meals', params: { savedRecipeIds: ids.join(',') } } as any);
  }, [savedInspired, router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <Animated.ScrollView
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 600) {
                setVisibleCount((c) => (c < filtered.length ? c + PAGE_SIZE : c));
              }
            }}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Back button */}
            <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 }}>
              <Pressable onPress={handleBack} hitSlop={10} style={{ width: 40, height: 40 }}>
                {({ pressed }) => (
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.hair,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: pressed ? colors.hair2 : 'transparent',
                    }}
                  >
                    <ChevronLeft size={22} color={colors.ink} strokeWidth={1.8} />
                  </View>
                )}
              </Pressable>
            </View>

            {/* ── Header: title block (left) + vertical filter (right) ── */}
            <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
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
                        fontStyle: serifItalicFontStyle,
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

                {/* Filter dropdown (Meal · Cuisine · Dietary · Time) */}
                <Pressable
                  ref={dropdownRef}
                  onPress={openMenu}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingLeft: 14,
                    paddingRight: 10,
                    paddingVertical: 9,
                    borderRadius: 999,
                    backgroundColor: olive,
                    borderWidth: 1,
                    borderColor: olive,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 13,
                      letterSpacing: -0.05,
                      color: '#fff',
                    }}
                  >
                    {activeDim.label}
                  </Text>
                  {menuOpen ? (
                    <ChevronUp size={15} color="rgba(255,255,255,0.9)" strokeWidth={2.2} />
                  ) : (
                    <ChevronDown size={15} color="rgba(255,255,255,0.9)" strokeWidth={2.2} />
                  )}
                </Pressable>
              </View>
            </View>

            {/* ── Horizontal sub-category chips (for active dimension) ── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingTop: 18, paddingBottom: 16, alignItems: 'center' }}
              style={{ flexGrow: 0 }}
            >
              {subCats.map((sc) => {
                const on = sc === subFilter;
                return (
                  <Pressable
                    key={sc}
                    onPress={() => handleSelectSub(sc)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 999,
                      backgroundColor: on ? brand : isDark ? colors.surface : '#FFFFFF',
                      borderWidth: 1,
                      borderColor: on ? brand : isDark ? colors.hair : '#DCD8CC',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: on ? designTokens.font.semibold : designTokens.font.medium,
                        fontSize: 13,
                        letterSpacing: -0.05,
                        color: on ? '#FFFFFF' : colors.ink,
                      }}
                    >
                      {sc}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* ── Summary line ── */}
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
                {subFilter !== 'All' && !searchQuery && <Text style={{ color: colors.ink3 }}> · {subFilter}</Text>}
              </Text>
              <Text
                style={{
                  fontFamily: designTokens.font.serifItalic,
                  fontStyle: serifItalicFontStyle,
                  fontSize: 14,
                  color: colors.ink2,
                }}
              >
                Most loved
              </Text>
            </View>

            {/* ── Masonry grid ── */}
            {filtered.length === 0 ? (
              <View style={{ alignItems: 'center', paddingHorizontal: 20, paddingVertical: 32 }}>
                <Text
                  style={{ fontFamily: designTokens.font.regular, fontSize: 13.5, color: colors.ink3, textAlign: 'center' }}
                >
                  No recipes match this filter. Try another one.
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 10 }}>
                <View style={{ flex: 1 }}>
                  {leftCol.map((r, i) => (
                    <PinCard
                      key={r.id}
                      recipe={r}
                      saved={!!inspiredSavedMap.get(`inspired::${r.id}`)?.isSaved}
                      index={i * 2}
                      onPress={() => handleOpenRecipe(r)}
                      onToggleSave={() => handleToggleSave(r)}
                      onQuickAdd={() => handleQuickAdd(r)}
                      colors={colors}
                    />
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  {rightCol.map((r, i) => (
                    <PinCard
                      key={r.id}
                      recipe={r}
                      saved={!!inspiredSavedMap.get(`inspired::${r.id}`)?.isSaved}
                      index={i * 2 + 1}
                      onPress={() => handleOpenRecipe(r)}
                      onToggleSave={() => handleToggleSave(r)}
                      onQuickAdd={() => handleQuickAdd(r)}
                      colors={colors}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* ── End marker ── */}
            {filtered.length > 0 && visibleCount >= filtered.length && (
              <View
                style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 }}
              >
                <View style={{ flex: 1, height: 1, backgroundColor: colors.hair }} />
                <Text
                  style={{
                    fontFamily: designTokens.font.serifItalic,
                    fontStyle: serifItalicFontStyle,
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

          {/* ── Floating "Add saved to plan" CTA ── */}
          {savedInspired.length > 0 && (
            <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 24, alignItems: 'center' }}>
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
                    {savedInspired.length}
                  </Text>
                </View>
                <Text style={{ fontFamily: designTokens.font.medium, fontSize: 13, letterSpacing: -0.05, color: '#FAF7F0' }}>
                  Add saved to plan
                </Text>
              </Pressable>
            </View>
          )}

          {/* ── Floating Search Bar ── */}
          <Animated.View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              right: 20,
              bottom: savedInspired.length > 0 ? 80 : 24,
              alignItems: 'flex-end',
              zIndex: 10,
            }}
          >
            <Animated.View
              style={[
                {
                  height: 50,
                  borderRadius: 25,
                  backgroundColor: isDark ? colors.surface : '#FFFFFF',
                  shadowColor: '#15140F',
                  shadowOpacity: 0.2,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 6,
                  flexDirection: 'row',
                  alignItems: 'center',
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: isDark ? colors.hair : '#EAEAEA',
                },
                searchStyle,
              ]}
            >
              <Pressable
                onPress={handleToggleSearch}
                style={{ width: 50, height: 50, alignItems: 'center', justifyContent: 'center' }}
              >
                <Search size={20} color={colors.ink} strokeWidth={2} />
              </Pressable>
              <TextInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search recipes..."
                placeholderTextColor={colors.ink3}
                style={{
                  flex: 1,
                  height: '100%',
                  fontFamily: designTokens.font.medium,
                  fontSize: 15,
                  color: colors.ink,
                }}
              />
              {searchQuery.length > 0 && (
                <Pressable
                  onPress={() => setSearchQuery('')}
                  style={{ paddingHorizontal: 16, height: '100%', justifyContent: 'center' }}
                >
                  <X size={18} color={colors.ink3} strokeWidth={2} />
                </Pressable>
              )}
            </Animated.View>
          </Animated.View>
        </SafeAreaView>
      </KeyboardAvoidingView>

      <StickyScreenHeader scrollY={scrollY} title="Get Inspired" onBack={handleBack} />

      {/* Filter dropdown menu */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(21,20,15,0.14)' }}
          onPress={() => setMenuOpen(false)}
        >
          {/* Shadow layer — no overflow:hidden so the drop shadow renders on
              iOS. */}
          <View
            style={{
              position: 'absolute',
              top: menuPos.top,
              right: menuPos.right,
              width: 184,
              backgroundColor: isDark ? colors.surface : '#FFFFFF',
              borderRadius: 16,
              shadowColor: '#15140F',
              shadowOpacity: 0.22,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: 12 },
              elevation: 16,
            }}
          >
            {/* Clip layer — rounds the row highlights to the card corners. */}
            <View
              style={{
                borderRadius: 16,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: isDark ? colors.hair : '#ECE8DE',
                backgroundColor: isDark ? colors.surface : '#FFFFFF',
              }}
            >
              {DIMENSIONS.map((d, idx) => {
                const on = d.id === dimension;
                return (
                  <Pressable
                    key={d.id}
                    onPress={() => {
                      setMenuOpen(false);
                      handleSelectDimension(d.id);
                    }}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 16,
                      paddingVertical: 13,
                      borderTopWidth: idx === 0 ? 0 : 1,
                      borderTopColor: isDark ? colors.hair : '#F1EEE6',
                      backgroundColor: pressed
                        ? isDark
                          ? colors.hair2
                          : '#F6F3EC'
                        : on
                        ? isDark
                          ? 'rgba(228,109,70,0.12)'
                          : 'rgba(228,109,70,0.08)'
                        : 'transparent',
                    })}
                  >
                    <Text
                      allowFontScaling={false}
                      numberOfLines={1}
                      style={{
                        fontFamily: on ? designTokens.font.semibold : designTokens.font.medium,
                        fontSize: 15,
                        letterSpacing: -0.15,
                        color: on ? colors.ink : colors.ink2,
                      }}
                    >
                      {d.label}
                    </Text>
                    {on ? (
                      <Check size={16} color={olive} strokeWidth={2.6} style={{ marginLeft: 8, flexShrink: 0 }} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
