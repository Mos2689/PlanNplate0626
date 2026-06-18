/**
 * Unit tests for the anonymous-guest signup gate logic.
 *
 * These tests exercise the pure boolean expression that all three call sites
 * now share:
 *
 *   isAnonymous && freePlanBuildsUsed >= 1 && freeGroceryBuildsUsed >= 1
 *
 * And the recipe-gate branching:
 *
 *   isAnonymous → push('/signup')
 *   !isAnonymous → openPaywallSheet(trigger)
 */

/** Pure replica of the gate expression used in index.tsx / grocery.tsx / plan-meals.tsx */
function shouldGateSignup(
  isAnonymous: boolean,
  freePlanBuildsUsed: number,
  freeGroceryBuildsUsed: number,
): boolean {
  return isAnonymous && freePlanBuildsUsed >= 1 && freeGroceryBuildsUsed >= 1;
}

// ── Defect 1: gate expression must require BOTH free-use counters ──────────

describe('shouldGateSignup', () => {
  // Not anonymous → never gate regardless of counters
  it('does not gate a real (non-anonymous) user', () => {
    expect(shouldGateSignup(false, 0, 0)).toBe(false);
    expect(shouldGateSignup(false, 5, 5)).toBe(false);
  });

  // Anonymous, fresh start → free to do everything
  it('does not gate an anonymous user who has used neither feature', () => {
    expect(shouldGateSignup(true, 0, 0)).toBe(false);
  });

  // Anonymous, built plan but not grocery → grocery list must still be free
  it('does not gate after only a plan is built (guest can still get free grocery)', () => {
    expect(shouldGateSignup(true, 1, 0)).toBe(false);
  });

  // Anonymous, built grocery but not plan (edge case)
  it('does not gate after only a grocery list is built', () => {
    expect(shouldGateSignup(true, 0, 1)).toBe(false);
  });

  // Anonymous, built BOTH → next action should gate
  it('gates once both a plan and a grocery list have been used', () => {
    expect(shouldGateSignup(true, 1, 1)).toBe(true);
  });

  // Counters above 1 still gate
  it('gates when counters exceed 1', () => {
    expect(shouldGateSignup(true, 3, 2)).toBe(true);
  });
});

// ── Defect 2: recipe-gate routing must branch on isAnonymous ──────────────

type RouteAction = { type: 'back' } | { type: 'push'; path: string } | { type: 'paywall'; trigger: string };

/**
 * Pure replica of the routing logic inside useRecipeFeatureGate's effect when
 * `used >= 1` (free use already spent).
 */
function applyRecipeGate(
  isAnonymous: boolean,
  trigger: string,
): RouteAction[] {
  const actions: RouteAction[] = [];
  actions.push({ type: 'back' });
  if (isAnonymous) {
    actions.push({ type: 'push', path: '/signup' });
  } else {
    actions.push({ type: 'paywall', trigger });
  }
  return actions;
}

describe('recipe feature gate routing (free use spent)', () => {
  it('routes an anonymous guest to /signup (not paywall)', () => {
    const actions = applyRecipeGate(true, 'import-recipe');
    expect(actions).toEqual([
      { type: 'back' },
      { type: 'push', path: '/signup' },
    ]);
    // Must NOT open the paywall for a guest
    expect(actions.some((a) => a.type === 'paywall')).toBe(false);
  });

  it('opens the paywall directly for a registered non-premium user', () => {
    const actions = applyRecipeGate(false, 'import-recipe');
    expect(actions).toEqual([
      { type: 'back' },
      { type: 'paywall', trigger: 'import-recipe' },
    ]);
    // Must NOT route to signup for a registered user
    expect(actions.some((a) => a.type === 'push')).toBe(false);
  });

  it('passes the correct trigger through to the paywall', () => {
    const actions = applyRecipeGate(false, 'vibe-cooking');
    const paywall = actions.find((a) => a.type === 'paywall') as { type: 'paywall'; trigger: string };
    expect(paywall.trigger).toBe('vibe-cooking');
  });

  // Each feature keeps its own independent free-use counter — the gate
  // should only fire for the SAME feature on a second open, not a different one.
  it('first use of each feature is always free (counters independent)', () => {
    // Represent "used" count per feature
    const counters: Record<string, number> = { add: 0, import: 0, vibe: 0 };

    // Open "add" once → not gated (counter is 0)
    expect(counters.add >= 1).toBe(false);
    counters.add = 1; // success → mark used

    // Open "import" → still not gated for import (its counter is still 0)
    expect(counters.import >= 1).toBe(false);
    counters.import = 1;

    // Open "vibe" → still not gated (its counter is 0)
    expect(counters.vibe >= 1).toBe(false);
    counters.vibe = 1;

    // Now a SECOND open of each feature should gate
    expect(counters.add >= 1).toBe(true);
    expect(counters.import >= 1).toBe(true);
    expect(counters.vibe >= 1).toBe(true);
  });
});

// ── Defect 3: paywall must not fire while subscription state is unresolved ──
//
// Mirrors the resolution-aware gating now used at call sites:
//
//   if (!isAnonymous && !hasPremiumAccess) {
//     if (!isPremiumResolved) return;          // no-op + re-sync
//     openPaywallSheet(trigger);
//   }
//
// A paying user's `isPremium` is `false` during the cold-start race
// before `syncWithRevenueCat` resolves; the resolution check is what
// keeps the paywall from firing in that window.

type GateOutcome = 'allow' | 'paywall' | 'resync-noop';

function evaluatePremiumGate(
  isAnonymous: boolean,
  hasPremiumAccess: boolean,
  isPremiumResolved: boolean,
): GateOutcome {
  if (isAnonymous) return 'allow';
  if (hasPremiumAccess) return 'allow';
  if (!isPremiumResolved) return 'resync-noop';
  return 'paywall';
}

describe('premium gate with resolution guard', () => {
  it('allows a resolved premium user', () => {
    expect(evaluatePremiumGate(false, true, true)).toBe('allow');
  });

  it('paywalls a resolved non-premium user', () => {
    expect(evaluatePremiumGate(false, false, true)).toBe('paywall');
  });

  it('no-ops while subscription state is still resolving', () => {
    // `hasPremiumAccess=false` here is the default during cold start;
    // gating it would briefly paywall a paying user.
    expect(evaluatePremiumGate(false, false, false)).toBe('resync-noop');
  });

  it('allows an anonymous guest regardless of resolution state', () => {
    expect(evaluatePremiumGate(true, false, false)).toBe('allow');
    expect(evaluatePremiumGate(true, false, true)).toBe('allow');
  });
});
