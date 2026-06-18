import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Share, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ShoppingCart,
  Plus,
  Check,
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
  RotateCcw,
  Save,
  BookmarkCheck,
  Lightbulb,
  Leaf,
  Home,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInRight,
  FadeOutRight,
  Layout,
  withRepeat,
  withTiming,
  withSequence,
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useMealPlanStore, type GroceryItem, type Ingredient, type SavedGroceryList } from '@/lib/store';
import { useAuthStore } from '@/lib/auth-store';
import { useIsAccountPaused, useSubscriptionStore, useHasPremiumAccess, useIsPremiumResolved } from '@/lib/subscription-store';
import { useColorScheme } from '@/lib/useColorScheme';
import { cn } from '@/lib/cn';
import { designTokens, getThemeColors, getCategoryTint, elevation } from '@/lib/design-tokens';
import { ShoppingListCompletionModal } from '@/components/ShoppingListCompletionModal';
import { DuplicateIngredientBanner, DuplicateIngredientModal } from '@/components/DuplicateIngredientModal';
import { findDuplicateIngredientGroups, type DuplicateIngredientGroup } from '@/lib/duplicate-ingredient-finder';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

interface GroceryItemRowProps {
  item: GroceryItem;
  onToggle: () => void;
  onDelete: () => void;
  isDark: boolean;
  index: number;
  checkColor?: string;
}

