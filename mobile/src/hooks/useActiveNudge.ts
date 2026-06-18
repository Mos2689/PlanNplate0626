import { useMemo } from 'react';
import { useMealPlanStore } from '@/lib/store';
import { useAuthStore } from '@/lib/auth-store';
import { selectActiveNudge, type ActiveNudge } from '@/lib/nudge-engine';

/**
 * Returns the currently-active nudge for the home tab, or null if no nudge
 * should be shown.
 *
 * Selection priority (highest → lowest), implemented in `selectActiveNudge`:
 *   1. 'grocery-firsttime' — one-time onboarding handoff after a plan exists
 *      but no grocery list has ever been built. Self-dismisses on first list.
 *   2. 'confirm'           — weekly check-in to rate any unlogged meals from
 *                            the past 7 days (Sun-anchored dismissal).
 *   3. 'rating'            — Sunday-evening weekly review, gated behind the
 *                            "user is ≥ 7 days past signup" rule.
 *
 * Re-evaluates whenever any of its inputs change in the store. Each slice is
 * subscribed via its own primitive selector (per CLAUDE.md's Zustand rules).
 */
export function useActiveNudge(): ActiveNudge | null {
  const mealSlots = useMealPlanStore((s) => s.mealSlots);
  const recipes = useMealPlanStore((s) => s.recipes);
  const cookingLogs = useMealPlanStore((s) => s.cookingLogs);
  const recipeRatings = useMealPlanStore((s) => s.recipeRatings);
  const dismissals = useMealPlanStore((s) => s.nudgeDismissals);
  const lastWeeklyPromptAt = useMealPlanStore((s) => s.lastWeeklyPromptAt);

  // Retrospective-nudge gates: hide for anonymous guests, and gate behind the
  // "≥ 7 days since signup" rule using the auth user's created_at (true
  // first-use; preserved across anonymous→email linking). Sourced from the
  // auth store, NOT the meal-plan userProfile (which is never populated).
  const isAnonymous = useAuthStore((s) => s.isAnonymous);
  const accountCreatedAt = useAuthStore((s) => s.currentUser?.createdAt ?? null);

  // First-time-grocery gate needs these — selected as primitives so the hook
  // only re-runs when the values it cares about move.
  const groceryItemCount = useMealPlanStore((s) => s.groceryItems.length);
  const savedGroceryListCount = useMealPlanStore(
    (s) => s.savedGroceryLists.length,
  );
  const hasCompletedOnboarding = useMealPlanStore(
    (s) => !!s.preferences.hasCompletedOnboarding,
  );

  // True while background recipe generation is mid-stream (starting →
  // generating → finalizing → failed). Becomes false at 'done' and after
  // the post-done 1.8s clear that sets `pendingGeneration` back to null.
  // Used to hold the first-time grocery nudge until the COMPLETE meal-
  // planning process finishes — otherwise the nudge would fire the moment
  // the first streamed recipe gets assigned to a slot.
  const isGenerationInProgress = useMealPlanStore((s) => {
    const pg = s.pendingGeneration;
    return !!pg && pg.stage !== 'done';
  });

  return useMemo(
    () => {
      const now = new Date();
      return selectActiveNudge({
        now,
        mealSlots,
        recipes,
        cookingLogs,
        recipeRatings,
        dismissals,
        lastWeeklyPromptAt,
        isAnonymous,
        accountCreatedAt,
        groceryItemCount,
        savedGroceryListCount,
        hasCompletedOnboarding,
        isGenerationInProgress,
      });
    },
    [
      mealSlots,
      recipes,
      cookingLogs,
      recipeRatings,
      dismissals,
      lastWeeklyPromptAt,
      isAnonymous,
      accountCreatedAt,
      groceryItemCount,
      savedGroceryListCount,
      hasCompletedOnboarding,
      isGenerationInProgress,
    ],
  );
}
