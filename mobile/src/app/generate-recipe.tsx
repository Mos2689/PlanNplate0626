import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Modal, Image, KeyboardAvoidingView, Keyboard, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import {
  X,
  Coffee,
  Sun,
  Moon,
  ChefHat,
  Check,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Pencil,
  Lock,
  Repeat,
  Zap,
  // Premium icon swaps (no Sparkles anywhere in this screen).
  Wand2,
  UtensilsCrossed,
  AlertTriangle,
  RefreshCcw,
  Library,
  CirclePlus,
  CircleMinus,
  Clock,
  Flame,
  Users,
  Leaf,
  Droplet,
  ArrowRight,
} from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeIn,
  FadeOut,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import * as Haptics from 'expo-haptics';
import { useMutation } from '@tanstack/react-query';
import { useMealPlanStore, mergePersonaWithUserInstructions, type Recipe, type Ingredient, type MealSlot, type UserPreferences } from '@/lib/store';
import { useIsAccountPaused, useIsPremium } from '@/lib/subscription-store';
import { useRecipeFeatureGate } from '@/hooks/useRecipeFeatureGate';
import { useAuthStore } from '@/lib/auth-store';
import { generateRecipe, generateMealPlan, generateRecipeImage, regenerateSingleRecipe, isOpenAIConfigured, type GeneratedRecipeResponse, type MealType } from '@/lib/openai';
import { useColorScheme } from '@/lib/useColorScheme';
import { cn } from '@/lib/cn';
import { getRateLimitStatus, type RateLimitStatus } from '@/lib/rate-limit-store';
import { useOptimizedGeneration } from '@/lib/use-optimized-generation';
import { initializeCacheTable } from '@/lib/recipe-cache';
import { isDateSelectable } from '@/lib/date-restrictions';
import { validateIngredients } from '@/lib/ingredient-validator';
import { designTokens, elevation, getThemeColors } from '@/lib/design-tokens';
import { VibeDeck } from '@/components/VibeDeck';
import { InferredFridgeChips } from '@/components/InferredFridgeChips';
import {
  inferLikelyFridgeIngredients,
  buildVibePromptAddendum,
  VIBE_BY_ID,
  type VibeId,
} from '@/lib/vibe-inference';

const MEAL_TYPES = [
  { key: 'breakfast', label: 'Breakfast', icon: Coffee },
  { key: 'lunch', label: 'Lunch', icon: Sun },
  { key: 'dinner', label: 'Dinner', icon: Moon },
  { key: 'snack', label: 'Snack', icon: UtensilsCrossed },
] as const;

// Per-meal-type tint mapping (matches the design's calmer earth tones across the rest of the app).
const MEAL_TYPE_TINT: Record<string, { tint: string; accent: string }> = {
  breakfast: { tint: '#F4EBDB', accent: '#A77B3B' }, // bakery warm tan
  lunch: { tint: '#FAF7F0', accent: '#7A6A3A' }, // cream
  dinner: { tint: '#E1E8EE', accent: '#4B6A86' }, // slate blue
  snack: { tint: '#E8ECDF', accent: '#546445' }, // sage
};

// ── AI-loader status labels (rotate every ~2.5s while pending without real progress) ──
const LOADER_LABELS_RECIPE = [
  'Reading your preferences…',
  'Picking ingredients…',
  'Composing the recipe…',
  'Plating up…',
];
const LOADER_LABELS_PLAN = [
  'Reading your preferences…',
  'Designing the week…',
  'Composing recipes…',
  'Tidying the plate…',
];

