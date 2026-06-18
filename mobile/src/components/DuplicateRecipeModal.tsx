import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, Modal, Pressable, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Copy, X, Check, ChevronRight, Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/lib/useColorScheme';
import { cn } from '@/lib/cn';
import type { Recipe } from '@/lib/store';

export interface DuplicateGroup {
  key: string;
  recipes: Recipe[];
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'with', 'and', 'or', 'in', 'on', 'of', 'for', 'to', 'from', 'by',
]);

// Important cooking methods/formats that differentiate recipes
const COOKING_FORMAT_WORDS = new Set([
  'bowl', 'salad', 'soup', 'stew', 'curry', 'wrap', 'sandwich', 'plate', 'toast',
  'smoothie', 'shake', 'bake', 'casserole', 'pie', 'tart', 'cake', 'pudding',
  'pasta', 'noodles', 'rice', 'tacos', 'burrito', 'pizza', 'burger',
  'fried', 'fry', 'grilled', 'roasted', 'steamed', 'baked', 'sauteed', 'braised',
  'skewers', 'kebab', 'kabob', 'stir', 'stirfry',
]);

// Descriptive words that are less important for duplicate detection
const DESCRIPTOR_WORDS = new Set([
  'fresh', 'crispy', 'creamy', 'spicy', 'sweet', 'savory', 'tangy', 'zesty',
  'style', 'recipe', 'homemade', 'easy', 'quick', 'simple', 'classic',
]);

function getSignificantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w) && !DESCRIPTOR_WORDS.has(w));
}

function getCookingFormat(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1 && COOKING_FORMAT_WORDS.has(w));
}

function getAllWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

function wordOverlapScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const overlap = b.filter((w) => setA.has(w)).length;
  return overlap / Math.min(a.length, b.length);
}

function getKeyIngredients(recipe: Recipe): string[] {
  return (recipe.ingredients || [])
    .slice(0, 6)
    .map((ing) =>
      ing.name
        .toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    )
    .flat();
}

function areDuplicates(a: Recipe, b: Recipe): boolean {
  // Extract cooking format/method (taco, fry, curry, etc.) - this is critical for differentiation
  const formatA = getCookingFormat(a.name);
  const formatB = getCookingFormat(b.name);
  const formatScore = wordOverlapScore(formatA, formatB);

  // If cooking formats are different, recipes are NOT duplicates
  // (e.g., "Prawns Fry" vs "Prawns Tacos" have different formats)
  if (formatA.length > 0 && formatB.length > 0 && formatScore === 0) {
    return false;
  }

  // Check name overlap (excluding format words which we already analyzed)
  const nameWordsA = getSignificantWords(a.name);
  const nameWordsB = getSignificantWords(b.name);
  const nameScore = wordOverlapScore(nameWordsA, nameWordsB);

  // Very high name overlap (90%+) with same format = likely duplicates
  if (nameScore >= 0.9 && (formatScore > 0 || formatA.length === 0)) return true;

  // Low name overlap = not duplicates
  if (nameScore < 0.4) return false;

  // For moderate name overlap, check ingredients and description
  const ingredientsA = getKeyIngredients(a);
  const ingredientsB = getKeyIngredients(b);
  const ingredientScore = wordOverlapScore(ingredientsA, ingredientsB);

  const descWordsA = getAllWords(a.description || '');
  const descWordsB = getAllWords(b.description || '');
  const descScore = wordOverlapScore(descWordsA, descWordsB);

  // Require ALL three to align reasonably well (name + ingredients + description)
  // This prevents false positives like "Pork Skewers" vs "Vegetable Curry"
  const combinedScore = nameScore * 0.4 + ingredientScore * 0.35 + descScore * 0.25;
  return combinedScore >= 0.6;  // Increased threshold from 0.45 to 0.6 for stricter matching
}

// "Leftover X" variant recipes are minted by the curated-plan engine to back
// leftover slots on the calendar (see plan-engine.ts → leftoverRecipe). They
// share the original's image and name root by design, so the duplicate
// detector would flag every original/leftover pair as a false positive.
// They're a system-managed pairing, not a user duplicate — skip them.
function isLeftoverVariant(recipe: Recipe): boolean {
  if (recipe.tags?.includes('Leftover')) return true;
  if (recipe.name?.startsWith('Leftover ')) return true;
  return false;
}

