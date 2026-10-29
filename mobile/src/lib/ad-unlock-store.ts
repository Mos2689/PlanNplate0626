// Rewarded-ad Premium unlock — the 7-day week, its history, the prompt caps,
// and which ad sheet (if any) is on screen.
//
// Persisted to AsyncStorage keyed by user id so access is instant and works
// offline. The server (user_preferences.ad_unlock_until / ad_unlock_count,
// migrations 20261005120000 + 20261013120000) is the source of truth when
// reachable: it decides the week end with its own clock and only lets a new
// week start in the last 48 hours of the current one.
//
// Rules (which prompt shows when) live in ad-unlock-logic.ts.

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase, isSupabaseConfigured } from './supabase';
import {
  canStartUnlock,
  isUnlockActive,
  nextUnlockUntil,
  shouldShowSuccessPrompt,
  PROACTIVE_SNOOZE_MS,
  EMPTY_PROGRESS,
  type AdPromptState,
  type UnlockProgress,
} from './ad-unlock-logic';

const keyFor = (userId: string) => `ad_unlock_v1_${userId}`;

/**
 * Which ad sheet is open:
 *   intro          — after the paywall is closed ("Not ready to subscribe?")
 *   renewal        — (A/D) a gated tap or the Profile card after a week ended
 *   extend         — (B) from the "ends tomorrow" banner
 *   success-plan   — (C) after a meal plan finishes, last 2 days of a week
 *   success-shop   — (C) after finishing a shop, last 2 days of a week
 *   confirm        — "You're all set!" after a successful unlock
 */
export type AdSheetMode =
  | 'intro'
  | 'renewal'
  | 'extend'
  | 'success-plan'
  | 'success-shop'
  | 'confirm';

interface AdUnlockStore extends AdPromptState {
  userId: string | null;
  sheet: AdSheetMode | null;
  /** In-memory only (not persisted): survives sheet close/reopen within a
   *  session but resets on app restart or logout. */
  sessionProgress: UnlockProgress;
  hydrate: (userId: string) => Promise<void>;
  reset: () => void;
  /** Start (or extend) a week. Returns the new end, or null if not allowed yet. */
  grant: () => Promise<number | null>;
  openSheet: (mode: AdSheetMode) => void;
  closeSheet: () => void;
  setSessionProgress: (p: UnlockProgress) => void;
  clearSessionProgress: () => void;
  /** Turned down a proactive prompt (B/C): quiet for 3 days. */
  snoozeProactive: () => void;
  dismissExpiryBanner: () => void;
  /** (C) Show the success prompt if the rules allow it. */
  maybePromptSuccess: (kind: 'success-plan' | 'success-shop') => void;
}

const EMPTY: AdPromptState = {
  unlockedUntil: null,
  unlockCount: 0,
  lastProactiveAt: null,
  snoozeUntil: null,
  bannerDismissedFor: null,
  successShownFor: null,
};

function parseServerTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function parseServerState(data: unknown): { until: number | null; count: number | null } {
  const row = (typeof data === 'string' ? safeJson(data) : data) as
    | { until?: unknown; count?: unknown }
    | null;
  if (!row || typeof row !== 'object') return { until: null, count: null };
  return {
    until: parseServerTime(row.until),
    count: typeof row.count === 'number' ? row.count : null,
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export const useAdUnlockStore = create<AdUnlockStore>()((set, get) => {
  const persist = () => {
    const s = get();
    if (!s.userId) return;
    const data: AdPromptState = {
      unlockedUntil: s.unlockedUntil,
      unlockCount: s.unlockCount,
      lastProactiveAt: s.lastProactiveAt,
      snoozeUntil: s.snoozeUntil,
      bannerDismissedFor: s.bannerDismissedFor,
      successShownFor: s.successShownFor,
    };
    AsyncStorage.setItem(keyFor(s.userId), JSON.stringify(data)).catch(() => {});
  };

  return {
    ...EMPTY,
    userId: null,
    sheet: null,
    sessionProgress: EMPTY_PROGRESS,

    hydrate: async (userId: string) => {
      if (get().userId !== userId) set({ ...EMPTY, userId, sheet: null });
      try {
        const raw = await AsyncStorage.getItem(keyFor(userId));
        if (raw && get().userId === userId) {
          set({ ...EMPTY, ...(JSON.parse(raw) as Partial<AdPromptState>) });
        }
      } catch {
        // Unreadable local copy — the server read below can still restore it.
      }

      if (!isSupabaseConfigured()) return;
      const { data, error } = await supabase.rpc('get_ad_unlock');
      if (error || get().userId !== userId) return;
      // Server wins when it has a value; with none, keep a week granted offline.
      const server = parseServerState(data);
      const patch: Partial<AdPromptState> = {};
      if (server.until !== null) patch.unlockedUntil = server.until;
      if (server.count !== null) patch.unlockCount = Math.max(server.count, get().unlockCount);
      if (Object.keys(patch).length === 0) return;
      set(patch);
      persist();
    },

    reset: () => set({ ...EMPTY, userId: null, sheet: null, sessionProgress: EMPTY_PROGRESS }),

    grant: async () => {
      const now = Date.now();
      if (!canStartUnlock(get().unlockedUntil, now)) return null;

      let until: number | null = null;
      let count: number | null = null;
      if (isSupabaseConfigured() && get().userId) {
        const { data, error } = await supabase.rpc('grant_ad_unlock');
        if (!error) {
          const server = parseServerState(data);
          until = server.until;
          count = server.count;
        }
      }
      // Offline or the server isn't migrated yet: grant locally so the user
      // still gets what they watched for. The next hydrate reconciles.
      until = until ?? nextUnlockUntil(get().unlockedUntil, now);
      count = count ?? get().unlockCount + 1;

      set({ unlockedUntil: until, unlockCount: count });
      persist();
      return until;
    },

    openSheet: (mode) => set({ sheet: mode }),
    closeSheet: () => set({ sheet: null }),
    setSessionProgress: (p) => set({ sessionProgress: p }),
    clearSessionProgress: () => set({ sessionProgress: EMPTY_PROGRESS }),

    snoozeProactive: () => {
      set({ snoozeUntil: Date.now() + PROACTIVE_SNOOZE_MS });
      persist();
    },

    dismissExpiryBanner: () => {
      set({ bannerDismissedFor: get().unlockedUntil });
      persist();
    },

    maybePromptSuccess: (kind) => {
      const s = get();
      if (s.sheet !== null) return;
      if (!shouldShowSuccessPrompt(s, Date.now())) return;
      set({ sheet: kind, successShownFor: s.unlockedUntil, lastProactiveAt: Date.now() });
      persist();
    },
  };
});

/**
 * True while a rewarded-ad week is open. Re-renders by itself the moment the
 * week ends, so gated screens lock again without a restart.
 */
export function useAdUnlockActive(): boolean {
  const unlockedUntil = useAdUnlockStore((s) => s.unlockedUntil);
  useRerenderAt(unlockedUntil);
  return isUnlockActive(unlockedUntil, Date.now());
}

/** Re-render once when `at` (epoch ms) is reached. */
export function useRerenderAt(at: number | null): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (at === null) return;
    const remaining = at - Date.now();
    if (remaining <= 0) return;
    const t = setTimeout(() => setTick((n) => n + 1), Math.min(remaining + 50, 2_147_000_000));
    return () => clearTimeout(t);
  }, [at]);
}
