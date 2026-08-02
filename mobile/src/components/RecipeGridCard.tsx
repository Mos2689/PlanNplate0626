// RecipeGridCard — 2-up visual grid tile (image + overlaid name/meta).
//
// Extracted verbatim from app/(tabs)/recipes.tsx and wrapped in React.memo.
// It previously lived inline in that screen, so every keystroke in the search
// box, every filter tap, and every save toggle re-rendered all ~N visible
// cards along with the screen. The markup, styles and behaviour are unchanged.
//
// Handlers are taken as (recipe) / (recipeId) callbacks rather than pre-bound
// zero-arg closures. The screen's handlers are already useCallback-stable, so
// passing them straight through keeps prop identity stable across renders —
// binding them per item in the parent's renderItem would have created four new
// functions per card per render and defeated the memo entirely.
import React, { useCallback } from 'react';
import { View, Text, Pressable, Dimensions } from 'react-native';
import { DishImage } from '@/components/DishImage';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Heart, Plus, Camera } from 'lucide-react-native';
import { designTokens, getThemeColors } from '@/lib/design-tokens';
import { isDefaultRecipeImage } from '@/lib/recipe-image';
import { inspiredBlurhashFor } from '@/lib/inspired-adapters';
import type { Recipe } from '@/lib/store';

const GRID_CARD_W = (Dimensions.get('window').width - 40 - 12) / 2; // 20px pad ×2 + 12px gap

// Only the first screenful animates in. Beyond that the entrance is never seen
// as an entrance — the cell is being recycled mid-scroll, and re-running the
// spring on recycle is what made fast scrolling stutter.
const ANIMATE_FIRST_N = 6;

export interface RecipeGridCardProps {
  recipe: Recipe;
  onPress: (recipe: Recipe) => void;
  onToggleSave: (recipeId: string) => void;
  /** Quick-add → opens the add-to-meal-plan picker without opening the recipe. */
  onAddToPlan: (recipeId: string) => void;
  /** Long-press → "Save to collection" sheet. */
  onLongPress?: (recipe: Recipe) => void;
  isDark: boolean;
  index: number;
}

function RecipeGridCardImpl({
  recipe,
  onPress,
  onToggleSave,
  onAddToPlan,
  onLongPress,
  isDark,
  index,
}: RecipeGridCardProps) {
  const colors = getThemeColors(isDark);
  const totalMin = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);
  const meta: string[] = [];
  if (totalMin > 0) meta.push(`${totalMin} min`);
  if (recipe.calories) meta.push(`${recipe.calories} cal`);

  const handlePress = useCallback(() => onPress(recipe), [onPress, recipe]);
  const handleLongPress = useCallback(
    () => onLongPress?.(recipe),
    [onLongPress, recipe],
  );
  const handleAddToPlan = useCallback(
    () => onAddToPlan(recipe.id),
    [onAddToPlan, recipe.id],
  );
  const handleSave = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggleSave(recipe.id);
  }, [onToggleSave, recipe.id]);

  return (
    <Animated.View
      entering={index < ANIMATE_FIRST_N ? FadeInUp.delay(index * 60).springify() : undefined}
      style={{ width: GRID_CARD_W, marginBottom: 12 }}
    >
      <Pressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={350}
        style={{
          borderRadius: 16,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.hair,
          backgroundColor: colors.bg,
        }}
      >
        <View style={{ position: 'relative' }}>
          <DishImage
            url={recipe.imageUrl}
            blurhash={inspiredBlurhashFor(recipe.curatedSourceId)}
            width={340}
            style={{ width: '100%', aspectRatio: 1 }}
            transition={150}
            recyclingKey={recipe.id}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.78)']}
            locations={[0.4, 1]}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: '38%' }}
            pointerEvents="none"
          />
          {/* Default-image nudge — label only, shown on the stock placeholder
              photo (never a real photo). Tapping the card opens the recipe
              where the photo can be updated. */}
          {isDefaultRecipeImage(recipe.imageUrl) && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: designTokens.colors.brand,
              }}
            >
              <Camera size={11} color={designTokens.colors.cream} strokeWidth={2} />
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 10,
                  color: designTokens.colors.cream,
                  letterSpacing: -0.05,
                }}
              >
                Update image
              </Text>
            </View>
          )}
          <Pressable
            onPress={handleSave}
            hitSlop={8}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: 'rgba(0,0,0,0.28)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Heart
              size={15}
              color={recipe.isSaved ? designTokens.colors.olive : '#FFFFFF'}
              fill={recipe.isSaved ? designTokens.colors.olive : 'transparent'}
              strokeWidth={2}
            />
          </Pressable>
          {/* Quick add to meal plan — skips opening the recipe first. */}
          <Pressable
            onPress={handleAddToPlan}
            hitSlop={8}
            style={{
              position: 'absolute',
              right: 8,
              bottom: 8,
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: designTokens.colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 5,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
            }}
          >
            <Plus size={17} color="#FFFFFF" strokeWidth={2.4} />
          </Pressable>
          {/* Right inset keeps long titles clear of the quick-add button. */}
          <View style={{ position: 'absolute', left: 10, right: 44, bottom: 10 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 14,
                color: '#FFFFFF',
                letterSpacing: -0.2,
              }}
            >
              {recipe.name}
            </Text>
            {meta.length > 0 && (
              <Text
                numberOfLines={1}
                style={{
                  marginTop: 3,
                  fontFamily: designTokens.font.regular,
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.9)',
                }}
              >
                {meta.join('  ·  ')}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export const RecipeGridCard = React.memo(RecipeGridCardImpl);
