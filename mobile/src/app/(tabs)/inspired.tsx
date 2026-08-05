// Get Inspired — explore feed for the full recipe library.
//
// Backed by INSPIRED_RECIPES (each with a public Supabase Storage photo). The
// page is organised as: Trending now (placeholder top-10, to be curated) →
// Browse by category (meal-type circles) → Find what you need (quick-filter
// tiles) → All recipes (the masonry grid, filtered by the active category or
// quick filter, or by search). Selecting a recipe mints a library row (deduped
// by curatedSourceId `inspired::<id>`), and the floating "Add saved to plan"
// CTA carries saved ids to /plan-meals.
//
// Design language: editorial header (italic "Inspired"), sage primary,
// terracotta accent, hairline borders, Geist + Instrument Serif.
import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Keyboard, Dimensions, KeyboardAvoidingView, Platform, Modal, InteractionManager } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withSpring, interpolate, Extrapolation, useAnimatedRef } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import {
  Bookmark,
  Clock,
  Flame,
  Plus,
  Leaf,
  Search,
  X,
  Wallet,
  Dumbbell,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { DishImage } from '@/components/DishImage';
import { LinearGradient } from 'expo-linear-gradient';
import {
  StickyScreenHeader,
  useStickyHeaderScroll,
} from '@/components/StickyScreenHeader';
import { useColorScheme } from '@/lib/useColorScheme';
import { designTokens, getThemeColors, serifItalicFontStyle } from '@/lib/design-tokens';
import { t } from '@/lib/platform-tokens';
import { INSPIRED_RECIPES, type InspiredRecipe } from '@/lib/inspired-recipe-library';
import { useMealPlanStore } from '@/lib/store';
import { inspiredToRecipe } from '@/lib/inspired-adapters';
import { buildTrendingRecipes } from '@/lib/inspired-trending';
import { prefetchRecipeImages } from '@/lib/image-prefetch';

// ───────────────────────────────────────────────────────────────────────────────
// BROWSE-BY-CATEGORY (meal type) + QUICK FILTERS + TRENDING placeholders
// ───────────────────────────────────────────────────────────────────────────────

// The library stores lunch & dinner in a single "Lunch/Dinner" bucket (they
// share the same recipes), so it's shown as one category.
const CATEGORY_LABELS = [
  'All', 'Breakfast', 'Lunch/Dinner', 'Snack', 'Appetiser', 'Side Dish', 'Dessert', 'Drink',
] as const;
type CategoryLabel = (typeof CATEGORY_LABELS)[number];

function categoryMealType(label: CategoryLabel): string | null {
  if (label === 'All') return null;
  return label;
}

// Representative thumbnail for each category circle — first library recipe of
// that meal type (falls back to the very first recipe).
const CATEGORY_IMAGE: Record<CategoryLabel, string> = (() => {
  const pick = (mt: string | null) =>
    (mt ? INSPIRED_RECIPES.find((r) => r.mealType === mt) : INSPIRED_RECIPES[0])?.imageUrl ??
    INSPIRED_RECIPES[0]?.imageUrl ??
    '';
  const out = {} as Record<CategoryLabel, string>;
  for (const l of CATEGORY_LABELS) out[l] = pick(categoryMealType(l));
  return out;
})();

// ── "Find what you need" quick filters ──
type QuickId = 'under30' | 'budget' | 'vegetarian' | 'highprotein';

const HIGH_PROTEIN_RE =
  /chicken|beef|steak|egg|tofu|lentil|bean|chickpea|salmon|tuna|turkey|paneer|prawn|shrimp|pork|lamb|greek yogurt|cottage cheese|protein|edamame|quinoa/i;

function matchesQuick(r: InspiredRecipe, id: QuickId): boolean {
  switch (id) {
    case 'under30':
      return r.totalMinutes > 0 && r.totalMinutes <= 30;
    case 'budget':
      // Placeholder heuristic until a real "budget" signal exists: quick,
      // everyday recipes (≤45 min). Refine when tagged.
      return r.totalMinutes > 0 && r.totalMinutes <= 45;
    case 'vegetarian':
      return r.dietary.includes('Vegetarian');
    case 'highprotein':
      // Placeholder heuristic — matches protein-forward names until tagged.
      return HIGH_PROTEIN_RE.test(r.name);
  }
}

const QUICK_TILES: {
  id: QuickId;
  title: string;
  Icon: React.ComponentType<any>;
  bg: string;
  bgDark: string;
  fg: string;
}[] = [
  { id: 'under30', title: 'Under 30 mins', Icon: Clock, bg: '#F7E7E4', bgDark: '#33211d', fg: '#C2543A' },
  { id: 'budget', title: 'Budget friendly', Icon: Wallet, bg: '#FAF0D8', bgDark: '#332b1a', fg: '#C08A2E' },
  { id: 'vegetarian', title: 'Vegetarian', Icon: Leaf, bg: '#E9F0DE', bgDark: '#20291b', fg: '#5C7A3F' },
  { id: 'highprotein', title: 'High protein', Icon: Dumbbell, bg: '#EAE6F3', bgDark: '#26232f', fg: '#6E5FA6' },
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

const PAGE_SIZE = 40;

// ───────────────────────────────────────────────────────────────────────────────
// CARD
// ───────────────────────────────────────────────────────────────────────────────

interface PinCardProps {
  recipe: InspiredRecipe;
  saved: boolean;
  index: number;
  onPress: (recipe: InspiredRecipe) => void;
  onToggleSave: (recipe: InspiredRecipe) => void;
  onQuickAdd: (recipe: InspiredRecipe) => void;
  colors: ReturnType<typeof getThemeColors>;
}

// Memoized: the masonry renders up to PAGE_SIZE (40) of these at a time, and
// every one of them used to re-render whenever the screen's search text, filter
// chips or pagination count changed. Handlers now take the recipe instead of
// being pre-bound per item, so their identity is stable across renders, and
// `colors` is a hoisted constant (see lib/design-tokens.ts) rather than a fresh
// object — both are required for the memo to actually hold.
function PinCardImpl({ recipe, saved, index, onPress, onToggleSave, onQuickAdd, colors }: PinCardProps) {
  const handlePress = useCallback(() => onPress(recipe), [onPress, recipe]);
  const handleToggleSave = useCallback(() => onToggleSave(recipe), [onToggleSave, recipe]);
  const handleQuickAdd = useCallback(() => onQuickAdd(recipe), [onQuickAdd, recipe]);
  const imgH = hashHeight(recipe.id);
  const totalMin = recipe.totalMinutes;
  const calories = recipe.calories ?? 0;

  return (
    <Animated.View
      entering={FadeInUp.delay(Math.min(index * 40, 360)).springify()}
      style={{ marginBottom: 10 }}
    >
      <Pressable
        onPress={handlePress}
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
          <DishImage
            url={recipe.imageUrl}
            blurhash={recipe.blurhash}
            width={340}
            style={{ width: '100%', height: '100%' }}
            transition={150}
            recyclingKey={recipe.id}
          />

          {/* Save / bookmark */}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handleToggleSave();
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

          {/* Quick add to meal plan — sage button, matches Your Recipes grid. */}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handleQuickAdd();
            }}
            hitSlop={8}
            style={{
              position: 'absolute',
              right: 8,
              bottom: 8,
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: designTokens.colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 5,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
            }}
          >
            <Plus size={17} color="#FFFFFF" strokeWidth={2.4} />
          </Pressable>
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
          {calories > 0 && (
            <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Flame size={11} color={colors.ink3} strokeWidth={1.7} />
              <Text
                style={{ fontFamily: designTokens.font.regular, fontSize: 11.5, color: colors.ink3 }}
              >
                {calories} cal
              </Text>
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const PinCard = React.memo(PinCardImpl);

// ───────────────────────────────────────────────────────────────────────────────
// SECTION PIECES — Trending card · Category circle · Quick tile · Section header
// ───────────────────────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  action,
  onAction,
  colors,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  colors: ReturnType<typeof getThemeColors>;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginBottom: 12,
      }}
    >
      <Text
        style={{
          fontFamily: designTokens.font.semibold,
          fontSize: 17,
          letterSpacing: -0.3,
          color: colors.ink,
        }}
      >
        {title}
      </Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={{ fontFamily: designTokens.font.medium, fontSize: 13, color: designTokens.colors.olive }}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Same treatment as PinCard: takes the recipe so the screen can hand it a
// stable useCallback instead of a per-item arrow, then memoized.
function TrendingCardImpl({
  recipe,
  onPress,
}: {
  recipe: InspiredRecipe;
  onPress: (recipe: InspiredRecipe) => void;
}) {
  const handlePress = useCallback(() => onPress(recipe), [onPress, recipe]);
  return (
    <Pressable onPress={handlePress} style={{ width: 150, marginRight: 12 }}>
      <View
        style={{
          width: 150,
          height: 190,
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: '#F4F0E8',
        }}
      >
        <DishImage
          url={recipe.imageUrl}
          blurhash={recipe.blurhash}
          width={340}
          style={{ width: '100%', height: '100%' }}
          transition={150}
          recyclingKey={recipe.id}
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.75)']}
          locations={[0.42, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          pointerEvents="none"
        />
        <View style={{ position: 'absolute', left: 10, right: 10, bottom: 10 }}>
          <Text
            numberOfLines={2}
            style={{ fontFamily: designTokens.font.semibold, fontSize: 14, color: '#fff', letterSpacing: -0.2 }}
          >
            {recipe.name}
          </Text>
          {recipe.totalMinutes > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 }}>
              <Clock size={11} color="rgba(255,255,255,0.9)" strokeWidth={2} />
              <Text style={{ fontFamily: designTokens.font.medium, fontSize: 11, color: 'rgba(255,255,255,0.9)' }}>
                {recipe.totalMinutes} min
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const TrendingCard = React.memo(TrendingCardImpl);

function CategoryCircle({
  label,
  image,
  active,
  onPress,
  colors,
}: {
  label: string;
  image: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof getThemeColors>;
}) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', width: 72, marginRight: 4 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          overflow: 'hidden',
          borderWidth: 2,
          borderColor: active ? designTokens.colors.brand : 'transparent',
          backgroundColor: '#F4F0E8',
        }}
      >
        <DishImage url={image} width={150} style={{ width: '100%', height: '100%' }} transition={150} recyclingKey={image} />
      </View>
      <Text
        numberOfLines={1}
        style={{
          marginTop: 6,
          fontFamily: active ? designTokens.font.semibold : designTokens.font.medium,
          fontSize: 12,
          color: active ? colors.ink : colors.ink2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function QuickTile({
  tile,
  count,
  active,
  onPress,
  isDark,
  colors,
}: {
  tile: (typeof QUICK_TILES)[number];
  count: number;
  active: boolean;
  onPress: () => void;
  isDark: boolean;
  colors: ReturnType<typeof getThemeColors>;
}) {
  const { Icon } = tile;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 16,
        borderRadius: 16,
        backgroundColor: isDark ? tile.bgDark : tile.bg,
        borderWidth: active ? 1.5 : 0,
        borderColor: tile.fg,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: designTokens.font.semibold, fontSize: 14.5, letterSpacing: -0.2, color: colors.ink }}
        >
          {tile.title}
        </Text>
        <Text style={{ marginTop: 3, fontFamily: designTokens.font.regular, fontSize: 12, color: colors.ink2 }}>
          {count} recipes
        </Text>
      </View>
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={16} color={tile.fg} strokeWidth={2} />
      </View>
    </Pressable>
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
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  const recipes = useMealPlanStore((s) => s.recipes);
  const mealSlots = useMealPlanStore((s) => s.mealSlots);
  const addRecipe = useMealPlanStore((s) => s.addRecipe);
  const deleteRecipe = useMealPlanStore((s) => s.deleteRecipe);
  const preferences = useMealPlanStore((s) => s.preferences);

  // Multi-select filters. `categories` empty = "All" meal types; recipes match
  // ANY selected category (OR). `quickFilters` narrow further — a recipe must
  // match ALL selected quick filters (AND). The two groups combine (AND).
  const [categories, setCategories] = useState<CategoryLabel[]>([]);
  const [quickFilters, setQuickFilters] = useState<QuickId[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const isSearchOpen = useSharedValue(0);
  // React mirror of isSearchOpen (a shared value can't drive JSX conditionals):
  // when true the search bar is pinned to the top and browse chrome collapses.
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  // Reset paging whenever the effective filter changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [categories, quickFilters, searchQuery]);

  // Live counts for the "Find what you need" tiles.
  const quickCounts = useMemo(
    () => ({
      under30: INSPIRED_RECIPES.filter((r) => matchesQuick(r, 'under30')).length,
      budget: INSPIRED_RECIPES.filter((r) => matchesQuick(r, 'budget')).length,
      vegetarian: INSPIRED_RECIPES.filter((r) => matchesQuick(r, 'vegetarian')).length,
      highprotein: INSPIRED_RECIPES.filter((r) => matchesQuick(r, 'highprotein')).length,
    }),
    [],
  );

  // curatedSourceId (`inspired::<id>`) -> stored recipe id. Presence means the
  // recipe is saved to the user's library; the bookmark reflects this (NOT the
  // favourite flag).
  const inspiredSavedMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of recipes) {
      if (r.curatedSourceId?.startsWith('inspired::')) {
        m.set(r.curatedSourceId, r.id);
      }
    }
    return m;
  }, [recipes]);

  // Recipes the user has saved to their library from Get Inspired. A row exists
  // only when the user explicitly bookmarked it or placed it in a plan — mere
  // browsing no longer persists (see handleOpenRecipe). So library membership,
  // not the favourite flag (isSaved), is the "saved" signal here.
  const savedInspired = useMemo(
    () => recipes.filter((r) => r.curatedSourceId?.startsWith('inspired::')),
    [recipes],
  );

  // "Trending now" — personalised, day-rotating pick from the inspired bank
  // (allergen/diet-safe, preference- and time-of-day-weighted). Recomputed once
  // per day/hour bucket, not on every render, via `trendingClock`.
  const savedInspiredIds = useMemo(
    () =>
      new Set(
        savedInspired
          .map((r) => r.curatedSourceId?.slice('inspired::'.length))
          .filter((id): id is string => !!id),
      ),
    [savedInspired],
  );
  const trendingClock = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
  }, []);
  const trending = useMemo(
    () =>
      buildTrendingRecipes({
        recipes: INSPIRED_RECIPES,
        preferences,
        savedInspiredIds,
        now: new Date(),
        limit: 10,
      }),
    // trendingClock keeps the pick stable within an hour bucket; preferences and
    // saved set changes refresh it immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preferences, savedInspiredIds, trendingClock],
  );

  // Filtered pool — search wins outright. Otherwise combine the two filter
  // groups: match ANY selected category (OR) AND ALL selected quick filters (AND).
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q)
      // Match on recipe name OR any ingredient name, so searching "chicken"
      // or "basil" surfaces recipes that use it, not just ones named for it.
      return INSPIRED_RECIPES.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.ingredients.some((ing) => ing.name.toLowerCase().includes(q)),
      );
    const mealTypes = new Set(
      categories.map(categoryMealType).filter((mt): mt is string => !!mt),
    );
    if (mealTypes.size === 0 && quickFilters.length === 0) return INSPIRED_RECIPES;
    return INSPIRED_RECIPES.filter((r) => {
      if (mealTypes.size > 0 && !mealTypes.has(r.mealType)) return false;
      for (const qf of quickFilters) if (!matchesQuick(r, qf)) return false;
      return true;
    });
  }, [categories, quickFilters, searchQuery]);

  // Human label describing the current pool (for the "All recipes" heading).
  const poolLabel = useMemo(() => {
    const parts = [
      ...categories,
      ...quickFilters.map((id) => QUICK_TILES.find((t) => t.id === id)?.title ?? ''),
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'All recipes';
  }, [categories, quickFilters]);

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

  // Warm the NEXT page's photos while the user reads the current one, at the
  // same width PinCard renders (340), so the cards below the fold are already
  // cached by the time scrolling reaches them. Bounded to one page — this is a
  // 736-recipe library and warming all of it would saturate the connection and
  // starve the images actually on screen. Deferred off the render pass.
  useEffect(() => {
    const nextPage = filtered
      .slice(visibleCount, visibleCount + PAGE_SIZE)
      .map((r) => r.imageUrl);
    if (nextPage.length === 0) return;
    const task = InteractionManager.runAfterInteractions(() => {
      prefetchRecipeImages(nextPage, { width: 340, limit: PAGE_SIZE });
    });
    return () => task.cancel();
  }, [filtered, visibleCount]);

  const handleToggleSearch = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isSearchOpen.value === 1) {
      isSearchOpen.value = withSpring(0, { damping: 16, stiffness: 200 });
      setSearchExpanded(false);
      setSearchQuery('');
      Keyboard.dismiss();
    } else {
      isSearchOpen.value = withSpring(1, { damping: 16, stiffness: 200 });
      setSearchExpanded(true);
      // Jump to the top so the results are visible under the pinned search bar.
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isSearchOpen, scrollRef]);

  const screenWidth = Dimensions.get('window').width;
  const maxWidth = screenWidth - 40;
  const searchStyle = useAnimatedStyle(() => ({
    width: interpolate(isSearchOpen.value, [0, 1], [50, maxWidth], Extrapolation.CLAMP),
  }));

  // Tapping "All" clears the category selection (shows every meal type);
  // tapping a specific category toggles it in/out of the multi-select.
  const handleSelectCategory = useCallback((label: CategoryLabel) => {
    Haptics.selectionAsync();
    if (label === 'All') {
      setCategories([]);
      return;
    }
    setCategories((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  }, []);

  const handleSelectQuick = useCallback((id: QuickId) => {
    Haptics.selectionAsync();
    setQuickFilters((prev) => (prev.includes(id) ? prev.filter((q) => q !== id) : [...prev, id]));
  }, []);

  const handleOpenRecipe = useCallback(
    (r: InspiredRecipe) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Read-only preview — do NOT persist a row just to view. recipe-detail
      // renders the pristine library entry from sourceId, and materializes a
      // real recipe on demand (favourite / add-to-plan). Pass the existing id
      // only if the user has already saved this recipe.
      const existingId = inspiredSavedMap.get(`inspired::${r.id}`);
      router.push({
        pathname: '/recipe-detail',
        params: {
          ...(existingId ? { id: existingId } : {}),
          sourceId: `inspired::${r.id}`,
          readOnly: '1',
        },
      } as any);
    },
    [inspiredSavedMap, router],
  );

  // The bookmark saves a recipe to the user's library WITHOUT favouriting it.
  // isSaved (the favourite flag) is left false; "saved" here means the recipe
  // has a library row. Tapping again removes it — but if the recipe is used in
  // a meal plan we keep the row so the plan keeps working (a hard delete would
  // orphan the slot).
  const handleToggleSave = useCallback(
    (r: InspiredRecipe) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const existingId = inspiredSavedMap.get(`inspired::${r.id}`);
      if (existingId) {
        const usedInPlan = mealSlots.some((s) => s.recipeId === existingId);
        if (!usedInPlan) deleteRecipe(existingId);
      } else {
        addRecipe(inspiredToRecipe(r, false));
      }
    },
    [inspiredSavedMap, mealSlots, deleteRecipe, addRecipe],
  );

  const handleQuickAdd = useCallback(
    (r: InspiredRecipe) => {
      let id = inspiredSavedMap.get(`inspired::${r.id}`);
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
            ref={scrollRef}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 600) {
                setVisibleCount((c) => (c < filtered.length ? c + PAGE_SIZE : c));
              }
            }}
            contentContainerStyle={{ paddingTop: searchExpanded ? 70 : 8, paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Get Inspired is a top-level tab — no back button. */}

            {/* ── Header: title block. Hidden while the search bar is pinned to
                the top so the two don't overlap. ── */}
            {!searchExpanded && (
            <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: t(28, 24),
                    letterSpacing: t(-0.56, -0.4),
                    color: colors.ink,
                    lineHeight: t(40, 34),
                  }}
                >
                  Get{' '}
                </Text>
                <Text
                  style={{
                    fontFamily: designTokens.font.serifItalic,
                    fontStyle: serifItalicFontStyle,
                    fontSize: t(32, 28),
                    letterSpacing: t(-0.64, -0.5),
                    color: colors.ink,
                    lineHeight: t(40, 34),
                  }}
                >
                  Inspired
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
            )}

            {/* ── Trending now — hidden while searching so results surface first ── */}
            {!searchExpanded && (
            <View style={{ marginTop: 22 }}>
              <SectionHeader title="Trending now" colors={colors} />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4 }}
                style={{ flexGrow: 0 }}
              >
                {trending.map((r) => (
                  <TrendingCard key={r.id} recipe={r} onPress={handleOpenRecipe} />
                ))}
              </ScrollView>
            </View>
            )}

            {/* ── Find what you need (quick filters) — hidden while searching ── */}
            {!searchExpanded && (
            <View style={{ marginTop: 26 }}>
              <SectionHeader title="Find what you need" colors={colors} />
              <View style={{ paddingHorizontal: 20, gap: 12 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <QuickTile
                    tile={QUICK_TILES[0]}
                    count={quickCounts.under30}
                    active={quickFilters.includes('under30')}
                    onPress={() => handleSelectQuick('under30')}
                    isDark={isDark}
                    colors={colors}
                  />
                  <QuickTile
                    tile={QUICK_TILES[1]}
                    count={quickCounts.budget}
                    active={quickFilters.includes('budget')}
                    onPress={() => handleSelectQuick('budget')}
                    isDark={isDark}
                    colors={colors}
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <QuickTile
                    tile={QUICK_TILES[2]}
                    count={quickCounts.vegetarian}
                    active={quickFilters.includes('vegetarian')}
                    onPress={() => handleSelectQuick('vegetarian')}
                    isDark={isDark}
                    colors={colors}
                  />
                  <QuickTile
                    tile={QUICK_TILES[3]}
                    count={quickCounts.highprotein}
                    active={quickFilters.includes('highprotein')}
                    onPress={() => handleSelectQuick('highprotein')}
                    isDark={isDark}
                    colors={colors}
                  />
                </View>
              </View>
            </View>
            )}

            {/* ── Browse by category (meal type) — hidden while searching ── */}
            {!searchExpanded && (
            <View style={{ marginTop: 26 }}>
              <SectionHeader
                title="Browse by category"
                action="View all"
                onAction={() => handleSelectCategory('All')}
                colors={colors}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4 }}
                style={{ flexGrow: 0 }}
              >
                {CATEGORY_LABELS.map((label) => (
                  <CategoryCircle
                    key={label}
                    label={label}
                    image={CATEGORY_IMAGE[label]}
                    active={label === 'All' ? categories.length === 0 : categories.includes(label)}
                    onPress={() => handleSelectCategory(label)}
                    colors={colors}
                  />
                ))}
              </ScrollView>
            </View>
            )}

            {/* ── All recipes (full library, filtered by the selections above) ── */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                marginTop: 30,
                marginBottom: 14,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  marginRight: 10,
                  fontFamily: designTokens.font.semibold,
                  fontSize: 17,
                  letterSpacing: -0.3,
                  color: colors.ink,
                }}
              >
                {searchQuery ? 'Results' : poolLabel}
              </Text>
              <Text style={{ fontFamily: designTokens.font.regular, fontSize: 13, color: colors.ink2 }}>
                <Text style={{ fontFamily: designTokens.font.semibold, color: colors.ink }}>{filtered.length}</Text> recipes
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
                      saved={inspiredSavedMap.has(`inspired::${r.id}`)}
                      index={i * 2}
                      onPress={handleOpenRecipe}
                      onToggleSave={handleToggleSave}
                      onQuickAdd={handleQuickAdd}
                      colors={colors}
                    />
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  {rightCol.map((r, i) => (
                    <PinCard
                      key={r.id}
                      recipe={r}
                      saved={inspiredSavedMap.has(`inspired::${r.id}`)}
                      index={i * 2 + 1}
                      onPress={handleOpenRecipe}
                      onToggleSave={handleToggleSave}
                      onQuickAdd={handleQuickAdd}
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

          {/* ── Search bar — a floating FAB at the bottom when closed; pinned to
              the top (full width) once opened so it doesn't drift to the centre
              when the keyboard appears. ── */}
          <Animated.View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 20,
              right: 20,
              top: searchExpanded ? insets.top + 8 : undefined,
              bottom: searchExpanded ? undefined : savedInspired.length > 0 ? 80 : 24,
              alignItems: searchExpanded ? 'stretch' : 'flex-end',
              zIndex: 20,
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

      <StickyScreenHeader scrollY={scrollY} title="Get Inspired" />

    </View>
  );
}
