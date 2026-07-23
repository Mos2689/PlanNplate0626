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
  Linking,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { Video, ResizeMode, Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
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
  Mic,
  Keyboard as KeyboardIcon,
  X,
  Pencil,
  Plus,
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
import { designTokens, easing, elevation, serifItalicFontStyle } from '@/lib/design-tokens';
import { deviceCurrencySymbol } from '@/lib/currency';
import { getOptionIcon } from '@/lib/onboarding-icons';
import { BrandLogo } from '@/components/BrandLogo';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/lib/useColorScheme';
import { useAuthStore } from '@/lib/auth-store';
import { useSubscriptionStore, useUserName } from '@/lib/subscription-store';
import { logMetaEvent } from '@/lib/meta-sdk';
import { track } from '@/lib/analytics';
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
import { getTasteSampleRecipes } from '@/lib/inspired-plan-source';
import { profileAndSuggest } from '@/lib/frequent-cook-profiling';
import { inspiredToRecipe } from '@/lib/inspired-adapters';
import { apiFormCall } from '@/lib/api-router';
import { parseDishNamesFromTranscript } from '@/lib/voice-dishes';
import { generateRecipe, generateRecipeImage } from '@/lib/openai';
import type { Recipe } from '@/lib/store';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ───────────────────────────────────────────────────────────────────────────────
// OPTIONS (unchanged from previous version — verbatim)
// ───────────────────────────────────────────────────────────────────────────────

const DIETARY_OPTIONS = [
  { id: 'None', label: 'None', icon: '🍽️' },
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
  { id: 'Any', label: 'Any', icon: '🌍' },
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

const TOTAL_STEPS = 2;
const STEP_NAMES = ['Your cooking', 'For you'];
const MAX_FREQUENT_COOKS = 5;

// Whisper hallucinates stock phrases ("thank you for watching", "please
// subscribe", music notes, …) on silence/noise — treat those, and anything too
// short, as "not heard" rather than capturing them as a dish.
const NOISE_PATTERNS: RegExp[] = [
  /\bthank you\b/i,
  /\bthanks for\b/i,
  /\bfor watching\b/i,
  /\bsubscribe\b/i,
  /\bsee you (next|again|soon)\b/i,
  /[♪♫]/,
];
function looksLikeNoise(s: string): boolean {
  const t = (s || '').trim();
  if (t.replace(/[^a-z0-9]/gi, '').length < 3) return true; // empty / too short
  return NOISE_PATTERNS.some((re) => re.test(t));
}
// A spoken or typed answer may name several dishes ("Butter Chicken, Vindaloo,
// Aloo Gobi") — split on commas / semicolons / newlines into separate dishes.
// NOTE: we deliberately do NOT split on " and " (breaks "Fish and Chips",
// "Mac and Cheese", …).
function splitDishNames(raw: string): string[] {
  return (raw || '')
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !looksLikeNoise(s));
}

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
            fontStyle: serifItalicFontStyle,
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
  const isAnonymous = useAuthStore((s) => s.isAnonymous);
  const logout = useAuthStore((s) => s.logout);
  const updateProfile = useSubscriptionStore((s) => s.updateProfile);
  const preferences = useMealPlanStore((s) => s.preferences);
  const setPreferences = useMealPlanStore((s) => s.setPreferences);

  // Resume from saved step if user previously bailed mid-flow
  const [currentStep, setCurrentStep] = useState<number>(
    preferences.onboardingStep && preferences.onboardingStep < TOTAL_STEPS
      ? preferences.onboardingStep
      : 0
  );

  // Welcome screen — the "free · no signup" hero was the ANONYMOUS entry point.
  // Under the AUTH-FIRST flow users sign up before reaching onboarding, so we
  // skip it for signed-in accounts and go straight to the persona steps. (Kept
  // for any lingering anonymous session, where its messaging still applies.)
  const [showWelcome, setShowWelcome] = useState<boolean>(
    (preferences.onboardingStep ?? 0) === 0 && !preferences.hasCompletedOnboarding && isAnonymous
  );

  // Step 0 — About you
  // AUTH-LAST: onboarding is the FIRST-TIME flow (returning accounts are routed
  // straight past it). Under AUTH-FIRST the user has just created an account,
  // so we seed the name from their account (the name entered at signup) as a
  // one-time prefill — see the effect below. They can still edit it here.
  const [name, setName] = useState('');
  const accountName = useUserName();
  const nameSeededRef = useRef(false);
  useEffect(() => {
    if (nameSeededRef.current) return;
    const seed = accountName || (currentUser?.name && currentUser.name !== 'User' ? currentUser.name : '');
    if (seed) {
      // Only prefill when the field is still empty — never clobber typing.
      setName((prev) => (prev.trim().length === 0 ? seed : prev));
      nameSeededRef.current = true;
    }
  }, [accountName, currentUser?.name]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [household, setHousehold] = useState<Household>(preferences.household ?? 'couple');

  // Step 1 — Diet & allergies
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>(
    preferences.dietaryRestrictions ?? []
  );
  const [allergies, setAllergies] = useState<string[]>(preferences.allergies ?? []);
  // Explicit consent to process dietary/allergy info (sensitive/health data).
  // Records the moment consent was given; required only once the user actually
  // selects a dietary restriction or allergy.
  const [dietaryConsentAt, setDietaryConsentAt] = useState<string | null>(
    preferences.dietaryDataConsentAt ?? null
  );
  const dietaryConsent = !!dietaryConsentAt;
  const sensitiveDataSelected = dietaryRestrictions.length > 0 || allergies.length > 0;

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

  // ── Step 1 — Frequent cooks: dishes the user names (Speak or Type). ──
  const addRecipe = useMealPlanStore((s) => s.addRecipe);
  const [frequentCooks, setFrequentCooks] = useState<string[]>([]);
  const [typeDraft, setTypeDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const addFrequentCook = useCallback((raw: string) => {
    const parts = splitDishNames(raw); // one input may name several dishes
    if (parts.length === 0) return;
    setVoiceError(null);
    setFrequentCooks((prev) => {
      const next = [...prev];
      for (const dish of parts) {
        if (next.length >= MAX_FREQUENT_COOKS) break;
        if (next.some((p) => p.toLowerCase() === dish.toLowerCase())) continue;
        next.push(dish);
      }
      return next;
    });
  }, []);
  const removeFrequentCook = useCallback((dish: string) => {
    setFrequentCooks((prev) => prev.filter((p) => p !== dish));
  }, []);

  // Inline edit of a captured dish name.
  const [editingDish, setEditingDish] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const startEditDish = useCallback((dish: string) => {
    setEditingDish(dish);
    setEditDraft(dish);
  }, []);
  const commitEditDish = useCallback(
    (original: string) => {
      const name = editDraft.trim();
      setEditingDish(null);
      setFrequentCooks((prev) => {
        const idx = prev.findIndex((p) => p === original);
        if (idx < 0) return prev;
        if (!name) return prev.filter((_, i) => i !== idx); // emptied → remove
        // Renamed onto an existing dish → drop the duplicate.
        if (prev.some((p, i) => i !== idx && p.toLowerCase() === name.toLowerCase())) {
          return prev.filter((_, i) => i !== idx);
        }
        return prev.map((p, i) => (i === idx ? name : p));
      });
    },
    [editDraft]
  );

  // Voice → text: record, transcribe via Whisper edge fn, add as a dish chip.
  const transcribeToChip = useCallback(
    async (uri: string) => {
      setIsTranscribing(true);
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists) throw new Error('Audio file not found');
        const form = new FormData();
        form.append('file', { uri, type: 'audio/m4a', name: 'recording.m4a' } as any);
        form.append('model', 'whisper-1');
        const result = await apiFormCall<{ text: string }>('openai-transcribe', form);
        if (result.error) throw new Error(result.error);
        const text = (result.data?.text ?? '').trim();
        // Empty, too short, or a Whisper silence-hallucination → "not heard".
        if (splitDishNames(text).length === 0) {
          setVoiceError("Didn't quite get that. Try again.");
          return;
        }
        // Whisper transcribes spoken lists without commas ("Butter Chicken
        // Shakshuka Bhindi Masala"), which naive splitting captures as one
        // dish. Ask the model to split it into distinct dishes; fall back to
        // the raw transcript if that fails or finds nothing.
        let names: string[] = [];
        try {
          names = await parseDishNamesFromTranscript(text);
        } catch (parseErr) {
          console.warn('[Onboarding] dish split failed, using raw transcript', parseErr);
        }
        addFrequentCook(names.length > 0 ? names.join(', ') : text);
      } catch (e) {
        console.error('[Onboarding] transcription failed', e);
        setVoiceError('Could not transcribe. Please type instead.');
      } finally {
        setIsTranscribing(false);
      }
    },
    [addFrequentCook]
  );
  const startVoice = useCallback(async () => {
    try {
      setVoiceError(null);
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setVoiceError('Microphone permission is required');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (e) {
      console.error('[Onboarding] startVoice failed', e);
      setVoiceError('Failed to start recording');
      setIsRecording(false);
    }
  }, []);
  const stopVoice = useCallback(async () => {
    setIsRecording(false);
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (!recording) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (uri) await transcribeToChip(uri);
    } catch (e) {
      console.error('[Onboarding] stopVoice failed', e);
      setVoiceError('Could not process recording.');
    }
  }, [transcribeToChip]);

  // Fire-and-forget after onboarding: build each named dish into a full,
  // saved library recipe (editable later) with a matching photo. Never blocks
  // the flow — failures are logged and skipped.
  const buildFrequentCookRecipes = useCallback(
    (names: string[], prefs: typeof preferences) => {
      names.forEach(async (dishName) => {
        try {
          const data = await generateRecipe({
            mealTypes: ['dinner'],
            preferences: prefs,
            customCookingInstructions: `The user cooks this dish often and wants it saved in their library. Create the classic, well-known version of "${dishName}". Keep the recipe name as "${dishName}".`,
          });
          let imageUrl = '';
          try {
            imageUrl = await generateRecipeImage(
              data.name || dishName,
              data.description || `A delicious ${dishName}`,
              data.ingredients.map((i) => ({ name: i.name, category: i.category }))
            );
          } catch {
            /* image optional */
          }
          const recipe: Recipe = {
            id: '',
            name: data.name || dishName,
            description: data.description || `A delicious ${dishName}`,
            imageUrl,
            cookTime: data.cookTime,
            prepTime: data.prepTime,
            servings: data.servings,
            ingredients: data.ingredients.map((ing, i) => ({ id: `fc-${i}`, ...ing })),
            instructions: data.instructions,
            tags: [...(data.tags || []), ...(data.mealType ? [data.mealType] : []), 'frequent-cook'],
            calories: data.calories,
            isAIGenerated: true,
            isSaved: true,
            createdAt: new Date().toISOString(),
          };
          addRecipe(recipe);
        } catch (e) {
          console.warn('[Onboarding] failed to build frequent cook:', dishName, e);
        }
      });
    },
    [addRecipe]
  );

  // ── Step 2 — "You may also like": Inspired suggestions profiled from the
  // dishes named in step 1 (cuisine / ingredient / dish-type themes). Falls
  // back to a generic popular mix when nothing recognisable was typed.
  const [tasteRecipeIds, setTasteRecipeIds] = useState<string[]>(
    preferences.tasteRecipeIds ?? []
  );
  const tasteRecipes = useMemo(
    () =>
      frequentCooks.length > 0
        ? profileAndSuggest(frequentCooks, 12)
        : getTasteSampleRecipes({ limit: 12 }),
    [frequentCooks]
  );
  // Materialise the step-2 picks as real library rows on completion. They're
  // Get-Inspired entries, so we mint them exactly the way the Explore tab does
  // (`inspiredToRecipe` + `curatedSourceId: inspired::<id>`) — that shared key
  // is what keeps a later save from Explore from duplicating them.
  const saveTasteRecipesToLibrary = useCallback(() => {
    if (tasteRecipeIds.length === 0) return;
    const existing = new Set(
      useMealPlanStore
        .getState()
        .recipes.map((r) => r.curatedSourceId)
        .filter(Boolean) as string[],
    );
    let added = 0;
    for (const id of tasteRecipeIds) {
      const source = tasteRecipes.find((r) => r.id === id);
      if (!source || existing.has(`inspired::${id}`)) continue;
      // isSaved=false — these are library rows, not hearted favourites; the
      // user still chooses what to favourite.
      addRecipe(inspiredToRecipe(source, false));
      existing.add(`inspired::${id}`);
      added++;
    }
    if (added > 0) {
      console.log(`[Onboarding] Added ${added} taste pick(s) to the recipe library`);
    }
  }, [tasteRecipeIds, tasteRecipes, addRecipe]);

  const toggleTaste = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTasteRecipeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const smartPantry = useMemo(
    () => buildSmartPantryList(cuisinePreferences),
    [cuisinePreferences]
  );
  const [pantryStaples, setPantryStaples] = useState<string[]>(
    preferences.pantryStaples ?? COMMON_PANTRY
  );

  const [isSaving, setIsSaving] = useState(false);

  // Handoff into the app once onboarding is saved. Lands on the Recipes tab
  // (the app's home) rather than pushing the user straight into plan-meals;
  // they start a plan from there when ready. Guarded so it runs exactly once.
  const navigatedRef = useRef(false);
  const goToPlan = useCallback(() => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    router.replace('/(tabs)/recipes');
  }, [router]);

  // Tracks step-change direction (forward/backward). Retained for potential
  // direction-aware behaviour.
  const transitionDirection = useRef<'forward' | 'backward'>('forward');

  // Derived personalization signal — first name for ribbon, subtitles, final CTA.
  const firstName = useMemo(() => name.trim().split(/\s+/)[0] ?? '', [name]);

  // Persist current step on each change so the user can resume after exit.
  useEffect(() => {
    setPreferences({ onboardingStep: currentStep });
    track('onboarding_step_viewed', { step: STEP_NAMES[currentStep] || `Step ${currentStep}` });
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
        // Step 1 — at least one dish named so we have something to profile.
        return frequentCooks.length > 0;
      case 1:
        return true; // step 2 suggestions are optional — never block completion
      default:
        return false;
    }
  }, [currentStep, frequentCooks.length]);

  const handleNext = useCallback(() => {
    if (!canProceed()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (currentStep < TOTAL_STEPS - 1) {
      transitionDirection.current = 'forward';
      setCurrentStep((p) => p + 1);
    }
  }, [currentStep, canProceed]);

  const handleBack = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentStep > 0) {
      transitionDirection.current = 'backward';
      setCurrentStep((p) => p - 1);
      return;
    }
    // Step 0 → back to the signup / sign-in screen. Sign out first so the
    // just-created account doesn't get immediately bounced back into the app,
    // letting the user pick a different account or sign in instead.
    await logout();
    router.replace('/signup');
  }, [currentStep, logout, router]);

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
        tasteRecipeIds,
        // Record consent only when sensitive data is actually being saved.
        dietaryDataConsentAt: sensitiveDataSelected ? (dietaryConsentAt ?? undefined) : undefined,
        hasCompletedOnboarding: true,
        onboardingStep: TOTAL_STEPS,
      });

      // Build the dishes the user named into full, saved library recipes in the
      // background (non-blocking) — they appear in Recipes shortly, editable.
      if (frequentCooks.length > 0) {
        buildFrequentCookRecipes(frequentCooks, preferences);
      }

      // Step 2 taste picks land in the user's library so the Recipes tab isn't
      // empty on first open (and they show under "Recently Added", since
      // addRecipe stamps createdAt = now). Deduped by curatedSourceId, the same
      // key Get Inspired uses, so re-saving one there won't create a twin.
      saveTasteRecipesToLibrary();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Log onboarding complete event to Meta SDK
      logMetaEvent('SubmitApplication', { step: 'onboarding_complete' });
      // Log to PostHog
      track('onboarding_completed', {
        dietaryRestrictions,
        allergies,
        cuisinePreferences,
        cookingSkillLevel,
        household,
        cookingDaysPerWeek,
        weeknightMinutes,
        equipment,
        mealHabits,
        priorities,
        goals,
      });

      // Straight into the app — the user lands on their recipe library (already
      // stocked with their step-2 picks) and starts a plan from there when
      // ready. The paywall still fires later, from plan-meals.
      goToPlan();
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
    tasteRecipeIds,
    frequentCooks,
    buildFrequentCookRecipes,
    preferences,
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
      // `reauth=1` tells the login screen + root guard NOT to auto-bounce to the
      // tabs — the user deliberately wants the sign-in form (e.g. an anonymous
      // guest signing into a real account, or switching accounts).
      router.push('/login?reauth=1');
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
                fontStyle: serifItalicFontStyle,
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
            Tell us what you like. A full week of personalised meals in under a
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
              Personalised for 20+ diets & allergies
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
        subtitle="Just a few details to personalise PlanNplate."
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
        {DIETARY_OPTIONS.map((opt) => (
          <OptionTile
            key={opt.id}
            emoji={opt.icon}
            label={opt.label}
            // "No preference" is selected when nothing is chosen; picking it
            // clears any diets, and picking a diet clears "No preference".
            selected={opt.id === 'None' ? dietaryRestrictions.length === 0 : dietaryRestrictions.includes(opt.id)}
            tone="sage"
            onPress={() =>
              opt.id === 'None'
                ? setDietaryRestrictions([])
                : toggleInList(opt.id, dietaryRestrictions, setDietaryRestrictions)
            }
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
        Tap any you're allergic to. You'll be flagged if a recipe contains the allergen.
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

      {/* Sensitive-data consent — shown once the user selects a diet/allergy.
          Required to continue (see canProceed case 1). */}
      {sensitiveDataSelected && (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setDietaryConsentAt((prev) => (prev ? null : new Date().toISOString()));
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 10,
            marginTop: 24,
            padding: 14,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: dietaryConsent
              ? designTokens.colors.olive
              : isDark ? '#2a2a2a' : designTokens.colors.hair,
            backgroundColor: isDark ? '#1f1f1f' : '#FAF7F0',
          }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              marginTop: 1,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: dietaryConsent ? 0 : 1.5,
              borderColor: isDark ? '#444' : designTokens.colors.ink3,
              backgroundColor: dietaryConsent ? designTokens.colors.olive : 'transparent',
            }}
          >
            {dietaryConsent && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
          </View>
          <Text
            style={{
              flex: 1,
              fontFamily: designTokens.font.regular,
              fontSize: 12.5,
              lineHeight: 18,
              color: isDark ? '#aaa' : designTokens.colors.ink2,
            }}
          >
            I consent to PlanNplate using my dietary and allergy information to personalise my
            recipes and warn me about allergens. See our{' '}
            <Text
              onPress={() => Linking.openURL('https://www.plannplate.com.au/privacy-policy').catch(() => {})}
              style={{ color: designTokens.colors.olive, fontFamily: designTokens.font.medium }}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </Pressable>
      )}
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
          ? `Pick a few favorites, ${firstName}. We'll mix it up.`
          : "Pick a few favorites. We'll mix it up."}
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
            tone="slate"            onPress={() => {
              if (opt.id === 'Any') {
                // "Any" is exclusive — selecting it clears specific cuisines.
                setCuisinePreferences(cuisinePreferences.includes('Any') ? [] : ['Any']);
              } else {
                // Selecting a specific cuisine drops "Any".
                const withoutAny = cuisinePreferences.filter((c) => c !== 'Any');
                toggleInList(opt.id, withoutAny, setCuisinePreferences);
              }
            }}
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
          Cooking solo. Single-serving recipes welcome.
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
  const renderTimeStep = () => {
    const budgetPlaceholder = household === 'family_kids' ? '200' : '100';
    const monthlyPlaceholder = household === 'family_kids' ? '800' : '400';
    const currencySymbol = deviceCurrencySymbol();
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
          prefix="How much "
          italic="time"
          suffix="?"
          subtitle="We'll plan around your schedule."
          isDark={isDark}
        />

        <SectionEyebrow label="Weeknight time window" isDark={isDark} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 26 }}>
          {WEEKNIGHT_OPTIONS.map((opt, idx) => (
            <OptionTile
              key={opt.id}
              emoji={opt.icon}
              label={opt.label}
              selected={weeknightMinutes === opt.id}
              tone="tan"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setWeeknightMinutes(opt.id);
              }}
              isDark={isDark}
            />
          ))}
        </View>

        <SectionEyebrow label="Budget (optional)" isDark={isDark} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
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
                  {currencySymbol}
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
  // ── STEP 1: Frequent cooks — Speak it / Type it cards (Add-Recipe style) ───
  const renderFrequentCooksStep = () => {
    const atMax = frequentCooks.length >= MAX_FREQUENT_COOKS;
    const cardBg = isDark ? '#1f1f1f' : '#FFFFFF';
    const cardHair = isDark ? '#2a2a2a' : designTokens.colors.hair;
    const inkC = isDark ? '#fff' : designTokens.colors.ink;
    const ink2C = isDark ? '#888' : designTokens.colors.ink2;
    const ink3C = isDark ? '#666' : designTokens.colors.ink3;
    const commitType = () => {
      if (atMax) return;
      addFrequentCook(typeDraft);
      setTypeDraft('');
    };

    const speakSubtitle = isTranscribing
      ? 'Transcribing…'
      : isRecording
        ? 'Listening… tap to stop'
        : 'Tell us what you cook';

    return (
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 4, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <IdentityRibbon firstName={firstName} avatarUrl={avatarUrl} isDark={isDark} />
        <StepHeader
          prefix="What do you "
          italic="cook often?"
          subtitle="Just tell us the name and we'll build the full recipe for you. You can edit it later."
          isDark={isDark}
        />

        {/* Centred entry cards */}
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* Speak it — terracotta */}
            <Pressable
              onPress={isRecording ? stopVoice : startVoice}
              disabled={atMax || isTranscribing}
              style={{ flex: 1, opacity: atMax || isTranscribing ? 0.55 : 1 }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 11,
                  padding: 12,
                  borderRadius: 18,
                  borderWidth: isRecording ? 1.5 : 1,
                  borderColor: isRecording ? designTokens.colors.olive : cardHair,
                  backgroundColor: cardBg,
                  ...elevation.card,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 13,
                    backgroundColor: designTokens.colors.olive,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Mic size={19} color="#F6F2E9" strokeWidth={1.9} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{ fontFamily: designTokens.font.semibold, fontSize: 14.5, color: inkC, letterSpacing: -0.18 }}
                    numberOfLines={1}
                  >
                    Speak it
                  </Text>
                  <Text
                    style={{ marginTop: 2, fontFamily: designTokens.font.regular, fontSize: 11.5, lineHeight: 14, color: ink2C }}
                    numberOfLines={2}
                  >
                    {speakSubtitle}
                  </Text>
                </View>
              </View>
            </Pressable>

            {/* Type it — olive green */}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setTyping((t) => !t);
              }}
              disabled={atMax}
              style={{ flex: 1, opacity: atMax ? 0.55 : 1 }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 11,
                  padding: 12,
                  borderRadius: 18,
                  borderWidth: typing ? 1.5 : 1,
                  borderColor: typing ? designTokens.colors.brand : cardHair,
                  backgroundColor: cardBg,
                  ...elevation.card,
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 13,
                    backgroundColor: designTokens.colors.brand,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <KeyboardIcon size={19} color="#F6F2E9" strokeWidth={1.9} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{ fontFamily: designTokens.font.semibold, fontSize: 14.5, color: inkC, letterSpacing: -0.18 }}
                    numberOfLines={1}
                  >
                    Type it
                  </Text>
                  <Text
                    style={{ marginTop: 2, fontFamily: designTokens.font.regular, fontSize: 11.5, lineHeight: 14, color: ink2C }}
                    numberOfLines={2}
                  >
                    Enter the name
                  </Text>
                </View>
              </View>
            </Pressable>
          </View>

          {/* Type input — revealed when "Type it" is tapped */}
          {typing && !atMax && (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 14 }}>
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 14,
                  height: 52,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: cardHair,
                  backgroundColor: cardBg,
                }}
              >
                <TextInput
                  value={typeDraft}
                  onChangeText={setTypeDraft}
                  onSubmitEditing={commitType}
                  autoFocus
                  returnKeyType="done"
                  placeholder="e.g. Butter Chicken"
                  placeholderTextColor={ink3C}
                  style={{
                    flex: 1,
                    fontFamily: designTokens.font.regular,
                    fontSize: 15,
                    color: inkC,
                    padding: 0,
                  }}
                />
              </View>
              <Pressable
                onPress={commitType}
                disabled={typeDraft.trim().length === 0}
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor:
                    typeDraft.trim().length === 0 ? cardHair : designTokens.colors.brand,
                }}
              >
                <CirclePlus size={22} color={designTokens.colors.cream} strokeWidth={2} />
              </Pressable>
            </View>
          )}

          {/* Helper / status line, centred under the cards */}
          <Text
            style={{
              marginTop: 14,
              textAlign: 'center',
              fontFamily: designTokens.font.regular,
              fontSize: 12.5,
              color: voiceError ? designTokens.colors.olive : ink3C,
            }}
          >
            {voiceError ??
              (atMax ? "That's 5, plenty to go on!" : `Add up to ${MAX_FREQUENT_COOKS} dishes you cook often.`)}
          </Text>
        </View>

        {/* Captured dishes — vertical list at the bottom */}
        {frequentCooks.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <SectionEyebrow
              label={`Your dishes · ${frequentCooks.length}/${MAX_FREQUENT_COOKS}`}
              isDark={isDark}
            />
            {frequentCooks.map((dish) => {
              const isEditing = editingDish === dish;
              return (
                <View
                  key={dish}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 11,
                    paddingHorizontal: 16,
                    borderRadius: 14,
                    borderWidth: isEditing ? 1.5 : 1,
                    borderColor: isEditing ? designTokens.colors.brand : cardHair,
                    backgroundColor: cardBg,
                    marginBottom: 8,
                  }}
                >
                  {isEditing ? (
                    <>
                      <TextInput
                        value={editDraft}
                        onChangeText={setEditDraft}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={() => commitEditDish(dish)}
                        onBlur={() => commitEditDish(dish)}
                        placeholder="Dish name"
                        placeholderTextColor={ink3C}
                        style={{
                          flex: 1,
                          fontFamily: designTokens.font.medium,
                          fontSize: 14.5,
                          color: inkC,
                          padding: 0,
                        }}
                      />
                      <Pressable onPress={() => commitEditDish(dish)} hitSlop={10} style={{ marginLeft: 8 }}>
                        <Check size={18} color={designTokens.colors.brand} strokeWidth={2.4} />
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable style={{ flex: 1 }} onPress={() => startEditDish(dish)}>
                        <Text
                          style={{ fontFamily: designTokens.font.medium, fontSize: 14.5, color: inkC }}
                          numberOfLines={1}
                        >
                          {dish}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => startEditDish(dish)}
                        hitSlop={8}
                        style={{ marginLeft: 8, marginRight: 6 }}
                      >
                        <Pencil size={15} color={ink3C} strokeWidth={2} />
                      </Pressable>
                      <Pressable onPress={() => removeFrequentCook(dish)} hitSlop={8}>
                        <X size={16} color={ink3C} strokeWidth={2} />
                      </Pressable>
                    </>
                  )}
                </View>
              );
            })}

            {/* + Add another — shown while there are still empty holders */}
            {frequentCooks.length < MAX_FREQUENT_COOKS && (
              <View style={{ alignItems: 'center', marginTop: 6 }}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setTyping(true);
                  }}
                  hitSlop={8}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: designTokens.colors.brand,
                    ...elevation.card,
                  }}
                >
                  <Plus size={24} color={designTokens.colors.cream} strokeWidth={2.6} />
                </Pressable>
              </View>
            )}
          </View>
        )}
      </KeyboardAwareScrollView>
    );
  };

  const renderPrioritiesStep = () => {
    const cardW = (SCREEN_WIDTH - 48 - 10) / 2;
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <IdentityRibbon firstName={firstName} avatarUrl={avatarUrl} isDark={isDark} />
        <StepHeader
          prefix="You may also "
          italic="like"
          subtitle="Based on your frequent cooks. Tap the ones you fancy."
          isDark={isDark}
        />

        <SectionEyebrow
          label={`Picked for you${tasteRecipeIds.length ? ` · ${tasteRecipeIds.length} tapped` : ''}`}
          isDark={isDark}
        />

        {tasteRecipes.length === 0 ? (
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 14,
              color: isDark ? '#888' : designTokens.colors.ink2,
              marginTop: 4,
            }}
          >
            We'll craft your plan from your diet and cuisine picks.
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {tasteRecipes.map((r) => {
              const selected = tasteRecipeIds.includes(r.id);
              return (
                <Pressable
                  key={r.id}
                  onPress={() => toggleTaste(r.id)}
                  style={{
                    width: cardW,
                    borderRadius: 16,
                    overflow: 'hidden',
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected
                      ? designTokens.colors.brand
                      : isDark
                        ? '#2a2a2a'
                        : designTokens.colors.hair,
                    backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
                  }}
                >
                  <View>
                    <ExpoImage
                      source={{ uri: r.imageUrl }}
                      style={{ width: '100%', height: cardW * 0.72 }}
                      contentFit="cover"
                      transition={150}
                    />
                    <View
                      style={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        backgroundColor: 'rgba(0,0,0,0.55)',
                        borderRadius: 8,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 9.5,
                          color: '#fff',
                          letterSpacing: 0.3,
                        }}
                      >
                        {r.mealType === 'Lunch/Dinner' ? 'Lunch / Dinner' : r.mealType}
                      </Text>
                    </View>
                    {selected && (
                      <View
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
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
                            fontSize: 13,
                            color: designTokens.colors.cream,
                          }}
                        >
                          ✓
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text
                    numberOfLines={2}
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 12.5,
                      color: isDark ? '#fff' : designTokens.colors.ink,
                      padding: 8,
                      minHeight: 44,
                    }}
                  >
                    {r.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    );
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0:
        return renderFrequentCooksStep();
      case 1:
        return renderPrioritiesStep(); // "you may also like" suggestions grid
      default:
        return null;
    }
  };

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
          {/* Back — always shown. Steps 2–5 go to the previous step; on step 1
              it returns to the signup / sign-in screen (handleBack). */}
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
