// PagerSheet — reusable bottom-sheet shell with a horizontal pager.
// Each "page" gets the full visible canvas. Used by CookConfirmSheet and
// WeeklyRatingSheet. Editorial header + animated dot indicator + footer slot.
//
// Design principles (Emil Kowalski playbook):
// - Custom ease-out curve everywhere (no flat CSS easings)
// - Active dot animates smoothly with scroll position (not a hard swap)
// - Press feedback on every Pressable
// - Horizontal pager gestures never fight the sheet's vertical drag
//   (FlatList's horizontal swipe is naturally compatible with Modal's
//   vertical drag, but we set `nestedScrollEnabled` + `keyboardShouldPersistTaps`).

import React, { useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  FlatList,
  Dimensions,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { designTokens, easing, getThemeColors } from '@/lib/design-tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface PagerSheetHeader {
  eyebrow: string;
  title: string;
  subtitle?: string;
}

export interface PagerSheetProps {
  visible: boolean;
  header: PagerSheetHeader;
  pages: React.ReactNode[]; // one node per data page
  completion?: React.ReactNode; // synthetic last page (success state)
  footer?: React.ReactNode | ((ctx: { index: number; isCompletion: boolean }) => React.ReactNode);
  currentIndex?: number; // controlled if provided
  onIndexChange?: (idx: number) => void;
  onClose: () => void;
  isDark?: boolean;
}

