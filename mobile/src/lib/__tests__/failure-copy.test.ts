/**
 * Copy purity guard.
 *
 * This is the test that keeps the whole failure system honest. Every string a
 * user can read during a failure lives in lib/failure/copy.ts, so asserting
 * that NOTHING in that file mentions internals means no leak can be
 * reintroduced without turning this red.
 *
 * The audit that motivated it found, live in the app:
 *   • the literal "Unknown error" rendered by ErrorBoundary
 *   • raw HTTP status codes from api-router (`HTTP ${status}`)
 *   • the database vendor named in "Supabase not configured. Please add your
 *     credentials in the ENV tab." — which also pointed at a UI that no longer
 *     exists
 *   • stack traces and React component stacks rendered on screen
 */

import { CATEGORY_COPY, FEATURE_COPY, copyFor } from '../failure/copy';
import type { FailureCopy } from '../failure/copy';

/** Terms that must never appear in anything a user reads. */
const BANNED: Array<{ pattern: RegExp; why: string }> = [
  { pattern: /\bsupabase\b/i, why: 'names the database vendor' },
  { pattern: /\bopenai\b|\bgpt\b|\bwhisper\b/i, why: 'names the AI provider' },
  { pattern: /\brevenuecat\b|\bposthog\b|\bfirebase\b|\bpexels\b/i, why: 'names a third-party SDK' },
  { pattern: /\bhttp\b|\bhttps\b|\bapi\b|\bendpoint\b|\bserver error\b/i, why: 'exposes transport detail' },
  { pattern: /\bsql\b|\bdatabase\b|\btable\b|\bquery\b|\bschema\b/i, why: 'exposes storage detail' },
  { pattern: /\bstack\b|\bexception\b|\btrace\b|\bnull\b|\bundefined\b|\bNaN\b/i, why: 'exposes runtime internals' },
  { pattern: /\bJSON\b|\bparse\b|\btoken\b|\bpayload\b/i, why: 'exposes serialisation detail' },
  { pattern: /unknown error/i, why: 'the literal banned string' },
  { pattern: /\b[1-5]\d{2}\b/, why: 'looks like an HTTP status code' },
  { pattern: /\bENV\b|\bconfig file\b|\benvironment variable\b/i, why: 'exposes build configuration' },
];

function allCopy(): Array<[string, FailureCopy]> {
  return [
    ...Object.entries(CATEGORY_COPY),
    ...Object.entries(FEATURE_COPY).filter((e): e is [string, FailureCopy] => Boolean(e[1])),
  ];
}

describe('failure copy is user-safe', () => {
  it.each(allCopy())('%s contains no internal terminology', (key, copy) => {
    const text = `${copy.title} ${copy.body} ${copy.action.label}`;
    for (const { pattern, why } of BANNED) {
      expect({ key, text, why, matched: pattern.test(text) }).toMatchObject({ matched: false });
    }
  });

  it('every category has a non-empty title, body and action label', () => {
    const empty = allCopy().filter(
      ([, c]) => !c.title.trim() || !c.body.trim() || !c.action.label.trim(),
    );
    expect(empty.map(([k]) => k)).toEqual([]);
  });

  it('titles stay short enough not to wrap awkwardly on a phone', () => {
    const tooLong = allCopy()
      .filter(([, c]) => c.title.length > 48)
      .map(([k, c]) => `${k} (${c.title.length})`);
    expect(tooLong).toEqual([]);
  });

  it('no title shouts or uses an exclamation mark', () => {
    // The brief: never dramatic, never alarming.
    const shouty = allCopy()
      .filter(([, c]) => /!/.test(c.title) || /^[A-Z\s]{6,}$/.test(c.title))
      .map(([k]) => k);
    expect(shouty).toEqual([]);
  });

  it('falls back to category copy when a feature has no override', () => {
    expect(copyFor('timeout', 'a-feature-with-no-override')).toEqual(CATEGORY_COPY.timeout);
  });

  it('prefers a feature override when one exists', () => {
    expect(copyFor('ai-generation', 'recipe-generation')).not.toEqual(
      CATEGORY_COPY['ai-generation'],
    );
  });
});
