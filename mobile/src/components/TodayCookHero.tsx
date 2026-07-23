// TodayCookHero — the green "cooking today" banner at the top of the Meal Plan
// screen's today section. Warm, editorial nudge about the selected day's plan,
// echoing the PlanNplate logo spiral as a faint watermark and its green→warm
// gradient. Purely presentational: the caller computes the counts + dish names.
import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { designTokens, serifItalicFontStyle } from '@/lib/design-tokens';

const CREAM = designTokens.colors.cream;

// Olive → deeper olive with a subtle warm corner (bottom-right), echoing the
// logo's green-to-terracotta fade. Exported so other brand CTAs (e.g. the
// "Plan My Meals" tile) can share the exact same gradient.
export const HERO_GRADIENT = ['#5F7150', '#4A5A37', '#544A34'] as const;
export const HERO_LOCATIONS = [0, 0.55, 1] as const;
// Warm charcoal→brown — shared with the grocery status card and the profile
// "Share with friends" CTA. Used for the "cooking today" hero on Your Plate.
export const HERO_GRADIENT_WARM = ['#181612', '#2d1811'] as const;

const NUM_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const countWord = (n: number) => (n >= 1 && n <= 9 ? NUM_WORDS[n] : String(n));

interface TodayCookHeroProps {
  isToday: boolean;
  weekdayLabel: string; // e.g. "Tuesday"
  dateLabel: string;    // e.g. "Tue 18"
  plannedCount: number;
  cookedCount: number;
  dishes: string[];     // dish names for the day (in menu order)
  userName?: string;
}

// A faint spiral echo of the logo — two concentric rings bleeding off the
// right edge. Cheap (no SVG) and reads as brand texture behind the copy.
function SpiralWatermark() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', right: -34, top: -26, width: 150, height: 150 }}>
      <View
        style={{
          position: 'absolute',
          width: 150,
          height: 150,
          borderRadius: 999,
          borderWidth: 10,
          borderColor: 'rgba(250,247,240,0.13)',
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: 34,
          top: 34,
          width: 82,
          height: 82,
          borderRadius: 999,
          borderWidth: 10,
          borderColor: 'rgba(250,247,240,0.13)',
        }}
      />
    </View>
  );
}

export function TodayCookHero({
  isToday,
  weekdayLabel,
  dateLabel,
  plannedCount,
  cookedCount,
  dishes,
  userName,
}: TodayCookHeroProps) {
  const remaining = Math.max(0, plannedCount - cookedCount);
  const name = userName?.trim();

  const mode: 'planned' | 'cooked' | 'empty' =
    plannedCount === 0 ? 'empty' : remaining === 0 ? 'cooked' : 'planned';

  const eyebrow = isToday
    ? `COOKING TODAY  ·  ${dateLabel}`
    : `${weekdayLabel.toUpperCase()}  ·  ${dateLabel}`;

  const headlineStyle = {
    fontFamily: designTokens.font.semibold,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.3,
    color: CREAM,
  } as const;

  const accentStyle = {
    fontFamily: designTokens.font.serifItalic,
    fontStyle: serifItalicFontStyle,
    fontSize: 22,
    color: CREAM,
  } as const;

  const dishLineStyle = {
    fontFamily: designTokens.font.regular,
    fontSize: 12.5,
    lineHeight: 17,
    color: 'rgba(250,247,240,0.82)',
    marginTop: 8,
  } as const;

  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
      <LinearGradient
        colors={HERO_GRADIENT_WARM}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          overflow: 'hidden',
          borderRadius: 18,
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 15,
        }}
      >
        <SpiralWatermark />
        <View style={{ position: 'relative' }}>
          <Text
            style={{
              fontFamily: designTokens.font.semibold,
              fontSize: 10.5,
              letterSpacing: 1,
              color: 'rgba(250,247,240,0.68)',
            }}
          >
            {eyebrow}
          </Text>

          {mode === 'planned' && (
            <>
              <Text style={{ ...headlineStyle, marginTop: 8 }}>
                <Text style={accentStyle}>{countWord(remaining)}</Text>
                {` ${remaining === 1 ? 'dish' : 'dishes'} to cook${isToday ? ' today' : ` ${weekdayLabel}`}.`}
              </Text>
              {isToday ? <Text style={headlineStyle}>You've got this.</Text> : null}
              {dishes.length > 0 ? (
                <Text style={dishLineStyle} numberOfLines={2}>
                  {dishes.join('  ·  ')}
                </Text>
              ) : null}
            </>
          )}

          {mode === 'cooked' && (
            <>
              <Text style={{ ...headlineStyle, marginTop: 8 }}>
                {isToday ? 'All cooked for today.' : 'All cooked.'}
              </Text>
              <Text style={headlineStyle}>{name ? `Nice work, ${name}.` : 'Nice work.'}</Text>
              {dishes.length > 0 ? (
                <Text style={dishLineStyle} numberOfLines={2}>
                  {dishes.join('  ·  ')}
                </Text>
              ) : null}
            </>
          )}

          {mode === 'empty' && (
            <>
              <Text style={{ ...headlineStyle, marginTop: 8 }}>Nothing planned yet</Text>
              <Text style={dishLineStyle}>
                {isToday
                  ? 'Try Plan My Meals or add recipes manually.'
                  : `No meals planned for ${weekdayLabel}.`}
              </Text>
            </>
          )}
        </View>
      </LinearGradient>
    </View>
  );
}
