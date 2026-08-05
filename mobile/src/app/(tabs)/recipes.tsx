// RecipesScreen — PlannPlate Recipes design language
// (Geist + Instrument Serif italic, sage #546445, terracotta #E46D46, hair borders).
// Visual-only redesign — every store read, callback, route, and side effect
// from the previous implementation is preserved.
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Modal, Platform } from 'react-native';
import { DishImage } from '@/components/DishImage';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Search,
  Plus,
  Mic,
  Camera,
  Share2,
  Keyboard as KeyboardIcon,
  Clock,
  Flame,
  Heart,
  ChefHat,
  CookingPot,
  X,
  Link as LinkIcon,
  Users,
  Copy,
  CalendarPlus,
  Globe,
  Pencil,
  Bookmark as BookmarkIcon,
  Trash2,
  BookOpen,
  ArrowRight,
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
import { reportAndPresent } from '@/lib/failure';
import { useHasPremiumAccess, useSubscriptionStore } from '@/lib/subscription-store';
import { useColorScheme } from '@/lib/useColorScheme';
import { designTokens, getThemeColors, serifItalicFontStyle, elevation } from '@/lib/design-tokens';
import { t } from '@/lib/platform-tokens';
import { CURATED_MEAL_PLANS } from '@/lib/curated-meal-plans';
import { FILTER_CATEGORIES } from '@/lib/recipe-categories';
import { RecipeGridCard } from '@/components/RecipeGridCard';
import { RecipePrepBanner } from '@/components/RecipePrepBanner';
import { DuplicateRecipeModal, findDuplicateGroups } from '@/components/DuplicateRecipeModal';
import { NewCollectionModal } from '@/components/NewCollectionModal';
import { SaveToCollectionSheet } from '@/components/SaveToCollectionSheet';
import { CollectionRecipePicker } from '@/components/CollectionRecipePicker';

// Filter chips mirror the "Get Inspired" classification. The taxonomy lives
// in src/lib/recipe-categories.ts so the TagPicker writes tags the filter
// recognises.
const CATEGORIES = FILTER_CATEGORIES;

// ── My Collections — the saved-recipe lenses shown at the top of the tab.
// Selecting one drives what the "All recipes" grid below shows.
//
// Two kinds: the four built-in SMART collections below (membership derived at
// render time, never stored) and user-created CUSTOM collections (explicit
// `recipeIds`, Premium-only, synced to Supabase). A selection is either a
// smart id or `custom:<uuid>`.
type SmartCollectionId = 'all' | 'favorites' | 'cooked' | 'added';
type CollectionId = SmartCollectionId | `custom:${string}`;

const customSelection = (id: string): CollectionId => `custom:${id}`;
const customIdOf = (sel: CollectionId): string | null =>
  sel.startsWith('custom:') ? sel.slice('custom:'.length) : null;

/** "Recently Added" window — recipes saved within this many days. */
const RECENTLY_ADDED_DAYS = 30;

// TEMPORARILY OFF FOR TESTING. Collections are a Premium feature — flip this
// back to `true` to re-enable the paywall on every entry point (the New
// Collection card, the save sheet, and the bulk picker).
const COLLECTIONS_GATED = false;

