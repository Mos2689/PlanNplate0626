import { useState, useCallback } from 'react';
import { generateRecipesOptimized, estimateGenerationTime } from './optimized-recipe-generation';
import type { GeneratedRecipeResponse, MealType } from './openai';
import type { UserPreferences } from './store';

/**
 * Per-recipe streaming callback. Fires the moment each recipe (cached,
 * generated, repeated, or safety-net) becomes available in the batch.
 * Pass via the optional `onRecipeReady` arg to `generateRecipes` to push
 * recipes into the store one-by-one for a streaming UI.
 */
export type OnRecipeReady = (
  recipe: GeneratedRecipeResponse,
  index: number,
) => void;

export interface GenerationProgress {
  total: number;
  completed: number;
  cached: number;
  generated: number;
  failed: number;
  percentComplete: number;
  estimatedTimeRemaining?: number;
}

export function useOptimizedGeneration() {
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const generateRecipes = useCallback(
    async (
      mealTypes: MealType[],
      preferences: UserPreferences,
      recipesToGenerate: number,
      optimizeGrocery?: boolean,
      allowRepeats?: boolean,
      additionalInstructions?: string,
      customCookingInstructions?: string,
      // NEW: optional per-recipe streaming callback. When provided, fires
      // once for every recipe (cached / generated / repeated / safety-net)
      // the moment it becomes available — letting the caller push recipes
      // into the store one-by-one for a streaming UI.
      onRecipeReady?: OnRecipeReady,
    ): Promise<GeneratedRecipeResponse[]> => {
      setIsGenerating(true);
      setError(null);
      setProgress(null);

      try {
        const results = await generateRecipesOptimized(
          {
            mealTypes,
            preferences,
            recipesToGenerate,
            useCache: true,
            optimizeGrocery,
            allowRepeats,
            additionalInstructions,
            customCookingInstructions,
          },
          {
            onProgress: (rawProgress) => {
              const percentComplete = Math.round((rawProgress.completed / rawProgress.total) * 100);
              setProgress({
                ...rawProgress,
                percentComplete,
              });
            },
            onRecipeReady,
          },
        );

        setIsGenerating(false);
        return results;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error during generation');
        setError(error);
        setIsGenerating(false);
        throw error;
      }
    },
    []
  );

  const reset = useCallback(() => {
    setProgress(null);
    setIsGenerating(false);
    setError(null);
  }, []);

  return {
    generateRecipes,
    progress,
    isGenerating,
    error,
    reset,
    estimateTime: estimateGenerationTime,
  };
}
