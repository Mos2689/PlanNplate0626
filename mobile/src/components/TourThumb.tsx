// Cover for each tour video, sized for the 118x112 thumbnail on the tour page.
// "Save recipes from social" is a designed illustration; the others are crops
// of the real app screens.

import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';

export const TOUR_THUMB_WIDTH = 118;
export const TOUR_THUMB_HEIGHT = 112;

const SOCIAL_SCREEN = require('../../assets/images/tour/tour-social-screen.jpg');
const LIBRARY_SCREEN = require('../../assets/images/tour/tour-library-screen.jpg');
const PLAN_SCREEN = require('../../assets/images/tour/tour-plan-screen.jpg');
const GROCERY_SCREEN = require('../../assets/images/tour/tour-grocery-screen.jpg');
const EXPLORE_SCREEN = require('../../assets/images/tour/tour-explore-screen.jpg');

const photo = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };

function ScreenThumb({
  source,
  fit = 'cover',
  bg = '#FAF7F0',
}: {
  source: number;
  fit?: 'cover' | 'contain';
  bg?: string;
}) {
  return (
    <View
      style={{
        width: TOUR_THUMB_WIDTH,
        height: TOUR_THUMB_HEIGHT,
        borderRadius: 16,
        backgroundColor: bg,
        overflow: 'hidden',
      }}
    >
      <Image source={source} contentFit={fit} style={photo} />
    </View>
  );
}

export function TourThumb({ videoId }: { videoId: string }) {
  switch (videoId) {
    case 'save-from-social':
      return <ScreenThumb source={SOCIAL_SCREEN} fit="contain" bg="#D4D9C5" />;
    case 'plan-your-week':
      return <ScreenThumb source={PLAN_SCREEN} />;
    case 'shop-smarter':
      return <ScreenThumb source={GROCERY_SCREEN} />;
    case 'explore':
      return <ScreenThumb source={EXPLORE_SCREEN} />;
    default:
      return <ScreenThumb source={LIBRARY_SCREEN} />;
  }
}
