// ReviewPromptModal — "Enjoying PlanNplate?" rating prompt.
//
// Standard app review pattern: a centered card with a star row. Tapping 4–5★
// routes to the store's write-a-review page; 1–3★ routes to private feedback
// (email) instead of the public listing, so unhappy users vent to us, not the
// store. Mounted globally in _layout.tsx; visibility is driven by review-store.
//
// Brand rules: olive eyebrow + one italic word, sage/olive accents only,
// scale-on-press, no Sparkles.
import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, Modal, Linking, Platform } from 'react-native';
import { Star, X } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { designTokens, getThemeColors } from '@/lib/design-tokens';
import {
  useReviewStore,
  APP_STORE_ID,
  ANDROID_PACKAGE,
  FEEDBACK_EMAIL,
} from '@/lib/review-store';

interface ReviewPromptModalProps {
  isDark?: boolean;
}

// Returns true if a store/feedback target was actually opened.
async function openWriteReview(): Promise<boolean> {
  let url = '';
  if (Platform.OS === 'ios' && APP_STORE_ID) {
    url = `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;
  } else if (Platform.OS === 'android' && ANDROID_PACKAGE) {
    url = `market://details?id=${ANDROID_PACKAGE}`;
  }
  if (!url) {
    console.warn('[review] Store ID not configured — set APP_STORE_ID / ANDROID_PACKAGE in review-store.ts');
    return false;
  }
  try {
    await Linking.openURL(url);
    return true;
  } catch (e) {
    console.warn('[review] Failed to open store URL', e);
    return false;
  }
}

async function openFeedbackEmail(stars: number): Promise<boolean> {
  const subject = encodeURIComponent('PlanNplate feedback');
  const body = encodeURIComponent(
    `\n\n———\nMy rating: ${stars}/5\nApp: PlanNplate (${Platform.OS})`,
  );
  const url = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch (e) {
    console.warn('[review] Failed to open mail composer', e);
    return false;
  }
}

export function ReviewPromptModal({ isDark = false }: ReviewPromptModalProps) {
  const visible = useReviewStore((s) => s.visible);
  const snooze = useReviewStore((s) => s.snooze);
  const markReviewed = useReviewStore((s) => s.markReviewed);
  const dontAskAgain = useReviewStore((s) => s.dontAskAgain);

  const [rating, setRating] = useState(0);

  const colors = getThemeColors(isDark);
  const surfaceBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;

  const handleStar = useCallback((n: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRating(n);
  }, []);

  const handleSubmit = useCallback(async () => {
    const r = rating === 0 ? 5 : rating; // no selection → treat as happy
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (r >= 4) {
      const opened = await openWriteReview();
      if (opened) markReviewed();
      else snooze(); // not configured yet — let it ask again later
    } else {
      await openFeedbackEmail(r);
      snooze();
    }
    setRating(0);
  }, [rating, markReviewed, snooze]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    snooze();
    setRating(0);
  }, [snooze]);

  if (!visible) return null;

  const isLow = rating > 0 && rating < 4;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          paddingHorizontal: 28,
        }}
      >
        {/* Tap-outside to dismiss */}
        <Pressable
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
          onPress={handleClose}
        />

        <Animated.View
          entering={FadeInDown.springify()}
          style={{
            borderRadius: 26,
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor: cardBorder,
            paddingTop: 24,
            paddingBottom: 20,
            paddingHorizontal: 22,
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 28,
            shadowOffset: { width: 0, height: 14 },
            elevation: 14,
          }}
        >
          {/* Close X */}
          <Pressable
            onPress={handleClose}
            hitSlop={10}
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              width: 30,
              height: 30,
              borderRadius: 999,
              backgroundColor: designTokens.colors.hair2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={15} color={colors.ink} strokeWidth={1.9} />
          </Pressable>

          {/* Icon tile */}
          <View
            style={{
              alignSelf: 'center',
              width: 58,
              height: 58,
              borderRadius: 18,
              backgroundColor: designTokens.colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              shadowColor: designTokens.colors.brandDeep,
              shadowOpacity: 0.25,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
            }}
          >
            <Star size={28} color={designTokens.colors.cream} fill={designTokens.colors.cream} strokeWidth={0} />
          </View>

          {/* Title */}
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: 22,
              color: colors.ink,
              letterSpacing: -0.44,
              textAlign: 'center',
            }}
          >
            Enjoying{' '}
            <Text
              style={{
                fontFamily: designTokens.font.serifItalic,
                fontStyle: 'italic',
                fontSize: 25,
              }}
            >
              PlanNplate
            </Text>
            ?
          </Text>

          {/* Subtitle */}
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 14,
              lineHeight: 20,
              color: colors.ink2,
              textAlign: 'center',
              marginTop: 8,
              paddingHorizontal: 6,
            }}
          >
            {isLow
              ? "Sorry to hear that — tell us what we can do better."
              : 'Tap a star to rate us. A quick review helps other home cooks find PlanNplate.'}
          </Text>

          {/* Star row */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
              marginTop: 18,
              marginBottom: 22,
            }}
          >
            {[1, 2, 3, 4, 5].map((n) => {
              const active = n <= rating;
              return (
                <Pressable key={n} onPress={() => handleStar(n)} hitSlop={6}>
                  {({ pressed }) => (
                    <View style={{ transform: [{ scale: pressed ? 0.88 : 1 }] }}>
                      <Star
                        size={36}
                        color={active ? designTokens.colors.olive : cardBorder}
                        fill={active ? designTokens.colors.olive : 'transparent'}
                        strokeWidth={active ? 0 : 1.6}
                      />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Primary CTA */}
          <Pressable onPress={handleSubmit} style={{ width: '100%' }}>
            {({ pressed }) => (
              <View
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 14,
                  borderRadius: 999,
                  backgroundColor: designTokens.colors.brand,
                  shadowColor: designTokens.colors.brandDeep,
                  shadowOpacity: 0.22,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 3,
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                }}
              >
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 15.5,
                    color: designTokens.colors.cream,
                    letterSpacing: -0.2,
                  }}
                >
                  {isLow ? 'Send feedback' : 'Leave a review'}
                </Text>
              </View>
            )}
          </Pressable>

          {/* Secondary — maybe later */}
          <Pressable onPress={handleClose} hitSlop={6} style={{ alignSelf: 'center', marginTop: 12, paddingVertical: 6 }}>
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 13.5,
                color: colors.ink2,
                letterSpacing: -0.1,
              }}
            >
              Maybe later
            </Text>
          </Pressable>

          {/* Tertiary — don't ask again */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              dontAskAgain();
              setRating(0);
            }}
            hitSlop={6}
            style={{ alignSelf: 'center', marginTop: 2, paddingVertical: 6 }}
          >
            <Text
              style={{
                fontFamily: designTokens.font.regular,
                fontSize: 12,
                color: colors.ink3,
              }}
            >
              Don't ask again
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}
