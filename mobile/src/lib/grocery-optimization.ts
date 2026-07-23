// Grocery optimisation — the engine behind the "Optimise groceries" toggle on
// Plan My Meals. The goal: build a week whose recipes SHARE fresh, perishable
// ingredients so the user shops for (and wastes) less.
//
// Design (validated against the 736-recipe Get Inspired library):
//   • Fresh produce + dairy are the PRIMARY overlap signal — they're what
//     actually rots in the fridge. Meat + non-staple "other" are a SECONDARY
//     anchor signal. Pantry staples (salt, oil, spices, rice…) never count —
//     they're already owned and sharing them saves nobody anything.
//   • Perishables have a shelf life. Overlap only "counts" when the sharing
//     dishes land within that window (herbs ~3 days, produce ~5, dairy ~7);
//     reuse beyond the window scores nothing, since the ingredient has spoiled.
//   • Cheaper mains (`costPerServe`) are preferred — grocery optimisation is
//     inherently budget-minded, and cheap proteins (chicken/lentils/egg) beat
//     salmon/prawn without needing a protein classifier.
//
// This module is pure data/logic (no React, no store) so it's unit-testable and
// reusable by the curated matcher.
import { normalizeIngredientName } from './ingredient-normalizer';

// Minimal shape both InspiredRecipe and the store's Recipe satisfy — anchor
// extraction only needs ingredient names + categories, so seeds can come from
// either the library or the user's own saved favourites.
export interface IngredientBearer {
  ingredients: Array<{ name: string; category: string }>;
}

// ── Categories that drive a shopping trip and perish ──────────────────────
const FRESH_CATEGORIES = new Set(['produce', 'dairy']);
// Secondary anchors — bought per-recipe, but hardier / less waste-prone.
const SECONDARY_CATEGORIES = new Set(['meat', 'other']);

// Never count these toward overlap — staples the user already has, or non-foods.
const PANTRY_STAPLES = new Set([
  'water', 'ice', 'salt', 'sugar', 'pepper', 'black pepper', 'white pepper',
  'oil', 'olive oil', 'vegetable oil', 'sesame oil', 'flour', 'cornflour',
  'baking powder', 'baking soda', 'vanilla', 'vanilla extract',
]);

// Supplemental aliases layered ON TOP of the shared normalizer — mostly
// Australian produce spellings the grocery normalizer doesn't cover. Kept here
// (not in ingredient-normalizer) so grocery-list aggregation is untouched.
const AU_PRODUCE_ALIASES: Record<string, string> = {
  'spring onions': 'spring onion',
  'green onion': 'spring onion',
  'green onions': 'spring onion',
  scallion: 'spring onion',
  scallions: 'spring onion',
  'red capsicum': 'capsicum',
  'green capsicum': 'capsicum',
  'yellow capsicum': 'capsicum',
  capsicums: 'capsicum',
  'baby spinach': 'spinach',
  'coriander leaves': 'coriander',
  cilantro: 'coriander',
  'thickened cream': 'cream',
  'pouring cream': 'cream',
  'heavy cream': 'cream',
  'double cream': 'cream',
  'natural yoghurt': 'yogurt',
  yoghurt: 'yogurt',
  'plain yoghurt': 'yogurt',
  mushroom: 'mushrooms',
};

/** Canonical ingredient key used for overlap matching. */
export function canonicalIngredient(name: string): string {
  const base = normalizeIngredientName(name);
  return AU_PRODUCE_ALIASES[base] ?? base;
}

// ── Shelf life (days) — how long a bought perishable stays usable ─────────
// Coarse but honest: leafy/herbs spoil fast, dairy lasts a week.
const HERB_LEAFY = new Set([
  'coriander', 'basil', 'mint', 'parsley', 'dill', 'chives', 'spinach',
  'rocket', 'lettuce', 'kale', 'spring onion',
]);
const DAIRY_KEYS = new Set([
  'yogurt', 'cream', 'milk', 'cheese', 'parmesan', 'feta', 'mozzarella',
  'butter', 'ricotta', 'sour cream', 'mascarpone',
]);

