// VibeTimerCompleteSheet — full-screen "time's up" moment for the
// Vibe Cooking timer. Replaces the prior anticlimactic experience
// (the sticky pill just vanished at zero) with a coach-style
// confirmation that echoes the step text and offers three next
// actions: Done, +1 min, Snooze 30s.
//
// Self-contained. Driven entirely by props from the parent. The
// parent owns the timer state — this component just paints the
// moment and bubbles user intent back up via callbacks.
//
// Brand rules:
//   • One italic word per surface → "Time's *up*."
//   • Olive eyebrow caps.
//   • Sage primary CTA, outlined secondary actions.

import React from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Clock, RotateCcw, Check } from 'lucide-react-native';
import { designTokens } from '@/lib/design-tokens';

export interface VibeTimerCompleteSheetProps {
  visible: boolean;
  stepNumber: number;       // 1-indexed for display
  stepText: string;         // the step's instruction copy
  onDone: () => void;
  /** Restart the timer for the SAME step with `seconds`. */
  onExtend: (seconds: number) => void;
  isDark?: boolean;
}

export function VibeTimerCompleteSheet({
  visible,
  stepNumber,
  stepText,
  onDone,
  onExtend,
  isDark = false,
}: VibeTimerCompleteSheetProps) {
  const surfaceBg = isDark ? '#1f1f1f' : designTokens.colors.cream;
  const ink = isDark ? '#fff' : designTokens.colors.ink;
  const ink2 = isDark ? '#aaa' : designTokens.colors.ink2;
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;

  const handleDone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDone();
  };

  const handleExtend = (seconds: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onExtend(seconds);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDone}
      statusBarTranslucent
    >
      {/* Backdrop — pressable so the user can dismiss by tapping
          outside, which counts as Done (no extension). */}
      <Pressable
        onPress={handleDone}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 28,
        }}
      >
        {/* Card — pressable wrapper above stops backdrop-tap from
            firing when the user taps inside the card. */}
        <Pressable onPress={() => {}} style={{ width: '100%' }}>
          <Animated.View
            entering={FadeInDown.springify().damping(16)}
            style={{
              backgroundColor: surfaceBg,
              borderRadius: 28,
              borderWidth: 1,
              borderColor: cardBorder,
              paddingHorizontal: 24,
              paddingTop: 24,
              paddingBottom: 18,
              shadowColor: '#000',
              shadowOpacity: 0.3,
              shadowRadius: 30,
              shadowOffset: { width: 0, height: 12 },
              elevation: 18,
            }}
          >
            {/* Eyebrow */}
            <Text
              style={{
                fontFamily: designTokens.font.semibold,
                fontSize: 10.5,
                letterSpacing: 1.3,
                textTransform: 'uppercase',
                color: designTokens.colors.olive,
                marginBottom: 10,
              }}
            >
              Step {stepNumber} · Time's up
            </Text>

            {/* Title — one italic word per surface */}
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                fontSize: 28,
                color: ink,
                letterSpacing: -0.56,
              }}
            >
              Time's{' '}
              <Text
                style={{
                  fontFamily: designTokens.font.serifItalic,
                  fontStyle: 'italic',
                  fontSize: 32,
                  letterSpacing: -0.32,
                }}
              >
                up
              </Text>
              .
            </Text>

            {/* Subtitle — echoes the step text so the user gets
                contextual confirmation, not a generic "timer done". */}
            {stepText && (
              <Text
                style={{
                  fontFamily: designTokens.font.regular,
                  fontSize: 14.5,
                  lineHeight: 21,
                  color: ink2,
                  marginTop: 10,
                }}
              >
                {stepText}
              </Text>
            )}

            {/* Action stack */}
            <View style={{ marginTop: 22, gap: 8 }}>
              {/* Primary — Done */}
              <Pressable onPress={handleDone}>
                {({ pressed }) => (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      paddingVertical: 15,
                      borderRadius: 999,
                      backgroundColor: designTokens.colors.brand,
                      shadowColor: designTokens.colors.brandDeep,
                      shadowOpacity: 0.24,
                      shadowRadius: 14,
                      shadowOffset: { width: 0, height: 6 },
                      elevation: 3,
                      transform: [{ scale: pressed ? 0.985 : 1 }],
                    }}
                  >
                    <Check
                      size={16}
                      color={designTokens.colors.cream}
                      strokeWidth={2.4}
                    />
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 15,
                        color: designTokens.colors.cream,
                        letterSpacing: -0.2,
                      }}
                    >
                      Done
                    </Text>
                  </View>
                )}
              </Pressable>

              {/* Secondary row — +1 min / Snooze 30s side by side */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={() => handleExtend(60)} style={{ flex: 1 }}>
                  {({ pressed }) => (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        paddingVertical: 13,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: 'rgba(228,109,70,0.42)',
                        backgroundColor: 'transparent',
                        transform: [{ scale: pressed ? 0.985 : 1 }],
                      }}
                    >
                      <Clock
                        size={14}
                        color={designTokens.colors.olive}
                        strokeWidth={1.9}
                      />
                      <Text
                        style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 13.5,
                          color: designTokens.colors.olive,
                          letterSpacing: -0.15,
                        }}
                      >
                        +1 min
                      </Text>
                    </View>
                  )}
                </Pressable>

                <Pressable onPress={() => handleExtend(30)} style={{ flex: 1 }}>
                  {({ pressed }) => (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        paddingVertical: 13,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: cardBorder,
                        backgroundColor: 'transparent',
                        transform: [{ scale: pressed ? 0.985 : 1 }],
                      }}
                    >
                      <RotateCcw size={14} color={ink2} strokeWidth={1.9} />
                      <Text
                        style={{
                          fontFamily: designTokens.font.semibold,
                          fontSize: 13.5,
                          color: ink2,
                          letterSpacing: -0.15,
                        }}
                      >
                        Snooze 30s
                      </Text>
                    </View>
                  )}
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
