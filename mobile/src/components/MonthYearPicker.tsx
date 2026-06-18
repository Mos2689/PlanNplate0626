// MonthYearPicker — bottom-sheet month/year selector.
//
// Restyled to match the curated-plan + plan-meals + QuickActions design
// language: olive eyebrow caps, italic on exactly one word, solid sage
// selected pills, hairline cream unselected, scale-on-press + light
// haptics, brand-shadowed primary CTA. No Nativewind, no raw hex —
// pure designTokens inline styles.
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { ChevronDown, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { designTokens, elevation } from '@/lib/design-tokens';

interface MonthYearPickerProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  isDark: boolean;
  /**
   * When true, render the trigger as a small inline cream pill suitable
   * for sitting next to the page heading (e.g. inside HomeHeader's
   * trailing slot). Default trigger is the large 28px headline style.
   */
  compact?: boolean;
}

// Short month names used by the compact trigger so the pill stays
// comfortably narrow when sitting next to the greeting headline.
const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function MonthYearPicker({
  selectedDate,
  onDateChange,
  minDate,
  maxDate,
  isDark,
  compact = false,
}: MonthYearPickerProps) {
  const [showModal, setShowModal] = useState(false);
  const [tempMonth, setTempMonth] = useState(selectedDate.getMonth());
  const [tempYear, setTempYear] = useState(selectedDate.getFullYear());

  // ── Tokenized style helpers ──
  const sheetBg = isDark ? '#1f1f1f' : '#FFFFFF';
  const cardBorder = isDark ? '#2a2a2a' : designTokens.colors.hair;
  const restingPillBg = isDark ? '#181814' : designTokens.colors.cream;
  const inkPrimary = isDark ? '#fff' : designTokens.colors.ink;
  const inkSecondary = isDark ? '#999' : designTokens.colors.ink2;
  const inkTertiary = isDark ? '#666' : designTokens.colors.ink3;

  // Generate available years (from minDate year to maxDate year)
  const availableYears = useMemo(() => {
    const startYear = minDate ? minDate.getFullYear() : new Date().getFullYear() - 5;
    const endYear = maxDate ? maxDate.getFullYear() : new Date().getFullYear() + 5;
    const years: number[] = [];
    for (let i = startYear; i <= endYear; i++) {
      years.push(i);
    }
    return years;
  }, [minDate, maxDate]);

  const isMonthAvailable = (month: number, year: number) => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    if (minDate) {
      const minAtMidnight = new Date(minDate);
      minAtMidnight.setHours(0, 0, 0, 0);
      if (lastDayOfMonth < minAtMidnight) return false;
    }
    if (maxDate) {
      const maxAtMidnight = new Date(maxDate);
      maxAtMidnight.setHours(0, 0, 0, 0);
      if (firstDayOfMonth > maxAtMidnight) return false;
    }
    return true;
  };

  const openModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTempMonth(selectedDate.getMonth());
    setTempYear(selectedDate.getFullYear());
    setShowModal(true);
  };

  const handleConfirm = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newDate = new Date(tempYear, tempMonth, 1);
    onDateChange(newDate);
    setShowModal(false);
  };

  const handleCancel = () => {
    setTempMonth(selectedDate.getMonth());
    setTempYear(selectedDate.getFullYear());
    setShowModal(false);
  };

  return (
    <>
      {/* Trigger — large headline by default, or a compact cream pill
          for the in-header (next-to-greeting) layout. */}
      <Pressable onPress={openModal} hitSlop={6}>
        {({ pressed }) =>
          compact ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingLeft: 11,
                paddingRight: 8,
                paddingVertical: 7,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: cardBorder,
                backgroundColor: restingPillBg,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 12.5,
                  color: inkPrimary,
                  letterSpacing: -0.1,
                }}
                numberOfLines={1}
              >
                {SHORT_MONTHS[selectedDate.getMonth()]}{' '}
                {selectedDate.getFullYear()}
              </Text>
              <ChevronDown size={13} color={inkTertiary} strokeWidth={2} />
            </View>
          ) : (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              }}
            >
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 28,
                  color: inkPrimary,
                  letterSpacing: -0.56,
                }}
              >
                {MONTHS[selectedDate.getMonth()]}{' '}
                {selectedDate.getFullYear()}
              </Text>
              <ChevronDown size={18} color={inkTertiary} strokeWidth={1.9} />
            </View>
          )
        }
      </Pressable>

      {/* Modal sheet */}
      <Modal
        visible={showModal}
        transparent
        animationType="slide"
        onRequestClose={handleCancel}
        // Defensive — ensures correct iOS layering even if this picker
        // ever ends up rendered from inside a stacked navigation context.
        presentationStyle="overFullScreen"
        statusBarTranslucent
      >
        <View style={styles.backdrop}>
          {/* Backdrop layer — tap to dismiss. Sibling of the sheet so taps
              inside the sheet don't bubble through to the backdrop. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={handleCancel} />

          <View style={[styles.sheet, { backgroundColor: sheetBg }]}>
            {/* Drag handle */}
            <View style={styles.handleWrap}>
              <View style={styles.handle} />
            </View>

            {/* Editorial header */}
            <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 14 }}>
              <Text
                style={{
                  fontFamily: designTokens.font.semibold,
                  fontSize: 11,
                  letterSpacing: 1.3,
                  textTransform: 'uppercase',
                  color: designTokens.colors.olive,
                  marginBottom: 8,
                }}
              >
                JUMP TO
              </Text>
              <Text
                style={{
                  fontFamily: designTokens.font.medium,
                  fontSize: 24,
                  color: inkPrimary,
                  letterSpacing: -0.48,
                }}
              >
                Pick a{' '}
                <Text
                  style={{
                    fontFamily: designTokens.font.serifItalic,
                    fontStyle: 'italic',
                    fontSize: 28,
                    letterSpacing: -0.28,
                  }}
                >
                  month
                </Text>
                .
              </Text>
              <Text
                style={{
                  fontFamily: designTokens.font.regular,
                  fontSize: 13,
                  color: inkSecondary,
                  marginTop: 6,
                }}
              >
                Months outside the available range will be dimmed.
              </Text>
            </View>

            {/* Two-column picker */}
            <View
              style={{
                flexDirection: 'row',
                gap: 12,
                paddingHorizontal: 16,
                paddingBottom: 14,
              }}
            >
              {/* Month column */}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 11,
                    letterSpacing: 0.55,
                    textTransform: 'uppercase',
                    color: inkTertiary,
                    marginBottom: 10,
                    paddingHorizontal: 4,
                  }}
                >
                  Month
                </Text>
                <ScrollView
                  style={{ maxHeight: 280 }}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  contentContainerStyle={{ gap: 6, paddingBottom: 6 }}
                >
                  {MONTHS.map((month, index) => {
                    const isAvailable = isMonthAvailable(index, tempYear);
                    const isSelected = index === tempMonth;
                    return (
                      <Pressable
                        key={month}
                        onPress={() => {
                          if (!isAvailable) return;
                          Haptics.selectionAsync();
                          setTempMonth(index);
                        }}
                        disabled={!isAvailable}
                      >
                        {({ pressed }) => (
                          <View
                            style={{
                              paddingVertical: 12,
                              paddingHorizontal: 14,
                              borderRadius: 14,
                              borderWidth: isSelected ? 0 : 1,
                              borderColor: cardBorder,
                              backgroundColor: isSelected
                                ? designTokens.colors.brand
                                : restingPillBg,
                              opacity: isAvailable ? 1 : 0.35,
                              transform: [
                                { scale: pressed && isAvailable ? 0.97 : 1 },
                              ],
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: designTokens.font.semibold,
                                fontSize: 13.5,
                                color: isSelected
                                  ? designTokens.colors.cream
                                  : inkPrimary,
                                letterSpacing: -0.15,
                              }}
                            >
                              {month}
                            </Text>
                            {isSelected && (
                              <Check
                                size={14}
                                color={designTokens.colors.cream}
                                strokeWidth={2.4}
                              />
                            )}
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Year column */}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontFamily: designTokens.font.semibold,
                    fontSize: 11,
                    letterSpacing: 0.55,
                    textTransform: 'uppercase',
                    color: inkTertiary,
                    marginBottom: 10,
                    paddingHorizontal: 4,
                  }}
                >
                  Year
                </Text>
                <ScrollView
                  style={{ maxHeight: 280 }}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  contentContainerStyle={{ gap: 6, paddingBottom: 6 }}
                >
                  {availableYears.map((year) => {
                    const isAvailable = isMonthAvailable(tempMonth, year);
                    const isSelected = year === tempYear;
                    return (
                      <Pressable
                        key={year}
                        onPress={() => {
                          if (!isAvailable) return;
                          Haptics.selectionAsync();
                          setTempYear(year);
                        }}
                        disabled={!isAvailable}
                      >
                        {({ pressed }) => (
                          <View
                            style={{
                              paddingVertical: 12,
                              paddingHorizontal: 14,
                              borderRadius: 14,
                              borderWidth: isSelected ? 0 : 1,
                              borderColor: cardBorder,
                              backgroundColor: isSelected
                                ? designTokens.colors.brand
                                : restingPillBg,
                              opacity: isAvailable ? 1 : 0.35,
                              transform: [
                                { scale: pressed && isAvailable ? 0.97 : 1 },
                              ],
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: designTokens.font.semibold,
                                fontSize: 13.5,
                                color: isSelected
                                  ? designTokens.colors.cream
                                  : inkPrimary,
                                letterSpacing: -0.15,
                              }}
                            >
                              {year}
                            </Text>
                            {isSelected && (
                              <Check
                                size={14}
                                color={designTokens.colors.cream}
                                strokeWidth={2.4}
                              />
                            )}
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            {/* Action buttons */}
            <View
              style={{
                flexDirection: 'row',
                gap: 10,
                paddingHorizontal: 16,
                paddingTop: 8,
                paddingBottom: 24,
              }}
            >
              {/* Cancel — ghost */}
              <Pressable onPress={handleCancel} style={{ flex: 1 }}>
                {({ pressed }) => (
                  <View
                    style={{
                      paddingVertical: 15,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: cardBorder,
                      backgroundColor: restingPillBg,
                      alignItems: 'center',
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: designTokens.font.semibold,
                        fontSize: 15,
                        color: inkPrimary,
                        letterSpacing: -0.2,
                      }}
                    >
                      Cancel
                    </Text>
                  </View>
                )}
              </Pressable>

              {/* Confirm — primary sage CTA, hero shadow */}
              <Pressable onPress={handleConfirm} style={{ flex: 1.4 }}>
                {({ pressed }) => (
                  <View
                    style={{
                      paddingVertical: 15,
                      borderRadius: 999,
                      backgroundColor: designTokens.colors.brand,
                      alignItems: 'center',
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
                        fontSize: 15,
                        color: designTokens.colors.cream,
                        letterSpacing: -0.2,
                      }}
                    >
                      Confirm
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D8D4C9',
  },
});
