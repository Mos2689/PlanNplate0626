// Offer funnel — the timed upsell sequence that runs AFTER the main paywall.
//
//   1. Paywall closed WITHOUT buying (first time only) → one-time annual offer
//      ($29.99 intro on the monthly $6.99 sub). Shown at most ONCE, ever.
//   2. Annual offer closed without buying → wait ~30 days → a 24-hour
//      limited-time $3.99/month offer (a separate product).
//
// A purchase at any step, or the user already being premium, ends the funnel.
// State is persisted to AsyncStorage keyed by user id, so "shown once" survives
// app restarts (but resets on a fresh install / different device — per product
// decision to use on-device storage).

import { create } from 'zustand';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  isRevenueCatEnabled,
  checkIntroEligibility,
  getPackage,
} from './revenuecatClient';
import { useSubscriptionStore } from './subscription-store';

// The monthly $6.99 product that carries the $29.99 "pay up front" intro offer,
// and its RevenueCat package alias in the current offering.
const MONTHLY_INTRO_PRODUCT_ID = 'monthly_sub_599';
const MONTHLY_PACKAGE_ID = '$rc_monthly';

// Whether to present the annual $29.99 intro offer to THIS user.
//   • iOS: StoreKit can report intro eligibility directly — trust it.
//   • Android: eligibility can't be queried (always 'unknown'), and Play
//     enforces it at purchase, so we instead show the offer only when the
//     monthly product actually surfaces an intro/offer price for this user
//     (RevenueCat computes `introPrice` from the eligible default offer).
async function annualOfferAvailable(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    const elig = await checkIntroEligibility(MONTHLY_INTRO_PRODUCT_ID);
    return elig.ok && elig.data === 'eligible';
  }
  const res = await getPackage(MONTHLY_PACKAGE_ID);
  return res.ok && !!(res.data?.product as any)?.introPrice;
}

// Timing — 30 days between the annual dismissal and the 24-hour window.
const MONTHLY_DELAY_MS = 30 * 24 * 60 * 60 * 1000;
const MONTHLY_WINDOW_MS = 24 * 60 * 60 * 1000;

const keyFor = (userId: string) => `offer_funnel_v1_${userId}`;

// TESTING bypass: dev + EXPO_PUBLIC_DEV_FORCE_FREE skips the real StoreKit intro
// eligibility check (the RevenueCat Test Store can't report it) and re-shows the
// annual offer on every paywall close so the flow is exercisable. Production
// always uses the strict once-ever + eligibility path. Remove the .env flag to
// restore production behaviour.
const DEV_OFFER_BYPASS =
  __DEV__ && process.env.EXPO_PUBLIC_DEV_FORCE_FREE === 'true';

type ActiveOffer = 'none' | 'annual' | 'monthly';

interface Persisted {
  // Set the first time the paywall is dismissed without a purchase. Guards the
  // annual offer to a single lifetime attempt.
  firstPaywallCloseAt: number | null;
  annualShown: boolean;
  annualDismissedAt: number | null;
  monthlyShown: boolean;
  // Terminal flag — the 24-hour window was acted on, expired, or superseded by
  // a purchase. Once true the funnel never fires again.
  monthlyDone: boolean;
}

const EMPTY: Persisted = {
  firstPaywallCloseAt: null,
  annualShown: false,
  annualDismissedAt: null,
  monthlyShown: false,
  monthlyDone: false,
};

interface OfferFunnelStore extends Persisted {
  hydrated: boolean;
  userId: string | null;
  activeOffer: ActiveOffer;

  hydrate: (userId: string) => Promise<void>;
  reset: () => void;
  onPaywallDismissed: () => Promise<void>;
  dismissAnnual: () => void;
  dismissMonthly: () => void;
  markConverted: () => void; // any successful purchase → end the funnel
  checkMonthlyWindow: () => void;
  monthlyWindowEnd: () => number | null;
}

const isPremiumNow = () => useSubscriptionStore.getState().isPremium;

