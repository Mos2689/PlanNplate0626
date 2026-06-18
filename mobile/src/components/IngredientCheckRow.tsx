// IngredientCheckRow — premium single-line ingredient row for the
// Vibe Cooking "Ingredients" tab. Editorial pattern: checkbox on the
// left, ingredient name as primary type, quantity right-aligned as
// quiet metadata. No chips, no nested animated wrappers — one clean
// flex row.

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Check } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { designTokens } from '@/lib/design-tokens';

interface IngredientCheckRowProps {
  name: string;
  quantity: string;
  checked: boolean;
  accent: string;
  accentSoft: string;
  onToggle: () => void;
  showDivider: boolean;
  isDark?: boolean;
}

export function IngredientCheckRow({
  name,
  quantity,
  checked,
  accent,
  accentSoft,
  onToggle,
  showDivider,
  isDark = false,
}: IngredientCheckRowProps) {
  const t = useSharedValue(checked ? 1 : 0);

  React.useEffect(() => {
    t.value = withSpring(checked ? 1 : 0, { damping: 18, stiffness: 220 });
  }, [checked, t]);

  const checkScale = useAnimatedStyle(() => ({
    transform: [{ scale: 0.6 + t.value * 0.4 }],
    opacity: t.value,
  }));

  const bgStyle = useAnimatedStyle(() => ({
    opacity: t.value * (isDark ? 0.06 : 1),
  }));

  const handleTap = () => {
    Haptics.selectionAsync();
    onToggle();
  };

  return (
    <Pressable
      onPress={handleTap}
      hitSlop={4}
      style={({ pressed }) => ({
        position: 'relative',
        borderBottomWidth: showDivider ? 1 : 0,
        borderBottomColor: isDark ? '#222' : designTokens.colors.hair2,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {/* Checked-state background wash (animated) */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: isDark ? '#FFFFFF' : accentSoft,
          },
          bgStyle,
        ]}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 16,
          paddingHorizontal: 18,
        }}
      >
        {/* Checkbox */}
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: checked ? accent : isDark ? '#3a3a3a' : designTokens.colors.hair,
            backgroundColor: checked ? accent : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Animated.View style={checkScale}>
            <Check size={14} color="#FFFFFF" strokeWidth={3} />
          </Animated.View>
        </View>

        {/* Ingredient name — primary */}
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            marginLeft: 14,
            fontFamily: designTokens.font.semibold,
            fontSize: 15.5,
            letterSpacing: -0.25,
            color: isDark ? '#fff' : designTokens.colors.ink,
            textTransform: 'capitalize',
            textDecorationLine: checked ? 'line-through' : 'none',
            opacity: checked ? 0.55 : 1,
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
            color: checked
              ? isDark
                ? '#666'
                : designTokens.colors.ink3
              : isDark
                ? '#888'
                : designTokens.colors.ink2,
            opacity: checked ? 0.6 : 1,
          }}
        >
          {quantity}
        </Text>
      </View>
    </Pressable>
  );
}
