import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, Modal, Pressable, ScrollView, TextInput, Keyboard, TouchableWithoutFeedback, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Copy, X, Check, ChevronRight, Merge, AlertCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useColorScheme } from '@/lib/useColorScheme';
import { cn } from '@/lib/cn';
import { designTokens, getThemeColors } from '@/lib/design-tokens';
import { convertToBaseUnit, formatFromBaseUnit } from '@/lib/unit-conversion';

export interface DuplicateIngredientGroup {
  key: string;
  ingredientIds: string[];
  names: string[];
  quantities: string[];
  units: string[];
}

interface DuplicateIngredientBannerProps {
  groupCount: number;
  totalDuplicates: number;
  onPress: () => void;
  isDark: boolean;
}

export function DuplicateIngredientBanner({
  groupCount,
  totalDuplicates,
  onPress,
  isDark,
}: DuplicateIngredientBannerProps) {
  const colors = getThemeColors(isDark);
  return (
    <Animated.View entering={FadeInDown.springify()}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: 16,
          // Theme-aware so the banner doesn't show white text on cream
          // in dark mode (was static `cream`).
          backgroundColor: colors.surfaceMuted,
          borderWidth: 1,
          borderColor: colors.hair,
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.hair,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Merge size={15} color={designTokens.colors.brand} strokeWidth={1.8} />
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
            {totalDuplicates} similar ingredient{totalDuplicates === 1 ? '' : 's'} found
          </Text>
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 12,
              color: colors.ink2,
              marginTop: 1,
            }}
          >
            Tap to review your grocery list
          </Text>
        </View>
        <ChevronRight size={16} color={colors.ink3} strokeWidth={1.7} />
      </Pressable>
    </Animated.View>
  );
}

interface DuplicateIngredientModalProps {
  visible: boolean;
  onClose: () => void;
  groups: DuplicateIngredientGroup[];
  onCombine: (groupKey: string, selectedIndices: number[]) => void;
  isDark: boolean;
}

interface ConfirmationState {
  groupKey: string;
  selectedIndices: number[];
  ingredientName: string;
  calculatedQuantity: number;
  selectedUnit: string;
  userQuantity: string;
  userUnit: string;
  conversionNote: string | null;
}

/**
 * Calculate intelligent conversion across units using the lookup table
 * Respects the selected unit as the target unit for aggregation
 */
function calculateIntelligentConversion(
  group: DuplicateIngredientGroup,
  selectedUnitIndex: number,
  ingredientName: string,
  targetUnit: string
): { quantity: number; unit: string; note: string | null } {
  let conversionNote: string | null = null;

  try {
    // Convert EVERY selected item to the ingredient's canonical base unit
    // before summing. convertToBaseUnit now resolves a single canonical
    // family per ingredient name, so same-ingredient items all share one
    // base unit — no more blind cross-unit addition ("1 cup" + "200 g" = 201).
    const conversions = group.ingredientIds.map((_, idx) => {
      const qty = parseFloat(group.quantities[idx]) || 0;
      const unit = group.units[idx];
      // Resolve against the base item's name so the whole group lands in one
      // consistent base unit even if member names vary slightly.
      return convertToBaseUnit(qty.toString(), unit, ingredientName);
    });

    // The base item determines the target base unit for the sum.
    const targetBaseUnit = conversions[selectedUnitIndex]?.unit ?? conversions[0]?.unit ?? 'g';

    let total = 0;
    let mismatch = false;
    conversions.forEach((c) => {
      if (c.unit === targetBaseUnit) {
        total += c.quantity;
      } else {
        // Different base family that couldn't be reconciled — skip from the
        // sum rather than corrupt the total, and flag for manual review.
        mismatch = true;
      }
    });

    if (mismatch) {
      conversionNote =
        'Some items use a different measurement type and were left out of the total — please check.';
    }

    return { quantity: total, unit: targetBaseUnit, note: conversionNote };
  } catch (error) {
    console.warn('Conversion error:', error);
    const selectedQuantity = parseFloat(group.quantities[selectedUnitIndex]) || 0;
    return {
      quantity: selectedQuantity,
      unit: targetUnit,
      note: 'Conversion failed - please adjust manually',
    };
  }
}

