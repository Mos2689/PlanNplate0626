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
const CREAM = designTokens.colors.cream; // #FAF7F0

// BUNDLED, not fetched.
//
// This used to download an 800px Unsplash JPEG at render time and blur it. That
// meant every recipe without a photo waited on the network before its backdrop
// appeared — and since onboarding dishes deliberately ship with no image (see
// lib/recipe-image.ts), landing after onboarding meant a whole grid of tiles
// painting flat and then flipping together as one download completed.
//
// It is the same image every time, so it lives in the bundle: 35 KB at 400px,
// which is far more than a 45px blur can show. Zero network, first frame, works
// offline. `prefetchPlaceholderArt()` existed only to paper over the fetch and
// was removed with it.
const ART = require('../../assets/images/recipe-placeholder.jpg');

// The resting colour under the art, for the frame before it decodes. The source
// is a bowl on a near-white backdrop, so blurring it under the 45% scrim below
// settles to a mid warm grey — NOT the dark brown a food photo would give.
const ART_BASE = '#78766F';

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
  const containerStyle = [
    { backgroundColor: ART_BASE, overflow: 'hidden' as const },
    style as object,
  ];
  const content = (
    <>
      <Image
        source={ART}
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
