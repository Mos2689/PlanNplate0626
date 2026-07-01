// RecipesScreen — PlannPlate Recipes design language
// (Geist + Instrument Serif italic, sage #546445, terracotta #E46D46, hair borders).
// Visual-only redesign — every store read, callback, route, and side effect
// from the previous implementation is preserved.
import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, FlatList } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Search,
  Plus,
  Clock,
  Flame,
  Heart,
  ChefHat,
  CookingPot,
  X,
  Download,
  Link as LinkIcon,
  Users,
  Copy,
  ChevronDown,
  CalendarPlus,
  Globe,
  Pencil,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  Layout,
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useMealPlanStore, type Recipe } from '@/lib/store';
import { useColorScheme } from '@/lib/useColorScheme';
import { designTokens, getThemeColors } from '@/lib/design-tokens';
import { CURATED_MEAL_PLANS } from '@/lib/curated-meal-plans';
import { DuplicateRecipeModal, findDuplicateGroups } from '@/components/DuplicateRecipeModal';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
] as const;

// Pre-built reverse map: sourceId override (e.g. "R7-leftover") → plan name.
// Covers sub-plan recipes that use a short sourceId instead of "planId::slug".
const CURATED_OVERRIDE_TO_PLAN_NAME = (() => {
  const map = new Map<string, string>();
  for (const plan of CURATED_MEAL_PLANS) {
    for (const meal of plan.meals) {
      const sourceId = (meal.recipe as any)?.sourceId as string | undefined;
      if (sourceId) map.set(sourceId, plan.name);
    }
  }
  return map;
})();

// ── Source badge ──────────────────────────────────────────────────────
function SourceBadge({ recipe }: { recipe: Recipe }) {
  let label: string;
  let textColor: string;
  let bgColor: string;
  let icon: React.ReactNode = null;

  if (recipe.isAIGenerated) {
    label = 'PnP';
    textColor = designTokens.colors.brand;
    bgColor = 'rgba(84,100,69,0.10)';
    icon = <ChefHat size={9} color={textColor} strokeWidth={2} />;
  } else if (recipe.isImported) {
    label = 'Social';
    textColor = '#5B7FA6';
    bgColor = 'rgba(91,127,166,0.10)';
    icon = <Globe size={9} color={textColor} strokeWidth={2} />;
  } else if (recipe.curatedSourceId) {
    const planId = recipe.curatedSourceId.split('::')[0];
    const plan = CURATED_MEAL_PLANS.find((p) => p.id === planId);
    label = plan?.name ?? CURATED_OVERRIDE_TO_PLAN_NAME.get(recipe.curatedSourceId) ?? 'Curated';
    textColor = designTokens.colors.brand;
    bgColor = 'rgba(84,100,69,0.10)';
    icon = <CookingPot size={9} color={textColor} strokeWidth={2} />;
  } else {
    label = 'By You';
    textColor = designTokens.colors.ink2;
    bgColor = designTokens.colors.hair2;
    icon = <Pencil size={9} color={textColor} strokeWidth={2} />;
  }
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: bgColor,
      }}
    >
      {icon}
      <Text
        style={{
          fontFamily: designTokens.font.medium,
          fontSize: 10.5,
          letterSpacing: 0.21,
          textTransform: 'uppercase',
          color: textColor,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ── RecipeRow ─────────────────────────────────────────────────────────
interface RecipeRowProps {
  recipe: Recipe;
  onPress: () => void;
  onToggleSave: () => void;
  onAddToPlan: () => void;
  isDark: boolean;
  index: number;
}

function RecipeRow({ recipe, onPress, onToggleSave, onAddToPlan, isDark, index }: RecipeRowProps) {
  const colors = getThemeColors(isDark);

  const handleSavePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleSave();
  }, [onToggleSave]);

  const handleLinkPress = useCallback(async () => {
    if (!recipe.sourceUrl) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    let url = recipe.sourceUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }
    try {
      await Linking.openURL(url);
    } catch (err) {
      console.error('[recipes] Failed to open source URL:', err);
    }
  }, [recipe.sourceUrl]);

  const totalMin = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);

  return (
    <Animated.View
      entering={FadeInUp.delay(Math.min(index * 80, 400)).springify()}
      layout={Layout.springify()}
      style={{ marginBottom: 10 }}
    >
      <Pressable
        onPress={onPress}
        style={{
          flexDirection: 'row',
          gap: 12,
          padding: 10,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.hair,
          backgroundColor: colors.bg,
        }}
      >
        <Image
          source={{ uri: recipe.imageUrl }}
          style={{
            width: 84,
            height: 84,
            borderRadius: 12,
            backgroundColor: '#F4F0E8',
            flexShrink: 0,
          }}
          contentFit="cover"
          transition={150}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* Top row: title + (optional link) + heart */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 15,
                color: colors.ink,
                letterSpacing: -0.15,
                lineHeight: 19,
                flex: 1,
                minWidth: 0,
              }}
              numberOfLines={1}
            >
              {recipe.name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {recipe.sourceUrl ? (
                <Pressable
                  onPress={handleLinkPress}
                  hitSlop={8}
                  style={{
                    width: 24,
                    height: 24,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <LinkIcon size={14} color={designTokens.colors.ink2} strokeWidth={1.7} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={handleSavePress}
                hitSlop={8}
                style={{
                  width: 24,
                  height: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Heart
                  size={17}
                  color={recipe.isSaved ? designTokens.colors.olive : designTokens.colors.ink3}
                  fill={recipe.isSaved ? designTokens.colors.olive : 'transparent'}
                  strokeWidth={1.7}
                />
              </Pressable>
            </View>
          </View>

          {/* Meta row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginTop: 8,
              flexWrap: 'wrap',
            }}
          >
            {totalMin > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Clock size={11} color={designTokens.colors.ink2} strokeWidth={1.8} />
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12,
                    color: colors.ink2,
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Flame size={11} color={designTokens.colors.ink2} strokeWidth={1.8} />
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 12,
                      color: colors.ink2,
                    }}
                  >
                    {recipe.calories} cal
                  </Text>
                </View>
              </>
            ) : null}
            {recipe.servings ? (
              <>
                <View
                  style={{
                    width: 2,
                    height: 2,
                    borderRadius: 999,
                    backgroundColor: designTokens.colors.ink3,
                  }}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Users size={11} color={designTokens.colors.ink2} strokeWidth={1.8} />
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 12,
                      color: colors.ink2,
                    }}
                  >
                    {recipe.servings}
                  </Text>
                </View>
              </>
            ) : null}
          </View>

          {/* Footer: source badge + Add to plan */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 8,
            }}
          >
            <SourceBadge recipe={recipe} />
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                onAddToPlan();
              }}
              hitSlop={6}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 11,
                paddingVertical: 6,
                borderRadius: 999,
                // Theme-aware so the pill stays readable in dark mode
                // (was static `hair2` cream, which left white text invisible).
                backgroundColor: colors.pill,
              }}
            >
              <CalendarPlus size={13} color={colors.ink} strokeWidth={1.8} />
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 12,
                  color: colors.ink,
                  letterSpacing: -0.06,
                }}
              >
                Add to plan
              </Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────
