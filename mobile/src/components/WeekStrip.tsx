// WeekStrip Component - PlannPlate Home design
// Horizontally scrollable day selector with status indicators (cooked, planned, skipped, empty)
import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { designTokens, getThemeColors } from '@/lib/design-tokens';
import { androidTokens, t } from '@/lib/platform-tokens';

export type DayStatus = 'cooked' | 'planned' | 'skipped' | 'empty' | 'today';

export interface DayData {
  day: string;      // Single letter: 'M', 'T', 'W', etc.
  date: number;     // Date number: 11, 12, 13, etc.
  status: DayStatus;
  isToday?: boolean;
  isFuture?: boolean;
  /** Optional secondary partial state — e.g. cooked dinner but skipped lunch */
  partial?: 'skipped';
  /** Optional month label shown above the first day of each month */
  monthLabel?: string;
  /** True on the first day of a week (Monday) — used to draw a week divider */
  isWeekStart?: boolean;
}

interface WeekStripProps {
  days: DayData[];
  onDayPress?: (day: DayData, index: number) => void;
  isDark?: boolean;
  /** Index to auto-scroll into view on mount / when it changes */
  scrollToIndex?: number;
  /** Slim variant — flatter card, tighter pills, no legend. Used on the Meal
   *  Plan screen where the green hero above already conveys the day's status. */
  compact?: boolean;
}

const DAY_WIDTH = 48;
const DAY_GAP = 4;
// Total horizontal space a week divider adds to the row (line + its margins).
const WEEK_DIVIDER_WIDTH = 1 + 8; // 1px hairline + 4px margin each side

const STATUS_COLORS: Record<DayStatus, string> = {
  cooked: designTokens.colors.olive,
  planned: designTokens.colors.brand,
  skipped: designTokens.colors.skipped,
  empty: 'transparent',
  today: designTokens.colors.brand,
};

function StatusDots({ day, isActive }: { day: DayData; isActive: boolean }) {
  if (day.status === 'cooked' && day.partial === 'skipped') {
    return (
      <View style={{ flexDirection: 'row', gap: 3, height: 5, alignItems: 'center' }}>
        <View style={{ width: 5, height: 5, borderRadius: 999, backgroundColor: designTokens.colors.olive }} />
        <View style={{ width: 5, height: 5, borderRadius: 999, backgroundColor: designTokens.colors.skipped }} />
      </View>
    );
  }

  if (day.status === 'empty') {
    return (
      <View style={{ flexDirection: 'row', gap: 3, height: 5, alignItems: 'center' }}>
        <View
          style={{
            width: 5,
            height: 5,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: isActive ? 'rgba(255,255,255,0.4)' : designTokens.colors.emptyBorder,
            backgroundColor: 'transparent',
          }}
        />
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', gap: 3, height: 5, alignItems: 'center' }}>
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          backgroundColor: isActive ? '#fff' : STATUS_COLORS[day.status],
        }}
      />
    </View>
  );
}

function LegendDot({ color, label, isEmpty }: { color: string; label: string; isEmpty?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          backgroundColor: isEmpty ? 'transparent' : color,
          borderWidth: isEmpty ? 1 : 0,
          borderColor: isEmpty ? designTokens.colors.emptyBorder : 'transparent',
        }}
      />
      <Text style={{ fontSize: t(11, androidTokens.weekStrip.legendFontSize), color: designTokens.colors.ink3, fontFamily: designTokens.font.regular }}>
        {label}
      </Text>
    </View>
  );
}