export function shelfLifeDays(canonical: string): number {
  if (HERB_LEAFY.has(canonical)) return 3;
  if (DAIRY_KEYS.has(canonical)) return 7;
  return 5; // other produce / hardy veg
}

// ── Anchor extraction ─────────────────────────────────────────────────────
export interface RecipeAnchors {
  fresh: Set<string>; // produce + dairy (primary)
  secondary: Set<string>; // meat + non-staple other
}

export function extractAnchors(recipe: IngredientBearer): RecipeAnchors {
  const fresh = new Set<string>();
  const secondary = new Set<string>();
  for (const ing of recipe.ingredients) {
    const key = canonicalIngredient(ing.name);
    if (PANTRY_STAPLES.has(key)) continue;
    if (FRESH_CATEGORIES.has(ing.category)) fresh.add(key);
    else if (SECONDARY_CATEGORIES.has(ing.category)) secondary.add(key);
  }
  return { fresh, secondary };
}

/**
 * Weighted union of fresh + secondary anchors across a set of seed recipes
 * (the user's selected favourites). An ingredient appearing in MORE favourites
 * weighs more — so "used in 2 of my picks" outranks a one-off. Fresh anchors
 * are weighted 2× secondary ones (produce/dairy is the priority).
 */
export function buildSeedAnchors(seeds: IngredientBearer[]): Map<string, number> {
  const weights = new Map<string, number>();
  const bump = (key: string, w: number) =>
    weights.set(key, (weights.get(key) ?? 0) + w);
  for (const r of seeds) {
    const { fresh, secondary } = extractAnchors(r);
    for (const k of fresh) bump(k, 2);
    for (const k of secondary) bump(k, 1);
  }
  return weights;
}

// ── The accumulating basket ────────────────────────────────────────────────
// As the matcher places recipes, their anchors accumulate here. Scoring a
// candidate rewards overlap with what's already in the basket. Perishable
// overlap only counts within the shelf-life window (measured in "slot index",
// a proxy for day order since mains are generated in day sequence).
interface BasketEntry {
  weight: number; // accumulated seed weight + usage
  lastSlot: number; // most recent slot index that used it (for the window)
  fresh: boolean;
}

export class GroceryBasket {
  private entries = new Map<string, BasketEntry>();

  /** Seed the basket from the favourites' weighted anchors (slot -1 = "always fresh"). */
  constructor(seed?: Map<string, number>) {
    if (seed) {
      for (const [key, weight] of seed) {
        this.entries.set(key, { weight, lastSlot: -1, fresh: true });
      }
    }
  }

  get size(): number {
    return this.entries.size;
  }

  /**
   * Overlap score for a candidate at a given slot index. Fresh anchors dominate
   * (×3); secondary anchors add a little (×1). A perishable already in the
   * basket only rewards overlap if its last use is within its shelf-life window
   * of this slot — otherwise the tub/bunch has spoiled and re-buying is the
   * honest expectation, so it scores 0.
   */
  score(anchors: RecipeAnchors, slot: number): number {
    let s = 0;
    for (const key of anchors.fresh) {
      const e = this.entries.get(key);
      if (!e) continue;
      const withinWindow =
        e.lastSlot < 0 || slot - e.lastSlot <= shelfLifeDays(key);
      if (withinWindow) s += 3 * Math.min(e.weight, 4);
    }
    for (const key of anchors.secondary) {
      const e = this.entries.get(key);
      if (e) s += 1 * Math.min(e.weight, 4);
    }
    return s;
  }

  /** Fold a placed recipe's anchors into the basket at its slot index. */
  add(anchors: RecipeAnchors, slot: number): void {
    for (const key of anchors.fresh) {
      const e = this.entries.get(key);
      if (e) {
        e.weight += 1;
        e.lastSlot = slot;
      } else {
        this.entries.set(key, { weight: 1, lastSlot: slot, fresh: true });
      }
    }
    for (const key of anchors.secondary) {
      const e = this.entries.get(key);
      if (e) e.weight += 1;
      else this.entries.set(key, { weight: 1, lastSlot: slot, fresh: false });
    }
  }
}
