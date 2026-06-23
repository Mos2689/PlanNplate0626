// Recipe Detail — PlannPlate design language + cooking-flow UX enhancements.
// All store calls, mutations, ImagePicker calls, FileSystem download, Linking/Alert flow,
// RNShare call, route push, and haptic preserved verbatim from the prior version.
// Additive enhancements are purely local (useState / useMemo / useSharedValue) — no new
// store actions, routes, or API calls.
// No Sparkles. One italic word per screen ("plan" in the bottom CTA).
import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  Modal,
  Share as RNShare,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeft,
  Heart,
  Clock,
  Flame,
  Users,
  Check,
  Share2,
  Link as LinkIcon,
  Upload,
  User,
  ExternalLink,
  Trash2,
  AlertTriangle,
  Edit2,
  X as XIcon,
  Camera,
  ImageIcon,
  CirclePlus,
  CircleMinus,
  Copy,
  ChevronLeft,
  ChevronRight,
  ChefHat,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeIn,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withSpring,
  withSequence,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import { useKeepAwake } from 'expo-keep-awake';
import { useMealPlanStore, type Recipe, type Ingredient } from '@/lib/store';
import { useColorScheme } from '@/lib/useColorScheme';
import { uploadFile } from '@/lib/upload';
import { designTokens } from '@/lib/design-tokens';

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

