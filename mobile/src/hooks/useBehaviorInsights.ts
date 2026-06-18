// useBehaviorInsights — thin React wrapper over the pure
// `computeBehaviorInsights` engine. Subscribes only to the primitive
// store slices it needs (per Zustand best practice on this project)
// and recomputes via useMemo when any of them changes.
import { useMemo } from 'react';
import { useMealPlanStore } from '@/lib/store';
import {
  computeBehaviorInsights,
  type BehaviorInsights,
} from '@/lib/behavior-insights';

export function useBehaviorInsights(): BehaviorInsights {
  const planningEvents = useMealPlanStore((s) => s.planningEvents);
  const cookingLogs = useMealPlanStore((s) => s.cookingLogs);
  const mealSlots = useMealPlanStore((s) => s.mealSlots);
  const recipes = useMealPlanStore((s) => s.recipes);
  const recipeRatings = useMealPlanStore((s) => s.recipeRatings);

  return useMemo(
    () =>
      computeBehaviorInsights({
        now: new Date(),
        planningEvents,
        cookingLogs,
        mealSlots,
        recipes,
        recipeRatings,
      }),
    [planningEvents, cookingLogs, mealSlots, recipes, recipeRatings],
  );
}
