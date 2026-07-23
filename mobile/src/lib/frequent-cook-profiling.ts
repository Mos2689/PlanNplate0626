// ───────────────────────────────────────────────────────────────────────────
// FREQUENT-COOK PROFILING
// ---------------------------------------------------------------------------
// Onboarding step 1 asks the user to name a few dishes they cook often / love.
// This module profiles those names against the 736-recipe Get Inspired library
// (used as a knowledge base) and composes the step-2 "you may also like" grid
// as a DELIBERATE MIX (never repeating a step-1 dish):
//     • 3 mains sharing the user's dominant CUISINE       (Italian / Indian …)
//     • 3 mains sharing their dominant PROTEIN / VEG       (chicken / salmon / pumpkin …)
//     • 2 mains sharing their dominant CARB form           (pasta / rice / noodles / roti)
//     • 4 breakfasts: 2 no-cook + 2 cooked
// Short buckets backfill from profile-ranked recipes so the grid is never sparse.
//
// No external dictionaries beyond small protein/carb keyword lists: cuisine +
// structured ingredients already live on every library recipe.
// ───────────────────────────────────────────────────────────────────────────
import { INSPIRED_RECIPES, type InspiredRecipe } from './inspired-recipe-library';
import { getTasteSampleRecipes } from './inspired-plan-source';

const STOPWORDS = new Set([
  'with', 'and', 'the', 'of', 'in', 'on', 'for', 'to', 'style', 'easy', 'quick',
  'homemade', 'classic', 'creamy', 'spicy', 'simple', 'best', 'my', 'our',
  'healthy', 'fresh', 'served', 'side', 'plate', 'bowl', 'dish', 'recipe',
  'recipes', 'made', 'mum', 'mom', 'grandma', 'special', 'favourite', 'favorite',
]);

// Protein / vegetable "type" the user's dishes centre on (word-boundary matched).
const PROTEIN_VEG_TERMS = [
  'chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'duck', 'sausage',
  'salmon', 'tuna', 'cod', 'barramundi', 'snapper', 'prawn', 'shrimp', 'crab',
  'squid', 'calamari', 'fish', 'paneer', 'tofu', 'tempeh', 'chickpea', 'lentil',
  'egg', 'mushroom', 'pumpkin', 'sweet potato', 'potato', 'spinach',
  'cauliflower', 'broccoli', 'eggplant', 'zucchini', 'pea', 'corn',
];
// Animal proteins — a step-1 dish naming any of these is NOT vegetarian.
const MEAT_FISH_TERMS = [
  'chicken', 'beef', 'pork', 'lamb', 'turkey', 'bacon', 'duck', 'sausage',
  'ham', 'steak', 'mince', 'veal', 'goat', 'prosciutto', 'chorizo', 'salami',
  'salmon', 'tuna', 'cod', 'barramundi', 'snapper', 'prawn', 'shrimp', 'crab',
  'squid', 'calamari', 'fish', 'anchovy', 'mackerel', 'sardine', 'oyster',
  'mussel', 'scallop', 'lobster',
];
// Carb "form" — grouped so a match returns the whole family to search on.
const CARB_GROUPS: Record<string, string[]> = {
  pasta: ['spaghetti', 'penne', 'linguine', 'fettuccine', 'macaroni', 'lasagne',
    'lasagna', 'gnocchi', 'ravioli', 'tagliatelle', 'pappardelle', 'fusilli',
    'rigatoni', 'orzo', 'pasta'],
  rice: ['risotto', 'biryani', 'pilaf', 'paella', 'jambalaya', 'rice'],
  noodle: ['ramen', 'udon', 'soba', 'vermicelli', 'noodle'],
  bread: ['roti', 'naan', 'chapati', 'tortilla', 'flatbread', 'paratha', 'pita', 'bread', 'wrap'],
};
// A breakfast is "no-cook" if its steps use no cooking verb.
const COOK_VERBS = ['cook', 'bake', 'fry', 'roast', 'grill', 'boil', 'simmer',
  'saute', 'sauté', 'sear', 'toast', 'poach', 'scramble', 'steam', 'griddle',
  'broil', 'braise', 'microwave', 'heat', 'warm'];