export function WeekStrip({ days, onDayPress, isDark = false, scrollToIndex, compact = false }: WeekStripProps) {
  const colors = getThemeColors(isDark);
  const scrollRef = useRef<ScrollView>(null);

  // Auto-scroll to the requested index whenever it changes (or on mount).
  // We aim to roughly center the target day in the viewport.
  useEffect(() => {
    if (scrollToIndex == null || scrollToIndex < 0) return;
    // Account for the week dividers rendered before the target day so the
    // centering stays accurate as the strip spans multiple weeks.
    const dividersBefore = days
      .slice(0, scrollToIndex + 1)
      .filter((d, i) => i > 0 && d.isWeekStart).length;
    const offset = Math.max(
      0,
      scrollToIndex * (DAY_WIDTH + DAY_GAP) + dividersBefore * WEEK_DIVIDER_WIDTH - DAY_WIDTH * 2.5,
    );
    // Defer to next tick so the ScrollView is laid out
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: offset, animated: true });
    }, 0);
    return () => clearTimeout(t);
    // Intentionally only re-scroll when the selected index changes, not on every
    // data refresh (e.g. marking a meal cooked), so the strip doesn't jump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToIndex]);

  // Elevated cream card ("toolbar" feel) that the date strip floats in.
  const cardBg = isDark ? '#181814' : designTokens.colors.cream;
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;

  return (
    <View style={{ paddingTop: compact ? 0 : 4, paddingBottom: compact ? 6 : 16, paddingHorizontal: 16 }}>
      {/* Elevated cream card wrapping the scrollable days. Outer layer carries
          the shadow + border; inner layer clips the horizontal scroll to the
          rounded corners. Compact drops the shadow for a flatter, slimmer strip. */}
      <View
        style={{
          borderRadius: 16,
          backgroundColor: cardBg,
          borderWidth: 1,
          borderColor: cardBorder,
          ...(compact
            ? {}
            : {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isDark ? 0.28 : 0.06,
                shadowRadius: 8,
                elevation: 2,
              }),
        }}
      >
      <View style={{ borderRadius: 15, overflow: 'hidden', paddingVertical: compact ? 2 : 6 }}>
      {/* Scrollable days */}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 12,
          gap: DAY_GAP,
          alignItems: 'flex-start',
        }}
      >
        {days.map((day, index) => {
          const isActive = day.status === 'today' || !!day.isToday;
          // Vertical hairline marking the start of a new week (Monday). Skipped
          // for the very first day so the strip doesn't open with a divider.
          const weekDivider =
            day.isWeekStart && index > 0 ? (
              <View
                style={{
                  width: 1,
                  alignSelf: 'stretch',
                  marginVertical: 6,
                  marginHorizontal: 4,
                  borderRadius: 1,
                  backgroundColor: isDark ? '#3a3a3a' : designTokens.colors.hair,
                }}
              />
            ) : null;
          return (
            <React.Fragment key={index}>
              {weekDivider}
              <Pressable
                onPress={() => onDayPress?.(day, index)}
              style={{
                width: DAY_WIDTH,
                alignItems: 'center',
                gap: compact ? 2 : t(6, 5),
                paddingTop: compact ? 4 : t(8, androidTokens.weekStrip.dayPaddingTop),
                paddingBottom: compact ? 4 : t(10, androidTokens.weekStrip.dayPaddingBottom),
                borderRadius: 12,
                backgroundColor: isActive ? designTokens.colors.brand : 'transparent',
              }}
            >
              {/* Month label (above the day letter for the first day of each month).
                  Reserved a slot for all days so vertical alignment stays consistent.
                  Hidden in compact mode to shave height. */}
              {!compact && (
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: t(9.5, androidTokens.weekStrip.monthFontSize),
                    letterSpacing: 0.4,
                    textTransform: 'uppercase',
                    color: isActive ? 'rgba(255,255,255,0.85)' : designTokens.colors.ink2,
                    height: 11,
                    lineHeight: 11,
                  }}
                >
                  {day.monthLabel ?? ''}
                </Text>
              )}

              {/* Day letter */}
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: t(11, androidTokens.weekStrip.dayLetterFontSize),
                  letterSpacing: 0.44,
                  textTransform: 'uppercase',
                  color: isActive ? 'rgba(255,255,255,0.7)' : designTokens.colors.ink3,
                }}
              >
                {day.day}
              </Text>

              {/* Date number */}
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: compact ? 15 : t(17, androidTokens.weekStrip.dateFontSize),
                  letterSpacing: -0.34,
                  color: isActive ? '#fff' : colors.ink,
                }}
              >
                {day.date}
              </Text>

                <StatusDots day={day} isActive={isActive} />
              </Pressable>
            </React.Fragment>
          );
        })}
      </ScrollView>
      </View>
      </View>

      {/* Legend — hidden in compact mode (the hero above conveys today's status). */}
      {!compact && (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 12 }}>
          <LegendDot color={STATUS_COLORS.cooked} label="Cooked" />
          <LegendDot color={STATUS_COLORS.planned} label="Planned" />
          <LegendDot color={STATUS_COLORS.skipped} label="Skipped" />
          <LegendDot color="transparent" label="Empty" isEmpty />
        </View>
      )}
    </View>
  );
}

// Helper to generate week data from a base date (kept for compatibility with older callers)
export function generateWeekDays(baseDate: Date): DayData[] {
  const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const startOfWeek = new Date(baseDate);
  const day = startOfWeek.getDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  startOfWeek.setDate(startOfWeek.getDate() - daysToMonday);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: DayData[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);

    const isToday = date.toDateString() === today.toDateString();

    days.push({
      day: dayNames[date.getDay()],
      date: date.getDate(),
      status: isToday ? 'today' : 'empty',
      isToday,
    });
  }

  return days;
}