export function DuplicateIngredientModal({
  visible,
  onClose,
  groups,
  onCombine,
  isDark,
}: DuplicateIngredientModalProps) {
  const insets = useSafeAreaInsets();
  const [selectedItems, setSelectedItems] = useState<Map<string, Set<number>>>(new Map());
  const [confirmationState, setConfirmationState] = useState<ConfirmationState | null>(null);

  const toggleItemSelection = useCallback((groupKey: string, itemIndex: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const groupSet = next.get(groupKey) ?? new Set<number>();
      if (groupSet.has(itemIndex)) {
        groupSet.delete(itemIndex);
      } else {
        groupSet.add(itemIndex);
      }
      if (groupSet.size === 0) {
        next.delete(groupKey);
      } else {
        next.set(groupKey, groupSet);
      }
      return next;
    });
  }, []);

  const handleCombine = useCallback(
    (groupKey: string) => {
      const selectedIndicesSet = selectedItems.get(groupKey);
      if (!selectedIndicesSet || selectedIndicesSet.size === 0) return;

      const group = groups.find((g: DuplicateIngredientGroup) => g.key === groupKey);
      if (!group) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const selectedIndices = Array.from(selectedIndicesSet).sort((a, b) => a - b);
      const baseIndex = selectedIndices[0];
      const baseUnit = group.units[baseIndex];

      // Calculate intelligent conversion using the first selected item's unit
      const conversion = calculateIntelligentConversion(group, baseIndex, group.names[baseIndex], baseUnit);

      console.log('[DuplicateIngredient] Debug:', {
        selectedUnit: baseUnit,
        conversionUnit: conversion.unit,
        quantity: conversion.quantity,
        selectedIndices: selectedIndices.join(','),
      });

      // Show confirmation screen
      setConfirmationState({
        groupKey,
        selectedIndices,
        ingredientName: group.names[baseIndex],
        calculatedQuantity: conversion.quantity,
        selectedUnit: baseUnit,
        userQuantity: (Math.round(conversion.quantity * 10) / 10).toString(),
        userUnit: baseUnit,
        conversionNote: conversion.note,
      });
    },
    [selectedItems, groups]
  );

  const handleConfirmCombination = useCallback(() => {
    if (!confirmationState) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Call onCombine with user's selected indices
    onCombine(confirmationState.groupKey, confirmationState.selectedIndices);

    // Reset confirmation state and clear selection for this group
    setConfirmationState(null);
    setSelectedItems((prev: Map<string, Set<number>>) => {
      const next = new Map(prev);
      next.delete(confirmationState.groupKey);
      return next;
    });
  }, [confirmationState, onCombine]);

  const handleCancelConfirmation = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setConfirmationState(null);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedItems(new Map());
    setConfirmationState(null);
    onClose();
  }, [onClose]);

  // If confirmation state exists, show confirmation screen instead
  if (confirmationState) {
    return (
      <Modal visible={visible} animationType="slide" transparent>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={0}
            >
              <TouchableWithoutFeedback onPress={() => {}} accessible={false}>
                <View
                  className={cn('rounded-t-3xl px-5 pt-5', isDark ? 'bg-charcoal-900' : 'bg-white')}
                  style={{ paddingBottom: insets.bottom + 16, maxHeight: '90%' }}
                >
                  <View className="flex-row items-center justify-between mb-6">
                    <View>
                      <Text
                        className={cn(
                          'text-xl font-bold',
                          isDark ? 'text-white' : 'text-charcoal-900'
                        )}
                      >
                        Confirm Combination
                      </Text>
                      <Text
                        className={cn(
                          'text-sm mt-1',
                          isDark ? 'text-charcoal-400' : 'text-charcoal-500'
                        )}
                      >
                        Review and adjust if needed
                      </Text>
                    </View>
                    <Pressable
                      onPress={handleCancelConfirmation}
                      className={cn(
                        'w-10 h-10 rounded-full items-center justify-center',
                        isDark ? 'bg-charcoal-800' : 'bg-gray-100'
                      )}
                    >
                      <X size={20} color={isDark ? '#aaa' : '#666'} />
                    </Pressable>
                  </View>

                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    bounces={false}
                  >
              {/* Ingredient Name */}
              <Text
                className={cn(
                  'text-lg font-semibold mb-4',
                  isDark ? 'text-white' : 'text-charcoal-900'
                )}
              >
                {confirmationState.ingredientName}
              </Text>

              {/* Quantity Input */}
              <View className="mb-4">
                <Text
                  className={cn(
                    'text-sm font-semibold mb-2',
                    isDark ? 'text-charcoal-300' : 'text-charcoal-600'
                  )}
                >
                  Quantity
                </Text>
                <TextInput
                  value={confirmationState.userQuantity}
                  onChangeText={(text) =>
                    setConfirmationState((prev) =>
                      prev ? { ...prev, userQuantity: text } : null
                    )
                  }
                  placeholder="0"
                  placeholderTextColor={isDark ? '#666' : '#999'}
                  keyboardType="decimal-pad"
                  className={cn(
                    'px-4 py-3 rounded-xl text-base font-semibold',
                    isDark ? 'bg-charcoal-800 text-white' : 'bg-gray-50 text-charcoal-900'
                  )}
                />
              </View>

              {/* Unit Input */}
              <View className="mb-6">
                <Text
                  className={cn(
                    'text-sm font-semibold mb-2',
                    isDark ? 'text-charcoal-300' : 'text-charcoal-600'
                  )}
                >
                  Unit
                </Text>
                <TextInput
                  value={confirmationState.userUnit}
                  onChangeText={(text) =>
                    setConfirmationState((prev) =>
                      prev ? { ...prev, userUnit: text } : null
                    )
                  }
                  placeholder="g"
                  placeholderTextColor={isDark ? '#666' : '#999'}
                  className={cn(
                    'px-4 py-3 rounded-xl text-base font-semibold',
                    isDark ? 'bg-charcoal-800 text-white' : 'bg-gray-50 text-charcoal-900'
                  )}
                />
              </View>

              {/* Action Buttons */}
              <View className="flex-row gap-3 pb-4">
                <Pressable
                  onPress={handleCancelConfirmation}
                  className={cn(
                    'flex-1 py-3 rounded-2xl items-center',
                    isDark ? 'bg-charcoal-800' : 'bg-gray-100'
                  )}
                >
                  <Text
                    className={cn(
                      'font-semibold',
                      isDark ? 'text-white' : 'text-charcoal-900'
                    )}
                  >
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleConfirmCombination}
                  className="flex-1 py-3 rounded-2xl items-center bg-sage-500"
                >
                  <Text className="text-white font-semibold">Confirm</Text>
                </Pressable>
              </View>
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    );
  }

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
                Combine Ingredients
              </Text>
              <Text
                className={cn(
                  'text-sm mt-1',
                  isDark ? 'text-charcoal-400' : 'text-charcoal-500'
                )}
              >
                Select unit and combine duplicates
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
            {groups.map((group, gi) => {
              const selectedIndicesSet = selectedItems.get(group.key);
              return (
                <Animated.View
                  key={group.key}
                  entering={FadeInDown.delay(gi * 100).springify()}
                  className={cn(
                    'mb-4 rounded-2xl overflow-hidden',
                    isDark ? 'bg-charcoal-800' : 'bg-gray-50'
                  )}
                >
                  <View className="px-4 pt-3 pb-2">
                    <Text
                      className={cn(
                        'text-sm font-semibold',
                        isDark ? 'text-charcoal-300' : 'text-charcoal-600'
                      )}
                    >
                      {group.ingredientIds.length} similar items
                    </Text>
                  </View>

                  {group.ingredientIds.map((id, index) => {
                    const isSelected = selectedIndicesSet?.has(index) ?? false;
                    return (
                      <Pressable
                        key={id}
                        onPress={() => toggleItemSelection(group.key, index)}
                        className={cn(
                          'mx-3 mb-2 p-3 rounded-xl flex-row items-center',
                          isSelected
                            ? isDark
                              ? 'bg-sage-900/30'
                              : 'bg-sage-50'
                            : isDark
                              ? 'bg-charcoal-700'
                              : 'bg-white'
                        )}
                        style={
                          isSelected
                            ? { borderWidth: 1, borderColor: isDark ? '#6a7d5650' : '#dcfce750' }
                            : { borderWidth: 1, borderColor: 'transparent' }
                        }
                      >
                        <View className="flex-1">
                          <Text
                            className={cn(
                              'text-sm font-semibold',
                              isDark ? 'text-white' : 'text-charcoal-900'
                            )}
                          >
                            {group.names[index]}
                          </Text>
                          <Text
                            className={cn(
                              'text-xs mt-1 font-medium',
                              isDark ? 'text-charcoal-400' : 'text-charcoal-600'
                            )}
                          >
                            {group.quantities[index]}
                          </Text>
                        </View>
                        <View
                          className={cn(
                            'w-7 h-7 rounded-full items-center justify-center ml-2',
                            isSelected
                              ? isDark
                                ? 'bg-sage-600'
                                : 'bg-sage-500'
                              : isDark
                                ? 'bg-charcoal-600'
                                : 'bg-gray-200'
                          )}
                        >
                          {isSelected ? (
                            <Check size={14} color="#fff" />
                          ) : (
                            <View className="w-3 h-3 rounded-full" />
                          )}
                        </View>
                      </Pressable>
                    );
                  })}

                  {selectedIndicesSet && selectedIndicesSet.size > 0 && (
                    <View className="px-3 pb-2">
                      <Pressable
                        onPress={() => handleCombine(group.key)}
                        className="bg-sage-500 py-3 rounded-xl items-center flex-row justify-center"
                      >
                        <Merge size={16} color="#fff" />
                        <Text className="text-white font-bold text-sm ml-2">
                          Combine selected items
                        </Text>
                      </Pressable>
                    </View>
                  )}

                  <View className="h-1" />
                </Animated.View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
