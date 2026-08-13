// SupportPrompt — the quiet inline offer of help, placed at the specific
// moments a product actually frustrates people.
//
// Deliberately unstyled compared to everything else in the app: no card, no
// icon, no tinted surface. It is one sentence and one link. A prompt that looks
// like a component competes with the screen it's attached to; a prompt that
// looks like a sentence reads as the app noticing.
//
// Placement rule: these go where a specific thing has already gone wrong twice,
// or where a result is empty in a way the user didn't ask for. They must never
// appear speculatively — an offer of help on a screen that's working fine
// implies the product expects to fail.

import React, { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { designTokens, getThemeColors } from '@/lib/design-tokens';
import { useColorScheme } from '@/lib/useColorScheme';
import { supportCopy } from '@/lib/support/copy';
import { openSupportComposer } from '@/lib/support/store';
import { supportAnalytics } from '@/lib/support/analytics';
import type { SupportIntent } from '@/lib/support/types';

interface SupportPromptProps {
  /** The sentence. Comes from supportCopy.prompts — never written inline. */
  message: string;
  /** Product area, matching the `feature` key used by lib/failure. */
  feature: string;
  intent?: SupportIntent;
  /** Link text. Defaults to "Tell us". */
  actionLabel?: string;
  align?: 'left' | 'center';
}

export function SupportPrompt({
  message,
  feature,
  intent = 'bug',
  actionLabel = supportCopy.prompts.action,
  align = 'left',
}: SupportPromptProps) {
  const isDark = useColorScheme() === 'dark';
  const colors = getThemeColors(isDark);

  // The denominator for this prompt's click-through. Without it we'd only know
  // how often people tapped, not how often we offered — which is the number
  // that says whether the placement is right.
  useEffect(() => {
    supportAnalytics.contextualShown(feature);
  }, [feature]);

  return (
    <Animated.View entering={FadeIn.duration(260)}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          openSupportComposer({ intent, feature, entry: 'contextual' });
        }}
        accessibilityRole="button"
        accessibilityLabel={`${message} ${actionLabel}`}
        style={{
          minHeight: 44,
          justifyContent: 'center',
          paddingVertical: 6,
        }}
      >
        <View style={{ alignItems: align === 'center' ? 'center' : 'flex-start' }}>
          <Text
            style={{
              fontFamily: designTokens.font.regular,
              fontSize: 13.5,
              lineHeight: 20,
              color: colors.ink3,
              textAlign: align,
            }}
          >
            {message}{' '}
            <Text
              style={{
                fontFamily: designTokens.font.medium,
                color: designTokens.colors.brand,
              }}
            >
              {actionLabel}
            </Text>
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
