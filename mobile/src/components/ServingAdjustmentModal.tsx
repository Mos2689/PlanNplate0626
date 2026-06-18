import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { Minus, Plus, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/lib/useColorScheme';
import { cn } from '@/lib/cn';
import { Recipe, Ingredient } from '@/lib/store';

interface ServingAdjustmentModalProps {
  visible: boolean;
  recipe: Recipe | null;
  currentServingOverride: number | undefined;
  onClose: () => void;
  onSave: (servingSize: number) => void;
}

export const ServingAdjustmentModal: React.FC<ServingAdjustmentModalProps> = ({
  visible,
  recipe,
  currentServingOverride,
  onClose,
  onSave,
}) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [servingSize, setServingSize] = useState<number>(1);

  // Update serving size when modal opens with new recipe
  React.useEffect(() => {
    if (visible && recipe) {
      setServingSize(currentServingOverride ?? recipe.servings ?? 1);
    }
  }, [visible, recipe?.id, currentServingOverride]);

  const multiplier = useMemo(() => {
    if (!recipe) return 1;
    return servingSize / recipe.servings;
  }, [recipe, servingSize]);

  const adjustedIngredients = useMemo(() => {
    if (!recipe) return [];
    return recipe.ingredients.map((ing) => ({
      ...ing,
      quantity: (parseFloat(ing.quantity) * multiplier).toFixed(2).replace(/\.?0+$/, ''),
    }));
  }, [recipe, multiplier]);

  const handleDecrement = useCallback(() => {
    console.log('Decrement clicked, current serving:', servingSize);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setServingSize((prev) => Math.max(1, prev - 1));
  }, [servingSize]);

  const handleIncrement = useCallback(() => {
    console.log('Increment clicked, current serving:', servingSize);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setServingSize((prev) => prev + 1);
  }, [servingSize]);

  const handleSave = useCallback(() => {
    console.log('Save button clicked, saving serving size:', servingSize);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(servingSize);
    onClose();
  }, [servingSize, onSave, onClose]);

  if (!recipe) return null;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View className={cn("flex-1", isDark ? "bg-black/50" : "bg-black/40")}>
        <View className="flex-1 justify-end">
          <View className={cn(
            "rounded-t-3xl p-6 pb-8 max-h-4/5",
            isDark ? "bg-charcoal-900" : "bg-white"
          )}>
            {/* Header */}
            <View className="flex-row justify-between items-center mb-6">
              <Text className={cn(
                "text-xl font-bold",
                isDark ? "text-white" : "text-charcoal-900"
              )}>
                Adjust Servings
              </Text>
              <Pressable
                onPress={onClose}
                className={cn(
                  "p-2 rounded-full",
                  isDark ? "bg-charcoal-800" : "bg-cream-100"
                )}
              >
                <X size={20} color={isDark ? '#888' : '#999'} />
              </Pressable>
            </View>

            {/* Serving Size Control */}
            <View className={cn(
              "rounded-2xl p-6 mb-6",
              isDark ? "bg-charcoal-800" : "bg-cream-50"
            )}>
              <Text className={cn(
                "text-sm font-medium mb-3 text-center",
                isDark ? "text-charcoal-400" : "text-charcoal-600"
              )}>
                Current Servings
              </Text>
              <View className="flex-row items-center justify-center gap-4 mb-4">
                <Pressable
                  onPress={handleDecrement}
                  disabled={servingSize <= 1}
                  className={cn(
                    "w-12 h-12 rounded-full items-center justify-center",
                    servingSize <= 1
                      ? isDark ? "bg-charcoal-700" : "bg-cream-200"
                      : isDark ? "bg-sage-700" : "bg-sage-100"
                  )}
                >
                  <Minus
                    size={20}
                    color={servingSize <= 1
                      ? isDark ? '#666' : '#999'
                      : isDark ? '#fff' : '#6a7d56'
                    }
                  />
                </Pressable>

                <View className="items-center min-w-20">
                  <Text className={cn(
                    "text-4xl font-bold",
                    isDark ? "text-white" : "text-charcoal-900"
                  )}>
                    {servingSize}
                  </Text>
                  <Text className={cn(
                    "text-sm mt-1",
                    isDark ? "text-charcoal-400" : "text-charcoal-600"
                  )}>
                    {servingSize === 1 ? 'serving' : 'servings'}
                  </Text>
                </View>

                <Pressable
                  onPress={handleIncrement}
                  className={cn(
                    "w-12 h-12 rounded-full items-center justify-center",
                    isDark ? "bg-sage-700" : "bg-sage-100"
                  )}
                >
                  <Plus size={20} color={isDark ? '#fff' : '#6a7d56'} />
                </Pressable>
              </View>

              <View className="flex-row gap-2 mt-4">
                <Pressable
                  onPress={() => setServingSize(1)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg border",
                    isDark
                      ? "bg-charcoal-700 border-charcoal-600"
                      : "bg-white border-cream-200"
                  )}
                >
                  <Text className={cn(
                    "text-xs font-medium text-center",
                    isDark ? "text-charcoal-300" : "text-charcoal-700"
                  )}>
                    1
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setServingSize(2)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg border",
                    isDark
                      ? "bg-charcoal-700 border-charcoal-600"
                      : "bg-white border-cream-200"
                  )}
                >
                  <Text className={cn(
                    "text-xs font-medium text-center",
                    isDark ? "text-charcoal-300" : "text-charcoal-700"
                  )}>
                    2
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setServingSize(4)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg border",
                    isDark
                      ? "bg-charcoal-700 border-charcoal-600"
                      : "bg-white border-cream-200"
                  )}
                >
                  <Text className={cn(
                    "text-xs font-medium text-center",
                    isDark ? "text-charcoal-300" : "text-charcoal-700"
                  )}>
                    4
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setServingSize(6)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg border",
                    isDark
                      ? "bg-charcoal-700 border-charcoal-600"
                      : "bg-white border-cream-200"
                  )}
                >
                  <Text className={cn(
                    "text-xs font-medium text-center",
                    isDark ? "text-charcoal-300" : "text-charcoal-700"
                  )}>
                    6
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Adjusted Ingredients */}
            <View className="mb-6">
              <Text className={cn(
                "text-sm font-semibold mb-3",
                isDark ? "text-white" : "text-charcoal-900"
              )}>
                Adjusted Ingredients
              </Text>
              <ScrollView
                showsVerticalScrollIndicator={false}
                scrollEnabled={adjustedIngredients.length > 8}
                className="max-h-64"
              >
                <View className="gap-2">
                  {adjustedIngredients.map((ing, idx) => (
                    <View
                      key={idx}
                      className={cn(
                        "flex-row justify-between items-center py-2 px-3 rounded-lg",
                        isDark ? "bg-charcoal-800" : "bg-cream-50"
                      )}
                    >
                      <Text className={cn(
                        "flex-1 text-sm mr-2",
                        isDark ? "text-charcoal-300" : "text-charcoal-700"
                      )}>
                        {ing.name}
                      </Text>
                      <Text className={cn(
                        "text-sm font-semibold whitespace-nowrap",
                        isDark ? "text-white" : "text-charcoal-900"
                      )}>
                        {ing.quantity} {ing.unit}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Action Buttons */}
            <View className="flex-row gap-3">
              <Pressable
                onPress={onClose}
                className={cn(
                  "flex-1 py-3 px-4 rounded-lg border",
                  isDark
                    ? "border-charcoal-700 bg-charcoal-800"
                    : "border-cream-200 bg-white"
                )}
              >
                <Text className={cn(
                  "text-center text-sm font-semibold",
                  isDark ? "text-charcoal-300" : "text-charcoal-900"
                )}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                className={cn(
                  "flex-1 py-3 px-4 rounded-lg",
                  isDark ? "bg-sage-700" : "bg-sage-600"
                )}
              >
                <Text className="text-center text-sm font-semibold text-white">
                  Save Changes
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};
