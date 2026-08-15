// RecipePlaceholder — the on-brand fallback shown in place of a recipe photo
// when there is no real image yet (empty URL, or the shared stock placeholder
// that Pexels/curated search falls back to).
//
// Renders the bundled placeholder artwork (assets/images/recipe-placeholder.png)
// — the "Add your own image / Personalise your recipe" cloche card — centred on
// cream so it never crops. Used by DishImage whenever isDefaultRecipeImage() is
// true, so every recipe surface (grid card, detail hero, full-screen viewer)
// shares one placeholder instead of the old Unsplash salad bowl.

import React from 'react';
import { View } from 'react-native';
import type { ImageStyle, StyleProp } from 'react-native';
import { Image } from 'expo-image';
import { designTokens } from '@/lib/design-tokens';

const CREAM = designTokens.colors.cream; // #FAF7F0
const PLACEHOLDER_ART = require('../../assets/images/recipe-placeholder.png');

interface RecipePlaceholderProps {
  /** Fills its parent — pass the same style DishImage would give the photo. */
  style?: StyleProp<ImageStyle>;
  /**
   * Retained for API compatibility with DishImage. The caption is baked into
   * the artwork, so this no longer changes what is drawn.
   */
  showLabel?: boolean;
}

export function RecipePlaceholder({ style }: RecipePlaceholderProps) {
  return (
    <View style={[{ backgroundColor: CREAM }, style as object]}>
      <Image
        source={PLACEHOLDER_ART}
        // `contain` keeps the whole designed card visible in every slot (square
        // grid cell, wide hero, full-screen viewer) — any spare space is the
        // same cream as the artwork, so it reads as one surface, never cropped.
        contentFit="contain"
        cachePolicy="memory-disk"
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}
