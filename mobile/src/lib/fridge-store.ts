// "What's in your kitchen?" on Make your Own — the user's own edits to the
// inferred chip list, persisted so leaving the screen doesn't lose them.
//
// Edits are reused for EDIT_TTL_DAYS (the same 7-day window the inference
// looks back over); after that the screen re-infers from recent activity.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const EDIT_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

interface FridgeState {
  items: string[] | null;
  editedAt: number | null;
  hasHydrated: boolean;
  saveEdits: (items: string[]) => void;
  clearEdits: () => void;
  setHasHydrated: (v: boolean) => void;
}

export const useFridgeStore = create<FridgeState>()(
  persist(
    (set) => ({
      items: null,
      editedAt: null,
      hasHydrated: false,
      saveEdits: (items) => set({ items, editedAt: Date.now() }),
      clearEdits: () => set({ items: null, editedAt: null }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'pnp-fridge-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items, editedAt: s.editedAt }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/** The user's saved edits, or null when there are none or they're older than 7 days. */
export function freshFridgeEdits(
  items: string[] | null,
  editedAt: number | null,
  now: number,
): string[] | null {
  if (!items || editedAt === null) return null;
  if (now - editedAt > EDIT_TTL_DAYS * DAY_MS) return null;
  return items;
}
