// vibe-theme.ts — per-vibe color treatment + step-text helpers used by
// the Vibe Cooking experience (mobile/src/app/vibe-cooking.tsx).
//
// Design intent: HYBRID intensity. The brand palette (olive / sage /
// cream / ink) stays the body default everywhere in the app. Each
// vibe contributes a small theme overlay that lights up the hero
// (gradient + ribbon), the primary CTA, the active-step highlight,
// and the ingredient-checked accent. Body backgrounds remain
// brand-neutral so 8 different vibes don't feel like 8 different
// apps. Think film color grade, not skin change.
//
// All colors are explicit hex strings — no token indirection — so
// the file is a true "palette truth" doc that designers can read
// and tune without spelunking the design-tokens registry.

import type { VibeId } from './vibe-inference';

export interface VibeTheme {
  /** Eyebrow color (chip behind the vibe emoji + name on the hero ribbon). */
  ribbon: string;
  /** Hero gradient color, top → bottom. The top color holds status-bar legibility. */
  heroOverlayFrom: string;
  /** Hero gradient bottom — fades into the title strip below. */
  heroOverlayTo: string;
  /** Primary CTA fill + check-fill on Ingredients tab + active-step number. */
  accent: string;
  /** Softer wash — used for cards/pills tinted with the vibe (e.g. timer pill bg). */
  accentSoft: string;
  /** CTA shadow color (matches accent family but darker / more saturated). */
  ctaShadow: string;
  /** Cream/white used on top of the accent (CTA label, check glyph). */
  onAccent: string;
  /** Status-bar style to use over the hero. 'light' for dark vibes. */
  statusBarStyle: 'light' | 'dark';
}

// ── Theme map ───────────────────────────────────────────────────────────────
// Tuned warmly toward each vibe's emotional cue. Keep the alpha levels
// moderate — the body underneath is brand-cream/ink and shouldn't be
// totally swamped. Hero gradients run TOP (more opaque) → BOTTOM
// (transparent) so the food photo behind reads clearly toward the
// bottom edge while the eyebrow text up top remains legible.

export const VIBE_THEMES: Record<VibeId, VibeTheme> = {
  comfort: {
    // Warm amber — slow stews, brown butter
    ribbon: '#7A4A1F',
    heroOverlayFrom: 'rgba(38, 22, 8, 0.78)',
    heroOverlayTo: 'rgba(38, 22, 8, 0.02)',
    accent: '#A56A2D',
    accentSoft: 'rgba(165, 106, 45, 0.12)',
    ctaShadow: '#5A3713',
    onAccent: '#FBF6EC',
    statusBarStyle: 'light',
  },
  tired: {
    // Muted slate + sand — energy-saver palette
    ribbon: '#4A5560',
    heroOverlayFrom: 'rgba(22, 28, 35, 0.74)',
    heroOverlayTo: 'rgba(22, 28, 35, 0.02)',
    accent: '#6B7280',
    accentSoft: 'rgba(107, 114, 128, 0.12)',
    ctaShadow: '#363D46',
    onAccent: '#F6F2E9',
    statusBarStyle: 'light',
  },
  showoff: {
    // Deep olive + gold — restaurant plating
    ribbon: '#3D4A28',
    heroOverlayFrom: 'rgba(14, 20, 8, 0.82)',
    heroOverlayTo: 'rgba(14, 20, 8, 0.04)',
    accent: '#8B7732', // muted gold
    accentSoft: 'rgba(139, 119, 50, 0.14)',
    ctaShadow: '#5A4D1F',
    onAccent: '#F6F2E9',
    statusBarStyle: 'light',
  },
  glow: {
    // Lime + coral — bright, photogenic
    ribbon: '#5A6E1A',
    heroOverlayFrom: 'rgba(20, 32, 8, 0.62)',
    heroOverlayTo: 'rgba(20, 32, 8, 0.02)',
    accent: '#7A9B2E',
    accentSoft: 'rgba(122, 155, 46, 0.14)',
    ctaShadow: '#4D6517',
    onAccent: '#F6F2E9',
    statusBarStyle: 'light',
  },
  date: {
    // Moody navy + candlelight gold — intimate
    ribbon: '#2C3550',
    heroOverlayFrom: 'rgba(10, 12, 22, 0.84)',
    heroOverlayTo: 'rgba(10, 12, 22, 0.06)',
    accent: '#C39B4E', // warm candlelight
    accentSoft: 'rgba(195, 155, 78, 0.16)',
    ctaShadow: '#7A5E26',
    onAccent: '#F6F2E9',
    statusBarStyle: 'light',
  },
  reboot: {
    // Mint + sage — clean reset
    ribbon: '#4B6A52',
    heroOverlayFrom: 'rgba(18, 32, 22, 0.70)',
    heroOverlayTo: 'rgba(18, 32, 22, 0.02)',
    accent: '#5C8264',
    accentSoft: 'rgba(92, 130, 100, 0.14)',
    ctaShadow: '#37503D',
    onAccent: '#F6F2E9',
    statusBarStyle: 'light',
  },
  hangover: {
    // Dawn grey-blue + soft peach — soothing
    ribbon: '#566B7A',
    heroOverlayFrom: 'rgba(22, 30, 38, 0.68)',
    heroOverlayTo: 'rgba(22, 30, 38, 0.02)',
    accent: '#8C9CA8',
    accentSoft: 'rgba(140, 156, 168, 0.12)',
    ctaShadow: '#4A5965',
    onAccent: '#F6F2E9',
    statusBarStyle: 'light',
  },
  adventurous: {
    // Spice-orange + ink — exploration
    ribbon: '#7E3A14',
    heroOverlayFrom: 'rgba(30, 12, 4, 0.78)',
    heroOverlayTo: 'rgba(30, 12, 4, 0.04)',
    accent: '#B85E2C',
    accentSoft: 'rgba(184, 94, 44, 0.14)',
    ctaShadow: '#7A3D17',
    onAccent: '#F6F2E9',
    statusBarStyle: 'light',
  },
};

