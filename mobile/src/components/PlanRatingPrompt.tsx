// PlanRatingPrompt — sage card that mounts on /curated-plan-detail
// after the user has cooked ≥2 meals from a curated plan and hasn't
// yet rated it. The interaction is calibrated for premium feel:
//
//   • Star row taps with light haptic per star, smooth fill animation.
//   • Optional cook-again pills (yes/maybe/no) — same pattern as
//     RecipeRating already uses elsewhere in the app.
//   • Single "Save rating" CTA so the user owns the moment of commit
//     (no auto-submit on last star — gives them room to change their
//     mind without anxiety).
//   • Animates out on submit; replaced by a brief thanks confirmation
//     that auto-dismisses after ~2.5s.
//
// Self-contained — accepts the plan name + cooked count + an
// onSubmit callback. The parent (curated-plan-detail) decides when
// the prompt mounts and where it sits in the layout.

import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Star } from 'lucide-react-native';
import Animated, { FadeIn, FadeOut, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { designTokens } from '@/lib/design-tokens';
import type { CookAgainIntent } from '@/lib/store';

interface PlanRatingPromptProps {
  planName: string;
  cookedCount: number;
  isDark?: boolean;
  onSubmit: (stars: 1 | 2 | 3 | 4 | 5, cookAgain: CookAgainIntent | undefined) => void;
}

export function PlanRatingPrompt({
  planName,
  cookedCount,
  isDark = false,
  onSubmit,
}: PlanRatingPromptProps) {
  const [stars, setStars] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);
  const [cookAgain, setCookAgain] = useState<CookAgainIntent | undefined>(undefined);
  const [submitted, setSubmitted] = useState(false);

  const ink = isDark ? '#fff' : designTokens.colors.ink;
  const ink2 = isDark ? '#aaa' : designTokens.colors.ink2;
  const ink3 = isDark ? '#888' : designTokens.colors.ink3;

  const handleStarPress = (n: 1 | 2 | 3 | 4 | 5) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStars(n);
  };

  const handleCookAgain = (intent: CookAgainIntent) => {
    Haptics.selectionAsync();
    setCookAgain((prev) => (prev === intent ? undefined : intent));
  };

  const handleSubmit = () => {
    if (stars === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSubmitted(true);
    onSubmit(stars as 1 | 2 | 3 | 4 | 5, cookAgain);
  };

  // ── Post-submit thanks confirmation ──
  if (submitted) {
    return (
      <Animated.View
        entering={FadeIn.duration(220)}
        style={{
          marginHorizontal: 16,
          marginBottom: 16,
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderRadius: 18,
          backgroundColor: 'rgba(84,100,69,0.08)',
          borderWidth: 1,
          borderColor: 'rgba(84,100,69,0.22)',
        }}
      >
        <Text
          style={{
            fontFamily: designTokens.font.medium,
            fontSize: 13.5,
            color: designTokens.colors.brandDeep ?? designTokens.colors.brand,
            letterSpacing: -0.12,
          }}
        >
          Thanks — you helped someone's week.
        </Text>
      </Animated.View>
    );
  }

  // ── Rating prompt ──
  return (
    <Animated.View
      entering={FadeInDown.springify()}
      exiting={FadeOut.duration(220)}
      style={{
        marginHorizontal: 16,
        marginBottom: 18,
        padding: 18,
        borderRadius: 22,
        backgroundColor: 'rgba(84,100,69,0.07)',
        borderWidth: 1,
        borderColor: 'rgba(84,100,69,0.22)',
      }}
    >
      <Text
        style={{
          fontFamily: designTokens.font.semibold,
          fontSize: 16.5,
          color: ink,
          letterSpacing: -0.25,
        }}
      >
        How's the {planName} working out?
      </Text>
      <Text
        style={{
          fontFamily: designTokens.font.regular,
          fontSize: 12.5,
          lineHeight: 18,
          color: ink2,
          marginTop: 6,
        }}
      >
        You've cooked {cookedCount} meals — your take helps the next cook find their week.
      </Text>

      {/* Star row */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
        {([1, 2, 3, 4, 5] as const).map((n) => {
          const filled = n <= stars;
          return (
            <Pressable
              key={n}
              onPress={() => handleStarPress(n)}
              hitSlop={6}
              accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
              style={{ padding: 2 }}
            >
              <Star
                size={28}
                color={filled ? designTokens.colors.olive : ink3}
                strokeWidth={filled ? 0 : 1.8}
                fill={filled ? designTokens.colors.olive : 'transparent'}
              />
            </Pressable>
          );
        })}
      </View>

      {/* Cook-again pills — appear once any star is selected */}
      {stars > 0 && (
        <Animated.View
          entering={FadeIn.duration(220)}
          style={{ marginTop: 16 }}
        >
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 11,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              color: ink3,
              marginBottom: 8,
            }}
          >
            Would you cook this again?
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['yes', 'maybe', 'no'] as const).map((intent) => {
              const selected = cookAgain === intent;
              const label = intent === 'yes' ? 'Yes' : intent === 'maybe' ? 'Maybe' : 'No';
              return (
                <Pressable
                  key={intent}
                  onPress={() => handleCookAgain(intent)}
                  style={{ flex: 1 }}
                >
                  {({ pressed }) => (
                    <View
                      style={{
                        paddingVertical: 10,
                        borderRadius: 999,
                        borderWidth: selected ? 0 : 1,
                        borderColor: 'rgba(84,100,69,0.28)',
                        backgroundColor: selected
                          ? designTokens.colors.brand
                          : 'transparent',
                        alignItems: 'center',
                        transform: [{ scale: pressed ? 0.98 : 1 }],
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: designTokens.font.medium,
                          fontSize: 13,
                          color: selected ? designTokens.colors.cream : ink2,
                          letterSpacing: -0.1,
                        }}
                      >
                        {label}
                      </Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      )}

      {/* Submit CTA */}
      <Pressable
        onPress={handleSubmit}
        disabled={stars === 0}
        style={{ marginTop: 16 }}
      >
        {({ pressed }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 13,
              borderRadius: 999,
              backgroundColor: stars > 0
                ? designTokens.colors.brand
                : 'rgba(84,100,69,0.12)',
              transform: [{ scale: pressed && stars > 0 ? 0.985 : 1 }],
            }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 14,
                color: stars > 0 ? designTokens.colors.cream : ink3,
                letterSpacing: -0.15,
              }}
            >
              Save rating
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
