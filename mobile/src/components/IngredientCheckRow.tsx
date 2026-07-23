// IngredientCheckRow — premium single-line ingredient row for the
// Vibe Cooking "Ingredients" tab. Editorial pattern: ingredient name as
// primary type, quantity right-aligned as quiet metadata. No checkbox,
// no chips, no nested animated wrappers — one clean flex row.

import React from 'react';
import { View, Text } from 'react-native';
import { designTokens } from '@/lib/design-tokens';

interface IngredientCheckRowProps {
  name: string;
  quantity: string;
  showDivider: boolean;
  isDark?: boolean;
}

export function IngredientCheckRow({
  name,
  quantity,
  showDivider,
  isDark = false,
}: IngredientCheckRowProps) {
  return (
    <View
      style={{
        borderBottomWidth: showDivider ? 1 : 0,
        borderBottomColor: isDark ? '#222' : designTokens.colors.hair2,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 16,
          paddingHorizontal: 18,
        }}
      >
        {/* Ingredient name — primary */}
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: designTokens.font.semibold,
            fontSize: 15.5,
            letterSpacing: -0.25,
            color: isDark ? '#fff' : designTokens.colors.ink,
            textTransform: 'capitalize',
          }}
        >
          {name}
        </Text>

        {/* Quantity — right-aligned metadata */}
        <Text
          numberOfLines={1}
          style={{
            marginLeft: 12,
            fontFamily: designTokens.font.medium,
            fontSize: 13,
            letterSpacing: 0.1,
            color: isDark ? '#888' : designTokens.colors.ink2,
          }}
        >
          {quantity}
        </Text>
      </View>
    </View>
  );
}