export function PagerSheet({
  visible,
  header,
  pages,
  completion,
  footer,
  currentIndex: controlledIndex,
  onIndexChange,
  onClose,
  isDark = false,
}: PagerSheetProps) {
  const colors = getThemeColors(isDark);
  const listRef = useRef<FlatList>(null);

  // All pages = data pages + (optional) completion page
  const allPages = useMemo<React.ReactNode[]>(
    () => (completion ? [...pages, completion] : pages),
    [pages, completion],
  );

  const totalPages = allPages.length;
  const completionIndex = completion ? totalPages - 1 : -1;

  // Track scroll position as a shared value — drives the dot indicator
  const scrollX = useSharedValue(0);
  const [internalIndex, setInternalIndex] = React.useState(0);
  const index = controlledIndex ?? internalIndex;
  const isCompletion = index === completionIndex;

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollX.value = e.nativeEvent.contentOffset.x;
    },
    [scrollX],
  );

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
      if (newIndex !== index) {
        setInternalIndex(newIndex);
        onIndexChange?.(newIndex);
      }
    },
    [index, onIndexChange],
  );

  // Imperative API: parent can scroll to a specific page (e.g. after auto-advance)
  const scrollTo = useCallback(
    (i: number) => {
      listRef.current?.scrollToOffset({ offset: i * SCREEN_WIDTH, animated: true });
      setInternalIndex(i);
      onIndexChange?.(i);
    },
    [onIndexChange],
  );

  // Re-snap when controlled index changes externally
  React.useEffect(() => {
    if (controlledIndex !== undefined && controlledIndex !== internalIndex) {
      listRef.current?.scrollToOffset({
        offset: controlledIndex * SCREEN_WIDTH,
        animated: true,
      });
      setInternalIndex(controlledIndex);
    }
  }, [controlledIndex, internalIndex]);

  // Expose `scrollTo` via context so child pages can self-advance.
  // Kept as a ref on the component instance via a simple imperative handle
  // through React.useImperativeHandle would require forwardRef; we keep it
  // simpler by relying on `onIndexChange` from parent + controlled mode.

  const renderItem = useCallback(
    ({ item }: { item: React.ReactNode }) => (
      <View style={{ width: SCREEN_WIDTH }}>{item}</View>
    ),
    [],
  );

  const renderFooter = () => {
    if (typeof footer === 'function') return footer({ index, isCompletion });
    return footer ?? null;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      // CRITICAL — without these, when PagerSheet is opened from inside a
      // screen that is itself stack-pushed on top of another presented modal
      // (e.g. /curated-plan-detail card pushed over the /curated-meal-plan
      // modal), iOS presents this Modal at the wrong layer in the window
      // hierarchy and it appears BEHIND the host screen instead of above it.
      // `presentationStyle="overFullScreen"` forces the topmost layer on iOS;
      // `statusBarTranslucent` does the same on Android.
      presentationStyle="overFullScreen"
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.backdrop}>
          {/* Invisible backdrop layer — closes sheet on tap, but doesn't wrap the sheet
              (so gestures inside the sheet aren't intercepted) */}
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

          <View style={[styles.sheet, { backgroundColor: designTokens.colors.cream }]}>
          {/* Drag handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          {/* Editorial header */}
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>{header.eyebrow}</Text>
                <Text style={[styles.title, { color: colors.ink }]}>
                  {renderTitleWithEmphasis(header.title)}
                </Text>
                {!!header.subtitle && (
                  <Text style={styles.subtitle}>{header.subtitle}</Text>
                )}
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.closeBtn,
                  pressed && styles.pressed,
                ]}
              >
                <X size={16} color={designTokens.colors.ink2} strokeWidth={1.6} />
              </Pressable>
            </View>

            {/* Dot indicator + swipe hint on first page */}
            {totalPages > 1 && (
              <View style={styles.dotsRowOuter}>
                <View style={styles.dotsRow}>
                  {allPages.map((_, i) => (
                    <Dot key={i} index={i} scrollX={scrollX} />
                  ))}
                </View>
                {index === 0 && (
                  <Text style={styles.swipeHint}>swipe →</Text>
                )}
              </View>
            )}
          </View>

          {/* Pager */}
          <FlatList
            ref={listRef}
            data={allPages}
            renderItem={renderItem}
            keyExtractor={(_, i) => `page-${i}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onMomentumScrollEnd={handleMomentumEnd}
            keyboardShouldPersistTaps="handled"
            decelerationRate="fast"
            removeClippedSubviews={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ flexGrow: 0 }}
          />

          {/* Footer */}
          {!!footer && <View style={styles.footer}>{renderFooter()}</View>}
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─────────── Title parser ───────────
// Brand rule: only ONE word per screen may be italic. Wrap that word in
// asterisks in the source string — e.g. "Yesterday in your *kitchen*."
// Renders regular Geist medium for the rest, InstrumentSerif italic for
// the single emphasized word.
function renderTitleWithEmphasis(text: string) {
  const parts = text.split(/\*([^*]+)\*/g);
  return parts.map((part, i) =>
    i % 2 === 0 ? (
      <Text key={i} style={styles.titleRegular}>{part}</Text>
    ) : (
      <Text key={i} style={styles.titleItalic}>{part}</Text>
    ),
  );
}

// ─────────── Dot indicator (driven by scroll position) ───────────

function Dot({ index, scrollX }: { index: number; scrollX: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const input = [
      (index - 1) * SCREEN_WIDTH,
      index * SCREEN_WIDTH,
      (index + 1) * SCREEN_WIDTH,
    ];
    const w = interpolate(scrollX.value, input, [4, 18, 4], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, input, [0.3, 1, 0.3], Extrapolation.CLAMP);
    return {
      width: w,
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        {
          height: 4,
          borderRadius: 999,
          backgroundColor: designTokens.colors.olive,
        },
        style,
      ]}
    />
  );
}

// ─────────── styles ───────────

const EASE_OUT = Easing.bezier(...easing.outStrong);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: '94%',
    paddingBottom: 18,
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
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontFamily: designTokens.font.semibold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: designTokens.colors.olive,
  },
  title: {
    fontSize: 28,
    letterSpacing: -0.4,
    marginTop: 6,
    lineHeight: 32,
  },
  // Inner spans inside the title — applied per word via renderTitleWithEmphasis.
  // Only the *single* word wrapped in *asterisks* gets the italic style.
  titleRegular: {
    fontFamily: designTokens.font.medium,
    fontSize: 28,
    letterSpacing: -0.4,
    lineHeight: 32,
  },
  titleItalic: {
    fontFamily: designTokens.font.serifItalic,
    fontSize: 28,
    letterSpacing: -0.4,
    lineHeight: 32,
  },
  subtitle: {
    fontFamily: designTokens.font.regular,
    fontSize: 13.5,
    color: designTokens.colors.ink2,
    marginTop: 6,
    lineHeight: 19,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: designTokens.colors.hair,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    backgroundColor: '#fff',
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  dotsRowOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swipeHint: {
    fontFamily: designTokens.font.medium,
    fontSize: 11,
    color: designTokens.colors.ink3,
    letterSpacing: 0.4,
    textTransform: 'lowercase',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: designTokens.colors.hair2,
    backgroundColor: designTokens.colors.cream,
  },
});

// Re-export helper styles so child sheets can use the same pressed feedback
export const pressedStyle = styles.pressed;
export { EASE_OUT };
