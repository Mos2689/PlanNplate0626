// TagPicker — guided recipe-tag editor.
//
// Two parts:
//   1. Meal type — tap-to-toggle chips from the shared taxonomy
//      (Breakfast, Lunch/Dinner, Snack, Appetiser, Side Dish, Dessert,
//      Drink). Selecting one writes its canonical tag; these drive the
//      Recipes-tab filter chips.
//   2. Other tags — free-form descriptive tags (vegetarian, quick, …)
//      shown as removable chips with an inline "add" input.
//
// Fully controlled: the parent owns the `tags` array and receives every
// change through `onChange`. Meal-type and custom tags live together in
// that one array — the component derives which is which via the taxonomy.

import React, { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { X as XIcon, Plus, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { designTokens } from '@/lib/design-tokens';
import {
  MEAL_TYPE_CATEGORIES,
  MEAL_TYPE_MATCH_SET,
  type RecipeCategory,
} from '@/lib/recipe-categories';

interface TagPickerProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  isDark?: boolean;
}

export function TagPicker({ tags, onChange, isDark = false }: TagPickerProps) {
  const [draft, setDraft] = useState('');
  const lower = tags.map((t) => t.toLowerCase());

  const isCategoryActive = (cat: RecipeCategory) =>
    cat.match.some((m) => lower.includes(m));

  const toggleCategory = (cat: RecipeCategory) => {
    Haptics.selectionAsync();
    if (isCategoryActive(cat)) {
      // Drop every tag that maps to this category.
      onChange(tags.filter((t) => !cat.match.includes(t.toLowerCase())));
    } else {
      onChange([...tags, cat.tag]);
    }
  };

  // Custom tags = anything that isn't a meal-type keyword.
  const customTags = tags.filter((t) => !MEAL_TYPE_MATCH_SET.has(t.toLowerCase()));

  const addCustom = () => {
    const value = draft.trim();
    if (!value) return;
    const exists = tags.some((t) => t.toLowerCase() === value.toLowerCase());
    if (!exists) {
      Haptics.selectionAsync();
      onChange([...tags, value]);
    }
    setDraft('');
  };

  const removeTag = (tag: string) => {
    Haptics.selectionAsync();
    onChange(tags.filter((t) => t !== tag));
  };

  const eyebrow = {
    fontFamily: designTokens.font.medium,
    fontSize: 11,
    letterSpacing: 0.55,
    textTransform: 'uppercase' as const,
    color: isDark ? '#888' : designTokens.colors.ink3,
    marginBottom: 12,
  };

  return (
    <View>
      {/* ── Meal type ───────────────────────────────────────── */}
      <Text style={eyebrow}>Meal type</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {MEAL_TYPE_CATEGORIES.map((cat) => {
          const active = isCategoryActive(cat);
          return (
            <Pressable
              key={cat.key}
              onPress={() => toggleCategory(cat)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 13,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: active
                  ? designTokens.colors.brand
                  : isDark
                    ? '#1a1a1a'
                    : '#FFFFFF',
                borderWidth: 1,
                borderColor: active
                  ? designTokens.colors.brand
                  : isDark
                    ? '#2a2a2a'
                    : designTokens.colors.hair,
              }}
            >
              {active && (
                <Check size={12} color={designTokens.colors.cream} strokeWidth={2.6} />
              )}
              <Text
                style={{
                  fontFamily: active
                    ? designTokens.font.semibold
                    : designTokens.font.medium,
                  fontSize: 13,
                  color: active
                    ? designTokens.colors.cream
                    : isDark
                      ? '#fff'
                      : designTokens.colors.ink,
                  letterSpacing: -0.065,
                }}
              >
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Other tags ──────────────────────────────────────── */}
      <Text style={eyebrow}>Other tags</Text>

      {customTags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {customTags.map((tag) => (
            <View
              key={tag}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingLeft: 13,
                paddingRight: 9,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: isDark ? '#1f1f1f' : designTokens.colors.hair2,
                borderWidth: 1,
                borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 13,
                  color: isDark ? '#fff' : designTokens.colors.ink,
                  letterSpacing: -0.065,
                }}
              >
                {tag}
              </Text>
              <Pressable onPress={() => removeTag(tag)} hitSlop={8}>
                <XIcon size={14} color={isDark ? '#888' : designTokens.colors.ink3} strokeWidth={2} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Add-a-tag input */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 4,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: isDark ? '#2a2a2a' : designTokens.colors.hair,
          backgroundColor: isDark ? '#1a1a1a' : '#FFFFFF',
        }}
      >
        <TextInput
          value={draft}
          onChangeText={(text) => {
            // Commit on comma so "quick," adds a chip mid-type.
            if (text.endsWith(',')) {
              setDraft(text.slice(0, -1));
              // defer add until state settles
              const value = text.slice(0, -1).trim();
              if (value) {
                const exists = tags.some((t) => t.toLowerCase() === value.toLowerCase());
                if (!exists) onChange([...tags, value]);
                setDraft('');
              }
            } else {
              setDraft(text);
            }
          }}
          onSubmitEditing={addCustom}
          blurOnSubmit={false}
          returnKeyType="done"
          placeholder="Add a tag (e.g. vegetarian, quick)"
          placeholderTextColor={isDark ? '#666' : designTokens.colors.ink3}
          autoCapitalize="none"
          style={{
            flex: 1,
            fontFamily: designTokens.font.regular,
            fontSize: 14,
            color: isDark ? '#fff' : designTokens.colors.ink,
            paddingVertical: 8,
          }}
        />
        <Pressable
          onPress={addCustom}
          disabled={!draft.trim()}
          hitSlop={8}
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: draft.trim()
              ? designTokens.colors.brand
              : isDark
                ? '#2a2a2a'
                : designTokens.colors.hair2,
          }}
        >
          <Plus
            size={17}
            color={draft.trim() ? designTokens.colors.cream : designTokens.colors.ink3}
            strokeWidth={2.2}
          />
        </Pressable>
      </View>
    </View>
  );
}
