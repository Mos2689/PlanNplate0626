import {
  applyAdOutcome,
  EMPTY_PROGRESS,
  isUnlockActive,
  unlockUntilFrom,
  MAX_ADS_PER_UNLOCK,
  canStartUnlock,
  nextUnlockUntil,
  leadWithSubscription,
  shouldShowExpiryBanner,
  shouldShowSuccessPrompt,
  gateRoute,
  shouldOfferAfterPaywallClose,
  type AdPromptState,
} from '@/lib/ad-unlock-logic';

describe('applyAdOutcome', () => {
  it('unlocks after one 30-second ad', () => {
    const d = applyAdOutcome(EMPTY_PROGRESS, { kind: 'earned', watchedSeconds: 30 });
    expect(d.status).toBe('unlock');
  });

  it('accepts a reward reported a beat before 30 seconds', () => {
    const d = applyAdOutcome(EMPTY_PROGRESS, { kind: 'earned', watchedSeconds: 29.4 });
    expect(d.status).toBe('unlock');
  });

  it('asks for another ad after a 15-second ad, then unlocks after the second', () => {
    const first = applyAdOutcome(EMPTY_PROGRESS, { kind: 'earned', watchedSeconds: 15 });
    expect(first.status).toBe('need-more');
    if (first.status !== 'need-more') return;
    expect(first.remainingSeconds).toBe(15);

    const second = applyAdOutcome(first.progress, { kind: 'earned', watchedSeconds: 16 });
    expect(second.status).toBe('unlock');
  });

  it('counts nothing for an ad closed early', () => {
    const d = applyAdOutcome(EMPTY_PROGRESS, { kind: 'closed-early' });
    expect(d.status).toBe('need-more');
    expect(d.progress.watchedSeconds).toBe(0);
    expect(d.progress.adsCompleted).toBe(0);
  });

  it('reports unavailable when the very first ad cannot load', () => {
    expect(applyAdOutcome(EMPTY_PROGRESS, { kind: 'no-fill' }).status).toBe('unavailable');
    expect(applyAdOutcome(EMPTY_PROGRESS, { kind: 'error' }).status).toBe('unavailable');
  });

  it('unlocks when the next ad has no fill after one was completed', () => {
    const first = applyAdOutcome(EMPTY_PROGRESS, { kind: 'earned', watchedSeconds: 10 });
    const second = applyAdOutcome(first.progress, { kind: 'no-fill' });
    expect(second.status).toBe('unlock');
  });

  it(`stops asking after ${MAX_ADS_PER_UNLOCK} ads if at least one completed`, () => {
    let p = applyAdOutcome(EMPTY_PROGRESS, { kind: 'earned', watchedSeconds: 6 }).progress;
    p = applyAdOutcome(p, { kind: 'earned', watchedSeconds: 6 }).progress;
    const third = applyAdOutcome(p, { kind: 'earned', watchedSeconds: 6 });
    expect(third.status).toBe('unlock');
  });

  it('keeps asking after repeated early closes with nothing completed', () => {
    let d = applyAdOutcome(EMPTY_PROGRESS, { kind: 'closed-early' });
    d = applyAdOutcome(d.progress, { kind: 'closed-early' });
    d = applyAdOutcome(d.progress, { kind: 'closed-early' });
    expect(d.status).toBe('need-more');
  });
});

describe('unlock window', () => {
  const now = Date.UTC(2026, 9, 5, 9, 0, 0);

  it('lasts exactly 7 days', () => {
    expect(unlockUntilFrom(now) - now).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('is active before the end and inactive at or after it', () => {
    const until = unlockUntilFrom(now);
    expect(isUnlockActive(until, now)).toBe(true);
    expect(isUnlockActive(until, until - 1)).toBe(true);
    expect(isUnlockActive(until, until)).toBe(false);
    expect(isUnlockActive(null, now)).toBe(false);
  });
});


const H = 60 * 60 * 1000;
const D = 24 * H;
const base: AdPromptState = {
  unlockedUntil: null,
  unlockCount: 0,
  lastProactiveAt: null,
  snoozeUntil: null,
  bannerDismissedFor: null,
  successShownFor: null,
};

describe('renewal window', () => {
  const now = Date.UTC(2026, 9, 13, 9);
  it('allows starting with no week, and in the last 48 h only', () => {
    expect(canStartUnlock(null, now)).toBe(true);
    expect(canStartUnlock(now + 3 * D, now)).toBe(false);
    expect(canStartUnlock(now + 47 * H, now)).toBe(true);
    expect(canStartUnlock(now - H, now)).toBe(true);
  });
  it('extends from the current end while running, else from now', () => {
    expect(nextUnlockUntil(now + D, now)).toBe(now + 8 * D);
    expect(nextUnlockUntil(now - D, now)).toBe(now + 7 * D);
    expect(nextUnlockUntil(null, now)).toBe(now + 7 * D);
  });
  it('leads with the subscription from the 3rd unlock', () => {
    expect(leadWithSubscription(2)).toBe(false);
    expect(leadWithSubscription(3)).toBe(true);
  });
});

describe('prompts', () => {
  const now = Date.UTC(2026, 9, 13, 9);
  it('shows the expiry banner only in the final 24 h, once per week', () => {
    const s = { ...base, unlockCount: 1, unlockedUntil: now + 10 * H };
    expect(shouldShowExpiryBanner(s, now)).toBe(true);
    expect(shouldShowExpiryBanner({ ...s, unlockedUntil: now + 30 * H }, now)).toBe(false);
    expect(shouldShowExpiryBanner({ ...s, bannerDismissedFor: s.unlockedUntil }, now)).toBe(false);
    expect(shouldShowExpiryBanner({ ...s, unlockedUntil: now - H }, now)).toBe(false);
  });
  it('shows the success prompt in the last 2 days, once per week, inside the caps', () => {
    const s = { ...base, unlockCount: 1, unlockedUntil: now + 40 * H };
    expect(shouldShowSuccessPrompt(s, now)).toBe(true);
    expect(shouldShowSuccessPrompt({ ...s, unlockedUntil: now + 3 * D }, now)).toBe(false);
    expect(shouldShowSuccessPrompt({ ...s, successShownFor: s.unlockedUntil }, now)).toBe(false);
    expect(shouldShowSuccessPrompt({ ...s, snoozeUntil: now + D }, now)).toBe(false);
    expect(shouldShowSuccessPrompt({ ...s, lastProactiveAt: now - 2 * H }, now)).toBe(false);
  });
  it('routes gated taps to the renewal sheet only after an ended week', () => {
    expect(gateRoute(base, now, true)).toBe('paywall');
    expect(gateRoute({ ...base, unlockCount: 1, unlockedUntil: now - H }, now, true)).toBe('renewal');
    expect(gateRoute({ ...base, unlockCount: 1, unlockedUntil: now - H }, now, false)).toBe('paywall');
    expect(gateRoute({ ...base, unlockCount: 1, unlockedUntil: now + H }, now, true)).toBe('paywall');
  });
  it('offers the free week after paywall close unless one is running', () => {
    expect(shouldOfferAfterPaywallClose(base, now, true)).toBe(true);
    expect(shouldOfferAfterPaywallClose({ ...base, unlockedUntil: now + D }, now, true)).toBe(false);
    expect(shouldOfferAfterPaywallClose(base, now, false)).toBe(false);
  });
});