export function findDuplicateGroups(recipes: Recipe[]): DuplicateGroup[] {
  const visited = new Set<string>();
  const groups: DuplicateGroup[] = [];

  // Strip leftover variants up front so the inner O(n²) compare never sees
  // them. A leftover is intentionally near-identical in name to its source,
  // and would otherwise dominate every duplicate group on the screen.
  const candidates = recipes.filter((r) => !isLeftoverVariant(r));

  for (let i = 0; i < candidates.length; i++) {
    if (visited.has(candidates[i].id)) continue;
    const group: Recipe[] = [candidates[i]];

    for (let j = i + 1; j < candidates.length; j++) {
      if (visited.has(candidates[j].id)) continue;
      if (areDuplicates(candidates[i], candidates[j])) {
        group.push(candidates[j]);
        visited.add(candidates[j].id);
      }
    }

    if (group.length >= 2) {
      visited.add(candidates[i].id);
      const nameWords = getSignificantWords(candidates[i].name);
      groups.push({ key: nameWords.sort().join('-') || candidates[i].id, recipes: group });
    }
  }

  return groups;
}

interface DuplicateBannerProps {
  groupCount: number;
  totalDuplicates: number;
  onPress: () => void;
  isDark: boolean;
}

export function DuplicateBanner({ groupCount, totalDuplicates, onPress, isDark }: DuplicateBannerProps) {
  return (
    <Animated.View entering={FadeInDown.springify()}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
        className={cn(
          'mx-5 mb-3 px-4 py-3 rounded-2xl flex-row items-center',
          isDark ? 'bg-amber-900/40' : 'bg-amber-50'
        )}
        style={{
          borderWidth: 1,
          borderColor: isDark ? '#92400e50' : '#fbbf2450',
        }}
      >
        <View
          className={cn(
            'w-9 h-9 rounded-xl items-center justify-center mr-3',
            isDark ? 'bg-amber-800/60' : 'bg-amber-100'
          )}
        >
          <Copy size={18} color={isDark ? '#fbbf24' : '#d97706'} />
        </View>
        <View className="flex-1">
          <Text
            className={cn(
              'text-sm font-semibold',
              isDark ? 'text-amber-200' : 'text-amber-800'
            )}
          >
            {groupCount} duplicate {groupCount === 1 ? 'group' : 'groups'} found
          </Text>
          <Text
            className={cn(
              'text-xs mt-0.5',
              isDark ? 'text-amber-300/70' : 'text-amber-600'
            )}
          >
            {totalDuplicates} similar recipes — tap to review
          </Text>
        </View>
        <ChevronRight size={18} color={isDark ? '#fbbf24' : '#d97706'} />
      </Pressable>
    </Animated.View>
  );
}

interface DuplicateRecipeModalProps {
  visible: boolean;
  onClose: () => void;
  groups: DuplicateGroup[];
  onDiscard: (ids: string[]) => void;
  onKeepAllGroup: (groupKey: string) => void;
  isDark: boolean;
}

