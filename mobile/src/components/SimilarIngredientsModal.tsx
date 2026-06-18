import React from 'react';
import { View, Text, ScrollView, Pressable, Modal } from 'react-native';
import { Check, X, AlertCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { cn } from '@/lib/cn';
import { useRouter } from 'expo-router';
import type { SimilarIngredientGroup } from '@/lib/store';

interface SimilarIngredientsModalProps {
  visible: boolean;
  groups: SimilarIngredientGroup[];
  onDismiss: () => void;
}

export function SimilarIngredientsModal({
  visible,
  groups,
  onDismiss,
}: SimilarIngredientsModalProps) {
  const router = useRouter();

  const handleNavigateToCombine = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/combine-ingredients');
  };

  if (!visible || groups.length === 0) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-white dark:bg-gray-900 rounded-t-2xl p-5">
          <View className="flex-row items-center justify-between mb-4">
            <View className="flex-row items-center gap-2 flex-1">
              <AlertCircle size={24} color="#f59e0b" />
              <View className="flex-1">
                <Text className="text-lg font-semibold text-gray-900 dark:text-white">
                  Similar Ingredients Found
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {groups.length} group{groups.length !== 1 ? 's' : ''} to review
                </Text>
              </View>
            </View>
            <Pressable onPress={onDismiss} hitSlop={8}>
              <X size={24} color="#6b7280" />
            </Pressable>
          </View>

          <Text className="text-sm text-gray-600 dark:text-gray-400 mb-5">
            We found ingredients with the same name but different units. Review and combine them to simplify your shopping list.
          </Text>

          {/* Preview of groups */}
          <ScrollView className="mb-6 gap-3 max-h-40">
            {groups.slice(0, 3).map((group) => (
              <View key={group.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-gray-900 dark:text-white capitalize">
                      {group.canonicalName}
                    </Text>
                    <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {group.variants.length} variants to combine
                    </Text>
                  </View>
                </View>
              </View>
            ))}
            {groups.length > 3 && (
              <Text className="text-xs text-gray-500 dark:text-gray-400 px-3">
                + {groups.length - 3} more group{groups.length - 3 !== 1 ? 's' : ''}
              </Text>
            )}
          </ScrollView>

          <View className="gap-3">
            <Pressable
              onPress={handleNavigateToCombine}
              className="p-4 rounded-lg bg-sage-500 items-center"
            >
              <Text className="font-semibold text-white">
                Review & Combine
              </Text>
            </Pressable>

            <Pressable
              onPress={onDismiss}
              className="p-4 rounded-lg bg-gray-100 dark:bg-gray-800 items-center"
            >
              <Text className="font-semibold text-gray-900 dark:text-white">
                Skip for Now
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
