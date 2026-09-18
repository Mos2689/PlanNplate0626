// The grid layout that keeps the first-run landing still.
//
// The property that matters is POSITIONAL STABILITY: as dishes resolve one by
// one, the slot a given dish occupies must not move. These cases walk a prep
// run through its stages and assert the ordering holds at each one.

import { composePrepGrid, prepCreatedAt, type PrepDishSlot } from '../recipe-prep-grid';

type R = { id: string; name: string };

const lib = (...ids: string[]): R[] => ids.map((id) => ({ id, name: id }));
const kinds = (items: ReturnType<typeof composePrepGrid<R>>) =>
  items.map((i) => (i.kind === 'pending' ? `pending:${i.name}` : i.recipe.id));

describe('composePrepGrid', () => {
  const dishes = (...d: [string, string | null][]): PrepDishSlot[] =>
    d.map(([name, recipeId]) => ({ name, recipeId }));

  it('reserves a slot per dish before anything has built', () => {
    // The landing frame: three named tiles above the step-2 taste picks.
    expect(
      kinds(
        composePrepGrid(
          dishes(['Butter chicken', null], ['Shakshuka', null], ['Bhindi masala', null]),
          lib('taste-1', 'taste-2'),
        ),
      ),
    ).toEqual([
      'pending:Butter chicken',
      'pending:Shakshuka',
      'pending:Bhindi masala',
      'taste-1',
      'taste-2',
    ]);
  });

  it('keeps every slot in place as dishes resolve out of order', () => {
    // Recipes are generated in parallel, so the middle dish can finish first.
    // Its tile must become a real card WITHOUT sliding to the top — that jump
    // is the bug this whole module exists to remove.
    const afterSecond = composePrepGrid(
      dishes(['Butter chicken', null], ['Shakshuka', 'r-shak'], ['Bhindi masala', null]),
      // The resolved recipe sorts to the front of the library (newest first).
      lib('r-shak', 'taste-1'),
    );
    expect(kinds(afterSecond)).toEqual([
      'pending:Butter chicken',
      'r-shak',
      'pending:Bhindi masala',
      'taste-1',
    ]);

    const afterThird = composePrepGrid(
      dishes(['Butter chicken', null], ['Shakshuka', 'r-shak'], ['Bhindi masala', 'r-bhindi']),
      lib('r-bhindi', 'r-shak', 'taste-1'),
    );
    expect(kinds(afterThird)).toEqual([
      'pending:Butter chicken',
      'r-shak',
      'r-bhindi',
      'taste-1',
    ]);
  });

  it('never shows a pinned recipe twice', () => {
    const items = composePrepGrid(dishes(['Dal', 'r-dal']), lib('r-dal', 'taste-1'));
    expect(kinds(items)).toEqual(['r-dal', 'taste-1']);
  });

  it('holds the slot when a resolved recipe is absent from the list', () => {
    // e.g. the row exists but the active filter excludes it. Collapsing the
    // slot here would move every tile after it.
    expect(
      kinds(composePrepGrid(dishes(['Dal', 'r-dal']), lib('taste-1'))),
    ).toEqual(['pending:Dal', 'taste-1']);
  });

  it('gives same-named dishes distinct keys', () => {
    // Two identical names must not collapse into one React cell — the user is
    // waiting on two tiles.
    const items = composePrepGrid(dishes(['Dal', null], ['Dal', null]), lib());
    const keys = items.map((i) => (i.kind === 'pending' ? i.key : i.recipe.id));
    expect(new Set(keys).size).toBe(2);
  });

  it('returns the library untouched when no dishes are pending', () => {
    expect(kinds(composePrepGrid([], lib('a', 'b')))).toEqual(['a', 'b']);
  });

  describe('prepCreatedAt', () => {
    const BATCH = Date.UTC(2026, 0, 1, 12, 0, 0);
    const at = (i: number, total = 3) => new Date(prepCreatedAt(BATCH, i, total)).getTime();

    it('sorts the dishes newest-first in the order they were spoken', () => {
      // The grid sorts createdAt DESC, so dish 0 must carry the LATEST stamp.
      expect(at(0)).toBeGreaterThan(at(1));
      expect(at(1)).toBeGreaterThan(at(2));
    });

    it('keeps every dish above recipes saved moments later in the same flow', () => {
      // The regression this pins: onboarding saves its step-2 taste picks a few
      // milliseconds after kicking off the dish batch, stamped with the wall
      // clock. An earlier version walked the ladder DOWNWARD from the batch
      // start, which sank every dish the user had spoken below the suggestions.
      const tastePickSavedAt = BATCH + 25;
      for (let i = 0; i < 3; i++) {
        expect(at(i)).toBeGreaterThan(tastePickSavedAt);
      }
    });
  });

  it('marks pinned recipes so the screen can skip their entrance spring', () => {
    // A card taking over a reserved tile already looks like that tile, so
    // springing it in reads as a pop rather than as an arrival.
    const items = composePrepGrid(dishes(['Dal', 'r-dal']), lib('r-dal', 'taste-1'));
    const pinnedFlags = items.map((i) => (i.kind === 'recipe' ? i.pinned : null));
    expect(pinnedFlags).toEqual([true, false]);
  });
});