// Cook-mode keep-awake guard — `useKeepAwake` is a hook, so it must be mounted
// only while the cook-mode modal is visible. This child handles that.
function CookModeAwakeGuard() {
  useKeepAwake('recipe-detail-cook-mode');
  return null;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function RecipeDetailScreen() {
  const router = useRouter();
  const { id, slotId } = useLocalSearchParams<{ id: string; slotId?: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const recipes = useMealPlanStore((s) => s.recipes);
  const mealSlots = useMealPlanStore((s) => s.mealSlots);
  const toggleSaveRecipe = useMealPlanStore((s) => s.toggleSaveRecipe);
  const deleteRecipe = useMealPlanStore((s) => s.deleteRecipe);
  const updateRecipe = useMealPlanStore((s) => s.updateRecipe);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingIngredients, setEditingIngredients] = useState<Ingredient[] | null>(null);
  const [editingInstructions, setEditingInstructions] = useState<string[] | null>(null);
  const [editingImageUrl, setEditingImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // ── Additive UX-enhancement state (purely local, no store writes) ───────
  const [viewServings, setViewServings] = useState<number | null>(null);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set());
  const [cookModeOpen, setCookModeOpen] = useState(false);
  const [cookStep, setCookStep] = useState(0);
  const [imageOpen, setImageOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reanimated values for sticky header + heart pulse.
  const scrollY = useSharedValue(0);
  const heartScale = useSharedValue(1);

  const recipe = useMemo(() => {
    const found = recipes.find((r) => r.id === id);
    if (found) {
      console.log('[recipe-detail] Recipe loaded:', {
        name: found.name,
        isImported: found.isImported,
        sourceUrl: found.sourceUrl,
        hasSourceUrl: !!found.sourceUrl,
      });
    }
    return found;
  }, [recipes, id]);

  const mealSlot = useMemo(() => {
    if (!slotId) return null;
    return mealSlots.find((s) => s.id === slotId);
  }, [mealSlots, slotId]);

  // Opened from a meal-plan slot (vs the Recipes tab / Favorites). When true
  // the recipe is already in the plan, so the bottom CTA becomes "Start cooking"
  // and the inline Start-cooking chip is dropped (the CTA covers it).
  const fromMealPlan = !!mealSlot;

  // Extended multiplier: prefers the in-screen `viewServings` stepper if the
  // user has interacted with it, otherwise falls back to the slot's override,
  // otherwise 1× (recipe original). Store wiring untouched.
  const servingMultiplier = useMemo(() => {
    if (!recipe) return 1;
    if (viewServings != null && viewServings > 0) {
      return viewServings / recipe.servings;
    }
    if (mealSlot?.servingOverride) {
      return mealSlot.servingOverride / recipe.servings;
    }
    return 1;
  }, [recipe, mealSlot, viewServings]);

  const adjustedIngredients = useMemo(() => {
    if (!recipe) return [];
    return recipe.ingredients.map((ing) => ({
      ...ing,
      quantity: (parseFloat(ing.quantity) * servingMultiplier).toFixed(2).replace(/\.?0+$/, ''),
    }));
  }, [recipe, servingMultiplier]);

  const baseServings = mealSlot?.servingOverride ?? recipe?.servings ?? 0;
  const displayServings = viewServings ?? baseServings;

  // How many of the user's meal slots already reference this recipe.
  const slotCount = useMemo(
    () => (recipe ? mealSlots.filter((s) => s.recipeId === recipe.id).length : 0),
    [mealSlots, recipe?.id]
  );

  // Seed the local servings stepper once the recipe loads (only first time).
  useEffect(() => {
    if (recipe && viewServings == null) {
      setViewServings(baseServings || recipe.servings);
    }
    // We deliberately key only on `recipe?.id` so changing slots doesn't override
    // a user-set stepper value.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.id]);

  // Heart pulse on save-state change.
  useEffect(() => {
    if (recipe?.isSaved) {
      heartScale.value = withSequence(
        withSpring(1.25, { damping: 6, stiffness: 220 }),
        withSpring(1, { damping: 8, stiffness: 200 })
      );
    }
  }, [recipe?.isSaved]);

  const handleToggleSave = useCallback(() => {
    if (!recipe) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggleSaveRecipe(recipe.id);
  }, [recipe, toggleSaveRecipe]);

  // ── Additive callbacks ────────────────────────────────────────────────
  const handleStepServings = useCallback(
    (delta: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setViewServings((prev) => {
        const current = prev ?? baseServings ?? 1;
        const next = Math.max(1, Math.min(24, current + delta));
        return next;
      });
    },
    [baseServings]
  );

  const handleResetServings = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewServings(baseServings || recipe?.servings || 1);
  }, [baseServings, recipe?.servings]);

  const handleToggleIngredient = useCallback((ingredientId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(ingredientId)) next.delete(ingredientId);
      else next.add(ingredientId);
      return next;
    });
  }, []);

  const handleResetChecks = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCheckedIngredients(new Set());
  }, []);

  const handleCopyIngredients = useCallback(async () => {
    if (!recipe) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = adjustedIngredients
      .map((ing) => `• ${ing.quantity} ${ing.unit} ${ing.name}`)
      .join('\n');
    try {
      await Clipboard.setStringAsync(`${recipe.name}\n\n${text}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy ingredients:', err);
    }
  }, [recipe, adjustedIngredients]);

  const handleOpenCookMode = useCallback(() => {
    if (!recipe || recipe.instructions.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCookStep(0);
    setCookModeOpen(true);
  }, [recipe]);

  const handleCookNext = useCallback(() => {
    if (!recipe) return;
    const isLast = cookStep >= recipe.instructions.length - 1;
    if (isLast) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCookModeOpen(false);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCookStep((s) => s + 1);
  }, [recipe, cookStep]);

  const handleCookPrev = useCallback(() => {
    if (cookStep <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCookStep((s) => s - 1);
  }, [cookStep]);

  const handleOpenImage = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImageOpen(true);
  }, []);

  // Sticky compact header scroll handler.
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const stickyHeaderStyle = useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [200, 280], [0, 1], Extrapolation.CLAMP);
    const translateY = interpolate(scrollY.value, [200, 280], [-8, 0], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ translateY }],
      pointerEvents: opacity > 0.5 ? 'auto' : 'none',
    };
  });

  const heartAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }));

  const handleAddToMealPlan = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/select-recipe',
      params: { recipeId: id, mode: 'add-to-plan' }
    });
  }, [router, id]);

  const handleOpenSourceUrl = useCallback(async () => {
    if (!recipe?.sourceUrl) {
      console.warn('[recipe-detail] No sourceUrl available for recipe:', recipe?.name);
      Alert.alert(
        'No Link Available',
        'This recipe doesn\'t have a source link saved.',
        [{ text: 'OK' }]
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    let url = recipe.sourceUrl.trim();
    console.log('[recipe-detail] Original sourceUrl:', url);

    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    console.log('[recipe-detail] Final URL to open:', url);

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        console.warn('[recipe-detail] Cannot open URL:', url);
        Alert.alert(
          'Cannot Open Link',
          'This link cannot be opened on this device. Please try copying the URL and opening it in a browser.',
          [
            { text: 'OK' },
          ]
        );
        return;
      }
      await Linking.openURL(url);
      console.log('[recipe-detail] Successfully opened URL');
    } catch (err) {
      console.error('[recipe-detail] Failed to open source URL:', err);
      Alert.alert(
        'Error Opening Link',
        'There was an error opening the recipe link. Please try again.',
        [{ text: 'OK' }]
      );
    }
  }, [recipe?.sourceUrl]);

  const handleDeletePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowDeleteModal(true);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!recipe) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    deleteRecipe(recipe.id);
    setShowDeleteModal(false);
    router.back();
  }, [recipe, deleteRecipe, router]);

  const handleEditPress = useCallback(() => {
    if (!recipe) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingIngredients([...recipe.ingredients]);
    setEditingInstructions([...recipe.instructions]);
    setEditingImageUrl(recipe.imageUrl);
    setShowEditModal(true);
  }, [recipe]);

  const handleSaveEdits = useCallback(() => {
    if (!recipe || !editingIngredients || !editingInstructions) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateRecipe(recipe.id, {
      ingredients: editingIngredients,
      instructions: editingInstructions,
      ...(editingImageUrl && editingImageUrl !== recipe.imageUrl ? { imageUrl: editingImageUrl } : {}),
    });
    setShowEditModal(false);
  }, [recipe, editingIngredients, editingInstructions, editingImageUrl, updateRecipe]);

  const handlePickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setIsUploadingImage(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        try {
          const uploadResult = await uploadFile(
            asset.uri,
            asset.fileName ?? `recipe-${Date.now()}.jpg`,
            asset.mimeType ?? 'image/jpeg'
          );
          setEditingImageUrl(uploadResult.url);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (uploadError) {
          console.error('Failed to upload image:', uploadError);
          setEditingImageUrl(asset.uri);
        } finally {
          setIsUploadingImage(false);
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      setIsUploadingImage(false);
    }
  }, []);

  const handleTakePhoto = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        console.log('Camera permission denied');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setIsUploadingImage(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        try {
          const uploadResult = await uploadFile(
            asset.uri,
            asset.fileName ?? `recipe-photo-${Date.now()}.jpg`,
            asset.mimeType ?? 'image/jpeg'
          );
          setEditingImageUrl(uploadResult.url);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (uploadError) {
          console.error('Failed to upload photo:', uploadError);
          setEditingImageUrl(asset.uri);
        } finally {
          setIsUploadingImage(false);
        }
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      setIsUploadingImage(false);
    }
  }, []);

  const handleShare = useCallback(async () => {
    if (!recipe) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const ingredientsList = adjustedIngredients
      .map(ing => `• ${ing.quantity} ${ing.unit} ${ing.name}`)
      .join('\n');

    const instructionsList = recipe.instructions
      .map((inst, idx) => `${idx + 1}. ${inst}`)
      .join('\n');

    const shareText = `${recipe.name}\n\nDescription: ${recipe.description}\n\nCooking Time: ${recipe.cookTime} min\nPrep Time: ${recipe.prepTime} min\nServings: ${displayServings}\nCalories: ${recipe.calories}\n\nIngredients:\n${ingredientsList}\n\nInstructions:\n${instructionsList}`;

    try {
      const fileUri = FileSystem.cacheDirectory + `recipe-${recipe.id}.jpg`;
      const download = await FileSystem.downloadAsync(recipe.imageUrl, fileUri);

      if (Platform.OS === 'ios' && download.status === 200) {
        await RNShare.share({
          message: shareText,
          url: download.uri,
        });
      } else {
        await RNShare.share({
          message: shareText,
          title: recipe.name,
        });
      }
    } catch (error) {
      console.error('Error sharing recipe:', error);
    }
  }, [recipe, adjustedIngredients, displayServings]);

  if (!recipe) {
    return (
      <View style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
      }}>
        <Text style={{
          fontFamily: designTokens.font.medium,
          fontSize: 16,
          color: isDark ? '#fff' : designTokens.colors.ink,
        }}>
          Recipe not found
        </Text>
      </View>
    );
  }

  // Source badge label — mirror the Recipes-list denotation so a Plan-My-Meals
  // recipe reads "PnP" here too (not "AI").
  const sourceBadge = recipe.isAIGenerated
    ? { label: 'PnP', Icon: ChefHat }
    : recipe.isImported
      ? { label: 'IMPORTED', Icon: Upload }
      : { label: 'CUSTOM', Icon: User };
  const SourceIcon = sourceBadge.Icon;

  // Header circle button style helper.
  const headerButton = {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF' }}>
      <AnimatedScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* Hero Image (tap → full-screen viewer) */}
        <Pressable onPress={handleOpenImage} style={{ position: 'relative' }}>
          <Image
            source={{ uri: recipe.imageUrl }}
            style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.8, backgroundColor: '#F4F0E8' }}
            contentFit="cover"
            transition={250}
          />
          {/* Subtle top gradient for icon legibility + bottom fade into content */}
          <LinearGradient
            colors={['rgba(0,0,0,0.35)', 'transparent']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 140 }}
          />
          <LinearGradient
            colors={['transparent', isDark ? '#1a1a1a' : '#FFFFFF']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 }}
          />

          {/* Header buttons */}
          <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0 }} edges={['top']}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 }}>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.back();
                }}
                style={headerButton}
              >
                <ArrowLeft size={18} color="#fff" strokeWidth={1.8} />
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={handleEditPress} style={headerButton}>
                  <Edit2 size={16} color="#fff" strokeWidth={1.8} />
                </Pressable>
                <Pressable onPress={handleDeletePress} style={headerButton}>
                  <Trash2 size={16} color="#fff" strokeWidth={1.8} />
                </Pressable>
                <Pressable onPress={handleToggleSave} style={headerButton}>
                  <Animated.View style={heartAnimStyle}>
                    <Heart
                      size={16}
                      color="#fff"
                      strokeWidth={1.8}
                      fill={recipe.isSaved ? '#fff' : 'transparent'}
                    />
                  </Animated.View>
                </Pressable>
                <Pressable onPress={handleShare} style={headerButton}>
                  <Share2 size={16} color="#fff" strokeWidth={1.8} />
                </Pressable>
              </View>
            </View>
          </SafeAreaView>

          {/* Source badge (bottom-left of hero) */}
          <View style={{ position: 'absolute', bottom: 16, left: 16 }}>
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: designTokens.colors.olive,
            }}>
              <SourceIcon size={12} color={designTokens.colors.cream} strokeWidth={1.8} />
              <Text style={{
                fontFamily: designTokens.font.medium,
                fontSize: 10.5,
                letterSpacing: 0.55,
                textTransform: 'uppercase',
                color: designTokens.colors.cream,
              }}>
                {sourceBadge.label}
              </Text>
            </View>
          </View>
        </Pressable>

        {/* Content */}
        <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
          {/* Title block */}
          <Animated.View entering={FadeInUp.delay(100).springify()} style={{ paddingTop: 8, paddingBottom: 16 }}>
            {/* Recipe name — Geist semibold (no italic; one italic accent lives in the bottom CTA). */}
            <Text style={{
              fontFamily: designTokens.font.semibold,
              fontSize: 26,
              lineHeight: 32,
              letterSpacing: -0.5,
              color: isDark ? '#fff' : designTokens.colors.ink,
            }}>
              {recipe.name}
            </Text>
            <Text style={{
              fontFamily: designTokens.font.regular,
              fontSize: 14.5,
              lineHeight: 21,
              color: isDark ? '#888' : designTokens.colors.ink2,
              marginTop: 8,
            }}>
              {recipe.description}
            </Text>

            {/* Source URL */}
            {recipe.sourceUrl && (
              <Pressable
                onPress={handleOpenSourceUrl}
                style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                  backgroundColor: isDark ? '#1f1f1f' : designTokens.colors.cream,
                }}
              >
                <LinkIcon size={12} color={designTokens.colors.olive} strokeWidth={1.8} />
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 12.5,
                    color: designTokens.colors.olive,
                  }}
                >
                  View original recipe
                </Text>
                <ExternalLink size={11} color={designTokens.colors.olive} strokeWidth={1.8} />
              </Pressable>
            )}

            {/* Stat tiles (Time + Calories only — Servings becomes a stepper card below) */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              {[
                { Icon: Clock, label: 'Total time', value: `${recipe.cookTime + recipe.prepTime} min`, tint: designTokens.colors.olive },
                ...(recipe.calories ? [{ Icon: Flame, label: 'Calories', value: `${recipe.calories} cal`, tint: designTokens.colors.olive }] : []),
              ].map((s, idx) => {
                const SIcon = s.Icon;
                return (
                  <View
                    key={idx}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      padding: 10,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                      backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                    }}
                  >
                    <View style={{
                      width: 30, height: 30, borderRadius: 8,
                      borderWidth: 1,
                      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <SIcon size={14} color={s.tint} strokeWidth={1.8} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 10.5,
                          letterSpacing: 0.4,
                          textTransform: 'uppercase',
                          color: isDark ? '#888' : designTokens.colors.ink3,
                        }}
                      >
                        {s.label}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 13.5,
                          color: isDark ? '#fff' : designTokens.colors.ink,
                          marginTop: 1,
                        }}
                      >
                        {s.value}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Servings stepper (additive — drives the existing servingMultiplier memo). */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 14,
                marginTop: 10,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Users size={14} color={designTokens.colors.brand} strokeWidth={1.8} />
                </View>
                <View>
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 10.5,
                      letterSpacing: 0.4,
                      textTransform: 'uppercase',
                      color: isDark ? '#888' : designTokens.colors.ink3,
                    }}
                  >
                    Servings
                  </Text>
                  <Text
                    style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 11.5,
                      color: isDark ? '#888' : designTokens.colors.ink2,
                      marginTop: 1,
                    }}
                  >
                    {viewServings != null && viewServings !== baseServings
                      ? `Scaled from ${baseServings}`
                      : 'Scale up or down'}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                {viewServings != null && viewServings !== baseServings && (
                  <Pressable
                    onPress={handleResetServings}
                    style={{
                      paddingHorizontal: 10,
                      height: 28,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 11.5,
                        color: isDark ? '#ddd' : designTokens.colors.ink2,
                      }}
                    >
                      Reset
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => handleStepServings(-1)}
                  disabled={(viewServings ?? baseServings) <= 1}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: (viewServings ?? baseServings) <= 1 ? 0.4 : 1,
                  }}
                >
                  <CircleMinus size={16} color={isDark ? '#fff' : designTokens.colors.ink} strokeWidth={1.8} />
                </Pressable>
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 18,
                    color: isDark ? '#fff' : designTokens.colors.ink,
                    minWidth: 24,
                    textAlign: 'center',
                  }}
                >
                  {displayServings}
                </Text>
                <Pressable
                  onPress={() => handleStepServings(1)}
                  disabled={(viewServings ?? baseServings) >= 24}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: designTokens.colors.brand,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: (viewServings ?? baseServings) >= 24 ? 0.5 : 1,
                  }}
                >
                  <CirclePlus size={16} color={designTokens.colors.cream} strokeWidth={1.8} />
                </Pressable>
              </View>
            </View>

            {/* "In your plan" indicator (derived from already-subscribed mealSlots). */}
            {slotCount > 0 && (
              <View
                style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: isDark ? 'rgba(84,100,69,0.20)' : '#E8ECDF',
                }}
              >
                <Check size={11} color={designTokens.colors.brand} strokeWidth={2.2} />
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 11.5,
                    color: designTokens.colors.brand,
                  }}
                >
                  In your plan · {slotCount} slot{slotCount !== 1 ? 's' : ''}
                </Text>
              </View>
            )}

            {/* Tags */}
            {recipe.tags && recipe.tags.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
                {[...new Set(recipe.tags)].map((tag, idx) => (
                  <View
                    key={`${tag}-${idx}`}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                      backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                    }}
                  >
                    <Text style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 12,
                      color: isDark ? '#bbb' : designTokens.colors.ink2,
                      textTransform: 'capitalize',
                    }}>
                      {tag}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Animated.View>

          {/* Ingredients */}
          <Animated.View entering={FadeInDown.delay(200).springify()} style={{ marginTop: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 11,
                  letterSpacing: 0.55,
                  textTransform: 'uppercase',
                  color:
                    checkedIngredients.size > 0 && checkedIngredients.size === adjustedIngredients.length
                      ? designTokens.colors.brand
                      : isDark
                        ? '#888'
                        : designTokens.colors.ink3,
                }}
              >
                Ingredients · {checkedIngredients.size > 0
                  ? `${checkedIngredients.size} of ${adjustedIngredients.length} gathered`
                  : adjustedIngredients.length}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {checkedIngredients.size > 0 && (
                  <Pressable
                    onPress={handleResetChecks}
                    style={{
                      paddingHorizontal: 10,
                      height: 26,
                      borderRadius: 13,
                      borderWidth: 1,
                      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 11,
                        color: isDark ? '#ddd' : designTokens.colors.ink2,
                      }}
                    >
                      Reset
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={handleCopyIngredients}
                  hitSlop={6}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Copy size={13} color={isDark ? '#ddd' : designTokens.colors.ink2} strokeWidth={1.8} />
                </Pressable>
              </View>
            </View>

            {/* "Copied" toast (FadeIn/FadeOut, additive, no wiring change). */}
            {copied && (
              <Animated.View
                entering={FadeIn.duration(120)}
                exiting={FadeOut.duration(180)}
                style={{
                  alignSelf: 'flex-start',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: isDark ? 'rgba(84,100,69,0.20)' : '#E8ECDF',
                }}
              >
                <Check size={11} color={designTokens.colors.brand} strokeWidth={2.2} />
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 11.5,
                    color: designTokens.colors.brand,
                  }}
                >
                  Copied to clipboard
                </Text>
              </Animated.View>
            )}

            <View
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                paddingHorizontal: 16,
                paddingVertical: 4,
              }}
            >
              {adjustedIngredients.map((ingredient, index) => {
                const isChecked = checkedIngredients.has(ingredient.id);
                return (
                  <Pressable
                    key={ingredient.id}
                    onPress={() => handleToggleIngredient(ingredient.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 12,
                      borderBottomWidth: index < adjustedIngredients.length - 1 ? 1 : 0,
                      borderBottomColor: isDark ? '#2a2a2a' : designTokens.colors.hair2,
                    }}
                  >
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: isChecked
                          ? designTokens.colors.brand
                          : isDark
                            ? '#2a2a2a'
                            : '#E8ECDF',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}
                    >
                      <Check
                        size={13}
                        color={isChecked ? designTokens.colors.cream : designTokens.colors.brand}
                        strokeWidth={2.2}
                      />
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: designTokens.font.regular,
                        fontSize: 14.5,
                        color: isChecked
                          ? isDark
                            ? '#666'
                            : designTokens.colors.ink3
                          : isDark
                            ? '#fff'
                            : designTokens.colors.ink,
                        textDecorationLine: isChecked ? 'line-through' : 'none',
                      }}
                    >
                      {ingredient.name}
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 13.5,
                        color: isChecked
                          ? isDark
                            ? '#555'
                            : designTokens.colors.ink3
                          : isDark
                            ? '#888'
                            : designTokens.colors.ink2,
                        textDecorationLine: isChecked ? 'line-through' : 'none',
                      }}
                    >
                      {ingredient.quantity} {ingredient.unit}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>

          {/* Instructions */}
          <Animated.View entering={FadeInDown.delay(300).springify()} style={{ marginTop: 22, marginBottom: 130 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 11,
                  letterSpacing: 0.55,
                  textTransform: 'uppercase',
                  color: isDark ? '#888' : designTokens.colors.ink3,
                }}
              >
                Instructions
              </Text>
              {!fromMealPlan && recipe.instructions.length > 0 && (
                <Pressable
                  onPress={handleOpenCookMode}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 12,
                    height: 30,
                    borderRadius: 15,
                    borderWidth: 1,
                    borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                  }}
                >
                  <ChefHat size={13} color={designTokens.colors.brand} strokeWidth={1.8} />
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 12.5,
                      color: isDark ? '#fff' : designTokens.colors.ink,
                    }}
                  >
                    Start cooking
                  </Text>
                </Pressable>
              )}
            </View>

            {recipe.instructions.map((instruction, index) => (
              <View
                key={index}
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  padding: 14,
                  marginBottom: 8,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                  backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                }}
              >
                <View style={{
                  width: 28, height: 28, borderRadius: 14,
                  backgroundColor: isDark ? 'rgba(228,109,70,0.20)' : '#F2E0D9',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 13,
                    color: designTokens.colors.olive,
                  }}>
                    {index + 1}
                  </Text>
                </View>
                <Text style={{
                  flex: 1,
                  fontFamily: designTokens.font.regular,
                  fontSize: 14.5,
                  lineHeight: 21,
                  color: isDark ? '#ddd' : designTokens.colors.ink2,
                  paddingTop: 4,
                }}>
                  {instruction}
                </Text>
              </View>
            ))}
          </Animated.View>
        </View>
      </AnimatedScrollView>

      {/* Sticky compact header (fades in past hero scroll) */}
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
              paddingHorizontal: 16,
              paddingVertical: 8,
              gap: 12,
            }}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArrowLeft size={16} color={isDark ? '#fff' : designTokens.colors.ink} strokeWidth={1.8} />
            </Pressable>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                textAlign: 'center',
                fontFamily: designTokens.font.medium,
                fontSize: 15,
                color: isDark ? '#fff' : designTokens.colors.ink,
              }}
            >
              {recipe.name}
            </Text>
            <View style={{ width: 36 }} />
          </View>
        </SafeAreaView>
      </Animated.View>

      {/* Bottom CTA — "Start cooking" when the recipe is already in the plan
          (opened from a meal-plan slot), otherwise "Add to meal plan". */}
      <View style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        paddingTop: 14,
        paddingBottom: 32,
        backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
        borderTopWidth: 1,
        borderTopColor: isDark ? '#2a2a2a' : designTokens.colors.hair2,
      }}>
        <Pressable
          onPress={fromMealPlan ? handleOpenCookMode : handleAddToMealPlan}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 15,
            borderRadius: 999,
            backgroundColor: designTokens.colors.brand,
          }}
        >
          {fromMealPlan ? (
            <>
              <ChefHat size={18} color={designTokens.colors.cream} strokeWidth={1.8} />
              <Text style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 15,
                color: designTokens.colors.cream,
              }}>
                Start cooking
              </Text>
            </>
          ) : (
            <>
              <CirclePlus size={18} color={designTokens.colors.cream} strokeWidth={1.8} />
              <Text style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 15,
                color: designTokens.colors.cream,
              }}>
                Add to meal{' '}
                <Text style={{
                  fontFamily: designTokens.font.serifItalic,
                  fontStyle: 'italic',
                  fontSize: 17,
                  color: designTokens.colors.cream,
                }}>
                  plan
                </Text>
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Edit Modal */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF' }}>
          <View style={{ flex: 1, paddingTop: insets.top }}>
            {/* Header */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: 12,
              gap: 12,
            }}>
              <Pressable
                onPress={() => setShowEditModal(false)}
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  borderWidth: 1,
                  borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <XIcon size={18} color={isDark ? '#fff' : designTokens.colors.ink} strokeWidth={1.8} />
              </Pressable>
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontFamily: designTokens.font.medium,
                  fontSize: 17,
                  color: isDark ? '#fff' : designTokens.colors.ink,
                }}
              >
                Edit recipe
              </Text>
              <Pressable
                onPress={handleSaveEdits}
                disabled={!editingIngredients || !editingInstructions}
                style={{
                  paddingHorizontal: 16,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: editingIngredients && editingInstructions
                    ? designTokens.colors.brand
                    : (isDark ? '#2a2a2a' : designTokens.colors.hair2),
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 64,
                }}
              >
                <Text style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 13.5,
                  color: editingIngredients && editingInstructions
                    ? designTokens.colors.cream
                    : (isDark ? '#666' : designTokens.colors.ink3),
                }}>
                  Save
                </Text>
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 100 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Photo */}
              <View style={{ paddingHorizontal: 20, marginTop: 6 }}>
                <Text style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 11,
                  letterSpacing: 0.55,
                  textTransform: 'uppercase',
                  color: isDark ? '#888' : designTokens.colors.ink3,
                  marginBottom: 10,
                }}>
                  Recipe photo
                </Text>
                <View style={{
                  position: 'relative',
                  borderRadius: 18,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                }}>
                  {editingImageUrl ? (
                    <Image
                      source={{ uri: editingImageUrl }}
                      style={{ width: '100%', height: 200 }}
                      contentFit="cover"
                      transition={150}
                    />
                  ) : (
                    <View style={{
                      width: '100%',
                      height: 200,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isDark ? '#1f1f1f' : '#F4F0E8',
                    }}>
                      <ImageIcon size={36} color={isDark ? '#555' : designTokens.colors.ink3} strokeWidth={1.6} />
                      <Text style={{
                        marginTop: 8,
                        fontFamily: designTokens.font.regular,
                        fontSize: 13,
                        color: isDark ? '#666' : designTokens.colors.ink3,
                      }}>
                        No image
                      </Text>
                    </View>
                  )}
                  {isUploadingImage && (
                    <View style={{
                      position: 'absolute',
                      top: 0, left: 0, right: 0, bottom: 0,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(0,0,0,0.5)',
                    }}>
                      <ActivityIndicator size="large" color="#fff" />
                      <Text style={{
                        color: '#fff',
                        marginTop: 8,
                        fontFamily: designTokens.font.medium,
                        fontSize: 13,
                      }}>
                        Uploading…
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <Pressable
                    onPress={handlePickImage}
                    disabled={isUploadingImage}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      paddingVertical: 12,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                      backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                      opacity: isUploadingImage ? 0.5 : 1,
                    }}
                  >
                    <ImageIcon size={16} color={designTokens.colors.brand} strokeWidth={1.8} />
                    <Text style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 13.5,
                      color: isDark ? '#fff' : designTokens.colors.ink,
                    }}>
                      Gallery
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleTakePhoto}
                    disabled={isUploadingImage}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      paddingVertical: 12,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                      backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                      opacity: isUploadingImage ? 0.5 : 1,
                    }}
                  >
                    <Camera size={16} color={designTokens.colors.brand} strokeWidth={1.8} />
                    <Text style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 13.5,
                      color: isDark ? '#fff' : designTokens.colors.ink,
                    }}>
                      Camera
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Ingredients editor */}
              <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}>
                  <Text style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 11,
                    letterSpacing: 0.55,
                    textTransform: 'uppercase',
                    color: isDark ? '#888' : designTokens.colors.ink3,
                  }}>
                    Ingredients
                  </Text>
                  <Pressable
                    onPress={() => {
                      setEditingIngredients(prev =>
                        prev ? [...prev, {
                          id: Date.now().toString(),
                          name: '',
                          quantity: '',
                          unit: '',
                          category: 'other'
                        }] : null
                      );
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 12,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor: designTokens.colors.brand,
                    }}
                  >
                    <CirclePlus size={13} color={designTokens.colors.cream} strokeWidth={1.8} />
                    <Text style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 12.5,
                      color: designTokens.colors.cream,
                    }}>
                      Add
                    </Text>
                  </Pressable>
                </View>

                {editingIngredients?.map((ing, index) => (
                  <View
                    key={ing.id}
                    style={{
                      padding: 12,
                      marginBottom: 10,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                      backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <TextInput
                        value={ing.name}
                        onChangeText={(text) => {
                          setEditingIngredients(prev =>
                            prev ? prev.map((i, idx) => idx === index ? { ...i, name: text } : i) : null
                          );
                        }}
                        placeholder="Ingredient name"
                        placeholderTextColor={isDark ? '#666' : designTokens.colors.ink3}
                        style={{
                          flex: 1,
                          fontFamily: designTokens.font.medium,
                          fontSize: 14,
                          color: isDark ? '#fff' : designTokens.colors.ink,
                          paddingVertical: 4,
                        }}
                      />
                      <Pressable
                        onPress={() => {
                          setEditingIngredients(prev => prev ? prev.filter((_, i) => i !== index) : null);
                        }}
                        hitSlop={8}
                      >
                        <XIcon size={16} color={isDark ? '#888' : designTokens.colors.ink3} strokeWidth={1.8} />
                      </Pressable>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TextInput
                        value={ing.quantity}
                        onChangeText={(text) => {
                          setEditingIngredients(prev =>
                            prev ? prev.map((i, idx) => idx === index ? { ...i, quantity: text } : i) : null
                          );
                        }}
                        placeholder="Qty"
                        placeholderTextColor={isDark ? '#666' : designTokens.colors.ink3}
                        style={{
                          flex: 1,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                          backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
                          fontFamily: designTokens.font.regular,
                          fontSize: 14,
                          color: isDark ? '#fff' : designTokens.colors.ink,
                        }}
                      />
                      <TextInput
                        value={ing.unit}
                        onChangeText={(text) => {
                          setEditingIngredients(prev =>
                            prev ? prev.map((i, idx) => idx === index ? { ...i, unit: text } : i) : null
                          );
                        }}
                        placeholder="Unit"
                        placeholderTextColor={isDark ? '#666' : designTokens.colors.ink3}
                        style={{
                          flex: 1,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                          backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
                          fontFamily: designTokens.font.regular,
                          fontSize: 14,
                          color: isDark ? '#fff' : designTokens.colors.ink,
                        }}
                      />
                    </View>
                  </View>
                ))}
              </View>

              {/* Instructions editor */}
              <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}>
                  <Text style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 11,
                    letterSpacing: 0.55,
                    textTransform: 'uppercase',
                    color: isDark ? '#888' : designTokens.colors.ink3,
                  }}>
                    Instructions
                  </Text>
                  <Pressable
                    onPress={() => {
                      setEditingInstructions(prev =>
                        prev ? [...prev, ''] : null
                      );
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 12,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor: designTokens.colors.brand,
                    }}
                  >
                    <CirclePlus size={13} color={designTokens.colors.cream} strokeWidth={1.8} />
                    <Text style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 12.5,
                      color: designTokens.colors.cream,
                    }}>
                      Add step
                    </Text>
                  </Pressable>
                </View>

                {editingInstructions?.map((inst, index) => (
                  <View
                    key={index}
                    style={{
                      padding: 12,
                      marginBottom: 10,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                      backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <View style={{
                        width: 28, height: 28, borderRadius: 14,
                        backgroundColor: isDark ? 'rgba(228,109,70,0.20)' : '#F2E0D9',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 13,
                          color: designTokens.colors.olive,
                        }}>
                          {index + 1}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          setEditingInstructions(prev => prev ? prev.filter((_, i) => i !== index) : null);
                        }}
                        hitSlop={8}
                      >
                        <XIcon size={16} color={isDark ? '#888' : designTokens.colors.ink3} strokeWidth={1.8} />
                      </Pressable>
                    </View>
                    <TextInput
                      value={inst}
                      onChangeText={(text) => {
                        setEditingInstructions(prev =>
                          prev ? prev.map((i, idx) => idx === index ? text : i) : null
                        );
                      }}
                      placeholder="Enter instruction…"
                      placeholderTextColor={isDark ? '#666' : designTokens.colors.ink3}
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                        backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
                        fontFamily: designTokens.font.regular,
                        fontSize: 14,
                        color: isDark ? '#fff' : designTokens.colors.ink,
                        minHeight: 70,
                      }}
                    />
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
          backgroundColor: 'rgba(0,0,0,0.55)',
        }}>
          <View style={{
            width: '100%',
            maxWidth: 380,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
            backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
            padding: 24,
            alignItems: 'center',
          }}>
            <View style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: isDark ? 'rgba(228,109,70,0.20)' : 'rgba(228,109,70,0.10)',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}>
              <AlertTriangle size={28} color={designTokens.colors.olive} strokeWidth={1.8} />
            </View>

            <Text style={{
              fontFamily: designTokens.font.medium,
              fontSize: 18,
              textAlign: 'center',
              color: isDark ? '#fff' : designTokens.colors.ink,
              marginBottom: 8,
            }}>
              Delete recipe?
            </Text>
            <Text style={{
              fontFamily: designTokens.font.regular,
              fontSize: 14,
              lineHeight: 20,
              textAlign: 'center',
              color: isDark ? '#888' : designTokens.colors.ink2,
              marginBottom: 22,
            }}>
              Are you sure you want to delete "{recipe.name}"? This action cannot be undone.
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <Pressable
                onPress={() => setShowDeleteModal(false)}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 14,
                  color: isDark ? '#ddd' : designTokens.colors.ink2,
                }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmDelete}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: designTokens.colors.olive,
                }}
              >
                <Text style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 14,
                  color: designTokens.colors.cream,
                }}>
                  Delete
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Full-screen Image Viewer */}
      <Modal
        visible={imageOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setImageOpen(false)}
      >
        <Pressable
          onPress={() => setImageOpen(false)}
          style={{
            flex: 1,
            backgroundColor: '#000',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Image
            source={{ uri: recipe.imageUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="contain"
            transition={200}
          />
          <SafeAreaView
            edges={['top']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
            pointerEvents="box-none"
          >
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 16 }}>
              <Pressable
                onPress={() => setImageOpen(false)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <XIcon size={18} color="#fff" strokeWidth={1.8} />
              </Pressable>
            </View>
          </SafeAreaView>
        </Pressable>
      </Modal>

      {/* Cook Mode — full-screen step viewer (uses expo-keep-awake while open) */}
      <Modal
        visible={cookModeOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCookModeOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF' }}>
          {cookModeOpen && <CookModeAwakeGuard />}
          <SafeAreaView style={{ flex: 1 }} edges={['top']}>
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                paddingTop: 8,
                paddingBottom: 12,
              }}
            >
              <Pressable
                onPress={() => setCookModeOpen(false)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <XIcon size={18} color={isDark ? '#fff' : designTokens.colors.ink} strokeWidth={1.8} />
              </Pressable>
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 15,
                  color: isDark ? '#fff' : designTokens.colors.ink,
                }}
              >
                Step {cookStep + 1} of {recipe.instructions.length}
              </Text>
              <View style={{ width: 40 }} />
            </View>

            {/* Progress bar */}
            <View
              style={{
                marginHorizontal: 20,
                height: 4,
                borderRadius: 2,
                backgroundColor: isDark ? '#2a2a2a' : designTokens.colors.hair2,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: '100%',
                  width: `${((cookStep + 1) / Math.max(1, recipe.instructions.length)) * 100}%`,
                  backgroundColor: designTokens.colors.olive,
                  borderRadius: 2,
                }}
              />
            </View>

            {/* Step body */}
            <View
              style={{
                flex: 1,
                paddingHorizontal: 24,
                paddingTop: 36,
                justifyContent: 'flex-start',
              }}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: isDark ? 'rgba(228,109,70,0.20)' : '#F2E0D9',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 22,
                }}
              >
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 22,
                    color: designTokens.colors.olive,
                  }}
                >
                  {cookStep + 1}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: designTokens.font.regular,
                  fontSize: 19,
                  lineHeight: 28,
                  color: isDark ? '#fff' : designTokens.colors.ink,
                }}
              >
                {recipe.instructions[cookStep] ?? ''}
              </Text>
            </View>

            {/* Footer controls */}
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 12,
                paddingBottom: 28,
                flexDirection: 'row',
                gap: 10,
                borderTopWidth: 1,
                borderTopColor: isDark ? '#2a2a2a' : designTokens.colors.hair2,
              }}
            >
              <Pressable
                onPress={handleCookPrev}
                disabled={cookStep === 0}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                  opacity: cookStep === 0 ? 0.4 : 1,
                }}
              >
                <ChevronLeft size={16} color={isDark ? '#ddd' : designTokens.colors.ink2} strokeWidth={1.8} />
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 14,
                    color: isDark ? '#ddd' : designTokens.colors.ink2,
                  }}
                >
                  Previous
                </Text>
              </Pressable>
              <Pressable
                onPress={handleCookNext}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 999,
                  backgroundColor: designTokens.colors.brand,
                }}
              >
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 14,
                    color: designTokens.colors.cream,
                  }}
                >
                  {cookStep >= recipe.instructions.length - 1 ? 'Done' : 'Next'}
                </Text>
                {cookStep < recipe.instructions.length - 1 && (
                  <ChevronRight size={16} color={designTokens.colors.cream} strokeWidth={1.8} />
                )}
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}
