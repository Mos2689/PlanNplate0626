// GroceryRecipeStrip — the horizontal recipe slider under the Pantry Check card
// on the Grocery tab.
//
// Lists the recipes the current grocery list was built from (meal-plan slots +
// "From Recipes" picks), read from `groceryRecipeSources`. Per chip:
//   • tap the × badge  → remove the recipe (recomputes ingredients)
//   • long-press       → edit its serving size (rescales its ingredients)
// A trailing "+" chip lets the user add more.
//
// Renders nothing when there are no source recipes (e.g. a list built only from
// manually-added items).
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DishImage } from '@/components/DishImage';
import { X, Plus, Minus, Users } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useMealPlanStore, type Recipe } from '@/lib/store';
import { designTokens, getThemeColors } from '@/lib/design-tokens';

interface GroceryRecipeStripProps {
  isDark: boolean;
  /** Open the "From Recipes" picker to add more recipes. */
  onAddRecipes: () => void;
}

const MIN_SERVINGS = 1;
const MAX_SERVINGS = 24;

export function GroceryRecipeStrip({ isDark, onAddRecipes }: GroceryRecipeStripProps) {
  const colors = getThemeColors(isDark);
  const insets = useSafeAreaInsets();
  const recipes = useMealPlanStore((s) => s.recipes);
  const groceryRecipeSources = useMealPlanStore((s) => s.groceryRecipeSources);
  const removeRecipeFromGroceryList = useMealPlanStore((s) => s.removeRecipeFromGroceryList);
  const setRecipeServingsInGroceryList = useMealPlanStore((s) => s.setRecipeServingsInGroceryList);

  // Serving-size editor (opened by long-press).
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [servingsDraft, setServingsDraft] = useState(MIN_SERVINGS);

  // Unique recipes (first occurrence wins), resolved to library rows and in
  // source order — the same recipe cooked on two days shows once.
  const recipesInList = useMemo(() => {
    const seen = new Set<string>();
    const out: Recipe[] = [];
    groceryRecipeSources.forEach((s) => {
      if (seen.has(s.recipeId)) return;
      seen.add(s.recipeId);
      const r = recipes.find((rec) => rec.id === s.recipeId);
      if (r) out.push(r);
    });
    return out;
  }, [groceryRecipeSources, recipes]);

  // Combined serving size for a recipe = the sum of servings across every
  // occurrence in the list. A meal-plan cook that feeds a leftover meal encodes
  // the combined amount on its single cook slot (leftovers are ingredient-less
  // placeholders), while a recipe genuinely repeated across real slots has
  // several source entries — summing handles both. e.g. dinner (2) + leftover
  // lunch (2) → 4; a batch cook of 6 → 6.
  const currentServings = (r: Recipe) => {
    const total = groceryRecipeSources
      .filter((s) => s.recipeId === r.id)
      .reduce((sum, s) => sum + s.servingMultiplier * (r.servings || 1), 0);
    return Math.max(MIN_SERVINGS, Math.round(total));
  };

  const handleDelete = (recipeId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    removeRecipeFromGroceryList(recipeId);
  };

  const openEditor = (r: Recipe) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setServingsDraft(currentServings(r));
    setEditing(r);
  };

  const applyServings = () => {
    if (editing) setRecipeServingsInGroceryList(editing.id, servingsDraft);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditing(null);
  };

  const stepServings = (delta: number) => {
    Haptics.selectionAsync();
    setServingsDraft((v) => Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, v + delta)));
  };

  if (recipesInList.length === 0) return null;

  const totalMinutes = (r: Recipe) => (r.prepTime ?? 0) + (r.cookTime ?? 0);

  return (
    <View style={{ paddingBottom: 18 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12, alignItems: 'flex-start' }}
      >
        {recipesInList.map((r) => (
          <Pressable
            key={r.id}
            onLongPress={() => openEditor(r)}
            delayLongPress={280}
            style={{ alignItems: 'center', width: 78 }}
          >
            <View style={{ width: 64, height: 64 }}>
              <DishImage
                url={r.imageUrl}
                width={150}
                style={{ width: 64, height: 64, borderRadius: 999 }}
                transition={120}
                recyclingKey={r.id}
              />
              {/* Delete badge */}
              <Pressable
                onPress={() => handleDelete(r.id)}
                hitSlop={8}
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  backgroundColor: '#201C17',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1.5,
                  borderColor: colors.bg,
                }}
                accessibilityLabel={`Remove ${r.name}`}
              >
                <X size={11} color="#fff" strokeWidth={2.6} />
              </Pressable>
            </View>
            <Text
              numberOfLines={2}
              style={{
                marginTop: 7,
                fontFamily: designTokens.font.medium,
                fontSize: 12,
                lineHeight: 15,
                color: colors.ink,
                letterSpacing: -0.1,
                textAlign: 'center',
              }}
            >
              {r.name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}>
              <Users size={10} color={colors.ink3} strokeWidth={1.8} />
              <Text style={{ fontFamily: designTokens.font.regular, fontSize: 11, color: colors.ink3 }}>
                {currentServings(r)} serv
              </Text>
            </View>
          </Pressable>
        ))}

        {/* Trailing add chip */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAddRecipes();
          }}
          style={{ alignItems: 'center', width: 78 }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 999,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: colors.hair,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plus size={24} color={designTokens.colors.brand} strokeWidth={2} />
          </View>
          <Text
            style={{
              marginTop: 7,
              fontFamily: designTokens.font.medium,
              fontSize: 12,
              color: colors.ink2,
            }}
          >
            Add
          </Text>
        </Pressable>
      </ScrollView>

      {/* Serving-size editor — opened by long-press */}
      <Modal
        visible={editing !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setEditing(null)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(21,20,15,0.45)' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setEditing(null)} />
          <View
            style={{
              backgroundColor: colors.bg,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingTop: 10,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
              paddingHorizontal: 20,
            }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 40,
                height: 4,
                borderRadius: 999,
                backgroundColor: colors.hair,
                marginBottom: 18,
              }}
            />

            {editing && (
              <>
                {/* Recipe identity */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 22 }}>
                  <DishImage
                    url={editing.imageUrl}
                    width={150}
                    style={{ width: 52, height: 52, borderRadius: 14 }}
                    transition={120}
                    recyclingKey={editing.id}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={2}
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 16,
                        color: colors.ink,
                        letterSpacing: -0.2,
                      }}
                    >
                      {editing.name}
                    </Text>
                    <Text
                      style={{
                        marginTop: 2,
                        fontFamily: designTokens.font.regular,
                        fontSize: 12.5,
                        color: colors.ink3,
                      }}
                    >
                      Recipe serves {editing.servings || 1} · {totalMinutes(editing)} min
                    </Text>
                  </View>
                </View>

                {/* Stepper */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 6,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ fontFamily: designTokens.font.medium, fontSize: 15, color: colors.ink }}>
                    Servings
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                    <Pressable
                      onPress={() => stepServings(-1)}
                      disabled={servingsDraft <= MIN_SERVINGS}
                      hitSlop={6}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: colors.hair,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: servingsDraft <= MIN_SERVINGS ? 0.4 : 1,
                      }}
                    >
                      <Minus size={18} color={colors.ink} strokeWidth={2} />
                    </Pressable>
                    <Text
                      style={{
                        minWidth: 28,
                        textAlign: 'center',
                        fontFamily: designTokens.font.semibold,
                        fontSize: 22,
                        color: colors.ink,
                      }}
                    >
                      {servingsDraft}
                    </Text>
                    <Pressable
                      onPress={() => stepServings(1)}
                      disabled={servingsDraft >= MAX_SERVINGS}
                      hitSlop={6}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: colors.hair,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: servingsDraft >= MAX_SERVINGS ? 0.4 : 1,
                      }}
                    >
                      <Plus size={18} color={colors.ink} strokeWidth={2} />
                    </Pressable>
                  </View>
                </View>

                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12.5,
                    lineHeight: 17,
                    color: colors.ink3,
                    paddingHorizontal: 6,
                    marginBottom: 20,
                  }}
                >
                  Ingredient quantities for this recipe adjust automatically.
                </Text>

                <Pressable
                  onPress={applyServings}
                  style={{
                    paddingVertical: 15,
                    borderRadius: 16,
                    alignItems: 'center',
                    backgroundColor: designTokens.colors.brand,
                  }}
                >
                  <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 15, color: '#fff', letterSpacing: -0.2 }}>
                    Update servings
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
