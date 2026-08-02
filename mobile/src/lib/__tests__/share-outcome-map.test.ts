// Every way a share can fail has to arrive somewhere sensible.
//
// The brief's requirement is that each failure maps to a typed reason, a safe
// message, a retryability, an analytics bucket and a decision about whether the
// link is kept. Those live in four small functions, and the risk is not that
// one of them is wrong today — it's that a new reason gets added later and only
// three of the four get updated. So these tests walk the full list of reasons
// and assert each function answers for all of them.

import {
  categoryFor,
  featureKeyFor,
  reasonForFailure,
  reasonForIngest,
  resultLabel,
  shareFailure,
  shouldRetainPendingOn,
} from '../share/outcome';
import { CATEGORY_COPY, FEATURE_COPY, copyFor } from '../failure/copy';
import { makeFailure } from '../failure/classify';
import type { FailureCategory } from '../failure/types';
import type { ShareFailureReason } from '../share/types';

const ALL_REASONS: ShareFailureReason[] = [
  'no-url',
  'unsupported-scheme',
  'blocked-host',
  'payload-too-large',
  'offline',
  'timeout',
  'inaccessible',
  'rate-limited',
  'unknown',
];

describe('every share failure has somewhere to land', () => {
  it.each(ALL_REASONS)('%s produces a complete, presentable failure', (reason) => {
    const failure = shareFailure(reason);

    expect(failure.title.trim()).not.toHaveLength(0);
    expect(failure.body.trim()).not.toHaveLength(0);
    expect(failure.action.label.trim()).not.toHaveLength(0);
    expect(typeof failure.retryable).toBe('boolean');
    expect(failure.severity).toBeDefined();
  });

  it.each(ALL_REASONS)('%s has a defined keep-or-drop decision', (reason) => {
    expect(typeof shouldRetainPendingOn(reason)).toBe('boolean');
  });

  it.each(ALL_REASONS)('%s carries its reason for diagnostics but not for display', (reason) => {
    const failure = shareFailure(reason, { correlation: 'abc' });
    expect(failure.context).toMatchObject({ shareReason: reason, correlation: 'abc' });

    // The internal slugs are the hyphenated ones — those are identifiers and
    // must never surface. Single-word reasons like `offline` and `timeout` are
    // ordinary English and the copy is allowed to use them ("You're offline").
    if (reason.includes('-')) {
      expect(`${failure.title} ${failure.body}`.toLowerCase()).not.toContain(reason);
    }
  });

  it('resolves each feature key to copy that actually exists', () => {
    for (const reason of ALL_REASONS) {
      const key = `${featureKeyFor(reason)}:${categoryFor(reason)}`;
      const resolved = copyFor(categoryFor(reason), featureKeyFor(reason));
      // Either a share-specific override, or a deliberate fall-through to the
      // shared category wording (offline and timeout already read well).
      const override = FEATURE_COPY[key];
      expect(resolved).toEqual(override ?? CATEGORY_COPY[categoryFor(reason)]);
    }
  });
});

describe('the messages a person actually reads', () => {
  it('says the link could not be found when there was none', () => {
    expect(shareFailure('no-url').title).toBe('We couldn’t find a recipe link');
  });

  it('says the link is unsupported rather than blaming the network', () => {
    expect(shareFailure('unsupported-scheme').title).toBe('This link isn’t supported yet');
    expect(shareFailure('blocked-host').title).toBe('This link isn’t supported yet');
  });

  it('describes a private post honestly, without promising a retry will help', () => {
    const failure = shareFailure('inaccessible');
    expect(failure.title).toBe('We couldn’t access this recipe');
    expect(failure.body).toContain('private');
  });

  it('inherits the app-wide offline wording rather than inventing its own', () => {
    expect(shareFailure('offline').title).toBe(CATEGORY_COPY.offline.title);
  });

  it('never names a vendor, a status code or a runtime detail', () => {
    // The repo-wide guard in failure-copy.test.ts covers copy.ts itself; this
    // checks what the share flow actually renders, override or not.
    const banned =
      /supabase|openai|gpt|firebase|posthog|revenuecat|pexels|http|api|json|token|parse|stack|exception|undefined|null|\b[1-5]\d{2}\b/i;
    for (const reason of ALL_REASONS) {
      const f = shareFailure(reason);
      expect(`${f.title} ${f.body} ${f.action.label}`).not.toMatch(banned);
    }
  });
});

