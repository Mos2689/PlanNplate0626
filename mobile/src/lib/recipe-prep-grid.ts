// Grid composition for the first-run "your dishes are being built" state.
//
// Pure, so it can be tested without the Recipes screen or the store — the same
// split the rest of lib/ follows.
//
// THE PROBLEM THIS SOLVES: the Recipes grid sorts by createdAt DESC, and each
// dish named during onboarding is stamped createdAt at the moment it finishes
// generating. Since they are generated in parallel and land in arbitrary order,
// every arrival was inserted at index 0 and pushed the whole grid down a row —
// up to five unannounced jumps over ~15s, often while the user was reading.
//
// So while a prep run is active the named dishes are laid out FIRST, in the
// order the user spoke them, each rendering as either its finished recipe or a
// named placeholder. Slot i is always dish i, so a dish resolving swaps its own
// tile and moves nothing else.

/** One second per rung — see `prepCreatedAt`. */
const RUNG_MS = 1000;

/**
 * The `createdAt` to stamp on the dish at `dishIndex` of a batch of `total`.
 *
 * The library grid sorts createdAt DESC, so laying the dishes on a descending
 * ladder makes the natural sort reproduce the order the user spoke them. That
 * is what lets the reserved slots hand over to normal ordering without the grid
 * reshuffling underneath the user.
 *
 * The ladder climbs FORWARD from `batchStartedAt`, which is the part that bit:
 * onboarding saves its step-2 taste picks a few milliseconds after kicking off
 * this batch, stamping them with the wall clock. An earlier version subtracted
 * here, which put every dish the user had spoken *below* every suggestion — the
 * exact opposite of the intent. A full second per rung clears that window with
 * room to spare.
 */
export function prepCreatedAt(
  batchStartedAt: number,
  dishIndex: number,
  total: number,
): string {
  return new Date(batchStartedAt + (total - dishIndex) * RUNG_MS).toISOString();
}

/** The shape this module needs from a prep dish. Structurally satisfied by
 *  `RecipePrepDish` in store.ts. */
export interface PrepDishSlot {
  name: string;
  recipeId: string | null;
}

export type PrepGridItem<R> =
  /** `pinned` marks a recipe sitting in one of the reserved slots. The screen
   *  uses it to skip the card's entrance animation: the tile it is replacing
   *  already showed the same placeholder art and the same title in the same
   *  place, so springing it in reads as a pop rather than as the card quietly
   *  gaining its details. */
  | { kind: 'recipe'; recipe: R; pinned: boolean }
  | { kind: 'pending'; name: string; key: string };

/**
 * Lay the named dishes out first, then everything else.
 *
 * `recipes` is the already-filtered, already-sorted library list. A dish whose
 * recipe is missing from it — still building, or built and then filtered out —
 * keeps its slot as a placeholder carrying the user's own words rather than
 * collapsing the grid.
 *
 * Generic over the recipe type so this file never has to import the store.
 */
export function composePrepGrid<R extends { id: string }>(
  dishes: readonly PrepDishSlot[],
  recipes: readonly R[],
): PrepGridItem<R>[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const pinnedIds = new Set<string>();
  const pinned: PrepGridItem<R>[] = [];

  dishes.forEach((dish, i) => {
    const resolved = dish.recipeId ? byId.get(dish.recipeId) : undefined;
    if (resolved && !pinnedIds.has(resolved.id)) {
      pinnedIds.add(resolved.id);
      pinned.push({ kind: 'recipe', recipe: resolved, pinned: true });
      return;
    }
    // Index is part of the key because two dishes can carry the same name and
    // React would otherwise see one cell, collapsing a slot the user is
    // waiting on.
    pinned.push({ kind: 'pending', name: dish.name, key: `${i}:${dish.name}` });
  });

  const rest: PrepGridItem<R>[] = [];
  for (const recipe of recipes) {
    if (pinnedIds.has(recipe.id)) continue;
    rest.push({ kind: 'recipe', recipe, pinned: false });
  }

  return [...pinned, ...rest];
}
