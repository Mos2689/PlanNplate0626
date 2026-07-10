// HomeHeader Component - PlannPlate Home design
import React from 'react';
import { View, Text, Platform } from 'react-native';
import { designTokens, getThemeColors, serifItalicFontStyle } from '@/lib/design-tokens';
import { t } from '@/lib/platform-tokens';

interface HomeHeaderProps {
  userName?: string;
  userInitial?: string;
  avatarUrl?: string | null;
  isPremium?: boolean;
  isDark?: boolean;
  greetingWord?: string;        // e.g. "morning" / "afternoon" / "evening" — rendered in Instrument Serif italic
  subtitleMessage?: string;
  onSearchPress?: () => void;
  onBellPress?: () => void;
  onAvatarPress?: () => void;
  /**
   * Optional content rendered to the right of the greeting headline,
   * top-aligned with the title line. Used by the Meal Planning tab to
   * tuck the MonthYearPicker into the page header instead of giving it
   * its own row below the banner.
   */
  trailingSlot?: React.ReactNode;
}

function getTimeGreetingWord() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function HomeHeader({
  userName,
  isDark = false,
  greetingWord,
  subtitleMessage,
  trailingSlot,
}: HomeHeaderProps) {
  const colors = getThemeColors(isDark);
  const word = greetingWord || getTimeGreetingWord();
  const firstName = userName?.split(' ')[0] || 'there';
  const subtitle =
    subtitleMessage ||
    `${new Date().toLocaleDateString('en-US', { weekday: 'long' })} is planned. Dinner looks easy tonight.`;

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 }}>
      {/* Greeting row — salutation + subtitle on the left, optional
          trailingSlot (e.g. compact MonthYearPicker) top-aligned on the
          right. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: designTokens.font.medium,
              fontSize: t(28, 24),
              color: colors.ink,
              letterSpacing: t(-0.56, -0.4),
              lineHeight: t(31, 28),
            }}
            numberOfLines={2}
            adjustsFontSizeToFit={Platform.OS === 'android'}
            minimumFontScale={0.85}
          >
            Good{' '}
            <Text
              style={{
                fontFamily: designTokens.font.serifItalic,
                fontSize: t(32, 28),
                fontStyle: serifItalicFontStyle,
              }}
            >
              {word}
            </Text>
            {', '}
            {firstName}
          </Text>
          {/* Message of the day — light subline beneath the salutation. */}
          <Text
            style={{
              marginTop: t(6, 4),
              color: colors.ink2,
              fontFamily: designTokens.font.regular,
              fontSize: t(14.5, 13.5),
              lineHeight: t(20, 18),
            }}
            numberOfLines={2}
            adjustsFontSizeToFit={Platform.OS === 'android'}
            minimumFontScale={0.85}
          >
            {subtitle}
          </Text>
        </View>
        {trailingSlot ? (
          // Nudge the slot down a touch so the chip's vertical center
          // sits roughly mid-height with the greeting title's cap-height.
          <View style={{ paddingTop: 5 }}>{trailingSlot}</View>
        ) : null}
      </View>
    </View>
  );
}
