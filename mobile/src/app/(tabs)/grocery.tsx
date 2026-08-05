import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Share, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ShoppingCart,
  Plus,
  Trash2,
  Apple,
  Milk,
  Beef,
  Package,
  Snowflake,
  Croissant,
  MoreHorizontal,
  X,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Share2,
  Lock,
  BookmarkCheck,
  Leaf,
  Home,
  Mic,
  Keyboard,
  BookOpen,
  Pencil,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  withRepeat,
  withTiming,
  useSharedValue,
  useAnimatedStyle,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useMealPlanStore, MONTHLY_FEATURE_LIMITS, type GroceryItem, type Ingredient, type SavedGroceryList } from '@/lib/store';
import { classifyFailure, makeFailure, reportFailure, validationFailure, type Failure, reportAndPresent } from '@/lib/failure';
import { InlineFailure } from '@/components/failure';
import { track } from '@/lib/analytics';
import { useAuthStore } from '@/lib/auth-store';
import { useIsAccountPaused, useSubscriptionStore, useHasPremiumAccess, useIsPremiumResolved } from '@/lib/subscription-store';
import { useColorScheme } from '@/lib/useColorScheme';
import { cn } from '@/lib/cn';
import { designTokens, getThemeColors, getCategoryTint, elevation, serifItalicFontStyle } from '@/lib/design-tokens';
import { t } from '@/lib/platform-tokens';
import { transcribeAudioToText, parseGroceryItemsFromTranscript, type ParsedGroceryItem } from '@/lib/voice-grocery';
import { convertToBaseUnit, resolveMeasurementSystem } from '@/lib/unit-conversion';
import { GroceryItemRow, groceryQuantityLabel } from '@/components/GroceryItemRow';
import { ShoppingListCompletionModal } from '@/components/ShoppingListCompletionModal';
import { GroceryRecipePicker } from '@/components/GroceryRecipePicker';
import { GroceryRecipeStrip } from '@/components/GroceryRecipeStrip';
import { PantryProgress } from '@/components/PantryProgress';
import { DuplicateIngredientBanner, DuplicateIngredientModal } from '@/components/DuplicateIngredientModal';
import { findDuplicateIngredientGroups, type DuplicateIngredientGroup } from '@/lib/duplicate-ingredient-finder';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';

const CATEGORY_CONFIG: Record<Ingredient['category'], { icon: typeof Apple; label: string; color: string }> = {
  // `icon` now uses softer / more outline-y choices to match the design.
  // `color` is the muted earth-tone accent (used for the icon stroke + share-text colors).
  produce: { icon: Leaf, label: 'Produce', color: '#546445' },       // sage
  dairy:   { icon: Milk, label: 'Dairy', color: '#6E7250' },         // muted olive
  meat:    { icon: Beef, label: 'Meat & Seafood', color: '#C0593A' },// terracotta-brown
  pantry:  { icon: Package, label: 'Pantry', color: '#7A6A3A' },     // warm tan
  frozen:  { icon: Snowflake, label: 'Frozen', color: '#4B6A86' },   // slate blue
  bakery:  { icon: Croissant, label: 'Bakery', color: '#A77B3B' },   // warm brown
  other:   { icon: MoreHorizontal, label: 'Other', color: '#6b7280' },// neutral gray
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const UNIT_GROUPS: { label: string; units: { value: string; label: string }[] }[] = [
  {
    label: 'Count',
    units: [
      { value: 'item', label: 'item' },
      { value: 'piece', label: 'piece' },
      { value: 'slice', label: 'slice' },
      { value: 'dozen', label: 'dozen' },
      { value: 'pack', label: 'pack' },
      { value: 'can', label: 'can' },
      { value: 'bottle', label: 'bottle' },
      { value: 'bag', label: 'bag' },
      { value: 'box', label: 'box' },
      { value: 'bunch', label: 'bunch' },
      { value: 'head', label: 'head' },
      { value: 'clove', label: 'clove' },
    ],
  },
  {
    label: 'Volume',
    units: [
      { value: 'ml', label: 'ml' },
      { value: 'l', label: 'l (litre)' },
      { value: 'tsp', label: 'tsp' },
      { value: 'tbsp', label: 'tbsp' },
      { value: 'cup', label: 'cup' },
      { value: 'fl oz', label: 'fl oz' },
      { value: 'pint', label: 'pint' },
      { value: 'quart', label: 'quart' },
      { value: 'gallon', label: 'gallon' },
    ],
  },
  {
    label: 'Weight',
    units: [
      { value: 'g', label: 'g (gram)' },
      { value: 'kg', label: 'kg' },
      { value: 'oz', label: 'oz' },
      { value: 'lb', label: 'lb' },
      { value: 'lbs', label: 'lbs' },
      { value: 'mg', label: 'mg' },
    ],
  },
];

// Extract just the numeric part from a quantity string (e.g., "3.5 cloves" → "3.5")
function extractNumericQuantity(qty: string): string {
  const match = qty.match(/^[\d.]+/);
  return match ? match[0] : qty;
}

// Extract the unit part from a quantity string (e.g., "3.5 cloves" → "cloves")
function extractUnitFromQuantity(qty: string): string {
  const trimmed = qty.trim();
  const match = trimmed.match(/\s+(.+)$/);
  return match ? match[1] : '';
}

// Normalize a name for comparison: lowercase, trim, collapse spaces, strip trailing 's'/'es'
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/ies$/, 'y')   // berries -> berry
    .replace(/es$/, '')      // tomatoes -> tomat
    .replace(/s$/, '');      // avocados -> avocado
}

// Levenshtein edit distance
function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Returns true if two item names are close enough to be considered duplicates
function isFuzzyMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  // One is a substring of the other (e.g. "milk" in "whole milk")
  if (na.includes(nb) || nb.includes(na)) return true;
  // Levenshtein: allow up to 2 edits for short words, 3 for longer
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen < 4) return false; // too short, avoid false positives
  const threshold = maxLen <= 6 ? 2 : 3;
  return editDistance(na, nb) <= threshold;
}

// Classify a unit string into a measurement type
type UnitType = 'liquid' | 'weight' | 'piece';
const LIQUID_UNITS = new Set(['ml', 'l', 'litre', 'liter', 'litres', 'liters', 'cup', 'cups', 'tbsp', 'tablespoon', 'tablespoons', 'tsp', 'teaspoon', 'teaspoons', 'fl oz', 'fluid oz', 'pint', 'pints', 'quart', 'quarts', 'gallon', 'gallons']);
const WEIGHT_UNITS = new Set(['g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds', 'mg']);

function getUnitType(unit: string): UnitType {
  const n = unit.toLowerCase().trim();
  if (LIQUID_UNITS.has(n)) return 'liquid';
  if (WEIGHT_UNITS.has(n)) return 'weight';
  return 'piece';
}


function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthDays(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  // Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  let startDayOfWeek = firstDay.getDay();
  // Convert to Monday-based week (0 = Monday, 1 = Tuesday, ..., 6 = Sunday)
  startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const days: (Date | null)[] = [];

  // Add empty slots for days before the first day of the month (Monday-based)
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null);
  }

  // Add all days of the month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }

  // Pad the end to complete the last week (7 days per row)
  // Calculate how many empty slots needed to reach a multiple of 7
  const emptyNeeded = (7 - (days.length % 7)) % 7;
  for (let i = 0; i < emptyNeeded; i++) {
    days.push(null);
  }

  return days;
}


// Per-category accent map (matches design's icon tile tints)
const CATEGORY_TINT: Record<Ingredient['category'], string> = {
  produce: '#E8ECDF',
  bakery: '#F4EBDB',
  meat: '#F2E0D9',
  dairy: '#EEEEE3',
  pantry: '#EEE9DC',
  frozen: '#E1E8EE',
  other: '#F4F2EB',
};