function GroceryItemRow({ item, onToggle, onDelete, isDark, index, checkColor }: GroceryItemRowProps) {
  const colors = getThemeColors(isDark);

  const handleToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle();
  }, [onToggle]);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDelete();
  }, [onDelete]);

  const done = item.isChecked;

  return (
    <Animated.View
      entering={FadeInRight.delay(index * 30).springify()}
      exiting={FadeOutRight.springify()}
      layout={Layout.springify()}
    >
      <Pressable
        onPress={handleToggle}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingVertical: 12,
          paddingHorizontal: 4,
        }}
      >
        {/* Checkbox — design's 26×26 rounded-9, hair border or brand fill */}
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 9,
            borderWidth: done ? 0 : 1.5,
            borderColor: colors.hair,
            backgroundColor: done ? (checkColor || designTokens.colors.brand) : colors.bg,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {done && <Check size={15} color="#fff" strokeWidth={2.6} />}
        </View>

        {/* Item details */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 15.5,
              color: done ? designTokens.colors.ink3 : colors.ink,
              letterSpacing: -0.155,
              lineHeight: 20,
              textDecorationLine: done ? 'line-through' : 'none',
              textDecorationColor: designTokens.colors.ink3,
            }}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 12.5,
              color: done ? designTokens.colors.ink3 : designTokens.colors.ink2,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {item.quantity}{item.unit ? ` ${item.unit}` : ''}
          </Text>
        </View>

        {/* Delete (small, ink3) */}
        <Pressable onPress={handleDelete} hitSlop={8} style={{ padding: 4 }}>
          <Trash2 size={15} color={designTokens.colors.ink3} strokeWidth={1.6} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
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
  }, []);

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

          {/* Category */}
          <View className="mb-6">
            <Text className={cn("text-sm font-medium mb-2", labelText)}>Category</Text>
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
            fontSize: 19,
            color: isDark ? '#fff' : designTokens.colors.ink,
            letterSpacing: -0.38,
          }}>
            Shopping{' '}
            <Text style={{
              fontFamily: designTokens.font.serifItalic,
              fontStyle: 'italic',
              fontSize: 22,
              letterSpacing: -0.22,
            }}>
              lists
            </Text>
            <Text style={{
              fontFamily: designTokens.font.regular,
              fontSize: 14,
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
  const savedGroceryLists = useMealPlanStore((s) => s.savedGroceryLists);
  const toggleGroceryItem = useMealPlanStore((s) => s.toggleGroceryItem);
  const toggleCustomGroceryItem = useMealPlanStore((s) => s.toggleCustomGroceryItem);
  const addCustomGroceryItem = useMealPlanStore((s) => s.addCustomGroceryItem);
  const mergeIntoGroceryItem = useMealPlanStore((s) => s.mergeIntoGroceryItem);
  const mergeIntoCurrentSavedListItem = useMealPlanStore((s) => s.mergeIntoCurrentSavedListItem);
  const removeGroceryItem = useMealPlanStore((s) => s.removeGroceryItem);
  const removeCustomGroceryItem = useMealPlanStore((s) => s.removeCustomGroceryItem);
  const clearCheckedItems = useMealPlanStore((s) => s.clearCheckedItems);
  const generateGroceryList = useMealPlanStore((s) => s.generateGroceryList);
  const setGroceryDateRange = useMealPlanStore((s) => s.setGroceryDateRange);
  // ─── AUTH-LAST signup gate ───
  // Gate fires once the anonymous guest has built their first plan.
  // Any subsequent interaction (including grocery) sends them to signup.
  const isAnonymous = useAuthStore((s) => s.isAnonymous);
  const freePlanBuildsUsed = useMealPlanStore(
    (s) => s.preferences.freePlanBuildsUsed ?? 0,
  );
  const freeGroceryBuildsUsed = useMealPlanStore(
    (s) => s.preferences.freeGroceryBuildsUsed ?? 0,
  );
  const markFreeGatedAction = useMealPlanStore((s) => s.markFreeGatedAction);
  const shouldGateSignup =
    isAnonymous && freePlanBuildsUsed >= 1 && freeGroceryBuildsUsed >= 1;
  const saveGroceryList = useMealPlanStore((s) => s.saveGroceryList);
  const saveAndClearCheckedItems = useMealPlanStore((s) => s.saveAndClearCheckedItems);
  const updateSavedGroceryList = useMealPlanStore((s) => s.updateSavedGroceryList);
  const deleteSavedGroceryList = useMealPlanStore((s) => s.deleteSavedGroceryList);
  const loadSavedGroceryList = useMealPlanStore((s) => s.loadSavedGroceryList);
  const unloadSavedGroceryList = useMealPlanStore((s) => s.unloadSavedGroceryList);
  const toggleCurrentSavedListItem = useMealPlanStore((s) => s.toggleCurrentSavedListItem);
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
  const [showSavedListsModal, setShowSavedListsModal] = useState(false);
  const [showSaveListModal, setShowSaveListModal] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateIngredientGroup[]>([]);
  // Visibility of the per-category "In basket" sub-section per the design's collapsible pattern.
  const [basketOpen, setBasketOpen] = useState<Record<string, boolean>>({});
  // Contextual helper pill — shows once, dismissed permanently via AsyncStorage
  const [showHelperPill, setShowHelperPill] = useState(false);

  // Load helper pill visibility from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem('pantry-check-pill-dismissed').then((val) => {
      if (val !== 'true') setShowHelperPill(true);
    });
  }, []);


  const dismissHelperPill = useCallback(() => {
    setShowHelperPill(false);
    AsyncStorage.setItem('pantry-check-pill-dismissed', 'true');
  }, []);

  const colors = getThemeColors(isDark);

  // Check if we're in saved list mode based on store state
  const isSavedListMode = currentSavedListId !== null;

  // Glow animation for the percentage circle
  const glowOpacity = useSharedValue(0.4);
  useEffect(() => {
    glowOpacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1500 }),
        withTiming(0.4, { duration: 1500 })
      ),
      -1,
      true
    );
  }, [glowOpacity]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: 1 + (glowOpacity.value - 0.4) * 0.25 }],
  }));

  const toggleCategoryExpansion = useCallback((category: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  }, []);

  // Check if we should automatically open the saved lists modal
  const params = useLocalSearchParams();
  useEffect(() => {
    if (params.showSavedLists) {
      setShowSavedListsModal(true);
    }
  }, [params.showSavedLists]);


  // Group items by category - separate generated and custom OR show saved list items
  const { groupedMealItems, groupedCustomItems, stats } = useMemo(() => {
    const mealGroups: Record<string, GroceryItem[]> = {};
    const customGroups: Record<string, GroceryItem[]> = {};

    // If in saved list mode, only show currentSavedListItems in customGroups
    if (isSavedListMode) {
      currentSavedListItems.forEach((item) => {
        if (!customGroups[item.category]) {
          customGroups[item.category] = [];
        }
        customGroups[item.category].push(item);
      });
    } else {
      // Normal mode: show grocery items and custom items
      groceryItems.forEach((item) => {
        if (!mealGroups[item.category]) {
          mealGroups[item.category] = [];
        }
        mealGroups[item.category].push(item);
      });

      customGroceryItems.forEach((item) => {
        if (!customGroups[item.category]) {
          customGroups[item.category] = [];
        }
        customGroups[item.category].push(item);
      });
    }

    // Sort items within each category: unchecked first (alphabetically), then checked (alphabetically)
    Object.keys(mealGroups).forEach((category) => {
      mealGroups[category].sort((a, b) => {
        // First, separate unchecked from checked
        if (a.isChecked !== b.isChecked) {
          return a.isChecked ? 1 : -1;
        }
        // Then, sort alphabetically within each group
        return a.name.localeCompare(b.name);
      });
    });

    Object.keys(customGroups).forEach((category) => {
      customGroups[category].sort((a, b) => {
        // First, separate unchecked from checked
        if (a.isChecked !== b.isChecked) {
          return a.isChecked ? 1 : -1;
        }
        // Then, sort alphabetically within each group
        return a.name.localeCompare(b.name);
      });
    });

    // Calculate stats based on which mode we're in
    let allItems: GroceryItem[] = [];
    if (isSavedListMode) {
      allItems = currentSavedListItems;
    } else {
      allItems = [...groceryItems, ...customGroceryItems];
    }

    const total = allItems.length;
    const checked = allItems.filter((i) => i.isChecked).length;

    return {
      groupedMealItems: mealGroups,
      groupedCustomItems: customGroups,
      stats: { total, checked, remaining: total - checked },
    };
  }, [groceryItems, customGroceryItems, isSavedListMode, currentSavedListItems]);

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
    // Signup gate: an anonymous guest who has already built BOTH a plan and a
    // grocery list is sent to signup before building another.
    if (shouldGateSignup) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/signup');
      return;
    }
    // "Get Groceries" is free with no monthly restriction — no premium gate.
    // (The signup gate above still applies to anonymous guests.)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    generateGroceryList(startDate, endDate);
    setGroceryDateRange(startDate, endDate);
    // Mark the grocery feature used (only matters while anonymous).
    if (isAnonymous) markFreeGatedAction('grocery');
  }, [generateGroceryList, setGroceryDateRange, isAnonymous, shouldGateSignup, hasPremiumAccess, isPremiumResolved, currentUserId, openPaywallSheet, freeGroceryBuildsUsed, markFreeGatedAction, router]);

  const handleCombineDuplicates = useCallback(
    (groupKey: string, selectedIndices: number[]) => {
      const group = duplicateGroups.find((g) => g.key === groupKey);
      if (!group || selectedIndices.length === 0) return;

      // Use the first selected index as the base item
      const baseIndex = selectedIndices[0];
      const baseId = group.ingredientIds[baseIndex];
      const baseQuantity = parseFloat(group.quantities[baseIndex]) || 0;
      const baseUnit = group.units[baseIndex];

      // Get IDs to remove (all selected except the first one)
      const idsToRemove = selectedIndices.slice(1).map((idx) => group.ingredientIds[idx]);

      // Sum quantities from all selected items
      let totalQuantity = baseQuantity;
      for (let i = 1; i < selectedIndices.length; i++) {
        const qty = parseFloat(group.quantities[selectedIndices[i]]) || 0;
        totalQuantity += qty;
      }

      // Determine if it's a generated item or custom item
      const isGenerated = isSavedListMode
        ? false
        : groceryItems.some((item) => item.id === baseId);

      // Remove the duplicate items
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

      // Update the base item with combined quantity
      if (isSavedListMode) {
        mergeIntoCurrentSavedListItem(baseId, totalQuantity.toString(), baseUnit);
      } else if (isGenerated) {
        mergeIntoGroceryItem(baseId, totalQuantity.toString(), baseUnit);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowDuplicateModal(false);
    },
    [
      duplicateGroups,
      isSavedListMode,
      groceryItems,
      customGroceryItems,
      removeGroceryItem,
      removeCustomGroceryItem,
      removeCurrentSavedListItem,
      mergeIntoGroceryItem,
      mergeIntoCurrentSavedListItem,
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
        text += `${checkbox} ${item.quantity}${item.unit ? ` ${item.unit}` : ''} ${item.name}\n`;
      });
      text += '\n';
    });

    return text.trim();
  }, [groceryItems]);

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
        text += `${checkbox} ${item.quantity}${item.unit ? ` ${item.unit}` : ''} ${item.name}\n`;
      });
      text += '\n';
    });

    return text.trim();
  }, [currentSavedListItems, currentSavedListName]);

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
      console.error('Error sharing:', error);
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
      console.error('Error sharing:', error);
    }
  }, [isSavedListMode, formatSavedListForShare, formatGroceryListForShare]);

  // ── Derived helpers ─────────────────────────────────────────────
  const hasAnyItems = isSavedListMode
    ? currentSavedListItems.length > 0
    : groceryItems.length > 0 || customGroceryItems.length > 0;
  const pct = stats.total > 0 ? Math.round((stats.checked / stats.total) * 100) : 0;

  // ── Subtitle text under the title ───────────────────────────────
  let subtitleText = '';
  if (isSavedListMode) {
    subtitleText = `${stats.total} item${stats.total === 1 ? '' : 's'} saved`;
  } else if (groceryStartDate && groceryEndDate && hasAnyItems) {
    const s = new Date(groceryStartDate).toLocaleDateString('en-US', { weekday: 'short' });
    const e = new Date(groceryEndDate).toLocaleDateString('en-US', { weekday: 'short' });
    subtitleText = stats.total > 0
      ? `${stats.total} item${stats.total === 1 ? '' : 's'} for ${s}–${e} meals.`
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
                    onToggle={() => onToggle(item.id)}
                    onDelete={() => onDelete(item.id)}
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
                      onToggle={() => onToggle(item.id)}
                      onDelete={() => onDelete(item.id)}
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
                    fontFamily: designTokens.font.serifItalic,
                    fontStyle: 'italic',
                    fontSize: 32,
                    color: colors.ink,
                    letterSpacing: -0.64,
                    lineHeight: 36,
                  }}
                  numberOfLines={1}
                >
                  {isSavedListMode ? currentSavedListName || 'Saved list' : 'Grocery'}
                </Text>
                {subtitleText ? (
                  <Text
                    style={{
                      marginTop: 6,
                      fontFamily: designTokens.font.regular,
                      fontSize: 14.5,
                      color: colors.ink2,
                      lineHeight: 20,
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
                ) : (
                  /* Normal mode: Saved lists */
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowSavedListsModal(true);
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
                {/* Plus — solid ink, cream icon, opens AddItemModal */}
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowAddModal(true);
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
          </Animated.View>

          {/* ── Contextual helper pill (pantry check phase only) ─ */}
          {!isSavedListMode && showHelperPill && stats.total > 0 && (
            <Animated.View
              entering={FadeInDown.delay(80).springify()}
              style={{
                paddingHorizontal: 16,
                paddingBottom: 10,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  backgroundColor: isDark ? 'rgba(228,109,70,0.12)' : '#FFF5F0',
                  borderRadius: 14,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(228,109,70,0.20)' : '#FCDDD0',
                }}
              >
                <Lightbulb size={16} color={designTokens.colors.olive} strokeWidth={1.7} />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: designTokens.font.regular,
                    fontSize: 13,
                    color: isDark ? 'rgba(246,242,233,0.8)' : designTokens.colors.ink2,
                    lineHeight: 18,
                  }}
                >
                  Tap items you already have — the rest becomes your shopping list
                </Text>
                <Pressable
                  onPress={dismissHelperPill}
                  hitSlop={8}
                  style={{ padding: 2 }}
                >
                  <X size={14} color={isDark ? 'rgba(246,242,233,0.4)' : designTokens.colors.ink3} strokeWidth={1.8} />
                </Pressable>
              </View>
            </Animated.View>
          )}

          {/* ── StatusCard (charcoal hero) ─────────────────────── */}
          {stats.total > 0 && (
            <Animated.View
              entering={FadeInDown.delay(120).springify()}
              style={{ paddingHorizontal: 16, paddingBottom: 18 }}
            >
              <LinearGradient
                colors={isSavedListMode ? ['#181612', '#1e2b17'] : ['#181612', '#2d1811']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 22,
                  paddingHorizontal: 18,
                  paddingTop: 18,
                  paddingBottom: 16,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.08)',
                  ...elevation.card,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 11,
                        letterSpacing: 1.1,
                        textTransform: 'uppercase',
                        color: isSavedListMode ? designTokens.colors.brand : designTokens.colors.olive,
                      }}
                    >
                      {stats.remaining === 0
                        ? 'All done'
                        : isSavedListMode ? 'Shopping' : 'Pantry check'}
                    </Text>
                    <Text
                      style={{
                        marginTop: 4,
                        fontFamily: designTokens.font.medium,
                        fontSize: 24,
                        color: '#F6F2E9',
                        letterSpacing: -0.5,
                        lineHeight: 38,
                      }}
                    >
                      <Text style={{ fontFamily: designTokens.font.medium, fontSize: 36, letterSpacing: 0 }}>
                        {stats.remaining}
                      </Text>
                      {' '}{isSavedListMode ? 'items left' : 'to review'}
                    </Text>
                    <Text
                      style={{
                        marginTop: 6,
                        fontFamily: designTokens.font.regular,
                        fontSize: 13,
                        color: 'rgba(246,242,233,0.65)',
                      }}
                    >
                      {stats.checked} of {stats.total} {isSavedListMode ? 'purchased' : 'already at home'}
                    </Text>
                  </View>
                  <View style={{ position: 'relative', width: 56, height: 56 }}>
                    {/* Glowing background */}
                    {stats.remaining > 0 && (
                      <Animated.View
                        style={[
                          {
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            borderRadius: 999,
                            backgroundColor: isSavedListMode ? designTokens.colors.brand : designTokens.colors.olive,
                          },
                          glowStyle,
                        ]}
                      />
                    )}
                    <View
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        borderRadius: 999,
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.15)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 17,
                        color: '#F6F2E9',
                        letterSpacing: -0.34,
                        lineHeight: 18,
                      }}
                    >
                      {pct}%
                    </Text>
                    <Text
                      style={{
                        marginTop: 3,
                        fontFamily: designTokens.font.medium,
                        fontSize: 9.5,
                        letterSpacing: 0.57,
                        textTransform: 'uppercase',
                        color: 'rgba(246,242,233,0.55)',
                      }}
                    >
                      done
                    </Text>
                  </View>
                  </View>
                </View>

                {/* progress bar */}
                <View
                  style={{
                    marginTop: 16,
                    height: 6,
                    borderRadius: 999,
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: `${pct}%` as any,
                      height: '100%',
                      borderRadius: 999,
                      backgroundColor: isSavedListMode ? designTokens.colors.brand : designTokens.colors.olive,
                    }}
                  />
                </View>

                {/* CTAs inside the card */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                  <Pressable
                    onPress={() => {
                      if (isPaused) return;
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowDatePicker(true);
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: 11,
                      borderRadius: 999,
                      backgroundColor: '#F6F2E9',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <RotateCcw size={15} color={designTokens.colors.charcoal} strokeWidth={1.8} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.medium,
                        fontSize: 14,
                        color: designTokens.colors.charcoal,
                        letterSpacing: -0.14,
                      }}
                    >
                      Refresh
                    </Text>
                  </Pressable>
                  {!isSavedListMode && stats.total > 0 && (
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setShowSaveListModal(true);
                      }}
                      style={{
                        paddingHorizontal: 14,
                        paddingVertical: 11,
                        borderRadius: 999,
                        backgroundColor: 'transparent',
                        borderWidth: 1,
                        borderColor: 'rgba(246,242,233,0.2)',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Save size={15} color="#F6F2E9" strokeWidth={1.8} />
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 14,
                          color: '#F6F2E9',
                          letterSpacing: -0.14,
                        }}
                      >
                        Save as shopping list
                      </Text>
                    </Pressable>
                  )}
                </View>
              </LinearGradient>
            </Animated.View>
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
                  fontSize: 18,
                  color: colors.ink,
                  letterSpacing: -0.36,
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
              {/* Meal-generated items */}
              {!isSavedListMode &&
                Object.entries(groupedMealItems).map(([category, items], idx) =>
                  renderCategorySection(
                    category,
                    items,
                    (id) => toggleGroceryItem(id),
                    (id) => removeGroceryItem(id),
                    `meal-${category}`,
                    idx,
                  ),
                )}
              {/* Custom / saved-list items */}
              {Object.entries(groupedCustomItems).map(([category, items], idx) =>
                renderCategorySection(
                  category,
                  items,
                  (id) => (isSavedListMode ? toggleCurrentSavedListItem(id) : toggleCustomGroceryItem(id)),
                  (id) => (isSavedListMode ? removeCurrentSavedListItem(id) : removeCustomGroceryItem(id)),
                  `custom-${category}`,
                  idx + Object.keys(groupedMealItems).length,
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
              style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20 }}
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
                <ShoppingCart size={22} color={designTokens.colors.ink3} strokeWidth={1.6} />
              </View>
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 15,
                  color: colors.ink,
                  letterSpacing: -0.15,
                }}
              >
                Your list is empty
              </Text>
              <Text
                style={{
                  fontFamily: designTokens.font.regular,
                  fontSize: 13,
                  color: colors.ink3,
                  marginTop: 4,
                  textAlign: 'center',
                }}
              >
                Add items manually{isPaused ? '' : '\nor generate from your meal plan'}
              </Text>
              {!isPaused && (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowDatePicker(true);
                  }}
                  style={{
                    marginTop: 18,
                    paddingHorizontal: 22,
                    paddingVertical: 13,
                    borderRadius: 14,
                    backgroundColor: designTokens.colors.brand,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Calendar size={16} color="#fff" strokeWidth={1.8} />
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 14.5,
                      color: '#fff',
                      letterSpacing: -0.145,
                    }}
                  >
                    From meal plan
                  </Text>
                </Pressable>
              )}
              {isPaused && (
                <View
                  style={{
                    marginTop: 18,
                    paddingHorizontal: 18,
                    paddingVertical: 11,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: colors.hair,
                    backgroundColor: colors.pill,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Lock size={15} color={designTokens.colors.ink3} strokeWidth={1.8} />
                  <Text
                    style={{
                      fontFamily: designTokens.font.medium,
                      fontSize: 13.5,
                      color: colors.ink2,
                      letterSpacing: -0.135,
                    }}
                  >
                    Generation paused
                  </Text>
                </View>
              )}
            </Animated.View>
          )}
        </ScrollView>


      </SafeAreaView>





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

      {/* Save Shopping List Name Modal */}
      <SaveListNameModal
        visible={showSaveListModal}
        onClose={() => setShowSaveListModal(false)}
        onSave={(name) => {
          const success = saveAndClearCheckedItems(name);
          if (success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            // Get the newly created list (it's the last one in the array)
            const state = useMealPlanStore.getState();
            const newList = state.savedGroceryLists[state.savedGroceryLists.length - 1];
            if (newList) {
              // Load the newly created list
              loadSavedGroceryList(newList.id);
            }

            // Close the modal
            setShowSaveListModal(false);
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
        onClose={() => setShowSavedListsModal(false)}
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
