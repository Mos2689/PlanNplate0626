// GroceryRecipePicker — the "From Recipes" flow on the Grocery tab.
//
// Multi-select from the full recipe library; on confirm, each selected recipe's
// ingredients are added straight into the grocery list (recipe-attributed, at
// the recipe's own serving size) via addRecipesToGroceryList. Selection starts
// empty every open — this is an add-only surface, not an edit surface.
//
// Modeled on CollectionRecipePicker for a consistent look and behaviour.
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, Pressable, Modal, TextInput, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { X, Check, Search, Clock } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useMealPlanStore, type Recipe } from '@/lib/store';
import { designTokens, getThemeColors } from '@/lib/design-tokens';

interface GroceryRecipePickerProps {
  visible: boolean;
  isDark: boolean;
  onClose: () => void;
  /** Fired after recipes are added, so the parent can show a confirmation. */
  onAdded?: (count: number) => void;
}

export function GroceryRecipePicker({
  visible,
  isDark,
  onClose,
  onAdded,
}: GroceryRecipePickerProps) {
  const colors = getThemeColors(isDark);
  const insets = useSafeAreaInsets();
  const recipes = useMealPlanStore((s) => s.recipes);
  const addRecipesToGroceryList = useMealPlanStore((s) => s.addRecipesToGroceryList);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reset the staged selection each time the picker opens.
  useEffect(() => {
    if (visible) {
      setSelected(new Set());
      setQuery('');
    }
  }, [visible]);

  // Dedupe by name to match the Recipes tab's library view.
  const uniqueRecipes = useMemo(() => {
    const seen = new Set<string>();
    return recipes.filter((r) => {
      const key = r.name.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [recipes]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return uniqueRecipes;
    return uniqueRecipes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [uniqueRecipes, query]);

  const toggle = (id: string) => {
    Haptics.selectionAsync();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = () => {
    const ids = [...selected];
    if (ids.length > 0) {
      addRecipesToGroceryList(ids);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onAdded?.(ids.length);
    }
    onClose();
  };

  const count = selected.size;

  const renderRow = ({ item }: { item: Recipe }) => {
    const checked = selected.has(item.id);
    const totalTime = (item.prepTime ?? 0) + (item.cookTime ?? 0);
    return (
      <Pressable
        onPress={() => toggle(item.id)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 20,
          paddingVertical: 10,
        }}
      >
        <Image
          source={{ uri: item.imageUrl }}
          style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: '#F4F0E8' }}
          contentFit="cover"
          transition={120}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 15,
              color: colors.ink,
              letterSpacing: -0.15,
            }}
          >
            {item.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Clock size={11} color={colors.ink3} strokeWidth={1.8} />
            <Text
              numberOfLines={1}
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 12,
                color: colors.ink3,
              }}
            >
              {totalTime} min
              {item.ingredients?.length ? ` · ${item.ingredients.length} ingredients` : ''}
            </Text>
          </View>
        </View>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 999,
            borderWidth: checked ? 0 : 1.5,
            borderColor: colors.hair,
            backgroundColor: checked ? designTokens.colors.brand : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {checked && <Check size={14} color="#fff" strokeWidth={3} />}
        </View>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, paddingTop: insets.top }}>
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 14,
            }}
          >
            <Pressable onPress={onClose} hitSlop={8}>
              <X size={22} color={colors.ink} strokeWidth={1.8} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{
                  textAlign: 'center',
                  fontFamily: designTokens.font.semibold,
                  fontSize: 16,
                  color: colors.ink,
                  letterSpacing: -0.25,
                }}
              >
                Add from recipes
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  textAlign: 'center',
                  marginTop: 1,
                  fontFamily: designTokens.font.regular,
                  fontSize: 12,
                  color: colors.ink3,
                }}
              >
                Pick recipes to add their ingredients
              </Text>
            </View>
            {/* Spacer to balance the close button and keep the title centered. */}
            <View style={{ width: 22 }} />
          </View>

          {/* Search */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.hair,
                backgroundColor: colors.pill,
              }}
            >
              <Search size={16} color={colors.ink3} strokeWidth={1.8} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search your recipes"
                placeholderTextColor={colors.ink3}
                style={{
                  flex: 1,
                  padding: 0,
                  fontFamily: designTokens.font.regular,
                  fontSize: 14.5,
                  color: colors.ink,
                }}
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <X size={15} color={colors.ink3} strokeWidth={2} />
                </Pressable>
              )}
            </View>
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={renderRow}
            contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text
                style={{
                  textAlign: 'center',
                  paddingTop: 40,
                  paddingHorizontal: 40,
                  fontFamily: designTokens.font.regular,
                  fontSize: 13.5,
                  color: colors.ink3,
                }}
              >
                {uniqueRecipes.length === 0
                  ? 'No recipes in your library yet.'
                  : 'No recipes match that search.'}
              </Text>
            }
          />

          {/* Sticky confirm */}
          <View
            style={{
              position: 'absolute',
              left: 20,
              right: 20,
              bottom: Math.max(insets.bottom, 20) + 8,
            }}
          >
            <Pressable
              onPress={handleAdd}
              disabled={count === 0}
              style={{
                paddingVertical: 15,
                borderRadius: 16,
                alignItems: 'center',
                backgroundColor: count === 0 ? colors.hair : designTokens.colors.brand,
                shadowColor: designTokens.colors.brandDeep,
                shadowOpacity: count === 0 ? 0 : 0.22,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: count === 0 ? 0 : 3,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 15,
                  color: count === 0 ? colors.ink3 : '#fff',
                  letterSpacing: -0.2,
                }}
              >
                {count > 0
                  ? `Add ${count} ${count === 1 ? 'recipe' : 'recipes'}`
                  : 'Select recipes to add'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
