// HomeHeader Component - PlannPlate Home design
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Search, Bell, Crown } from 'lucide-react-native';
import { designTokens, getThemeColors } from '@/lib/design-tokens';
import { UserAvatarDisplay } from './ProfileSetupModal';

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
  userInitial = 'U',
  avatarUrl,
  isPremium = true,
  isDark = false,
  greetingWord,
  subtitleMessage,
  onSearchPress,
  onBellPress,
  onAvatarPress,
  trailingSlot,
}: HomeHeaderProps) {
  const colors = getThemeColors(isDark);
  const word = greetingWord || getTimeGreetingWord();
  const firstName = userName?.split(' ')[0] || 'there';
  const subtitle =
    subtitleMessage ||
    `${new Date().toLocaleDateString('en-US', { weekday: 'long' })} is planned. Dinner looks easy tonight.`;

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 }}>
      {/* Top row: Avatar + Actions */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        {/* Avatar */}
        <Pressable
          onPress={onAvatarPress}
          style={{ position: 'relative', width: 44, height: 44 }}
        >
          <UserAvatarDisplay
            size={44}
            avatarUrl={avatarUrl}
            name={userName || userInitial}
          />
          {/* Premium crown badge */}
          {isPremium && (
            <View
              style={{
                position: 'absolute',
                right: -4,
                bottom: -2,
                width: 18,
                height: 18,
                borderRadius: 999,
                backgroundColor: designTokens.colors.olive,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: colors.bg,
              }}
            >
              <Crown size={10} color="#F4C76A" strokeWidth={2} />
            </View>
          )}
        </Pressable>
      </View>

      {/* Greeting row — title + subtitle on the left, optional
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
              fontSize: 28,
              color: colors.ink,
              letterSpacing: -0.56,
              lineHeight: 31,
            }}
          >
            Good{' '}
            <Text
              style={{
                fontFamily: designTokens.font.serifItalic,
                fontSize: 32,
                fontStyle: 'italic',
              }}
            >
              {word}
            </Text>
            {', '}
            {firstName}
          </Text>
          <Text
            style={{
              marginTop: 6,
              color: colors.ink2,
              fontFamily: designTokens.font.regular,
              fontSize: 14.5,
              lineHeight: 20,
            }}
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