function tokenize(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}
function slug(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function overlapCount(a: Set<string>, b: Iterable<string>): number {
  let n = 0;
  for (const t of b) if (a.has(t)) n++;
  return n;
}
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function hasWord(text: string, term: string): boolean {
  return new RegExp(`\\b${escapeRe(term)}\\b`).test(text);
}
function wordCount(text: string, term: string): number {
  return (text.match(new RegExp(`\\b${escapeRe(term)}\\b`, 'g')) || []).length;
}
function isVegRecipe(r: InspiredRecipe): boolean {
  const d = r.dietary.map((x) => x.toLowerCase());
  return d.includes('vegan') || d.includes('vegetarian');
}

// Pre-index the library once.
type Indexed = {
  recipe: InspiredRecipe;
  nameTokens: Set<string>;
  ingredientTokens: Set<string>;
  haystack: string; // name + ingredient names, lowercased (for protein/carb match)
  noCook: boolean;  // meaningful only for breakfasts
};
const INDEX: Indexed[] = INSPIRED_RECIPES.map((r) => {
  const steps = r.instructions.join(' ').toLowerCase();
  return {
    recipe: r,
    nameTokens: new Set(tokenize(r.name)),
    ingredientTokens: new Set(r.ingredients.flatMap((i) => tokenize(i.name))),
    haystack: `${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`.toLowerCase(),
    noCook: r.mealType === 'Breakfast' ? !COOK_VERBS.some((v) => steps.includes(v)) : false,
  };
});
const MAINS = INDEX.filter((it) => it.recipe.mealType === 'Lunch/Dinner');
const BREAKFASTS = INDEX.filter((it) => it.recipe.mealType === 'Breakfast');

export interface FrequentCookProfile {
  cuisineWeights: Record<string, number>;
  themeTokens: Set<string>;
  ingredientTokens: Set<string>;
  enteredSlugs: string[];
  enteredText: string; // ONLY the dish names the user typed, lowercased
  vegetarianOnly: boolean; // true when EVERY dish the user named is vegetarian
}

export function profileFrequentCooks(names: string[]): FrequentCookProfile {
  const cuisineWeights: Record<string, number> = {};
  const themeTokens = new Set<string>();
  const ingredientTokens = new Set<string>();
  const enteredSlugs: string[] = [];
  const enteredParts: string[] = [];
  let anyDish = false;
  let allVeg = true;

  for (const raw of names) {
    const name = (raw || '').trim();
    if (!name) continue;
    anyDish = true;
    enteredSlugs.push(slug(name));
    enteredParts.push(name);
    const tokens = tokenize(name);
    tokens.forEach((t) => themeTokens.add(t));

    // Closest library dishes by name-token overlap → borrow cuisine (for the
    // cuisine bucket) + ingredients (for scoring). NOT used for protein/carb
    // detection — that reads only what the user typed, to stay accurate.
    const analogs = INDEX.map((it) => ({ it, score: overlapCount(it.nameTokens, tokens) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    analogs.forEach(({ it }, idx) => {
      cuisineWeights[it.recipe.cuisine] = (cuisineWeights[it.recipe.cuisine] ?? 0) + (3 - idx);
      it.ingredientTokens.forEach((t) => ingredientTokens.add(t));
    });

    // Vegetarian? A named meat/fish → no. Otherwise the closest analog decides:
    // veg if it's tagged veg OR its ingredients contain no meat/fish (robust to
    // clearly-veg dishes that lack a 'Vegetarian' tag, e.g. a dairy risotto).
    // No meat word and no analog → treat as vegetarian.
    // Only trust the analog when it's a STRONG match (≥2 shared name tokens) —
    // a weak 1-token match on a generic word ("soup", "curry") is unreliable
    // (e.g. "Pumpkin Soup" must not be judged by a "Chicken … Soup" analog).
    const lname = name.toLowerCase();
    let dishVeg: boolean;
    if (MEAT_FISH_TERMS.some((t) => hasWord(lname, t))) {
      dishVeg = false;
    } else if (analogs.length && analogs[0].score >= 2) {
      const top = analogs[0].it;
      dishVeg =
        isVegRecipe(top.recipe) || !MEAT_FISH_TERMS.some((t) => hasWord(top.haystack, t));
    } else {
      dishVeg = true; // no meat word named, no strong analog → treat as vegetarian
    }
    allVeg = allVeg && dishVeg;
  }

  return {
    cuisineWeights,
    themeTokens,
    ingredientTokens,
    enteredSlugs,
    enteredText: enteredParts.join(' ').toLowerCase(),
    vegetarianOnly: anyDish && allVeg,
  };
}

// Compose the step-2 grid from the profile (see file header for the mix).
export function suggestFromProfile(profile: FrequentCookProfile, limit = 12): InspiredRecipe[] {
  const { cuisineWeights, themeTokens, ingredientTokens, enteredSlugs, enteredText, vegetarianOnly } = profile;
  const excluded = new Set(enteredSlugs);
  const used = new Set<string>();

  if (!enteredText.trim()) return getTasteSampleRecipes({ limit });

  const maxCuisineW = Math.max(1, ...Object.values(cuisineWeights));
  const scoreOf = (it: Indexed) => {
    let s = ((cuisineWeights[it.recipe.cuisine] ?? 0) / maxCuisineW) * 30;
    s += 8 * overlapCount(it.nameTokens, themeTokens);
    s += 5 * overlapCount(it.ingredientTokens, themeTokens);
    s += 2 * overlapCount(it.ingredientTokens, ingredientTokens);
    s += Math.random() * 0.5;
    return s;
  };
  // When every step-1 dish is vegetarian, restrict ALL suggestions to veg.
  const available = (it: Indexed) =>
    !used.has(it.recipe.id) &&
    !excluded.has(slug(it.recipe.name)) &&
    (!vegetarianOnly || isVegRecipe(it.recipe));

  const pick = (pool: Indexed[], pred: (it: Indexed) => boolean, n: number): Indexed[] => {
    const out: Indexed[] = [];
    const cands = pool.filter((it) => available(it) && pred(it)).sort((a, b) => scoreOf(b) - scoreOf(a));
    for (const it of cands) {
      if (out.length >= n) break;
      used.add(it.recipe.id);
      out.push(it);
    }
    return out;
  };

  // Dominant cuisine / protein-veg / carb from the user's dishes.
  const topCuisine = Object.entries(cuisineWeights).sort((a, b) => b[1] - a[1])[0]?.[0];
  let protein: string | null = null;
  let proteinN = 0;
  for (const term of PROTEIN_VEG_TERMS) {
    const n = wordCount(enteredText, term);
    if (n > proteinN) {
      proteinN = n;
      protein = term;
    }
  }
  let carbTerms: string[] | null = null;
  let carbN = 0;
  for (const terms of Object.values(CARB_GROUPS)) {
    const n = terms.reduce((acc, t) => acc + (hasWord(enteredText, t) ? 1 : 0), 0);
    if (n > carbN) {
      carbN = n;
      carbTerms = terms;
    }
  }

  const out: Indexed[] = [];
  // 1 · same cuisine (3 mains)
  if (topCuisine) out.push(...pick(MAINS, (it) => it.recipe.cuisine === topCuisine, 3));
  // 2 · same protein / veg (3 mains)
  if (protein) out.push(...pick(MAINS, (it) => hasWord(it.haystack, protein!), 3));
  // 3 · same carb form (2 mains)
  if (carbTerms) out.push(...pick(MAINS, (it) => carbTerms!.some((t) => hasWord(it.haystack, t)), 2));
  // 4 · breakfast (2 no-cook + 2 cooked)
  out.push(...pick(BREAKFASTS, (it) => it.noCook, 2));
  out.push(...pick(BREAKFASTS, (it) => !it.noCook, 2));

  // Backfill short buckets: profile-ranked mains, then breakfasts, then generic.
  const topUp = (pool: Indexed[]) => {
    const ranked = pool.filter(available).sort((a, b) => scoreOf(b) - scoreOf(a));
    for (const it of ranked) {
      if (out.length >= limit) break;
      used.add(it.recipe.id);
      out.push(it);
    }
  };
  if (out.length < limit) topUp(MAINS);
  if (out.length < limit) topUp(BREAKFASTS);
  if (out.length < limit) {
    const generic = getTasteSampleRecipes({
      limit: limit * 2,
      dietaryRestrictions: vegetarianOnly ? ['Vegetarian'] : undefined,
    });
    for (const r of generic) {
      if (out.length >= limit) break;
      if (used.has(r.id) || excluded.has(slug(r.name))) continue;
      const it = INDEX.find((x) => x.recipe.id === r.id);
      if (it && available(it)) {
        used.add(r.id);
        out.push(it);
      }
    }
  }

  return out.slice(0, limit).map((it) => it.recipe);
}

export function profileAndSuggest(names: string[], limit = 12): InspiredRecipe[] {
  return suggestFromProfile(profileFrequentCooks(names), limit);
}
