import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Play, X, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { designTokens } from '@/lib/design-tokens';
import { useTourStore, selectShowTourCard } from '@/lib/tour-store';

function MiniCard({
  rotate,
  left,
  top,
  width,
  height,
  source,
  z,
}: {
  rotate: string;
  left: number;
  top: number;
  width: number;
  height: number;
  source: number;
  z: number;
}) {
  return (
    <View
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        zIndex: z,
        transform: [{ rotate }],
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        padding: 4,
        shadowColor: '#15140F',
        shadowOpacity: 0.14,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 3,
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 9,
          backgroundColor: '#F4EFE4',
          overflow: 'hidden',
        }}
      >
        <Image
          source={source}
          contentFit="cover"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      </View>
    </View>
  );
}

export function TourCard() {
  const router = useRouter();
  const visible = useTourStore(selectShowTourCard);
  const dismissCard = useTourStore((s) => s.dismissCard);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeInDown.delay(60).springify()}
      style={{ paddingHorizontal: 20, paddingBottom: 12 }}
    >
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/tour');
        }}
        accessibilityRole="button"
        accessibilityLabel="New here? Take the tour"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 20,
          overflow: 'hidden',
          paddingVertical: 8,
          paddingLeft: 12,
          paddingRight: 12,
        }}
      >
        <LinearGradient
          pointerEvents="none"
          colors={['#181612', '#2d1811']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: -30,
            bottom: -50,
            width: 130,
            height: 130,
            borderRadius: 65,
            backgroundColor: 'rgba(255,255,255,0.05)',
          }}
        />

        <View style={{ width: 88, height: 62, marginRight: 10 }}>
          <MiniCard rotate="-12deg" left={0} top={14} width={34} height={46} source={require('../../assets/images/tour/tour-card-baba.jpg')} z={1} />
          <MiniCard rotate="-4deg" left={18} top={6} width={42} height={56} source={require('../../assets/images/tour/tour-card-avocado.jpg')} z={2} />
          <MiniCard rotate="6deg" left={38} top={1} width={46} height={60} source={require('../../assets/images/tour/tour-card-fish.jpg')} z={3} />
          <View
            style={{
              position: 'absolute',
              left: 24,
              top: 14,
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 4,
              shadowColor: '#15140F',
              shadowOpacity: 0.2,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 3 },
              elevation: 4,
            }}
          >
            <Play size={15} color="#15140F" fill="#15140F" strokeWidth={1.8} style={{ marginLeft: 2 }} />
          </View>

          <View style={{ position: 'absolute', right: 0, top: -6, zIndex: 5, transform: [{ scale: 0.8 }] }} pointerEvents="none">
            <View style={{ width: 2.5, height: 9, borderRadius: 2, backgroundColor: designTokens.colors.olive, transform: [{ rotate: '-18deg' }] }} />
            <View style={{ position: 'absolute', left: 8, top: 4, width: 2.5, height: 9, borderRadius: 2, backgroundColor: designTokens.colors.olive, transform: [{ rotate: '50deg' }] }} />
            <View style={{ position: 'absolute', left: 12, top: 14, width: 2.5, height: 9, borderRadius: 2, backgroundColor: designTokens.colors.olive, transform: [{ rotate: '82deg' }] }} />
          </View>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: designTokens.font.semibold,
              fontSize: 16,
              lineHeight: 21,
              color: designTokens.colors.cream,
              letterSpacing: -0.2,
            }}
          >
            New here? Take the tour
          </Text>
        </View>

        <ChevronRight size={22} color={designTokens.colors.cream} strokeWidth={1.8} style={{ marginLeft: 6 }} />

        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            dismissCard();
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss tour card"
          style={{ position: 'absolute', top: 4, right: 6, padding: 4 }}
        >
          <X size={13} color="rgba(250,247,240,0.55)" strokeWidth={2} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}
