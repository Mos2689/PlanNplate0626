// Vibe Cooking — pure helpers powering the mood-first single-recipe
// experience on /generate-recipe.
//
// Three exports:
//   • VIBES                          — the 8-card vocabulary, each card is
//                                       a marketing asset on its own.
//   • inferLikelyFridgeIngredients() — auto-populates the fridge chip row
//                                       from the user's last-7-day cooking
//                                       logs + most-recent grocery list.
//                                       Pure / deterministic / no React.
//   • buildVibePromptAddendum()      — composes the addendum we append to
//                                       customCookingInstructions before
//                                       calling generateRecipe — encodes
//                                       the vibe's creative direction +
//                                       a bullet list of available fridge
//                                       ingredients the LLM should lean on.
//
// Brand discipline:
//   • Card NAMES are intentionally quotable (Tired but Hungry,
//     Glow-up Bowl, Hangover Healer) — they double as App Store
//     screenshot copy and ad-ready taglines.
//   • One-liners stay ≤ 32 chars so they fit on a single line in the
//     dark-gradient overlay at the bottom of each card.
//   • promptSnippet is plain English the LLM can act on — no JSON, no
//     special syntax, just a directive a chef would understand.

import type {
  CookingLog,
  GroceryItem,
  Recipe,
  SavedGroceryList,
} from './store';
import { normalizeIngredientName } from './ingredient-aliases';

// ───────────────────────────────────────────────────────────────────────────────
// VIBE VOCABULARY
// ───────────────────────────────────────────────────────────────────────────────

export type VibeId =
  | 'comfort'
  | 'tired'
  | 'showoff'
  | 'glow'
  | 'date'
  | 'reboot'
  | 'hangover'
  | 'adventurous';

export interface VibeDefinition {
  id: VibeId;
  name: string;          // displayed on the card + used in marketing copy
  oneLiner: string;      // 1-line description rendered under the name
  emoji: string;         // small emoji shown beside the name (optional UI accent)
  imageUrl: string;      // hero image (Unsplash food photo matching the mood)
  localImage: any;       // required local asset
  promptSnippet: string; // appended verbatim to the generation prompt
}

