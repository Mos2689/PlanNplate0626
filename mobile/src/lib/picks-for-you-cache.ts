import AsyncStorage from '@react-native-async-storage/async-storage';
import { Recipe } from './store';

const CACHE_VERSION = 'v1';
const CACHE_KEY_PREFIX = `picks_for_you_${CACHE_VERSION}`;

interface CacheEntry {
  weekKey: string;
  prefHash: string;
  recipes: Recipe[];
  generatedAt: string;
}

function buildKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}_${userId}`;
}

export async function getCachedAIPicks(
  userId: string,
  weekKey: string,
  prefHash: string,
): Promise<Recipe[] | null> {
  try {
    const raw = await AsyncStorage.getItem(buildKey(userId));
    if (!raw) return null;

    const entry = JSON.parse(raw) as CacheEntry;

    if (entry.weekKey !== weekKey) {
      console.log('[PicksForYou] Cache expired (new week):', entry.weekKey, '->', weekKey);
      return null;
    }

    if (entry.prefHash !== prefHash) {
      console.log('[PicksForYou] Cache invalidated (preferences changed)');
      return null;
    }

    return entry.recipes;
  } catch (error) {
    console.warn('[PicksForYou] Failed to read cache:', error);
    return null;
  }
}

export async function setCachedAIPicks(
  userId: string,
  weekKey: string,
  prefHash: string,
  recipes: Recipe[],
): Promise<void> {
  try {
    const entry: CacheEntry = {
      weekKey,
      prefHash,
      recipes,
      generatedAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(buildKey(userId), JSON.stringify(entry));
    console.log('[PicksForYou] Cached', recipes.length, 'AI picks for week', weekKey);
  } catch (error) {
    console.warn('[PicksForYou] Failed to write cache:', error);
  }
}

export async function clearCachedAIPicks(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(buildKey(userId));
    console.log('[PicksForYou] Cleared cache for user', userId);
  } catch (error) {
    console.warn('[PicksForYou] Failed to clear cache:', error);
  }
}
