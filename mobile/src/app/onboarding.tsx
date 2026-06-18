// Onboarding — editorial redesign (Allset / Mealime inspired).
// Visual + microcopy only: every store hook, useState, useCallback, validation rule,
// haptic, ImagePicker/Supabase flow, and route is preserved byte-equivalent.
// Personal info stays at step 0; name + avatar thread through every subsequent step.
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Image,
  ActivityIndicator,
  Keyboard,
  Dimensions,
  BackHandler,
  StyleSheet,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import {
  User,
  Camera,
  Image as ImageIcon,
  ChefHat,
  AlertTriangle,
  Check,
  Clock,
  DollarSign,
  Heart,
  CirclePlus,
  CircleMinus,
  ArrowLeft,
  ArrowRight,
  Compass,
  Wallet,
} from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withRepeat,
  withDelay,
  interpolate,
  Easing,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';
import { designTokens, easing, elevation } from '@/lib/design-tokens';
import { getOptionIcon } from '@/lib/onboarding-icons';
import { BrandLogo } from '@/components/BrandLogo';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/lib/useColorScheme';
import { useAuthStore } from '@/lib/auth-store';
import { useSubscriptionStore } from '@/lib/subscription-store';
import { logMetaEvent } from '@/lib/meta-sdk';
import {
  useMealPlanStore,
  type Household,
  type WeeknightMinutes,
  type Priority,
  type BreakfastHabit,
  type LunchHabit,
  type DinnerHabit,
  type MealHabits,
  mealPrepTimeFromMinutes,
  servingSizeFromHousehold,
} from '@/lib/store';
import { pickImage, takePhoto, uploadFile } from '@/lib/upload';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ───────────────────────────────────────────────────────────────────────────────
// OPTIONS (unchanged from previous version — verbatim)
// ───────────────────────────────────────────────────────────────────────────────

const DIETARY_OPTIONS = [
  { id: 'Vegetarian', label: 'Vegetarian', icon: '🥬' },
  { id: 'Vegan', label: 'Vegan', icon: '🌱' },
  { id: 'Pescatarian', label: 'Pescatarian', icon: '🐟' },
  { id: 'Gluten-Free', label: 'Gluten-Free', icon: '🌾' },
  { id: 'Dairy-Free', label: 'Dairy-Free', icon: '🥛' },
  { id: 'Keto', label: 'Keto', icon: '🥑' },
  { id: 'Paleo', label: 'Paleo', icon: '🍖' },
  { id: 'Low-Carb', label: 'Low-Carb', icon: '🥗' },
  { id: 'Low-Sodium', label: 'Low-Sodium', icon: '🧂' },
  { id: 'Halal', label: 'Halal', icon: '☪️' },
  { id: 'Kosher', label: 'Kosher', icon: '✡️' },
];

const ALLERGY_OPTIONS = [
  { id: 'Peanuts', label: 'Peanuts', icon: '🥜' },
  { id: 'Tree Nuts', label: 'Tree Nuts', icon: '🌰' },
  { id: 'Milk', label: 'Dairy', icon: '🥛' },
  { id: 'Eggs', label: 'Eggs', icon: '🥚' },
  { id: 'Fish', label: 'Fish', icon: '🐟' },
  { id: 'Shellfish', label: 'Shellfish', icon: '🦐' },
  { id: 'Soy', label: 'Soy', icon: '🫘' },
  { id: 'Wheat', label: 'Wheat', icon: '🌾' },
  { id: 'Sesame', label: 'Sesame', icon: '🫘' },
];

const CUISINE_OPTIONS = [
  { id: 'Italian', label: 'Italian', icon: '🍝' },
  { id: 'Mexican', label: 'Mexican', icon: '🌮' },
  { id: 'Asian', label: 'Asian', icon: '🥢' },
  { id: 'Japanese', label: 'Japanese', icon: '🍱' },
  { id: 'Chinese', label: 'Chinese', icon: '🥡' },
  { id: 'Indian', label: 'Indian', icon: '🍛' },
  { id: 'Thai', label: 'Thai', icon: '🍜' },
  { id: 'Mediterranean', label: 'Mediterranean', icon: '🫒' },
  { id: 'American', label: 'American', icon: '🍔' },
  { id: 'Korean', label: 'Korean', icon: '🍚' },
  { id: 'French', label: 'French', icon: '🥐' },
  { id: 'Greek', label: 'Greek', icon: '🥙' },
];

const SKILL_LEVELS = [
  { id: 'beginner', label: 'Beginner', description: 'Simple recipes, basic techniques', icon: '🌱' },
  { id: 'intermediate', label: 'Intermediate', description: 'More variety, moderate complexity', icon: '🍳' },
  { id: 'advanced', label: 'Advanced', description: 'Complex dishes, advanced techniques', icon: '👨‍🍳' },
];

const HOUSEHOLD_OPTIONS: { id: Household; label: string; icon: string }[] = [
  { id: 'solo', label: 'Just me', icon: '🧑' },
  { id: 'couple', label: 'Couple', icon: '👫' },
  { id: 'family_kids', label: 'Family', icon: '👨‍👩‍👧' },
  { id: 'roommates', label: 'Roommates', icon: '🏠' },
];

const WEEKNIGHT_OPTIONS: { id: WeeknightMinutes; label: string; icon: string }[] = [
  { id: 15, label: '15 min', icon: '⚡' },
  { id: 30, label: '30 min', icon: '⏱️' },
  { id: 45, label: '45 min', icon: '🍳' },
  { id: 60, label: '1 hour', icon: '🍲' },
  { id: 90, label: '90+ min', icon: '👨‍🍳' },
];

const EQUIPMENT_OPTIONS = [
  { id: 'oven', label: 'Oven', icon: '♨️' },
  { id: 'stovetop', label: 'Stovetop', icon: '🔥' },
  { id: 'microwave', label: 'Microwave', icon: '📦' },
  { id: 'air_fryer', label: 'Air Fryer', icon: '💨' },
  { id: 'instant_pot', label: 'Instant Pot', icon: '🥘' },
  { id: 'slow_cooker', label: 'Slow Cooker', icon: '🍯' },
  { id: 'blender', label: 'Blender', icon: '🌀' },
  { id: 'grill', label: 'Grill', icon: '🥩' },
  { id: 'rice_cooker', label: 'Rice Cooker', icon: '🍚' },
  { id: 'food_processor', label: 'Food Processor', icon: '⚙️' },
];

const BREAKFAST_HABITS: { id: BreakfastHabit; label: string; icon: string }[] = [
  { id: 'skip', label: 'Skip', icon: '🚫' },
  { id: 'cook', label: 'Cook', icon: '🍳' },
  { id: 'grab', label: 'Grab & go', icon: '🥐' },
];

const LUNCH_HABITS: { id: LunchHabit; label: string; icon: string }[] = [
  { id: 'leftovers', label: 'Leftovers', icon: '🥡' },
  { id: 'cook', label: 'Cook fresh', icon: '🥗' },
  { id: 'buy', label: 'Buy out', icon: '💵' },
];

const DINNER_HABITS: { id: DinnerHabit; label: string; icon: string }[] = [
  { id: 'leftovers', label: 'Leftovers', icon: '🥡' },
  { id: 'cook', label: 'Cook fresh', icon: '🍲' },
  { id: 'buy', label: 'Buy out', icon: '💵' },
];

const PRIORITY_OPTIONS: { id: Priority; label: string; icon: any; description: string }[] = [
  { id: 'time', label: 'Time', icon: Clock, description: 'Fast, simple recipes' },
  { id: 'cost', label: 'Cost', icon: DollarSign, description: 'Budget-friendly meals' },
  { id: 'variety', label: 'Variety', icon: Compass, description: 'Different cuisines & formats' },
  { id: 'health', label: 'Health', icon: Heart, description: 'Balanced & nourishing' },
];