export const useOfferFunnelStore = create<OfferFunnelStore>()((set, get) => {
  const persist = () => {
    const { userId, firstPaywallCloseAt, annualShown, annualDismissedAt, monthlyShown, monthlyDone } = get();
    if (!userId) return;
    const data: Persisted = {
      firstPaywallCloseAt,
      annualShown,
      annualDismissedAt,
      monthlyShown,
      monthlyDone,
    };
    AsyncStorage.setItem(keyFor(userId), JSON.stringify(data)).catch(() => {});
  };

  // Base of the 30-day clock: prefer when the annual was dismissed; fall back to
  // the first paywall close (so intro-ineligible users, who never see the annual
  // sheet, still reach the later $3.99 offer).
  const clockBase = (): number | null => {
    const { annualDismissedAt, firstPaywallCloseAt } = get();
    return annualDismissedAt ?? firstPaywallCloseAt;
  };

  return {
    ...EMPTY,
    hydrated: false,
    userId: null,
    activeOffer: 'none',

    hydrate: async (userId: string) => {
      if (get().userId === userId && get().hydrated) return;
      try {
        const raw = await AsyncStorage.getItem(keyFor(userId));
        const parsed: Persisted = raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
        set({ ...parsed, userId, hydrated: true, activeOffer: 'none' });
      } catch {
        set({ ...EMPTY, userId, hydrated: true, activeOffer: 'none' });
      }
      // A user who is already premium (or whose window elapsed while away) is
      // caught up on hydrate.
      get().checkMonthlyWindow();
    },

    reset: () => set({ ...EMPTY, userId: null, hydrated: false, activeOffer: 'none' }),

    // Called from PaywallSheet's dismiss path (NOT after a purchase).
    onPaywallDismissed: async () => {
      const s = get();
      console.log('[OfferFunnel] paywall dismissed', {
        hydrated: s.hydrated, userId: s.userId, premium: isPremiumNow(),
        activeOffer: s.activeOffer, firstClose: s.firstPaywallCloseAt,
        annualShown: s.annualShown, devBypass: DEV_OFFER_BYPASS,
      });
      if (!s.hydrated || !s.userId) { console.log('[OfferFunnel] skipped — not hydrated'); return; }
      if (isPremiumNow()) { console.log('[OfferFunnel] skipped — premium'); return; }
      if (s.activeOffer !== 'none') return;

      // If the 24-hour limited-time window is already live, that offer takes
      // precedence over (re-)showing the annual — so closing the paywall after
      // the delay surfaces the $3.99 sheet instead of the annual again.
      get().checkMonthlyWindow();
      if (get().activeOffer === 'monthly') { console.log('[OfferFunnel] monthly window live — showing $3.99'); return; }

      // TESTING: show the annual offer on every paywall close, ignoring the
      // once-ever + eligibility gates (which can't resolve against the Test
      // Store). Still stamps firstPaywallCloseAt so the 24-hour clock starts.
      if (DEV_OFFER_BYPASS) {
        console.log('[OfferFunnel] DEV bypass — showing annual offer');
        set({ firstPaywallCloseAt: s.firstPaywallCloseAt ?? Date.now(), annualShown: true, activeOffer: 'annual' });
        persist();
        return;
      }

      const isFirstClose = s.firstPaywallCloseAt == null;
      if (!isFirstClose) { console.log('[OfferFunnel] skipped — annual already used'); return; }
      set({ firstPaywallCloseAt: Date.now() });
      persist();

      if (!isRevenueCatEnabled() || s.annualShown) return;

      // Only present the $29.99 intro to users the store will actually honour it
      // for (iOS eligibility check; Android intro-price availability).
      const available = await annualOfferAvailable();
      console.log('[OfferFunnel] annual offer available?', available, Platform.OS);
      if (isPremiumNow() || get().activeOffer !== 'none') return;
      if (available) {
        set({ annualShown: true, activeOffer: 'annual' });
        persist();
      } else {
        console.log('[OfferFunnel] annual skipped — offer not available for this user');
      }
    },

    dismissAnnual: () => {
      set({ annualDismissedAt: Date.now(), activeOffer: 'none' });
      persist();
    },

    dismissMonthly: () => {
      set({ monthlyDone: true, activeOffer: 'none' });
      persist();
    },

    markConverted: () => {
      set({ monthlyDone: true, activeOffer: 'none' });
      persist();
    },

    checkMonthlyWindow: () => {
      const s = get();
      if (!s.hydrated || !s.userId) return;
      if (s.monthlyDone || s.monthlyShown || s.activeOffer !== 'none') return;
      if (isPremiumNow()) {
        set({ monthlyDone: true });
        persist();
        return;
      }
      const base = clockBase();
      if (base == null) return;
      const start = base + MONTHLY_DELAY_MS;
      const end = start + MONTHLY_WINDOW_MS;
      const now = Date.now();
      if (now >= start && now < end) {
        set({ monthlyShown: true, activeOffer: 'monthly' });
        persist();
      } else if (now >= end) {
        set({ monthlyDone: true }); // window missed
        persist();
      }
    },

    monthlyWindowEnd: () => {
      const base = clockBase();
      return base == null ? null : base + MONTHLY_DELAY_MS + MONTHLY_WINDOW_MS;
    },
  };
});
