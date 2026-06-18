// PnPFavorites — home-tab section that surfaces the recipes the user has
// loved or rated highly. Two signals feed it (computed by the parent):
//   • RATED — recipes rated ≥4★ or Vibe-rated ≥4 in the past week (so the
//     rail refreshes weekly based on behaviour).
//   • LOVED — recipes hearted (saved) in the Recipes section.
//
// Rendered as a horizontal rail (max 8 tiles). Purely presentational; the
// parent owns the data + the 8-item cap. Fresh accounts get a gentle empty
// state instead of a hidden section.
//
// Brand rules preserved:
//   • One italic word per surface → "Your *favorites*." in the header.
//   • Sage / olive accents only.
//   • FadeInDown stagger so the section reads as its own beat.
import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Heart, Star } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { designTokens, elevation, getThemeColors } from '@/lib/design-tokens';
import type { Recipe } from '@/lib/store';

export interface FavoriteRecipe {
  recipe: Recipe;
  stars: number; // 1–5 (the highest rating seen this week); 0 for loved-only
  at: number; // epoch ms of the most recent love/rating
  kind: 'rated' | 'loved'; // 'rated' shows the star score, 'loved' shows a heart
}

interface PnPFavoritesProps {
  favorites: FavoriteRecipe[];
  onRecipePress?: (recipeId: string) => void;
  isDark?: boolean;
}

const TILE_WIDTH = 156;

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
          Recipes you loved or rated highly, updated weekly.
        </Text>
      </View>

      {favorites.length === 0 ? (
        <EmptyFavorites isDark={isDark} />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        >
          {favorites.map((fav, index) => (
            <FavoriteCard
              key={fav.recipe.id}
              fav={fav}
              index={index}
              onPress={() => onRecipePress?.(fav.recipe.id)}
              isDark={isDark}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Per-recipe tile (horizontal rail) ───────────────────────────────────────

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

  const { recipe, kind } = fav;
  const isLoved = kind === 'loved' || fav.stars <= 0;

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()} style={{ width: TILE_WIDTH }}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        accessibilityLabel={
          isLoved ? `${recipe.name}, loved` : `${recipe.name}, rated ${fav.stars} stars`
        }
      >
        {({ pressed }) => (
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: cardBorder,
              backgroundColor: cardBg,
              overflow: 'hidden',
              ...elevation.card,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            }}
          >
            {/* Thumbnail */}
            <View
              style={{
                width: '100%',
                aspectRatio: 4 / 3,
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

              {/* Signal badge — heart for loved, star score for rated. */}
              <View
                style={{
                  position: 'absolute',
                  top: 7,
                  left: 7,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 2,
                  paddingHorizontal: 5,
                  paddingVertical: 2,
                  borderRadius: 999,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                }}
              >
                {isLoved ? (
                  <Heart size={9} color="#F6F2E9" fill="#F6F2E9" strokeWidth={0} />
                ) : (
                  <>
                    <Star size={9} color="#F4C76A" fill="#F4C76A" strokeWidth={0} />
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 9.5,
                        color: '#F6F2E9',
                      }}
                    >
                      {fav.stars}.0
                    </Text>
                  </>
                )}
              </View>
            </View>

            {/* Title only — description removed to keep the tile compact. */}
            <View style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 13.5,
                  color: inkPrimary,
                  letterSpacing: -0.2,
                }}
                numberOfLines={2}
              >
                {recipe.name}
              </Text>
            </View>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─── Empty state (fresh account / no loved or rated recipes) ─────────────────

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
          Save the recipes you love, or rate the meals you cook — they'll gather here.
        </Text>
      </View>
    </Animated.View>
  );
}
