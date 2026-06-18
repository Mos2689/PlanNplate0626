import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Check } from 'lucide-react-native';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { cn } from '@/lib/cn';
import { useMealPlanStore, type SimilarIngredientGroup } from '@/lib/store';
import { useColorScheme } from '@/lib/useColorScheme';
import { useRouter } from 'expo-router';

export default function CombineIngredientsPage() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

  const similarIngredients = useMealPlanStore((s) => s.similarIngredients);
  const combineSimilarIngredients = useMealPlanStore((s) => s.combineSimilarIngredients);
  const clearSimilarIngredients = useMealPlanStore((s) => s.clearSimilarIngredients);

  const [selectedMap, setSelectedMap] = useState<Record<string, Set<string>>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  const toggleVariantSelection = useCallback((groupId: string, itemId: string) => {
    setSelectedMap((prev) => {
      const groupSet = prev[groupId] || new Set();
      const newSet = new Set(groupSet);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return { ...prev, [groupId]: newSet };
    });
  }, []);

  const handleCombineGroup = useCallback(async (group: SimilarIngredientGroup) => {
    if (isProcessing) return;

    const selectedIds = Array.from(selectedMap[group.id] || new Set());
    if (selectedIds.length < 2) return;

    setIsProcessing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      combineSimilarIngredients(group.id, selectedIds);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Reset selection for this group
      setSelectedMap((prev) => {
        const newMap = { ...prev };
        delete newMap[group.id];
        return newMap;
      });
    } catch (error) {
      console.error('Error combining ingredients:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedMap, isProcessing, combineSimilarIngredients]);

  const getGroupReadyStatus = useCallback((group: SimilarIngredientGroup) => {
    const selected = selectedMap[group.id]?.size || 0;
    return selected >= 2;
  }, [selectedMap]);

  // Watch for when all ingredients are combined and return to list
  useEffect(() => {
    if (similarIngredients.length === 0 && !isProcessing) {
      const timer = setTimeout(() => {
        clearSimilarIngredients();
        router.back();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [similarIngredients.length, isProcessing, clearSimilarIngredients, router]);

  if (similarIngredients.length === 0) {
    return (
      <View className={cn("flex-1 items-center justify-center", isDark ? "bg-charcoal-900" : "bg-cream-50")}>
        <SafeAreaView edges={['top']} className="flex-1 items-center justify-center w-full">
          <Text className={cn("text-lg font-semibold", isDark ? "text-white" : "text-charcoal-900")}>
            No Similar Ingredients
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-6 px-4 py-2 rounded-lg bg-sage-500"
          >
            <Text className="text-white font-semibold">Go Back</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className={cn("flex-1", isDark ? "bg-charcoal-900" : "bg-cream-50")}>
      <SafeAreaView edges={['top']} className="flex-1">
        {/* Header */}
        <Animated.View
          entering={FadeInDown.delay(100).springify()}
          className="px-5 pt-4 pb-4 flex-row items-center justify-between"
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            className={cn(
              "w-12 h-12 rounded-2xl items-center justify-center",
              isDark ? "bg-charcoal-800" : "bg-white"
            )}
          >
            <ChevronLeft size={24} color={isDark ? "#a6b594" : "#6a7d56"} strokeWidth={2} />
          </Pressable>

          <View className="flex-1 ml-4">
            <Text className={cn(
              "text-sm font-medium uppercase tracking-wider",
              isDark ? "text-sage-400" : "text-sage-600"
            )}>
              Combine Ingredients
            </Text>
            <Text className={cn(
              "text-2xl font-bold mt-1",
              isDark ? "text-white" : "text-charcoal-900"
            )}>
              {similarIngredients.length} Group{similarIngredients.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </Animated.View>

        {/* Description */}
        <Animated.View
          entering={FadeInDown.delay(150).springify()}
          className="px-5 pb-4"
        >
          <Text className={cn(
            "text-sm",
            isDark ? "text-charcoal-400" : "text-charcoal-500"
          )}>
            Select 2+ items per group and combine. Finish each group to continue.
          </Text>
        </Animated.View>

        {/* Groups */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        >
          {similarIngredients.map((group, idx) => {
            const isReady = getGroupReadyStatus(group);
            return (
              <Animated.View
                key={group.id}
                entering={FadeInDown.delay(200 + idx * 50).springify()}
                layout={Layout.springify()}
                className={cn(
                  "mb-6 p-4 rounded-2xl",
                  isDark ? "bg-charcoal-800" : "bg-white"
                )}
              >
                {/* Group Header */}
                <View className="flex-row items-center justify-between mb-4">
                  <Text className={cn(
                    "text-lg font-semibold capitalize",
                    isDark ? "text-white" : "text-charcoal-900"
                  )}>
                    {group.canonicalName}
                  </Text>
                  <View className={cn(
                    "px-3 py-1 rounded-full",
                    isDark ? "bg-charcoal-700" : "bg-gray-100"
                  )}>
                    <Text className={cn(
                      "text-xs font-semibold",
                      isDark ? "text-charcoal-400" : "text-charcoal-600"
                    )}>
                      {selectedMap[group.id]?.size || 0}/{group.variants.length}
                    </Text>
                  </View>
                </View>

                {/* Variants */}
                <View className="gap-3 mb-4">
                  {group.variants.map((variant) => {
                    const isSelected = selectedMap[group.id]?.has(variant.itemId);

                    return (
                      <Pressable
                        key={variant.itemId}
                        onPress={() => toggleVariantSelection(group.id, variant.itemId)}
                        className={cn(
                          "flex-row items-center gap-3 p-3 rounded-lg border",
                          isSelected
                            ? "bg-sage-100 dark:bg-sage-900/30 border-sage-400 dark:border-sage-600"
                            : "bg-gray-50 dark:bg-charcoal-700 border-gray-200 dark:border-charcoal-600"
                        )}
                      >
                        <View
                          className={cn(
                            "w-6 h-6 rounded border-2 items-center justify-center",
                            isSelected
                              ? "bg-sage-500 border-sage-500"
                              : "border-gray-300 dark:border-charcoal-500"
                          )}
                        >
                          {isSelected && <Check size={16} color="white" />}
                        </View>
                        <View className="flex-1">
                          <Text className={cn(
                            "text-sm font-medium",
                            isDark ? "text-white" : "text-charcoal-900"
                          )}>
                            {variant.displayQuantity}
                          </Text>
                          <Text className={cn(
                            "text-xs",
                            isDark ? "text-charcoal-400" : "text-charcoal-500"
                          )}>
                            {variant.baseUnit}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                {/* Combine Button */}
                <Pressable
                  onPress={() => handleCombineGroup(group)}
                  disabled={!isReady || isProcessing}
                  className={cn(
                    "p-3 rounded-lg items-center justify-center",
                    isReady && !isProcessing
                      ? "bg-sage-500"
                      : isDark ? "bg-charcoal-700" : "bg-gray-200"
                  )}
                >
                  <Text className={cn(
                    "text-sm font-semibold",
                    isReady && !isProcessing
                      ? "text-white"
                      : isDark ? "text-charcoal-500" : "text-gray-500"
                  )}>
                    {isProcessing ? "Combining..." : "Combine Selected Items"}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