/** Lookup a vibe theme by id. Falls back to `comfort` if the id is
 *  unknown — safer than throwing inside a render. */
export function getVibeTheme(id: VibeId | string | null | undefined): VibeTheme {
  if (!id) return VIBE_THEMES.comfort;
  return VIBE_THEMES[id as VibeId] ?? VIBE_THEMES.comfort;
}

// ───────────────────────────────────────────────────────────────────────────
// Step-text timer detection.
// ───────────────────────────────────────────────────────────────────────────
//
// Pure helper. Scans a single step's text for an inline duration and
// returns the duration in MINUTES (fractional for sub-minute matches).
// Used by CookStepCard to render a tap-to-start timer pill.
//
// Matching order:
//   1. Minutes form:  "12 min", "12 minutes", "12-15 min" → first number
//   2. Seconds form:  "30 sec", "30 seconds"               → seconds/60
//   3. Hour form:     "1 hour", "1 hr"                     → hours*60
//
// Returns null when no usable duration is present.
const MIN_RE = /(\d+(?:\.\d+)?)(?:\s*[-–to]+\s*\d+(?:\.\d+)?)?\s*(?:minutes?|mins?|m)\b/i;
const SEC_RE = /(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b/i;
const HR_RE = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i;

export function detectTimerMinutes(stepText: string): number | null {
  if (!stepText) return null;
  // Hour first — "1 hour 15 minutes" should bind to hours-then-minutes
  // but the simpler heuristic is fine for v1: pick the largest scale
  // available and ignore the rest. Most recipe steps state one duration.
  const hr = stepText.match(HR_RE);
  if (hr) {
    const n = Number(hr[1]);
    if (Number.isFinite(n) && n > 0) return n * 60;
  }
  const min = stepText.match(MIN_RE);
  if (min) {
    const n = Number(min[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const sec = stepText.match(SEC_RE);
  if (sec) {
    const n = Number(sec[1]);
    if (Number.isFinite(n) && n > 0) return n / 60;
  }
  return null;
}

/** Format a minutes count for display on a timer pill: "12 min", "1h 30m", "45 sec". */
export function formatTimerLabel(minutes: number): string {
  if (minutes <= 0) return '0 min';
  if (minutes < 1) {
    const secs = Math.round(minutes * 60);
    return `${secs} sec`;
  }
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes - h * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${Math.round(minutes)} min`;
}

/** Countdown-friendly mm:ss formatter for the live timer chip at the top of the page. */
export function formatCountdown(secondsRemaining: number): string {
  const s = Math.max(0, Math.ceil(secondsRemaining));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}
