import { useQuery } from '@tanstack/react-query';
import { Recipe, MealSlot, UserPreferences } from './store';
import {
  detectActiveMealTypes,
  detectUserPatterns,
  isNewUser,
  getRuleBasedPicks,
  getPatternBasedPicks,
  mergeAndDedupePicks,
  hashPreferences,
  getCurrentWeekKey,
  type Pick,
} from './picks-for-you-logic';
import { getCachedAIPicks, setCachedAIPicks } from './picks-for-you-cache';
import { generateAIPicks } from './picks-for-you-ai';

interface UsePicksForYouArgs {
  userId: string | null;
  recipes: Recipe[];
  mealSlots: MealSlot[];
  preferences: UserPreferences;
  enabled?: boolean;
}

export function usePicksForYou({
  userId,
  recipes,
  mealSlots,
  preferences,
  enabled = true,
}: UsePicksForYouArgs) {
  const weekKey = getCurrentWeekKey();
  const prefHash = hashPreferences(preferences);

  return useQuery<Pick[]>({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: ['picks-for-you', userId, weekKey, prefHash, recipes.length, mealSlots.length],
    queryFn: async () => {
      if (!userId) return [];

      const activeMealTypes = detectActiveMealTypes(mealSlots);
      const newUser = isNewUser(recipes, mealSlots);

      console.log('[PicksForYou] Active meal types:', activeMealTypes, 'newUser:', newUser);

      let aiPicks: Pick[] = [];

      let cachedAI = await getCachedAIPicks(userId, weekKey, prefHash);

      if (!cachedAI) {
        const generated = await generateAIPicks(preferences, activeMealTypes);
        if (generated.length > 0) {
          await setCachedAIPicks(userId, weekKey, prefHash, generated);
          cachedAI = generated;
        }
      }

      if (cachedAI && cachedAI.length > 0) {
        aiPicks = cachedAI.map((recipe) => ({
          recipe,
          source: 'ai' as const,
          score: 100,
          fromAICache: true,
        }));
      }

      if (newUser) {
        return aiPicks.slice(0, 8);
      }

      const { topCuisines } = detectUserPatterns(mealSlots, recipes);
      const patternPicks = getPatternBasedPicks(mealSlots, recipes, preferences, activeMealTypes, 4);
      const rulePicks = getRuleBasedPicks(recipes, preferences, activeMealTypes, 4, topCuisines);

      console.log('[PicksForYou] Sources:', {
        pattern: patternPicks.length,
        rule: rulePicks.length,
        ai: aiPicks.length,
      });

      return mergeAndDedupePicks(patternPicks, rulePicks, aiPicks, 8);
    },
    enabled: enabled && !!userId,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
  });
}
