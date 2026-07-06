// Platform parity tokens.
//
// iOS is the design source of truth — every value we ship on Android is a
// compensation for platform-default text metrics (Roboto vs San Francisco),
// Android's stronger `elevation` shadow vs iOS's soft `shadowRadius`, and
// paddings picked for the iOS home-indicator geometry.
//
// Two ways to consume this file:
//   1. `t(iosValue, androidValue)` — inline replacement for the
//      `Platform.OS === 'android' ? A : B` ternaries scattered across the app.
//   2. `androidTokens.*` — named buckets for shared overrides (tab bar,
//      elevation, week-strip pill) so callers don't repeat numeric literals.
//
// Everything here is additive on Android; iOS reads the exact same numbers it
// did before this file existed.
import { Platform } from 'react-native';

export function t<T>(ios: T, android: T): T {
  return Platform.OS === 'android' ? android : ios;
}

export const androidTokens = {
  // Tab bar. The app is edge-to-edge on Android (app.json edgeToEdgeEnabled),
  // so content draws BEHIND the system nav bar. A fixed paddingBottom can't
  // clear every device's nav style (gesture pill / 3-button / OEM panel), so
  // the layout adds the live `useSafeAreaInsets().bottom` on top of these
  // base values. `contentHeight` is the bar height EXCLUDING that inset;
  // `paddingBottomBase` is breathing room added ABOVE the inset.
  tabBar: {
    contentHeight: 60,
    paddingTop: 8,
    paddingBottomBase: 8,
  },

  // Android's `elevation: N` renders far heavier than the soft iOS
  // shadowRadius: 16 / shadowOpacity: 0.04 we ship. Reduce elevation so
  // cards match the iOS visual weight; the 1px hairline border already
  // provides edge definition.
  elevation: {
    card: 0,
    thumb: 1,
  },

  // WeekStrip day-pill compensation. The JUL / T / date stack renders
  // ~2pt taller on Android because Geist's Android metrics have a
  // deeper descender than on iOS. Trim the vertical padding + shave
  // 0.5pt from each label so the selected pill matches the iOS proportion.
  weekStrip: {
    dayPaddingTop: 6,
    dayPaddingBottom: 8,
    monthFontSize: 9,
    dayLetterFontSize: 10.5,
    dateFontSize: 16.5,
    legendFontSize: 10.5,
  },
} as const;