// ── Orbital Cooking Hero — SVG arc + 3 orbiting cooking icons + center anchor ──
// Each icon's translateX/translateY is computed per-frame from a shared `orbitAngle`
// shared value (cos/sin), so motion runs entirely on the UI thread and stays smooth.
function OrbitalCookingHero({ hasProgress, percent }: { hasProgress: boolean; percent: number }) {
  // Geometry
  const SIZE = 132;
  const STROKE_W = 3;
  const RING_R = 54;
  const CIRC = 2 * Math.PI * RING_R; // ~339.29
  const ORBIT_R = 34; // inner orbit radius for icons

  // Shared values
  const ringRotate = useSharedValue(0);
  const dashOffset = useSharedValue(CIRC);
  const orbitAngle = useSharedValue(0); // 0..360, drives all 3 icons
  const iconPulse0 = useSharedValue(1);
  const iconPulse1 = useSharedValue(1);
  const iconPulse2 = useSharedValue(1);

  useEffect(() => {
    // Faster, clearly-visible orbit (~4s/rev).
    orbitAngle.value = withRepeat(
      withTiming(360, { duration: 4000, easing: Easing.linear }),
      -1,
      false
    );
    const pulse = () =>
      withRepeat(
        withSequence(
          withTiming(1.18, { duration: 700, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.94, { duration: 700, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      );
    iconPulse0.value = pulse();
    iconPulse1.value = withDelay(250, pulse());
    iconPulse2.value = withDelay(500, pulse());
  }, []);

  // Drive the arc based on mode.
  useEffect(() => {
    if (hasProgress) {
      const targetOffset = CIRC * (1 - Math.max(0, Math.min(100, percent)) / 100);
      dashOffset.value = withTiming(targetOffset, { duration: 350, easing: Easing.out(Easing.cubic) });
      ringRotate.value = withTiming(0, { duration: 300 });
    } else {
      dashOffset.value = withRepeat(
        withSequence(
          withTiming(CIRC * 0.20, { duration: 750, easing: Easing.inOut(Easing.ease) }),
          withTiming(CIRC * 0.75, { duration: 750, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
      ringRotate.value = withRepeat(
        withTiming(360, { duration: 2200, easing: Easing.linear }),
        -1,
        false
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProgress, percent]);

  const animatedRingProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${ringRotate.value}deg` }],
  }));

  // 3 phase offsets in degrees (120° apart).
  // Per-icon style: position from cos/sin on the UI thread + independent scale pulse.
  const icon0Style = useAnimatedStyle(() => {
    const rad = ((orbitAngle.value + 0) * Math.PI) / 180;
    return {
      transform: [
        { translateX: Math.cos(rad) * ORBIT_R },
        { translateY: Math.sin(rad) * ORBIT_R },
        { scale: iconPulse0.value },
      ],
    };
  });
  const icon1Style = useAnimatedStyle(() => {
    const rad = ((orbitAngle.value + 120) * Math.PI) / 180;
    return {
      transform: [
        { translateX: Math.cos(rad) * ORBIT_R },
        { translateY: Math.sin(rad) * ORBIT_R },
        { scale: iconPulse1.value },
      ],
    };
  });
  const icon2Style = useAnimatedStyle(() => {
    const rad = ((orbitAngle.value + 240) * Math.PI) / 180;
    return {
      transform: [
        { translateX: Math.cos(rad) * ORBIT_R },
        { translateY: Math.sin(rad) * ORBIT_R },
        { scale: iconPulse2.value },
      ],
    };
  });

  // Center-dot subtle pulse so even the anchor feels alive.
  const centerStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + 0.35 * Math.abs(Math.sin((orbitAngle.value * Math.PI) / 180)),
  }));

  // Arc stroke colour transitions olive → sage past 50%.
  const strokeColor = hasProgress && percent >= 50 ? designTokens.colors.brand : designTokens.colors.olive;

  // Icon tints chosen to read on charcoal #181612.
  const ICON_TINT_LEAF = '#A8BC91';
  const ICON_TINT_FLAME = designTokens.colors.olive;
  const ICON_TINT_DROP = '#88A4C2';
  const half = SIZE / 2;

  // Helper to render each orbiting icon stack.
  const renderOrbitIcon = (
    Icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>,
    color: string,
    iconStyle: any,
    key: number
  ) => (
    <Animated.View
      key={key}
      style={[
        {
          position: 'absolute',
          left: half - 14,
          top: half - 14,
          width: 28,
          height: 28,
          alignItems: 'center',
          justifyContent: 'center',
        },
        iconStyle,
      ]}
    >
      <Icon size={20} color={color} strokeWidth={1.9} />
    </Animated.View>
  );

  return (
    <View
      style={{
        width: SIZE,
        height: SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 22,
      }}
    >
      {/* SVG arc + track */}
      <Animated.View style={[{ position: 'absolute', width: SIZE, height: SIZE }, ringStyle]}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Circle
            cx={half}
            cy={half}
            r={RING_R}
            stroke="rgba(246,242,233,0.10)"
            strokeWidth={STROKE_W}
            fill="none"
          />
          <AnimatedCircle
            cx={half}
            cy={half}
            r={RING_R}
            stroke={strokeColor}
            strokeWidth={STROKE_W}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${CIRC} ${CIRC}`}
            animatedProps={animatedRingProps}
            transform={`rotate(-90 ${half} ${half})`}
          />
        </Svg>
      </Animated.View>

      {/* Three orbiting icons (each animates its own translate on the UI thread) */}
      {renderOrbitIcon(Leaf, ICON_TINT_LEAF, icon0Style, 0)}
      {renderOrbitIcon(Flame, ICON_TINT_FLAME, icon1Style, 1)}
      {renderOrbitIcon(Droplet, ICON_TINT_DROP, icon2Style, 2)}

      {/* Center anchor (subtle breath) */}
      <Animated.View
        style={[
          {
            width: 5,
            height: 5,
            borderRadius: 3,
            backgroundColor: '#F6F2E9',
          },
          centerStyle,
        ]}
      />
    </View>
  );
}

// ── Indeterminate shimmer-sweep bar (cream-on-charcoal variant) ────────────
function GenerationShimmerBar() {
  const tx = useSharedValue(-110);
  useEffect(() => {
    tx.value = withRepeat(
      withTiming(110, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, []);
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: `${tx.value}%` as any }],
  }));

  return (
    <View
      style={{
        width: '100%',
        height: 4,
        borderRadius: 999,
        overflow: 'hidden',
        backgroundColor: 'rgba(246,242,233,0.10)',
      }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '40%',
            borderRadius: 999,
            backgroundColor: designTokens.colors.olive,
          },
          fillStyle,
        ]}
      />
    </View>
  );
}

// ── Determinate gradient progress bar (cream-on-charcoal variant) ──────────
function GenerationProgressBar({ percent }: { percent: number }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(Math.max(0, Math.min(100, percent)), { duration: 350, easing: Easing.out(Easing.cubic) });
  }, [percent]);
  const widthStyle = useAnimatedStyle(() => ({
    width: `${width.value}%` as any,
  }));
  return (
    <View
      style={{
        width: '100%',
        height: 4,
        borderRadius: 999,
        overflow: 'hidden',
        backgroundColor: 'rgba(246,242,233,0.10)',
      }}
    >
      <Animated.View style={[{ height: '100%', borderRadius: 999 }, widthStyle]}>
        <LinearGradient
          colors={[designTokens.colors.olive, designTokens.colors.brand]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1, borderRadius: 999 }}
        />
      </Animated.View>
    </View>
  );
}

// ── Rotating status label (cream-on-charcoal) ─────────────────────────────
function GenerationStatusLabel({
  isPending,
  hasProgress,
  isMealPlan,
  completed,
  total,
  cachedCount,
}: {
  isPending: boolean;
  hasProgress: boolean;
  isMealPlan: boolean;
  completed: number;
  total: number;
  cachedCount?: number;
}) {
  const [labelIdx, setLabelIdx] = useState(0);
  const labels = isMealPlan ? LOADER_LABELS_PLAN : LOADER_LABELS_RECIPE;

  useEffect(() => {
    if (!isPending) return;
    setLabelIdx(0);
    const interval = setInterval(() => {
      setLabelIdx((i) => (i + 1) % labels.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [isPending, labels.length]);

  // When real progress arrives, the body line reflects it; we still rotate every 2.5s
  // so the "X of Y" line and a cached-info line can take turns.
  let text: string;
  if (hasProgress) {
    if (cachedCount && cachedCount > 0 && labelIdx % 3 === 2) {
      text = `${cachedCount} cache ${cachedCount === 1 ? 'hit' : 'hits'} keeping it fast…`;
    } else {
      text = `Recipe ${completed} of ${total} ready`;
    }
  } else {
    text = labels[labelIdx];
  }

  return (
    <Animated.Text
      key={text}
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(180)}
      style={{
        fontFamily: designTokens.font.regular,
        fontSize: 14,
        color: 'rgba(246,242,233,0.70)',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 20,
        minHeight: 20,
      }}
    >
      {text}
    </Animated.Text>
  );
}

// Stock images for generated recipes (from Unsplash)
const STOCK_IMAGES = [
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
  'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=400',
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400',
  'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=400',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400',
  'https://images.unsplash.com/photo-1499028344343-cd173ffc68a9?w=400',
  'https://images.unsplash.com/photo-1482049016gy-2107e8aa1b16?w=400',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400',
];

function getRandomStockImage(): string {
  return STOCK_IMAGES[Math.floor(Math.random() * STOCK_IMAGES.length)];
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCalendarDays(year: number, month: number): Array<Date | null> {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay();

  const days: Array<Date | null> = [];

  // Add empty slots for days before the first of the month
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null);
  }

  // Add all days of the month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }

  return days;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function GenerateRecipeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = getThemeColors(isDark);

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const isPaused = useIsAccountPaused();
  // Vibe cooking: one free use, then the paywall (independent per-feature gate).
  const recipeGate = useRecipeFeatureGate('vibe', 'vibe-cooking');
  const isPremium = useIsPremium();
  const currentUser = useAuthStore((s) => s.currentUser);

  const preferences = useMealPlanStore((s) => s.preferences);
  const recipes = useMealPlanStore((s) => s.recipes);
  const addRecipe = useMealPlanStore((s) => s.addRecipe);
  const addMealToSlot = useMealPlanStore((s) => s.addMealToSlot);
  // Hand-off setter for the Vibe Cooking full-page experience. The
  // /vibe-cooking route reads this on mount; we set it RIGHT BEFORE
  // router.push so the screen finds the payload synchronously.
  const setLastVibeCook = useMealPlanStore((s) => s.setLastVibeCook);
  const lastVibeCook = useMealPlanStore((s) => s.lastVibeCook);
  const clearLastVibeCook = useMealPlanStore((s) => s.clearLastVibeCook);
  // Subscriptions for Vibe Cooking fridge inference. Each returns a
  // primitive array reference so re-renders only fire when the
  // underlying slice actually changes.
  const vibeCookingLogs = useMealPlanStore((s) => s.cookingLogs);
  const vibeSavedGroceryLists = useMealPlanStore((s) => s.savedGroceryLists);
  const vibeGroceryItems = useMealPlanStore((s) => s.groceryItems);

  // Deduplicate recipes by name (keep first occurrence)
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

  const [selectedMealTypes, setSelectedMealTypes] = useState<Array<'breakfast' | 'lunch' | 'dinner' | 'snack'>>(['dinner']);
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [customCookingInstructions, setCustomCookingInstructions] = useState('');

  // ── Vibe Cooking state ──
  // The mood the user has picked from the VibeDeck. Required before
  // the Cook this vibe CTA enables. Single-select.
  const [selectedVibeId, setSelectedVibeId] = useState<VibeId | null>(null);
  // Fridge ingredients shown as removable chips. Auto-populated on
  // mount from the user's last-7-day cooking history + most recent
  // grocery list via `inferLikelyFridgeIngredients`. User can remove
  // any chip or add more via the inline input.
  const [fridgeIngredients, setFridgeIngredients] = useState<string[]>([]);
  // Seed the fridge once when the screen mounts. We intentionally do
  // NOT re-derive on every store change — once the user has started
  // curating the chips (removing items, adding their own), we don't
  // want a background grocery refresh to clobber their edits.
  const fridgeSeededRef = useRef(false);
  useEffect(() => {
    if (fridgeSeededRef.current) return;
    fridgeSeededRef.current = true;
    const inferred = inferLikelyFridgeIngredients({
      now: new Date(),
      cookingLogs: vibeCookingLogs,
      recipes,
      savedGroceryLists: vibeSavedGroceryLists,
      groceryItems: vibeGroceryItems,
    });
    setFridgeIngredients(inferred);
    // intentionally empty deps — seed exactly once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [generatedRecipe, setGeneratedRecipe] = useState<GeneratedRecipeResponse | null>(null);
  const [generatedMealPlan, setGeneratedMealPlan] = useState<GeneratedRecipeResponse[]>([]);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [showMealPlanModal, setShowMealPlanModal] = useState(false);
  const [selectedExistingRecipes, setSelectedExistingRecipes] = useState<string[]>([]);
  const [showRecipePicker, setShowRecipePicker] = useState(false);

  // Calendar state for date range selection
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [isCustomMode, setIsCustomMode] = useState(false); // Track if user is in custom range selection mode
  const [presetDays, setPresetDays] = useState<number>(1); // Track active preset (1, 3, 7, or 0 for custom)
  const [customSelectingEnd, setCustomSelectingEnd] = useState(false); // Track if next tap sets end date
  const [optimizeGrocery, setOptimizeGrocery] = useState(true); // Enabled by default for meal plans
  const [allowRepeats, setAllowRepeats] = useState(false); // Allow repeating recipes (typically for lunch/dinner)

  // Local preferences for this generation session only (doesn't affect saved preferences)
  const [localPreferences, setLocalPreferences] = useState<UserPreferences>(preferences);
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const [showAllRecipes, setShowAllRecipes] = useState(false);
  const [rateLimitStatus, setRateLimitStatus] = useState<RateLimitStatus | null>(null);

  const isConfigured = isOpenAIConfigured();

  // Initialize optimized generation hook
  const { generateRecipes, progress: generationProgress, isGenerating: optimizedIsGenerating } = useOptimizedGeneration();

  // Load rate limit status on mount and after each generation
  useEffect(() => {
    getRateLimitStatus().then(setRateLimitStatus);
  }, [generatedMealPlan, generatedRecipe]);

  // Initialize recipe cache table on mount
  useEffect(() => {
    initializeCacheTable();
  }, []);

  // Calculate number of days in the selected range
  const numberOfDays = useMemo(() => {
    if (!endDate) return 1;
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  }, [startDate, endDate]);

  const isMealPlan = numberOfDays > 1 || selectedMealTypes.length > 1;

  // Max recipes allowed: 31 days × 4 meal types = 124
  const MAX_RECIPES_LIMIT = 100;

  // Calculate total recipes needed and how many to generate
  const totalRecipesNeeded = useMemo(() => {
    return numberOfDays * selectedMealTypes.length;
  }, [numberOfDays, selectedMealTypes]);

  const recipesToGenerate = useMemo(() => {
    return Math.max(0, totalRecipesNeeded - selectedExistingRecipes.length);
  }, [totalRecipesNeeded, selectedExistingRecipes.length]);

  // Calculate estimated generation time based on unique recipes
  // Rule: 1 unique recipe = ~10 seconds
  const estimatedTimeLabel = useMemo(() => {
    if (!isMealPlan) return '~10 sec';

    // Calculate unique recipes to generate based on allowRepeats logic
    // Same logic as optimized-recipe-generation.ts
    const repeatableMealTypes = selectedMealTypes.filter(mt => mt === 'lunch' || mt === 'dinner');
    let maxAllowedRepeats = 0;

    if (allowRepeats && repeatableMealTypes.length > 0) {
      const repeatableMealCount = recipesToGenerate;
      if (repeatableMealCount >= 14) maxAllowedRepeats = 4;
      else if (repeatableMealCount >= 9) maxAllowedRepeats = 3;
      else if (repeatableMealCount >= 5) maxAllowedRepeats = 2;
      else if (repeatableMealCount >= 3) maxAllowedRepeats = 1;
    }

    const uniqueRecipes = allowRepeats && maxAllowedRepeats > 0
      ? recipesToGenerate - maxAllowedRepeats
      : recipesToGenerate;

    // ~10 seconds per unique recipe
    const estimatedSeconds = uniqueRecipes * 10;

    if (estimatedSeconds <= 30) return '~30 sec';
    if (estimatedSeconds <= 60) return '~1 min';
    if (estimatedSeconds <= 90) return '~1.5 min';
    if (estimatedSeconds <= 120) return '~2 min';
    if (estimatedSeconds <= 180) return '~3 min';
    if (estimatedSeconds <= 300) return '~5 min';
    return `~${Math.ceil(estimatedSeconds / 60)} min`;
  }, [isMealPlan, recipesToGenerate, selectedMealTypes, allowRepeats]);

  // Check if selection exceeds the monthly limit
  const isOverLimit = totalRecipesNeeded > MAX_RECIPES_LIMIT;

  const calendarDays = useMemo(() => {
    return getCalendarDays(calendarMonth.getFullYear(), calendarMonth.getMonth());
  }, [calendarMonth]);

  const monthYearLabel = useMemo(() => {
    return calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [calendarMonth]);

  // Check if we can navigate to previous month
  const canNavigatePrevMonth = useMemo(() => {
    if (!currentUser?.createdAt) return false;
    const prevMonth = new Date(calendarMonth);
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const firstDayOfPrevMonth = new Date(prevMonth);
    firstDayOfPrevMonth.setDate(1);
    return isDateSelectable(firstDayOfPrevMonth, currentUser.createdAt);
  }, [calendarMonth, currentUser?.createdAt]);

  const navigateCalendarMonth = useCallback((direction: 'prev' | 'next') => {
    // Don't navigate if user account creation date is unavailable
    if (!currentUser?.createdAt) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCalendarMonth(prev => {
      const newMonth = new Date(prev);
      newMonth.setMonth(newMonth.getMonth() + (direction === 'next' ? 1 : -1));

      // For previous navigation, check if the month is before the allowed range
      if (direction === 'prev') {
        // Check if the first day of the new month is within the allowed range
        const firstDayOfMonth = new Date(newMonth);
        firstDayOfMonth.setDate(1);
        if (!isDateSelectable(firstDayOfMonth, currentUser.createdAt)) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          return prev; // Don't change month
        }
      }

      return newMonth;
    });
  }, [currentUser?.createdAt]);

  // Vibe Cooking is a "right now, one recipe" experience — meal type
  // is single-select. Tapping a meal type replaces the current
  // selection rather than toggling into a multi-select array.
  const toggleMealType = useCallback((mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMealTypes([mealType]);
  }, []);

  const toggleExistingRecipe = useCallback((recipeId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedExistingRecipes(prev => {
      if (prev.includes(recipeId)) {
        return prev.filter(id => id !== recipeId);
      }
      return [...prev, recipeId];
    });
  }, []);

  // Single recipe generation
  const generateMutation = useMutation({
    mutationFn: () => {
      // Vibe Cooking — compose the vibe's creative-direction snippet +
      // the fridge ingredient bullet list, and append both to the
      // persona-merged custom instructions. The engine treats this as
      // additional context the LLM should respect.
      const baseInstructions = mergePersonaWithUserInstructions(
        localPreferences,
        customCookingInstructions,
      );
      const vibeAddendum = buildVibePromptAddendum(
        selectedVibeId,
        fridgeIngredients,
      );
      const enrichedInstructions = vibeAddendum
        ? `${baseInstructions}\n\n${vibeAddendum}`
        : baseInstructions;
      // Fridge ingredients also flow into additionalInstructions as a
      // simple comma-joined string — preserves existing engine-side
      // ingredient-extraction logic that expects this shape.
      const fridgeAsString = fridgeIngredients.join(', ');
      return generateRecipe({
        mealTypes: selectedMealTypes,
        preferences: localPreferences,
        additionalInstructions:
          fridgeAsString.trim().length > 0 ? fridgeAsString : undefined,
        customCookingInstructions: enrichedInstructions,
      });
    },
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      recipeGate.markUsed(); // successful generation — spend the free vibe use
      setGeneratedRecipe(data);
      setGeneratedMealPlan([]);

      // Vibe Cooking handoff. If the user picked a mood, we replace the
      // generate-recipe modal with the full-page Vibe Cooking screen.
      // Using replace (not push) ensures Vibe Cooking is a standalone
      // screen, not a nested child of the modal. Existing non-vibe flows
      // (single-recipe footer etc.) are unchanged.
      if (selectedVibeId) {
        setLastVibeCook({ recipe: data, vibeId: selectedVibeId });
        setShowRecipeModal(false);
        router.replace('/vibe-cooking');
      } else {
        setShowRecipeModal(true); // legacy bottom-sheet path
      }
    },
    onError: (error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.error('Generate recipe error:', error);
    },
  });

  // Meal plan generation - uses optimized parallel generation with caching
  const mealPlanMutation = useMutation({
    mutationFn: async (numToGenerate: number) => {
      console.log('=== GENERATING MEAL PLAN (OPTIMIZED) ===');
      console.log('Recipes to generate:', numToGenerate);
      console.log('Meal types:', selectedMealTypes);
      console.log('Allow repeats:', allowRepeats);
      console.log('Using parallel batches with caching...');

      return generateRecipes(
        selectedMealTypes,
        localPreferences,
        numToGenerate,
        optimizeGrocery,
        allowRepeats,
        additionalInstructions.trim() || undefined,
        // Persona context is merged in here so the AI gets household, equipment,
        // pantry staples, time budget, etc. without duplicating logic upstream.
        mergePersonaWithUserInstructions(localPreferences, customCookingInstructions)
      );
    },
    onSuccess: (data) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      recipeGate.markUsed(); // successful generation — spend the free vibe use
      setGeneratedMealPlan(data);
      setGeneratedRecipe(null);
      setShowMealPlanModal(true); // Show modal when meal plan is generated
    },
    onError: (error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      console.error('Generate meal plan error:', error);
    },
  });

  const { mutate: mutateSingle } = generateMutation;
  const { mutate: mutateMealPlan } = mealPlanMutation;
  const isPending = generateMutation.isPending || mealPlanMutation.isPending || optimizedIsGenerating;
  const isError = generateMutation.isError || mealPlanMutation.isError;
  const error = generateMutation.error || mealPlanMutation.error;

  const handleGenerate = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setGeneratedRecipe(null);
    setGeneratedMealPlan([]);
    setShowAllRecipes(false);

    console.log('=== GENERATE CLICKED ===');
    console.log('Days:', numberOfDays, 'Meals:', selectedMealTypes.length, 'Total:', recipesToGenerate);

    if (isMealPlan) {
      mutateMealPlan(recipesToGenerate);
    } else {
      mutateSingle();
    }
  }, [isMealPlan, mutateSingle, mutateMealPlan, recipesToGenerate, numberOfDays, selectedMealTypes]);

  const [isSavingRecipe, setIsSavingRecipe] = useState(false);

  const handleSaveRecipe = useCallback(async () => {
    if (!generatedRecipe) return;

    setIsSavingRecipe(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    let imageUrl = getRandomStockImage();

    // Try to fetch image from Supabase library first, then Pexels
    try {
      const generatedImage = await generateRecipeImage(
        generatedRecipe.name,
        generatedRecipe.description,
        generatedRecipe.ingredients
      );
      if (generatedImage) {
        imageUrl = generatedImage;
      }
    } catch (error) {
      console.log('Failed to fetch image, using stock image:', error);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Validate and normalize ingredients using strict unit type rules
    const validatedIngredients = validateIngredients(
      generatedRecipe.ingredients.map((ing) => ({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        category: ing.category as 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other',
      }))
    );

    const recipe: Recipe = {
      id: '',
      name: generatedRecipe.name,
      description: generatedRecipe.description,
      imageUrl,
      cookTime: generatedRecipe.cookTime,
      prepTime: generatedRecipe.prepTime,
      servings: generatedRecipe.servings,
      ingredients: validatedIngredients.map((ing, index) => ({
        id: `gen-${index}`,
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        category: ing.category,
      })),
      instructions: generatedRecipe.instructions,
      tags: [
        ...generatedRecipe.tags,
        // Add meal type as a tag for filtering
        ...(generatedRecipe.mealType ? [generatedRecipe.mealType] : [])
      ],
      calories: generatedRecipe.calories,
      isAIGenerated: true,
      isSaved: false,
      createdAt: new Date().toISOString(),
      violations: generatedRecipe.violations, // Pass along allergen and preference violations
    };

    console.log(`[SaveRecipe] Saving recipe "${recipe.name}" with ${recipe.violations?.length ?? 0} violations`);
    if (recipe.violations && recipe.violations.length > 0) {
      console.log(`[SaveRecipe] Violations: ${recipe.violations.slice(0, 2).join('; ')}`);
    }

    const recipeId = addRecipe(recipe);

    // For single recipes, also add to meal plan with the selected meal type and date
    if (!isMealPlan && selectedMealTypes.length === 1) {
      const dateKey = formatDateKey(startDate);
      const mealType = selectedMealTypes[0];

      const slot: MealSlot = {
        id: '',
        date: dateKey,
        mealType: mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack',
        recipeId: recipeId,
      };

      addMealToSlot(slot);
    }

    setIsSavingRecipe(false);
    setShowRecipeModal(false);
    router.replace({
      pathname: '/(tabs)',
      params: { mealPlanDate: formatDateKey(startDate) }
    });
  }, [generatedRecipe, addRecipe, addMealToSlot, isMealPlan, selectedMealTypes, startDate, router]);

  const [isSavingMealPlan, setIsSavingMealPlan] = useState(false);

  const handleSaveMealPlan = useCallback(async () => {
    if (generatedMealPlan.length === 0 && selectedExistingRecipes.length === 0) return;

    setIsSavingMealPlan(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Combine generated recipes and selected existing recipes
    const numMealTypes = selectedMealTypes.length;

    // Track which day we're on for each meal type
    const mealTypeDayTracker: Record<string, number> = {};
    selectedMealTypes.forEach(mt => {
      mealTypeDayTracker[mt] = 0;
    });

    let totalRecipeIndex = 0;

    // First, add all generated recipes to the meal plan
    for (let idx = 0; idx < generatedMealPlan.length; idx++) {
      const recipeData = generatedMealPlan[idx];

      // Fetch image from Supabase library first, then Pexels for each recipe
      let imageUrl = getRandomStockImage();
      try {
        const generatedImage = await generateRecipeImage(
          recipeData.name,
          recipeData.description,
          recipeData.ingredients
        );
        if (generatedImage) {
          imageUrl = generatedImage;
        }
      } catch (error) {
        console.log(`Failed to fetch image for ${recipeData.name}, using stock image:`, error);
      }

      // Use the mealType from the recipe if available, otherwise cycle through selected types
      const mealType = (recipeData.mealType && selectedMealTypes.includes(recipeData.mealType))
        ? recipeData.mealType
        : selectedMealTypes[totalRecipeIndex % numMealTypes];

      // Validate and normalize ingredients
      const validatedIngredients = validateIngredients(
        recipeData.ingredients.map((ing) => ({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          category: ing.category as 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other',
        }))
      );

      const recipe: Recipe = {
        id: '',
        name: recipeData.name,
        description: recipeData.description,
        imageUrl,
        cookTime: recipeData.cookTime,
        prepTime: recipeData.prepTime,
        servings: recipeData.servings,
        ingredients: validatedIngredients.map((ing, index) => ({
          id: `gen-${idx}-${index}`,
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          category: ing.category,
        })),
        instructions: recipeData.instructions,
        tags: [
          ...recipeData.tags,
          // Add meal type as a tag for filtering
          mealType
        ],
        calories: recipeData.calories,
        isAIGenerated: true,
        isSaved: false,
        createdAt: new Date().toISOString(),
      };

      const recipeId = addRecipe(recipe);

      // Get the day index for this meal type
      const dayIndex = mealTypeDayTracker[mealType] ?? Math.floor(totalRecipeIndex / numMealTypes);

      // Calculate the date for this recipe
      const recipeDate = new Date(startDate);
      recipeDate.setDate(recipeDate.getDate() + dayIndex);
      const dateKey = formatDateKey(recipeDate);

      // Add to meal slot
      const slot: MealSlot = {
        id: '',
        date: dateKey,
        mealType,
        recipeId,
      };
      addMealToSlot(slot);

      // Increment the day tracker for this meal type
      if (mealTypeDayTracker[mealType] !== undefined) {
        mealTypeDayTracker[mealType]++;
      }

      totalRecipeIndex++;
    }

    // Then, add selected existing recipes to the meal plan
    selectedExistingRecipes.forEach((existingRecipeId) => {
      const mealType = selectedMealTypes[totalRecipeIndex % numMealTypes];
      const dayIndex = mealTypeDayTracker[mealType] ?? Math.floor(totalRecipeIndex / numMealTypes);

      const recipeDate = new Date(startDate);
      recipeDate.setDate(recipeDate.getDate() + dayIndex);
      const dateKey = formatDateKey(recipeDate);

      const slot: MealSlot = {
        id: '',
        date: dateKey,
        mealType,
        recipeId: existingRecipeId,
      };
      addMealToSlot(slot);

      if (mealTypeDayTracker[mealType] !== undefined) {
        mealTypeDayTracker[mealType]++;
      }

      totalRecipeIndex++;
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsSavingMealPlan(false);
    router.replace({
      pathname: '/(tabs)',
      params: { mealPlanDate: formatDateKey(startDate) }
    });
  }, [generatedMealPlan, selectedExistingRecipes, addRecipe, addMealToSlot, router, startDate, selectedMealTypes]);

  const handleRegenerate = useCallback(() => {
    setGeneratedRecipe(null);
    setGeneratedMealPlan([]);
    setShowAllRecipes(false);
    handleGenerate();
  }, [handleGenerate]);

  // Regenerate a single recipe in the meal plan
  const handleRegenerateSingle = useCallback(async (index: number) => {
    if (regeneratingIndex !== null) return; // Already regenerating

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRegeneratingIndex(index);

    const recipeToReplace = generatedMealPlan[index];
    const mealType = recipeToReplace?.mealType ?? selectedMealTypes[index % selectedMealTypes.length];

    // Get all other recipe names to exclude
    const excludeNames = generatedMealPlan
      .filter((_, i) => i !== index)
      .map(r => r.name);

    try {
      const newRecipe = await regenerateSingleRecipe(
        {
          mealTypes: [mealType],
          preferences: localPreferences,
          additionalInstructions: additionalInstructions.trim() || undefined,
          customCookingInstructions: mergePersonaWithUserInstructions(
            localPreferences,
            customCookingInstructions
          ),
        },
        excludeNames
      );

      // Update the meal plan with the new recipe
      setGeneratedMealPlan(prev => {
        const updated = [...prev];
        updated[index] = newRecipe;
        return updated;
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Failed to regenerate single recipe:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setRegeneratingIndex(null);
    }
  }, [regeneratingIndex, generatedMealPlan, selectedMealTypes, localPreferences, additionalInstructions]);

  // ── Reusable styles ───────────────────────────────────────────
  const eyebrowStyle = {
    fontFamily: designTokens.font.medium,
    fontSize: 11,
    letterSpacing: 0.66,
    textTransform: 'uppercase' as const,
    color: designTokens.colors.ink3,
  };
  const fieldShellStyle = {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.hair,
    backgroundColor: colors.bg,
  };
  const fieldTextStyle = {
    fontFamily: designTokens.font.regular,
    fontSize: 15,
    color: colors.ink,
    padding: 0,
  };
  const sectionTitleStyle = {
    fontFamily: designTokens.font.medium,
    fontSize: 18,
    color: colors.ink,
    letterSpacing: -0.36,
  };

  // Per-feature gate (vibe free use spent) — paywall is showing, render nothing.
  if (recipeGate.blocked) return null;

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#1a1a1a' : colors.bg }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* ── Header ───────────────────────────────────────── */}
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
              backgroundColor: colors.bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} color={colors.ink} strokeWidth={1.7} />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ChefHat size={16} color={designTokens.colors.ink2} strokeWidth={1.6} />
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 19,
                color: colors.ink,
                letterSpacing: -0.38,
              }}
            >
              Vibe{' '}
              <Text
                style={{
                  fontFamily: designTokens.font.serifItalic,
                  fontStyle: 'italic',
                  fontSize: 22,
                  letterSpacing: -0.22,
                }}
              >
                cooking
              </Text>
            </Text>
          </View>
          <View style={{ width: 40 }} />
        </Animated.View>

        {/* ── Resume last vibe cook (only when payload exists) ───── */}
        {lastVibeCook && lastVibeCook.recipe && (
          <Animated.View
            entering={FadeInDown.duration(280).springify()}
            style={{ paddingHorizontal: 20, marginBottom: 12 }}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/vibe-cooking');
              }}
              style={({ pressed }) => ({
                opacity: pressed ? 0.92 : 1,
                transform: [{ scale: pressed ? 0.99 : 1 }],
              })}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: colors.hair,
                  backgroundColor: designTokens.colors.cream,
                }}
              >
                <Text style={{ fontSize: 22 }}>
                  {VIBE_BY_ID[lastVibeCook.vibeId as VibeId]?.emoji ?? '🍲'}
                </Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 10,
                      letterSpacing: 1.2,
                      textTransform: 'uppercase',
                      color: designTokens.colors.olive,
                    }}
                  >
                    Resume vibe
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      marginTop: 2,
                      fontFamily: designTokens.font.medium,
                      fontSize: 14,
                      color: colors.ink,
                      letterSpacing: -0.2,
                    }}
                  >
                    {lastVibeCook.recipe.name}
                  </Text>
                </View>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    backgroundColor: designTokens.colors.brand,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ArrowRight size={15} color="#FAF7F0" strokeWidth={2.2} />
                </View>
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    Haptics.selectionAsync();
                    clearLastVibeCook();
                  }}
                  hitSlop={10}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X size={14} color={designTokens.colors.ink3} strokeWidth={2} />
                </Pressable>
              </View>
            </Pressable>
          </Animated.View>
        )}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 140 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── API not configured warning ──────────────────── */}
            {!isConfigured && (
              <Animated.View
                entering={FadeInDown.delay(80).springify()}
                style={{ paddingHorizontal: 16, paddingBottom: 14 }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderRadius: 16,
                    backgroundColor: designTokens.colors.cream,
                    borderWidth: 1,
                    borderColor: colors.hair,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: 'rgba(228,109,70,0.12)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <AlertTriangle size={15} color={designTokens.colors.olive} strokeWidth={1.8} />
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
                      API key required
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 12,
                        color: designTokens.colors.ink2,
                        marginTop: 1,
                      }}
                    >
                      Supabase must be configured for AI features to work.
                    </Text>
                  </View>
                </View>
              </Animated.View>
            )}

            {/* ── Account paused warning ──────────────────────── */}
            {isPaused && (
              <Animated.View
                entering={FadeInDown.delay(80).springify()}
                style={{ paddingHorizontal: 16, paddingBottom: 14 }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderRadius: 16,
                    backgroundColor: designTokens.colors.cream,
                    borderWidth: 1,
                    borderColor: colors.hair,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: designTokens.colors.hair2,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Lock size={15} color={designTokens.colors.ink2} strokeWidth={1.7} />
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
                      Account paused
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 12,
                        color: designTokens.colors.ink2,
                        marginTop: 1,
                      }}
                    >
                      AI recipe generation is unavailable while your account is paused.
                    </Text>
                  </View>
                </View>
              </Animated.View>
            )}

            {/* ── Meal plan duration (hidden by Vibe Cooking — kept for easy revert) ─── */}
            {false && (
              <Animated.View
                entering={FadeInDown.delay(120).springify()}
                style={{ paddingHorizontal: 16, paddingBottom: 18 }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 12,
                    paddingHorizontal: 4,
                  }}
                >
                  <CalendarDays size={14} color={designTokens.colors.ink3} strokeWidth={1.7} />
                  <Text style={sectionTitleStyle}>Meal plan duration</Text>
                </View>

                {/* Duration preset row */}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[
                    { label: 'Single day', days: 1 },
                    { label: '3 days', days: 3 },
                    { label: '1 week', days: 7 },
                    { label: 'Custom', days: 0 },
                  ].map((option) => {
                    const isCustom = option.days === 0;
                    const isSelected = presetDays === option.days;
                    return (
                      <Pressable
                        key={option.label}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          if (isCustom) {
                            setPresetDays(0);
                            setIsCustomMode(true);
                            setCustomSelectingEnd(false);
                            setEndDate(null);
                            setShowCalendar(true);
                          } else {
                            setPresetDays(option.days);
                            setIsCustomMode(false);
                            setCustomSelectingEnd(false);
                            const newStart = new Date(startDate);
                            newStart.setHours(0, 0, 0, 0);
                            if (option.days === 1) {
                              setEndDate(null);
                            } else {
                              const end = new Date(newStart);
                              end.setDate(end.getDate() + option.days - 1);
                              setEndDate(end);
                            }
                            if (isSelected && showCalendar) {
                              setShowCalendar(false);
                            } else {
                              setShowCalendar(true);
                            }
                          }
                        }}
                        style={{
                          flex: 1,
                          paddingVertical: 11,
                          borderRadius: 999,
                          alignItems: 'center',
                          backgroundColor: isSelected ? designTokens.colors.brand : colors.bg,
                          borderWidth: 1,
                          borderColor: isSelected ? designTokens.colors.brand : designTokens.colors.hair,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: isSelected
                              ? designTokens.font.semibold
                              : designTokens.font.medium,
                            fontSize: 13,
                            color: isSelected ? designTokens.colors.cream : colors.ink,
                            letterSpacing: -0.065,
                          }}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Calendar (conditional) */}
                {showCalendar && (
                  <View
                    style={{
                      marginTop: 14,
                      padding: 16,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: colors.hair,
                      backgroundColor: colors.bg,
                    }}
                  >
                    {/* Start / End chips row */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingBottom: 14,
                        marginBottom: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.hair2,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[eyebrowStyle, { marginBottom: 4 }]}>Start</Text>
                        <Text
                          style={{
                            fontFamily: designTokens.font.semibold,
                            fontSize: 16,
                            color: colors.ink,
                            letterSpacing: -0.16,
                          }}
                        >
                          {startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </Text>
                      </View>
                      <View
                        style={{
                          width: 16,
                          height: 1,
                          backgroundColor: designTokens.colors.hair,
                        }}
                      />
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={[eyebrowStyle, { marginBottom: 4 }]}>End</Text>
                        <Text
                          style={{
                            fontFamily: designTokens.font.semibold,
                            fontSize: 16,
                            color: endDate ? colors.ink : designTokens.colors.ink3,
                            letterSpacing: -0.16,
                          }}
                        >
                          {endDate
                            ? (endDate as Date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : 'Select'}
                        </Text>
                      </View>
                    </View>

                    {/* Custom hint */}
                    {isCustomMode && (
                      <Text
                        style={{
                          fontFamily: designTokens.font.regular,
                          fontSize: 12.5,
                          color: designTokens.colors.brand,
                          textAlign: 'center',
                          marginBottom: 10,
                        }}
                      >
                        {customSelectingEnd ? 'Tap to set end date' : 'Tap to set start date'}
                      </Text>
                    )}

                    {/* Month nav */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 12,
                      }}
                    >
                      <Pressable
                        onPress={() => navigateCalendarMonth('prev')}
                        disabled={!canNavigatePrevMonth}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: colors.hair,
                          backgroundColor: colors.bg,
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: !canNavigatePrevMonth ? 0.45 : 1,
                        }}
                      >
                        <ChevronLeft size={16} color={colors.ink} strokeWidth={1.7} />
                      </Pressable>
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 16,
                          color: colors.ink,
                          letterSpacing: -0.16,
                        }}
                      >
                        {monthYearLabel}
                      </Text>
                      <Pressable
                        onPress={() => navigateCalendarMonth('next')}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: colors.hair,
                          backgroundColor: colors.bg,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <ChevronRight size={16} color={colors.ink} strokeWidth={1.7} />
                      </Pressable>
                    </View>

                    {/* Weekday headers */}
                    <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                      {WEEKDAYS.map((day, index) => (
                        <View key={index} style={{ width: '14.28%', alignItems: 'center' }}>
                          <Text
                            style={{
                              fontFamily: designTokens.font.medium,
                              fontSize: 11,
                              letterSpacing: 0.55,
                              textTransform: 'uppercase',
                              color: designTokens.colors.ink3,
                            }}
                          >
                            {day}
                          </Text>
                        </View>
                      ))}
                    </View>

                    {/* Calendar grid */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      {calendarDays.map((day, index) => {
                        if (!day) {
                          return <View key={`empty-${index}`} style={{ width: '14.28%', height: 40 }} />;
                        }
                        const dayKey = formatDateKey(day);
                        const startKey = formatDateKey(startDate);
                        const endKey = endDate ? formatDateKey(endDate) : null;
                        const isStart = dayKey === startKey;
                        const isEnd = endKey && dayKey === endKey;
                        const isInRange = endDate && day >= startDate && day <= endDate;
                        const isToday = dayKey === formatDateKey(new Date());
                        const isDateAllowed = currentUser?.createdAt
                          ? isDateSelectable(day, currentUser.createdAt)
                          : true;
                        const isPast = !isDateAllowed;
                        const isHighlight = !!(isStart || isEnd);
                        return (
                          <Pressable
                            key={dayKey}
                            onPress={() => {
                              if (isPast) return;
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              if (isCustomMode) {
                                if (!customSelectingEnd) {
                                  setStartDate(day);
                                  setEndDate(null);
                                  setCustomSelectingEnd(true);
                                } else {
                                  if (day > startDate) {
                                    setEndDate(day);
                                  } else if (day < startDate) {
                                    setEndDate(startDate);
                                    setStartDate(day);
                                  }
                                  setCustomSelectingEnd(false);
                                }
                              } else {
                                const newStart = new Date(day);
                                newStart.setHours(0, 0, 0, 0);
                                setStartDate(newStart);
                                if (presetDays > 1) {
                                  const newEnd = new Date(newStart);
                                  newEnd.setDate(newEnd.getDate() + presetDays - 1);
                                  setEndDate(newEnd);
                                } else {
                                  setEndDate(null);
                                }
                              }
                            }}
                            disabled={isPast}
                            style={{
                              width: '14.28%',
                              height: 40,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <View
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 999,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: isHighlight
                                  ? designTokens.colors.brand
                                  : isInRange
                                    ? '#E8ECDF'
                                    : 'transparent',
                                borderWidth: isToday && !isHighlight && !isInRange ? 1 : 0,
                                borderColor: designTokens.colors.brand,
                              }}
                            >
                              <Text
                                style={{
                                  fontFamily: isHighlight
                                    ? designTokens.font.semibold
                                    : designTokens.font.regular,
                                  fontSize: 14,
                                  color: isHighlight
                                    ? '#fff'
                                    : isPast
                                      ? 'rgba(154,150,139,0.5)'
                                      : isInRange
                                        ? designTokens.colors.brand
                                        : colors.ink,
                                }}
                              >
                                {day.getDate()}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>

                    {numberOfDays > 1 && (
                      <View
                        style={{
                          marginTop: 14,
                          paddingTop: 12,
                          borderTopWidth: 1,
                          borderTopColor: colors.hair2,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: designTokens.font.medium,
                            fontSize: 13,
                            color: designTokens.colors.ink2,
                            textAlign: 'center',
                            letterSpacing: -0.065,
                          }}
                        >
                          {numberOfDays} days · {totalRecipesNeeded} recipes
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </Animated.View>
            )}

            {/* ── Vibe deck — hero mood selector ─────────────── */}
            <Animated.View
              entering={FadeInDown.delay(120).springify()}
              style={{ paddingBottom: 18 }}
            >
              <Text
                style={[
                  sectionTitleStyle,
                  { marginBottom: 12, paddingHorizontal: 20 },
                ]}
              >
                What's the vibe?
              </Text>
              <VibeDeck
                selectedVibeId={selectedVibeId}
                onSelect={setSelectedVibeId}
                isDark={isDark}
              />
            </Animated.View>

            {/* ── Meal type selector ──────────────────────────── */}
            <Animated.View
              entering={FadeInDown.delay(170).springify()}
              style={{ paddingHorizontal: 16, paddingBottom: 18 }}
            >
              <Text style={[sectionTitleStyle, { marginBottom: 12, paddingHorizontal: 4 }]}>Meal types</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {MEAL_TYPES.map((type) => {
                  const Icon = type.icon;
                  const isSelected = selectedMealTypes.includes(type.key);
                  const tintInfo = MEAL_TYPE_TINT[type.key];
                  return (
                    <Pressable
                      key={type.key}
                      onPress={() => toggleMealType(type.key)}
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        paddingVertical: 14,
                        paddingHorizontal: 8,
                        borderRadius: 16,
                        backgroundColor: isSelected ? tintInfo.tint : colors.bg,
                        borderWidth: 1,
                        borderColor: isSelected ? tintInfo.tint : designTokens.colors.hair,
                      }}
                    >
                      <Icon
                        size={20}
                        color={isSelected ? tintInfo.accent : designTokens.colors.ink3}
                        strokeWidth={isSelected ? 1.9 : 1.6}
                      />
                      <Text
                        style={{
                          marginTop: 8,
                          fontFamily: designTokens.font.medium,
                          fontSize: 12.5,
                          color: isSelected ? colors.ink : designTokens.colors.ink2,
                          letterSpacing: -0.0625,
                        }}
                      >
                        {type.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>

            {/* ── Over-limit warning (hidden — tied to multi-day, n/a for Vibe Cooking) ─── */}
            {false && isOverLimit && (
              <Animated.View
                entering={FadeInDown.duration(300)}
                style={{ paddingHorizontal: 16, paddingBottom: 18 }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderRadius: 16,
                    backgroundColor: designTokens.colors.cream,
                    borderWidth: 1,
                    borderColor: colors.hair,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: 'rgba(228,109,70,0.12)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <AlertTriangle size={15} color={designTokens.colors.olive} strokeWidth={1.8} />
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
                      Reduce selection to generate
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 12,
                        color: designTokens.colors.ink2,
                        marginTop: 1,
                      }}
                    >
                      Maximum 100 recipes at a time.
                    </Text>
                  </View>
                </View>
              </Animated.View>
            )}

            {/* ── Use your recipes (hidden by Vibe Cooking — kept for easy revert) ─── */}
            {false && (
              <Animated.View
                entering={FadeInDown.delay(200).springify()}
                style={{ paddingBottom: 18 }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 20,
                    marginBottom: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Library size={14} color={designTokens.colors.ink3} strokeWidth={1.7} />
                    <Text style={sectionTitleStyle}>Use your recipes</Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowRecipePicker(true);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 13,
                        color: designTokens.colors.ink2,
                      }}
                    >
                      See all
                    </Text>
                    <ChevronRight size={14} color={designTokens.colors.ink2} strokeWidth={1.6} />
                  </Pressable>
                </View>

                {uniqueRecipes.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
                    style={{ flexGrow: 0 }}
                  >
                    {uniqueRecipes.map((recipe) => {
                      const isSelected = selectedExistingRecipes.includes(recipe.id);
                      return (
                        <Pressable
                          key={recipe.id}
                          onPress={() => toggleExistingRecipe(recipe.id)}
                          style={{
                            width: 160,
                            borderRadius: 18,
                            overflow: 'hidden',
                            borderWidth: 1,
                            borderColor: isSelected
                              ? designTokens.colors.brand
                              : designTokens.colors.hair,
                            backgroundColor: colors.bg,
                          }}
                        >
                          <View style={{ position: 'relative' }}>
                            <Image
                              source={{ uri: recipe.imageUrl }}
                              style={{ width: '100%', height: 100, backgroundColor: '#F4F0E8' }}
                            />
                            {isSelected && (
                              <View
                                style={{
                                  position: 'absolute',
                                  top: 8,
                                  right: 8,
                                  width: 24,
                                  height: 24,
                                  borderRadius: 999,
                                  backgroundColor: designTokens.colors.brand,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderWidth: 2,
                                  borderColor: colors.bg,
                                }}
                              >
                                <Check size={12} color="#fff" strokeWidth={2.5} />
                              </View>
                            )}
                          </View>
                          <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 }}>
                            <Text
                              style={{
                                fontFamily: designTokens.font.medium,
                                fontSize: 14,
                                color: colors.ink,
                                letterSpacing: -0.14,
                                lineHeight: 18,
                              }}
                              numberOfLines={1}
                            >
                              {recipe.name}
                            </Text>
                            <Text
                              style={{
                                marginTop: 4,
                                fontFamily: designTokens.font.regular,
                                fontSize: 12,
                                color: designTokens.colors.ink3,
                              }}
                            >
                              {recipe.cookTime + recipe.prepTime} min · {recipe.calories ?? 0} cal
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <View
                    style={{
                      marginHorizontal: 16,
                      paddingVertical: 18,
                      paddingHorizontal: 16,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: colors.hair,
                      backgroundColor: colors.bg,
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 13,
                        color: designTokens.colors.ink3,
                        textAlign: 'center',
                      }}
                    >
                      No recipes yet — generate your first one below.
                    </Text>
                  </View>
                )}

                {selectedExistingRecipes.length > 0 && (
                  <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        alignSelf: 'flex-start',
                        paddingHorizontal: 11,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: '#E8ECDF',
                      }}
                    >
                      <Check size={12} color={designTokens.colors.brand} strokeWidth={2.5} />
                      <Text
                        style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 11.5,
                          color: designTokens.colors.brand,
                          letterSpacing: -0.0575,
                        }}
                      >
                        {selectedExistingRecipes.length} of {totalRecipesNeeded} selected
                      </Text>
                    </View>
                  </View>
                )}
              </Animated.View>
            )}

            {/* ── What's in your fridge (auto-populated chip cluster) ─── */}
            <Animated.View
              entering={FadeInDown.delay(220).springify()}
              style={{ paddingHorizontal: 16, paddingBottom: 18 }}
            >
              <Text
                style={[sectionTitleStyle, { marginBottom: 4, paddingHorizontal: 4 }]}
              >
                What's in your fridge?
              </Text>
              <Text
                style={{
                  marginBottom: 12,
                  paddingHorizontal: 4,
                  fontFamily: designTokens.font.regular,
                  fontSize: 12,
                  color: designTokens.colors.ink3,
                  lineHeight: 17,
                }}
              >
                We pulled these from your recent groceries and cooking — remove anything you don't have.
              </Text>
              <InferredFridgeChips
                items={fridgeIngredients}
                onChange={setFridgeIngredients}
                isDark={isDark}
              />
            </Animated.View>

            {/* ── Cooking instructions (hidden — Vibe Cooking pulls prefs from Profile) ─── */}
            {false && (
              <Animated.View
                entering={FadeInDown.delay(240).springify()}
                style={{ paddingHorizontal: 16, paddingBottom: 18 }}
              >
                <Text style={[sectionTitleStyle, { marginBottom: 12, paddingHorizontal: 4 }]}>Cooking instructions</Text>
                <View style={[fieldShellStyle, { minHeight: 96 }]}>
                  <TextInput
                    value={customCookingInstructions}
                    onChangeText={(text) => {
                      const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
                      if (wordCount <= 300) {
                        setCustomCookingInstructions(text);
                      }
                    }}
                    placeholder="e.g., exclude beef, mild spices, chicken in 3 of the recipes"
                    placeholderTextColor={designTokens.colors.ink3}
                    multiline
                    numberOfLines={3}
                    style={[fieldTextStyle, { minHeight: 72, textAlignVertical: 'top' }]}
                  />
                  <Text
                    style={{
                      marginTop: 6,
                      fontFamily: designTokens.font.regular,
                      fontSize: 11,
                      color: designTokens.colors.ink3,
                      textAlign: 'right',
                    }}
                  >
                    {customCookingInstructions.trim().split(/\s+/).filter(Boolean).length}/300
                  </Text>
                </View>
                <Text
                  style={{
                    marginTop: 8,
                    paddingHorizontal: 4,
                    fontFamily: designTokens.font.regular,
                    fontSize: 12,
                    color: designTokens.colors.ink3,
                    lineHeight: 17,
                  }}
                >
                  Instructions override "Based on your preferences" — never your allergies.
                </Text>
              </Animated.View>
            )}

            {/* ── Your preferences summary (hidden — Vibe Cooking pulls prefs from Profile) ─── */}
            {false && (
              <Animated.View
                entering={FadeInDown.delay(260).springify()}
                style={{ paddingHorizontal: 16, paddingBottom: 18 }}
              >
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowPreferencesModal(true);
                  }}
                  style={{
                    padding: 16,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: colors.hair,
                    backgroundColor: colors.bg,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 12,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ChefHat size={14} color={designTokens.colors.brand} strokeWidth={1.7} />
                      <Text
                        style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 11,
                          letterSpacing: 1.1,
                          textTransform: 'uppercase',
                          color: designTokens.colors.brand,
                        }}
                      >
                        Based on your preferences
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        paddingHorizontal: 11,
                        paddingVertical: 5,
                        borderRadius: 999,
                        backgroundColor: designTokens.colors.hair2,
                      }}
                    >
                      <Pencil size={12} color={colors.ink} strokeWidth={1.7} />
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 12,
                          color: colors.ink,
                          letterSpacing: -0.06,
                        }}
                      >
                        Edit
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {[
                      `${localPreferences.servingSize} servings`,
                      `${localPreferences.cookingSkillLevel.charAt(0).toUpperCase() + localPreferences.cookingSkillLevel.slice(1)} level`,
                      `${localPreferences.mealPrepTime === 'quick' ? 'Quick' : localPreferences.mealPrepTime === 'moderate' ? 'Moderate' : 'Elaborate'} prep`,
                      ...localPreferences.dietaryRestrictions,
                      ...localPreferences.allergies.map((a) => `No ${a.toLowerCase()}`),
                      ...localPreferences.cuisinePreferences,
                    ].map((chip, idx) => (
                      <View
                        key={`${chip}-${idx}`}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: colors.hair,
                          backgroundColor: designTokens.colors.cream,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: designTokens.font.medium,
                            fontSize: 12,
                            color: designTokens.colors.ink2,
                            letterSpacing: -0.06,
                          }}
                        >
                          {chip}
                        </Text>
                      </View>
                    ))}
                  </View>
                </Pressable>
              </Animated.View>
            )}

            {/* ── Grocery optimization toggle (hidden — Vibe Cooking is single-recipe) ─── */}
            {false && isMealPlan && (
              <Animated.View
                entering={FadeInDown.delay(280).springify()}
                style={{ paddingHorizontal: 16, paddingBottom: 18 }}
              >
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setOptimizeGrocery(!optimizeGrocery);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: colors.hair,
                    backgroundColor: colors.bg,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 11,
                      backgroundColor: '#E8ECDF',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <ShoppingCart size={16} color={designTokens.colors.brand} strokeWidth={1.7} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 14.5,
                        color: colors.ink,
                        letterSpacing: -0.145,
                      }}
                    >
                      Grocery optimization
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 12,
                        color: designTokens.colors.ink3,
                        marginTop: 1,
                      }}
                    >
                      Share ingredients across recipes
                    </Text>
                  </View>
                  {/* Toggle pill */}
                  <View
                    style={{
                      width: 42,
                      height: 24,
                      borderRadius: 999,
                      backgroundColor: optimizeGrocery
                        ? designTokens.colors.brand
                        : designTokens.colors.hair,
                      justifyContent: 'center',
                      paddingHorizontal: 3,
                    }}
                  >
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        backgroundColor: '#fff',
                        alignSelf: optimizeGrocery ? 'flex-end' : 'flex-start',
                      }}
                    />
                  </View>
                </Pressable>
              </Animated.View>
            )}

            {/* Allow Repeats toggle (currently gated off — kept verbatim behind `false &&`) */}
            {false && isMealPlan && (
              <Animated.View
                entering={FadeInDown.delay(290).springify()}
                style={{ paddingHorizontal: 16, paddingBottom: 18 }}
              >
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setAllowRepeats(!allowRepeats);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: colors.hair,
                    backgroundColor: colors.bg,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 11,
                      backgroundColor: 'rgba(228,109,70,0.10)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Repeat size={16} color={designTokens.colors.olive} strokeWidth={1.7} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 14.5,
                        color: colors.ink,
                        letterSpacing: -0.145,
                      }}
                    >
                      Allow repeats
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 12,
                        color: designTokens.colors.ink3,
                        marginTop: 1,
                      }}
                    >
                      Reuse recipes for lunch and dinner
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 42,
                      height: 24,
                      borderRadius: 999,
                      backgroundColor: allowRepeats
                        ? designTokens.colors.olive
                        : designTokens.colors.hair,
                      justifyContent: 'center',
                      paddingHorizontal: 3,
                    }}
                  >
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 999,
                        backgroundColor: '#fff',
                        alignSelf: allowRepeats ? 'flex-end' : 'flex-start',
                      }}
                    />
                  </View>
                </Pressable>
              </Animated.View>
            )}

            {/* ── Recipe ready (no Sparkles) ──────────────────── */}
            {generatedRecipe && !showRecipeModal && (
              <Animated.View
                entering={FadeInUp.springify()}
                style={{ paddingHorizontal: 16, paddingBottom: 18 }}
              >
                <Pressable
                  onPress={() => {
                    // If the user has a vibe selected, route them to
                    // the distinctive Vibe Cooking full-page screen —
                    // this is the recoverable path when they navigated
                    // back from /vibe-cooking and now want to re-open
                    // their generated recipe. The legacy bottom-sheet
                    // path only fires when there's no vibe context.
                    if (selectedVibeId && generatedRecipe) {
                      setLastVibeCook({ recipe: generatedRecipe, vibeId: selectedVibeId });
                      router.replace('/vibe-cooking');
                    } else {
                      setShowRecipeModal(true);
                    }
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: colors.hair,
                    backgroundColor: designTokens.colors.cream,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 11,
                      backgroundColor: '#E8ECDF',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Wand2 size={16} color={designTokens.colors.brand} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 11,
                        letterSpacing: 1.1,
                        textTransform: 'uppercase',
                        color: designTokens.colors.brand,
                      }}
                    >
                      {selectedVibeId ? 'Vibe ready' : 'Recipe ready'}
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 14,
                        color: colors.ink,
                        letterSpacing: -0.07,
                        marginTop: 1,
                      }}
                      numberOfLines={1}
                    >
                      {generatedRecipe.name}
                    </Text>
                  </View>
                  <View
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: designTokens.colors.brand,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 13,
                        color: '#fff',
                        letterSpacing: -0.065,
                      }}
                    >
                      {selectedVibeId ? 'Cook' : 'View'}
                    </Text>
                  </View>
                </Pressable>
              </Animated.View>
            )}

            {/* ── Meal plan ready ─────────────────────────────── */}
            {generatedMealPlan.length > 0 && !showMealPlanModal && (
              <Animated.View
                entering={FadeInUp.springify()}
                style={{ paddingHorizontal: 16, paddingBottom: 18 }}
              >
                <Pressable
                  onPress={() => setShowMealPlanModal(true)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: colors.hair,
                    backgroundColor: designTokens.colors.cream,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 11,
                      backgroundColor: '#E8ECDF',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <CalendarDays
                      size={16}
                      color={designTokens.colors.brand}
                      strokeWidth={1.7}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 11,
                        letterSpacing: 1.1,
                        textTransform: 'uppercase',
                        color: designTokens.colors.brand,
                      }}
                    >
                      Meal plan ready
                    </Text>
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 14,
                        color: colors.ink,
                        letterSpacing: -0.07,
                        marginTop: 1,
                      }}
                    >
                      {generatedMealPlan.length} recipes generated
                    </Text>
                  </View>
                  <View
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: designTokens.colors.brand,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 13,
                        color: '#fff',
                        letterSpacing: -0.065,
                      }}
                    >
                      View
                    </Text>
                  </View>
                </Pressable>
              </Animated.View>
            )}

            {/* ── Error state ─────────────────────────────────── */}
            {isError && (
              <Animated.View
                entering={FadeInUp.springify()}
                style={{ paddingHorizontal: 16, paddingBottom: 18 }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderRadius: 16,
                    backgroundColor: designTokens.colors.cream,
                    borderWidth: 1,
                    borderColor: colors.hair,
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: 'rgba(228,109,70,0.12)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <AlertTriangle size={15} color={designTokens.colors.olive} strokeWidth={1.8} />
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: designTokens.font.regular,
                      fontSize: 13,
                      color: colors.ink,
                      lineHeight: 18,
                    }}
                  >
                    {error?.message || 'Failed to generate recipe. Please try again.'}
                  </Text>
                </View>
              </Animated.View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* ── Rate limit status ─────────────────────────────── */}
        {rateLimitStatus && !isKeyboardVisible && (
          <View
            style={{
              marginHorizontal: 20,
              marginBottom: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 12,
              backgroundColor: designTokens.colors.cream,
              borderWidth: 1,
              borderColor: colors.hair,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Zap size={11} color={designTokens.colors.olive} strokeWidth={2} />
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 11,
                letterSpacing: 0.55,
                textTransform: 'uppercase',
                color: designTokens.colors.ink2,
              }}
            >
              API usage · {rateLimitStatus.hourly_requests}/300 hr · {rateLimitStatus.daily_requests}/1000 day
            </Text>
          </View>
        )}

        {/* ── Bottom action ─────────────────────────────────── */}
        {!isKeyboardVisible && (
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
            {generatedRecipe ? (
              // When a vibe is selected, the recipe is immediately handed off
              // to /vibe-cooking — never show this button. The user sees the
              // full-page experience instead.
              !selectedVibeId && (
                <Pressable
                  onPress={() => setGeneratedRecipe(null)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    paddingVertical: 15,
                    borderRadius: 16,
                    backgroundColor: designTokens.colors.brand,
                  }}
                >
                  <Wand2 size={17} color="#fff" strokeWidth={1.8} />
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 15,
                      color: '#fff',
                      letterSpacing: -0.15,
                    }}
                  >
                    Generate with new selection
                  </Text>
                </Pressable>
              )
            ) : generatedMealPlan.length > 0 ? (
              <Pressable
                onPress={() => setGeneratedMealPlan([])}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 15,
                  borderRadius: 16,
                  backgroundColor: designTokens.colors.brand,
                }}
              >
                <CalendarDays size={17} color="#fff" strokeWidth={1.8} />
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 15,
                    color: '#fff',
                    letterSpacing: -0.15,
                  }}
                >
                  Generate with new selection
                </Text>
              </Pressable>
            ) : isMealPlan && selectedExistingRecipes.length > 0 && recipesToGenerate === 0 ? (
              <Pressable
                onPress={handleSaveMealPlan}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 15,
                  borderRadius: 16,
                  backgroundColor: designTokens.colors.brand,
                }}
              >
                <Check size={17} color="#fff" strokeWidth={2.2} />
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 15,
                    color: '#fff',
                    letterSpacing: -0.15,
                  }}
                >
                  Save to meal plan
                </Text>
              </Pressable>
            ) : (
              // ── CTA submit-gate ─────────────────────────────────
              // Two exclusive modes share this button:
              //   • Single-recipe (Vibe Cooking): requires a vibe pick
              //   • Meal plan (PnP Suggests): VibeDeck is hidden, so
              //     the gate is "at least one recipe to generate"
              // Computed once and reused across disabled + the three
              // brand-color/shadow/elevation expressions below so the
              // four conditions can't drift apart.
              (() => {
                const canSubmit = isMealPlan ? recipesToGenerate > 0 : !!selectedVibeId;
                return (
              <Pressable
                onPress={handleGenerate}
                disabled={
                  !isConfigured ||
                  isPending ||
                  isPaused ||
                  isOverLimit ||
                  !canSubmit
                }
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 15,
                  borderRadius: 16,
                  backgroundColor:
                    isPaused || isOverLimit
                      ? 'rgba(228,109,70,0.12)'
                      : isConfigured && !isPending && canSubmit
                        ? designTokens.colors.brand
                        : designTokens.colors.hair2,
                  shadowColor:
                    isConfigured && !isPending && canSubmit
                      ? designTokens.colors.brandDeep
                      : 'transparent',
                  shadowOpacity: 0.22,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: isConfigured && !isPending && canSubmit ? 3 : 0,
                }}
              >
                {isPending ? (
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 14,
                        color: '#fff',
                        letterSpacing: -0.14,
                      }}
                    >
                      {generationProgress
                        ? `Generating · ${generationProgress.percentComplete}%${generationProgress.cached > 0 ? ` · ${generationProgress.cached} cached` : ''}`
                        : isMealPlan
                          ? `Generating ${recipesToGenerate} recipes…`
                          : 'Generating…'}
                    </Text>
                    {generationProgress && (
                      <View
                        style={{
                          height: 4,
                          width: '90%',
                          backgroundColor: 'rgba(255,255,255,0.25)',
                          borderRadius: 999,
                          marginTop: 6,
                          overflow: 'hidden',
                        }}
                      >
                        <View
                          style={{
                            height: '100%',
                            width: `${generationProgress.percentComplete}%` as any,
                            backgroundColor: '#fff',
                            borderRadius: 999,
                          }}
                        />
                      </View>
                    )}
                  </View>
                ) : isPaused ? (
                  <>
                    <Lock size={17} color={designTokens.colors.olive} strokeWidth={1.8} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 15,
                        color: designTokens.colors.olive,
                        letterSpacing: -0.15,
                      }}
                    >
                      Account paused
                    </Text>
                  </>
                ) : isOverLimit ? (
                  <>
                    <AlertTriangle size={17} color={designTokens.colors.olive} strokeWidth={1.8} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 15,
                        color: designTokens.colors.olive,
                        letterSpacing: -0.15,
                      }}
                    >
                      Reduce selection to generate
                    </Text>
                  </>
                ) : (
                  <>
                    {isMealPlan ? (
                      <CalendarDays
                        size={17}
                        color={
                          isConfigured && recipesToGenerate > 0
                            ? '#fff'
                            : designTokens.colors.ink3
                        }
                        strokeWidth={1.8}
                      />
                    ) : (
                      <Wand2
                        size={17}
                        color={isConfigured ? '#fff' : designTokens.colors.ink3}
                        strokeWidth={1.8}
                      />
                    )}
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 15,
                        color:
                          isConfigured && (isMealPlan ? recipesToGenerate > 0 : true)
                            ? '#fff'
                            : designTokens.colors.ink3,
                        letterSpacing: -0.15,
                      }}
                    >
                      {isMealPlan
                        ? selectedExistingRecipes.length > 0
                          ? `Generate ${recipesToGenerate} more recipes`
                          : `Generate ${totalRecipesNeeded} recipes`
                        : selectedVibeId
                          ? 'Cook this vibe'
                          : 'Pick a vibe to cook'}
                    </Text>
                  </>
                )}
              </Pressable>
                );
              })()
            )}
          </View>
        )}
      </SafeAreaView>

      {/* Generation Loading Modal — v2 "While we cook" (charcoal hero + orbital cooking) */}
      <Modal
        visible={isPending}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={{ flex: 1 }}>
          {/* Layer 1 — frosted dark backdrop */}
          <BlurView
            intensity={55}
            tint="dark"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          {/* Layer 2 — warm olive halo from top center */}
          <LinearGradient
            colors={['rgba(228,109,70,0.10)', 'transparent']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 380 }}
          />
          {/* Layer 3 — bottom pedestal weight */}
          <LinearGradient
            colors={['transparent', 'rgba(21,20,15,0.35)']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 220 }}
          />

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
            {/* Charcoal hero panel */}
            <Animated.View
              entering={ZoomIn.springify().damping(14).mass(0.9)}
              style={{
                width: '100%',
                backgroundColor: '#181612',
                borderRadius: 28,
                paddingHorizontal: 28,
                paddingVertical: 32,
                alignItems: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 16 },
                shadowOpacity: 0.30,
                shadowRadius: 32,
                elevation: 20,
                overflow: 'hidden',
              }}
            >
              {/* Top-edge inner highlight — polished surface cue */}
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 1,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                }}
              />

              {/* Orbital cooking hero */}
              <OrbitalCookingHero
                hasProgress={!!generationProgress}
                percent={generationProgress?.percentComplete ?? 0}
              />

              {/* Headline — one italic word ("tight") */}
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 22,
                  color: '#F6F2E9',
                  marginBottom: 8,
                  textAlign: 'center',
                  letterSpacing: -0.44,
                }}
              >
                Hang{' '}
                <Text
                  style={{
                    fontFamily: designTokens.font.serifItalic,
                    fontStyle: 'italic',
                    fontSize: 26,
                    letterSpacing: -0.26,
                  }}
                >
                  tight
                </Text>
                …
              </Text>

              {/* Rotating status label */}
              <GenerationStatusLabel
                isPending={isPending}
                hasProgress={!!generationProgress}
                isMealPlan={isMealPlan}
                completed={generationProgress?.completed ?? 0}
                total={generationProgress?.total ?? recipesToGenerate}
                cachedCount={generationProgress?.cached ?? 0}
              />

              {/* Progress strip (real vs. shimmer) */}
              {generationProgress ? (
                <GenerationProgressBar percent={generationProgress.percentComplete} />
              ) : (
                <GenerationShimmerBar />
              )}
            </Animated.View>

            {/* Floating "estimated time" chip — editorial break outside the card */}
            <Animated.View
              entering={FadeIn.delay(180).duration(220)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginTop: 14,
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: 'rgba(246,242,233,0.92)',
                borderWidth: 1,
                borderColor: 'rgba(246,242,233,0.30)',
              }}
            >
              <Clock size={11} color={designTokens.colors.ink3} strokeWidth={1.8} />
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 11,
                  letterSpacing: 0.55,
                  textTransform: 'uppercase',
                  color: designTokens.colors.ink3,
                }}
              >
                Estimated · {estimatedTimeLabel}
              </Text>
            </Animated.View>
          </View>
        </View>
      </Modal>

      {/* Recipe Picker Modal — italic-accent bottom sheet */}
      <Modal
        visible={showRecipePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRecipePicker(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderTopWidth: 1,
            borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
            maxHeight: '80%',
          }}>
            {/* Drag handle */}
            <View style={{ alignItems: 'center', paddingTop: 8 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: isDark ? '#2a2a2a' : designTokens.colors.hair2 }} />
            </View>

            {/* Header */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14,
            }}>
              <Pressable
                onPress={() => setShowRecipePicker(false)}
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={18} color={isDark ? '#fff' : designTokens.colors.ink} strokeWidth={1.8} />
              </Pressable>
              <Text style={{
                fontFamily: designTokens.font.medium,
                fontSize: 17,
                color: isDark ? '#fff' : designTokens.colors.ink,
              }}>
                Pick recipes
              </Text>
              <Pressable
                onPress={() => setShowRecipePicker(false)}
                style={{
                  paddingHorizontal: 14, height: 36, borderRadius: 18,
                  backgroundColor: designTokens.colors.brand,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 13.5,
                  color: designTokens.colors.cream,
                }}>
                  Done
                </Text>
              </Pressable>
            </View>

            {/* Recipe List */}
            <ScrollView
              style={{ paddingHorizontal: 20 }}
              showsVerticalScrollIndicator={false}
            >
              {uniqueRecipes.length > 0 ? (
                uniqueRecipes.map((recipe) => {
                  const isSelected = selectedExistingRecipes.includes(recipe.id);
                  return (
                    <Pressable
                      key={recipe.id}
                      onPress={() => toggleExistingRecipe(recipe.id)}
                      style={{
                        flexDirection: 'row', alignItems: 'center',
                        padding: 12, gap: 12, marginBottom: 10,
                        borderRadius: 18, borderWidth: 1,
                        borderColor: isSelected
                          ? designTokens.colors.brand
                          : (isDark ? '#2a2a2a' : designTokens.colors.hair),
                        backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                      }}
                    >
                      {/* Image / placeholder */}
                      <View style={{
                        width: 56, height: 56, borderRadius: 12, overflow: 'hidden',
                        backgroundColor: '#F4F0E8',
                      }}>
                        {recipe.imageUrl ? (
                          <Image source={{ uri: recipe.imageUrl }} style={{ width: '100%', height: '100%' }} />
                        ) : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontFamily: designTokens.font.medium,
                            fontSize: 14.5,
                            color: isDark ? '#fff' : designTokens.colors.ink,
                          }}
                          numberOfLines={1}
                        >
                          {recipe.name}
                        </Text>
                        <Text
                          style={{
                            fontFamily: designTokens.font.regular,
                            fontSize: 12.5,
                            color: isDark ? '#888' : designTokens.colors.ink3,
                            marginTop: 2,
                          }}
                          numberOfLines={1}
                        >
                          {recipe.description}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Clock size={11} color={isDark ? '#888' : designTokens.colors.ink3} strokeWidth={1.8} />
                            <Text style={{ fontFamily: designTokens.font.regular, fontSize: 11.5, color: isDark ? '#888' : designTokens.colors.ink2 }}>
                              {recipe.prepTime + recipe.cookTime}m
                            </Text>
                          </View>
                          <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: isDark ? '#555' : designTokens.colors.ink3 }} />
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Flame size={11} color={isDark ? '#888' : designTokens.colors.ink3} strokeWidth={1.8} />
                            <Text style={{ fontFamily: designTokens.font.regular, fontSize: 11.5, color: isDark ? '#888' : designTokens.colors.ink2 }}>
                              {recipe.calories ?? 0}
                            </Text>
                          </View>
                          <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: isDark ? '#555' : designTokens.colors.ink3 }} />
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Users size={11} color={isDark ? '#888' : designTokens.colors.ink3} strokeWidth={1.8} />
                            <Text style={{ fontFamily: designTokens.font.regular, fontSize: 11.5, color: isDark ? '#888' : designTokens.colors.ink2 }}>
                              {recipe.servings}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View style={{
                        width: 24, height: 24, borderRadius: 12,
                        borderWidth: isSelected ? 0 : 1,
                        borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                        backgroundColor: isSelected ? designTokens.colors.brand : 'transparent',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSelected && <Check size={14} color={designTokens.colors.cream} strokeWidth={2.4} />}
                      </View>
                    </Pressable>
                  );
                })
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                  <View style={{
                    width: 56, height: 56, borderRadius: 28,
                    borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Library size={22} color={isDark ? '#888' : designTokens.colors.ink3} strokeWidth={1.6} />
                  </View>
                  <Text style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 15,
                    color: isDark ? '#fff' : designTokens.colors.ink,
                    marginTop: 14,
                  }}>
                    No recipes yet
                  </Text>
                  <Text style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 13,
                    color: isDark ? '#888' : designTokens.colors.ink3,
                    marginTop: 4,
                    textAlign: 'center',
                  }}>
                    Generate your first recipe to get started
                  </Text>
                </View>
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Preferences Edit Modal — italic-accent bottom sheet */}
      <Modal
        visible={showPreferencesModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPreferencesModal(false)}
      >
        {(() => {
          const sectionEyebrow = {
            fontFamily: designTokens.font.medium,
            fontSize: 11,
            letterSpacing: 0.55,
            textTransform: 'uppercase' as const,
            color: isDark ? '#888' : designTokens.colors.ink3,
            marginBottom: 10,
          };

          const renderSegmented = <T extends string>(
            options: readonly T[],
            value: T,
            onSelect: (v: T) => void,
          ) => (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {options.map((opt) => {
                const active = value === opt;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      onSelect(opt);
                    }}
                    style={{
                      flex: 1, paddingVertical: 11, borderRadius: 999,
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: active ? 0 : 1,
                      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                      backgroundColor: active ? designTokens.colors.brand : (isDark ? '#1f1f1f' : '#FFFFFF'),
                    }}
                  >
                    <Text style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 13.5,
                      color: active ? designTokens.colors.cream : (isDark ? '#ddd' : designTokens.colors.ink),
                      textTransform: 'capitalize',
                    }}>
                      {opt}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          );

          const renderChips = (
            items: string[],
            selectedItems: string[],
            onToggle: (item: string) => void,
            tone: 'sage' | 'olive',
          ) => (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {items.map((item) => {
                const selected = selectedItems.includes(item);
                const fill = tone === 'sage' ? designTokens.colors.brand : designTokens.colors.olive;
                return (
                  <Pressable
                    key={item}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      onToggle(item);
                    }}
                    style={{
                      paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999,
                      borderWidth: selected ? 0 : 1,
                      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                      backgroundColor: selected ? fill : (isDark ? '#1f1f1f' : '#FFFFFF'),
                    }}
                  >
                    <Text style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 12.5,
                      color: selected ? designTokens.colors.cream : (isDark ? '#ddd' : designTokens.colors.ink2),
                    }}>
                      {item}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          );

          return (
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
              <View style={{
                backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                borderTopWidth: 1,
                borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                maxHeight: '90%',
              }}>
                {/* Drag handle */}
                <View style={{ alignItems: 'center', paddingTop: 8 }}>
                  <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: isDark ? '#2a2a2a' : designTokens.colors.hair2 }} />
                </View>

                {/* Header */}
                <View style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14,
                }}>
                  <Pressable
                    onPress={() => setShowPreferencesModal(false)}
                    style={{
                      paddingHorizontal: 14, height: 36, borderRadius: 18,
                      borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Text style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 13.5,
                      color: isDark ? '#ddd' : designTokens.colors.ink2,
                    }}>
                      Cancel
                    </Text>
                  </Pressable>
                  <Text style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 17,
                    color: isDark ? '#fff' : designTokens.colors.ink,
                  }}>
                    Edit preferences
                  </Text>
                  <Pressable
                    onPress={() => setShowPreferencesModal(false)}
                    style={{
                      paddingHorizontal: 14, height: 36, borderRadius: 18,
                      backgroundColor: designTokens.colors.brand,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Text style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 13.5,
                      color: designTokens.colors.cream,
                    }}>
                      Done
                    </Text>
                  </Pressable>
                </View>

                <ScrollView
                  style={{ paddingHorizontal: 20 }}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 40 }}
                >
                  {/* Info banner */}
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    padding: 12, borderRadius: 14,
                    backgroundColor: isDark ? '#1f1f1f' : designTokens.colors.cream,
                    borderWidth: 1,
                    borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                    marginBottom: 22,
                  }}>
                    <View style={{
                      width: 32, height: 32, borderRadius: 8,
                      backgroundColor: isDark ? '#2a2a2a' : '#FFFFFF',
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                    }}>
                      <AlertTriangle size={15} color={designTokens.colors.olive} strokeWidth={1.8} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 13,
                        color: isDark ? '#fff' : designTokens.colors.ink,
                      }}>
                        Temporary preferences
                      </Text>
                      <Text style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 11.5,
                        color: isDark ? '#888' : designTokens.colors.ink2,
                        marginTop: 2,
                      }}>
                        These changes apply only to this generation.
                      </Text>
                    </View>
                  </View>

                  {/* Servings */}
                  <View style={{
                    padding: 16, borderRadius: 18,
                    borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                    backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                    marginBottom: 22,
                  }}>
                    <Text style={sectionEyebrow}>Servings</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setLocalPreferences(prev => ({
                            ...prev,
                            servingSize: Math.max(1, prev.servingSize - 1)
                          }));
                        }}
                        style={{
                          width: 36, height: 36, borderRadius: 18,
                          borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <CircleMinus size={18} color={isDark ? '#fff' : designTokens.colors.ink} strokeWidth={1.8} />
                      </Pressable>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 28,
                          color: isDark ? '#fff' : designTokens.colors.ink,
                        }}>
                          {localPreferences.servingSize}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setLocalPreferences(prev => ({
                            ...prev,
                            servingSize: Math.min(12, prev.servingSize + 1)
                          }));
                        }}
                        style={{
                          width: 36, height: 36, borderRadius: 18,
                          borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <CirclePlus size={18} color={isDark ? '#fff' : designTokens.colors.ink} strokeWidth={1.8} />
                      </Pressable>
                    </View>
                  </View>

                  {/* Skill */}
                  <View style={{ marginBottom: 22 }}>
                    <Text style={sectionEyebrow}>Cooking skill</Text>
                    {renderSegmented(
                      ['beginner', 'intermediate', 'advanced'] as const,
                      localPreferences.cookingSkillLevel,
                      (lvl) => setLocalPreferences(prev => ({ ...prev, cookingSkillLevel: lvl })),
                    )}
                  </View>

                  {/* Prep time */}
                  <View style={{ marginBottom: 22 }}>
                    <Text style={sectionEyebrow}>Prep time</Text>
                    {renderSegmented(
                      ['quick', 'moderate', 'elaborate'] as const,
                      localPreferences.mealPrepTime,
                      (t) => setLocalPreferences(prev => ({ ...prev, mealPrepTime: t })),
                    )}
                  </View>

                  {/* Diet */}
                  <View style={{ marginBottom: 22 }}>
                    <Text style={sectionEyebrow}>Dietary restrictions</Text>
                    {renderChips(
                      ['Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 'Keto', 'Paleo', 'Low-Carb', 'Low-Sodium'],
                      localPreferences.dietaryRestrictions,
                      (diet) => {
                        const isSelected = localPreferences.dietaryRestrictions.includes(diet);
                        setLocalPreferences(prev => ({
                          ...prev,
                          dietaryRestrictions: isSelected
                            ? prev.dietaryRestrictions.filter(d => d !== diet)
                            : [...prev.dietaryRestrictions, diet],
                        }));
                      },
                      'sage',
                    )}
                  </View>

                  {/* Cuisine */}
                  <View style={{ marginBottom: 22 }}>
                    <Text style={sectionEyebrow}>Cuisine preferences</Text>
                    {renderChips(
                      ['Italian', 'Mexican', 'Asian', 'Mediterranean', 'American', 'Indian', 'French', 'Japanese', 'Thai', 'Greek'],
                      localPreferences.cuisinePreferences,
                      (cuisine) => {
                        const isSelected = localPreferences.cuisinePreferences.includes(cuisine);
                        setLocalPreferences(prev => ({
                          ...prev,
                          cuisinePreferences: isSelected
                            ? prev.cuisinePreferences.filter(c => c !== cuisine)
                            : [...prev.cuisinePreferences, cuisine],
                        }));
                      },
                      'sage',
                    )}
                  </View>

                  {/* Allergies */}
                  <View style={{ marginBottom: 22 }}>
                    <Text style={sectionEyebrow}>Allergies to avoid</Text>
                    {renderChips(
                      ['Nuts', 'Shellfish', 'Eggs', 'Soy', 'Fish', 'Wheat', 'Sesame'],
                      localPreferences.allergies,
                      (allergy) => {
                        const isSelected = localPreferences.allergies.includes(allergy);
                        setLocalPreferences(prev => ({
                          ...prev,
                          allergies: isSelected
                            ? prev.allergies.filter(a => a !== allergy)
                            : [...prev.allergies, allergy],
                        }));
                      },
                      'olive',
                    )}
                  </View>

                  {/* Reset */}
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setLocalPreferences(preferences);
                    }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                      gap: 8, paddingVertical: 12, borderRadius: 999,
                      borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                      backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                    }}
                  >
                    <RefreshCcw size={15} color={isDark ? '#ddd' : designTokens.colors.ink2} strokeWidth={1.8} />
                    <Text style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 13.5,
                      color: isDark ? '#ddd' : designTokens.colors.ink2,
                    }}>
                      Reset to profile
                    </Text>
                  </Pressable>
                </ScrollView>
              </View>
            </View>
          );
        })()}
      </Modal>

      {/* Generated Recipe Modal — italic-accent bottom sheet */}
      <Modal
        visible={showRecipeModal && !!generatedRecipe}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRecipeModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderTopWidth: 1,
            borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
            maxHeight: '92%',
          }}>
            {/* Drag handle */}
            <View style={{ alignItems: 'center', paddingTop: 8 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: isDark ? '#2a2a2a' : designTokens.colors.hair2 }} />
            </View>

            {/* Header */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14,
            }}>
              <Pressable
                onPress={() => setShowRecipeModal(false)}
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={18} color={isDark ? '#fff' : designTokens.colors.ink} strokeWidth={1.8} />
              </Pressable>
              <Text style={{
                fontFamily: designTokens.font.medium,
                fontSize: 17,
                color: isDark ? '#fff' : designTokens.colors.ink,
              }}>
                Your recipe
              </Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView
              style={{ paddingHorizontal: 20 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 130 }}
            >
              {generatedRecipe && (
                <>
                  {/* Meal-type chip + title + description */}
                  <View style={{ marginBottom: 16 }}>
                    {selectedMealTypes[0] && (() => {
                      const key = selectedMealTypes[0] as keyof typeof MEAL_TYPE_TINT;
                      const tint = MEAL_TYPE_TINT[key];
                      const MealIcon = MEAL_TYPES.find(mt => mt.key === key)?.icon ?? UtensilsCrossed;
                      const label = MEAL_TYPES.find(mt => mt.key === key)?.label ?? 'Meal';
                      return (
                        <View style={{
                          alignSelf: 'flex-start',
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 10, paddingVertical: 5,
                          borderRadius: 999,
                          backgroundColor: isDark ? '#2a2a2a' : tint.tint,
                          marginBottom: 12,
                        }}>
                          <MealIcon size={12} color={isDark ? '#bbb' : tint.accent} strokeWidth={1.8} />
                          <Text style={{
                            fontFamily: designTokens.font.medium,
                            fontSize: 11,
                            letterSpacing: 0.55,
                            textTransform: 'uppercase',
                            color: isDark ? '#bbb' : tint.accent,
                          }}>
                            {label}
                          </Text>
                        </View>
                      );
                    })()}

                    <Text style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 24,
                      lineHeight: 30,
                      letterSpacing: -0.4,
                      color: isDark ? '#fff' : designTokens.colors.ink,
                    }}>
                      {generatedRecipe.name}
                    </Text>
                    <Text style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 14.5,
                      lineHeight: 21,
                      color: isDark ? '#bbb' : designTokens.colors.ink2,
                      marginTop: 8,
                    }}>
                      {generatedRecipe.description}
                    </Text>
                  </View>

                  {/* Stat tiles */}
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
                    {[
                      { value: generatedRecipe.prepTime + generatedRecipe.cookTime, label: 'Minutes' },
                      { value: generatedRecipe.calories, label: 'Calories' },
                      { value: generatedRecipe.servings, label: 'Servings' },
                    ].map((stat) => (
                      <View key={stat.label} style={{
                        flex: 1, alignItems: 'center', paddingVertical: 12,
                        borderRadius: 14, borderWidth: 1,
                        borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                        backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                      }}>
                        <Text style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 18,
                          color: isDark ? '#fff' : designTokens.colors.ink,
                        }}>
                          {stat.value}
                        </Text>
                        <Text style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 11,
                          letterSpacing: 0.55,
                          textTransform: 'uppercase',
                          color: isDark ? '#888' : designTokens.colors.ink3,
                          marginTop: 2,
                        }}>
                          {stat.label}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Tag chips */}
                  {generatedRecipe.tags.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                      {generatedRecipe.tags.slice(0, 6).map((tag) => (
                        <View key={tag} style={{
                          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                          borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                          backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                        }}>
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

                  {/* Ingredients */}
                  <View style={{
                    padding: 16, borderRadius: 18, marginBottom: 14,
                    borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                    backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                  }}>
                    <Text style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 11, letterSpacing: 0.55, textTransform: 'uppercase',
                      color: isDark ? '#888' : designTokens.colors.ink3,
                      marginBottom: 10,
                    }}>
                      Ingredients · {generatedRecipe.ingredients.length}
                    </Text>
                    {generatedRecipe.ingredients.map((ing, i) => (
                      <View
                        key={i}
                        style={{
                          flexDirection: 'row', alignItems: 'center',
                          paddingVertical: 9,
                          borderBottomWidth: i < generatedRecipe.ingredients.length - 1 ? 1 : 0,
                          borderBottomColor: isDark ? '#2a2a2a' : designTokens.colors.hair2,
                        }}
                      >
                        <View style={{
                          width: 5, height: 5, borderRadius: 3,
                          marginRight: 10,
                          backgroundColor: designTokens.colors.brand,
                        }} />
                        <Text style={{
                          flex: 1,
                          fontFamily: designTokens.font.regular,
                          fontSize: 13.5,
                          color: isDark ? '#ddd' : designTokens.colors.ink2,
                        }}>
                          <Text style={{ fontFamily: designTokens.font.medium, color: isDark ? '#fff' : designTokens.colors.ink }}>
                            {ing.quantity} {ing.unit}
                          </Text>{' '}{ing.name}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Instructions */}
                  <View style={{
                    padding: 16, borderRadius: 18,
                    borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                    backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                  }}>
                    <Text style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 11, letterSpacing: 0.55, textTransform: 'uppercase',
                      color: isDark ? '#888' : designTokens.colors.ink3,
                      marginBottom: 12,
                    }}>
                      Instructions
                    </Text>
                    {generatedRecipe.instructions.map((instruction, i) => (
                      <View key={i} style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                        <View style={{
                          width: 28, height: 28, borderRadius: 14,
                          backgroundColor: isDark ? '#2a2a2a' : '#E8ECDF',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Text style={{
                            fontFamily: designTokens.font.semibold,
                            fontSize: 13,
                            color: designTokens.colors.brand,
                          }}>
                            {i + 1}
                          </Text>
                        </View>
                        <Text style={{
                          flex: 1,
                          fontFamily: designTokens.font.regular,
                          fontSize: 14,
                          lineHeight: 20,
                          color: isDark ? '#ddd' : designTokens.colors.ink2,
                          paddingTop: 4,
                        }}>
                          {instruction}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28,
              backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
              borderTopWidth: 1,
              borderTopColor: isDark ? '#2a2a2a' : designTokens.colors.hair2,
            }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => {
                    setShowRecipeModal(false);
                    handleRegenerate();
                  }}
                  disabled={isPending || isSavingRecipe}
                  style={{
                    width: 48, height: 48, borderRadius: 24,
                    borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                    alignItems: 'center', justifyContent: 'center',
                    opacity: (isPending || isSavingRecipe) ? 0.5 : 1,
                  }}
                >
                  <RefreshCcw size={18} color={isDark ? '#ddd' : designTokens.colors.ink2} strokeWidth={1.8} />
                </Pressable>
                <Pressable
                  onPress={handleSaveRecipe}
                  disabled={isSavingRecipe}
                  style={{
                    flex: 1, height: 48, borderRadius: 999,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    backgroundColor: designTokens.colors.brand,
                    opacity: isSavingRecipe ? 0.7 : 1,
                  }}
                >
                  {isSavingRecipe ? (
                    <>
                      <ActivityIndicator color={designTokens.colors.cream} size="small" />
                      <Text style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 15,
                        color: designTokens.colors.cream,
                      }}>
                        Saving…
                      </Text>
                    </>
                  ) : (
                    <>
                      <Check size={18} color={designTokens.colors.cream} strokeWidth={2.2} />
                      <Text style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 15,
                        color: designTokens.colors.cream,
                      }}>
                        Save recipe
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Generated Meal Plan Modal — italic-accent bottom sheet */}
      <Modal
        visible={showMealPlanModal && generatedMealPlan.length > 0}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMealPlanModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderTopWidth: 1,
            borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
            maxHeight: '92%',
          }}>
            {/* Drag handle */}
            <View style={{ alignItems: 'center', paddingTop: 8 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: isDark ? '#2a2a2a' : designTokens.colors.hair2 }} />
            </View>

            {/* Header */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14,
            }}>
              <Pressable
                onPress={() => setShowMealPlanModal(false)}
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={18} color={isDark ? '#fff' : designTokens.colors.ink} strokeWidth={1.8} />
              </Pressable>
              <Text style={{
                fontFamily: designTokens.font.medium,
                fontSize: 17,
                color: isDark ? '#fff' : designTokens.colors.ink,
              }}>
                Your meal plan
              </Text>
              <View style={{ width: 40 }} />
            </View>

            {/* Summary strip */}
            <View style={{
              marginHorizontal: 20, marginBottom: 12,
              paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14,
              borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
              backgroundColor: isDark ? '#1f1f1f' : designTokens.colors.cream,
              flexDirection: 'row', alignItems: 'center', gap: 8,
            }}>
              <CalendarDays size={14} color={designTokens.colors.brand} strokeWidth={1.8} />
              <Text style={{
                fontFamily: designTokens.font.medium,
                fontSize: 13,
                color: isDark ? '#ddd' : designTokens.colors.ink2,
              }}>
                {generatedMealPlan.length} recipes ready for your meal plan
              </Text>
            </View>

            <ScrollView
              style={{ paddingHorizontal: 20 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 130 }}
            >
              {(() => {
                const mealTypeOrder: Record<string, number> = {
                  breakfast: 0,
                  lunch: 1,
                  dinner: 2,
                  snack: 3,
                };

                const sortedRecipes = [...generatedMealPlan].sort((a, b) => {
                  const orderA = mealTypeOrder[a.mealType ?? 'dinner'] ?? 2;
                  const orderB = mealTypeOrder[b.mealType ?? 'dinner'] ?? 2;
                  return orderA - orderB;
                });

                return sortedRecipes.map((recipe, displayIndex) => {
                  const originalIndex = generatedMealPlan.indexOf(recipe);
                  const MealIcon = MEAL_TYPES.find(mt => mt.key === recipe.mealType)?.icon ?? UtensilsCrossed;
                  const mealLabel = MEAL_TYPES.find(mt => mt.key === recipe.mealType)?.label ?? 'Meal';
                  const tint = recipe.mealType
                    ? MEAL_TYPE_TINT[recipe.mealType as keyof typeof MEAL_TYPE_TINT]
                    : { tint: designTokens.colors.hair2, accent: designTokens.colors.ink3 };

                  return (
                    <Animated.View
                      key={`${displayIndex}-${recipe.name}`}
                      entering={FadeInDown.delay(displayIndex * 50).springify()}
                      style={{
                        padding: 14, marginBottom: 12, borderRadius: 18,
                        borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                        backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                      }}
                    >
                      {/* Header row: tinted meal chip + regenerate */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <View style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                          backgroundColor: isDark ? '#2a2a2a' : tint.tint,
                        }}>
                          <MealIcon size={11} color={isDark ? '#bbb' : tint.accent} strokeWidth={1.8} />
                          <Text style={{
                            fontFamily: designTokens.font.medium,
                            fontSize: 10.5,
                            letterSpacing: 0.55,
                            textTransform: 'uppercase',
                            color: isDark ? '#bbb' : tint.accent,
                          }}>
                            {mealLabel}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => handleRegenerateSingle(originalIndex)}
                          disabled={regeneratingIndex !== null}
                          style={{
                            width: 32, height: 32, borderRadius: 16,
                            borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                            alignItems: 'center', justifyContent: 'center',
                            opacity: regeneratingIndex !== null && regeneratingIndex !== originalIndex ? 0.5 : 1,
                          }}
                        >
                          {regeneratingIndex === originalIndex ? (
                            <ActivityIndicator size="small" color={isDark ? '#bbb' : designTokens.colors.ink2} />
                          ) : (
                            <RefreshCcw size={13} color={isDark ? '#ddd' : designTokens.colors.ink2} strokeWidth={1.8} />
                          )}
                        </Pressable>
                      </View>

                      {/* Recipe name */}
                      <Text style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 15.5,
                        color: isDark ? '#fff' : designTokens.colors.ink,
                      }}>
                        {recipe.name}
                      </Text>

                      {/* Description */}
                      <Text
                        numberOfLines={2}
                        style={{
                          fontFamily: designTokens.font.regular,
                          fontSize: 12.5,
                          lineHeight: 17,
                          color: isDark ? '#888' : designTokens.colors.ink2,
                          marginTop: 4,
                        }}
                      >
                        {recipe.description}
                      </Text>

                      {/* Meta chips */}
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                        {[
                          { icon: Clock, label: `${recipe.prepTime + recipe.cookTime}m` },
                          { icon: Flame, label: `${recipe.calories} cal` },
                          { icon: Users, label: `${recipe.servings}` },
                        ].map((m, idx) => {
                          const Icon = m.icon;
                          return (
                            <View key={idx} style={{
                              flexDirection: 'row', alignItems: 'center', gap: 4,
                              paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
                              borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                            }}>
                              <Icon size={10} color={isDark ? '#888' : designTokens.colors.ink3} strokeWidth={1.8} />
                              <Text style={{
                                fontFamily: designTokens.font.medium,
                                fontSize: 11,
                                color: isDark ? '#bbb' : designTokens.colors.ink2,
                              }}>
                                {m.label}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    </Animated.View>
                  );
                });
              })()}
            </ScrollView>

            {/* Footer */}
            <View style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28,
              backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
              borderTopWidth: 1,
              borderTopColor: isDark ? '#2a2a2a' : designTokens.colors.hair2,
            }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => {
                    setShowMealPlanModal(false);
                    handleRegenerate();
                  }}
                  disabled={isPending || isSavingMealPlan}
                  style={{
                    width: 48, height: 48, borderRadius: 24,
                    borderWidth: 1, borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                    alignItems: 'center', justifyContent: 'center',
                    opacity: (isPending || isSavingMealPlan) ? 0.5 : 1,
                  }}
                >
                  <RefreshCcw size={18} color={isDark ? '#ddd' : designTokens.colors.ink2} strokeWidth={1.8} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    handleSaveMealPlan();
                    setShowMealPlanModal(false);
                  }}
                  disabled={isSavingMealPlan}
                  style={{
                    flex: 1, height: 48, borderRadius: 999,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    backgroundColor: designTokens.colors.brand,
                    opacity: isSavingMealPlan ? 0.7 : 1,
                  }}
                >
                  {isSavingMealPlan ? (
                    <>
                      <ActivityIndicator color={designTokens.colors.cream} size="small" />
                      <Text style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 15,
                        color: designTokens.colors.cream,
                      }}>
                        Saving…
                      </Text>
                    </>
                  ) : (
                    <>
                      <Check size={18} color={designTokens.colors.cream} strokeWidth={2.2} />
                      <Text style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 15,
                        color: designTokens.colors.cream,
                      }}>
                        Save to meal plan
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