const COLLECTIONS: {
  id: SmartCollectionId;
  title: string;
  Icon: React.ComponentType<any>;
  bg: string;
  bgDark: string;
  fg: string;
}[] = [
  { id: 'all', title: 'All Recipes', Icon: CookingPot, bg: '#EDEDE3', bgDark: '#26261f', fg: '#5F6B4E' },
  { id: 'favorites', title: 'Favorites', Icon: Heart, bg: '#E7F0DE', bgDark: '#20291b', fg: '#4F6B33' },
  { id: 'cooked', title: 'Recently Cooked', Icon: Flame, bg: '#FBEEDC', bgDark: '#332b1a', fg: '#C0803A' },
  { id: 'added', title: 'Recently Added', Icon: Clock, bg: '#EDE9F5', bgDark: '#26232f', fg: '#6E5FA6' },
];

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
// `overlay` renders a solid dark chip with white text, legible over a photo.
function SourceBadge({ recipe, overlay = false }: { recipe: Recipe; overlay?: boolean }) {
  let label: string;
  let tint: string;
  let bgTint: string;
  let IconComp: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

  if (recipe.isAIGenerated) {
    label = 'PnP';
    tint = designTokens.colors.brand;
    bgTint = 'rgba(84,100,69,0.10)';
    IconComp = ChefHat;
  } else if (recipe.isImported) {
    label = 'Social';
    tint = '#5B7FA6';
    bgTint = 'rgba(91,127,166,0.10)';
    IconComp = Globe;
  } else if (recipe.curatedSourceId) {
    const planId = recipe.curatedSourceId.split('::')[0];
    const plan = CURATED_MEAL_PLANS.find((p) => p.id === planId);
    label = plan?.name ?? CURATED_OVERRIDE_TO_PLAN_NAME.get(recipe.curatedSourceId) ?? 'Curated';
    tint = designTokens.colors.brand;
    bgTint = 'rgba(84,100,69,0.10)';
    IconComp = CookingPot;
  } else {
    label = 'By You';
    tint = designTokens.colors.ink2;
    bgTint = designTokens.colors.hair2;
    IconComp = Pencil;
  }

  const textColor = overlay ? '#FFFFFF' : tint;
  const bgColor = overlay ? 'rgba(0,0,0,0.55)' : bgTint;

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
        flexShrink: 1,
        minWidth: 0,
      }}
    >
      <IconComp size={9} color={textColor} strokeWidth={2} />
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{
          fontFamily: designTokens.font.medium,
          fontSize: 10.5,
          letterSpacing: 0.21,
          textTransform: 'uppercase',
          color: textColor,
          flexShrink: 1,
          minWidth: 0,
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
      reportAndPresent(err, { feature: 'external-link' });
    }
  }, [recipe.sourceUrl]);

  const totalMin = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);
  const metaParts: string[] = [];
  if (totalMin > 0) metaParts.push(`${totalMin} min`);
  if (recipe.calories) metaParts.push(`${recipe.calories} cal`);
  if (recipe.servings) metaParts.push(`${recipe.servings} ${recipe.servings === 1 ? 'serve' : 'serves'}`);

  const roundBtn = {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.34)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  return (
    <Animated.View
      entering={FadeInUp.delay(Math.min(index * 80, 400)).springify()}
      layout={Layout.springify()}
      style={{ marginBottom: 14 }}
    >
      <Pressable
        onPress={onPress}
        style={{
          borderRadius: 20,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.hair,
          backgroundColor: colors.bg,
        }}
      >
        <View style={{ position: 'relative' }}>
          <DishImage
            url={recipe.imageUrl}
            width={600}
            style={{ width: '100%', aspectRatio: 1.55 }}
            transition={150}
            recyclingKey={recipe.id}
          />

          {/* Legibility gradients — subtle at top (badges/heart), strong at bottom (text). */}
          <LinearGradient
            colors={['rgba(0,0,0,0.32)', 'transparent']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 72 }}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.12)', 'rgba(0,0,0,0.80)']}
            locations={[0, 0.45, 1]}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: '32%' }}
            pointerEvents="none"
          />

          {/* Top-left: source chip */}
          <View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', maxWidth: '62%' }}>
            <SourceBadge recipe={recipe} overlay />
          </View>

          {/* Top-right: favourite (+ optional source link) */}
          <View style={{ position: 'absolute', top: 10, right: 10, flexDirection: 'row', gap: 8 }}>
            {recipe.sourceUrl ? (
              <Pressable onPress={handleLinkPress} hitSlop={8} style={roundBtn}>
                <LinkIcon size={15} color="#FFFFFF" strokeWidth={2} />
              </Pressable>
            ) : null}
            <Pressable onPress={handleSavePress} hitSlop={8} style={roundBtn}>
              <Heart
                size={17}
                color={recipe.isSaved ? designTokens.colors.olive : '#FFFFFF'}
                fill={recipe.isSaved ? designTokens.colors.olive : 'transparent'}
                strokeWidth={2}
              />
            </Pressable>
          </View>

          {/* Bottom-left: name + meta, overlaid on the photo */}
          <View style={{ position: 'absolute', left: 16, right: 74, bottom: 16 }}>
            <Text
              numberOfLines={2}
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 18,
                lineHeight: 22,
                color: '#FFFFFF',
                letterSpacing: -0.3,
              }}
            >
              {recipe.name}
            </Text>
            {metaParts.length > 0 && (
              <Text
                style={{
                  marginTop: 6,
                  fontFamily: designTokens.font.regular,
                  fontSize: 12.5,
                  color: 'rgba(255,255,255,0.92)',
                }}
              >
                {metaParts.join('  ·  ')}
              </Text>
            )}
          </View>

          {/* Bottom-right: + add to plan */}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onAddToPlan();
            }}
            hitSlop={8}
            style={{
              position: 'absolute',
              right: 14,
              bottom: 14,
              width: 46,
              height: 46,
              borderRadius: 15,
              backgroundColor: designTokens.colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
              ...elevation.card,
            }}
          >
            <Plus size={24} color={designTokens.colors.cream} strokeWidth={2.6} />
          </Pressable>
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
  const addRecipesToGroceryList = useMealPlanStore((s) => s.addRecipesToGroceryList);
  // Persisted "keep all" dismissals — keyed by group MEMBER ids so the same set
  // isn't re-flagged next session, but a newly-added similar recipe is.
  const dismissedDuplicateRecipeGroups = useMealPlanStore((s) => s.dismissedDuplicateRecipeGroups);
  const dismissDuplicateRecipeGroup = useMealPlanStore((s) => s.dismissDuplicateRecipeGroup);
  // Drives the "Recently Cooked" collection.
  const cookingLogs = useMealPlanStore((s) => s.cookingLogs);
  // First-time intro nudge — reuses the persisted nudge-dismissal map.
  const mealSlots = useMealPlanStore((s) => s.mealSlots);
  const nudgeDismissals = useMealPlanStore((s) => s.nudgeDismissals);
  const dismissNudge = useMealPlanStore((s) => s.dismissNudge);
  // First-run recipe prep — set while the dishes named in onboarding build in
  // the background. Drives the "Creating your recipes" banner; once it clears,
  // the "Your recipes are ready" intro nudge takes over.
  const recipePrep = useMealPlanStore((s) => s.recipePrep);
  const clearRecipePrep = useMealPlanStore((s) => s.clearRecipePrep);
  // ── Custom collections (Premium) ──
  const collections = useMealPlanStore((s) => s.collections);
  const deleteCollectionAction = useMealPlanStore((s) => s.deleteCollection);
  const renameCollection = useMealPlanStore((s) => s.renameCollection);
  const hasPremium = useHasPremiumAccess();
  const openPaywallSheet = useSubscriptionStore((s) => s.openPaywallSheet);

  // ── Local state — identical to inventory ──────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  // Brief confirmation toast (e.g. after quick-adding a recipe to grocery).
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [collection, setCollection] = useState<CollectionId>('all');
  // Collection surfaces: create composer, per-recipe save sheet, manage
  // (rename/delete) dialog, and the bulk add-recipes picker.
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [saveSheetRecipe, setSaveSheetRecipe] = useState<Recipe | null>(null);
  const [manageCollectionId, setManageCollectionId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [pickerCollectionId, setPickerCollectionId] = useState<string | null>(null);

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

  // First-time intro nudge: show once the library has recipes, until the user
  // dismisses it OR starts planning (any slot with a recipe). Persisted via the
  // nudge-dismissal map so it never reappears after being closed.
  const hasPlannedMeal = useMemo(
    () => mealSlots.some((s) => !!s.recipeId),
    [mealSlots],
  );
  // While first-run recipes are still building (or just finished, before the
  // banner clears), the prep banner owns this slot — hold the intro nudge back
  // so the two don't stack.
  const recipePrepActive = recipePrep != null;
  const recipePrepDone =
    recipePrep != null && recipePrep.completed >= recipePrep.total;
  // Give the completed banner a brief "ready" beat, then clear it so the
  // "Your recipes are ready · Plan My Meals" nudge takes over.
  useEffect(() => {
    if (!recipePrepDone) return;
    const t = setTimeout(() => clearRecipePrep(), 1600);
    return () => clearTimeout(t);
  }, [recipePrepDone, clearRecipePrep]);

  const showRecipesIntro =
    uniqueRecipes.length > 0 &&
    !hasPlannedMeal &&
    !recipePrepActive &&
    !nudgeDismissals['recipes-intro'];

  const categoryCount = useMemo(() => {
    const counts: Record<string, number> = {
      all: uniqueRecipes.length,
    };
    CATEGORIES.slice(1).forEach((cat) => {
      counts[cat.key] = uniqueRecipes.filter((r) =>
        r.tags.some((t) => cat.match.includes(t.toLowerCase())),
      ).length;
    });
    return counts;
  }, [uniqueRecipes]);

  // Most recent "cooked" timestamp per recipe id — powers the Recently Cooked
  // collection (membership + ordering).
  const lastCookedAt = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cookingLogs ?? []) {
      if (l.status !== 'cooked' || !l.recipeId) continue;
      const at = new Date(l.cookedAt).getTime();
      if (Number.isNaN(at)) continue;
      if (at > (m.get(l.recipeId) ?? 0)) m.set(l.recipeId, at);
    }
    return m;
  }, [cookingLogs]);

  const inCollection = useCallback(
    (r: Recipe, id: CollectionId) => {
      const customId = customIdOf(id);
      if (customId) {
        const c = collections.find((x) => x.id === customId);
        return !!c?.recipeIds.includes(r.id);
      }
      switch (id) {
        case 'all':
          return true;
        case 'favorites':
          return !!r.isSaved;
        case 'cooked':
          return lastCookedAt.has(r.id);
        case 'added': {
          const at = r.createdAt ? new Date(r.createdAt).getTime() : 0;
          return at > 0 && Date.now() - at <= RECENTLY_ADDED_DAYS * 86400000;
        }
        default:
          return true;
      }
    },
    [lastCookedAt, collections],
  );

  // Per-collection recipe count + cover photo for the collection cards
  // (smart + custom, keyed by selection id).
  const collectionMeta = useMemo(() => {
    const out: Record<string, { count: number; cover?: string }> = {};
    const measure = (sel: CollectionId) => {
      const members = uniqueRecipes.filter((r) => inCollection(r, sel));
      out[sel] = { count: members.length, cover: members.find((r) => r.imageUrl)?.imageUrl };
    };
    for (const c of COLLECTIONS) measure(c.id);
    for (const c of collections) measure(customSelection(c.id));
    return out;
  }, [uniqueRecipes, inCollection, collections]);

  // Selecting a collection that later disappears (deleted) falls back to All.
  const activeCustom = useMemo(() => {
    const id = customIdOf(collection);
    return id ? collections.find((c) => c.id === id) ?? null : null;
  }, [collection, collections]);

  useEffect(() => {
    if (customIdOf(collection) && !activeCustom) setCollection('all');
  }, [collection, activeCustom]);

  const activeCollectionTitle = activeCustom
    ? activeCustom.name
    : COLLECTIONS.find((c) => c.id === collection)?.title ?? 'All recipes';

  const filteredRecipes = useMemo(() => {
    // The selected collection is the outermost lens; the chips/search narrow it.
    let filtered = uniqueRecipes.filter((r) => inCollection(r, collection));

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(query) ||
          r.description.toLowerCase().includes(query) ||
          r.tags.some((t) => t.toLowerCase().includes(query)) ||
          r.ingredients.some((ing) => ing.name.toLowerCase().includes(query)),
      );
    }

    if (selectedCategory !== 'all') {
      const match = CATEGORIES.find((c) => c.key === selectedCategory)?.match ?? [];
      filtered = filtered.filter((r) =>
        r.tags.some((t) => match.includes(t.toLowerCase())),
      );
    }

    if (collection === 'cooked') {
      // Most recently cooked first — the point of that collection.
      filtered.sort((a, b) => (lastCookedAt.get(b.id) ?? 0) - (lastCookedAt.get(a.id) ?? 0));
    } else {
      filtered.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
    }

    return filtered;
  }, [
    uniqueRecipes,
    searchQuery,
    selectedCategory,
    collection,
    inCollection,
    lastCookedAt,
  ]);

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

  // ── Collections (Premium) ────────────────────────────────────────
  // Every entry point routes through this gate: non-subscribers get the
  // paywall instead of the feature.
  const requirePremium = useCallback(() => {
    if (!COLLECTIONS_GATED) return true;
    if (hasPremium) return true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    openPaywallSheet('collections');
    return false;
  }, [hasPremium, openPaywallSheet]);

  const handleOpenNewCollection = useCallback(() => {
    if (!requirePremium()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNewCollectionOpen(true);
  }, [requirePremium]);

  // Long-press a recipe card → "Save to collection".
  const handleOpenSaveSheet = useCallback(
    (recipe: Recipe) => {
      if (!requirePremium()) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSaveSheetRecipe(recipe);
    },
    [requirePremium],
  );

  // Bulk add/remove for the collection currently being viewed.
  const handleOpenPicker = useCallback(
    (id: string) => {
      if (!requirePremium()) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setPickerCollectionId(id);
    },
    [requirePremium],
  );

  const handleOpenManage = useCallback(
    (id: string) => {
      const current = collections.find((c) => c.id === id);
      setRenameDraft(current?.name ?? '');
      setManageCollectionId(id);
    },
    [collections],
  );

  const handleSaveRename = useCallback(() => {
    const name = renameDraft.trim();
    if (!manageCollectionId || !name) return;
    renameCollection(manageCollectionId, name);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setManageCollectionId(null);
  }, [manageCollectionId, renameDraft, renameCollection]);

  const handleDeleteCollection = useCallback(
    (id: string) => {
      deleteCollectionAction(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setManageCollectionId(null);
      setCollection('all');
    },
    [deleteCollectionAction],
  );

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

  // Quick-add a recipe's ingredients straight to the grocery list (direct
  // action — no slot/date to pick — so we confirm with a toast).
  const handleAddToGrocery = useCallback(
    (recipeId: string) => {
      addRecipesToGroceryList([recipeId]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const name = recipes.find((r) => r.id === recipeId)?.name;
      setToastMsg(name ? `Added ${name} to grocery` : 'Added to grocery');
    },
    [addRecipesToGroceryList, recipes],
  );

  // Auto-dismiss the toast after a short beat.
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2400);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Grid cell renderer. Hoisted out of the JSX (and off inline per-item arrows)
  // so RecipeGridCard's memo actually holds: the four handlers below are all
  // useCallback-stable, so every prop the card receives keeps its identity
  // between renders unless the recipe itself changed.
  const renderRecipeCard = useCallback(
    ({ item, index }: { item: Recipe; index: number }) => (
      <RecipeGridCard
        recipe={item}
        onPress={handleRecipePress}
        onToggleSave={handleToggleSave}
        onAddToPlan={handleAddToPlan}
        onAddToGrocery={handleAddToGrocery}
        onLongPress={handleOpenSaveSheet}
        isDark={isDark}
        index={index}
      />
    ),
    [handleRecipePress, handleToggleSave, handleAddToPlan, handleAddToGrocery, handleOpenSaveSheet, isDark],
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
          // Virtualization budget. RN's defaults (10 initial, 10 per batch,
          // windowSize 21) render roughly ten screens of cards up front, which
          // on a 2-column image grid is a lot of mounting and decoding before
          // first paint. These values keep ~1 screen ready in each direction.
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={50}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          ListHeaderComponent={
            <View>
              {/* ── Header ─────────────────────────────────────── */}
              <Animated.View
                entering={FadeInDown.delay(50).springify()}
                style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 14 }}
              >
                <View>
                  {/* Title + action icons share one centered row. */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        paddingRight: 12,
                        flexDirection: 'row',
                        alignItems: 'baseline',
                        flexWrap: 'wrap',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: t(28, 24),
                          color: colors.ink,
                          letterSpacing: t(-0.56, -0.4),
                          lineHeight: t(40, 34),
                        }}
                      >
                        Your{' '}
                      </Text>
                      <Text
                        style={{
                          fontFamily: designTokens.font.serifItalic,
                          fontStyle: serifItalicFontStyle,
                          fontSize: t(32, 28),
                          color: colors.ink,
                          letterSpacing: t(-0.64, -0.5),
                          lineHeight: t(40, 34),
                        }}
                      >
                        Recipes
                      </Text>
                    </View>

                  {/* Header buttons */}
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSearchOpen((v) => {
                          const next = !v;
                          if (!next) setSearchQuery(''); // collapsing clears the query
                          return next;
                        });
                      }}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: searchOpen ? designTokens.colors.brand : colors.hair,
                        backgroundColor: searchOpen ? 'rgba(84,100,69,0.10)' : colors.bg,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Search
                        size={18}
                        color={searchOpen ? designTokens.colors.brand : colors.ink}
                        strokeWidth={1.7}
                      />
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
                          setAddSheetOpen(true);
                        }}
                        style={{ width: 40, height: 40, borderRadius: 999, overflow: 'hidden' }}
                      >
                        <LinearGradient
                          colors={['#181612', '#2d1811']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={{
                            width: 40,
                            height: 40,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Plus size={20} color={designTokens.colors.cream} strokeWidth={1.8} />
                        </LinearGradient>
                      </Pressable>
                    </View>
                  </View>
                  </View>
                  <Text
                    style={{
                      marginTop: t(6, 4),
                      fontFamily: designTokens.font.regular,
                      fontSize: t(14.5, 13.5),
                      color: colors.ink2,
                      lineHeight: t(20, 18),
                    }}
                  >
                    Saved ideas, weeknight wins, and meals worth repeating.
                  </Text>
                </View>
              </Animated.View>

              {/* Snapshot stats row (recipes · favorites) removed per design. */}

              {/* ── First-run recipe-prep banner ───────────────────
                  Shows while the dishes named during onboarding build in the
                  background; self-hides (returns null) once cleared, handing
                  the slot back to the intro nudge below. */}
              <RecipePrepBanner isDark={isDark} />

              {/* ── First-time intro nudge ─────────────────────── */}
              {showRecipesIntro && (
                <Animated.View
                  entering={FadeInDown.delay(80).springify()}
                  style={{ paddingHorizontal: 20, paddingBottom: 16 }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      gap: 12,
                      paddingHorizontal: 13,
                      paddingVertical: 13,
                      borderRadius: 14,
                      backgroundColor: isDark ? 'rgba(84,100,69,0.16)' : 'rgba(84,100,69,0.08)',
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(139,155,120,0.28)' : 'rgba(84,100,69,0.18)',
                    }}
                  >
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 11,
                        backgroundColor: designTokens.colors.brand,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <BookOpen size={19} color={designTokens.colors.cream} strokeWidth={1.9} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
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
                            fontFamily: designTokens.font.semibold,
                            fontSize: 14.5,
                            color: isDark ? '#cdd6c0' : '#2E3826',
                            letterSpacing: -0.15,
                          }}
                        >
                          Your recipes are ready
                        </Text>
                        <Pressable
                          onPress={() => {
                            Haptics.selectionAsync();
                            dismissNudge('recipes-intro');
                          }}
                          hitSlop={8}
                        >
                          <X size={15} color={designTokens.colors.ink3} strokeWidth={2} />
                        </Pressable>
                      </View>
                      <Text
                        style={{
                          marginTop: 3,
                          fontFamily: designTokens.font.regular,
                          fontSize: 12.5,
                          lineHeight: 18,
                          color: isDark ? '#a9a498' : colors.ink2,
                        }}
                      >
                        Add them to your meal plan or build your grocery list.
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 }}>
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            router.push('/(tabs)');
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 5,
                            paddingHorizontal: 13,
                            paddingVertical: 7,
                            borderRadius: 999,
                            backgroundColor: designTokens.colors.brand,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: designTokens.font.medium,
                              fontSize: 12.5,
                              color: designTokens.colors.cream,
                              letterSpacing: -0.05,
                            }}
                          >
                            Add to meal plan
                          </Text>
                          <ArrowRight size={14} color={designTokens.colors.cream} strokeWidth={2} />
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            router.push('/(tabs)/grocery');
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 5,
                            paddingHorizontal: 13,
                            paddingVertical: 7,
                            borderRadius: 999,
                            backgroundColor: 'transparent',
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(139,155,120,0.42)' : 'rgba(84,100,69,0.35)',
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: designTokens.font.medium,
                              fontSize: 12.5,
                              color: isDark ? '#cdd6c0' : designTokens.colors.brand,
                              letterSpacing: -0.05,
                            }}
                          >
                            Add to grocery
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </Animated.View>
              )}

              {/* ── Search bar (collapsible — opens from the header search icon) ── */}
              {searchOpen && (
              <Animated.View
                entering={FadeInDown.springify()}
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
                    autoFocus
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
              )}

              {/* ── My Collections ──────────────────────────────── */}
              <Animated.View
                entering={FadeInDown.delay(150).springify()}
                style={{ paddingBottom: 20 }}
              >
                <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: t(18, 16),
                      color: colors.ink,
                      letterSpacing: t(-0.36, -0.25),
                    }}
                  >
                    My Collections
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
                  style={{ flexGrow: 0 }}
                >
                  {COLLECTIONS.map((c) => {
                    const meta = collectionMeta[c.id];
                    const active = collection === c.id;
                    const Icon = c.Icon;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setCollection(c.id);
                        }}
                        style={{
                          width: 150,
                          borderRadius: 18,
                          padding: 14,
                          backgroundColor: isDark ? c.bgDark : c.bg,
                          borderWidth: active ? 1.5 : 0,
                          borderColor: c.fg,
                        }}
                      >
                        <Icon
                          size={19}
                          color={c.fg}
                          strokeWidth={2}
                          fill={c.id === 'favorites' ? c.fg : 'transparent'}
                        />
                        <Text
                          numberOfLines={1}
                          style={{
                            marginTop: 10,
                            fontFamily: designTokens.font.semibold,
                            fontSize: 15,
                            color: colors.ink,
                            letterSpacing: -0.2,
                          }}
                        >
                          {c.title}
                        </Text>
                        <Text
                          style={{
                            marginTop: 2,
                            fontFamily: designTokens.font.regular,
                            fontSize: 12,
                            color: colors.ink2,
                          }}
                        >
                          {meta.count} {meta.count === 1 ? 'recipe' : 'recipes'}
                        </Text>
                        {meta.cover ? (
                          <DishImage
                            url={meta.cover}
                            width={150}
                            style={{
                              width: 88,
                              height: 88,
                              borderRadius: 44,
                              marginTop: 12,
                              alignSelf: 'center',
                            }}
                            transition={150}
                            recyclingKey={meta.cover}
                          />
                        ) : (
                          <View style={{ height: 100 }} />
                        )}
                      </Pressable>
                    );
                  })}

                  {/* Custom collections (Premium). Long-press to manage. */}
                  {collections.map((c) => {
                    const sel = customSelection(c.id);
                    const meta = collectionMeta[sel] ?? { count: 0 };
                    const active = collection === sel;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setCollection(sel);
                        }}
                        onLongPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          handleOpenManage(c.id);
                        }}
                        style={{
                          width: 150,
                          borderRadius: 18,
                          padding: 14,
                          backgroundColor: isDark ? colors.surfaceMuted : c.color,
                          borderWidth: active ? 1.5 : 0,
                          borderColor: designTokens.colors.ink2,
                        }}
                      >
                        <BookmarkIcon size={19} color={designTokens.colors.ink2} strokeWidth={2} />
                        <Text
                          numberOfLines={1}
                          style={{
                            marginTop: 10,
                            fontFamily: designTokens.font.semibold,
                            fontSize: 15,
                            color: colors.ink,
                            letterSpacing: -0.2,
                          }}
                        >
                          {c.name}
                        </Text>
                        <Text
                          style={{
                            marginTop: 2,
                            fontFamily: designTokens.font.regular,
                            fontSize: 12,
                            color: colors.ink2,
                          }}
                        >
                          {meta.count} {meta.count === 1 ? 'recipe' : 'recipes'}
                        </Text>
                        {meta.cover ? (
                          <DishImage
                            url={meta.cover}
                            width={150}
                            style={{
                              width: 88,
                              height: 88,
                              borderRadius: 44,
                              marginTop: 12,
                              alignSelf: 'center',
                            }}
                            transition={150}
                            recyclingKey={meta.cover}
                          />
                        ) : (
                          <View style={{ height: 100 }} />
                        )}
                      </Pressable>
                    );
                  })}

                  {/* + New Collection — free for everyone. */}
                  <Pressable
                    onPress={handleOpenNewCollection}
                    style={{
                      width: 150,
                      borderRadius: 18,
                      padding: 14,
                      borderWidth: 1.5,
                      borderStyle: 'dashed',
                      borderColor: colors.hair,
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 186,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 999,
                        backgroundColor: colors.pill,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Plus size={18} color={colors.ink} strokeWidth={2} />
                    </View>
                    <Text
                      style={{
                        marginTop: 10,
                        fontFamily: designTokens.font.medium,
                        fontSize: 13.5,
                        color: colors.ink,
                        letterSpacing: -0.15,
                        textAlign: 'center',
                      }}
                    >
                      New Collection
                    </Text>
                  </Pressable>
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
              {/* `baseline` alignment pushes a padded Pressable down by its
                  own padding, which made the "Add recipes" pill bleed into
                  the chips row below — so centre-align whenever it's shown. */}
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingBottom: 12,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: activeCustom ? 'center' : 'baseline',
                  gap: 10,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    flexShrink: 1,
                    minWidth: 0,
                    fontFamily: designTokens.font.medium,
                    fontSize: t(18, 16),
                    color: colors.ink,
                    letterSpacing: t(-0.36, -0.25),
                  }}
                >
                  {activeCollectionTitle}
                </Text>
                {activeCustom ? (
                  // Inside a custom collection the sort label is replaced by
                  // the bulk add/remove entry point.
                  <Pressable
                    onPress={() => handleOpenPicker(activeCustom.id)}
                    hitSlop={6}
                    style={{
                      flexShrink: 0,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 11,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.hair,
                      backgroundColor: colors.bg,
                    }}
                  >
                    <Plus size={13} color={colors.ink} strokeWidth={2} />
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 12.5,
                        color: colors.ink,
                      }}
                    >
                      Add recipes
                    </Text>
                  </Pressable>
                ) : null}
              </View>

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
                  {/* Category chips — Favorites now lives in My Collections. */}
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
            </View>
          }
          numColumns={2}
          columnWrapperStyle={{ paddingHorizontal: 20, gap: 12 }}
          renderItem={renderRecipeCard}
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
                {activeCustom ? (
                  <BookmarkIcon size={22} color={designTokens.colors.ink3} strokeWidth={1.6} />
                ) : (
                  <Search size={22} color={designTokens.colors.ink3} strokeWidth={1.6} />
                )}
              </View>
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 15,
                  color: colors.ink,
                  letterSpacing: -0.15,
                }}
              >
                {activeCustom ? 'This collection is empty' : 'No recipes found'}
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
                {activeCustom
                  ? `Pick recipes from your library to add to ${activeCustom.name}`
                  : 'Try adjusting your filters or generate a new recipe'}
              </Text>
              <Pressable
                onPress={() =>
                  activeCustom
                    ? handleOpenPicker(activeCustom.id)
                    : router.push('/generate-recipe')
                }
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
                  {activeCustom ? 'Add recipes' : 'Generate recipe'}
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

      {/* ── "Add a recipe" sheet (opened by the + button) ─────────── */}
      <Modal
        visible={addSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddSheetOpen(false)}
      >
        <Pressable
          onPress={() => setAddSheetOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: isDark ? '#1c1b18' : '#FFFFFF',
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 36,
            }}
          >
            {/* grabber */}
            <View
              style={{
                alignSelf: 'center',
                width: 40,
                height: 5,
                borderRadius: 3,
                backgroundColor: colors.hair,
                marginBottom: 14,
              }}
            />
            {/* header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 18,
              }}
            >
              <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 18, color: colors.ink }}>
                Add a recipe
              </Text>
              <Pressable
                onPress={() => setAddSheetOpen(false)}
                hitSlop={10}
                style={{
                  position: 'absolute',
                  right: 0,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.pill,
                }}
              >
                <X size={16} color={colors.ink} strokeWidth={2} />
              </Pressable>
            </View>

            {/* Big card — Add from Social */}
            <Pressable
              onPress={() => {
                setAddSheetOpen(false);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/import-recipe');
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                padding: 14,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.hair,
                backgroundColor: colors.bg,
              }}
            >
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  backgroundColor: 'rgba(84,100,69,0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Share2 size={24} color={designTokens.colors.brand} strokeWidth={1.9} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 16, color: colors.ink }}>
                  Add from Social
                </Text>
                <Text
                  style={{
                    marginTop: 2,
                    fontFamily: designTokens.font.regular,
                    fontSize: 12.5,
                    color: colors.ink2,
                  }}
                >
                  Instagram, TikTok, Facebook & more
                </Text>
              </View>
            </Pressable>

            {/* Speak it · Snap it */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              {[
                {
                  label: 'Speak it',
                  Icon: Mic,
                  tint: 'rgba(228,109,70,0.14)',
                  color: designTokens.colors.olive,
                  action: 'speak' as const,
                },
                {
                  label: 'Snap it',
                  Icon: Camera,
                  tint: 'rgba(84,100,69,0.12)',
                  color: designTokens.colors.brand,
                  action: 'snap' as const,
                },
                {
                  label: 'Type it',
                  Icon: KeyboardIcon,
                  tint: colors.pill,
                  color: colors.ink,
                  action: 'type' as const,
                },
              ].map(({ label, Icon, tint, color, action }) => (
                <Pressable
                  key={label}
                  onPress={() => {
                    setAddSheetOpen(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({ pathname: '/add-recipe', params: { action } } as any);
                  }}
                  style={{
                    flex: 1,
                    padding: 16,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: colors.hair,
                    backgroundColor: colors.bg,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: tint,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={22} color={color} strokeWidth={1.9} />
                  </View>
                  <Text
                    style={{
                      marginTop: 12,
                      fontFamily: designTokens.font.semibold,
                      fontSize: 15,
                      color: colors.ink,
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Collections: create · save-to · bulk picker ────────── */}
      <NewCollectionModal
        visible={newCollectionOpen}
        isDark={isDark}
        onClose={() => setNewCollectionOpen(false)}
        onCreated={(id) => {
          // Jump into the new (empty) collection and open the picker so the
          // next step — filling it — is immediate.
          setCollection(customSelection(id));
          setTimeout(() => setPickerCollectionId(id), 300);
        }}
      />

      <SaveToCollectionSheet
        visible={!!saveSheetRecipe}
        recipeId={saveSheetRecipe?.id ?? null}
        recipeName={saveSheetRecipe?.name}
        isDark={isDark}
        onClose={() => setSaveSheetRecipe(null)}
      />

      <CollectionRecipePicker
        visible={!!pickerCollectionId}
        collectionId={pickerCollectionId}
        isDark={isDark}
        onClose={() => setPickerCollectionId(null)}
      />

      {/* ── Manage collection: rename or delete ────────────────── */}
      <Modal
        visible={!!manageCollectionId}
        transparent
        animationType="fade"
        onRequestClose={() => setManageCollectionId(null)}
      >
        <Pressable
          onPress={() => setManageCollectionId(null)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(21,20,15,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 28,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              borderRadius: 24,
              backgroundColor: colors.bg,
              borderWidth: 1,
              borderColor: colors.hair,
              padding: 20,
            }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 17,
                color: colors.ink,
                letterSpacing: -0.3,
              }}
            >
              Edit collection
            </Text>

            {/* Rename */}
            <TextInput
              value={renameDraft}
              onChangeText={setRenameDraft}
              placeholder="Collection name"
              placeholderTextColor={colors.ink3}
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={handleSaveRename}
              style={{
                marginTop: 14,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.hair,
                backgroundColor: colors.pill,
                fontFamily: designTokens.font.medium,
                fontSize: 15,
                color: colors.ink,
              }}
            />

            {/* Add recipes — bulk picker for this collection. */}
            <Pressable
              onPress={() => {
                const id = manageCollectionId;
                setManageCollectionId(null);
                if (id) setTimeout(() => handleOpenPicker(id), 250);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                marginTop: 12,
                paddingHorizontal: 14,
                paddingVertical: 13,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.hair,
              }}
            >
              <Plus size={16} color={colors.ink} strokeWidth={2} />
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 14.5,
                  color: colors.ink,
                }}
              >
                Add or remove recipes
              </Text>
            </Pressable>

            <Text
              style={{
                marginTop: 14,
                fontFamily: designTokens.font.regular,
                fontSize: 12.5,
                lineHeight: 18,
                color: colors.ink3,
              }}
            >
              Deleting a collection removes the grouping only — your recipes stay in your
              library.
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Pressable
                onPress={() =>
                  manageCollectionId && handleDeleteCollection(manageCollectionId)
                }
                style={{
                  flexDirection: 'row',
                  gap: 7,
                  paddingHorizontal: 16,
                  paddingVertical: 13,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: designTokens.colors.olive,
                }}
              >
                <Trash2 size={15} color={designTokens.colors.olive} strokeWidth={2} />
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 14.5,
                    color: designTokens.colors.olive,
                  }}
                >
                  Delete
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSaveRename}
                disabled={!renameDraft.trim()}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  borderRadius: 14,
                  alignItems: 'center',
                  backgroundColor: designTokens.colors.brand,
                  opacity: renameDraft.trim() ? 1 : 0.45,
                }}
              >
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 14.5,
                    color: '#fff',
                  }}
                >
                  Save
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Brief bottom toast (e.g. "Added to grocery") */}
      {toastMsg && (
        <Animated.View
          entering={FadeInDown.springify()}
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 96, alignItems: 'center' }}
        >
          <View
            style={{
              backgroundColor: '#201C17',
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 999,
              shadowColor: '#000',
              shadowOpacity: 0.2,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
            }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 13,
                color: '#fff',
                letterSpacing: -0.1,
              }}
            >
              {toastMsg}
            </Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}
