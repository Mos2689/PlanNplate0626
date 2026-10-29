// Full-screen tour video player. Opened from /tour with ?id=<TourVideo.id>.
// A video counts as watched once playback passes 80%, which also retires the
// first-run card on the Recipes tab.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Audio, Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import { X, Play, Pause, RotateCcw, ChevronRight, ArrowRight, Volume2, VolumeX } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import { designTokens, serifItalicFontStyle } from '@/lib/design-tokens';
import { useTourStore } from '@/lib/tour-store';
import { TOUR_VIDEOS } from '@/lib/tour-videos';

const WATCHED_THRESHOLD = 0.8;
const INTRO_MS = 1900;

export default function TourPlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const markWatched = useTourStore((s) => s.markWatched);

  const [index, setIndex] = useState(() =>
    Math.max(0, TOUR_VIDEOS.findIndex((v) => v.id === id)),
  );
  const video = TOUR_VIDEOS[index];
  const next = TOUR_VIDEOS[index + 1] ?? null;
  const nextIndex = next ? index + 1 : null;

  const videoRef = useRef<Video>(null);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(false);

  const [introVisible, setIntroVisible] = useState(video.source !== null);

  useEffect(() => {
    setProgress(0);
    setPlaying(false);
    setEnded(false);
    if (video.source === null) {
      setIntroVisible(false);
      return;
    }
    setIntroVisible(true);
    const t = setTimeout(() => setIntroVisible(false), INTRO_MS);
    return () => clearTimeout(t);
  }, [video.id, video.source]);

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    }).catch(() => {});
  }, []);

  const onStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      const ratio = status.durationMillis
        ? Math.min(1, status.positionMillis / status.durationMillis)
        : 0;
      setProgress(ratio);
      setPlaying(status.isPlaying);
      if (ratio >= WATCHED_THRESHOLD) markWatched(video.id);
      if (status.didJustFinish) {
        markWatched(video.id);
        if (nextIndex !== null) setIndex(nextIndex);
        else setEnded(true);
      }
    },
    [markWatched, video.id, nextIndex],
  );

  const togglePlay = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (ended) {
      setEnded(false);
      await v.replayAsync();
      return;
    }
    if (playing) await v.pauseAsync();
    else await v.playAsync();
  }, [ended, playing]);

  const goPrevious = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (index > 0) setIndex(index - 1);
    else videoRef.current?.replayAsync().catch(() => {});
  };

  const goNext = () => {
    if (!next) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIndex(index + 1);
  };

  const tryIt = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.dismissAll();
    const href = video.tryItFreshParam
      ? `${video.tryItRoute}?${video.tryItFreshParam}=${Date.now()}`
      : video.tryItRoute;
    router.navigate(href as Href);
  };

  const showPlayIcon = video.source !== null && !introVisible && (!playing || ended);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#15140F',
        paddingTop: Math.max(insets.top, 44),
        paddingBottom: Math.max(insets.bottom, 12),
      }}
    >
      <StatusBar style="light" />

      <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 16 }}>
        {TOUR_VIDEOS.map((v, i) => (
          <Pressable
            key={v.id}
            onPress={() => {
              if (i === index) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIndex(i);
            }}
            hitSlop={{ top: 10, bottom: 10 }}
            accessibilityRole="button"
            accessibilityLabel={`Go to video ${i + 1}: ${v.title}`}
            style={{ flex: 1, paddingVertical: 10 }}
          >
            <View
              style={{
                height: 3,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.28)',
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: '100%',
                  width: i < index ? '100%' : i === index ? `${Math.round(progress * 100)}%` : '0%',
                  backgroundColor: '#FFFFFF',
                }}
              />
            </View>
          </Pressable>
        ))}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 8,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <X size={24} color="#FFFFFF" strokeWidth={1.8} />
        </Pressable>
        <Text style={{ fontFamily: designTokens.font.medium, fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
          {index + 1} of {TOUR_VIDEOS.length} · {video.title}
        </Text>
        {video.source !== null ? (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setMuted((m) => !m);
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={muted ? 'Turn sound on' : 'Turn sound off'}
          >
            {muted ? (
              <VolumeX size={24} color="#FFFFFF" strokeWidth={1.8} />
            ) : (
              <Volume2 size={24} color="#FFFFFF" strokeWidth={1.8} />
            )}
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <Pressable
        onPress={togglePlay}
        disabled={video.source === null || introVisible}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause video' : 'Play video'}
        style={{
          flex: 1,
          marginHorizontal: 8,
          borderRadius: 20,
          overflow: 'hidden',
          backgroundColor: video.source === null ? video.tint : '#0E0D0A',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {video.source !== null ? (
          <Video
            key={video.id}
            ref={videoRef}
            source={video.source}
            style={{ width: '100%', height: '100%' }}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={!introVisible}
            isMuted={muted}
            progressUpdateIntervalMillis={250}
            onPlaybackStatusUpdate={onStatus}
          />
        ) : (
          <View style={{ alignItems: 'center', paddingHorizontal: 32 }}>
            <Play size={40} color="rgba(255,255,255,0.9)" fill="rgba(255,255,255,0.9)" strokeWidth={1.8} />
            <Text
              style={{
                fontFamily: designTokens.font.serifItalic,
                fontSize: 28,
                color: '#FFFFFF',
                marginTop: 14,
                textAlign: 'center',
              }}
            >
              Video coming soon
            </Text>
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 14,
                lineHeight: 20,
                color: 'rgba(255,255,255,0.8)',
                marginTop: 6,
                textAlign: 'center',
              }}
            >
              {video.blurb}
            </Text>
            {__DEV__ && (
              <Pressable
                onPress={() => markWatched(video.id)}
                style={{ marginTop: 18, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.3)' }}
              >
                <Text style={{ fontFamily: designTokens.font.medium, fontSize: 12.5, color: '#FFFFFF' }}>
                  Mark as watched (dev only)
                </Text>
              </Pressable>
            )}
          </View>
        )}

        <Pressable
          onPress={goPrevious}
          accessibilityRole="button"
          accessibilityLabel="Previous video"
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '30%', zIndex: 5 }}
        />
        {next && (
          <Pressable
            onPress={goNext}
            accessibilityRole="button"
            accessibilityLabel="Next video"
            style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '30%', zIndex: 5 }}
          />
        )}

        {introVisible && (
          <Animated.View
            key={`intro-${video.id}`}
            entering={FadeIn.duration(250)}
            exiting={FadeOut.duration(350)}
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: designTokens.colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 32,
            }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 12,
                letterSpacing: 1.4,
                textTransform: 'uppercase',
                color: 'rgba(250,247,240,0.7)',
              }}
            >
              {index + 1} of {TOUR_VIDEOS.length}
            </Text>
            <Text
              style={{
                fontFamily: designTokens.font.serifItalic,
                fontStyle: serifItalicFontStyle,
                fontSize: 40,
                lineHeight: 44,
                color: designTokens.colors.cream,
                textAlign: 'center',
                marginTop: 12,
                letterSpacing: -0.8,
              }}
            >
              {video.title}
            </Text>
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 14.5,
                lineHeight: 20,
                color: 'rgba(250,247,240,0.8)',
                textAlign: 'center',
                marginTop: 12,
              }}
            >
              {video.blurb}
            </Text>
          </Animated.View>
        )}

        {showPlayIcon && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: 'rgba(255,255,255,0.92)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {ended ? (
              <RotateCcw size={26} color="#15140F" strokeWidth={2} />
            ) : playing ? (
              <Pause size={26} color="#15140F" fill="#15140F" strokeWidth={1.8} />
            ) : (
              <Play size={26} color="#15140F" fill="#15140F" strokeWidth={1.8} />
            )}
          </View>
        )}
      </Pressable>

      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>
        {next && (
          <Pressable
            onPress={goNext}
            accessibilityRole="button"
            accessibilityLabel={`Up next: ${next.title}`}
            style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}
          >
            <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontFamily: designTokens.font.medium, fontSize: 14, color: '#FFFFFF' }}>
              <Text style={{ fontFamily: designTokens.font.regular, color: 'rgba(255,255,255,0.6)' }}>Up next  </Text>
              {next.title}
            </Text>
            <ChevronRight size={20} color="rgba(255,255,255,0.8)" strokeWidth={1.8} />
          </Pressable>
        )}
        <Pressable
          onPress={tryIt}
          accessibilityRole="button"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: 13,
            borderRadius: 16,
            backgroundColor: designTokens.colors.olive,
          }}
        >
          <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 15.5, color: '#FFFFFF' }}>
            {video.tryItLabel}
          </Text>
          <ArrowRight size={18} color="#FFFFFF" strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}
