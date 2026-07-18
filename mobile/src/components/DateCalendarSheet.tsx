// DateCalendarSheet — a month calendar in a modal, opened from the date pill
// under the "Today" heading on the Meal Plan screen. Lets the user jump to any
// date (paging months), shows a status dot on days with meals, and offers a
// quick "Jump to today" shortcut. Selection is delegated to the caller.
import React, { useMemo } from 'react';
import { Modal, View, Text, Pressable } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { CalendarDays } from 'lucide-react-native';
import { designTokens, getThemeColors } from '@/lib/design-tokens';

const BRAND = designTokens.colors.brand; // #546445 — olive-green (selected + planned dot)

export interface DateCalendarSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Currently selected date, 'YYYY-MM-DD'. */
  selectedKey: string;
  /** Today, 'YYYY-MM-DD' — target for the "Jump to today" shortcut. */
  todayKey: string;
  /** Earliest selectable date, 'YYYY-MM-DD'. */
  minKey?: string;
  /** react-native-calendars markedDates (dots for planned/cooked days). */
  markedDates?: Record<string, { marked?: boolean; dotColor?: string }>;
  onSelect: (key: string) => void;
  isDark?: boolean;
}

export function DateCalendarSheet({
  visible,
  onClose,
  selectedKey,
  todayKey,
  minKey,
  markedDates,
  onSelect,
  isDark = false,
}: DateCalendarSheetProps) {
  const colors = getThemeColors(isDark);

  const marked = useMemo(() => {
    const merged: Record<string, any> = { ...(markedDates ?? {}) };
    const sel = { ...(merged[selectedKey] ?? {}) };
    sel.selected = true;
    sel.selectedColor = BRAND;
    if (sel.marked) sel.dotColor = '#fff'; // dot stays visible on the olive fill
    merged[selectedKey] = sel;
    return merged;
  }, [markedDates, selectedKey]);

  const choose = (key: string) => {
    onSelect(key);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'center',
          paddingHorizontal: 22,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.bg,
            borderRadius: 22,
            padding: 12,
            borderWidth: isDark ? 1 : 0,
            borderColor: isDark ? '#2a2a2a' : 'transparent',
          }}
        >
          <Calendar
            current={selectedKey}
            minDate={minKey}
            onDayPress={(d: { dateString: string }) => choose(d.dateString)}
            markedDates={marked}
            enableSwipeMonths
            firstDay={1}
            theme={{
              calendarBackground: 'transparent',
              textSectionTitleColor: colors.ink3,
              selectedDayBackgroundColor: BRAND,
              selectedDayTextColor: '#fff',
              todayTextColor: BRAND,
              dayTextColor: colors.ink,
              textDisabledColor: isDark ? '#3a3a3a' : designTokens.colors.hair,
              monthTextColor: colors.ink,
              arrowColor: BRAND,
              textMonthFontFamily: designTokens.font.semibold,
              textDayFontFamily: designTokens.font.medium,
              textDayHeaderFontFamily: designTokens.font.medium,
              textMonthFontSize: 16,
              textDayFontSize: 14,
              textDayHeaderFontSize: 11,
            }}
          />

          <View style={{ height: 1, backgroundColor: colors.hair2, marginTop: 4, marginBottom: 10 }} />

          <Pressable
            onPress={() => choose(todayKey)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              paddingVertical: 12,
              borderRadius: 999,
              backgroundColor: BRAND,
            }}
          >
            <CalendarDays size={16} color="#F6F2E9" strokeWidth={1.9} />
            <Text style={{ fontFamily: designTokens.font.semibold, fontSize: 14, color: '#F6F2E9' }}>
              Jump to today
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
