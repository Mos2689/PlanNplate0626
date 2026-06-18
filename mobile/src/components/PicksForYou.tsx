// PicksForYou Component - PlannPlate Home design
// Horizontal carousel of recipe suggestions
import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { ChevronRight } from 'lucide-react-native';
import { designTokens, getThemeColors } from '@/lib/design-tokens';

export interface PickItem {
  id: string;
  title: string;
  image?: string;
  reason: string;
  meta?: string;
}

interface PicksForYouProps {
  items: PickItem[];
  title?: string;
  subtitle?: string;
  onItemPress?: (item: PickItem, index: number) => void;
  onSeeAllPress?: () => void;
  isDark?: boolean;
}

export function PicksForYou({
  items,
  title = 'Good fits for your week',
  subtitle = "Based on what's worked before",
  onItemPress,
  onSeeAllPress,
  isDark = false,
}: PicksForYouProps) {
  const colors = getThemeColors(isDark);

  if (items.length === 0) return null;

  return (
    <View style={{ paddingBottom: 26 }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 16,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 14,
        }}
      >
        <View>
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 19,
              color: colors.ink,
              letterSpacing: -0.38,
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 12.5,
              color: designTokens.colors.ink3,
              marginTop: 1,
            }}
          >
            {subtitle}
          </Text>
        </View>
        {onSeeAllPress && (
          <Pressable
            onPress={onSeeAllPress}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 13,
                color: designTokens.colors.ink2,
              }}
            >
              See all
            </Text>
            <ChevronRight size={14} color={designTokens.colors.ink2} strokeWidth={1.6} />
          </Pressable>
        )}
      </View>

      {/* Horizontal scroll */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4, gap: 12 }}
      >
        {items.map((item, index) => (
          <Pressable
            key={item.id || index}
            onPress={() => onItemPress?.(item, index)}
            style={{
              width: 192,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: colors.hair,
              backgroundColor: colors.bg,
              overflow: 'hidden',
            }}
          >
            {/* Image */}
            <View style={{ width: '100%', height: 130, backgroundColor: '#F4F0E8' }}>
              {item.image ? (
                <Image
                  source={{ uri: item.image }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                  transition={150}
                />
              ) : null}
              {/* Reason chip */}
              <View
                style={{
                  position: 'absolute',
                  top: 10,
                  left: 10,
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.92)',
                }}
              >
                <Text
                  style={{
                    fontFamily: designTokens.font.medium,
                    fontSize: 11,
                    color: colors.ink,
                    letterSpacing: -0.055,
                  }}
                >
                  {item.reason}
                </Text>
              </View>
            </View>

            {/* Content */}
            <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 13 }}>
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 14,
                  color: colors.ink,
                  letterSpacing: -0.14,
                  lineHeight: 18,
                }}
                numberOfLines={2}
              >
                {item.title}
              </Text>
              {item.meta && (
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12,
                    color: designTokens.colors.ink3,
                    marginTop: 4,
                  }}
                >
                  {item.meta}
                </Text>
              )}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// Mock data for development/testing
export const mockPicks: PickItem[] = [
  {
    id: '1',
    title: 'Chickpea Tikka Bowls',
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&auto=format&q=80',
    reason: 'Fast weeknight pick',
    meta: '25 min · One-pan',
  },
  {
    id: '2',
    title: 'Sheet-pan Salmon & Greens',
    image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&auto=format&q=80',
    reason: 'Similar to meals you cooked',
    meta: '30 min · 1 pan',
  },
  {
    id: '3',
    title: 'Red Lentil Soup',
    image: 'https://images.unsplash.com/photo-1547592180-85f173990554?w=400&auto=format&q=80',
    reason: 'Budget-friendly',
    meta: '20 min · Pantry staples',
  },
  {
    id: '4',
    title: 'Miso Glazed Tofu Rice',
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&auto=format&q=80',
    reason: 'Good for tonight',
    meta: '22 min · One-pan',
  },
];
