// SaveToCollectionSheet — "save this recipe to one or more collections".
//
// Multi-select by design: a recipe can live in any number of collections, so
// each row is a checkbox that toggles membership immediately (optimistic, then
// synced by the store). The sheet stays open so several can be ticked in one
// pass. A "New collection" row at the top creates one and auto-adds the recipe.
//
// Shared by the Recipes tab (long-press a card) and recipe-detail (header
// bookmark button).
import React, { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { Plus, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useMealPlanStore } from '@/lib/store';
import { designTokens, getThemeColors } from '@/lib/design-tokens';
import { NewCollectionModal } from '@/components/NewCollectionModal';

interface SaveToCollectionSheetProps {
  visible: boolean;
  /** Recipe being filed. Null renders nothing. */
  recipeId: string | null;
  recipeName?: string;
  isDark: boolean;
  onClose: () => void;
}

export function SaveToCollectionSheet({
  visible,
  recipeId,
  recipeName,
  isDark,
  onClose,
}: SaveToCollectionSheetProps) {
  const colors = getThemeColors(isDark);
  const collections = useMealPlanStore((s) => s.collections);
  const toggleRecipeInCollection = useMealPlanStore((s) => s.toggleRecipeInCollection);
  const addRecipesToCollection = useMealPlanStore((s) => s.addRecipesToCollection);

  const [composerOpen, setComposerOpen] = useState(false);

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable
          onPress={onClose}
          style={{
            flex: 1,
            backgroundColor: 'rgba(21,20,15,0.45)',
            justifyContent: 'flex-end',
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: colors.bg,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              paddingTop: 10,
              paddingBottom: 34,
              maxHeight: '75%',
            }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 38,
                height: 4,
                borderRadius: 999,
                backgroundColor: colors.hair,
                marginBottom: 14,
              }}
            />
            <Text
              numberOfLines={1}
              style={{
                paddingHorizontal: 20,
                fontFamily: designTokens.font.semibold,
                fontSize: 17,
                color: colors.ink,
                letterSpacing: -0.3,
              }}
            >
              Save to collection
            </Text>
            {recipeName ? (
              <Text
                numberOfLines={1}
                style={{
                  paddingHorizontal: 20,
                  marginTop: 3,
                  fontFamily: designTokens.font.regular,
                  fontSize: 13,
                  color: colors.ink2,
                }}
              >
                {recipeName}
              </Text>
            ) : null}

            <ScrollView style={{ marginTop: 14 }} keyboardShouldPersistTaps="handled">
              {/* New collection — always the first row. */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setComposerOpen(true);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    backgroundColor: colors.pill,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Plus size={17} color={colors.ink} strokeWidth={2} />
                </View>
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 15,
                    color: colors.ink,
                  }}
                >
                  New collection
                </Text>
              </Pressable>

              {collections.length === 0 ? (
                <Text
                  style={{
                    paddingHorizontal: 20,
                    paddingVertical: 18,
                    fontFamily: designTokens.font.regular,
                    fontSize: 13.5,
                    color: colors.ink3,
                  }}
                >
                  No collections yet — create one to start grouping recipes.
                </Text>
              ) : (
                collections.map((c) => {
                  const checked = !!recipeId && c.recipeIds.includes(recipeId);
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => {
                        if (!recipeId) return;
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        toggleRecipeInCollection(c.id, recipeId);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingHorizontal: 20,
                        paddingVertical: 14,
                      }}
                    >
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          backgroundColor: isDark ? colors.surfaceMuted : c.color,
                        }}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          numberOfLines={1}
                          style={{
                            fontFamily: designTokens.font.medium,
                            fontSize: 15,
                            color: colors.ink,
                          }}
                        >
                          {c.name}
                        </Text>
                        <Text
                          style={{
                            marginTop: 1,
                            fontFamily: designTokens.font.regular,
                            fontSize: 12,
                            color: colors.ink3,
                          }}
                        >
                          {c.recipeIds.length}{' '}
                          {c.recipeIds.length === 1 ? 'recipe' : 'recipes'}
                        </Text>
                      </View>
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 999,
                          borderWidth: checked ? 0 : 1.5,
                          borderColor: colors.hair,
                          backgroundColor: checked
                            ? designTokens.colors.brand
                            : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {checked && <Check size={14} color="#fff" strokeWidth={3} />}
                      </View>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Creating from inside the sheet files the recipe straight into it. */}
      <NewCollectionModal
        visible={composerOpen}
        isDark={isDark}
        onClose={() => setComposerOpen(false)}
        onCreated={(id) => {
          if (recipeId) addRecipesToCollection(id, [recipeId]);
        }}
      />
    </>
  );
}