export function DuplicateRecipeModal({
  visible,
  onClose,
  groups,
  onDiscard,
  onKeepAllGroup,
  isDark,
}: DuplicateRecipeModalProps) {
  const insets = useSafeAreaInsets();
  const [selectedForDiscard, setSelectedForDiscard] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedForDiscard((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleDiscard = useCallback(() => {
    if (selectedForDiscard.size === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onDiscard(Array.from(selectedForDiscard));
    setSelectedForDiscard(new Set());
  }, [selectedForDiscard, onDiscard]);

  const handleKeepAll = useCallback(
    (groupKey: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onKeepAllGroup(groupKey);
    },
    [onKeepAllGroup]
  );

  const handleClose = useCallback(() => {
    setSelectedForDiscard(new Set());
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View
          className={cn('rounded-t-3xl', isDark ? 'bg-charcoal-900' : 'bg-white')}
          style={{ maxHeight: '85%', paddingBottom: insets.bottom + 16 }}
        >
          <View className="px-5 pt-5 pb-3 flex-row items-center justify-between">
            <View>
              <Text
                className={cn(
                  'text-xl font-bold',
                  isDark ? 'text-white' : 'text-charcoal-900'
                )}
              >
                Duplicate Recipes
              </Text>
              <Text
                className={cn(
                  'text-sm mt-1',
                  isDark ? 'text-charcoal-400' : 'text-charcoal-500'
                )}
              >
                Select recipes to discard or keep all
              </Text>
            </View>
            <Pressable
              onPress={handleClose}
              className={cn(
                'w-10 h-10 rounded-full items-center justify-center',
                isDark ? 'bg-charcoal-800' : 'bg-gray-100'
              )}
            >
              <X size={20} color={isDark ? '#aaa' : '#666'} />
            </Pressable>
          </View>

          <ScrollView
            className="px-5"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {groups.map((group, gi) => (
              <Animated.View
                key={group.key}
                entering={FadeInDown.delay(gi * 100).springify()}
                className={cn(
                  'mb-4 rounded-2xl overflow-hidden',
                  isDark ? 'bg-charcoal-800' : 'bg-gray-50'
                )}
              >
                <View className="px-4 pt-3 pb-2 flex-row items-center justify-between">
                  <Text
                    className={cn(
                      'text-sm font-semibold',
                      isDark ? 'text-charcoal-300' : 'text-charcoal-600'
                    )}
                  >
                    {group.recipes.length} similar recipes
                  </Text>
                  <Pressable
                    onPress={() => handleKeepAll(group.key)}
                    className={cn(
                      'px-3 py-1.5 rounded-full flex-row items-center',
                      isDark ? 'bg-sage-700' : 'bg-sage-100'
                    )}
                  >
                    <Check size={14} color={isDark ? '#a6b594' : '#6a7d56'} />
                    <Text
                      className={cn(
                        'text-xs font-semibold ml-1',
                        isDark ? 'text-sage-300' : 'text-sage-700'
                      )}
                    >
                      Keep All
                    </Text>
                  </Pressable>
                </View>

                {group.recipes.map((recipe) => {
                  const isSelected = selectedForDiscard.has(recipe.id);
                  return (
                    <Pressable
                      key={recipe.id}
                      onPress={() => toggleSelect(recipe.id)}
                      className={cn(
                        'mx-3 mb-2 p-3 rounded-xl flex-row items-center',
                        isSelected
                          ? isDark
                            ? 'bg-red-900/30'
                            : 'bg-red-50'
                          : isDark
                            ? 'bg-charcoal-700'
                            : 'bg-white'
                      )}
                      style={
                        isSelected
                          ? { borderWidth: 1, borderColor: isDark ? '#dc262650' : '#fca5a550' }
                          : { borderWidth: 1, borderColor: 'transparent' }
                      }
                    >
                      <Image
                        source={{ uri: recipe.imageUrl }}
                        className="w-14 h-14 rounded-xl"
                      />
                      <View className="flex-1 ml-3">
                        <Text
                          className={cn(
                            'text-sm font-semibold',
                            isDark ? 'text-white' : 'text-charcoal-900'
                          )}
                          numberOfLines={1}
                        >
                          {recipe.name}
                        </Text>
                        <Text
                          className={cn(
                            'text-xs mt-0.5',
                            isDark ? 'text-charcoal-400' : 'text-charcoal-500'
                          )}
                          numberOfLines={1}
                        >
                          {recipe.description}
                        </Text>
                        <Text
                          className={cn(
                            'text-xs mt-0.5',
                            isDark ? 'text-charcoal-500' : 'text-charcoal-400'
                          )}
                        >
                          {recipe.cookTime + recipe.prepTime} min • {recipe.calories || '—'} cal
                        </Text>
                      </View>
                      <View
                        className={cn(
                          'w-7 h-7 rounded-full items-center justify-center ml-2',
                          isSelected
                            ? 'bg-red-500'
                            : isDark
                              ? 'bg-charcoal-600'
                              : 'bg-gray-200'
                        )}
                      >
                        {isSelected ? (
                          <Trash2 size={14} color="#fff" />
                        ) : (
                          <View className="w-3 h-3 rounded-full" />
                        )}
                      </View>
                    </Pressable>
                  );
                })}

                <View className="h-1" />
              </Animated.View>
            ))}
          </ScrollView>

          {selectedForDiscard.size > 0 && (
            <View className="px-5 pt-3">
              <Pressable
                onPress={handleDiscard}
                className="bg-red-500 py-4 rounded-2xl items-center flex-row justify-center"
              >
                <Trash2 size={18} color="#fff" />
                <Text className="text-white font-bold text-base ml-2">
                  Discard {selectedForDiscard.size} {selectedForDiscard.size === 1 ? 'Recipe' : 'Recipes'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
