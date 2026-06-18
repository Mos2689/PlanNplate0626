// PlannPlate Design Tokens
// Based on Home screen design specifications

export const designTokens = {
  // Core palette
  colors: {
    bg: '#FFFFFF',           // primary background
    ink: '#15140F',         // primary text — warm near-black
    ink2: '#5B5950',        // secondary text
    ink3: '#9A968B',        // tertiary text
    hair: '#ECEAE2',        // hairline border
    hair2: '#F4F2EB',       // soft divider
    brand: '#546445',       // sage-600 — primary brand color
    brandDeep: '#3F4D33',   // darker brand
    olive: '#E46D46',       // terracotta-500 — accent / cooked indicator
    oliveDeep: '#AB4922',   // darker terracotta for shadows
    charcoal: '#181612',    // nudge card background
    cream: '#FAF7F0',       // tag / pill background (used very sparingly)
    skipped: '#C9C5BB',     // skipped status dot
    emptyBorder: '#D8D4C9', // empty status outline
  },

  // Typography
  font: {
    regular: 'Geist_400Regular',
    medium: 'Geist_500Medium',
    semibold: 'Geist_600SemiBold',
    serifItalic: 'InstrumentSerif_400Regular_Italic',
  },

  // Spacing
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },

  // Border radius
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 20,
    full: 9999,
  },

  // Shadows (minimal for iOS feel)
  shadows: {
    subtle: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
  },

  // Status colors for meal slots
  mealStatus: {
    cooked: '#E46D46',      // terracotta - completed
    planned: '#546445',    // sage - scheduled
    skipped: '#C9C5BB',    // muted gray
    empty: 'transparent',   // no fill, just border
    today: '#546445',      // sage - current day highlight
  },
};

// House easing curves (Emil Kowalski's stronger variants).
// These are the cubic-bezier control points; for Reanimated use Easing.bezier(...easing.outStrong).
export const easing = {
  outStrong: [0.23, 1, 0.32, 1] as const,       // ease-out for entries / responsive feedback
  inOutStrong: [0.77, 0, 0.175, 1] as const,    // ease-in-out for on-screen movement
  drawer: [0.32, 0.72, 0, 1] as const,          // iOS-like drawer curve
};

// Card elevation presets — subtle, warm, hardware-accelerated.
export const elevation = {
  card: {
    shadowColor: '#15140F',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  thumb: {
    shadowColor: '#15140F',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
} as const;

// Helper to get dynamic colors based on theme
export function getThemeColors(isDark: boolean) {
  if (isDark) {
    return {
      bg: '#1a1a1a',
      ink: '#FFFFFF',
      ink2: '#A0A0A0',
      ink3: '#666666',
      // Dropped from #333333 to #2a2a2a so card outlines fade into the
      // background instead of reading as bright warm borders. Matches the
      // curated-plan screen's hand-tuned `#2a2a2a` value, which is the
      // visual target for the rest of the app.
      hair: '#2a2a2a',
      hair2: '#242424',
      brand: '#6B7A57',
      surface: '#242424',
      // `surfaceMuted` is the dark-mode counterpart to cream-toned chip /
      // banner backgrounds (e.g. "X similar ingredients found", DNA chips,
      // "Adjust" pill). Keeping these cream in dark mode left white text
      // unreadable; this is a slightly-warmer-than-bg dark tone.
      surfaceMuted: '#2e2c28',
      // Subtle pill background, slightly lighter than surface for the
      // small inline pills like "Adjust", "today ago" so they read as a
      // distinct affordance rather than blending into the card.
      pill: '#333128',
    };
  }
  return {
    bg: '#FFFFFF',
    ink: '#15140F',
    ink2: '#5B5950',
    ink3: '#9A968B',
    hair: '#ECEAE2',
    hair2: '#F4F2EB',
    brand: '#546445',
    surface: '#FFFFFF',
    // In light mode these resolve to the cream / hair2 values used today,
    // so swapping in `colors.surfaceMuted` / `colors.pill` is a no-op for
    // light and a fix for dark.
    surfaceMuted: '#FAF7F0',
    pill: '#F4F2EB',
  };
}

// Theme-aware tints for the grocery category icon tiles. In light mode the
// existing pale beige/cream variants work; in dark mode they wash out and
// the icon disappears into the tile, so we return darker, faintly-tinted
// surfaces that keep the warm hue cue without bleaching out.
export type CategoryTintKey = 'produce' | 'bakery' | 'meat' | 'dairy' | 'pantry' | 'frozen' | 'other';

export function getCategoryTint(isDark: boolean): Record<CategoryTintKey, string> {
  if (isDark) {
    return {
      produce: '#2c322a',
      bakery: '#332d23',
      meat: '#33272f',
      dairy: '#2f2f29',
      pantry: '#322d23',
      frozen: '#252d33',
      other: '#2a2a2a',
    };
  }
  return {
    produce: '#E8ECDF',
    bakery: '#F4EBDB',
    meat: '#F2E0D9',
    dairy: '#EEEEE3',
    pantry: '#EEE9DC',
    frozen: '#E1E8EE',
    other: '#F4F2EB',
  };
}