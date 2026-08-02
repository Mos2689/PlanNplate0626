// CollectionRecipePicker — bulk "Add recipes" flow, opened from inside a
// collection (its empty state, or the "Add recipes" button in the header).
//
// Unlike SaveToCollectionSheet (one recipe → many collections), this is the
// inverse: one collection → many recipes. Selection is STAGED — ticking rows
// only updates local state; the diff (additions + removals) is applied on
// "Done". That makes it usable as an edit surface too: rows already in the
// collection start checked, so unticking removes them.
import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, Pressable, Modal, TextInput, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DishImage } from '@/components/DishImage';
import { X, Check, Search } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { useMealPlanStore, type Recipe } from '@/lib/store';
import { designTokens, getThemeColors } from '@/lib/design-tokens';

interface CollectionRecipePickerProps {
  visible: boolean;
  /** Collection being edited. Null renders nothing. */
  collectionId: string | null;
  isDark: boolean;
  onClose: () => void;
}

export function CollectionRecipePicker({
  visible,
  collectionId,
  isDark,
  onClose,
}: CollectionRecipePickerProps) {
  const colors = getThemeColors(isDark);
  // NOTE: `SafeAreaView` measures natively and reports zero insets inside a
  // RN Modal, which tucked the header under the status bar. The hook reads
  // from the provider via React context — which does cross the Modal — so it
  // returns the real insets here.
  const insets = useSafeAreaInsets();
  const recipes = useMealPlanStore((s) => s.recipes);
  const collections = useMealPlanStore((s) => s.collections);
  const addRecipesToCollection = useMealPlanStore((s) => s.addRecipesToCollection);
  const removeRecipeFromCollection = useMealPlanStore((s) => s.removeRecipeFromCollection);

  const collection = collections.find((c) => c.id === collectionId) ?? null;

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Seed the staged selection from current membership each time it opens.
  useEffect(() => {
    if (visible && collection) {
      setSelected(new Set(collection.recipeIds));
      setQuery('');
    }
    // `collection.recipeIds` intentionally omitted — we only seed on open, so
    // in-flight edits aren't clobbered by the store updating underneath us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, collectionId]);

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

  // Apply the staged diff against what's actually in the collection.
  const handleDone = () => {
    if (!collection) return onClose();
    const before = new Set(collection.recipeIds);
    const additions = [...selected].filter((id) => !before.has(id));
    const removals = [...before].filter((id) => !selected.has(id));
    if (additions.length > 0) addRecipesToCollection(collection.id, additions);
    removals.forEach((id) => removeRecipeFromCollection(collection.id, id));
    if (additions.length > 0 || removals.length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onClose();
  };

  const addedCount = collection
    ? [...selected].filter((id) => !collection.recipeIds.includes(id)).length
    : 0;

  const renderRow = ({ item }: { item: Recipe }) => {
    const checked = selected.has(item.id);
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
        <DishImage
          url={item.imageUrl}
          width={150}
          style={{ width: 52, height: 52, borderRadius: 12 }}
          transition={120}
          recyclingKey={item.id}
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
          <Text
            numberOfLines={1}
            style={{
              marginTop: 2,
              fontFamily: designTokens.font.regular,
              fontSize: 12,
              color: colors.ink3,
            }}
          >
            {(item.prepTime ?? 0) + (item.cookTime ?? 0)} min
            {item.calories ? ` · ${item.calories} cal` : ''}
          </Text>
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
                Add recipes
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
                {collection?.name ?? ''}
              </Text>
            </View>
            <Pressable onPress={handleDone} hitSlop={8}>
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 15,
                  color: designTokens.colors.brand,
                }}
              >
                Done
              </Text>
            </Pressable>
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
            // Each row carries a thumbnail; keep ~a screen either side ready
            // instead of RN's default ten screens.
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={7}
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

          {/* Sticky confirm — mirrors the Done action for thumb reach. */}
          <View
            style={{
              position: 'absolute',
              left: 20,
              right: 20,
              bottom: Math.max(insets.bottom, 20) + 8,
            }}
          >
            <Pressable
              onPress={handleDone}
              style={{
                paddingVertical: 15,
                borderRadius: 16,
                alignItems: 'center',
                backgroundColor: designTokens.colors.brand,
                shadowColor: designTokens.colors.brandDeep,
                shadowOpacity: 0.22,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: 3,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 15,
                  color: '#fff',
                  letterSpacing: -0.2,
                }}
              >
                {addedCount > 0
                  ? `Add ${addedCount} ${addedCount === 1 ? 'recipe' : 'recipes'}`
                  : 'Done'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
