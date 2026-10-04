// App tour — watched progress and the first-run card state.
//
// Persisted to AsyncStorage on the device. `armed` flips on once, when a new
// user finishes onboarding, so existing users never see the first-run card.
// The card shows until all videos are watched or the card is dismissed;
// after that the Profile → Settings row is the only entry point.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { TOUR_VIDEOS } from './tour-videos';

interface TourState {
  armed: boolean;
  cardDismissed: boolean;
  watchedIds: string[];
  hasHydrated: boolean;
  arm: () => void;
  dismissCard: () => void;
  markWatched: (id: string) => void;
  resetForTesting: () => void;
  setHasHydrated: (v: boolean) => void;
}

export const useTourStore = create<TourState>()(
  persist(
    (set, get) => ({
      armed: false,
      cardDismissed: false,
      watchedIds: [],
      hasHydrated: false,
      arm: () => {
        if (get().armed) return;
        set({ armed: true, cardDismissed: false });
      },
      dismissCard: () => set({ cardDismissed: true }),
      markWatched: (id) => {
        if (get().watchedIds.includes(id)) return;
        set({ watchedIds: [...get().watchedIds, id] });
      },
      resetForTesting: () => set({ armed: true, cardDismissed: false, watchedIds: [] }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'pnp-tour-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        armed: s.armed,
        cardDismissed: s.cardDismissed,
        watchedIds: s.watchedIds,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

export function selectShowTourCard(s: TourState): boolean {
  const watchedAll = TOUR_VIDEOS.every((v) => s.watchedIds.includes(v.id));
  return s.hasHydrated && s.armed && !s.cardDismissed && !watchedAll;
}
