// Pure rules for the rewarded-ad Premium unlock. No React, no native SDK, so
// every rule here is unit tested (src/lib/__tests__/ad-unlock-logic.test.ts).
//
// The unlock needs ~30 seconds of watched rewarded video in total. Advertisers
// pick the ad length (often 15–30 s) and the SDK doesn't report it, so watched
// time is measured by the app and accumulated across up to MAX_ADS ads.

export const REQUIRED_WATCH_SECONDS = 30;
export const MAX_ADS_PER_UNLOCK = 3;
export const AD_UNLOCK_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The SDK can report EARNED_REWARD a beat before the video truly ends. */
const WATCH_TOLERANCE_SECONDS = 1;

export function unlockUntilFrom(now: number): number {
  return now + AD_UNLOCK_DAYS * DAY_MS;
}

export function isUnlockActive(unlockedUntil: number | null, now: number): boolean {
  return unlockedUntil !== null && unlockedUntil > now;
}

export type AdOutcome =
  | { kind: 'earned'; watchedSeconds: number }
  | { kind: 'closed-early' }
  | { kind: 'no-fill' }
  | { kind: 'error' };

export interface UnlockProgress {
  watchedSeconds: number;
  adsCompleted: number;
  adsAttempted: number;
}

export const EMPTY_PROGRESS: UnlockProgress = {
  watchedSeconds: 0,
  adsCompleted: 0,
  adsAttempted: 0,
};

export type UnlockDecision =
  | { status: 'unlock'; progress: UnlockProgress }
  | { status: 'need-more'; progress: UnlockProgress; remainingSeconds: number }
  | { status: 'unavailable'; progress: UnlockProgress };

/**
 * Fold one ad's outcome into the running progress and decide what happens next.
 *
 * - An ad closed before its reward counts for nothing.
 * - Once ~30 s is watched, unlock.
 * - If Google has no ad to serve after the user already finished at least one,
 *   unlock anyway — the user did their part.
 * - After MAX_ADS attempts with at least one completed ad, unlock rather than
 *   keep asking (protects against a run of very short ads).
 * - If the very first ad can't load, report unavailable.
 */
export function applyAdOutcome(progress: UnlockProgress, outcome: AdOutcome): UnlockDecision {
  const next: UnlockProgress = {
    ...progress,
    adsAttempted: progress.adsAttempted + 1,
  };

  if (outcome.kind === 'earned') {
    next.watchedSeconds = progress.watchedSeconds + Math.max(0, outcome.watchedSeconds);
    next.adsCompleted = progress.adsCompleted + 1;
  }

  const enough = next.watchedSeconds + WATCH_TOLERANCE_SECONDS >= REQUIRED_WATCH_SECONDS;
  if (enough) return { status: 'unlock', progress: next };

  if (outcome.kind === 'no-fill' || outcome.kind === 'error') {
    return next.adsCompleted > 0
      ? { status: 'unlock', progress: next }
      : { status: 'unavailable', progress: next };
  }

  if (next.adsAttempted >= MAX_ADS_PER_UNLOCK && next.adsCompleted > 0) {
    return { status: 'unlock', progress: next };
  }

  return {
    status: 'need-more',
    progress: next,
    remainingSeconds: Math.max(1, Math.ceil(REQUIRED_WATCH_SECONDS - next.watchedSeconds)),
  };
}

// ───────────────────────────────────────────────────────────────────────────────
// RENEWAL + PROMPT RULES
// ───────────────────────────────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;

/** A new week can be started once fewer than this many ms remain (no stacking beyond it). */
export const RENEW_WINDOW_MS = 48 * HOUR_MS;
/** The "ends tomorrow" banner appears in the final 24 hours. */
export const EXPIRY_BANNER_MS = 24 * HOUR_MS;
/** After this many ad unlocks, renewal sheets lead with the subscription. */
export const LEAD_WITH_SUBSCRIPTION_AFTER = 3;
/** Quiet period after a proactive prompt is turned down. */
export const PROACTIVE_SNOOZE_MS = 3 * DAY_MS;
/** At most one proactive prompt per this interval. */
export const PROACTIVE_MIN_GAP_MS = DAY_MS;

export interface AdPromptState {
  unlockedUntil: number | null;
  unlockCount: number;
  lastProactiveAt: number | null;
  snoozeUntil: number | null;
  bannerDismissedFor: number | null;
  successShownFor: number | null;
}

/** Whether a (new or extending) week may start now. */
export function canStartUnlock(unlockedUntil: number | null, now: number): boolean {
  return unlockedUntil === null || unlockedUntil - now <= RENEW_WINDOW_MS;
}

/** End of the next week: extends from the current end if still running, else from now. */
export function nextUnlockUntil(unlockedUntil: number | null, now: number): number {
  const base = unlockedUntil !== null && unlockedUntil > now ? unlockedUntil : now;
  return base + AD_UNLOCK_DAYS * DAY_MS;
}

export function leadWithSubscription(unlockCount: number): boolean {
  return unlockCount >= LEAD_WITH_SUBSCRIPTION_AFTER;
}

/** A free week was used before and has now ended. */
export function hasExpiredUnlock(s: AdPromptState, now: number): boolean {
  return s.unlockCount > 0 && s.unlockedUntil !== null && s.unlockedUntil <= now;
}

function proactiveAllowed(s: AdPromptState, now: number): boolean {
  if (s.snoozeUntil !== null && now < s.snoozeUntil) return false;
  if (s.lastProactiveAt !== null && now - s.lastProactiveAt < PROACTIVE_MIN_GAP_MS) return false;
  return true;
}

/** (B) "Your free week ends tomorrow" banner — final 24 h, once per week. */
export function shouldShowExpiryBanner(s: AdPromptState, now: number): boolean {
  if (!isUnlockActive(s.unlockedUntil, now) || s.unlockedUntil === null) return false;
  if (s.unlockedUntil - now > EXPIRY_BANNER_MS) return false;
  if (s.bannerDismissedFor === s.unlockedUntil) return false;
  return s.snoozeUntil === null || now >= s.snoozeUntil;
}

/** (C) After a success, in the last 2 days of a week — once per week, inside the caps. */
export function shouldShowSuccessPrompt(s: AdPromptState, now: number): boolean {
  if (!isUnlockActive(s.unlockedUntil, now) || s.unlockedUntil === null) return false;
  if (s.unlockedUntil - now > RENEW_WINDOW_MS) return false;
  if (s.successShownFor === s.unlockedUntil) return false;
  return proactiveAllowed(s, now);
}

/** (A) Where a premium-gated tap should go for a non-subscriber. */
export function gateRoute(s: AdPromptState, now: number, adsAvailable: boolean): 'renewal' | 'paywall' {
  return adsAvailable && hasExpiredUnlock(s, now) ? 'renewal' : 'paywall';
}

/** Offer the free week after the paywall is closed (not while a week is running). */
export function shouldOfferAfterPaywallClose(s: AdPromptState, now: number, adsAvailable: boolean): boolean {
  return adsAvailable && !isUnlockActive(s.unlockedUntil, now);
}
