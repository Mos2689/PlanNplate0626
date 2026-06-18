// WeekStrip Component - PlannPlate Home design
// Horizontally scrollable day selector with status indicators (cooked, planned, skipped, empty)
import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { designTokens, getThemeColors } from '@/lib/design-tokens';

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
}

interface WeekStripProps {
  days: DayData[];
  onDayPress?: (day: DayData, index: number) => void;
  isDark?: boolean;
  /** Index to auto-scroll into view on mount / when it changes */
  scrollToIndex?: number;
}

const DAY_WIDTH = 48;
const DAY_GAP = 4;

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
      <Text style={{ fontSize: 11, color: designTokens.colors.ink3, fontFamily: designTokens.font.regular }}>
        {label}
      </Text>
    </View>
  );
}

export function WeekStrip({ days, onDayPress, isDark = false, scrollToIndex }: WeekStripProps) {
  const colors = getThemeColors(isDark);
  const scrollRef = useRef<ScrollView>(null);

  // Auto-scroll to the requested index whenever it changes (or on mount).
  // We aim to roughly center the target day in the viewport.
  useEffect(() => {
    if (scrollToIndex == null || scrollToIndex < 0) return;
    const offset = Math.max(
      0,
      scrollToIndex * (DAY_WIDTH + DAY_GAP) - DAY_WIDTH * 2.5,
    );
    // Defer to next tick so the ScrollView is laid out
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: offset, animated: true });
    }, 0);
    return () => clearTimeout(t);
  }, [scrollToIndex]);

  return (
    <View style={{ paddingTop: 4, paddingBottom: 16 }}>
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
          return (
            <Pressable
              key={index}
              onPress={() => onDayPress?.(day, index)}
              style={{
                width: DAY_WIDTH,
                alignItems: 'center',
                gap: 6,
                paddingTop: 8,
                paddingBottom: 10,
                borderRadius: 14,
                backgroundColor: isActive ? designTokens.colors.brand : 'transparent',
              }}
            >
              {/* Month label (above the day letter for the first day of each month).
                  Reserved a slot for all days so vertical alignment stays consistent. */}
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 9.5,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  color: isActive ? 'rgba(255,255,255,0.85)' : designTokens.colors.ink2,
                  height: 11,
                  lineHeight: 11,
                }}
              >
                {day.monthLabel ?? ''}
              </Text>

              {/* Day letter */}
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 11,
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
                  fontSize: 17,
                  letterSpacing: -0.34,
                  color: isActive ? '#fff' : colors.ink,
                }}
              >
                {day.date}
              </Text>

              <StatusDots day={day} isActive={isActive} />
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Legend */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 12 }}>
        <LegendDot color={STATUS_COLORS.cooked} label="Cooked" />
        <LegendDot color={STATUS_COLORS.planned} label="Planned" />
        <LegendDot color={STATUS_COLORS.skipped} label="Skipped" />
        <LegendDot color="transparent" label="Empty" isEmpty />
      </View>
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
