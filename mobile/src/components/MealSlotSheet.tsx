// MealSlotSheet — bottom sheet for managing all recipes in a single meal slot
// Matches the PlannPlate Home design language (hair borders, Geist fonts, sage/olive palette).
import React from 'react';
import { View, Text, Pressable, Modal, ScrollView, Image } from 'react-native';
import {
  Plus,
  AlertTriangle,
  Edit,
  RefreshCw,
  Trash2,
  Clock,
  Flame,
  Users,
  X,
  Check,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { designTokens, getThemeColors } from '@/lib/design-tokens';
import type { MealSlot, Recipe } from '@/lib/store';
import type { RecipeAllergenInfo } from '@/lib/allergy-checker';

const actionPillStyle = {
  width: 36,
  height: 34,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: designTokens.colors.hair,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: '#fff',
};

interface MealSlotSheetProps {
  visible: boolean;
  mealTypeLabel: string;
  slots: MealSlot[];
  recipes: Recipe[]; // same order as slots
  allergenMap: Record<string, RecipeAllergenInfo>;
  cookedSlotIds: Set<string>;
  isDark?: boolean;
  isRestricted?: boolean;
  onClose: () => void;
  onAdd: () => void;
  onView: (recipeId: string) => void;
  onSwap: (slot: MealSlot) => void;
  onRemove: (slotId: string) => void;
  onOpenServing: (slot: MealSlot, recipe: Recipe) => void;
  onAllergenPress: (recipe: Recipe, info: RecipeAllergenInfo) => void;
  onToggleCooked: (slot: MealSlot) => void;
}

export function MealSlotSheet({
  visible,
  mealTypeLabel,
  slots,
  recipes,
  allergenMap,
  cookedSlotIds,
  isDark = false,
  isRestricted = false,
  onClose,
  onAdd,
  onView,
  onSwap,
  onRemove,
  onOpenServing,
  onAllergenPress,
  onToggleCooked,
}: MealSlotSheetProps) {
  const colors = getThemeColors(isDark);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: colors.bg,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            maxHeight: '85%',
            paddingBottom: 24,
          }}
        >
          {/* Drag handle */}
          <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 999,
                backgroundColor: designTokens.colors.hair,
              }}
            />
          </View>

          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: colors.hair2,
            }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 19,
                color: colors.ink,
                letterSpacing: -0.38,
                flex: 1,
              }}
            >
              {mealTypeLabel}
            </Text>
            {!isRestricted && (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onAdd();
                }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  backgroundColor: designTokens.colors.brand,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 6,
                }}
              >
                <Plus size={18} color="#fff" strokeWidth={2} />
              </Pressable>
            )}
            <Pressable
              onPress={onClose}
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.hair,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={18} color={designTokens.colors.ink2} strokeWidth={1.6} />
            </Pressable>
          </View>

          {/* Recipe list */}
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {recipes.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 36 }}>
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 14,
                    color: designTokens.colors.ink3,
                  }}
                >
                  No recipes added yet
                </Text>
              </View>
            ) : (
              recipes.map((recipe, idx) => {
                const slot = slots[idx];
                if (!slot) return null;
                const info = allergenMap[recipe.id];
                const displayServings = slot.servingOverride ?? recipe.servings;
                const totalMin = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);

                return (
                  <View
                    key={slot.id}
                    style={{
                      padding: 12,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: colors.hair,
                      backgroundColor: colors.bg,
                      marginBottom: 10,
                    }}
                  >
                    {/* Top row: image + name/description/meta. Tap → open recipe detail. */}
                    <Pressable
                      onPress={() => onView(recipe.id)}
                      style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
                    >
                      <Image
                        source={{ uri: recipe.imageUrl }}
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 12,
                          backgroundColor: '#F4F0E8',
                        }}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            fontFamily: designTokens.font.medium,
                            fontSize: 14.5,
                            color: colors.ink,
                            letterSpacing: -0.145,
                            lineHeight: 18,
                          }}
                          numberOfLines={1}
                        >
                          {recipe.name}
                        </Text>
                        <Text
                          style={{
                            fontFamily: designTokens.font.regular,
                            fontSize: 12,
                            color: designTokens.colors.ink3,
                            marginTop: 2,
                          }}
                          numberOfLines={2}
                        >
                          {recipe.description}
                        </Text>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 8,
                            marginTop: 6,
                          }}
                        >
                          {totalMin > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                              <Clock
                                size={11}
                                color={designTokens.colors.ink2}
                                strokeWidth={1.8}
                              />
                              <Text
                                style={{
                                  fontFamily: designTokens.font.regular,
                                  fontSize: 11.5,
                                  color: designTokens.colors.ink2,
                                }}
                              >
                                {totalMin} min
                              </Text>
                            </View>
                          )}
                          {recipe.calories ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                              <Flame
                                size={11}
                                color={designTokens.colors.ink2}
                                strokeWidth={1.8}
                              />
                              <Text
                                style={{
                                  fontFamily: designTokens.font.regular,
                                  fontSize: 11.5,
                                  color: designTokens.colors.ink2,
                                }}
                              >
                                {recipe.calories} cal
                              </Text>
                            </View>
                          ) : null}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Users size={11} color={designTokens.colors.brand} strokeWidth={1.8} />
                            <Text
                              style={{
                                fontFamily: designTokens.font.medium,
                                fontSize: 11.5,
                                color: designTokens.colors.brand,
                              }}
                            >
                              {displayServings} {displayServings === 1 ? 'serving' : 'servings'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </Pressable>

                    {/* Action rail — full-width row underneath, no overlap with text. */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 8,
                        marginTop: 12,
                      }}
                    >
                      {info?.hasAllergens && (
                        <Pressable
                          onPress={() => {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                            onAllergenPress(recipe, info);
                          }}
                          hitSlop={6}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            paddingHorizontal: 10,
                            height: 34,
                            borderRadius: 999,
                            backgroundColor: '#F5A623',
                            marginRight: 'auto',
                          }}
                        >
                          <AlertTriangle size={14} color="#fff" strokeWidth={2.2} />
                          <Text
                            style={{
                              fontFamily: designTokens.font.medium,
                              fontSize: 12,
                              color: '#fff',
                            }}
                          >
                            Allergen
                          </Text>
                        </Pressable>
                      )}
                      {!isRestricted && (
                        <>
                          {(() => {
                            const isCooked = cookedSlotIds.has(slot.id);
                            return (
                              <Pressable
                                onPress={() => {
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  onToggleCooked(slot);
                                }}
                                hitSlop={6}
                                style={[
                                  actionPillStyle,
                                  {
                                    backgroundColor: isCooked
                                      ? designTokens.colors.olive
                                      : isDark
                                      ? colors.surface
                                      : '#fff',
                                    borderColor: isCooked
                                      ? designTokens.colors.olive
                                      : designTokens.colors.hair,
                                  },
                                ]}
                              >
                                <Check
                                  size={15}
                                  color={isCooked ? '#fff' : designTokens.colors.ink3}
                                  strokeWidth={isCooked ? 2.4 : 1.8}
                                />
                              </Pressable>
                            );
                          })()}
                          <Pressable
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              onOpenServing(slot, recipe);
                            }}
                            hitSlop={6}
                            style={actionPillStyle}
                          >
                            <Edit size={15} color={designTokens.colors.ink2} strokeWidth={1.6} />
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              onSwap(slot);
                            }}
                            hitSlop={6}
                            style={actionPillStyle}
                          >
                            <RefreshCw
                              size={15}
                              color={designTokens.colors.ink2}
                              strokeWidth={1.6}
                            />
                          </Pressable>
                          <Pressable
                            onPress={() => {
                              Haptics.notificationAsync(
                                Haptics.NotificationFeedbackType.Success,
                              );
                              onRemove(slot.id);
                            }}
                            hitSlop={6}
                            style={actionPillStyle}
                          >
                            <Trash2 size={15} color={designTokens.colors.olive} strokeWidth={1.8} />
                          </Pressable>
                        </>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
