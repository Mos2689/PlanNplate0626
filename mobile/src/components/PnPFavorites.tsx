// PnPFavorites — home-tab section that surfaces the recipes the user
// has loved or rated highly over the PAST WEEK. Replaces the old
// "PnP Specials" curated-plan rail.
//
// Data is computed by the parent (home screen) from recipe ratings +
// Vibe-Cooking ratings within the last 7 days, so this component stays
// purely presentational. On a fresh account there are no favorites yet,
// so it renders a gentle empty state instead of hiding.
//
// Brand rules preserved:
//   • One italic word per surface → "Your *favorites*." in the header.
//   • Sage / olive accents only.
//   • FadeInDown stagger so the section reads as its own beat.
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Heart, Star, ChevronRight } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { designTokens, elevation, getThemeColors } from '@/lib/design-tokens';
import type { Recipe } from '@/lib/store';

export interface FavoriteRecipe {
  recipe: Recipe;
  stars: number; // 1–5 (the highest signal seen for this recipe this week)
  at: number; // epoch ms of the most recent love/rating
}

interface PnPFavoritesProps {
  favorites: FavoriteRecipe[];
  onRecipePress?: (recipeId: string) => void;
  isDark?: boolean;
}

function relativeDay(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

export function PnPFavorites({ favorites, onRecipePress, isDark = false }: PnPFavoritesProps) {
  const colors = getThemeColors(isDark);

  return (
    <View style={{ paddingBottom: 30, position: 'relative' }}>
      {/* Header — editorial signature carries the section identity. */}
      <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <View
            style={{
              width: 18,
              height: 1.5,
              backgroundColor: designTokens.colors.olive,
              borderRadius: 1,
            }}
          />
          <Text
            style={{
              fontFamily: designTokens.font.semibold,
              fontSize: 10.5,
              letterSpacing: 1.3,
              textTransform: 'uppercase',
              color: designTokens.colors.olive,
            }}
          >
            The Favorites
          </Text>
        </View>
        <Text
          style={{
            fontFamily: designTokens.font.medium,
            fontSize: 21,
            color: colors.ink,
            letterSpacing: -0.42,
          }}
        >
          Your{' '}
          <Text
            style={{
              fontFamily: designTokens.font.serifItalic,
              fontStyle: 'italic',
              fontSize: 24,
              letterSpacing: -0.22,
            }}
          >
            favorites
          </Text>
          .
        </Text>
        <Text
          style={{
            fontFamily: designTokens.font.regular,
            fontSize: 12.5,
            color: colors.ink3,
            marginTop: 3,
            lineHeight: 17,
          }}
        >
          Meals you loved or rated highly this past week.
        </Text>
      </View>

      {favorites.length === 0 ? (
        <EmptyFavorites isDark={isDark} />
      ) : (
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          {favorites.map((fav, index) => (
            <FavoriteCard
              key={fav.recipe.id}
              fav={fav}
              index={index}
              onPress={() => onRecipePress?.(fav.recipe.id)}
              isDark={isDark}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Per-recipe card ───────────────────────────────────────────────────────

function FavoriteCard({
  fav,
  index,
  onPress,
  isDark,
}: {
  fav: FavoriteRecipe;
  index: number;
  onPress: () => void;
  isDark: boolean;
}) {
  const cardBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const inkPrimary = isDark ? '#fff' : designTokens.colors.ink;
  const inkSecondary = isDark ? '#aaa' : designTokens.colors.ink2;
  const inkTertiary = isDark ? '#888' : designTokens.colors.ink3;

  const { recipe } = fav;
  const totalMin = (recipe.cookTime || 0) + (recipe.prepTime || 0);

  return (
    <Animated.View entering={FadeInDown.delay(index * 70).springify()}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        accessibilityLabel={`${recipe.name}, rated ${fav.stars} stars`}
      >
        {({ pressed }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: cardBorder,
              backgroundColor: cardBg,
              padding: 10,
              ...elevation.card,
              transform: [{ scale: pressed ? 0.985 : 1 }],
            }}
          >
            {/* Thumbnail */}
            <View
              style={{
                width: 66,
                height: 66,
                borderRadius: 13,
                overflow: 'hidden',
                backgroundColor: '#F4F0E8',
              }}
            >
              {recipe.imageUrl ? (
                <Image
                  source={{ uri: recipe.imageUrl }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                  transition={200}
                />
              ) : null}
            </View>

            {/* Text */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 15,
                  color: inkPrimary,
                  letterSpacing: -0.2,
                }}
                numberOfLines={2}
              >
                {recipe.name}
              </Text>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 }}
              >
                {/* Star rating */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Star
                    size={12}
                    color={designTokens.colors.olive}
                    fill={designTokens.colors.olive}
                    strokeWidth={0}
                  />
                  <Text
                    style={{
                      fontFamily: designTokens.font.semibold,
                      fontSize: 12,
                      color: inkSecondary,
                    }}
                  >
                    {fav.stars}.0
                  </Text>
                </View>
                <Dot inkTertiary={inkTertiary} />
                <Text
                  style={{
                    fontFamily: designTokens.font.regular,
                    fontSize: 12,
                    color: inkSecondary,
                  }}
                >
                  {relativeDay(fav.at)}
                </Text>
                {totalMin > 0 && (
                  <>
                    <Dot inkTertiary={inkTertiary} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.regular,
                        fontSize: 12,
                        color: inkSecondary,
                      }}
                    >
                      {totalMin} min
                    </Text>
                  </>
                )}
              </View>
            </View>

            <ChevronRight size={18} color={inkTertiary} strokeWidth={1.7} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─── Empty state (fresh account / no loved meals this week) ──────────────────

function EmptyFavorites({ isDark }: { isDark: boolean }) {
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const inkSecondary = isDark ? '#aaa' : designTokens.colors.ink2;
  const inkTertiary = isDark ? '#888' : designTokens.colors.ink3;

  return (
    <Animated.View entering={FadeInDown.springify()} style={{ paddingHorizontal: 16 }}>
      <View
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: cardBorder,
          paddingVertical: 28,
          paddingHorizontal: 22,
          alignItems: 'center',
          backgroundColor: isDark ? '#1a1a1a' : designTokens.colors.cream,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            backgroundColor: isDark ? '#222' : '#FFFFFF',
            borderWidth: 1,
            borderColor: cardBorder,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
          }}
        >
          <Heart size={20} color={designTokens.colors.olive} strokeWidth={1.8} />
        </View>
        <Text
          style={{
            fontFamily: designTokens.font.semibold,
            fontSize: 15,
            color: inkSecondary,
            textAlign: 'center',
          }}
        >
          No favorites yet
        </Text>
        <Text
          style={{
            fontFamily: designTokens.font.regular,
            fontSize: 13,
            lineHeight: 19,
            color: inkTertiary,
            textAlign: 'center',
            marginTop: 5,
          }}
        >
          Rate the meals you cook, and the ones you love this week will gather here.
        </Text>
      </View>
    </Animated.View>
  );
}

function Dot({ inkTertiary }: { inkTertiary: string }) {
  return (
    <View
      style={{
        width: 2,
        height: 2,
        borderRadius: 999,
        backgroundColor: inkTertiary,
        opacity: 0.6,
      }}
    />
  );
}
