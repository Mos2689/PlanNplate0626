// Share failure → `Failure` mapping.
//
// One table, three consumers: the wording the user reads, the retry affordance
// they're offered, and the analytics bucket the event lands in. Keeping them in
// a single exhaustive switch is what stops the three drifting — the previous
// generation of this problem (nine different error strings for the same
// backend condition) is documented at the top of lib/api-router.ts.
//
// `feature` keys here MUST have a matching entry in lib/failure/copy.ts, or the
// user silently falls back to generic category wording. `share-outcome-map.test.ts`
// asserts the mapping is total and that every key resolves to real copy.

// Reaching past lib/failure's barrel is deliberate, and the exception its own
// header anticipates: `index.ts` re-exports `connectivity.ts`, which imports
// NetInfo, which cannot load outside React Native. This module has to stay
// loadable in the node test environment, so it takes the one function it needs
// from the file that defines it. `classify.ts` depends only on copy, policy and
// types — all pure. The existing failure tests reach in the same way.
import { makeFailure } from '../failure/classify';
import type { Failure, FailureCategory } from '../failure/types';
import type { IngestOutcome, ShareFailureReason, ShareImportOutcome } from './types';

/** Which `copy.ts` entry speaks for this reason. */
export function featureKeyFor(reason: ShareFailureReason): string {
  switch (reason) {
    case 'no-url':
    case 'payload-too-large':
      return 'recipe-share';
    case 'unsupported-scheme':
    case 'blocked-host':
      return 'recipe-share-unsupported';
    default:
      return 'recipe-share';
  }
}

/** Which failure category this reason belongs to. */
export function categoryFor(reason: ShareFailureReason): FailureCategory {
  switch (reason) {
    case 'no-url':
    case 'payload-too-large':
    case 'unsupported-scheme':
    case 'blocked-host':
      return 'validation';
    case 'offline':
      return 'offline';
    case 'timeout':
      return 'timeout';
    case 'inaccessible':
      return 'import-failed';
    case 'rate-limited':
      return 'rate-limited';
    case 'unknown':
      return 'unknown';
  }
}

/**
 * Should the pending link survive this failure?
 *
 * The rule is "could trying again plausibly work?" — a dropped connection keeps
 * the link so the user can retry without going back to Instagram; a
 * `javascript:` URL will never import, and holding it would mean re-prompting
 * about it every time the app opens.
 */
export function shouldRetainPendingOn(reason: ShareFailureReason): boolean {
  switch (reason) {
    case 'offline':
    case 'timeout':
    case 'rate-limited':
    case 'unknown':
      return true;
    case 'no-url':
    case 'payload-too-large':
    case 'unsupported-scheme':
    case 'blocked-host':
    case 'inaccessible':
      return false;
  }
}

/** Build the presentable failure for a reason. Wording comes from copy.ts. */
export function shareFailure(
  reason: ShareFailureReason,
  context?: Record<string, unknown>,
): Failure {
  return makeFailure(categoryFor(reason), {
    feature: featureKeyFor(reason),
    context: { ...context, shareReason: reason },
  });
}

/** Translate an ingestion rejection into a share failure reason. */
export function reasonForIngest(
  outcome: Exclude<IngestOutcome, { kind: 'ok' }>,
): ShareFailureReason {
  switch (outcome.kind) {
    case 'no-url':
      return 'no-url';
    case 'unsupported-scheme':
      return 'unsupported-scheme';
    case 'blocked-host':
      return 'blocked-host';
    case 'payload-too-large':
      return 'payload-too-large';
  }
}

/**
 * Map a classified `Failure` from the import pipeline back onto a share reason.
 *
 * The importer already classifies its own errors (api-router returns a typed
 * `Failure`), so this is a narrowing rather than a re-classification — we only
 * decide which of the share-specific messages fits best.
 */
export function reasonForFailure(failure: Failure): ShareFailureReason {
  switch (failure.category) {
    case 'offline':
    case 'poor-connection':
      return 'offline';
    case 'timeout':
      return 'timeout';
    case 'rate-limited':
      return 'rate-limited';
    case 'import-failed':
    case 'ai-parsing':
    case 'ai-generation':
    case 'validation':
      // Everything the parser couldn't read presents as "we couldn't access
      // this recipe" — the honest description of a private, deleted or
      // login-walled post, which is the overwhelmingly common cause.
      return 'inaccessible';
    case 'server-unavailable':
    case 'not-configured':
    case 'sync-failed':
    case 'upload-failed':
    case 'image-processing':
    case 'permission-denied':
    case 'subscription-required':
    case 'auth-expired':
    case 'auth-denied':
    case 'unknown':
      return 'unknown';
  }
}

/** The analytics `result` bucket for an outcome. Never includes user content. */
export function resultLabel(outcome: ShareImportOutcome): string {
  return outcome.kind === 'failed' ? `failed:${outcome.reason}` : outcome.kind;
}
