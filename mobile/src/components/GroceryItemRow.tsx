// GroceryItemRow — one checkable line in the shopping list.
//
// Extracted verbatim from app/(tabs)/grocery.tsx and wrapped in React.memo.
// That screen holds ~32 pieces of local state (modals, date pickers, voice
// capture, edit drafts); before this split, touching any of them re-rendered
// every row in the list. Markup, styles and behaviour are unchanged.
//
// `onToggle` / `onDelete` now take the item id instead of being pre-bound
// zero-arg closures. The call sites used to build `() => onToggle(item.id)`
// inline, which would have handed memo a new function per row per render and
// made it a no-op.
//
// Note: this row subscribes to the measurement-system preference directly.
// That's deliberate — a store subscription is independent of the memo
// boundary, so a unit-system change still repaints every row immediately.
import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { FadeInRight, FadeOutRight, Layout } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Check, Trash2, CookingPot } from 'lucide-react-native';
import { designTokens, getThemeColors } from '@/lib/design-tokens';
import { useMealPlanStore, type GroceryItem } from '@/lib/store';
import {
  formatFromBaseUnit,
  isConvertibleUnit,
  resolveMeasurementSystem,
  type MeasurementSystem,
} from '@/lib/unit-conversion';

// Display label for a grocery item's amount in the chosen system. Storage is
// metric; imperial re-formats from the base value (falls back to the stored
// display string when there's no base value or in metric).
export function groceryQuantityLabel(item: GroceryItem, system: MeasurementSystem): string {
  // Custom units the user typed (e.g. "bag") are stored verbatim and must never
  // be re-formatted through the metric/imperial converter.
  if (
    system === 'imperial' &&
    item.quantity_base != null &&
    item.base_unit &&
    isConvertibleUnit(item.base_unit)
  ) {
    return formatFromBaseUnit(item.quantity_base, item.base_unit, item.name, 'imperial');
  }
  return `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`;
}

// Only the first rows in a section animate in. Past that the stagger is never
// perceived as a stagger, and re-running it on every list update is pure cost.
const ANIMATE_FIRST_N = 8;

export interface GroceryItemRowProps {
  item: GroceryItem;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  isDark: boolean;
  index: number;
  checkColor?: string;
}

function GroceryItemRowImpl({
  item,
  onToggle,
  onDelete,
  isDark,
  index,
  checkColor,
}: GroceryItemRowProps) {
  const colors = getThemeColors(isDark);
  const measurementSystem = useMealPlanStore((s) => resolveMeasurementSystem(s.preferences.measurementSystem));
  // Storage is metric; when the user chose imperial, re-format from the base
  // value so weights show oz/lb and volumes show cups/tbsp/tsp. Items without a
  // base value (or in metric) fall back to their stored display string.
  const quantityLabel = groceryQuantityLabel(item, measurementSystem);
  // Distinct recipes this item is bought for — the "used in N recipes" proof
  // that shared-ingredient planning is working. (recipeIds is deduped upstream.)
  const sharedCount = item.recipeIds?.length ?? 0;

  const handleToggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle(item.id);
  }, [onToggle, item.id]);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDelete(item.id);
  }, [onDelete, item.id]);

  const done = item.isChecked;

  return (
    <Animated.View
      entering={index < ANIMATE_FIRST_N ? FadeInRight.delay(index * 30).springify() : undefined}
      exiting={FadeOutRight.springify()}
      layout={Layout.springify()}
    >
      <Pressable
        onPress={handleToggle}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingVertical: 12,
          paddingHorizontal: 4,
        }}
      >
        {/* Checkbox — design's 26×26 rounded-9, hair border or brand fill */}
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 9,
            borderWidth: done ? 0 : 1.5,
            borderColor: colors.hair,
            backgroundColor: done ? (checkColor || designTokens.colors.brand) : colors.bg,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {done && <Check size={15} color="#fff" strokeWidth={2.6} />}
        </View>

        {/* Item details */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 15.5,
              color: done ? designTokens.colors.ink3 : colors.ink,
              letterSpacing: -0.155,
              lineHeight: 20,
              textDecorationLine: done ? 'line-through' : 'none',
              textDecorationColor: designTokens.colors.ink3,
            }}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 12.5,
                color: done ? designTokens.colors.ink3 : designTokens.colors.ink2,
              }}
              numberOfLines={1}
            >
              {quantityLabel}
            </Text>
            {/* Shared-ingredient proof — the concrete payoff of grocery
                optimisation. Only shown when an item spans 2+ recipes. */}
            {sharedCount >= 2 && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                  paddingHorizontal: 7,
                  paddingVertical: 1.5,
                  borderRadius: 999,
                  backgroundColor: done
                    ? 'transparent'
                    : isDark
                      ? 'rgba(84,100,69,0.20)'
                      : 'rgba(84,100,69,0.10)',
                }}
              >
                <CookingPot
                  size={10}
                  color={done ? designTokens.colors.ink3 : designTokens.colors.brand}
                  strokeWidth={2}
                />
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 11,
                    color: done ? designTokens.colors.ink3 : designTokens.colors.brand,
                  }}
                >
                  Used in {sharedCount} recipes
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Delete (small, ink3) */}
        <Pressable onPress={handleDelete} hitSlop={8} style={{ padding: 4 }}>
          <Trash2 size={15} color={designTokens.colors.ink3} strokeWidth={1.6} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

export const GroceryItemRow = React.memo(GroceryItemRowImpl);