describe('retryability matches what the message offers', () => {
  it('keeps the link only for failures that could go differently next time', () => {
    expect(shouldRetainPendingOn('offline')).toBe(true);
    expect(shouldRetainPendingOn('timeout')).toBe(true);
    expect(shouldRetainPendingOn('rate-limited')).toBe(true);
    expect(shouldRetainPendingOn('unknown')).toBe(true);
  });

  it('lets go of failures that will always fail', () => {
    expect(shouldRetainPendingOn('no-url')).toBe(false);
    expect(shouldRetainPendingOn('unsupported-scheme')).toBe(false);
    expect(shouldRetainPendingOn('blocked-host')).toBe(false);
    expect(shouldRetainPendingOn('inaccessible')).toBe(false);
    expect(shouldRetainPendingOn('payload-too-large')).toBe(false);
  });
});

describe('translating between layers', () => {
  it('maps each ingestion refusal to its own reason', () => {
    expect(reasonForIngest({ kind: 'no-url' })).toBe('no-url');
    expect(reasonForIngest({ kind: 'unsupported-scheme' })).toBe('unsupported-scheme');
    expect(reasonForIngest({ kind: 'blocked-host' })).toBe('blocked-host');
    expect(reasonForIngest({ kind: 'payload-too-large' })).toBe('payload-too-large');
  });

  it('has an answer for every failure category the pipeline can produce', () => {
    const categories: FailureCategory[] = [
      'offline', 'poor-connection', 'timeout', 'server-unavailable',
      'auth-expired', 'auth-denied', 'validation',
      'upload-failed', 'image-processing', 'ai-generation', 'ai-parsing', 'import-failed',
      'permission-denied', 'subscription-required', 'rate-limited',
      'sync-failed', 'not-configured', 'unknown',
    ];
    for (const category of categories) {
      const reason = reasonForFailure(makeFailure(category, { feature: 'recipe-share' }));
      expect(ALL_REASONS).toContain(reason);
    }
  });

  it('reads a shaky connection as offline, which is what the user can act on', () => {
    expect(reasonForFailure(makeFailure('poor-connection', { feature: 'recipe-share' }))).toBe(
      'offline',
    );
  });

  it('reads anything the parser choked on as an inaccessible post', () => {
    for (const category of ['import-failed', 'ai-parsing', 'ai-generation', 'validation'] as const) {
      expect(reasonForFailure(makeFailure(category, { feature: 'recipe-share' }))).toBe(
        'inaccessible',
      );
    }
  });
});

describe('analytics buckets', () => {
  it('labels each outcome without leaking anything about the recipe', () => {
    expect(resultLabel({ kind: 'saved', recipeId: 'r', recipeName: 'Lamb', durationMs: 10 })).toBe(
      'saved',
    );
    expect(resultLabel({ kind: 'duplicate', recipeId: 'r', recipeName: 'Lamb' })).toBe('duplicate');
    expect(resultLabel({ kind: 'auth-required' })).toBe('auth-required');
    expect(resultLabel({ kind: 'gated' })).toBe('gated');
    expect(resultLabel({ kind: 'already-processed' })).toBe('already-processed');
    expect(resultLabel({ kind: 'failed', reason: 'inaccessible' })).toBe('failed:inaccessible');
  });

  it('never puts a recipe name in the label', () => {
    const label = resultLabel({
      kind: 'saved',
      recipeId: 'r',
      recipeName: 'Grandma’s Secret Lamb',
      durationMs: 1,
    });
    expect(label).not.toContain('Lamb');
  });
});
