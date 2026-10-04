// Take a quick tour — the list of app-tour videos.
// Reached from Profile → Settings → Take an app tour, or the first-run card on
// the Recipes tab. Each card opens the full-screen player (/tour-player).

import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ChevronLeft, ChevronRight, Play, Check, LifeBuoy } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { designTokens, getThemeColors, serifItalicFontStyle } from '@/lib/design-tokens';
import { useColorScheme } from '@/lib/useColorScheme';
import { useTourStore } from '@/lib/tour-store';
import { TOUR_VIDEOS, type TourVideo } from '@/lib/tour-videos';
import { TourThumb, TOUR_THUMB_WIDTH, TOUR_THUMB_HEIGHT } from '@/components/TourThumb';

const BADGE: Record<string, { bg: string; fg: string }> = {
  'save-from-social': { bg: '#FADFD2', fg: '#B5412A' },
  'recipe-library': { bg: '#DDE6D0', fg: '#3F4D33' },
  'plan-your-week': { bg: '#F7E7C0', fg: '#8A5A12' },
  'shop-smarter': { bg: '#F2DCD3', fg: '#B5412A' },
  explore: { bg: '#DDE6D0', fg: '#3F4D33' },
};

interface VideoRowProps {
  video: TourVideo;
  number: number;
  watched: boolean;
  isDark: boolean;
  onOpen: (id: string) => void;
}

function VideoRow({ video, number, watched, isDark, onOpen }: VideoRowProps) {
  const colors = getThemeColors(isDark);
  const badge = BADGE[video.id] ?? BADGE['recipe-library'];

  return (
    <Pressable
      onPress={() => onOpen(video.id)}
      accessibilityRole="button"
      accessibilityLabel={`${video.title}${watched ? ', watched' : ''}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        borderRadius: 22,
        padding: 10,
        borderWidth: watched ? 0 : 1,
        borderColor: colors.hair,
        backgroundColor: watched
          ? isDark
            ? 'rgba(84,100,69,0.24)'
            : 'rgba(84,100,69,0.1)'
          : colors.bg,
      }}
    >
      <View style={{ width: TOUR_THUMB_WIDTH, height: TOUR_THUMB_HEIGHT }}>
        <TourThumb videoId={video.id} />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: (TOUR_THUMB_WIDTH - 40) / 2,
            top: (TOUR_THUMB_HEIGHT - 40) / 2,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.95)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Play size={17} color="#15140F" fill="#15140F" strokeWidth={1.8} style={{ marginLeft: 2 }} />
        </View>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: 6,
            bottom: 6,
            backgroundColor: 'rgba(0,0,0,0.6)',
            borderRadius: 7,
            paddingHorizontal: 7,
            paddingVertical: 2,
          }}
        >
          <Text style={{ fontFamily: designTokens.font.medium, fontSize: 12, color: '#FFFFFF' }}>
            {video.durationLabel}
          </Text>
        </View>
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: watched ? 'rgba(84,100,69,0.28)' : badge.bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {watched ? (
              <Check size={14} color={isDark ? '#E4EBD9' : designTokens.colors.brand} strokeWidth={2.8} />
            ) : (
              <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 12.5, color: badge.fg }}>
                {number}
              </Text>
            )}
          </View>
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 12,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: colors.ink3,
            }}
          >
            {number} of {TOUR_VIDEOS.length}
          </Text>
        </View>
        <Text
          style={{
            fontFamily: designTokens.font.semibold,
            fontSize: 17,
            lineHeight: 22,
            color: colors.ink,
            letterSpacing: -0.2,
            marginTop: 8,
          }}
        >
          {video.title}
        </Text>
        <Text
          style={{
            fontFamily: designTokens.font.regular,
            fontSize: 13.5,
            lineHeight: 19,
            color: colors.ink2,
            marginTop: 4,
          }}
        >
          {video.blurb}
        </Text>
      </View>

      <ChevronRight size={20} color={colors.ink3} strokeWidth={1.8} />
    </Pressable>
  );
}

export default function TourScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const colors = getThemeColors(isDark);
  const watchedIds = useTourStore((s) => s.watchedIds);

  const watchedCount = TOUR_VIDEOS.filter((v) => watchedIds.includes(v.id)).length;

  const open = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/tour-player', params: { id } });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ width: 36, height: 36, justifyContent: 'center', marginLeft: -6, marginTop: 4 }}
        >
          <ChevronLeft size={26} color={colors.ink} strokeWidth={1.8} />
        </Pressable>

        <Animated.View entering={FadeInDown.delay(40).springify()}>
          <Text
            onLongPress={
              __DEV__
                ? () => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    useTourStore.getState().resetForTesting();
                  }
                : undefined
            }
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 36,
              lineHeight: 42,
              color: colors.ink,
              letterSpacing: -0.9,
              marginTop: 6,
            }}
          >
            Take a{' '}
            <Text
              style={{
                fontFamily: designTokens.font.serifItalic,
                fontStyle: serifItalicFontStyle,
                letterSpacing: -0.7,
              }}
            >
              quick tour
            </Text>
          </Text>
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 14.5,
              lineHeight: 20,
              color: colors.ink2,
              marginTop: 6,
            }}
          >
            {TOUR_VIDEOS.length} short videos to get the most out of PlanNPlate
          </Text>
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 13,
              color: colors.ink3,
              marginTop: 18,
            }}
          >
            {watchedCount} of {TOUR_VIDEOS.length} completed
          </Text>
          <View style={{ flexDirection: 'row', gap: 5, marginTop: 8, marginBottom: 20 }}>
            {TOUR_VIDEOS.map((v) => (
              <View
                key={v.id}
                style={{
                  flex: 1,
                  height: 5,
                  borderRadius: 999,
                  backgroundColor: watchedIds.includes(v.id)
                    ? designTokens.colors.brand
                    : colors.hair,
                }}
              />
            ))}
          </View>
        </Animated.View>

        {TOUR_VIDEOS.map((video, index) => (
          <Animated.View
            key={video.id}
            entering={FadeInDown.delay(100 + index * 60).springify()}
            style={{ marginBottom: 12 }}
          >
            <VideoRow
              video={video}
              number={index + 1}
              watched={watchedIds.includes(video.id)}
              isDark={isDark}
              onOpen={open}
            />
          </Animated.View>
        ))}

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/help');
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            paddingVertical: 18,
          }}
        >
          <LifeBuoy size={16} color={designTokens.colors.brand} strokeWidth={1.8} />
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 13.5,
              color: designTokens.colors.brand,
            }}
          >
            Still stuck? Help and support
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
