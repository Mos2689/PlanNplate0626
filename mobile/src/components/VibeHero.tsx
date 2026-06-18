// VibeHero — the full-bleed cinematic header for the Vibe Cooking
// screen. Lives only inside /vibe-cooking; not reused elsewhere.
//
// Visual anatomy (top → bottom):
//
//   ╭─────────────────────────────────────────╮
//   │ ◀                                       │  ← floating back arrow (frosted)
//   │ ▌🥣 COMFORT BLANKET · Slow, warming…    │  ← vibe ribbon (olive eyebrow)
//   │                                         │
//   │              [HERO PHOTO]               │  ← Ken-Burns slow zoom
//   │              (vibe-tinted gradient      │
//   │               overlay on top)           │
//   │                                         │
//   │  Slow-braised lamb shoulder             │  ← title (one italic word)
//   │  with rosemary & wine                   │
//   ╰─────────────────────────────────────────╯
//
// Animations:
//   • Ken-Burns: 12s loop, scale 1.0 → 1.06 with a slight x-drift.
//   • Parallax: as parent scroll progresses, the hero translates up
//     at ~0.4x speed so the title slides under the content cards.
//   • Sticky title collapse: handled by the PARENT screen — we
//     simply fade our local title out as scroll exceeds the
//     collapse threshold so the parent's pinned compact title can
//     take over without overlap.
//
// Skeleton fallback: while the image is loading (or unavailable),
// render the vibe-tinted gradient + the vibe emoji centered so the
// hero never falls back to a grey rectangle.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  type ImageSourcePropType,
  type ImageURISource,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft } from 'lucide-react-native';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  type SharedValue,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { designTokens, easing } from '@/lib/design-tokens';
import { VIBE_BY_ID, type VibeId } from '@/lib/vibe-inference';
import { getVibeTheme } from '@/lib/vibe-theme';

const EASE = Easing.bezier(...easing.outStrong);
const KEN_BURNS_MS = 12_000;

interface VibeHeroProps {
  /** Vibe id — drives ribbon copy + gradient + ribbon color. */
  vibeId: VibeId;
  /** Recipe title. Pass the WHOLE title; we pull `italicWord` separately. */
  title: string;
  /** A single word from `title` to render in Instrument Serif italic
   *  per brand rule. Auto-extracted via `pickItalicWord` in the
   *  parent if not provided. Case-sensitive substring match. */
  italicWord?: string;
  /** Optional URL or local asset for the hero photo. Falls back to
   *  the vibe's localImage when null/undefined, then to a tinted
   *  gradient skeleton if even that is missing. */
  imageSource?: ImageSourcePropType;
  /** Parent's scroll position shared value — drives parallax + the
   *  hero-title fade. */
  scrollY: SharedValue<number>;
  /** Hero height in px. Caller sets this so the parent ScrollView's
   *  content layout knows the offset. */
  height: number;
  /** Back-arrow handler (the parent owns the route stack). */
  onBack: () => void;
  /** Pixel value at which the hero title fully fades out so the
   *  parent can render a pinned compact title above it. */
  collapseAt: number;
}

