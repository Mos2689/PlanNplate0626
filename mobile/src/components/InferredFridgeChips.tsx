// InferredFridgeChips — the "What's in your fridge" chip cluster on
// the Vibe Cooking screen. Lands pre-populated by the parent (via
// `inferLikelyFridgeIngredients()`). Each chip is a removable pill;
// tapping the × cuts it from the list instantly. Below the chip row,
// a small inline input + button lets the user add anything missing.
//
// Visual anatomy:
//
//   ┌──────────────┐  ┌────────────┐  ┌──────────┐
//   │ chicken  × │  │ kale     × │  │ rice  × │  ← cream pill + ×
//   └──────────────┘  └────────────┘  └──────────┘
//
//   ┌──────────────────────────────────┐  ┌────┐
//   │ + Add ingredient                 │  │ →  │  ← inline add field
//   └──────────────────────────────────┘  └────┘
//
// Controlled component — parent owns the array, we just emit `onChange`.

import React, { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { designTokens, getThemeColors } from '@/lib/design-tokens';

interface InferredFridgeChipsProps {
  items: string[];
  onChange: (next: string[]) => void;
  isDark?: boolean;
}

export function InferredFridgeChips({
  items,
  onChange,
  isDark = false,
}: InferredFridgeChipsProps) {
  const colors = getThemeColors(isDark);
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const [draft, setDraft] = useState('');

  const removeAt = (idx: number) => {
    Haptics.selectionAsync();
    const next = items.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  const submitAdd = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return;
    // De-dupe (case-insensitive) — don't add the same ingredient twice
    const exists = items.some(
      (it) => it.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exists) {
      setDraft('');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange([...items, trimmed]);
    setDraft('');
  };

  return (
    <View>
      {/* Chip cluster */}
      {items.length > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 12,
          }}
        >
          {items.map((item, idx) => (
            <View
              key={`${item}-${idx}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingLeft: 11,
                paddingRight: 6,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: cardBorder,
                backgroundColor: designTokens.colors.cream,
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 12.5,
                  color: colors.ink,
                  letterSpacing: -0.1,
                }}
                numberOfLines={1}
              >
                {item}
              </Text>
              <Pressable
                onPress={() => removeAt(idx)}
                hitSlop={6}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  backgroundColor: 'rgba(154, 150, 139, 0.18)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X
                  size={12}
                  color={designTokens.colors.ink2}
                  strokeWidth={2.4}
                />
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Text
          style={{
            fontFamily: designTokens.font.regular,
            fontSize: 12.5,
            color: designTokens.colors.ink3,
            marginBottom: 12,
            fontStyle: 'italic',
          }}
        >
          No fridge ingredients yet — add what you have below.
        </Text>
      )}

      {/* Inline "+ Add ingredient" row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: cardBorder,
            backgroundColor: colors.bg,
          }}
        >
          <Plus
            size={15}
            color={designTokens.colors.ink3}
            strokeWidth={2}
          />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submitAdd}
            placeholder="Add ingredient"
            placeholderTextColor={designTokens.colors.ink3}
            returnKeyType="done"
            style={{
              flex: 1,
              fontFamily: designTokens.font.regular,
              fontSize: 13.5,
              color: colors.ink,
              padding: 0,
            }}
          />
        </View>
        <Pressable
          onPress={submitAdd}
          disabled={draft.trim().length === 0}
          hitSlop={6}
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            backgroundColor:
              draft.trim().length > 0
                ? designTokens.colors.olive
                : designTokens.colors.hair,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Plus
            size={18}
            color={
              draft.trim().length > 0
                ? '#F6F2E9'
                : designTokens.colors.ink3
            }
            strokeWidth={2.2}
          />
        </Pressable>
      </View>
    </View>
  );
}