const GOAL_OPTIONS = [
  { id: 'eat_healthier', label: 'Eat healthier', icon: '🥗' },
  { id: 'save_money', label: 'Save money', icon: '💰' },
  { id: 'reduce_waste', label: 'Reduce waste', icon: '♻️' },
  { id: 'learn_recipes', label: 'Learn recipes', icon: '📖' },
  { id: 'lose_weight', label: 'Lose weight', icon: '🎯' },
  { id: 'more_protein', label: 'More protein', icon: '💪' },
];

const COMMON_PANTRY = ['Salt', 'Pepper', 'Olive oil', 'Garlic', 'Onion', 'Eggs'];

const CUISINE_PANTRY_MAP: Record<string, string[]> = {
  Italian: ['Pasta', 'Canned tomatoes', 'Parmesan', 'Basil', 'Oregano'],
  Mexican: ['Rice', 'Black beans', 'Tortillas', 'Cumin', 'Lime'],
  Asian: ['Rice', 'Soy sauce', 'Sesame oil', 'Ginger', 'Rice vinegar'],
  Japanese: ['Rice', 'Soy sauce', 'Mirin', 'Nori', 'Miso paste'],
  Chinese: ['Rice', 'Soy sauce', 'Sesame oil', 'Ginger', 'Hoisin sauce'],
  Indian: ['Basmati rice', 'Lentils', 'Cumin', 'Turmeric', 'Coriander', 'Garam masala'],
  Thai: ['Jasmine rice', 'Fish sauce', 'Coconut milk', 'Lime', 'Thai basil'],
  Mediterranean: ['Olive oil', 'Lemon', 'Feta', 'Chickpeas', 'Olives'],
  American: ['Bread', 'Cheese', 'Butter', 'Potatoes', 'Ketchup'],
  Korean: ['Rice', 'Gochujang', 'Sesame oil', 'Soy sauce', 'Kimchi'],
  French: ['Butter', 'Cream', 'Wine', 'Dijon mustard', 'Herbs de Provence'],
  Greek: ['Olive oil', 'Lemon', 'Feta', 'Oregano', 'Yogurt'],
};

function buildSmartPantryList(cuisines: string[]): string[] {
  const set = new Set<string>(COMMON_PANTRY);
  for (const c of cuisines) {
    const items = CUISINE_PANTRY_MAP[c];
    if (items) items.forEach((i) => set.add(i));
  }
  if (cuisines.length === 0) {
    ['Pasta', 'Rice', 'Bread', 'Butter', 'Lemon'].forEach((i) => set.add(i));
  }
  return Array.from(set);
}

const TOTAL_STEPS = 5;
const STEP_NAMES = ['About you', 'Diet', 'Cuisine', 'Time', 'Priorities'];

// Bundled local require() (not a remote URL) so the welcome hero plays
// instantly from disk with no network fetch.
const WELCOME_HERO_VIDEO = require('../../assets/videos/hero.mp4');

// Category tints for OptionTile selected state.
const TONE_TINTS: Record<'sage' | 'olive' | 'slate' | 'tan', { bg: string; border: string }> = {
  sage: { bg: '#E8ECDF', border: designTokens.colors.brand },
  olive: { bg: '#F2E0D9', border: designTokens.colors.olive },
  slate: { bg: '#E1E8EE', border: '#88A4C2' },
  tan: { bg: '#F4EBDB', border: '#B4862C' },
};

// 4-column grid math. Step content padding is 24px each side; tile gap is 8px.
// Tile width = (screen − 48 paddings − 24 total gaps) / 4. Guarantees 4 columns
// without flex-wrap overflowing on small devices.
const TILE_GAP = 8;
const TILE_H_PAD = 24;
const TILE_WIDTH = Math.floor(
  (SCREEN_WIDTH - TILE_H_PAD * 2 - TILE_GAP * 3) / 4
);

// Premium flat icon — bundled Fluent Emoji (flat) rendered from inlined SVG via
// react-native-svg. Fully offline, instant on first launch. Falls back to the raw
// emoji glyph only if a mapping is ever missing.
const OptionIcon = React.memo(function OptionIcon({ emoji, size }: { emoji: string; size: number }) {
  const svg = getOptionIcon(emoji);
  if (svg) return <SvgXml xml={svg} width={size} height={size} />;
  return <Text style={{ fontSize: Math.round(size * 0.82) }}>{emoji}</Text>;
});

// ───────────────────────────────────────────────────────────────────────────────
// REUSABLE SUBCOMPONENTS
// ───────────────────────────────────────────────────────────────────────────────

