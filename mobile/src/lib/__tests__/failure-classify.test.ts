/**
 * Classifier contract.
 *
 * One fixture per category the app can realistically produce, asserting the
 * category, whether it may auto-retry, and that nothing from the raw error
 * survives into user-facing text.
 *
 * The last assertion matters most: `cause` is retained for diagnostics, so a
 * regression that started interpolating it into `title`/`body` would be
 * invisible without it.
 */

import { categorize, classifyFailure, makeFailure, validationFailure } from '../failure/classify';
import { isRetryable, maxAttemptsFor } from '../failure/policy';

describe('categorize', () => {
  it('maps HTTP status codes', () => {
    const at = (status: number) => categorize(null, { feature: 'test', status });
    expect(at(401)).toBe('auth-expired');
    expect(at(403)).toBe('auth-denied');
    expect(at(402)).toBe('subscription-required');
    expect(at(408)).toBe('timeout');
    expect(at(429)).toBe('rate-limited');
    expect(at(500)).toBe('server-unavailable');
    expect(at(503)).toBe('server-unavailable');
  });

  it("maps React Native's bare fetch failure to offline", () => {
    // This is the literal error RN throws with no connection; it's also what
    // it throws on DNS failure, which is why presentFailure() refines it
    // against real connectivity before showing anything.
    const cause = new TypeError('Network request failed');
    expect(categorize(cause, { feature: 'test' })).toBe('offline');
  });

  it('maps an aborted request to timeout', () => {
    const cause = new Error('Aborted');
    cause.name = 'AbortError';
    expect(categorize(cause, { feature: 'test' })).toBe('timeout');
  });

  it('maps expired sessions', () => {
    expect(categorize(new Error('JWT expired'), { feature: 'test' })).toBe('auth-expired');
    expect(categorize(new Error('invalid login credentials'), { feature: 'test' })).toBe('auth-denied');
  });

  it('maps unreadable model output to ai-parsing, not ai-generation', () => {
    // Different recovery: parsing failures offer manual entry, generation
    // failures offer a retry.
    expect(categorize(new SyntaxError('Unexpected token < in JSON'), { feature: 'test' }))
      .toBe('ai-parsing');
  });

  it('reads Supabase-shaped error objects', () => {
    expect(categorize({ message: 'rate limit exceeded', code: '429' }, { feature: 'test' }))
      .toBe('rate-limited');
  });

  it('falls back to unknown rather than guessing', () => {
    expect(categorize(new Error('something very specific and unmatched'), { feature: 'test' }))
      .toBe('unknown');
    expect(categorize(undefined, { feature: 'test' })).toBe('unknown');
  });

  it('lets an explicit category win over inference', () => {
    expect(categorize(new TypeError('Network request failed'), {
      feature: 'test',
      category: 'subscription-required',
    })).toBe('subscription-required');
  });

  it('prefers status over message when both are present', () => {
    // A 401 wrapped in network-sounding text must still route to re-auth,
    // otherwise the user retries forever against a dead session.
    const cause = new Error('network problem while refreshing');
    expect(categorize(cause, { feature: 'test', status: 401 })).toBe('auth-expired');
  });
});

describe('retry policy', () => {
  it('never auto-retries anything needing user action', () => {
    const needsUser = ['validation', 'auth-expired', 'auth-denied', 'subscription-required',
                       'permission-denied', 'rate-limited'] as const;
    expect(needsUser.map((c) => [c, isRetryable(c), maxAttemptsFor(c)])).toEqual(
      needsUser.map((c) => [c, false, 1]),
    );
  });

  it('allows bounded retries for transient failures', () => {
    const transient = ['timeout', 'server-unavailable', 'poor-connection', 'sync-failed'] as const;
    expect(transient.map((c) => [c, isRetryable(c), maxAttemptsFor(c) > 1])).toEqual(
      transient.map((c) => [c, true, true]),
    );
  });

  it('keeps expensive AI retries tight', () => {
    expect(maxAttemptsFor('ai-generation')).toBeLessThanOrEqual(2);
  });
});

describe('classifyFailure', () => {
  it('keeps the raw cause out of user-facing text', () => {
    const secret = 'PostgrestError: relation "users" does not exist at 0x7f';
    const f = classifyFailure(new Error(secret), { feature: 'test' });
    expect(f.title).not.toContain(secret);
    expect(f.body).not.toContain(secret);
    expect(f.action.label).not.toContain(secret);
    // …but it survives for diagnostics.
    expect(f.cause).toBeInstanceOf(Error);
  });

  it('always produces presentable copy, even for an unmatched error', () => {
    const f = classifyFailure({ weird: true }, { feature: 'test' });
    expect(f.title.length).toBeGreaterThan(0);
    expect(f.body.length).toBeGreaterThan(0);
    expect(f.title.toLowerCase()).not.toContain('unknown error');
  });

  it('attaches status to context for diagnostics without exposing it', () => {
    const f = classifyFailure('boom', { feature: 'test', status: 503 });
    expect(f.context).toMatchObject({ status: 503 });
    expect(`${f.title} ${f.body}`).not.toContain('503');
  });

  it('makeFailure builds a category with no underlying error', () => {
    const f = makeFailure('subscription-required', { feature: 'paywall' });
    expect(f.category).toBe('subscription-required');
    expect(f.cause).toBeUndefined();
    expect(f.retryable).toBe(false);
  });

  it('validationFailure carries its own literal copy', () => {
    const f = validationFailure('Those passwords don’t match', 'Please re-enter them.', 'auth');
    expect(f.category).toBe('validation');
    expect(f.title).toBe('Those passwords don’t match');
    expect(f.retryable).toBe(false);
  });
});
