// Tests for the new-user / anonymous gating on the retrospective nudges
// (confirm + rating). The grocery-firsttime handoff must remain unaffected.

import {
  selectActiveNudge,
  formatLocalDateKey,
  type NudgeInputs,
} from '../nudge-engine';
import type { MealSlot, Recipe, CookingLog } from '../store';

const DAY = 24 * 60 * 60 * 1000;

function isoDaysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY).toISOString();
}

function dateKeyOffset(now: Date, offsetDays: number): string {
  return formatLocalDateKey(new Date(now.getTime() + offsetDays * DAY));
}

// A signed-up user, 30-day-old account, plan + grocery already built (so the
// grocery-firsttime branch is suppressed by default). Override per test.
function baseInputs(overrides: Partial<NudgeInputs> = {}): NudgeInputs {
  const now = overrides.now ?? new Date('2026-06-10T12:00:00'); // a Wednesday
  return {
    now,
    mealSlots: [],
    recipes: [],
    cookingLogs: [],
    recipeRatings: [],
    dismissals: {},
    lastWeeklyPromptAt: null,
    isAnonymous: false,
    accountCreatedAt: isoDaysAgo(now, 30),
    groceryItemCount: 1,
    savedGroceryListCount: 1,
    hasCompletedOnboarding: true,
    isGenerationInProgress: false,
    ...overrides,
  };
}

function pastUnloggedSlot(now: Date): MealSlot {
  return {
    id: 'slot-1',
    date: dateKeyOffset(now, -2), // 2 days ago
    mealType: 'dinner',
    recipeId: 'r1',
  };
}

describe('selectActiveNudge — new-user / anonymous gating', () => {
  it('suppresses the confirm nudge for anonymous guests', () => {
    const now = new Date('2026-06-10T12:00:00');
    const res = selectActiveNudge(
      baseInputs({ now, isAnonymous: true, mealSlots: [pastUnloggedSlot(now)] }),
    );
    expect(res).toBeNull();
  });

  it('suppresses the confirm nudge within the first 7 days since signup', () => {
    const now = new Date('2026-06-10T12:00:00');
    const res = selectActiveNudge(
      baseInputs({
        now,
        accountCreatedAt: isoDaysAgo(now, 2),
        mealSlots: [pastUnloggedSlot(now)],
      }),
    );
    expect(res).toBeNull();
  });

  it('shows the confirm nudge for a signed-up user past the first week', () => {
    const now = new Date('2026-06-10T12:00:00');
    const res = selectActiveNudge(
      baseInputs({
        now,
        accountCreatedAt: isoDaysAgo(now, 10),
        mealSlots: [pastUnloggedSlot(now)],
      }),
    );
    expect(res?.variant).toBe('confirm');
  });

  it('shows the rating nudge on Sunday evening for an established user', () => {
    const now = new Date('2026-06-14T18:00:00'); // Sunday 18:00
    const cookedLog: CookingLog = {
      id: 'l1',
      slotId: 'slot-1',
      recipeId: 'r1',
      status: 'cooked',
      cookedAt: isoDaysAgo(now, 1),
    };
    const recipe = { id: 'r1', name: 'Test' } as Recipe;
    const res = selectActiveNudge(
      baseInputs({
        now,
        accountCreatedAt: isoDaysAgo(now, 10),
        cookingLogs: [cookedLog],
        recipes: [recipe],
      }),
    );
    expect(res?.variant).toBe('rating');
  });

  it('suppresses the rating nudge for a guest even on Sunday evening', () => {
    const now = new Date('2026-06-14T18:00:00');
    const cookedLog: CookingLog = {
      id: 'l1',
      slotId: 'slot-1',
      recipeId: 'r1',
      status: 'cooked',
      cookedAt: isoDaysAgo(now, 1),
    };
    const recipe = { id: 'r1', name: 'Test' } as Recipe;
    const res = selectActiveNudge(
      baseInputs({
        now,
        isAnonymous: true,
        accountCreatedAt: isoDaysAgo(now, 30),
        cookingLogs: [cookedLog],
        recipes: [recipe],
      }),
    );
    expect(res).toBeNull();
  });

  it('still shows grocery-firsttime for a brand-new anonymous user', () => {
    const now = new Date('2026-06-10T12:00:00');
    const futureSlot: MealSlot = {
      id: 's2',
      date: dateKeyOffset(now, 1), // tomorrow
      mealType: 'dinner',
      recipeId: 'r1',
    };
    const res = selectActiveNudge(
      baseInputs({
        now,
        isAnonymous: true,
        accountCreatedAt: isoDaysAgo(now, 0),
        groceryItemCount: 0,
        savedGroceryListCount: 0,
        mealSlots: [futureSlot],
      }),
    );
    expect(res?.variant).toBe('grocery-firsttime');
  });
});
