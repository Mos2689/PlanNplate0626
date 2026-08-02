// Per-category behaviour: how loud, how retryable, how many attempts.
//
// Split out from classify.ts and retry.ts so there is exactly one table to read
// when asking "what does the app do when X happens?" — and so adding a category
// to `FailureCategory` produces a compile error here until it's been answered.

import type { FailureCategory, FailureSeverity } from './types';

/**
 * How much of the user's attention each category deserves by default.
 *
 * The bias is deliberately quiet. A background sync hiccup that resolves itself
 * should never take over the screen; only failures that genuinely stop the user
 * are `blocking`.
 */
export const DEFAULT_SEVERITY: Record<FailureCategory, FailureSeverity> = {
  offline: 'warning',           // persistent banner while it lasts
  'poor-connection': 'info',
  timeout: 'warning',
  'server-unavailable': 'warning',

  'auth-expired': 'blocking',   // nothing else works until resolved
  'auth-denied': 'info',        // inline on the form, usually
  validation: 'info',

  'upload-failed': 'warning',
  'image-processing': 'warning',
  'ai-generation': 'blocking',  // the user asked for this and is waiting
  'ai-parsing': 'blocking',
  'import-failed': 'blocking',

  'permission-denied': 'warning',
  'subscription-required': 'blocking',
  'rate-limited': 'warning',

  'sync-failed': 'info',        // data is safe locally — don't alarm
  'not-configured': 'warning',
  unknown: 'warning',
};

/**
 * Categories that must NOT auto-retry, because retrying can't succeed without
 * the user doing something first. Hammering these wastes battery and network
 * and makes the app feel stuck.
 */
const NEVER_AUTO_RETRY: ReadonlySet<FailureCategory> = new Set<FailureCategory>([
  'validation',
  'auth-expired',
  'auth-denied',
  'subscription-required',
  'permission-denied',
  'rate-limited',        // retrying is precisely what triggered this
  'not-configured',      // a build/config problem; retrying can't fix it
  'import-failed',       // needs a different URL or manual entry
  'image-processing',    // needs a different photo
]);

export function isRetryable(category: FailureCategory): boolean {
  return !NEVER_AUTO_RETRY.has(category);
}

/**
 * Maximum automatic attempts per category (the initial try plus retries).
 * Anything not listed gets `DEFAULT_MAX_ATTEMPTS`.
 *
 * Transient network trouble gets the most patience; anything where the server
 * actively said "no" gets the least.
 */
const MAX_ATTEMPTS: Partial<Record<FailureCategory, number>> = {
  offline: 1,               // pointless until connectivity returns — see retry.ts
  'poor-connection': 4,
  timeout: 3,
  'server-unavailable': 3,
  'sync-failed': 3,
  'upload-failed': 2,
  'ai-generation': 2,       // each attempt is slow and expensive
  'ai-parsing': 2,
  unknown: 2,
};

const DEFAULT_MAX_ATTEMPTS = 2;

export function maxAttemptsFor(category: FailureCategory): number {
  if (!isRetryable(category)) return 1;
  return MAX_ATTEMPTS[category] ?? DEFAULT_MAX_ATTEMPTS;
}

/**
 * Exponential backoff with full jitter.
 *
 * Jitter matters here: without it, every client that lost connection at the
 * same moment retries in lockstep and stampedes the edge functions the instant
 * they recover.
 */
export function backoffDelayMs(attempt: number, baseMs = 500, capMs = 8000): number {
  const exponential = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.round(Math.random() * exponential);
}