export function VibeHero({
  vibeId,
  title,
  italicWord,
  imageSource,
  scrollY,
  height,
  onBack,
  collapseAt,
}: VibeHeroProps) {
  const theme = getVibeTheme(vibeId);
  const vibe = VIBE_BY_ID[vibeId];
  const insets = useSafeAreaInsets();
  const [imageLoaded, setImageLoaded] = useState(false);

  // ── Ken-Burns loop ─────────────────────────────────────────────
  // A single shared value cycles 0→1→0 indefinitely; both scale and
  // x-drift derive from it via interpolation. Cheap (one timer).
  const kb = useSharedValue(0);
  useEffect(() => {
    kb.value = withRepeat(
      withTiming(1, { duration: KEN_BURNS_MS, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true, // reverse on each cycle for breathing in/out
    );
  }, [kb]);

  const kenBurnsStyle = useAnimatedStyle(() => {
    const scale = interpolate(kb.value, [0, 1], [1.0, 1.06]);
    const translateX = interpolate(kb.value, [0, 1], [0, -12]);
    return {
      transform: [{ scale }, { translateX }],
    };
  });

  // ── Parallax + title fade ──────────────────────────────────────
  const parallaxStyle = useAnimatedStyle(() => {
    // As the user scrolls, push the hero up at 0.4x the scroll rate.
    // Clamped so over-scroll at the top doesn't stretch the image
    // unnaturally far below its slot.
    const translateY = interpolate(
      scrollY.value,
      [0, height],
      [0, -height * 0.4],
      { extrapolateLeft: Extrapolation.CLAMP, extrapolateRight: Extrapolation.EXTEND },
    );
    return { transform: [{ translateY }] };
  });

  const titleFadeStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [collapseAt * 0.4, collapseAt],
      [1, 0],
      { extrapolateLeft: Extrapolation.CLAMP, extrapolateRight: Extrapolation.CLAMP },
    );
    return { opacity };
  });

  // ── Resolve hero image ─────────────────────────────────────────
  const resolvedImage: ImageSourcePropType | null = useMemo(() => {
    if (imageSource) return imageSource;
    if (vibe?.localImage) return vibe.localImage;
    if (vibe?.imageUrl) return { uri: vibe.imageUrl } as ImageURISource;
    return null;
  }, [imageSource, vibe]);

  // ── Italic-word split (one italic word per screen rule) ────────
  const { before, italic, after } = useMemo(() => {
    if (!italicWord || !title.includes(italicWord)) {
      return { before: title, italic: '', after: '' };
    }
    const idx = title.indexOf(italicWord);
    return {
      before: title.slice(0, idx),
      italic: italicWord,
      after: title.slice(idx + italicWord.length),
    };
  }, [title, italicWord]);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onBack();
  };

  return (
    <Animated.View
      style={[
        { height, width: '100%', overflow: 'hidden', backgroundColor: theme.ribbon },
        parallaxStyle,
      ]}
    >
      {/* ── Skeleton fallback (always behind the image) ─────── */}
      <LinearGradient
        colors={[theme.heroOverlayFrom, theme.heroOverlayTo as any, 'transparent'] as any}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      {!imageLoaded && (
        <View
          pointerEvents="none"
          style={{
            ...StyleSheet.absoluteFillObject,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 64, opacity: 0.55 }}>{vibe?.emoji ?? '🍽️'}</Text>
        </View>
      )}

      {/* ── Hero photo with Ken-Burns ───────────────────────── */}
      {resolvedImage && (
        <Animated.View style={[StyleSheet.absoluteFill, kenBurnsStyle]}>
          <Image
            source={resolvedImage}
            resizeMode="cover"
            onLoad={() => setImageLoaded(true)}
            style={{ width: '100%', height: '100%' }}
          />
        </Animated.View>
      )}

      {/* ── Dual gradient overlay (legibility) ──────────────── */}
      {/* Top fade — keeps status bar + back arrow legible */}
      <LinearGradient
        pointerEvents="none"
        colors={[theme.heroOverlayFrom, 'transparent'] as any}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.45 }}
        style={{ ...StyleSheet.absoluteFillObject }}
      />
      {/* Bottom fade — keeps the title legible over the photo */}
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', 'rgba(8,6,4,0.55)', 'rgba(8,6,4,0.85)'] as any}
        start={{ x: 0.5, y: 0.55 }}
        end={{ x: 0.5, y: 1 }}
        style={{ ...StyleSheet.absoluteFillObject }}
      />

      {/* ── Back arrow (row 1) ──────────────────────────────── */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 18,
        }}
      >
        <Pressable
          onPress={handleBack}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 38,
            height: 38,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.18)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.22)',
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: pressed ? 0.94 : 1 }],
          })}
        >
          <ArrowLeft size={18} color="#FFFFFF" strokeWidth={1.9} />
        </Pressable>
      </View>

      {/* ── Vibe ribbon (row 2 — full-width, breathes) ──────── */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + 56,
          left: 18,
          right: 18,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: 12,
          paddingRight: 14,
          paddingVertical: 10,
          borderRadius: 18,
          backgroundColor: 'rgba(255,255,255,0.14)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.22)',
          gap: 10,
        }}
      >
        <Text style={{ fontSize: 16 }}>{vibe?.emoji ?? '✨'}</Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: designTokens.font.semibold,
              fontSize: 10.5,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: '#FFFFFF',
            }}
          >
            {vibe?.name ?? 'Vibe'}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 12,
              letterSpacing: 0.05,
              color: 'rgba(255,255,255,0.85)',
              marginTop: 2,
            }}
          >
            {vibe?.oneLiner ?? ''}
          </Text>
        </View>
      </View>

      {/* ── Hero title (one italic word) ──────────────────────── */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 22,
            right: 22,
            bottom: 48,
          },
          titleFadeStyle,
        ]}
      >
        <Text
          style={{
            fontFamily: designTokens.font.medium,
            fontSize: 28,
            lineHeight: 34,
            letterSpacing: -0.5,
            color: '#FFFFFF',
          }}
        >
          {before}
          {italic ? (
            <Text
              style={{
                fontFamily: designTokens.font.serifItalic,
                fontStyle: 'italic',
                fontSize: 32,
              }}
            >
              {italic}
            </Text>
          ) : null}
          {after}
        </Text>
      </Animated.View>
    </Animated.View>
  );
}