// Voice capture for the Add Item modal: record → transcribe → parse into
// name+quantity items, each auto-classified into a grocery category, then a
// quick review list before adding them all.
function VoiceGroceryCapture({
  isDark,
  onAddItems,
  onClose,
}: {
  isDark: boolean;
  onAddItems: (items: ParsedGroceryItem[]) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'processing' | 'review'>('idle');
  const [error, setError] = useState<Failure | null>(null);
  const [items, setItems] = useState<ParsedGroceryItem[]>([]);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const hasPremiumAccess = useHasPremiumAccess();
  const openPaywallSheet = useSubscriptionStore((s) => s.openPaywallSheet);

  const pulse = useSharedValue(1);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const startRecording = useCallback(async () => {
    try {
      // Paywall gate: free users get MONTHLY_FEATURE_LIMITS.speakGrocery
      // SUCCESSFUL voice attempts per month. Typing is unrestricted. Hitting the
      // cap dismisses the modal and pops the paywall with a rollover note.
      if (!hasPremiumAccess) {
        const used = useMealPlanStore.getState().getMonthlyFeatureCount('speakGrocery');
        if (used >= MONTHLY_FEATURE_LIMITS.speakGrocery) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onClose();
          openPaywallSheet('speak-grocery-limit');
          return;
        }
      }
      setError(null);
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setError(makeFailure('permission-denied', { feature: 'voice' }));
        return;
      }
      // expo-av allows only ONE active Recording. Unload any recorder left by a
      // previous (possibly failed) run, otherwise the next prepare fails with
      // "recorder not prepared".
      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch {
          /* already unloaded / never prepared */
        }
        recordingRef.current = null;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // createAsync prepares AND starts atomically — avoids the prepare/start
      // race that intermittently throws "recorder not prepared".
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setPhase('recording');
      pulse.value = withRepeat(
        withTiming(1.18, { duration: 750, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } catch (e) {
      console.error('[VoiceGrocery] start failed', e);
      setError(makeFailure('permission-denied', { feature: 'voice' }));
      setPhase('idle');
      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch {
          /* ignore */
        }
        recordingRef.current = null;
      }
    }
  }, [pulse, hasPremiumAccess, onClose, openPaywallSheet]);

  const stopRecording = useCallback(async () => {
    pulse.value = 1;
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (!recording) {
      setPhase('idle');
      return;
    }
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setPhase('processing');
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (!uri) throw new Error('No recording found');
      const text = await transcribeAudioToText(uri);
      const parsed = await parseGroceryItemsFromTranscript(text);
      if (parsed.length === 0) {
        setError(validationFailure('We didn’t catch that', 'Try again and say each item with its quantity.', 'voice'));
        setPhase('idle');
        return;
      }
      setItems(parsed);
      setPhase('review');
      // Count this as one SUCCESSFUL voice attempt (free users only).
      if (!hasPremiumAccess) {
        useMealPlanStore.getState().recordMonthlyFeatureUse('speakGrocery');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      // Was: `Couldn't process audio: ${e.message}` — which put the raw
      // transcription/SDK exception on screen. The classifier picks the right
      // category (permission, offline, parsing) and the copy comes from the
      // catalogue; the exception itself goes to diagnostics only.
      const failure = classifyFailure(e, { feature: 'voice' });
      reportFailure(failure);
      setError(failure);
      setPhase('idle');
    } finally {
      // Release the iOS record session so the next prepare starts clean.
      try {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      } catch {
        /* ignore */
      }
    }
  }, [pulse, hasPremiumAccess]);

  const removeItem = useCallback((idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const labelText = isDark ? 'text-charcoal-300' : 'text-charcoal-600';

  if (phase !== 'review') {
    const recording = phase === 'recording';
    const processing = phase === 'processing';
    return (
      <View className="items-center py-3">
        <Text className={cn('text-sm text-center mb-6 px-2', labelText)}>
          Tap the mic and say your items with quantities — e.g. “two onions, a loaf of bread, 500 grams of chicken, milk”.
        </Text>
        <Animated.View style={pulseStyle}>
          <Pressable
            onPress={recording ? stopRecording : startRecording}
            disabled={processing}
            className={cn(
              'w-24 h-24 rounded-full items-center justify-center',
              recording ? 'bg-red-500' : 'bg-sage-500',
              processing && 'opacity-60',
            )}
          >
            {processing ? <ActivityIndicator color="#fff" /> : <Mic size={34} color="#fff" strokeWidth={1.8} />}
          </Pressable>
        </Animated.View>
        <Text className={cn('text-sm font-medium mt-4', isDark ? 'text-white' : 'text-charcoal-800')}>
          {processing ? 'Sorting your items…' : recording ? 'Listening… tap to stop' : 'Tap to talk'}
        </Text>
        {error && (
          <View style={{ marginTop: 12 }}>
            <InlineFailure failure={error} compact />
          </View>
        )}
      </View>
    );
  }

  return (
    <View>
      <Text className={cn('text-sm font-medium mb-3', labelText)}>
        {items.length} item{items.length === 1 ? '' : 's'} found — tap ✕ to remove any
      </Text>
      <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
        {items.map((it, idx) => {
          const cfg = (CATEGORY_CONFIG as Record<string, { label: string }>)[it.category] ?? CATEGORY_CONFIG.other;
          return (
            <View
              key={`${it.name}-${idx}`}
              className={cn('flex-row items-center rounded-xl px-3 py-2.5 mb-2', isDark ? 'bg-charcoal-700' : 'bg-cream-100')}
            >
              <View className="flex-1 min-w-0">
                <Text className={cn('text-base font-medium', isDark ? 'text-white' : 'text-charcoal-900')} numberOfLines={1}>
                  {it.name}
                </Text>
                <Text className={cn('text-xs mt-0.5', isDark ? 'text-charcoal-400' : 'text-charcoal-500')}>
                  {it.quantity} {it.unit} · {cfg.label}
                </Text>
              </View>
              <Pressable onPress={() => removeItem(idx)} hitSlop={8} className="ml-2 p-1">
                <X size={18} color={isDark ? '#9d9d9d' : '#888888'} />
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
      <View className="flex-row mt-2" style={{ gap: 10 }}>
        <Pressable
          onPress={() => {
            setItems([]);
            setPhase('idle');
            setError(null);
          }}
          className={cn('flex-1 py-4 rounded-2xl items-center', isDark ? 'bg-charcoal-700' : 'bg-cream-200')}
        >
          <Text className={cn('text-base font-semibold', isDark ? 'text-charcoal-200' : 'text-charcoal-600')}>Try again</Text>
        </Pressable>
        <Pressable
          onPress={() => onAddItems(items)}
          disabled={items.length === 0}
          className={cn(
            'flex-1 py-4 rounded-2xl items-center',
            items.length > 0 ? 'bg-sage-500' : isDark ? 'bg-charcoal-700' : 'bg-cream-200',
          )}
        >
          <Text
            className={cn(
              'text-base font-semibold',
              items.length > 0 ? 'text-white' : isDark ? 'text-charcoal-500' : 'text-charcoal-400',
            )}
          >
            Add {items.length} item{items.length === 1 ? '' : 's'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

interface AddItemModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (item: Omit<GroceryItem, 'id'>) => void;
  onMerge: (itemId: string, quantity: string, unit: string) => void;
  isDark: boolean;
  existingItems: GroceryItem[];
  groceryItems: GroceryItem[];
}

function AddItemModal({ visible, onClose, onAdd, onMerge, isDark, existingItems, groceryItems }: AddItemModalProps) {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('item');
  const [category, setCategory] = useState<Ingredient['category']>('other');
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [mode, setMode] = useState<'type' | 'talk'>('type');

  // Duplicate detection state
  // matchedItems: array of all fuzzy-matching items
  // selectedMatchId: which matched item the user selected (if any)
  // showBanner: whether to display the match banner (hidden after user selects an item)
  // duplicateChoice: null = not decided yet, 'combine' = user picked combine, 'separate' = user picked separate
  const [matchedItems, setMatchedItems] = useState<GroceryItem[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [duplicateChoice, setDuplicateChoice] = useState<'combine' | 'separate' | null>(null);

  // Grocery item name validation
  const validateItemName = useCallback((text: string): { isValid: boolean; error: string } => {
    const trimmed = text.trim();

    // Check if empty
    if (!trimmed) {
      return { isValid: false, error: '' };
    }

    // Check minimum length
    if (trimmed.length < 2) {
      return { isValid: false, error: 'Item name must be at least 2 characters' };
    }

    // Check if contains at least one letter (supports international characters)
    if (!/\p{L}/u.test(trimmed)) {
      return { isValid: false, error: 'Item name must contain at least one letter' };
    }

    // Check for valid characters: letters, numbers, spaces, common punctuation
    // Allow: a-z, A-Z, 0-9, spaces, hyphens, apostrophes, ampersands, commas, periods
    const hasValidChars = /^[\p{L}0-9\s\-'&.,]*$/u.test(trimmed);
    if (!hasValidChars) {
      return { isValid: false, error: 'Item name contains invalid characters' };
    }

    return { isValid: true, error: '' };
  }, []);

  const resetForm = useCallback(() => {
    setName('');
    setNameError('');
    setQuantity('1');
    setUnit('item');
    setCategory('other');
    setShowUnitPicker(false);
    setMatchedItems([]);
    setSelectedMatchId(null);
    setShowBanner(false);
    setDuplicateChoice(null);
    setMode('type');
  }, []);

  // Voice path: add every parsed (and already-categorized) item, then close.
  const handleAddVoiceItems = useCallback((voiceItems: ParsedGroceryItem[]) => {
    voiceItems.forEach((it) => {
      // Merge into an existing line when the item already exists (case- and
      // plural-insensitive), instead of adding a duplicate. Voice add is
      // silent (no confirm banner), so we use strict normalized-name equality
      // — not the looser fuzzy match — so "chicken" folds into "Chicken" but
      // won't wrongly fold into "chicken breast".
      const match = existingItems.find(
        (e) => normalizeName(e.name) === normalizeName(it.name),
      );
      if (match) {
        onMerge(match.id, it.quantity, it.unit || 'item');
      } else {
        onAdd({
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
          category: it.category,
          isChecked: false,
          recipeIds: [],
        });
      }
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    resetForm();
    onClose();
  }, [existingItems, onMerge, onAdd, resetForm, onClose]);

  // Re-run fuzzy match every time the name changes — find ALL matches
  const handleNameChange = useCallback((text: string) => {
    setName(text);

    // Validate name in real-time
    const validation = validateItemName(text);
    if (text && !validation.isValid) {
      setNameError(validation.error);
    } else {
      setNameError('');
    }

    // Only reset the choice; keep the banner open if we already have a selection
    setDuplicateChoice(null);

    const trimmed = text.trim();
    if (trimmed.length < 2) {
      setMatchedItems([]);
      setSelectedMatchId(null);
      setShowBanner(false);
      return;
    }
    // Find ALL fuzzy matches
    const matches = existingItems.filter((e) => isFuzzyMatch(e.name, trimmed));
    setMatchedItems(matches);
    if (matches.length > 0) {
      setShowBanner(true);
      // Only auto-select if nothing is selected yet
      setSelectedMatchId((prev) => prev && matches.find((m) => m.id === prev) ? prev : matches[0].id);
    } else {
      // No matches found — hide banner and clear selection
      setShowBanner(false);
      setSelectedMatchId(null);
    }
  }, [existingItems, validateItemName]);

  // Get the currently selected matched item
  const selectedMatch = selectedMatchId ? matchedItems.find((m) => m.id === selectedMatchId) : null;

  // When user picks "Combine" — pre-fill quantity & unit from the selected matched item
  const handlePickCombine = useCallback(() => {
    if (!selectedMatch) return;
    setDuplicateChoice('combine');
    setShowBanner(false);
    // Numeric quantity: strip any trailing unit text (e.g. "3.5 cloves" → "3.5")
    setQuantity(extractNumericQuantity(selectedMatch.quantity));
    // Unit priority: use selectedMatch.unit if it's meaningful,
    // otherwise fall back to the unit embedded in the quantity string
    const explicitUnit = selectedMatch.unit && selectedMatch.unit !== 'item' && selectedMatch.unit !== ''
      ? selectedMatch.unit
      : extractUnitFromQuantity(selectedMatch.quantity);
    setUnit(explicitUnit || 'item');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [selectedMatch]);

  // When user picks "Separate" — keep their own quantity/unit, just flag the choice
  const handlePickSeparate = useCallback(() => {
    setDuplicateChoice('separate');
    setShowBanner(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const doAdd = useCallback((item: Omit<GroceryItem, 'id'>) => {
    onAdd(item);
    resetForm();
    onClose();
  }, [onAdd, resetForm, onClose]);

  const handleAdd = useCallback(() => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setNameError('Item name is required');
      return;
    }

    // Validate name
    const validation = validateItemName(trimmedName);
    if (!validation.isValid) {
      setNameError(validation.error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    // If there's a match and no choice made yet, require the user to pick
    if (matchedItems.length > 0 && !duplicateChoice) return;

    if (duplicateChoice === 'combine' && selectedMatch) {
      onMerge(selectedMatch.id, quantity, unit || 'item');
      resetForm();
      onClose();
      return;
    } else if (duplicateChoice === 'separate') {
      doAdd({
        name: name.trim(),
        quantity,
        unit: unit || 'item',
        category,
        isChecked: false,
        recipeIds: [],
      });
    } else {
      doAdd({
        name: name.trim(),
        quantity,
        unit: unit || 'item',
        category,
        isChecked: false,
        recipeIds: [],
      });
    }
  }, [name, quantity, unit, category, matchedItems, duplicateChoice, selectedMatch, existingItems, groceryItems, onMerge, doAdd, resetForm, onClose, validateItemName]);

  // The Add button is ready when: name is filled AND valid AND (no matches, or user made a choice)
  const canAdd = name.trim().length > 0 && !nameError && (matchedItems.length === 0 || duplicateChoice !== null);

  if (!visible) return null;

  const inputBg = isDark ? 'bg-charcoal-700' : 'bg-cream-100';
  const inputText = isDark ? 'text-white' : 'text-charcoal-900';
  const labelText = isDark ? 'text-charcoal-300' : 'text-charcoal-600';
  const cardBg = isDark ? 'bg-charcoal-700' : 'bg-cream-100';
  const dialogBg = isDark ? 'bg-charcoal-800' : 'bg-white';

  // Is unit locked? Only when user chose "combine" (must use existing item's unit)
  const unitLocked = duplicateChoice === 'combine';

  return (
    <View className="absolute inset-0 z-50">
      <Pressable onPress={onClose} className="absolute inset-0 bg-black/50" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="absolute bottom-0 left-0 right-0"
      >
        <Animated.View
          entering={FadeInDown.springify()}
          className={cn("rounded-t-3xl p-6 pb-10", isDark ? "bg-charcoal-800" : "bg-white")}
        >
          {/* Header */}
          <View className="flex-row items-center justify-between mb-6">
            <Text className={cn("text-xl font-bold", isDark ? "text-white" : "text-charcoal-900")}>
              Add Item
            </Text>
            <Pressable onPress={onClose}>
              <X size={24} color={isDark ? '#fff' : '#262626'} />
            </Pressable>
          </View>

          {/* Type / Talk mode toggle */}
          <View className={cn('flex-row rounded-2xl p-1 mb-5', isDark ? 'bg-charcoal-700' : 'bg-cream-100')}>
            {([['type', 'Type', Keyboard], ['talk', 'Talk', Mic]] as const).map(([m, lbl, Icon]) => {
              const active = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setMode(m);
                  }}
                  className={cn(
                    'flex-1 flex-row items-center justify-center py-2.5 rounded-xl',
                    active ? 'bg-sage-500' : 'bg-transparent',
                  )}
                >
                  <Icon size={16} color={active ? '#fff' : isDark ? '#9d9d9d' : '#888888'} strokeWidth={1.8} />
                  <Text
                    className={cn(
                      'text-sm font-semibold ml-2',
                      active ? 'text-white' : isDark ? 'text-charcoal-300' : 'text-charcoal-600',
                    )}
                  >
                    {lbl}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {mode === 'talk' && (
            <VoiceGroceryCapture isDark={isDark} onAddItems={handleAddVoiceItems} onClose={onClose} />
          )}

          {mode === 'type' && (
          <>
          {/* 1. Choose a category */}
          <Text className={cn("text-base font-semibold mb-3", isDark ? "text-white" : "text-charcoal-900")}>
            1. Choose a category
          </Text>
          <View className="mb-5">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
              {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                <Pressable
                  key={key}
                  onPress={() => setCategory(key as Ingredient['category'])}
                  className={cn(
                    "px-4 py-2 rounded-full mr-2",
                    category === key ? "bg-sage-500" : isDark ? "bg-charcoal-700" : "bg-cream-100"
                  )}
                >
                  <Text className={cn(
                    "text-sm font-medium",
                    category === key ? "text-white" : isDark ? "text-charcoal-300" : "text-charcoal-600"
                  )}>
                    {config.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* 2. Add item details */}
          <Text className={cn("text-base font-semibold mb-3", isDark ? "text-white" : "text-charcoal-900")}>
            2. Add item details
          </Text>
          {/* Item Name */}
          <View className="mb-3">
            <Text className={cn("text-sm font-medium mb-2", labelText)}>Item Name</Text>
            <TextInput
              value={name}
              onChangeText={handleNameChange}
              placeholder="e.g., Avocado"
              placeholderTextColor={isDark ? '#6d6d6d' : '#888888'}
              className={cn(
                "px-4 py-3 rounded-xl text-base",
                inputBg, inputText,
                nameError ? "border-2 border-red-400" :
                matchedItems.length > 0 && !duplicateChoice ? "border-2 border-amber-400" : ""
              )}
              autoFocus
            />
            {nameError && (
              <Text className="text-red-500 text-xs mt-2">{nameError}</Text>
            )}
          </View>

          {/* ── Inline duplicate banner with match selector ── */}
          {showBanner && matchedItems.length > 0 && (
            <Animated.View
              entering={FadeInDown.duration(200)}
              className={cn(
                "rounded-xl mb-3 overflow-hidden border",
                isDark ? "bg-charcoal-750 border-charcoal-600" : "bg-amber-50/80 border-amber-200"
              )}
            >
              {/* Compact match list */}
              <View className="px-3 py-2">
                {matchedItems.map((item, index) => (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      setSelectedMatchId(item.id);
                      // Fill the name field with the selected match name
                      setName(item.name);
                      // Keep banner open — user still needs to choose Combine or Separate
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    className={cn(
                      "flex-row items-center py-2 px-2 rounded-lg",
                      index !== matchedItems.length - 1 && "mb-1",
                      selectedMatchId === item.id
                        ? isDark ? "bg-sage-500/20" : "bg-sage-500/15"
                        : "bg-transparent"
                    )}
                  >
                    {/* Radio indicator */}
                    <View className={cn(
                      "w-4 h-4 rounded-full border-2 mr-2.5 items-center justify-center",
                      selectedMatchId === item.id
                        ? "border-sage-500 bg-sage-500"
                        : isDark ? "border-charcoal-500" : "border-amber-300"
                    )}>
                      {selectedMatchId === item.id && (
                        <View className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </View>
                    {/* Item info */}
                    <Text className={cn("text-sm font-medium flex-1", isDark ? "text-white" : "text-charcoal-800")} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text className={cn("text-xs ml-2", isDark ? "text-charcoal-400" : "text-charcoal-500")}>
                      {item.quantity}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Compact choice buttons */}
              <View className={cn(
                "flex-row border-t",
                isDark ? "border-charcoal-600" : "border-amber-200"
              )}>
                <Pressable
                  onPress={handlePickCombine}
                  className={cn(
                    "flex-1 py-2.5 items-center border-r",
                    isDark ? "border-charcoal-600" : "border-amber-200",
                    duplicateChoice === 'combine'
                      ? "bg-sage-500"
                      : isDark ? "bg-charcoal-750" : "bg-amber-50/50"
                  )}
                >
                  <Text className={cn(
                    "text-xs font-semibold",
                    duplicateChoice === 'combine' ? "text-white" : isDark ? "text-charcoal-200" : "text-charcoal-600"
                  )}>
                    Combine
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handlePickSeparate}
                  className={cn(
                    "flex-1 py-2.5 items-center",
                    duplicateChoice === 'separate'
                      ? "bg-charcoal-600"
                      : isDark ? "bg-charcoal-750" : "bg-amber-50/50"
                  )}
                >
                  <Text className={cn(
                    "text-xs font-semibold",
                    duplicateChoice === 'separate' ? "text-white" : isDark ? "text-charcoal-200" : "text-charcoal-600"
                  )}>
                    Keep separate
                  </Text>
                </Pressable>
              </View>
            </Animated.View>
          )}

          {/* Quantity + Unit */}
          <View className="flex-row mb-4 space-x-3">
            <View className="flex-1">
              <Text className={cn("text-sm font-medium mb-2", labelText)}>Quantity</Text>
              <TextInput
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
                className={cn(
                  "px-4 py-3 rounded-xl text-base",
                  inputBg, inputText
                )}
              />
            </View>
            <View className="flex-1">
              <Text className={cn("text-sm font-medium mb-2", labelText)}>Unit</Text>
              <Pressable
                onPress={() => !unitLocked && setShowUnitPicker(true)}
                className={cn(
                  "px-4 py-3 rounded-xl flex-row items-center justify-between",
                  inputBg,
                  unitLocked && "opacity-50"
                )}
                style={{ minHeight: 48 }}
              >
                <Text className={cn("text-base", unit ? inputText : isDark ? 'text-charcoal-500' : 'text-charcoal-400')}>
                  {unit || 'Select'}
                </Text>
                {unitLocked
                  ? <View className="w-4 h-4" />
                  : <ChevronDown size={16} color={isDark ? '#9d9d9d' : '#888888'} />
                }
              </Pressable>
            </View>
          </View>

          {/* Combine explainer */}
          {duplicateChoice === 'combine' && selectedMatch && (
            <View className={cn("rounded-xl px-4 py-2.5 mb-4 flex-row items-center", isDark ? "bg-sage-900/30" : "bg-sage-50")}>
              <Text className={cn("text-xs flex-1", isDark ? "text-sage-400" : "text-sage-700")}>
                Unit pre-filled from existing item. Enter your quantity — amounts will be merged when added.
              </Text>
            </View>
          )}

          {/* Separate explainer */}
          {duplicateChoice === 'separate' && (
            <View className={cn("rounded-xl px-4 py-2.5 mb-4 flex-row items-center", isDark ? "bg-charcoal-700/50" : "bg-cream-100")}>
              <Text className={cn("text-xs flex-1", isDark ? "text-charcoal-400" : "text-charcoal-500")}>
                Will be added as a new separate item. Set your own quantity and unit below.
              </Text>
            </View>
          )}

          {/* Add Button */}
          <Pressable
            onPress={handleAdd}
            disabled={!canAdd}
            className={cn(
              "py-4 rounded-2xl items-center",
              canAdd ? "bg-sage-500" : isDark ? "bg-charcoal-700" : "bg-cream-200"
            )}
          >
            <Text className={cn(
              "text-base font-semibold",
              canAdd ? "text-white" : isDark ? "text-charcoal-500" : "text-charcoal-400"
            )}>
              {duplicateChoice === 'combine' ? "Combine & Add" : duplicateChoice === 'separate' ? "Add Separately" : "Add to List"}
            </Text>
          </Pressable>
          </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>

      {/* ── Unit Picker Sheet ── */}
      {showUnitPicker && (
        <View className="absolute inset-0 z-50">
          <Pressable className="absolute inset-0 bg-black/50" onPress={() => setShowUnitPicker(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            className="absolute bottom-0 left-0 right-0"
          >
            <Animated.View
              entering={FadeInDown.springify()}
              className={cn("rounded-t-3xl pb-10", isDark ? "bg-charcoal-900" : "bg-white")}
              style={{ maxHeight: 480 }}
            >
              {/* Picker header */}
              <View className={cn(
                "flex-row items-center justify-between px-6 pt-5 pb-3 border-b",
                isDark ? "border-charcoal-700" : "border-cream-200"
              )}>
                <Text className={cn("text-base font-bold", isDark ? "text-white" : "text-charcoal-900")}>
                  Select Unit
                </Text>
                <Pressable
                  onPress={() => setShowUnitPicker(false)}
                  className={cn("w-8 h-8 rounded-full items-center justify-center", isDark ? "bg-charcoal-700" : "bg-cream-100")}
                >
                  <X size={16} color={isDark ? '#fff' : '#262626'} />
                </Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
                {UNIT_GROUPS.map((group) => (
                  <View key={group.label}>
                    <Text className={cn(
                      "text-xs font-semibold uppercase tracking-widest px-6 pt-4 pb-2",
                      isDark ? "text-charcoal-500" : "text-charcoal-400"
                    )}>
                      {group.label}
                    </Text>
                    <View className="flex-row flex-wrap px-4">
                      {group.units.map((u) => {
                        const isSelected = unit === u.value;
                        return (
                          <Pressable
                            key={u.value}
                            onPress={() => {
                              setUnit(u.value);
                              setShowUnitPicker(false);
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                            className={cn(
                              "m-1 px-4 py-2.5 rounded-xl border",
                              isSelected
                                ? "bg-sage-500 border-sage-500"
                                : isDark
                                  ? "bg-charcoal-700 border-charcoal-600"
                                  : "bg-cream-50 border-cream-200"
                            )}
                          >
                            <Text className={cn(
                              "text-sm font-medium",
                              isSelected ? "text-white" : isDark ? "text-charcoal-200" : "text-charcoal-700"
                            )}>
                              {u.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      )}
    </View>
  );
}

interface DateRangePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onGenerate: (startDate: string, endDate: string) => void;
  isDark: boolean;
  mealSlots: Array<{ date: string; recipeId: string | null }>;
}

function DateRangePickerModal({ visible, onClose, onGenerate, isDark, mealSlots }: DateRangePickerModalProps) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);

  const monthDays = useMemo(() => getMonthDays(currentYear, currentMonth), [currentYear, currentMonth]);

  const datesWithMeals = useMemo(() => {
    const dates = new Set<string>();
    mealSlots.forEach(slot => {
      if (slot.recipeId) {
        dates.add(slot.date);
      }
    });
    return dates;
  }, [mealSlots]);

  const handlePrevMonth = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  }, [currentMonth, currentYear]);

  const handleNextMonth = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  }, [currentMonth, currentYear]);

  const handleDateSelect = useCallback((date: Date) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const dateKey = formatDateKey(date);

    if (!startDate || (startDate && endDate)) {
      // Start new selection
      setStartDate(dateKey);
      setEndDate(null);
    } else {
      // Complete the range
      if (dateKey < startDate) {
        setEndDate(startDate);
        setStartDate(dateKey);
      } else {
        setEndDate(dateKey);
      }
    }
  }, [startDate, endDate]);

  const isDateInRange = useCallback((date: Date) => {
    if (!startDate) return false;
    const dateKey = formatDateKey(date);
    if (!endDate) return dateKey === startDate;
    return dateKey >= startDate && dateKey <= endDate;
  }, [startDate, endDate]);

  const isStartDate = useCallback((date: Date) => {
    return startDate === formatDateKey(date);
  }, [startDate]);

  const isEndDate = useCallback((date: Date) => {
    return endDate === formatDateKey(date);
  }, [endDate]);

  const handleGenerate = useCallback(() => {
    if (startDate) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onGenerate(startDate, endDate || startDate);
      setStartDate(null);
      setEndDate(null);
      onClose();
    }
  }, [startDate, endDate, onGenerate, onClose]);

  const handleClose = useCallback(() => {
    setStartDate(null);
    setEndDate(null);
    onClose();
  }, [onClose]);

  if (!visible) return null;

  const todayKey = formatDateKey(today);

  return (
    <View className="absolute inset-0 z-50">
      <Pressable
        onPress={handleClose}
        className="absolute inset-0 bg-black/50"
      />
      <Animated.View
        entering={FadeInDown.springify()}
        className={cn(
          "absolute bottom-0 left-0 right-0 rounded-t-3xl p-5 pb-10",
          isDark ? "bg-charcoal-800" : "bg-white"
        )}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-4">
          <Text className={cn(
            "text-xl font-bold",
            isDark ? "text-white" : "text-charcoal-900"
          )}>
            Select Date Range
          </Text>
          <Pressable onPress={handleClose}>
            <X size={24} color={isDark ? '#fff' : '#262626'} />
          </Pressable>
        </View>

        {/* Instructions */}
        <Text className={cn(
          "text-sm mb-4",
          isDark ? "text-charcoal-400" : "text-charcoal-500"
        )}>
          Tap a date to start, then tap another to select a range. Dates with meals are highlighted.
        </Text>

        {/* Month Navigation */}
        <View className="flex-row items-center justify-between mb-4">
          <Pressable
            onPress={handlePrevMonth}
            className={cn(
              "w-10 h-10 rounded-full items-center justify-center",
              isDark ? "bg-charcoal-700" : "bg-cream-100"
            )}
          >
            <ChevronLeft size={20} color={isDark ? '#fff' : '#262626'} />
          </Pressable>
          <Text className={cn(
            "text-lg font-semibold",
            isDark ? "text-white" : "text-charcoal-900"
          )}>
            {MONTHS[currentMonth]} {currentYear}
          </Text>
          <Pressable
            onPress={handleNextMonth}
            className={cn(
              "w-10 h-10 rounded-full items-center justify-center",
              isDark ? "bg-charcoal-700" : "bg-cream-100"
            )}
          >
            <ChevronRight size={20} color={isDark ? '#fff' : '#262626'} />
          </Pressable>
        </View>

        {/* Day Headers */}
        <View className="flex-row mb-2">
          {DAYS.map((day) => (
            <View key={day} className="flex-1 items-center">
              <Text className={cn(
                "text-xs font-medium",
                isDark ? "text-charcoal-500" : "text-charcoal-400"
              )}>
                {day}
              </Text>
            </View>
          ))}
        </View>

        {/* Calendar Grid */}
        <View className="flex-row flex-wrap mb-4">
          {monthDays.map((date, index) => {
            if (!date) {
              return <View key={`empty-${index}`} className="w-[14.28%] h-10" />;
            }

            const dateKey = formatDateKey(date);
            const isToday = dateKey === todayKey;
            const inRange = isDateInRange(date);
            const isStart = isStartDate(date);
            const isEnd = isEndDate(date);
            const hasMeal = datesWithMeals.has(dateKey);

            return (
              <Pressable
                key={dateKey}
                onPress={() => handleDateSelect(date)}
                className={cn(
                  "w-[14.28%] h-10 items-center justify-center",
                  inRange && !isStart && !isEnd && (isDark ? "bg-sage-900/50" : "bg-sage-100"),
                  isStart && "rounded-l-full",
                  isEnd && "rounded-r-full",
                  (isStart || isEnd) && (isDark ? "bg-sage-600" : "bg-sage-500")
                )}
              >
                <View className={cn(
                  "w-8 h-8 rounded-full items-center justify-center",
                  isToday && !inRange && "border-2 border-sage-500"
                )}>
                  <Text className={cn(
                    "text-sm font-medium",
                    (isStart || isEnd) ? "text-white" : isDark ? "text-white" : "text-charcoal-900"
                  )}>
                    {date.getDate()}
                  </Text>
                  {hasMeal && !isStart && !isEnd && (
                    <View className={cn(
                      "absolute bottom-0 w-1.5 h-1.5 rounded-full",
                      isDark ? "bg-terracotta-400" : "bg-terracotta-500"
                    )} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Selected Range Display */}
        {startDate && (
          <View className={cn(
            "p-3 rounded-xl mb-4",
            isDark ? "bg-charcoal-700" : "bg-cream-100"
          )}>
            <Text className={cn(
              "text-sm text-center",
              isDark ? "text-charcoal-300" : "text-charcoal-600"
            )}>
              {endDate
                ? `${new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : `${new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (tap another date for range)`
              }
            </Text>
          </View>
        )}

        {/* Generate Button */}
        <Pressable
          onPress={handleGenerate}
          disabled={!startDate}
          className={cn(
            "py-4 rounded-2xl items-center",
            startDate ? (isDark ? "bg-sage-600" : "bg-sage-500") : (isDark ? "bg-charcoal-700" : "bg-cream-200")
          )}
        >
          <Text className={cn(
            "text-base font-semibold",
            startDate ? "text-white" : isDark ? "text-charcoal-500" : "text-charcoal-400"
          )}>
            Generate Grocery List
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

interface SaveListNameModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  isDark: boolean;
  maxReached: boolean;
}

function SaveListNameModal({ visible, onClose, onSave, isDark, maxReached }: SaveListNameModalProps) {
  const [listName, setListName] = useState('');

  const handleSave = useCallback(() => {
    if (!listName.trim() || maxReached) return;

    onSave(listName.trim());
    setListName('');
    onClose();
  }, [listName, maxReached, onSave, onClose]);

  if (!visible) return null;

  return (
    <View className="absolute inset-0 z-50">
      <Pressable
        onPress={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="absolute bottom-0 left-0 right-0"
      >
        <Animated.View
          entering={FadeInDown.springify()}
          className={cn(
            "rounded-t-3xl p-6 pb-10",
            isDark ? "bg-charcoal-800" : "bg-white"
          )}
        >
          <View className="flex-row items-center justify-between mb-6">
            <Text className={cn(
              "text-xl font-bold",
              isDark ? "text-white" : "text-charcoal-900"
            )}>
              Save Shopping List
            </Text>
            <Pressable onPress={onClose}>
              <X size={24} color={isDark ? '#fff' : '#262626'} />
            </Pressable>
          </View>

          {maxReached ? (
            <View className={cn(
              "p-4 rounded-xl mb-4",
              isDark ? "bg-amber-900/30" : "bg-amber-50"
            )}>
              <Text className={cn(
                "text-sm",
                isDark ? "text-amber-300" : "text-amber-700"
              )}>
                Maximum of 4 shopping lists reached. Delete an existing list to save a new one.
              </Text>
            </View>
          ) : (
            <>
              <View className="mb-6">
                <Text className={cn(
                  "text-sm font-medium mb-2",
                  isDark ? "text-charcoal-300" : "text-charcoal-600"
                )}>
                  List Name
                </Text>
                <TextInput
                  value={listName}
                  onChangeText={setListName}
                  placeholder="e.g., Weekly Shopping"
                  placeholderTextColor={isDark ? '#6d6d6d' : '#888888'}
                  className={cn(
                    "px-4 py-3 rounded-xl text-base",
                    isDark ? "bg-charcoal-700 text-white" : "bg-cream-100 text-charcoal-900"
                  )}
                />
              </View>

              <Pressable
                onPress={handleSave}
                className={cn(
                  "py-4 rounded-2xl items-center",
                  listName.trim() ? "bg-sage-500" : isDark ? "bg-charcoal-700" : "bg-cream-200"
                )}
              >
                <Text className={cn(
                  "text-base font-semibold",
                  listName.trim() ? "text-white" : isDark ? "text-charcoal-500" : "text-charcoal-400"
                )}>
                  Save
                </Text>
              </Pressable>
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

interface SavedListsModalProps {
  visible: boolean;
  onClose: () => void;
  savedLists: SavedGroceryList[];
  onLoadList: (listId: string) => void;
  onDeleteList: (listId: string) => void;
  isDark: boolean;
}

function SavedListsModal({ visible, onClose, savedLists, onLoadList, onDeleteList, isDark }: SavedListsModalProps) {
  if (!visible) return null;

  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 50 }}>
      <Pressable
        onPress={onClose}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)' }}
      />
      <Animated.View
        entering={FadeInDown.springify()}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderTopWidth: 1,
          borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
          paddingHorizontal: 20,
          paddingBottom: 32,
          maxHeight: '85%',
        }}
      >
        {/* Drag handle */}
        <View style={{ alignItems: 'center', paddingTop: 8 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: isDark ? '#2a2a2a' : designTokens.colors.hair2 }} />
        </View>

        {/* Header */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 14,
          paddingBottom: 18,
        }}>
          <Text style={{
            fontFamily: designTokens.font.medium,
            fontSize: t(19, 17),
            color: isDark ? '#fff' : designTokens.colors.ink,
            letterSpacing: t(-0.38, -0.25),
          }}>
            Shopping{' '}
            <Text style={{
              fontFamily: designTokens.font.serifItalic,
              fontStyle: serifItalicFontStyle,
              fontSize: t(22, 19),
              letterSpacing: t(-0.22, -0.15),
            }}>
              lists
            </Text>
            <Text style={{
              fontFamily: designTokens.font.regular,
              fontSize: t(14, 13),
              color: isDark ? '#888' : designTokens.colors.ink3,
            }}>
              {'  '}({savedLists.length}/4)
            </Text>
          </Text>
          <Pressable
            onPress={onClose}
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
            <X size={18} color={isDark ? '#fff' : designTokens.colors.ink} strokeWidth={1.8} />
          </Pressable>
        </View>

        {savedLists.length === 0 ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48 }}>
            <View style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              borderWidth: 1,
              borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <BookmarkCheck size={22} color={isDark ? '#888' : designTokens.colors.ink3} strokeWidth={1.6} />
            </View>
            <Text style={{
              fontFamily: designTokens.font.medium,
              fontSize: 15,
              color: isDark ? '#fff' : designTokens.colors.ink,
              marginTop: 14,
            }}>
              No shopping lists
            </Text>
            <Text style={{
              fontFamily: designTokens.font.regular,
              fontSize: 13,
              color: isDark ? '#888' : designTokens.colors.ink3,
              marginTop: 4,
              textAlign: 'center',
            }}>
              Save your shopping lists for later
            </Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
            {savedLists.map((list, index) => (
              <Animated.View
                key={list.id}
                entering={FadeInDown.delay(index * 50).springify()}
                style={{
                  padding: 14,
                  marginBottom: 10,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                  backgroundColor: isDark ? '#1f1f1f' : designTokens.colors.cream,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 15,
                        color: isDark ? '#fff' : designTokens.colors.ink,
                      }}
                    >
                      {list.name}
                    </Text>
                    <Text style={{
                      fontFamily: designTokens.font.regular,
                      fontSize: 12.5,
                      color: isDark ? '#888' : designTokens.colors.ink2,
                      marginTop: 4,
                    }}>
                      {list.items.length} items · {new Date(list.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        onLoadList(list.id);
                        onClose();
                      }}
                      style={{
                        paddingHorizontal: 14,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: designTokens.colors.brand,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{
                        color: designTokens.colors.cream,
                        fontFamily: designTokens.font.medium,
                        fontSize: 13,
                      }}>
                        Load
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        onDeleteList(list.id);
                      }}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Trash2 size={14} color={isDark ? '#bbb' : designTokens.colors.ink2} strokeWidth={1.8} />
                    </Pressable>
                  </View>
                </View>
              </Animated.View>
            ))}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

export default function GroceryScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isPaused = useIsAccountPaused();
  const openPaywallSheet = useSubscriptionStore((s) => s.openPaywallSheet);
  const hasPremiumAccess = useHasPremiumAccess();
  const isPremiumResolved = useIsPremiumResolved();
  const currentUserId = useAuthStore((s) => s.currentUser?.id);
  const router = useRouter();

  const groceryItems = useMealPlanStore((s) => s.groceryItems);
  const customGroceryItems = useMealPlanStore((s) => s.customGroceryItems);
  const measurementSystem = useMealPlanStore((s) => resolveMeasurementSystem(s.preferences.measurementSystem));
  const savedGroceryLists = useMealPlanStore((s) => s.savedGroceryLists);
  const toggleGroceryItem = useMealPlanStore((s) => s.toggleGroceryItem);
  const toggleCustomGroceryItem = useMealPlanStore((s) => s.toggleCustomGroceryItem);
  const addCustomGroceryItem = useMealPlanStore((s) => s.addCustomGroceryItem);
  const mergeIntoGroceryItem = useMealPlanStore((s) => s.mergeIntoGroceryItem);
  const mergeIntoCurrentSavedListItem = useMealPlanStore((s) => s.mergeIntoCurrentSavedListItem);
  const removeGroceryItem = useMealPlanStore((s) => s.removeGroceryItem);
  const removeCustomGroceryItem = useMealPlanStore((s) => s.removeCustomGroceryItem);
  const updateGroceryItem = useMealPlanStore((s) => s.updateGroceryItem);
  const updateCustomGroceryItem = useMealPlanStore((s) => s.updateCustomGroceryItem);
  const updateCurrentSavedListItem = useMealPlanStore((s) => s.updateCurrentSavedListItem);
  const clearCheckedItems = useMealPlanStore((s) => s.clearCheckedItems);
  const generateGroceryList = useMealPlanStore((s) => s.generateGroceryList);
  const setGroceryDateRange = useMealPlanStore((s) => s.setGroceryDateRange);
  // ─── AUTH-LAST signup gate ───
  // AUTH-FIRST: users create an account before onboarding, so the old
  // anonymous-guest signup gate for grocery builds has been removed.
  const saveGroceryList = useMealPlanStore((s) => s.saveGroceryList);
  const clearGroceryList = useMealPlanStore((s) => s.clearGroceryList);
  const updateSavedGroceryList = useMealPlanStore((s) => s.updateSavedGroceryList);
  const deleteSavedGroceryList = useMealPlanStore((s) => s.deleteSavedGroceryList);
  const loadSavedGroceryList = useMealPlanStore((s) => s.loadSavedGroceryList);
  const unloadSavedGroceryList = useMealPlanStore((s) => s.unloadSavedGroceryList);
  const toggleCurrentSavedListItem = useMealPlanStore((s) => s.toggleCurrentSavedListItem);
  const resetCurrentSavedListChecks = useMealPlanStore((s) => s.resetCurrentSavedListChecks);
  const removeCurrentSavedListItem = useMealPlanStore((s) => s.removeCurrentSavedListItem);
  const addCurrentSavedListItem = useMealPlanStore((s) => s.addCurrentSavedListItem);
  const currentSavedListId = useMealPlanStore((s) => s.currentSavedListId);
  const currentSavedListName = useMealPlanStore((s) => s.currentSavedListName);
  const currentSavedListItems = useMealPlanStore((s) => s.currentSavedListItems);
  const groceryStartDate = useMealPlanStore((s) => s.groceryStartDate);
  const groceryEndDate = useMealPlanStore((s) => s.groceryEndDate);
  const mealSlots = useMealPlanStore((s) => s.mealSlots);
  const similarIngredients = useMealPlanStore((s) => s.similarIngredients);
  const combineSimilarIngredients = useMealPlanStore((s) => s.combineSimilarIngredients);
  const clearSimilarIngredients = useMealPlanStore((s) => s.clearSimilarIngredients);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  // "From Recipes" picker + the "+" source chooser sheet (Meal Plan / Recipes /
  // Manual). The chooser is the persistent entry point once a list exists.
  const [showRecipePicker, setShowRecipePicker] = useState(false);
  const [showSourceChooser, setShowSourceChooser] = useState(false);
  // Refresh confirm sheet + a brief bottom toast (e.g. after saving a list).
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showSavedListsModal, setShowSavedListsModal] = useState(false);
  const [showSaveListModal, setShowSaveListModal] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateIngredientGroup[]>([]);
  // Visibility of the per-category "In basket" sub-section per the design's collapsible pattern.
  const [basketOpen, setBasketOpen] = useState<Record<string, boolean>>({});
  const colors = getThemeColors(isDark);

  // Auto-dismiss the bottom toast after a short beat.
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 2400);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Shared "source card" used by both the empty-state and the "+" chooser sheet:
  // an icon disc, title + subtitle, and a chevron. `disabled` greys it and
  // shows an optional note (e.g. "Generation paused") in place of the chevron.
  const renderSourceCard = ({
    icon,
    iconBg,
    cardBg,
    cardBorderColor,
    title,
    subtitle,
    onPress,
    disabled = false,
    disabledNote,
  }: {
    icon: React.ReactNode;
    iconBg: string;
    cardBg: string;
    cardBorderColor: string;
    title: string;
    subtitle: string;
    onPress: () => void;
    disabled?: boolean;
    disabledNote?: string;
  }) => (
    <Pressable
      key={title}
      onPress={onPress}
      disabled={disabled}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        borderRadius: 18,
        backgroundColor: cardBg,
        borderWidth: 1,
        borderColor: cardBorderColor,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          backgroundColor: iconBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontFamily: designTokens.font.semibold,
            fontSize: 16,
            color: colors.ink,
            letterSpacing: -0.2,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            marginTop: 3,
            fontFamily: designTokens.font.regular,
            fontSize: 13,
            lineHeight: 18,
            color: colors.ink2,
          }}
        >
          {subtitle}
        </Text>
      </View>
      {disabled && disabledNote ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Lock size={13} color={colors.ink3} strokeWidth={1.8} />
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 11.5,
              color: colors.ink3,
            }}
          >
            {disabledNote}
          </Text>
        </View>
      ) : (
        <ChevronRight size={20} color={colors.ink3} strokeWidth={1.8} />
      )}
    </Pressable>
  );

  // Check if we're in saved list mode based on store state
  const isSavedListMode = currentSavedListId !== null;

  const toggleCategoryExpansion = useCallback((category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  }, []);

  // Check if we should automatically open the saved lists modal
  const params = useLocalSearchParams();
  // True while the saved-lists flow was launched from Profile (deep-link via
  // `?showSavedLists`). Used to send the user BACK to Profile when they close
  // the saved list, instead of stranding them on the Grocery tab with the live
  // list (which was confusing).
  const openedFromProfileRef = useRef(false);
  useEffect(() => {
    if (params.showSavedLists) {
      openedFromProfileRef.current = true;
      setShowSavedListsModal(true);
    }
  }, [params.showSavedLists]);

  // Return to Profile when a Profile-launched saved-list view is closed.
  // Navigate to the Profile tab explicitly — router.back() pops to the tab
  // navigator's initial route (Meal Plan), not Profile.
  const returnToProfileIfDeepLinked = useCallback(() => {
    if (openedFromProfileRef.current) {
      openedFromProfileRef.current = false;
      router.navigate('/(tabs)/preferences');
    }
  }, [router]);

  // Saved-list mode is an ephemeral "view this saved list" state (e.g. opened
  // from Profile → Saved shopping lists). When the user leaves the Grocery
  // screen, exit it so coming back shows the live grocery list — not the
  // previously-viewed saved list, which was confusing. Any tick changes are
  // already persisted into savedGroceryLists as they happen, so nothing is lost.
  useFocusEffect(
    useCallback(() => {
      return () => {
        openedFromProfileRef.current = false;
        if (useMealPlanStore.getState().currentSavedListId) {
          useMealPlanStore.getState().unloadSavedGroceryList();
        }
      };
    }, []),
  );


  // Group items by category. Generated (meal) and custom items (including voice-
  // added items) share ONE section per category, so an added item joins the
  // existing category instead of spawning a duplicate header. `customItemIds`
  // lets the row handlers route to the right store action per item.
  const { groupedItems, customItemIds, stats } = useMemo(() => {
    const groups: Record<string, GroceryItem[]> = {};
    const customIds = new Set<string>();

    const push = (item: GroceryItem) => {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    };

    if (isSavedListMode) {
      currentSavedListItems.forEach(push);
    } else {
      groceryItems.forEach(push);
      customGroceryItems.forEach((item) => {
        customIds.add(item.id);
        push(item);
      });
    }

    // Sort within each category: unchecked first (alphabetically), then checked.
    Object.keys(groups).forEach((category) => {
      groups[category].sort((a, b) => {
        if (a.isChecked !== b.isChecked) return a.isChecked ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
    });

    const allItems: GroceryItem[] = isSavedListMode
      ? currentSavedListItems
      : [...groceryItems, ...customGroceryItems];
    const total = allItems.length;
    const checked = allItems.filter((i) => i.isChecked).length;

    return {
      groupedItems: groups,
      customItemIds: customIds,
      stats: { total, checked, remaining: total - checked },
    };
  }, [groceryItems, customGroceryItems, isSavedListMode, currentSavedListItems]);

  // Row dispatchers, hoisted out of the render tree. These were built inline
  // inside the category .map(), so every render of this screen — including ones
  // caused by unrelated local state like modals, date pickers or edit drafts —
  // handed every GroceryItemRow a fresh pair of callbacks and defeated its memo.
  // Routing logic is unchanged; only the identity is now stable.
  const handleToggleItem = useCallback(
    (id: string) =>
      isSavedListMode
        ? toggleCurrentSavedListItem(id)
        : customItemIds.has(id)
          ? toggleCustomGroceryItem(id)
          : toggleGroceryItem(id),
    [
      isSavedListMode,
      customItemIds,
      toggleCurrentSavedListItem,
      toggleCustomGroceryItem,
      toggleGroceryItem,
    ],
  );

  const handleDeleteItem = useCallback(
    (id: string) =>
      isSavedListMode
        ? removeCurrentSavedListItem(id)
        : customItemIds.has(id)
          ? removeCustomGroceryItem(id)
          : removeGroceryItem(id),
    [
      isSavedListMode,
      customItemIds,
      removeCurrentSavedListItem,
      removeCustomGroceryItem,
      removeGroceryItem,
    ],
  );

  // Show completion modal when all items are checked
  useEffect(() => {
    // Only show in saved list mode when all items are checked
    if (isSavedListMode && stats.total > 0 && stats.remaining === 0) {
      setShowCompletionModal(true);
    }
  }, [isSavedListMode, stats.total, stats.remaining]);

  // Detect duplicate ingredients
  useEffect(() => {
    const allItems = isSavedListMode ? currentSavedListItems : [...groceryItems, ...customGroceryItems];
    const duplicates = findDuplicateIngredientGroups(allItems);
    setDuplicateGroups(duplicates);
  }, [groceryItems, customGroceryItems, isSavedListMode, currentSavedListItems]);

  const handleGenerateFromMealPlan = useCallback((startDate: string, endDate: string) => {
    // "Get Groceries" is free with no monthly restriction — no premium gate.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // If we're viewing a saved list, leave saved-list mode first — otherwise the
    // list keeps rendering the saved snapshot (currentSavedListItems) instead of
    // the freshly regenerated full list for the selected period.
    if (isSavedListMode) unloadSavedGroceryList();
    generateGroceryList(startDate, endDate);
    setGroceryDateRange(startDate, endDate);
    track('grocery_list_generated', { source: 'meal_plan', start_date: startDate, end_date: endDate });
  }, [generateGroceryList, setGroceryDateRange, isSavedListMode, unloadSavedGroceryList]);

  const handleCombineDuplicates = useCallback(
    (groupKey: string, selectedIndices: number[], userQuantity: string, userUnit: string) => {
      const group = duplicateGroups.find((g) => g.key === groupKey);
      if (!group || selectedIndices.length < 2) return;

      // Keep the first selected item as the base; the rest are removed after.
      const baseIndex = selectedIndices[0];
      const baseId = group.ingredientIds[baseIndex];
      const baseName = group.names[baseIndex];

      const mergeIndices = selectedIndices.slice(1);
      const idsToRemove = mergeIndices.map((idx) => group.ingredientIds[idx]);

      // Honor the quantity + unit the user confirmed on the Combine screen as
      // the FINAL combined value — the user's manual override must win over the
      // base ingredient's unit. Recompute the base fields from that input so
      // storage stays consistent and (in imperial mode) converts correctly;
      // if the unit isn't convertible (e.g. a custom "bag"), clear the base so
      // the display shows exactly what the user typed.
      const qty = (userQuantity ?? '').trim() || '0';
      const unit = (userUnit ?? '').trim();
      const updates: Partial<GroceryItem> = { quantity: qty, unit };
      try {
        const base = convertToBaseUnit(qty, unit, baseName);
        updates.quantity_base = base.quantity;
        updates.base_unit = base.unit;
      } catch {
        updates.quantity_base = undefined;
        updates.base_unit = undefined;
      }

      if (isSavedListMode) {
        updateCurrentSavedListItem(baseId, updates);
      } else if (customGroceryItems.some((item) => item.id === baseId)) {
        updateCustomGroceryItem(baseId, updates);
      } else {
        updateGroceryItem(baseId, updates);
      }

      // Remove the now-merged duplicates.
      idsToRemove.forEach((id) => {
        if (isSavedListMode) {
          removeCurrentSavedListItem(id);
        } else {
          const isCustom = customGroceryItems.some((item) => item.id === id);
          if (isCustom) {
            removeCustomGroceryItem(id);
          } else {
            removeGroceryItem(id);
          }
        }
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowDuplicateModal(false);
    },
    [
      duplicateGroups,
      isSavedListMode,
      customGroceryItems,
      removeGroceryItem,
      removeCustomGroceryItem,
      removeCurrentSavedListItem,
      updateGroceryItem,
      updateCustomGroceryItem,
      updateCurrentSavedListItem,
    ]
  );

  const handleRefreshGroceryList = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Use the previously selected date range for refresh
    if (!groceryStartDate || !groceryEndDate) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    // Regenerate grocery list with the previously selected date range
    generateGroceryList(groceryStartDate, groceryEndDate);
    track('grocery_list_generated', { source: 'refresh', start_date: groceryStartDate, end_date: groceryEndDate });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [groceryStartDate, groceryEndDate, generateGroceryList]);

  const handleClearChecked = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clearCheckedItems();
  }, [clearCheckedItems]);

  // Format grocery list for sharing
  const formatGroceryListForShare = useCallback(() => {
    if (groceryItems.length === 0) return '';

    let text = '🛒 *Grocery List*\n\n';

    // Group by category
    const grouped: Record<string, GroceryItem[]> = {};
    groceryItems.forEach((item) => {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item);
    });

    // Format each category
    Object.entries(grouped).forEach(([category, items]) => {
      const config = CATEGORY_CONFIG[category as Ingredient['category']] || CATEGORY_CONFIG.other;
      text += `*${config.label}*\n`;
      items.forEach((item) => {
        const checkbox = item.isChecked ? '✅' : '⬜';
        text += `${checkbox} ${groceryQuantityLabel(item, measurementSystem)} ${item.name}\n`;
      });
      text += '\n';
    });

    return text.trim();
  }, [groceryItems, measurementSystem]);

  // Format saved list for sharing (includes checked/completed status)
  const formatSavedListForShare = useCallback(() => {
    if (currentSavedListItems.length === 0) return '';

    let text = `🛒 *${currentSavedListName || 'Saved List'}*\n\n`;

    // Group by category
    const grouped: Record<string, GroceryItem[]> = {};
    currentSavedListItems.forEach((item) => {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item);
    });

    // Format each category
    Object.entries(grouped).forEach(([category, items]) => {
      const config = CATEGORY_CONFIG[category as Ingredient['category']] || CATEGORY_CONFIG.other;
      text += `*${config.label}*\n`;
      items.forEach((item) => {
        const checkbox = item.isChecked ? '✅' : '⬜';
        text += `${checkbox} ${groceryQuantityLabel(item, measurementSystem)} ${item.name}\n`;
      });
      text += '\n';
    });

    return text.trim();
  }, [currentSavedListItems, currentSavedListName, measurementSystem]);

  const handleShareWhatsApp = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const text = formatGroceryListForShare();
    if (!text) return;

    try {
      // Use the native share sheet - user can select WhatsApp from there
      await Share.share({
        message: text,
      });
    } catch (error) {
      reportAndPresent(error, { feature: 'share' });
    }
  }, [formatGroceryListForShare]);

  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Use saved list format when in saved list mode
    const text = isSavedListMode ? formatSavedListForShare() : formatGroceryListForShare();
    if (!text) return;

    try {
      await Share.share({
        message: text,
      });
    } catch (error) {
      reportAndPresent(error, { feature: 'share' });
    }
  }, [isSavedListMode, formatSavedListForShare, formatGroceryListForShare]);

  // ── Derived helpers ─────────────────────────────────────────────
  const hasAnyItems = isSavedListMode
    ? currentSavedListItems.length > 0
    : groceryItems.length > 0 || customGroceryItems.length > 0;
  // The three top-right header buttons (saved lists, share, add) are greyed out
  // until the first grocery list exists — the empty-state cards are how the user
  // makes that first add.
  const controlsDisabled = !isSavedListMode && !hasAnyItems;

  // ── Subtitle text under the title ───────────────────────────────
  let subtitleText = '';
  if (isSavedListMode) {
    subtitleText = `${stats.total} item${stats.total === 1 ? '' : 's'} saved`;
  } else if (groceryStartDate && groceryEndDate && hasAnyItems) {
    // Inclusive number of days the grocery list was built for. Normalise to
    // midnight so time-of-day / DST never skews the count.
    const start = new Date(groceryStartDate);
    const end = new Date(groceryEndDate);
    const startMid = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endMid = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const dayCount = Math.max(
      1,
      Math.round((endMid.getTime() - startMid.getTime()) / 86400000) + 1,
    );
    subtitleText = stats.total > 0
      ? `${stats.total} item${stats.total === 1 ? '' : 's'} for ${dayCount} day${dayCount === 1 ? '' : 's'} meal.`
      : '';
  } else if (hasAnyItems) {
    subtitleText = `${stats.total} item${stats.total === 1 ? '' : 's'} in your list.`;
  } else {
    subtitleText = 'Your shopping list lives here.';
  }

  // ── Single category section renderer (used for both meal + custom) ──
  const renderCategorySection = (
    category: string,
    items: GroceryItem[],
    onToggle: (id: string) => void,
    onDelete: (id: string) => void,
    expansionKey: string,
    delayIdx: number,
  ) => {
    const config = CATEGORY_CONFIG[category as Ingredient['category']] || CATEGORY_CONFIG.other;
    // In dark mode the static cream tints (`#EEE9DC`, etc.) bleach the icon
    // into the tile; use a theme-aware tint so the warm hue is preserved
    // but stays distinct against a dark card surface.
    const themedTints = getCategoryTint(isDark);
    const tint = themedTints[category as Ingredient['category']] || themedTints.other;
    const Icon = config.icon;

    const allChecked = items.length > 0 && items.every((i) => i.isChecked);
    const isExpanded = allChecked
      ? expandedCategories[expansionKey] === true
      : expandedCategories[expansionKey] !== false;

    const activeItems = items.filter((i) => !i.isChecked);
    const basketItems = items.filter((i) => i.isChecked);
    const basketKey = `basket-${expansionKey}`;
    const isBasketOpen = !!basketOpen[basketKey];

    return (
      <Animated.View
        key={expansionKey}
        entering={FadeInDown.delay(250 + delayIdx * 40).springify()}
        style={{
          backgroundColor: colors.bg,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.hair,
          ...(!isDark ? elevation.card : {}),
        }}
      >
        <Pressable
          onPress={() => toggleCategoryExpansion(expansionKey)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 14,
            paddingHorizontal: 14,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              backgroundColor: tint,
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon size={18} color={config.color} strokeWidth={1.7} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 15.5,
                color: colors.ink,
                letterSpacing: -0.155,
                lineHeight: 19,
              }}
            >
              {config.label}
            </Text>
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 12.5,
                color: colors.ink3,
                marginTop: 1,
              }}
            >
              {activeItems.length === 0
                ? (isSavedListMode ? 'All purchased ✓' : 'All at home ✓')
                : `${activeItems.length} ${isSavedListMode ? 'left' : 'to review'}${
                    basketItems.length > 0 ? ` · ${basketItems.length} ${isSavedListMode ? 'purchased' : 'at home'}` : ''
                  }`}
            </Text>
          </View>
          <View
            style={{
              transform: [{ rotate: isExpanded ? '90deg' : '0deg' }],
            }}
          >
            <ChevronRight size={16} color={designTokens.colors.ink3} strokeWidth={1.7} />
          </View>
        </Pressable>

        {isExpanded && (activeItems.length > 0 || basketItems.length > 0) && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
            {activeItems.length > 0 && (
              <View>
                {activeItems.map((item, idx) => (
                  <GroceryItemRow
                    key={item.id}
                    item={item}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    isDark={isDark}
                    index={idx}
                    checkColor={isSavedListMode ? designTokens.colors.brand : designTokens.colors.olive}
                  />
                ))}
              </View>
            )}
            {basketItems.length > 0 && (
              <View
                style={{
                  borderTopWidth: activeItems.length > 0 ? 1 : 0,
                  borderTopColor: colors.hair2,
                  marginTop: activeItems.length > 0 ? 4 : 0,
                }}
              >
                <Pressable
                  onPress={() => setBasketOpen((p) => ({ ...p, [basketKey]: !p[basketKey] }))}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingTop: 12,
                    paddingBottom: 10,
                  }}
                >
                  {isSavedListMode
                    ? <ShoppingCart size={13} color={designTokens.colors.ink3} strokeWidth={1.7} />
                    : <Home size={13} color={designTokens.colors.ink3} strokeWidth={1.7} />
                  }
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 11.5,
                      letterSpacing: 0.46,
                      textTransform: 'uppercase',
                      color: colors.ink3,
                    }}
                  >
                    {isSavedListMode ? 'Purchased' : 'At home'} · {basketItems.length}
                  </Text>
                  <ChevronDown
                    size={13}
                    color={designTokens.colors.ink3}
                    strokeWidth={1.7}
                    style={{
                      transform: [{ rotate: isBasketOpen ? '180deg' : '0deg' }],
                    }}
                  />
                </Pressable>
                {isBasketOpen &&
                  basketItems.map((item, idx) => (
                    <GroceryItemRow
                      key={item.id}
                      item={item}
                      onToggle={onToggle}
                      onDelete={onDelete}
                      isDark={isDark}
                      index={idx}
                      checkColor={isSavedListMode ? designTokens.colors.brand : designTokens.colors.olive}
                    />
                  ))}
              </View>
            )}
          </View>
        )}
      </Animated.View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? '#1a1a1a' : colors.bg, position: 'relative' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100 }}
        >
          {/* ── Header ───────────────────────────────────────── */}
          <Animated.View
            entering={FadeInDown.delay(50).springify()}
            style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 14 }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flex: 1, paddingRight: 12, minWidth: 0 }}>
                {isSavedListMode ? (
                  <Text
                    style={{
                      fontFamily: designTokens.font.serifItalic,
                      fontStyle: serifItalicFontStyle,
                      fontSize: t(32, 28),
                      color: colors.ink,
                      letterSpacing: t(-0.64, -0.5),
                      lineHeight: t(40, 34),
                    }}
                    numberOfLines={1}
                  >
                    {currentSavedListName || 'Saved list'}
                  </Text>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' }}>
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
                      Groceries
                    </Text>
                  </View>
                )}
                {subtitleText ? (
                  <Text
                    style={{
                      marginTop: t(6, 4),
                      fontFamily: designTokens.font.regular,
                      fontSize: t(14.5, 13.5),
                      color: colors.ink2,
                      lineHeight: t(20, 18),
                    }}
                  >
                    {subtitleText}
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                {isSavedListMode ? (
                  /* Saved-list mode: Close X (unload) */
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      unloadSavedGroceryList();
                      // If this saved list was opened from Profile, return there
                      // rather than dropping onto the live Grocery list.
                      returnToProfileIfDeepLinked();
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
                ) : null}
                {/* Close (live list only) — clears the current list and returns
                    to the grocery build screen. Shown whenever a list exists. */}
                {!isSavedListMode && hasAnyItems && (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowCloseConfirm(true);
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
                    accessibilityLabel="Close grocery list"
                  >
                    <X size={18} color={colors.ink} strokeWidth={1.7} />
                  </Pressable>
                )}
                {!isSavedListMode && (
                  /* Normal mode: Saved lists */
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowSavedListsModal(true);
                    }}
                    disabled={controlsDisabled}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.hair,
                      backgroundColor: colors.bg,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: controlsDisabled ? 0.4 : 1,
                    }}
                  >
                    <BookmarkCheck size={18} color={colors.ink} strokeWidth={1.7} />
                  </Pressable>
                )}
                {/* Share list */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    handleShare();
                  }}
                  disabled={!hasAnyItems}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: colors.hair,
                    backgroundColor: colors.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: hasAnyItems ? 1 : 0.4,
                  }}
                >
                  <Share2 size={18} color={colors.ink} strokeWidth={1.7} />
                </Pressable>
                {/* Plus — warm charcoal→brown gradient, cream icon. On the live
                    grocery list it opens the source chooser (Meal Plan / Recipes
                    / Manual); on a saved shopping list it opens Add manual
                    directly. Greyed until the first list exists. */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    if (isSavedListMode) setShowAddModal(true);
                    else setShowSourceChooser(true);
                  }}
                  disabled={controlsDisabled}
                  style={{ width: 40, height: 40, borderRadius: 999, overflow: 'hidden', opacity: controlsDisabled ? 0.4 : 1 }}
                >
                  <LinearGradient
                    colors={['#181612', '#2d1811']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Plus size={20} color={designTokens.colors.cream} strokeWidth={1.8} />
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </Animated.View>

          {/* ── Pantry-check meter ────────────────────── */}
          {/* Replaces the old charcoal hero card AND the dismissible "tap items
              you already have" banner — both said the same thing, and the card
              spent 250px reporting a 0% that means nothing before you start.
              The instruction now lives inside the meter and retires itself on
              the first tap. */}
          {stats.total > 0 && (
            <Animated.View
              entering={FadeInDown.delay(120).springify()}
              style={{ paddingHorizontal: 16, paddingBottom: 18 }}
            >
              <PantryProgress
                total={stats.total}
                checked={stats.checked}
                mode={isSavedListMode ? 'shopping' : 'pantry'}
                onSave={() => setShowSaveListModal(true)}
                onReset={resetCurrentSavedListChecks}
                isDark={isDark}
              />
            </Animated.View>
          )}

          {/* ── Recipe slider — the recipes this list was built from, under the
              Pantry Check card. Self-hides when there are no source recipes.
              Live add/delete recomputes the ingredient list. */}
          {!isSavedListMode && (
            <GroceryRecipeStrip
              isDark={isDark}
              onAddRecipes={() => setShowRecipePicker(true)}
            />
          )}

          {/* ── Duplicate ingredients banner (existing component, in section padding) ── */}
          {duplicateGroups.length > 0 && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 18 }}>
              <DuplicateIngredientBanner
                groupCount={duplicateGroups.length}
                totalDuplicates={duplicateGroups.reduce((sum, g) => sum + g.ingredientIds.length - 1, 0)}
                onPress={() => setShowDuplicateModal(true)}
                isDark={isDark}
              />
            </View>
          )}

          {/* ── Section title ─────────────────────────────────── */}
          {hasAnyItems && (
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
                  fontSize: t(18, 16),
                  color: colors.ink,
                  letterSpacing: t(-0.36, -0.25),
                }}
              >
                {isSavedListMode ? 'Shopping list' : 'Ingredients'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12.5,
                    color: colors.ink2,
                  }}
                >
                  By aisle
                </Text>
                <ChevronDown size={13} color={designTokens.colors.ink2} strokeWidth={1.6} />
              </View>
            </View>
          )}

          {/* ── Category sections OR empty state ─────────────── */}
          {hasAnyItems ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 18, gap: 10 }}>
              {/* One section per category — generated + custom items merged, so
                  added/voice items join the existing category instead of
                  creating a duplicate header. Handlers route per item. */}
              {Object.entries(groupedItems).map(([category, items], idx) =>
                renderCategorySection(
                  category,
                  items,
                  handleToggleItem,
                  handleDeleteItem,
                  `cat-${category}`,
                  idx,
                ),
              )}

              {/* Bottom "Add a custom item" dashed pill */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowAddModal(true);
                }}
                style={{
                  marginTop: 4,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: colors.hair,
                  backgroundColor: colors.bg,
                }}
              >
                <Plus size={16} color={colors.ink} strokeWidth={1.7} />
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 14,
                    color: colors.ink,
                    letterSpacing: -0.14,
                  }}
                >
                  Add a custom item
                </Text>
              </Pressable>
            </View>
          ) : (
            <Animated.View
              entering={FadeInDown.delay(220).springify()}
              style={{ paddingTop: 40, paddingBottom: 40, paddingHorizontal: 20 }}
            >
              {/* Cart + heading */}
              <View style={{ alignItems: 'center', marginBottom: 26 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: colors.hair,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                  }}
                >
                  <ShoppingCart size={26} color={designTokens.colors.ink3} strokeWidth={1.6} />
                </View>
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 19,
                    color: colors.ink,
                    letterSpacing: -0.3,
                  }}
                >
                  Your list is empty
                </Text>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 14,
                    lineHeight: 20,
                    color: colors.ink3,
                    marginTop: 6,
                    textAlign: 'center',
                    maxWidth: 260,
                  }}
                >
                  Let's build your grocery list in a way that works for you.
                </Text>
              </View>

              {/* Three source cards */}
              <View style={{ gap: 12 }}>
                {renderSourceCard({
                  icon: <Calendar size={22} color={designTokens.colors.cream} strokeWidth={1.9} />,
                  iconBg: designTokens.colors.brand,
                  cardBg: isDark ? 'rgba(84,100,69,0.14)' : 'rgba(84,100,69,0.06)',
                  cardBorderColor: isDark ? 'rgba(139,155,120,0.22)' : 'rgba(84,100,69,0.14)',
                  title: 'From Meal Plan',
                  subtitle: 'Add all ingredients from your planned meals',
                  disabled: isPaused,
                  disabledNote: isPaused ? 'Generation paused' : undefined,
                  onPress: () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowDatePicker(true);
                  },
                })}
                {renderSourceCard({
                  icon: <BookOpen size={22} color={designTokens.colors.cream} strokeWidth={1.9} />,
                  iconBg: designTokens.colors.olive,
                  cardBg: isDark ? 'rgba(228,109,70,0.12)' : '#FFF5F0',
                  cardBorderColor: isDark ? 'rgba(228,109,70,0.22)' : '#FCDDD0',
                  title: 'From Recipes',
                  subtitle: 'Pick recipes and add the ingredients you need',
                  onPress: () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowRecipePicker(true);
                  },
                })}
                {renderSourceCard({
                  icon: <Pencil size={20} color={designTokens.colors.cream} strokeWidth={1.9} />,
                  iconBg: '#201C17',
                  cardBg: colors.hair2,
                  cardBorderColor: colors.hair,
                  title: 'Add Manually',
                  subtitle: 'Add any item to your list manually',
                  onPress: () => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowAddModal(true);
                  },
                })}
              </View>
            </Animated.View>
          )}
        </ScrollView>


      </SafeAreaView>

      {/* Close confirm — clears the live list and returns to the build screen */}
      {showCloseConfirm && (
        <View
          className="absolute inset-0 z-50"
          style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
        >
          <Pressable
            onPress={() => setShowCloseConfirm(false)}
            className="absolute inset-0 bg-black/50"
          />
          <View
            style={{
              width: '100%',
              maxWidth: 340,
              backgroundColor: colors.bg,
              borderRadius: 22,
              padding: 22,
              ...elevation.card,
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
              Close this grocery list?
            </Text>
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 14,
                lineHeight: 20,
                color: colors.ink2,
                marginTop: 8,
              }}
            >
              This clears the current list and takes you back to build a new one. Save it first if you want to keep it.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Pressable
                onPress={() => setShowCloseConfirm(false)}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: colors.hair,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontFamily: designTokens.font.medium, fontSize: 14.5, color: colors.ink }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowCloseConfirm(false);
                  clearGroceryList();
                }}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  borderRadius: 14,
                  backgroundColor: designTokens.colors.olive,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontFamily: designTokens.font.medium, fontSize: 14.5, color: '#fff' }}>
                  Close list
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Brief bottom toast (save confirmation, list updated, …) */}
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
              ...elevation.card,
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



      {/* Add Item Modal */}
      <AddItemModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={isSavedListMode ? addCurrentSavedListItem : addCustomGroceryItem}
        onMerge={isSavedListMode ? mergeIntoCurrentSavedListItem : mergeIntoGroceryItem}
        isDark={isDark}
        existingItems={isSavedListMode ? currentSavedListItems : [...groceryItems, ...customGroceryItems]}
        groceryItems={isSavedListMode ? currentSavedListItems : groceryItems}
      />

      {/* Date Range Picker Modal */}
      <DateRangePickerModal
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onGenerate={handleGenerateFromMealPlan}
        isDark={isDark}
        mealSlots={mealSlots}
      />

      {/* From Recipes — multi-select library picker → addRecipesToGroceryList */}
      <GroceryRecipePicker
        visible={showRecipePicker}
        isDark={isDark}
        onClose={() => setShowRecipePicker(false)}
      />

      {/* "+" source chooser sheet — the persistent entry point once a list
          exists. Same three sources as the empty state. */}
      {showSourceChooser && (
        <View className="absolute inset-0 z-50">
          <Pressable
            onPress={() => setShowSourceChooser(false)}
            className="absolute inset-0 bg-black/50"
          />
          <Animated.View
            entering={FadeInDown.springify()}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: colors.bg,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingHorizontal: 20,
              paddingTop: 10,
              paddingBottom: 34,
            }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 40,
                height: 4,
                borderRadius: 999,
                backgroundColor: colors.hair,
                marginBottom: 16,
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 18,
                  color: colors.ink,
                  letterSpacing: -0.3,
                }}
              >
                Add to list
              </Text>
              <Pressable onPress={() => setShowSourceChooser(false)} hitSlop={8}>
                <X size={20} color={colors.ink3} strokeWidth={1.8} />
              </Pressable>
            </View>
            <View style={{ gap: 12 }}>
              {renderSourceCard({
                icon: <Calendar size={22} color={designTokens.colors.cream} strokeWidth={1.9} />,
                iconBg: designTokens.colors.brand,
                cardBg: isDark ? 'rgba(84,100,69,0.14)' : 'rgba(84,100,69,0.06)',
                cardBorderColor: isDark ? 'rgba(139,155,120,0.22)' : 'rgba(84,100,69,0.14)',
                title: 'From Meal Plan',
                subtitle: 'Add all ingredients from your planned meals',
                disabled: isPaused,
                disabledNote: isPaused ? 'Generation paused' : undefined,
                onPress: () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowSourceChooser(false);
                  setShowDatePicker(true);
                },
              })}
              {renderSourceCard({
                icon: <BookOpen size={22} color={designTokens.colors.cream} strokeWidth={1.9} />,
                iconBg: designTokens.colors.olive,
                cardBg: isDark ? 'rgba(228,109,70,0.12)' : '#FFF5F0',
                cardBorderColor: isDark ? 'rgba(228,109,70,0.22)' : '#FCDDD0',
                title: 'From Recipes',
                subtitle: 'Pick recipes and add the ingredients you need',
                onPress: () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowSourceChooser(false);
                  setShowRecipePicker(true);
                },
              })}
              {renderSourceCard({
                icon: <Pencil size={20} color={designTokens.colors.cream} strokeWidth={1.9} />,
                iconBg: '#201C17',
                cardBg: colors.hair2,
                cardBorderColor: colors.hair,
                title: 'Add Manually',
                subtitle: 'Add any item to your list manually',
                onPress: () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowSourceChooser(false);
                  setShowAddModal(true);
                },
              })}
            </View>
          </Animated.View>
        </View>
      )}

      {/* Save Shopping List Name Modal */}
      <SaveListNameModal
        visible={showSaveListModal}
        onClose={() => setShowSaveListModal(false)}
        onSave={(name) => {
          // Save a copy as a shopping list but KEEP the live grocery list and
          // stay on this page (no auto-switch into the saved list). The saved
          // copy is reachable via the bookmark (Saved lists) button.
          const success = saveGroceryList(name);
          if (success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setShowSaveListModal(false);
            setToastMsg(`Saved to “${name}”`);
          } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
        }}
        isDark={isDark}
        maxReached={savedGroceryLists.length >= 4}
      />

      {/* Shopping Lists Modal */}
      <SavedListsModal
        visible={showSavedListsModal}
        onClose={() => {
          setShowSavedListsModal(false);
          // Tapping a list calls onLoadList THEN onClose, so a loaded list has
          // currentSavedListId set — in that case stay to view it (the X will
          // return to Profile later). If closed WITHOUT loading, go back now.
          if (!useMealPlanStore.getState().currentSavedListId) {
            returnToProfileIfDeepLinked();
          }
        }}
        savedLists={savedGroceryLists}
        onLoadList={(listId) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          loadSavedGroceryList(listId);
        }}
        onDeleteList={(listId) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          deleteSavedGroceryList(listId);
        }}
        isDark={isDark}
      />

      {/* Duplicate Ingredient Modal */}
      <DuplicateIngredientModal
        visible={showDuplicateModal}
        onClose={() => setShowDuplicateModal(false)}
        groups={duplicateGroups}
        onCombine={handleCombineDuplicates}
        isDark={isDark}
      />


      {/* Shopping List Completion Modal */}
      <ShoppingListCompletionModal
        visible={showCompletionModal}
        onClose={() => setShowCompletionModal(false)}
        onProceedToCheckout={() => {
          setShowCompletionModal(false);
          // User can proceed to checkout or continue shopping
          // For now, just close the modal
        }}
        isDark={isDark}
      />

    </View>
  );
}