export const VIBES: VibeDefinition[] = [
  {
    id: 'comfort',
    name: 'Comfort Blanket',
    oneLiner: 'Slow, warming, familiar.',
    emoji: '🥣',
    // Warm stew / braise hero
    imageUrl:
      'https://images.unsplash.com/photo-1547592180-85f173990554?w=600&q=80',
    localImage: require('../../assets/images/MoodBoardVibecook/Comfort Blanket - Slow, warming, familiar..png'),
    promptSnippet:
      'The user is in a "Comfort Blanket" mood. Lean into braises, stews, mac & cheese, lentil soup, or risotto. Choose familiar, slow, warming dishes. Avoid anything spicy, sour, or adventurous. Long-and-low techniques are welcome even if they take more time.',
  },
  {
    id: 'tired',
    name: 'Tired but Hungry',
    oneLiner: '15 minutes, max payoff.',
    emoji: '😴',
    // One-pan / sheet-pan hero
    imageUrl:
      'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=600&q=80',
    localImage: require('../../assets/images/MoodBoardVibecook/Tired but Hungry - 15 minutes, max payoff..png'),
    promptSnippet:
      'The user is in a "Tired but Hungry" mood. Single-pan, sheet-pan, or scramble-style recipes ONLY. Ingredient count ≤ 7. Total time (prep + cook) ≤ 20 minutes. No multi-step techniques. Comfort flavors over novelty.',
  },
  {
    id: 'showoff',
    name: 'Showoff Plate',
    oneLiner: 'Restaurant-level for an audience.',
    emoji: '👨‍🍳',
    // Plated restaurant dish hero
    imageUrl:
      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80',
    localImage: require('../../assets/images/MoodBoardVibecook/Showoff Plate - Restaurant-level for an audience..png'),
    promptSnippet:
      'The user is in a "Showoff Plate" mood. Recipe should plate beautifully and impress guests. Multi-component, restaurant-level techniques (sear-then-finish-in-oven, beurre monté, plated garnish, chef-style swoosh). Complexity is the point. Total time can be ≥ 60 minutes.',
  },
  {
    id: 'glow',
    name: 'Glow-up Bowl',
    oneLiner: 'Bright, nutrient-dense, photogenic.',
    emoji: '🌿',
    // Colorful bowl / grain bowl hero
    imageUrl:
      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=80',
    localImage: require('../../assets/images/MoodBoardVibecook/Glow-up Bowl - Bright, nutrient-dense, photogenic..png'),
    promptSnippet:
      'The user is in a "Glow-up Bowl" mood. Build a grain or veg bowl with at least 4 distinct colors, a fermented or pickled element (kimchi / pickled onion / sauerkraut / capers), a bright acid finish (lemon / lime / vinegar), and a creamy or tahini-based drizzle. Nutrient-dense and visually striking.',
  },
  {
    id: 'date',
    name: 'Date Night',
    oneLiner: 'Romantic, shareable, indulgent.',
    emoji: '🌙',
    // Pasta / wine-friendly dish hero
    imageUrl:
      'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600&q=80',
    localImage: require('../../assets/images/MoodBoardVibecook/Date Night - Romantic, shareable, indulgent..png'),
    promptSnippet:
      'The user is in a "Date Night" mood. Recipe should be romantic, indulgent, and shareable across two portions. Lean toward fresh pasta, a wine-friendly protein (steak / duck / salmon), a charcuterie-adjacent starter, or a rich risotto. Plating should suggest "made with intention." Assume 2 servings.',
  },
  {
    id: 'reboot',
    name: 'Energy Reboot',
    oneLiner: 'Quick protein + smart carbs.',
    emoji: '⚡',
    // Healthy bowl / protein + veg hero
    imageUrl:
      'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=600&q=80',
    localImage: require('../../assets/images/MoodBoardVibecook/Energy Reboot - Quick protein + smart carbs..png'),
    promptSnippet:
      'The user is in an "Energy Reboot" mood (post-workout / rough day). Build a recipe with a lean protein (chicken, tofu, fish, beans), a complex carb (rice, quinoa, sweet potato), and at least 2 colorful vegetables. Total time ≤ 25 minutes. Skip heavy fats and rich sauces. Function over indulgence.',
  },
  {
    id: 'hangover',
    name: 'Hangover Healer',
    oneLiner: 'Greasy, salty, soothing.',
    emoji: '🌧️',
    // Breakfast / brunch hero (eggs / hash)
    imageUrl:
      'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=600&q=80',
    localImage: require('../../assets/images/MoodBoardVibecook/Hangover Healer - Greasy, salty, soothing..png'),
    promptSnippet:
      'The user is in a "Hangover Healer" mood. Lean into greasy, salty, soothing classics: eggs benedict, breakfast hash, pho, congee, ramen, breakfast burrito. Sodium-forward. Easy on the gut. Comfort over creativity.',
  },
  {
    id: 'adventurous',
    name: 'Adventurous Cook',
    oneLiner: 'Try a cuisine you don\'t usually do.',
    emoji: '🗺️',
    // Exotic cuisine hero (curry / tagine / etc)
    imageUrl:
      'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80',
    localImage: require('../../assets/images/MoodBoardVibecook/Adventurous Cook - Try a cuisine you don\'t usually do.png'),
    promptSnippet:
      'The user is in an "Adventurous Cook" mood. Recommend a recipe from a cuisine OUTSIDE the user\'s usual rotation — if their cooking history leans Italian/Mediterranean, suggest Korean, West African, Sichuan, Levantine, or Filipino. Aim for one new technique or one new ingredient the user likely hasn\'t cooked before. Provide enough hand-holding in instructions to keep it accessible.',
  },
];

// Quick lookup by id — used by consumers needing the full definition.
export const VIBE_BY_ID: Record<VibeId, VibeDefinition> = VIBES.reduce(
  (acc, v) => {
    acc[v.id] = v;
    return acc;
  },
  {} as Record<VibeId, VibeDefinition>,
);

// ───────────────────────────────────────────────────────────────────────────────
// FRIDGE INFERENCE
// ───────────────────────────────────────────────────────────────────────────────

// Staples that are "always around" — including them as chips creates
// noise without adding signal. Stripped from the inferred list before
// it's surfaced to the user.
const STAPLE_INGREDIENTS_TO_HIDE = new Set([
  'salt',
  'pepper',
  'black pepper',
  'water',
  'oil',
  'olive oil',
  'vegetable oil',
  'butter',
  'sugar',
  'flour',
]);

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface InferLikelyFridgeIngredientsInput {
  now: Date;
  cookingLogs: CookingLog[];
  recipes: Recipe[];
  savedGroceryLists: SavedGroceryList[];
  groceryItems: GroceryItem[];
}