function OptionTile({
  emoji,
  label,
  selected,
  tone = 'sage',
  onPress,
  isDark,
}: {
  emoji: string;
  label: string;
  selected: boolean;
  tone?: 'sage' | 'olive' | 'slate' | 'tan';
  onPress: () => void;
  isDark: boolean;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const tint = TONE_TINTS[tone];
  // Quiet-luxury: neutral surface by default; the icon carries the color. The
  // soft category tint + accent border + check badge mark the selected state.
  return (
    <Animated.View style={[animStyle, { width: TILE_WIDTH }]}>
      <Pressable
        onPress={() => {
          scale.value = withSequence(withSpring(0.96, { duration: 80 }), withSpring(1));
          onPress();
        }}
        style={{ alignItems: 'center', gap: 8 }}
      >
        {/* Top: neutral panel with the bundled flat illustration */}
        <View
          style={{
            width: TILE_WIDTH,
            height: TILE_WIDTH,
            borderRadius: 18,
            backgroundColor: selected
              ? isDark
                ? 'rgba(84,100,69,0.16)'
                : tint.bg
              : isDark
                ? '#1f1f1f'
                : '#FFFFFF',
            borderWidth: 1,
            borderColor: selected
              ? tint.border
              : isDark
                ? '#2a2a2a'
                : designTokens.colors.hair,
            alignItems: 'center',
            justifyContent: 'center',
            ...elevation.card,
          }}
        >
          <OptionIcon emoji={emoji} size={Math.round(TILE_WIDTH * 0.52)} />
          {/* Selected check badge — soft, top-right */}
          {selected && (
            <Animated.View
              entering={FadeIn.duration(140)}
              style={{
                position: 'absolute',
                top: 5,
                right: 5,
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: tint.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Check size={11} color={designTokens.colors.cream} strokeWidth={3} />
            </Animated.View>
          )}
        </View>
        {/* Bottom: label sits below the panel, two lines max, fixed height so
            grid rows stay aligned regardless of label length. */}
        <View style={{ height: 30, justifyContent: 'flex-start' }}>
          <Text
            numberOfLines={2}
            style={{
              fontFamily: selected ? designTokens.font.semibold : designTokens.font.medium,
              fontSize: 12,
              lineHeight: 14.5,
              color: selected
                ? isDark
                  ? '#fff'
                  : designTokens.colors.ink
                : isDark
                  ? '#cfcfcf'
                  : designTokens.colors.ink2,
              textAlign: 'center',
            }}
          >
            {label}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function Chip({
  selected,
  label,
  icon,
  onPress,
  tone = 'sage',
  isDark,
}: {
  selected: boolean;
  label: string;
  icon?: string;
  onPress: () => void;
  tone?: 'sage' | 'olive' | 'charcoal';
  isDark: boolean;
}) {
  const fill =
    tone === 'charcoal'
      ? designTokens.colors.charcoal
      : tone === 'olive'
        ? designTokens.colors.olive
        : designTokens.colors.brand;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 999,
        borderWidth: selected ? 0 : 1,
        borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
        backgroundColor: selected ? fill : isDark ? '#1f1f1f' : '#FFFFFF',
      }}
    >
      {icon ? <OptionIcon emoji={icon} size={17} /> : null}
      <Text
        style={{
          fontFamily: designTokens.font.medium,
          fontSize: 13,
          color: selected ? designTokens.colors.cream : isDark ? '#fff' : designTokens.colors.ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function IdentityRibbon({
  firstName,
  avatarUrl,
  isDark,
}: {
  firstName: string;
  avatarUrl: string | null;
  isDark: boolean;
}) {
  if (!firstName) return null;
  const initial = firstName.charAt(0).toUpperCase();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
          backgroundColor: isDark ? '#1f1f1f' : designTokens.colors.cream,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={{ width: 28, height: 28 }} resizeMode="cover" />
        ) : (
          <Text
            style={{
              fontFamily: designTokens.font.semibold,
              fontSize: 12,
              color: isDark ? '#bbb' : designTokens.colors.ink2,
            }}
          >
            {initial}
          </Text>
        )}
      </View>
      <Text
        style={{
          fontFamily: designTokens.font.regular,
          fontSize: 12.5,
          color: isDark ? '#888' : designTokens.colors.ink2,
        }}
      >
        for{' '}
        <Text
          style={{
            fontFamily: designTokens.font.medium,
            color: isDark ? '#bbb' : designTokens.colors.ink,
          }}
        >
          {firstName}
        </Text>
      </Text>
    </View>
  );
}

// Italic-accent step headline
function StepHeader({
  prefix,
  italic,
  suffix,
  subtitle,
  isDark,
}: {
  prefix: string;
  italic: string;
  suffix?: string;
  subtitle: string;
  isDark: boolean;
}) {
  return (
    <View style={{ marginBottom: 22 }}>
      <Text
        style={{
          fontFamily: designTokens.font.medium,
          fontSize: 26,
          color: isDark ? '#fff' : designTokens.colors.ink,
          letterSpacing: -0.52,
          lineHeight: 34,
        }}
      >
        {prefix}
        <Text
          style={{
            fontFamily: designTokens.font.serifItalic,
            fontStyle: 'italic',
            fontSize: 30,
            letterSpacing: -0.3,
          }}
        >
          {italic}
        </Text>
        {suffix ?? ''}
      </Text>
      <Text
        style={{
          fontFamily: designTokens.font.regular,
          fontSize: 14.5,
          color: isDark ? '#888' : designTokens.colors.ink2,
          marginTop: 6,
          lineHeight: 20,
        }}
      >
        {subtitle}
      </Text>
    </View>
  );
}

function SectionEyebrow({ label, isDark, hint }: { label: string; isDark: boolean; hint?: string }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text
        style={{
          fontFamily: designTokens.font.medium,
          fontSize: 11,
          letterSpacing: 0.55,
          textTransform: 'uppercase',
          color: isDark ? '#888' : designTokens.colors.ink3,
        }}
      >
        {label}
      </Text>
      {hint ? (
        <Text
          style={{
            fontFamily: designTokens.font.regular,
            fontSize: 12,
            color: isDark ? '#666' : designTokens.colors.ink3,
            marginTop: 4,
          }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// SCREEN
// ───────────────────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const currentUser = useAuthStore((s) => s.currentUser);
  const updateProfile = useSubscriptionStore((s) => s.updateProfile);
  const preferences = useMealPlanStore((s) => s.preferences);
  const setPreferences = useMealPlanStore((s) => s.setPreferences);

  // Resume from saved step if user previously bailed mid-flow
  const [currentStep, setCurrentStep] = useState<number>(
    preferences.onboardingStep && preferences.onboardingStep < TOTAL_STEPS
      ? preferences.onboardingStep
      : 0
  );

  // Welcome screen — only on a fresh start (step 0 + not yet completed).
  const [showWelcome, setShowWelcome] = useState<boolean>(
    (preferences.onboardingStep ?? 0) === 0 && !preferences.hasCompletedOnboarding
  );

  // Step 0 — About you
  // AUTH-LAST: onboarding is the FIRST-TIME flow (returning accounts are routed
  // straight past it), and it runs BEFORE signup. So the name must come from
  // what the user types here — never pre-filled from a leftover/stale session
  // (on iOS a previous Supabase token can survive an app-data clear).
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [household, setHousehold] = useState<Household>(preferences.household ?? 'couple');

  // Step 1 — Diet & allergies
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>(
    preferences.dietaryRestrictions ?? []
  );
  const [allergies, setAllergies] = useState<string[]>(preferences.allergies ?? []);

  // Step 2 — Cuisines & style
  const [cuisinePreferences, setCuisinePreferences] = useState<string[]>(
    preferences.cuisinePreferences ?? []
  );
  const [cookingSkillLevel, setCookingSkillLevel] = useState<'beginner' | 'intermediate' | 'advanced'>(
    preferences.cookingSkillLevel ?? 'intermediate'
  );
  const [adventureLevel, setAdventureLevel] = useState<number>(preferences.adventureLevel ?? 3);

  // Step 3 — Time
  const [cookingDaysPerWeek, setCookingDaysPerWeek] = useState<number>(
    preferences.cookingDaysPerWeek ?? 5
  );
  const [weeknightMinutes, setWeeknightMinutes] = useState<WeeknightMinutes>(
    preferences.weeknightMinutes ?? 30
  );

  // Step 4 — Kitchen & habits
  const [equipment, setEquipment] = useState<string[]>(
    preferences.equipment ?? ['oven', 'stovetop']
  );
  const [mealHabits, setMealHabits] = useState<MealHabits>(
    preferences.mealHabits ?? { breakfast: 'cook', lunch: 'leftovers', dinner: 'cook' }
  );

  // Step 5 — Priorities, goals & budget
  const [priorities, setPriorities] = useState<Priority[]>(preferences.priorities ?? []);
  const [weeklyBudget, setWeeklyBudget] = useState<string>(
    preferences.weeklyBudget != null ? String(preferences.weeklyBudget) : ''
  );
  const [monthlyBudget, setMonthlyBudget] = useState<string>(
    preferences.monthlyBudget != null ? String(preferences.monthlyBudget) : ''
  );
  const [goals, setGoals] = useState<string[]>(preferences.goals ?? []);
  const smartPantry = useMemo(
    () => buildSmartPantryList(cuisinePreferences),
    [cuisinePreferences]
  );
  const [pantryStaples, setPantryStaples] = useState<string[]>(
    preferences.pantryStaples ?? COMMON_PANTRY
  );

  const [isSaving, setIsSaving] = useState(false);

  // Finale reveal — a brief peak-end moment shown after the final step, before
  // the handoff to plan-meals. Navigation runs exactly once (guarded), whether
  // triggered by the auto-advance timer or the "See my plan" tap.
  const [showFinale, setShowFinale] = useState(false);
  const navigatedRef = useRef(false);
  const goToPlan = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.replace('/plan-meals?from=onboarding');
  }, [router]);

  // Tracks step-change direction (forward/backward). Retained for potential
  // direction-aware behaviour.
  const transitionDirection = useRef<'forward' | 'backward'>('forward');

  // Derived personalization signal — first name for ribbon, subtitles, final CTA.
  const firstName = useMemo(() => name.trim().split(/\s+/)[0] ?? '', [name]);

  // Persist current step on each change so the user can resume after exit.
  useEffect(() => {
    setPreferences({ onboardingStep: currentStep });
  }, [currentStep, setPreferences]);

  // Image upload handlers
  const handlePickImage = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const file = await pickImage();
    if (!file) return;
    setIsUploading(true);
    try {
      const result = await uploadFile(file.uri, file.filename, file.mimeType);
      setAvatarUrl(result.url);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Upload failed:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleTakePhoto = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const file = await takePhoto();
    if (!file) return;
    setIsUploading(true);
    try {
      const result = await uploadFile(file.uri, file.filename, file.mimeType);
      setAvatarUrl(result.url);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Upload failed:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const toggleInList = useCallback(
    (id: string, list: string[], setList: (list: string[]) => void) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (list.includes(id)) {
        setList(list.filter((item) => item !== id));
      } else {
        setList([...list, id]);
      }
    },
    []
  );

  const togglePriority = useCallback(
    (id: Priority) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (priorities.includes(id)) {
        setPriorities(priorities.filter((p) => p !== id));
      } else if (priorities.length < 2) {
        setPriorities([...priorities, id]);
      } else {
        setPriorities([priorities[1], id]);
      }
    },
    [priorities]
  );

  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 0:
        return name.trim().length > 0 && !!household;
      case 1:
        return true;
      case 2:
        return true;
      case 3:
        return !!weeknightMinutes;
      case 4:
        return priorities.length >= 1;
      default:
        return false;
    }
  }, [
    currentStep,
    name,
    household,
    weeknightMinutes,
    priorities,
  ]);

  const handleNext = useCallback(() => {
    if (!canProceed()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (currentStep < TOTAL_STEPS - 1) {
      transitionDirection.current = 'forward';
      setCurrentStep((p) => p + 1);
    }
  }, [currentStep, canProceed]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentStep > 0) {
      transitionDirection.current = 'backward';
      setCurrentStep((p) => p - 1);
    }
  }, [currentStep]);

  // Intercept Android hardware back button so it walks the user back through
  // onboarding steps instead of popping the whole screen off the navigation
  // stack (which would drop returning users — redirected here via
  // needsProfileSetup — back onto the meal plan tab). On step 0 we also
  // swallow the press so the user can't accidentally exit mid-flow; the
  // dedicated Close button on the Welcome screen still uses router.back().
  useEffect(() => {
    if (showWelcome) return; // Welcome screen handles its own close button.
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (currentStep > 0) {
        handleBack();
      }
      // Always return true while we're inside the step flow — never let the
      // system pop the onboarding screen. State is persisted in preferences.
      return true;
    });
    return () => sub.remove();
  }, [currentStep, showWelcome, handleBack]);

  // Step 5 celebration — cream-on-charcoal pulse for 400ms on the CTA.
  const celebrate = useSharedValue(0);
  const celebrateStyle = useAnimatedStyle(() => ({
    backgroundColor:
      celebrate.value > 0
        ? `rgba(24,22,18,${celebrate.value})`
        : designTokens.colors.brand,
  }));

  const handleComplete = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    celebrate.value = withSequence(
      withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 240, easing: Easing.in(Easing.cubic) })
    );
    setIsSaving(true);

    try {
      // Best-effort server-side profile update — only when an anonymous (or
      // real) session exists. If anonymous sign-in failed at launch the user
      // still gets through onboarding; preferences are saved locally below.
      if (currentUser?.id) {
        try {
          await updateProfile(currentUser.id, {
            name: name.trim(),
            avatarUrl: avatarUrl,
            profileCompleted: true,
          });
        } catch (profileError) {
          // Non-fatal — local prefs are the source of truth during onboarding.
          console.warn('Profile update failed (non-fatal):', profileError);
        }
      } else {
        console.warn('[Onboarding] No currentUser — skipping server profile update, saving locally.');
      }

      const weeklyBudgetNum = weeklyBudget.trim().length > 0 ? Number(weeklyBudget) : null;
      const monthlyBudgetNum = monthlyBudget.trim().length > 0 ? Number(monthlyBudget) : null;

      setPreferences({
        dietaryRestrictions,
        allergies,
        cuisinePreferences,
        cookingSkillLevel,
        mealPrepTime: mealPrepTimeFromMinutes(weeknightMinutes),
        servingSize: servingSizeFromHousehold(household),
        household,
        cookingDaysPerWeek,
        weeknightMinutes,
        equipment,
        adventureLevel,
        mealHabits,
        priorities,
        weeklyBudget: Number.isFinite(weeklyBudgetNum) ? weeklyBudgetNum : null,
        monthlyBudget: Number.isFinite(monthlyBudgetNum) ? monthlyBudgetNum : null,
        pantryStaples,
        goals,
        hasCompletedOnboarding: true,
        onboardingStep: TOTAL_STEPS,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Log onboarding complete event to Meta SDK
      logMetaEvent('SubmitApplication', { step: 'onboarding_complete' });

      // Peak-end reveal: show a brief "profile ready" finale that echoes the
      // user's picks, then hand off to the Plan-Your-Meal screen. The value-
      // first handoff is unchanged — `goToPlan` runs `router.replace`
      // ('/plan-meals?from=onboarding') once, via the finale's timer or CTA.
      // The paywall still fires later from `handleGenerate` in plan-meals.
      setShowFinale(true);
    } catch (error) {
      console.error('Failed to save onboarding:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  }, [
    currentUser?.id,
    name,
    avatarUrl,
    household,
    dietaryRestrictions,
    allergies,
    cuisinePreferences,
    cookingSkillLevel,
    cookingDaysPerWeek,
    weeknightMinutes,
    equipment,
    adventureLevel,
    mealHabits,
    priorities,
    weeklyBudget,
    monthlyBudget,
    pantryStaples,
    goals,
    updateProfile,
    setPreferences,
    router,
    celebrate,
  ]);

  // ── PROGRESS BAR ──────────────────────────────────────────────────────────
  const progressFillWidth = useSharedValue(((currentStep + 1) / TOTAL_STEPS) * 100);
  useEffect(() => {
    progressFillWidth.value = withTiming(((currentStep + 1) / TOTAL_STEPS) * 100, {
      duration: 350,
      easing: Easing.out(Easing.cubic),
    });
  }, [currentStep, progressFillWidth]);

  // Finale auto-advance — let the reveal breathe, then hand off. The user can
  // tap "See my plan" to skip ahead; either path runs goToPlan exactly once.
  useEffect(() => {
    if (!showFinale) return;
    const t = setTimeout(goToPlan, 2200);
    return () => clearTimeout(t);
  }, [showFinale, goToPlan]);

  // ── WELCOME CINEMATIC MOTION ──────────────────────────────────────────────
  // All shared values + animated styles live here (above the `showWelcome`
  // early return) so the rules of hooks hold. Transform/opacity only — every
  // value below stays on the UI thread.
  const insets = useSafeAreaInsets();
  const kenBurns = useSharedValue(0); // 0→1 slow drift, loops (reverse)
  const scrimOp = useSharedValue(0);
  const head1Op = useSharedValue(0);
  const head2Op = useSharedValue(0);
  const subOp = useSharedValue(0);
  const proofOp = useSharedValue(0);
  const ctaIn = useSharedValue(0);
  const ctaScale = useSharedValue(1);

  useEffect(() => {
    if (!showWelcome) return;
    const E = Easing.bezier(...easing.outStrong);
    // Continuous slow Ken-Burns drift on the hero.
    kenBurns.value = withRepeat(
      withTiming(1, { duration: 12000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    // Choreographed one-shot entrance.
    scrimOp.value = withTiming(1, { duration: 600, easing: E });
    head1Op.value = withDelay(120, withTiming(1, { duration: 520, easing: E }));
    head2Op.value = withDelay(220, withTiming(1, { duration: 520, easing: E }));
    subOp.value = withDelay(360, withTiming(1, { duration: 480, easing: E }));
    proofOp.value = withDelay(460, withTiming(1, { duration: 480, easing: E }));
    ctaIn.value = withDelay(560, withSpring(1, { damping: 15, stiffness: 130 }));
  }, [showWelcome, kenBurns, scrimOp, head1Op, head2Op, subOp, proofOp, ctaIn]);

  const heroKenStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(kenBurns.value, [0, 1], [1.08, 1.18]) },
      { translateX: interpolate(kenBurns.value, [0, 1], [0, -16]) },
      { translateY: interpolate(kenBurns.value, [0, 1], [0, -12]) },
    ],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimOp.value }));
  const head1Style = useAnimatedStyle(() => ({
    opacity: head1Op.value,
    transform: [{ translateY: interpolate(head1Op.value, [0, 1], [20, 0]) }],
  }));
  const head2Style = useAnimatedStyle(() => ({
    opacity: head2Op.value,
    transform: [{ translateY: interpolate(head2Op.value, [0, 1], [20, 0]) }],
  }));
  const subStyle = useAnimatedStyle(() => ({
    opacity: subOp.value,
    transform: [{ translateY: interpolate(subOp.value, [0, 1], [14, 0]) }],
  }));
  const proofStyle = useAnimatedStyle(() => ({ opacity: proofOp.value }));
  const ctaStyle = useAnimatedStyle(() => ({
    opacity: ctaIn.value,
    transform: [
      { translateY: interpolate(ctaIn.value, [0, 1], [28, 0]) },
      { scale: ctaScale.value },
    ],
  }));
  const progressFillStyle = useAnimatedStyle(() => ({
    width: `${progressFillWidth.value}%`,
  }));

  const renderProgress = () => (
    <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
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
          Step {currentStep + 1} of {TOTAL_STEPS}
        </Text>
        <Text
          style={{
            fontFamily: designTokens.font.regular,
            fontSize: 12,
            color: isDark ? '#bbb' : designTokens.colors.ink2,
          }}
        >
          {STEP_NAMES[currentStep] ?? ''}
        </Text>
      </View>
      <View
        style={{
          width: '100%',
          height: 4,
          borderRadius: 999,
          overflow: 'hidden',
          backgroundColor: isDark ? '#2a2a2a' : designTokens.colors.hair2,
        }}
      >
        <Animated.View
          style={[
            progressFillStyle,
            {
              height: '100%',
              borderRadius: 999,
              backgroundColor: designTokens.colors.brand,
            },
          ]}
        />
      </View>
    </View>
  );

  // ── WELCOME SCREEN ────────────────────────────────────────────────────────
  if (showWelcome) {
    const handleGetStarted = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setShowWelcome(false);
    };

    const handleSignIn = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/login');
    };

    return (
      <View style={{ flex: 1, backgroundColor: '#0E0D0A' }}>
        <StatusBar style="light" />
        {/* ── Layer 0: full-bleed cinematic hero (autoplay looping video) ── */}
        <Animated.View
          style={[
            { position: 'absolute', top: 0, left: 0, width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
            heroKenStyle,
          ]}
        >
          <Video
            source={WELCOME_HERO_VIDEO}
            style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, backgroundColor: '#0E0D0A' }}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isLooping
            isMuted
          />
        </Animated.View>

        {/* ── Layer 1: legibility scrim (bottom-up) + status-bar top scrim ── */}
        <Animated.View
          style={[{ ...StyleSheet.absoluteFillObject }, scrimStyle]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={['rgba(14,13,10,0.55)', 'rgba(14,13,10,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 0.28 }}
            style={StyleSheet.absoluteFillObject}
          />
          <LinearGradient
            colors={[
              'rgba(14,13,10,0)',
              'rgba(14,13,10,0.55)',
              'rgba(14,13,10,0.92)',
              '#0E0D0A',
            ]}
            locations={[0.32, 0.6, 0.82, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          {/* Faint terracotta brand glow, top-right */}
          <LinearGradient
            colors={['rgba(228,109,70,0.22)', 'transparent']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0.3, y: 0.6 }}
            style={{ position: 'absolute', top: 0, right: 0, width: 320, height: 320 }}
          />
        </Animated.View>

        {/* ── Layer 2: top bar — brand wordmark + quiet Sign in ── */}
        <View
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 20,
            right: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <BrandLogo size={26} color="#FFFFFF" />
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 16,
                color: '#FFFFFF',
                letterSpacing: -0.3,
              }}
            >
              PlannPlate
            </Text>
          </View>
          <Pressable onPress={handleSignIn} hitSlop={12}>
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 14,
                color: 'rgba(255,255,255,0.82)',
              }}
            >
              Sign in
            </Text>
          </Pressable>
        </View>

        {/* ── Layer 3: value prop + CTA, pinned to the bottom ── */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 24,
            paddingBottom: insets.bottom + 20,
          }}
        >
          {/* Eyebrow pill — frosted */}
          <Animated.View style={[{ alignSelf: 'flex-start', marginBottom: 16 }, subStyle]}>
            <BlurView
              intensity={28}
              tint="dark"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 999,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.18)',
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: designTokens.colors.olive,
                }}
              />
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 11,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  color: '#FFFFFF',
                }}
              >
                Free · No signup
              </Text>
            </BlurView>
          </Animated.View>

          {/* Headline — Geist medium + Instrument Serif italic accent */}
          <Animated.View style={head1Style}>
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 42,
                lineHeight: 46,
                letterSpacing: -1,
                color: '#FFFFFF',
              }}
            >
              Your first meal plan,
            </Text>
          </Animated.View>
          <Animated.View style={head2Style}>
            <Text
              style={{
                fontFamily: designTokens.font.serifItalic,
                fontStyle: 'italic',
                fontSize: 46,
                lineHeight: 52,
                letterSpacing: -0.5,
                color: '#FFFFFF',
              }}
            >
              on the house.
            </Text>
          </Animated.View>

          {/* Subcopy */}
          <Animated.Text
            style={[
              {
                fontFamily: designTokens.font.regular,
                fontSize: 15,
                lineHeight: 22,
                color: 'rgba(255,255,255,0.82)',
                marginTop: 14,
              },
              subStyle,
            ]}
          >
            Tell us what you like — a full week of personalized meals in under a
            minute. No account, no catch.
          </Animated.Text>

          {/* Capability proof — honest at launch (no fake user/rating counts) */}
          <Animated.View
            style={[
              { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
              proofStyle,
            ]}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(228,109,70,0.22)',
              }}
            >
              <Check size={12} color={designTokens.colors.olive} strokeWidth={3} />
            </View>
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 13,
                color: 'rgba(255,255,255,0.72)',
              }}
            >
              Personalized for 20+ diets & allergies
            </Text>
          </Animated.View>

          {/* CTA — bright cream pill over the dark scrim */}
          <Animated.View style={[{ marginTop: 24 }, ctaStyle]}>
            <Pressable
              onPress={() => {
                ctaScale.value = withSequence(
                  withSpring(0.97, { duration: 90 }),
                  withSpring(1)
                );
                handleGetStarted();
              }}
              style={{
                height: 58,
                borderRadius: 999,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 9,
                backgroundColor: designTokens.colors.cream,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.28,
                shadowRadius: 18,
                elevation: 8,
              }}
            >
              <ChefHat size={19} color={designTokens.colors.ink} strokeWidth={2} />
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 16,
                  color: designTokens.colors.ink,
                  letterSpacing: -0.2,
                }}
              >
                Make my meal plan
              </Text>
              <ArrowRight size={17} color={designTokens.colors.ink} strokeWidth={2} />
            </Pressable>
          </Animated.View>

          {/* Reassurance microcopy */}
          <Animated.Text
            style={[
              {
                fontFamily: designTokens.font.regular,
                fontSize: 12,
                color: 'rgba(255,255,255,0.55)',
                textAlign: 'center',
                marginTop: 12,
              },
              ctaStyle,
            ]}
          >
            Takes about 60 seconds
          </Animated.Text>
        </View>
      </View>
    );
  }

  // ── STEP 0: About you ─────────────────────────────────────────────────────
  const renderAboutStep = () => (
    <KeyboardAwareScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
      onScrollBeginDrag={() => Keyboard.dismiss()}
    >
      <StepHeader
        prefix="Nice to meet "
        italic="you"
        subtitle="Just a few details to personalize PlannPlate."
        isDark={isDark}
      />

      {/* Avatar */}
      <View style={{ alignItems: 'center', marginBottom: 28 }}>
        <View
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            borderWidth: 1,
            borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
            backgroundColor: isDark ? '#1f1f1f' : designTokens.colors.cream,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            marginBottom: 14,
          }}
        >
          {isUploading ? (
            <ActivityIndicator size="large" color={designTokens.colors.brand} />
          ) : avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={{ width: 120, height: 120 }} resizeMode="cover" />
          ) : (
            <User size={48} color={isDark ? '#666' : designTokens.colors.ink3} strokeWidth={1.5} />
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={handlePickImage}
            disabled={isUploading}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
              backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ImageIcon size={16} color={designTokens.colors.brand} strokeWidth={1.8} />
          </Pressable>
          <Pressable
            onPress={handleTakePhoto}
            disabled={isUploading}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
              backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Camera size={16} color={designTokens.colors.olive} strokeWidth={1.8} />
          </Pressable>
        </View>
      </View>

      {/* Name */}
      <View style={{ marginBottom: 22 }}>
        <SectionEyebrow label="Your name" isDark={isDark} />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
            backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
          }}
        >
          <User size={16} color={isDark ? '#666' : designTokens.colors.ink3} strokeWidth={1.8} />
          <TextInput
            style={{
              flex: 1,
              fontFamily: designTokens.font.regular,
              fontSize: 15,
              color: isDark ? '#fff' : designTokens.colors.ink,
              padding: 0,
            }}
            value={name}
            onChangeText={setName}
            placeholder="What should we call you?"
            placeholderTextColor={isDark ? '#666' : designTokens.colors.ink3}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
        </View>
      </View>

      {/* Household */}
      <View style={{ marginBottom: 8 }}>
        <SectionEyebrow label="Who are you cooking for?" isDark={isDark} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {HOUSEHOLD_OPTIONS.map((opt, idx) => (
            <OptionTile
              key={opt.id}
              emoji={opt.icon}
              label={opt.label}
              selected={household === opt.id}
              tone="sage"              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setHousehold(opt.id);
              }}
              isDark={isDark}
            />
          ))}
        </View>
      </View>
    </KeyboardAwareScrollView>
  );

  // ── STEP 1: Diet & allergies ──────────────────────────────────────────────
  const renderDietStep = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <IdentityRibbon firstName={firstName} avatarUrl={avatarUrl} isDark={isDark} />
      <StepHeader
        prefix="What's on your "
        italic="plate"
        suffix="?"
        subtitle={firstName
          ? `We'll only show recipes that fit you, ${firstName}.`
          : "We'll only show recipes that fit."}
        isDark={isDark}
      />

      <SectionEyebrow label="Dietary preferences" isDark={isDark} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 26 }}>
        {DIETARY_OPTIONS.map((opt, idx) => (
          <OptionTile
            key={opt.id}
            emoji={opt.icon}
            label={opt.label}
            selected={dietaryRestrictions.includes(opt.id)}
            tone="sage"            onPress={() => toggleInList(opt.id, dietaryRestrictions, setDietaryRestrictions)}
            isDark={isDark}
          />
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <AlertTriangle size={12} color={designTokens.colors.olive} strokeWidth={2} />
        <Text
          style={{
            fontFamily: designTokens.font.medium,
            fontSize: 11,
            letterSpacing: 0.55,
            textTransform: 'uppercase',
            color: isDark ? '#888' : designTokens.colors.ink3,
          }}
        >
          Allergies to avoid
        </Text>
      </View>
      <Text
        style={{
          fontFamily: designTokens.font.regular,
          fontSize: 12,
          color: isDark ? '#666' : designTokens.colors.ink3,
          marginBottom: 12,
        }}
      >
        Tap any you need to skip — we'll never include them.
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' }}>
        {ALLERGY_OPTIONS.map((opt) => (
          <Chip
            key={opt.id}
            selected={allergies.includes(opt.id)}
            label={opt.label}
            icon={opt.icon}
            tone="charcoal"
            onPress={() => toggleInList(opt.id, allergies, setAllergies)}
            isDark={isDark}
          />
        ))}
      </View>
    </ScrollView>
  );

  // ── STEP 2: Cuisine & style ───────────────────────────────────────────────
  const renderCuisineStyleStep = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <IdentityRibbon firstName={firstName} avatarUrl={avatarUrl} isDark={isDark} />
      <StepHeader
        prefix="Your "
        italic="cuisine"
        suffix=" style"
        subtitle={firstName
          ? `Pick a few favorites, ${firstName} — we'll mix it up.`
          : "Pick a few favorites — we'll mix it up."}
        isDark={isDark}
      />

      <SectionEyebrow label="Favorite cuisines" isDark={isDark} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 26 }}>
        {CUISINE_OPTIONS.map((opt, idx) => (
          <OptionTile
            key={opt.id}
            emoji={opt.icon}
            label={opt.label}
            selected={cuisinePreferences.includes(opt.id)}
            tone="slate"            onPress={() => toggleInList(opt.id, cuisinePreferences, setCuisinePreferences)}
            isDark={isDark}
          />
        ))}
      </View>

      <SectionEyebrow label="Cooking skill" isDark={isDark} />
      <View style={{ gap: 8, marginBottom: 6 }}>
        {SKILL_LEVELS.map((level) => {
          const selected = cookingSkillLevel === level.id;
          return (
            <Pressable
              key={level.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setCookingSkillLevel(level.id as 'beginner' | 'intermediate' | 'advanced');
              }}
              style={{
                padding: 14,
                borderRadius: 16,
                borderWidth: selected ? 1.5 : 1,
                borderColor: selected
                  ? designTokens.colors.brand
                  : isDark
                    ? '#2a2a2a'
                    : designTokens.colors.hair,
                backgroundColor: selected
                  ? isDark
                    ? 'rgba(84,100,69,0.18)'
                    : TONE_TINTS.sage.bg
                  : isDark
                    ? '#1f1f1f'
                    : '#FFFFFF',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
                  borderWidth: 1,
                  borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <OptionIcon emoji={level.icon} size={24} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 15,
                    color: isDark ? '#fff' : designTokens.colors.ink,
                  }}
                >
                  {level.label}
                </Text>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12.5,
                    color: isDark ? '#888' : designTokens.colors.ink2,
                    marginTop: 2,
                  }}
                >
                  {level.description}
                </Text>
              </View>
              {selected && (
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: designTokens.colors.brand,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={12} color={designTokens.colors.cream} strokeWidth={2.4} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      {household === 'solo' ? (
        <Text
          style={{
            fontFamily: designTokens.font.regular,
            fontSize: 12,
            color: isDark ? '#666' : designTokens.colors.ink3,
            marginTop: 10,
            marginBottom: 20,
          }}
        >
          Cooking solo — single-serving recipes welcome.
        </Text>
      ) : (
        <View style={{ height: 20 }} />
      )}

      <SectionEyebrow label="Adventure level" isDark={isDark} />
      <View
        style={{
          padding: 12,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
          backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontFamily: designTokens.font.regular, fontSize: 11, color: isDark ? '#888' : designTokens.colors.ink3 }}>
            Stick to familiar
          </Text>
          <Text style={{ fontFamily: designTokens.font.regular, fontSize: 11, color: isDark ? '#888' : designTokens.colors.ink3 }}>
            Surprise me
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[1, 2, 3, 4, 5].map((n) => {
            const selected = adventureLevel === n;
            return (
              <Pressable
                key={n}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setAdventureLevel(n);
                }}
                style={{
                  flex: 1,
                  height: 42,
                  borderRadius: 10,
                  borderWidth: selected ? 0 : 1,
                  borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                  backgroundColor: selected
                    ? designTokens.colors.brand
                    : isDark
                      ? '#1a1a1a'
                      : '#FFFFFF',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 14,
                    color: selected ? designTokens.colors.cream : isDark ? '#fff' : designTokens.colors.ink,
                  }}
                >
                  {n}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );

  // ── STEP 3: Time ──────────────────────────────────────────────────────────
  const renderTimeStep = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <IdentityRibbon firstName={firstName} avatarUrl={avatarUrl} isDark={isDark} />
      <StepHeader
        prefix="How much "
        italic="time"
        suffix="?"
        subtitle="We'll plan around your schedule."
        isDark={isDark}
      />

      <SectionEyebrow label="Weeknight time window" isDark={isDark} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {WEEKNIGHT_OPTIONS.map((opt, idx) => (
          <OptionTile
            key={opt.id}
            emoji={opt.icon}
            label={opt.label}
            selected={weeknightMinutes === opt.id}
            tone="tan"            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setWeeknightMinutes(opt.id);
            }}
            isDark={isDark}
          />
        ))}
      </View>
    </ScrollView>
  );

  // ── STEP 4: Kitchen & habits ──────────────────────────────────────────────
  const renderKitchenStep = () => {
    const renderHabitRow = (
      label: string,
      options: { id: any; label: string; icon: string }[],
      selected: string,
      onSelect: (id: any) => void
    ) => (
      <View style={{ marginBottom: 14 }}>
        <Text
          style={{
            fontFamily: designTokens.font.medium,
            fontSize: 11,
            letterSpacing: 0.55,
            textTransform: 'uppercase',
            color: isDark ? '#888' : designTokens.colors.ink3,
            marginBottom: 8,
          }}
        >
          {label}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {options.map((opt) => {
            const isSel = selected === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onSelect(opt.id);
                }}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  borderWidth: isSel ? 0 : 1,
                  borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                  backgroundColor: isSel
                    ? designTokens.colors.brand
                    : isDark
                      ? '#1f1f1f'
                      : '#FFFFFF',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Text style={{ fontSize: 16 }}>{opt.icon}</Text>
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 12,
                    color: isSel ? designTokens.colors.cream : isDark ? '#fff' : designTokens.colors.ink,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );

    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <IdentityRibbon firstName={firstName} avatarUrl={avatarUrl} isDark={isDark} />
        <StepHeader
          prefix="Your "
          italic="kitchen"
          subtitle="We'll only suggest what your kitchen can cook."
          isDark={isDark}
        />

        <SectionEyebrow label="What's in your kitchen?" isDark={isDark} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 26 }}>
          {EQUIPMENT_OPTIONS.map((opt, idx) => (
            <OptionTile
              key={opt.id}
              emoji={opt.icon}
              label={opt.label}
              selected={equipment.includes(opt.id)}
              tone="tan"              onPress={() => toggleInList(opt.id, equipment, setEquipment)}
              isDark={isDark}
            />
          ))}
        </View>

        <SectionEyebrow label="Meal habits" isDark={isDark} />
        {renderHabitRow('Breakfast', BREAKFAST_HABITS, mealHabits.breakfast, (id) =>
          setMealHabits((m) => ({ ...m, breakfast: id }))
        )}
        {renderHabitRow('Lunch', LUNCH_HABITS, mealHabits.lunch, (id) =>
          setMealHabits((m) => ({ ...m, lunch: id }))
        )}
        {renderHabitRow('Dinner', DINNER_HABITS, mealHabits.dinner, (id) =>
          setMealHabits((m) => ({ ...m, dinner: id }))
        )}
      </ScrollView>
    );
  };

  // ── STEP 5: Priorities, budget, pantry, goals ─────────────────────────────
  const renderPrioritiesStep = () => {
    const budgetPlaceholder = household === 'family_kids' ? '200' : '100';
    const monthlyPlaceholder = household === 'family_kids' ? '800' : '400';
    return (
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <IdentityRibbon firstName={firstName} avatarUrl={avatarUrl} isDark={isDark} />
        <StepHeader
          prefix="What matters "
          italic="most"
          suffix="?"
          subtitle="Pick up to 2 — we'll optimize for these."
          isDark={isDark}
        />

        <SectionEyebrow label={`Top priorities (${priorities.length}/2)`} isDark={isDark} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 26 }}>
          {PRIORITY_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const idx = priorities.indexOf(opt.id);
            const selected = idx >= 0;
            return (
              <Pressable
                key={opt.id}
                onPress={() => togglePriority(opt.id)}
                style={{
                  width: (SCREEN_WIDTH - 48 - 10) / 2,
                  padding: 14,
                  borderRadius: 16,
                  borderWidth: selected ? 1.5 : 1,
                  borderColor: selected
                    ? designTokens.colors.brand
                    : isDark
                      ? '#2a2a2a'
                      : designTokens.colors.hair,
                  backgroundColor: selected
                    ? isDark
                      ? 'rgba(84,100,69,0.18)'
                      : TONE_TINTS.sage.bg
                    : isDark
                      ? '#1f1f1f'
                      : '#FFFFFF',
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                      backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={18} color={designTokens.colors.brand} strokeWidth={1.8} />
                  </View>
                  {selected && (
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: designTokens.colors.brand,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 11,
                          color: designTokens.colors.cream,
                        }}
                      >
                        #{idx + 1}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 15,
                    color: isDark ? '#fff' : designTokens.colors.ink,
                  }}
                >
                  {opt.label}
                </Text>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12,
                    color: isDark ? '#888' : designTokens.colors.ink2,
                    marginTop: 2,
                  }}
                >
                  {opt.description}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <SectionEyebrow label="Budget (optional)" isDark={isDark} />
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 26 }}>
          {[
            { label: 'Weekly', value: weeklyBudget, setter: setWeeklyBudget, placeholder: budgetPlaceholder },
            { label: 'Monthly', value: monthlyBudget, setter: setMonthlyBudget, placeholder: monthlyPlaceholder },
          ].map((field) => (
            <View
              key={field.label}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 10.5,
                  letterSpacing: 0.55,
                  textTransform: 'uppercase',
                  color: isDark ? '#888' : designTokens.colors.ink3,
                  marginBottom: 6,
                }}
              >
                {field.label}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Wallet size={14} color={isDark ? '#666' : designTokens.colors.ink3} strokeWidth={1.8} />
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 15,
                    color: isDark ? '#fff' : designTokens.colors.ink,
                  }}
                >
                  $
                </Text>
                <TextInput
                  value={field.value}
                  onChangeText={(t) => field.setter(t.replace(/[^0-9]/g, ''))}
                  placeholder={field.placeholder}
                  placeholderTextColor={isDark ? '#666' : designTokens.colors.ink3}
                  keyboardType="numeric"
                  style={{
                    flex: 1,
                    fontFamily: designTokens.font.regular,
                    fontSize: 15,
                    color: isDark ? '#fff' : designTokens.colors.ink,
                    padding: 0,
                  }}
                />
              </View>
            </View>
          ))}
        </View>

      </KeyboardAwareScrollView>
    );
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0:
        return renderAboutStep();
      case 1:
        return renderDietStep();
      case 2:
        return renderCuisineStyleStep();
      case 3:
        return renderTimeStep();
      case 4:
        return renderPrioritiesStep();
      default:
        return null;
    }
  };

  // ── FINALE: profile-ready peak-end reveal ─────────────────────────────────
  const renderFinale = () => {
    const timeOpt = WEEKNIGHT_OPTIONS.find((o) => o.id === weeknightMinutes);
    const echo: { icon: string; label: string }[] = [
      ...cuisinePreferences
        .slice(0, 2)
        .map((c) => ({ icon: CUISINE_OPTIONS.find((o) => o.id === c)?.icon ?? '🍽️', label: c })),
      ...dietaryRestrictions
        .slice(0, 1)
        .map((d) => ({ icon: DIETARY_OPTIONS.find((o) => o.id === d)?.icon ?? '🥗', label: d })),
      ...(timeOpt ? [{ icon: timeOpt.icon, label: timeOpt.label }] : []),
    ];

    return (
      <View style={{ flex: 1, backgroundColor: isDark ? '#161512' : designTokens.colors.cream }}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        {/* Warm terracotta glow, top-right — bookends the welcome hero */}
        <LinearGradient
          colors={['rgba(228,109,70,0.16)', 'transparent']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.25, y: 0.55 }}
          style={{ position: 'absolute', top: 0, right: 0, width: 340, height: 340 }}
          pointerEvents="none"
        />
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'center' }}>
            {/* Emblem */}
            <Animated.View entering={FadeIn.duration(420)} style={{ marginBottom: 26 }}>
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: designTokens.colors.brand,
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...elevation.thumb,
                }}
              >
                <Check size={28} color={designTokens.colors.cream} strokeWidth={2.4} />
              </View>
            </Animated.View>

            {/* Eyebrow */}
            <Animated.Text
              entering={FadeInDown.delay(80).duration(460)}
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 11,
                letterSpacing: 1.1,
                textTransform: 'uppercase',
                color: designTokens.colors.brand,
                marginBottom: 10,
              }}
            >
              Your taste profile
            </Animated.Text>

            {/* Headline */}
            <Animated.View entering={FadeInDown.delay(160).duration(480)}>
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 34,
                  lineHeight: 40,
                  letterSpacing: -0.7,
                  color: isDark ? '#fff' : designTokens.colors.ink,
                }}
              >
                {firstName ? `Ready, ` : 'All set —'}
                <Text
                  style={{
                    fontFamily: designTokens.font.serifItalic,
                    fontStyle: 'italic',
                    fontSize: 38,
                    letterSpacing: -0.4,
                  }}
                >
                  {firstName ? `${firstName}.` : ' your taste is set.'}
                </Text>
              </Text>
            </Animated.View>

            {/* Honest subcopy */}
            <Animated.Text
              entering={FadeInDown.delay(240).duration(480)}
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 15,
                lineHeight: 22,
                color: isDark ? '#9b988f' : designTokens.colors.ink2,
                marginTop: 12,
              }}
            >
              Next, we'll build your week around what you love.
            </Animated.Text>

            {/* Echo chips — reflects their actual picks (endowment) */}
            {echo.length > 0 && (
              <Animated.View
                entering={FadeInDown.delay(320).duration(480)}
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 22 }}
              >
                {echo.map((e, i) => (
                  <View
                    key={`${e.label}-${i}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                      backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                    }}
                  >
                    <OptionIcon emoji={e.icon} size={16} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 13,
                        color: isDark ? '#fff' : designTokens.colors.ink,
                      }}
                    >
                      {e.label}
                    </Text>
                  </View>
                ))}
              </Animated.View>
            )}
          </View>

          {/* CTA — skip the wait */}
          <Animated.View
            entering={FadeInDown.delay(420).duration(480)}
            style={{ paddingHorizontal: 28, paddingBottom: 20 }}
          >
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                goToPlan();
              }}
              style={{
                height: 56,
                borderRadius: 999,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: designTokens.colors.brand,
                ...elevation.thumb,
              }}
            >
              <ChefHat size={18} color={designTokens.colors.cream} strokeWidth={2} />
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 16,
                  color: designTokens.colors.cream,
                  letterSpacing: -0.2,
                }}
              >
                {firstName ? `Plan ${firstName}'s week` : 'See my plan'}
              </Text>
              <ArrowRight size={17} color={designTokens.colors.cream} strokeWidth={2} />
            </Pressable>
          </Animated.View>
        </SafeAreaView>
      </View>
    );
  };

  if (showFinale) {
    return renderFinale();
  }

  const isFinalStep = currentStep === TOTAL_STEPS - 1;
  const ctaLabel = isFinalStep
    ? firstName
      ? `Plan ${firstName}'s meals`
      : 'Plan my meals'
    : 'Continue';

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF' }}>
      <LinearGradient
        colors={['rgba(228,109,70,0.06)', 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0.3, y: 0.6 }}
        style={{ position: 'absolute', top: 0, right: 0, width: 320, height: 320 }}
        pointerEvents="none"
      />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        {renderProgress()}

        <Animated.View key={currentStep} entering={FadeIn.duration(220)} style={{ flex: 1 }}>
          {renderCurrentStep()}
        </Animated.View>

        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: 12,
            paddingBottom: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            borderTopWidth: 1,
            borderTopColor: isDark ? '#2a2a2a' : designTokens.colors.hair2,
          }}
        >
          {currentStep > 0 && (
            <Pressable
              onPress={handleBack}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
              }}
              hitSlop={8}
            >
              <ArrowLeft size={18} color={isDark ? '#fff' : designTokens.colors.ink} strokeWidth={1.8} />
            </Pressable>
          )}

          <Animated.View style={[{ flex: 1, borderRadius: 999, overflow: 'hidden' }, isFinalStep ? celebrateStyle : null]}>
            <Pressable
              onPress={isFinalStep ? handleComplete : handleNext}
              disabled={!canProceed() || isSaving}
              style={{
                height: 56,
                borderRadius: 999,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor:
                  canProceed() && !isSaving
                    ? isFinalStep
                      ? 'transparent'
                      : designTokens.colors.brand
                    : isDark
                      ? '#2a2a2a'
                      : designTokens.colors.hair2,
              }}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={designTokens.colors.cream} />
              ) : (
                <>
                  {isFinalStep && (
                    <ChefHat
                      size={18}
                      color={canProceed() ? designTokens.colors.cream : isDark ? '#666' : designTokens.colors.ink3}
                      strokeWidth={1.8}
                    />
                  )}
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 15,
                      color: canProceed()
                        ? designTokens.colors.cream
                        : isDark
                          ? '#666'
                          : designTokens.colors.ink3,
                    }}
                  >
                    {ctaLabel}
                  </Text>
                  {!isFinalStep && (
                    <ArrowRight
                      size={16}
                      color={canProceed() ? designTokens.colors.cream : isDark ? '#666' : designTokens.colors.ink3}
                      strokeWidth={1.8}
                    />
                  )}
                </>
              )}
            </Pressable>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}
