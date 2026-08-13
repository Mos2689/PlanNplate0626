/**
 * Diagnostics allowlist guard.
 *
 * This is the test that keeps support requests from becoming a data-collection
 * back door. The payload attached to every bug report is assembled by
 * `buildDiagnostics`, so asserting that its output contains ONLY the keys
 * listed here means a new field cannot be added without someone deliberately
 * editing this file — which is exactly the review moment we want.
 *
 * The failing direction matters: the test fails on *unexpected* keys, not just
 * missing ones. A test that only checked for required keys would happily let
 * `userEmail` or `recentRecipes` slip in alongside them.
 */

import {
  buildDiagnostics,
  describeDiagnostics,
  sanitiseFailures,
  sanitiseFeatureIds,
  MAX_RECENT_FAILURES,
  type DiagnosticsInput,
} from '../support/diagnostics-policy';

/** The complete set of keys permitted in a support diagnostics payload. */
const ALLOWED_KEYS = [
  'appVersion',
  'buildNumber',
  'platform',
  'osVersion',
  'deviceModel',
  'locale',
  'screen',
  'previousScreen',
  'online',
  'connectionType',
  'signedIn',
  'isPremium',
  'intent',
  'feature',
  'featureIds',
  'recentFailures',
  'capturedAt',
].sort();

const baseInput: DiagnosticsInput = {
  intent: 'bug',
  appVersion: '1.0.35',
  buildNumber: '60',
  platform: 'ios',
  osVersion: '18.2',
  deviceModel: 'iPhone 15 Pro',
  locale: 'en-AU',
  screen: '(tabs)/grocery',
  previousScreen: 'import-recipe',
  online: true,
  connectionType: 'wifi',
  signedIn: true,
  isPremium: false,
  feature: 'recipe-import',
  now: new Date('2026-08-14T02:00:00.000Z'),
};

describe('support diagnostics payload', () => {
  it('contains exactly the allowlisted keys — no more, no less', () => {
    const keys = Object.keys(buildDiagnostics(baseInput)).sort();
    expect(keys).toEqual(ALLOWED_KEYS);
  });

  it('keeps its shape when every optional input is absent', () => {
    // A cold start on a device where the native modules returned nothing must
    // still produce the same keys, or the admin console's fixed table breaks.
    const keys = Object.keys(buildDiagnostics({ intent: 'question' })).sort();
    expect(keys).toEqual(ALLOWED_KEYS);
  });

  it('substitutes "unknown" rather than empty strings for missing values', () => {
    const d = buildDiagnostics({ intent: 'idea' });
    expect(d.appVersion).toBe('unknown');
    expect(d.deviceModel).toBe('unknown');
    expect(d.screen).toBe('unknown');
    // Distinguishable from a value we read but which was genuinely empty.
    expect(d.appVersion).not.toBe('');
  });

  it('normalises an unrecognised platform instead of passing it through', () => {
    expect(buildDiagnostics({ ...baseInput, platform: 'windows' }).platform).toBe('unknown');
    expect(buildDiagnostics({ ...baseInput, platform: 'android' }).platform).toBe('android');
  });
});

describe('featureIds sanitisation', () => {
  it('keeps UUIDs', () => {
    const id = '3f1a9c2e-7b4d-4a10-9c3e-8f2b6d1a4e50';
    expect(sanitiseFeatureIds({ mealPlanId: id })).toEqual({ mealPlanId: id });
  });

  it('drops anything that is not a UUID', () => {
    // This is the leak the guard exists for: a caller reaching for the wrong
    // field and handing over a recipe name instead of a recipe id.
    expect(
      sanitiseFeatureIds({
        recipeId: "Mum's dal",
        importUrl: 'https://example.com/recipes/nanas-lamb-roast',
        email: 'someone@example.com',
        planId: 'plan-42',
      }),
    ).toEqual({});
  });

  it('drops non-UUID values while keeping valid siblings', () => {
    const id = '3f1a9c2e-7b4d-4a10-9c3e-8f2b6d1a4e50';
    expect(sanitiseFeatureIds({ planId: id, planName: 'Week of the 4th' })).toEqual({
      planId: id,
    });
  });

  it('returns an empty object for undefined input', () => {
    expect(sanitiseFeatureIds(undefined)).toEqual({});
  });
});

describe('failure ring sanitisation', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    at: '2026-08-14T01:00:00.000Z',
    category: 'import-failed',
    feature: 'recipe-import',
    ...over,
  });

  it('keeps only at, category and feature', () => {
    // The real ring entries carry `cause` (raw error text) and `context`
    // (arbitrary breadcrumbs). Neither may travel.
    const [safe] = sanitiseFailures([
      entry({
        cause: "TypeError: cannot read 'title' of undefined at https://user-blog.com/nanas-roast",
        context: { url: 'https://user-blog.com/nanas-roast', userId: 'abc' },
      }) as never,
    ]);

    expect(Object.keys(safe).sort()).toEqual(['at', 'category', 'feature']);
    expect(JSON.stringify(safe)).not.toContain('user-blog.com');
    expect(JSON.stringify(safe)).not.toContain('TypeError');
  });

  it(`caps the list at ${MAX_RECENT_FAILURES} and keeps the most recent`, () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      entry({ feature: `feature-${i}` }),
    );
    const safe = sanitiseFailures(many);

    expect(safe).toHaveLength(MAX_RECENT_FAILURES);
    // Newest last, matching the ring's own ordering.
    expect(safe[safe.length - 1].feature).toBe('feature-39');
  });

  it('handles an empty or missing ring', () => {
    expect(sanitiseFailures([])).toEqual([]);
    expect(sanitiseFailures(undefined)).toEqual([]);
  });
});

describe('the disclosure shown to the user', () => {
  it('is derived from the payload that actually gets sent', () => {
    const d = buildDiagnostics(baseInput);
    const lines = describeDiagnostics(d).join(' ');

    expect(lines).toContain('1.0.35');
    expect(lines).toContain('iPhone 15 Pro');
    expect(lines).toContain('(tabs)/grocery');
  });

  it('says offline rather than naming a connection that is not there', () => {
    const d = buildDiagnostics({ ...baseInput, online: false, connectionType: 'none' });
    expect(describeDiagnostics(d).join(' ')).toContain('offline');
  });
});