/**
 * Returns up to 10 likely-on-hand ingredient names, ranked by recency
 * and frequency across the user's last 7 days of cooked recipes + their
 * most-recent grocery list + currently-tracked grocery items. Used to
 * auto-populate the "What's in your fridge" chip row on the Vibe
 * Cooking screen. Pure, deterministic, no React.
 */
export function inferLikelyFridgeIngredients(
  input: InferLikelyFridgeIngredientsInput,
): string[] {
  const { now, cookingLogs, recipes, savedGroceryLists, groceryItems } = input;

  const cutoff = now.getTime() - 7 * MS_PER_DAY;
  const recipeById = new Map(recipes.map((r) => [r.id, r]));

  // Score map: canonical name → { score, displayName }
  // Score combines recency weight + source weight so that ingredients
  // appearing in BOTH the cooking history and the grocery list rise to
  // the top.
  const scores = new Map<string, { score: number; display: string }>();

  const bump = (rawName: string, weight: number) => {
    if (!rawName || typeof rawName !== 'string') return;
    const cleaned = rawName.trim();
    if (cleaned.length === 0) return;
    const canonical = normalizeIngredientName(cleaned).toLowerCase();
    if (!canonical) return;
    if (STAPLE_INGREDIENTS_TO_HIDE.has(canonical)) return;
    const existing = scores.get(canonical);
    if (existing) {
      existing.score += weight;
    } else {
      // First-write wins for the display name so we keep the user's
      // original casing/spelling rather than the canonical form.
      scores.set(canonical, { score: weight, display: cleaned });
    }
  };

  // Source 1 — recipes the user cooked in the last 7 days. Each
  // ingredient gets weight=2 (strong signal: they bought it AND used
  // it), with a recency multiplier so today's cook outranks 6 days ago.
  for (const log of cookingLogs) {
    if (log.status !== 'cooked') continue;
    if (!log.recipeId) continue;
    const cookedAt = new Date(log.cookedAt).getTime();
    if (cookedAt < cutoff) continue;
    const recipe = recipeById.get(log.recipeId);
    if (!recipe) continue;
    const daysAgo = Math.max(0, (now.getTime() - cookedAt) / MS_PER_DAY);
    const recency = Math.max(0.5, 1.5 - daysAgo * 0.15); // 1.5 today → ~0.5 a week ago
    for (const ing of recipe.ingredients ?? []) {
      bump(ing.name, 2 * recency);
    }
  }

  // Source 2 — currently-tracked grocery items (active list). Strong
  // signal that the user planned to buy it; assume bought.
  for (const item of groceryItems) {
    bump(item.name, 1.5);
  }

  // Source 3 — most-recent saved grocery list (the one the user most
  // recently locked in). Slightly weaker than the active list.
  if (savedGroceryLists && savedGroceryLists.length > 0) {
    // savedGroceryLists is already sorted newest-first by store.ts
    const mostRecent = savedGroceryLists[0];
    for (const item of mostRecent.items ?? []) {
      bump(item.name, 1.0);
    }
  }

  // Rank by score, take top 10, return display names.
  return Array.from(scores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 10)
    .map(([, v]) => v.display);
}

// ───────────────────────────────────────────────────────────────────────────────
// PROMPT ADDENDUM
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Composes the addendum we append to `customCookingInstructions` when
 * calling `generateRecipe` from the Vibe Cooking screen. The addendum
 * carries (a) the vibe's creative-direction snippet and (b) a bullet
 * list of fridge ingredients the LLM should prefer to use.
 *
 * Returns an empty string when no vibe is selected (so callers can
 * safely concat without producing trailing newlines).
 */
export function buildVibePromptAddendum(
  vibeId: VibeId | null | undefined,
  fridgeIngredients: string[],
): string {
  const parts: string[] = [];

  if (vibeId) {
    const vibe = VIBE_BY_ID[vibeId];
    if (vibe) {
      parts.push(vibe.promptSnippet);
    }
  }

  const cleanIngredients = (fridgeIngredients ?? [])
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length > 0);
  if (cleanIngredients.length > 0) {
    parts.push(
      `Prefer recipes that use these ingredients the user already has on hand:\n${cleanIngredients.map((s) => `  • ${s}`).join('\n')}`,
    );
  }

  if (parts.length === 0) return '';
  return parts.join('\n\n');
}
