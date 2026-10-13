// Google AdMob rewarded video — consent, init, load, show, and how long the
// user actually watched.
//
// The native module only exists in a dev-client / store build. In Expo Go, on
// web, or before the native build includes the SDK, `require` throws and the
// whole feature reports itself unavailable instead of crashing.
//
// Development builds ALWAYS use Google's test ad units. Tapping your own live
// ads can get the AdMob account suspended, so the real unit ids are used only
// in release builds.

import { Platform } from 'react-native';
import type { AdOutcome } from './ad-unlock-logic';
import { FEATURE_FLAGS } from './feature-flags';

// AdMob ids are public (they ship inside every build). Env vars override them
// for a different AdMob account; the fallbacks are PlanNplate's own units.
const REWARDED_UNIT_IDS = {
  ios:
    process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS_UNIT_ID ||
    'ca-app-pub-6516185368332110/6655203912',
  android:
    process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID_UNIT_ID ||
    'ca-app-pub-6516185368332110/8898223872',
};

const LOAD_TIMEOUT_MS = 15_000;

type AdsModule = any;
let adsModule: AdsModule | null | undefined;

function getAds(): AdsModule | null {
  if (adsModule !== undefined) return adsModule;
  if (Platform.OS === 'web') {
    adsModule = null;
    return adsModule;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    adsModule = require('react-native-google-mobile-ads');
  } catch {
    adsModule = null;
  }
  return adsModule;
}

/** The ad-unlock feature is switched on and this build can show rewarded ads. */
export function adUnlockAvailable(): boolean {
  return FEATURE_FLAGS.adUnlock && rewardedAdsSupported();
}

/** True when this build can show rewarded ads at all. */
export function rewardedAdsSupported(): boolean {
  return getAds() !== null;
}

function unitId(ads: AdsModule): string {
  if (__DEV__) return ads.TestIds.REWARDED;
  return Platform.OS === 'ios' ? REWARDED_UNIT_IDS.ios : REWARDED_UNIT_IDS.android;
}

let initPromise: Promise<boolean> | null = null;

/**
 * Refresh consent status (shows Google's consent form only where the law
 * requires it, e.g. EEA/UK) and initialise the SDK. Safe to call repeatedly.
 * Resolves false when ads can't be requested (no module, no consent).
 */
export function prepareRewardedAds(): Promise<boolean> {
  if (initPromise) return initPromise;
  const ads = getAds();
  if (!ads) return Promise.resolve(false);

  initPromise = (async () => {
    try {
      await ads.AdsConsent.requestInfoUpdate();
      await ads.AdsConsent.loadAndShowConsentFormIfRequired();
      const info = await ads.AdsConsent.getConsentInfo();
      if (info && info.canRequestAds === false) return false;
    } catch {
      // Consent service unreachable (offline, not configured in AdMob yet).
      // Google's SDK still serves limited/non-personalised ads in that case.
    }
    try {
      await ads.default().initialize();
      return true;
    } catch {
      return false;
    }
  })();

  // A failed attempt shouldn't stick for the whole session.
  initPromise.then((ok) => {
    if (!ok) initPromise = null;
  });
  return initPromise;
}

/**
 * Load and show one rewarded ad. Resolves when the ad is gone with what
 * happened and, if the reward was earned, how many seconds were watched
 * (measured from the ad opening to the reward, which fires at video end).
 */
export async function showRewardedAd(): Promise<AdOutcome> {
  const ads = getAds();
  if (!ads) return { kind: 'error' };

  const ready = await prepareRewardedAds();
  if (!ready) return { kind: 'error' };

  return new Promise<AdOutcome>((resolve) => {
    const ad = ads.RewardedAd.createForAdRequest(unitId(ads));
    const unsubscribers: (() => void)[] = [];
    let loaded = false;
    let openedAt: number | null = null;
    let watchedSeconds: number | null = null;
    let settled = false;

    const finish = (outcome: AdOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(loadTimer);
      unsubscribers.forEach((off) => off());
      resolve(outcome);
    };

    const loadTimer = setTimeout(() => {
      if (!loaded) finish({ kind: 'no-fill' });
    }, LOAD_TIMEOUT_MS);

    unsubscribers.push(
      ad.addAdEventListener(ads.RewardedAdEventType.LOADED, () => {
        loaded = true;
        ad.show().catch(() => finish({ kind: 'error' }));
      }),
      ad.addAdEventListener(ads.AdEventType.OPENED, () => {
        openedAt = Date.now();
      }),
      ad.addAdEventListener(ads.RewardedAdEventType.EARNED_REWARD, () => {
        watchedSeconds = openedAt === null ? 0 : (Date.now() - openedAt) / 1000;
      }),
      ad.addAdEventListener(ads.AdEventType.CLOSED, () => {
        finish(
          watchedSeconds === null
            ? { kind: 'closed-early' }
            : { kind: 'earned', watchedSeconds },
        );
      }),
      ad.addAdEventListener(ads.AdEventType.ERROR, () => {
        finish(loaded ? { kind: 'error' } : { kind: 'no-fill' });
      }),
    );

    ad.load();
  });
}
