// RecipePlaceholder — the on-brand fallback shown in place of a recipe photo
// when there is no real image yet (empty URL, or the shared stock placeholder
// that Pexels/curated search falls back to).
//
// Renders the ORIGINAL Unsplash stock photo (the same id isDefaultRecipeImage
// matches on), but heavily BLURRED with a dark scrim and a "Personalise your
// recipe" caption — so the slot clearly reads as an empty placeholder inviting
// a photo, never as a real recipe image. Used by DishImage whenever
// isDefaultRecipeImage() is true, so every recipe surface (grid card, detail
// hero, full-screen viewer) shares one placeholder.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ImageStyle, StyleProp } from 'react-native';
import { Image } from 'expo-image';
import { designTokens } from '@/lib/design-tokens';
import { DEFAULT_RECIPE_IMAGE_ID } from '@/lib/recipe-image';

const CREAM = designTokens.colors.cream; // #FAF7F0
// The original Unsplash stock photo, reused here purely as a blurred backdrop.
const STOCK_URL = `https://images.unsplash.com/${DEFAULT_RECIPE_IMAGE_ID}?w=800&q=80&auto=format`;

interface RecipePlaceholderProps {
  /** Fills its parent — pass the same style DishImage would give the photo. */
  style?: StyleProp<ImageStyle>;
  /**
   * Retained for API compatibility with DishImage. The caption always shows so
   * the slot reads as a placeholder on every surface.
   */
  showLabel?: boolean;
  /**
   * When set, the whole placeholder becomes tappable — used on surfaces that
   * can add a recipe photo in place (the detail hero). Grid cards leave this
   * unset because tapping the card already navigates to the recipe.
   */
  onPress?: () => void;
}

export function RecipePlaceholder({ style, onPress }: RecipePlaceholderProps) {
  const containerStyle = [{ backgroundColor: CREAM, overflow: 'hidden' as const }, style as object];
  const content = (
    <>
      <Image
        source={{ uri: STOCK_URL }}
        // Cover + heavy blur turns the stock food into an abstract, out-of-focus
        // backdrop rather than a legible dish.
        contentFit="cover"
        blurRadius={45}
        cachePolicy="memory-disk"
        style={StyleSheet.absoluteFill}
      />
      {/* Scrim: guarantees the blurred food never reads as a real photo and keeps
          the cream caption legible on any surface. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(21,20,15,0.45)' }]} />
      <View style={styles.center}>
        <Text style={styles.label} numberOfLines={2}>
          Tap to add photo
        </Text>
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable style={containerStyle} onPress={onPress}>
        {content}
      </Pressable>
    );
  }
  return <View style={containerStyle}>{content}</View>;
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  label: {
    fontFamily: designTokens.font.medium,
    fontSize: 13,
    letterSpacing: 0.2,
    textAlign: 'center',
    color: CREAM,
  },
});