export default function RecipesScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = getThemeColors(isDark);

  // ── Store reads — identical to inventory ──────────────────────────
  const recipes = useMealPlanStore((s) => s.recipes);
  const toggleSaveRecipe = useMealPlanStore((s) => s.toggleSaveRecipe);
  const deleteRecipe = useMealPlanStore((s) => s.deleteRecipe);
  // Persisted "keep all" dismissals — keyed by group MEMBER ids so the same set
  // isn't re-flagged next session, but a newly-added similar recipe is.
  const dismissedDuplicateRecipeGroups = useMealPlanStore((s) => s.dismissedDuplicateRecipeGroups);
  const dismissDuplicateRecipeGroup = useMealPlanStore((s) => s.dismissDuplicateRecipeGroup);

  // ── Local state — identical to inventory ──────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  // Deduplicate recipes by name (keep the first occurrence) — identical
  const uniqueRecipes = useMemo(() => {
    const seenNames = new Set<string>();
    return recipes.filter((r) => {
      const normalizedName = r.name.toLowerCase().trim();
      if (seenNames.has(normalizedName)) {
        return false;
      }
      seenNames.add(normalizedName);
      return true;
    });
  }, [recipes]);

  const savedRecipesCount = useMemo(() => {
    return uniqueRecipes.filter((r) => r.isSaved).length;
  }, [uniqueRecipes]);

  const categoryCount = useMemo(() => {
    const counts: Record<string, number> = {
      all: uniqueRecipes.length,
    };
    CATEGORIES.slice(1).forEach((cat) => {
      counts[cat.key] = uniqueRecipes.filter((r) =>
        r.tags.some((t) => t.toLowerCase() === cat.key.toLowerCase()),
      ).length;
    });
    return counts;
  }, [uniqueRecipes]);

  const filteredRecipes = useMemo(() => {
    let filtered = uniqueRecipes;

    if (showSavedOnly) {
      filtered = filtered.filter((r) => r.isSaved);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          r.description.toLowerCase().includes(query) ||
          r.tags.some((t) => t.toLowerCase().includes(query)),
      );
    }

    if (selectedCategory !== 'all') {
      filtered = filtered.filter((r) =>
        r.tags.some((t) => t.toLowerCase() === selectedCategory.toLowerCase()),
      );
    }

    filtered.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    return filtered;
  }, [uniqueRecipes, searchQuery, selectedCategory, showSavedOnly]);

  // Signature of a group = its sorted member recipe ids. Adding a NEW similar
  // recipe changes the membership → new signature → the group is shown again.
  const allDuplicateGroups = useMemo(() => findDuplicateGroups(recipes), [recipes]);
  const duplicateGroups = useMemo(() => {
    const dismissed = new Set(dismissedDuplicateRecipeGroups);
    return allDuplicateGroups.filter(
      (g) => !dismissed.has(g.recipes.map((r) => r.id).sort().join('|')),
    );
  }, [allDuplicateGroups, dismissedDuplicateRecipeGroups]);

  const totalDuplicates = useMemo(() => {
    return duplicateGroups.reduce((sum, g) => sum + g.recipes.length, 0);
  }, [duplicateGroups]);

  // ── Callbacks — identical to inventory ────────────────────────────
  const handleDiscardRecipes = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        deleteRecipe(id);
      }
      setShowDuplicateModal(false);
    },
    [deleteRecipe],
  );

  const handleKeepAllGroup = useCallback((groupKey: string) => {
    // Persist this exact set of recipes as "kept" so it won't be re-flagged next
    // session. Keyed by member ids — if the user later saves another similar
    // recipe, the group grows into a new signature and prompts again.
    const group = allDuplicateGroups.find((g) => g.key === groupKey);
    if (!group) return;
    dismissDuplicateRecipeGroup(group.recipes.map((r) => r.id).sort().join('|'));
  }, [allDuplicateGroups, dismissDuplicateRecipeGroup]);

  const handleRecipePress = useCallback(
    (recipe: Recipe) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({
        pathname: '/recipe-detail',
        params: { id: recipe.id },
      });
    },
    [router],
  );

  const handleToggleSave = useCallback(
    (recipeId: string) => {
      toggleSaveRecipe(recipeId);
    },
    [toggleSaveRecipe],
  );

  const handleCategorySelect = useCallback((category: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCategory(category);
  }, []);

  // NEW additive interaction — same route+params used from recipe-detail
  const handleAddToPlan = useCallback(
    (recipeId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({
        pathname: '/select-recipe',
        params: { recipeId, mode: 'add-to-plan' },
      } as any);
    },
    [router],
  );

  // Sticky compact header — fades in past the title block.
  const scrollY = useSharedValue(0);
  const stickyScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });
  const stickyHeaderStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [80, 140], [0, 1], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [80, 140], [-6, 0], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#1a1a1a' : colors.bg }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <Animated.FlatList
          onScroll={stickyScrollHandler}
          scrollEventThrottle={16}
          data={filteredRecipes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View>
              {/* ── Header ─────────────────────────────────────── */}
              <Animated.View
                entering={FadeInDown.delay(50).springify()}
                style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 12, minWidth: 0 }}>
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 28,
                        color: colors.ink,
                        letterSpacing: -0.56,
                        lineHeight: 31,
                      }}
                    >
                      Your{' '}
                      <Text
                        style={{
                          fontFamily: designTokens.font.serifItalic,
                          fontSize: 32,
                          fontStyle: 'italic',
                        }}
                      >
                        recipes
                      </Text>
                    </Text>
                    <Text
                      style={{
                        marginTop: 6,
                        fontFamily: designTokens.font.regular,
                        fontSize: 14.5,
                        color: colors.ink2,
                        lineHeight: 20,
                      }}
                    >
                      Saved ideas, weeknight wins, and meals worth repeating.
                    </Text>
                  </View>

                  {/* Header buttons */}
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        router.push('/import-recipe');
                      }}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: colors.hair,
                        backgroundColor: colors.bg,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Download size={18} color={colors.ink} strokeWidth={1.7} />
                    </Pressable>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          router.push('/generate-recipe');
                        }}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 999,
                          backgroundColor: designTokens.colors.olive,
                          alignItems: 'center',
                          justifyContent: 'center',
                          shadowColor: designTokens.colors.olive,
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.22,
                          shadowRadius: 6,
                          elevation: 3,
                        }}
                      >
                        <CookingPot size={18} color={designTokens.colors.cream} strokeWidth={1.8} />
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          router.push('/add-recipe');
                        }}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 999,
                          backgroundColor: designTokens.colors.ink,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Plus size={20} color={designTokens.colors.cream} strokeWidth={1.8} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              </Animated.View>

              {/* ── Snapshot row ───────────────────────────────── */}
              <Animated.View
                entering={FadeInDown.delay(100).springify()}
                style={{ paddingHorizontal: 20, paddingBottom: 22 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 22,
                        color: colors.ink,
                        lineHeight: 24,
                        letterSpacing: -0.44,
                      }}
                    >
                      {uniqueRecipes.length}
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 12.5,
                        color: colors.ink2,
                      }}
                    >
                      recipes
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 1,
                      height: 22,
                      backgroundColor: designTokens.colors.hair,
                      marginHorizontal: 16,
                    }}
                  />
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 22,
                        color: colors.ink,
                        lineHeight: 24,
                        letterSpacing: -0.44,
                      }}
                    >
                      {savedRecipesCount}
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 12.5,
                        color: colors.ink2,
                      }}
                    >
                      favorites
                    </Text>
                  </View>
                </View>
              </Animated.View>

              {/* ── Search bar ─────────────────────────────────── */}
              <Animated.View
                entering={FadeInDown.delay(150).springify()}
                style={{ paddingHorizontal: 20, paddingBottom: 12 }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    height: 42,
                    paddingHorizontal: 14,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: colors.hair,
                    backgroundColor: colors.bg,
                  }}
                >
                  <Search size={17} color={designTokens.colors.ink3} strokeWidth={1.6} />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search recipes, ingredients, cuisines"
                    placeholderTextColor={designTokens.colors.ink3}
                    style={{
                      flex: 1,
                      fontFamily: designTokens.font.regular,
                      fontSize: 14,
                      color: colors.ink,
                      padding: 0,
                    }}
                  />
                  {searchQuery.length > 0 && (
                    <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                      <X size={16} color={designTokens.colors.ink2} strokeWidth={1.6} />
                    </Pressable>
                  )}
                </View>
              </Animated.View>

              {/* ── Filter chips ────────────────────────────────── */}
              <Animated.View
                entering={FadeInDown.delay(200).springify()}
                style={{ paddingBottom: 16 }}
              >
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
                >
                  {/* Favorites chip (olive accent when active) */}
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowSavedOnly(!showSavedOnly);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingVertical: 8,
                      paddingHorizontal: 13,
                      borderRadius: 999,
                      backgroundColor: showSavedOnly
                        ? designTokens.colors.olive
                        : colors.bg,
                      borderWidth: 1,
                      borderColor: showSavedOnly
                        ? designTokens.colors.olive
                        : designTokens.colors.hair,
                    }}
                  >
                    <Heart
                      size={13}
                      color={showSavedOnly ? '#fff' : designTokens.colors.olive}
                      fill={showSavedOnly ? '#fff' : 'transparent'}
                      strokeWidth={1.8}
                    />
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 13,
                        color: showSavedOnly ? '#fff' : colors.ink,
                        letterSpacing: -0.065,
                      }}
                    >
                      Favorites
                    </Text>
                    {savedRecipesCount > 0 && (
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 11,
                          color: showSavedOnly
                            ? 'rgba(255,255,255,0.7)'
                            : designTokens.colors.ink3,
                        }}
                      >
                        {savedRecipesCount}
                      </Text>
                    )}
                  </Pressable>

                  {/* Category chips */}
                  {CATEGORIES.map((category) => {
                    const isActive = selectedCategory === category.key;
                    const count = categoryCount[category.key] ?? 0;
                    return (
                      <Pressable
                        key={category.key}
                        onPress={() => handleCategorySelect(category.key)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          paddingVertical: 8,
                          paddingHorizontal: 13,
                          borderRadius: 999,
                          backgroundColor: isActive
                            ? designTokens.colors.brand
                            : colors.bg,
                          borderWidth: 1,
                          borderColor: isActive
                            ? designTokens.colors.brand
                            : designTokens.colors.hair,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: isActive
                              ? designTokens.font.semibold
                              : designTokens.font.medium,
                            fontSize: 13,
                            color: isActive ? designTokens.colors.cream : colors.ink,
                            letterSpacing: -0.065,
                          }}
                        >
                          {category.label}
                        </Text>
                        {count > 0 && (
                          <Text
                            style={{
                              fontFamily: designTokens.font.medium,
                              fontSize: 11,
                              color: isActive
                                ? 'rgba(250,247,240,0.65)'
                                : designTokens.colors.ink3,
                            }}
                          >
                            {count}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </Animated.View>

              {/* ── Duplicate banner (inline-restyled) ──────────── */}
              {duplicateGroups.length > 0 && (
                <View style={{ paddingHorizontal: 20, paddingBottom: 18 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 16,
                      // Theme-aware so the banner doesn't show white text on
                      // a cream surface in dark mode.
                      backgroundColor: colors.surfaceMuted,
                      borderWidth: 1,
                      borderColor: colors.hair,
                    }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.hair,
                        backgroundColor: colors.bg,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Copy size={15} color={designTokens.colors.ink2} strokeWidth={1.6} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 13.5,
                          color: colors.ink,
                          letterSpacing: -0.07,
                        }}
                      >
                        Looks like {totalDuplicates} recipe
                        {totalDuplicates === 1 ? '' : 's'} may be duplicate
                        {totalDuplicates === 1 ? '' : 's'}
                      </Text>
                      <Text
                        style={{
                          fontFamily: designTokens.font.regular,
                          fontSize: 12,
                          color: colors.ink2,
                          marginTop: 1,
                        }}
                      >
                        Review when you have a moment.
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => setShowDuplicateModal(true)}
                      hitSlop={6}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: colors.hair,
                        backgroundColor: colors.bg,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 12.5,
                          color: colors.ink,
                          letterSpacing: -0.0625,
                        }}
                      >
                        Review
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* ── Section header ──────────────────────────────── */}
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingBottom: 12,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                }}
              >
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 18,
                    color: colors.ink,
                    letterSpacing: -0.36,
                  }}
                >
                  All recipes
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 12.5,
                      color: colors.ink2,
                    }}
                  >
                    Recently saved
                  </Text>
                  <ChevronDown
                    size={13}
                    color={designTokens.colors.ink2}
                    strokeWidth={1.6}
                  />
                </View>
              </View>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={{ paddingHorizontal: 20 }}>
              <RecipeRow
                recipe={item}
                onPress={() => handleRecipePress(item)}
                onToggleSave={() => handleToggleSave(item.id)}
                onAddToPlan={() => handleAddToPlan(item.id)}
                isDark={isDark}
                index={index}
              />
            </View>
          )}
          ListEmptyComponent={
            <Animated.View
              entering={FadeInDown.delay(300).springify()}
              style={{ alignItems: 'center', paddingVertical: 50 }}
            >
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
                  color: colors.ink3,
                  marginTop: 4,
                  textAlign: 'center',
                  paddingHorizontal: 32,
                }}
              >
                Try adjusting your filters or generate a new recipe
              </Text>
              <Pressable
                onPress={() => router.push('/generate-recipe')}
                style={{
                  marginTop: 18,
                  paddingHorizontal: 22,
                  paddingVertical: 13,
                  borderRadius: 14,
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
                  Generate recipe
                </Text>
              </Pressable>
            </Animated.View>
          }
        />
      </SafeAreaView>

      {/* Sticky compact header — fades in past the title block */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            backgroundColor: isDark ? '#1a1a1a' : colors.bg,
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
              justifyContent: 'center',
              paddingHorizontal: 20,
              paddingVertical: 12,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 15,
                color: colors.ink,
                letterSpacing: -0.3,
              }}
            >
              Your recipes
            </Text>
          </View>
        </SafeAreaView>
      </Animated.View>

      {/* Duplicate cleanup modal — unchanged */}
      <DuplicateRecipeModal
        visible={showDuplicateModal}
        onClose={() => setShowDuplicateModal(false)}
        groups={duplicateGroups}
        onDiscard={handleDiscardRecipes}
        onKeepAllGroup={handleKeepAllGroup}
        isDark={isDark}
      />
    </View>
  );
}

