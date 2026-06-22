// review-store — drives the in-app "Enjoying PlanNplate?" review prompt.
//
// Persisted (AsyncStorage) so the "already reviewed / don't ask again / last
// shown" flags survive relaunches. `visible` is ephemeral (never persisted).
//
// Call `maybePrompt()` at a POSITIVE moment (e.g. right after the user rates
// a meal highly). It self-gates: it won't show if the user already reviewed,
// asked us not to, or was prompted within the snooze window.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Store listing config ──
//   iOS:     numeric App Store ID. Sourced from eas.json → submit.ios.ascAppId.
//   Android: the published app package name (must match app.json → android.package).
export const APP_STORE_ID = '6757459949'; // from eas.json ascAppId
// Kept equal to the published package (app.json → android.package). If that
// package ever changes, update this string to match so the deep link resolves.
export const ANDROID_PACKAGE = 'ycom.plannplate.app';
// Where 1–3★ feedback is routed (kept off the public store listing).
export const FEEDBACK_EMAIL = 'support@plannplate.app';

// Don't re-ask within this many days of a dismissal / "maybe later".
const SNOOZE_DAYS = 15;

// Session guard — never show the prompt more than once per app session. Module-
// level (not persisted), so it resets when the app is relaunched.
let shownThisSession = false;

interface ReviewStore {
  // Ephemeral
  visible: boolean;
  // Persisted
  reviewed: boolean; // user left a review — never ask again
  dismissedForever: boolean; // user tapped "Don't ask again"
  lastPromptAt: string | null; // ISO of the last time we showed the prompt

  /** Show the prompt iff eligible (positive-moment entry point). */
  maybePrompt: () => void;
  /** Force-open (e.g. from a "Rate PlanNplate" row in settings). */
  open: () => void;
  /** Dismiss + start the snooze window. */
  snooze: () => void;
  /** Mark the user as having reviewed — never ask again. */
  markReviewed: () => void;
  /** Permanently stop asking. */
  dontAskAgain: () => void;
}

export const useReviewStore = create<ReviewStore>()(
  persist(
    (set, get) => ({
      visible: false,
      reviewed: false,
      dismissedForever: false,
      lastPromptAt: null,

      maybePrompt: () => {
        const s = get();
        if (shownThisSession) return; // never twice in one session
        if (s.visible || s.reviewed || s.dismissedForever) return;
        if (s.lastPromptAt) {
          const days = (Date.now() - new Date(s.lastPromptAt).getTime()) / 86400000;
          if (days < SNOOZE_DAYS) return;
        }
        shownThisSession = true;
        set({ visible: true, lastPromptAt: new Date().toISOString() });
      },

      open: () => set({ visible: true, lastPromptAt: new Date().toISOString() }),
      snooze: () => set({ visible: false, lastPromptAt: new Date().toISOString() }),
      markReviewed: () => set({ visible: false, reviewed: true }),
      dontAskAgain: () => set({ visible: false, dismissedForever: true }),
    }),
    {
      name: 'review-prompt-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Persist only the durable flags — never `visible`.
      partialize: (s) => ({
        reviewed: s.reviewed,
        dismissedForever: s.dismissedForever,
        lastPromptAt: s.lastPromptAt,
      }),
    },
  ),
);
