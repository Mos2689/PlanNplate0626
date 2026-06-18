// VibeDeck — horizontal scroll of mood cards driving the Vibe Cooking
// experience on /generate-recipe. Each card is a brand asset on its
// own: hero food image, evocative name (e.g. "Tired but Hungry",
// "Glow-up Bowl"), and a one-liner. Selecting a card swaps it into
// the controlled `selectedVibeId` and unselects any prior choice.
//
// Visual anatomy of one card (170w × 210h):
//
//   ┌─────────────────────────┐
//   │                         │
//   │   [ hero food image ]   │  ← absolute fill, 4:5 region
//   │                         │
//   │  ────dark gradient────  │  ← bottom 65%, fades from clear to
//   │                         │     near-black for text legibility
//   │  🥣 Comfort Blanket     │  ← name (Geist semibold cream)
//   │  Slow, warming, familiar│  ← one-liner (smaller, 75% opacity)
//   └─────────────────────────┘
//
// Selected state:
//   • Olive border (2px) around the card
//   • Small olive check-chip top-right
//   • Subtle 1.02 scale
//   • Hero image performs a slow Ken Burns zoom 1.0 → 1.05 (6s reverse
//     loop, native driver) — communicates "this is the one we're going
//     to cook"
//
// Other cards stay still — single moving thing = the chosen vibe.

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Animated as RNAnimated,
  Easing as RNEasing,
} from 'react-native';
import { Image } from 'expo-image';
import { Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { VIBES, type VibeId, type VibeDefinition } from '@/lib/vibe-inference';
import { designTokens, elevation } from '@/lib/design-tokens';

const CARD_WIDTH = 120;
const CARD_GAP = 10;

interface VibeDeckProps {
  selectedVibeId: VibeId | null;
  onSelect: (id: VibeId) => void;
  isDark?: boolean;
}

// ───────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT — single vibe card
// ───────────────────────────────────────────────────────────────────────────────

interface VibeCardProps {
  vibe: VibeDefinition;
  isSelected: boolean;
  onPress: () => void;
  isDark: boolean;
}

function VibeCard({ vibe, isSelected, onPress, isDark }: VibeCardProps) {
  // Ken Burns zoom only on the selected card. Pulled off via RN's
  // classic Animated (native driver) — same proven path as the
  // PendingGenerationBanner pulse.
  const zoom = useRef(new RNAnimated.Value(1)).current;
  const loopRef = useRef<RNAnimated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (loopRef.current) {
      loopRef.current.stop();
      loopRef.current = null;
    }
    if (isSelected) {
      zoom.setValue(1);
      const loop = RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(zoom, {
            toValue: 1.05,
            duration: 6000,
            easing: RNEasing.inOut(RNEasing.quad),
            useNativeDriver: true,
          }),
          RNAnimated.timing(zoom, {
            toValue: 1,
            duration: 6000,
            easing: RNEasing.inOut(RNEasing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      loopRef.current = loop;
      loop.start();
    } else {
      RNAnimated.timing(zoom, {
        toValue: 1,
        duration: 220,
        easing: RNEasing.out(RNEasing.quad),
        useNativeDriver: true,
      }).start();
    }
    return () => {
      if (loopRef.current) {
        loopRef.current.stop();
        loopRef.current = null;
      }
    };
  }, [isSelected, zoom]);

  return (
    <Pressable onPress={onPress} style={{ width: CARD_WIDTH }}>
      {({ pressed }) => (
        <View
          style={{
            width: CARD_WIDTH,
            borderRadius: 18,
            borderWidth: isSelected ? 2 : 1,
            borderColor: isSelected
              ? designTokens.colors.olive
              : designTokens.colors.hair,
            backgroundColor: isDark ? '#1f1f1f' : '#FFFFFF',
            overflow: 'hidden',
            transform: [{ scale: pressed ? 0.98 : isSelected ? 1.02 : 1 }],
            ...elevation.card,
          }}
        >
          {/* Top part: Hero image with Ken Burns on selected */}
          <View style={{ width: '100%', aspectRatio: 0.8, overflow: 'hidden' }}>
            <RNAnimated.View
              style={{
                width: '100%',
                height: '100%',
                transform: [{ scale: zoom }],
              }}
            >
              <Image
                source={vibe.localImage}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            </RNAnimated.View>

            {/* Selected check chip overlaid on top-right of image */}
            {isSelected && (
              <View
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  backgroundColor: designTokens.colors.olive,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.15,
                  shadowRadius: 3,
                  elevation: 2,
                }}
              >
                <Check size={12} color="#F6F2E9" strokeWidth={2.8} />
              </View>
            )}
          </View>

          {/* Bottom part: Name + one-liner stack (tight height, dynamic wrap) */}
          <View
            style={{
              paddingHorizontal: 8,
              paddingTop: 8,
              paddingBottom: 10,
            }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 12.5,
                color: isDark ? '#F6F2E9' : designTokens.colors.ink,
                letterSpacing: -0.15,
              }}
              numberOfLines={1}
            >
              {vibe.emoji} {vibe.name}
            </Text>
            <Text
              style={{
                marginTop: 4,
                fontFamily: designTokens.font.regular,
                fontSize: 10.5,
                lineHeight: 13,
                color: isDark ? 'rgba(246, 242, 233, 0.65)' : designTokens.colors.ink2,
              }}
              numberOfLines={2}
            >
              {vibe.oneLiner}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ───────────────────────────────────────────────────────────────────────────────

export function VibeDeck({
  selectedVibeId,
  onSelect,
  isDark = false,
}: VibeDeckProps) {
  return (
    <FlatList
      horizontal
      data={VIBES}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 16,
        gap: CARD_GAP,
      }}
      // Horizontal lists need explicit constraint or they expand
      // vertically to fill flex parents (per CLAUDE.md).
      style={{ flexGrow: 0 }}
      renderItem={({ item }) => (
        <VibeCard
          vibe={item}
          isSelected={selectedVibeId === item.id}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onSelect(item.id);
          }}
          isDark={isDark}
        />
      )}
    />
  );
}
