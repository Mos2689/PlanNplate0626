// The single place in the app that looks at a raw error.
//
// Everything else — screens, stores, components — deals only in `Failure`.
// Keeping the inspection here means there's exactly one file to update when a
// backend changes its error shape, and exactly one place that can leak.
//
// The substring matching below is inherited from the two hand-written mappers
// that already existed (lib/purchase-errors.ts and lib/social-auth-errors.ts).
// Those were correct in approach but scoped to one feature each; this
// generalises them. Both now delegate here.

import { copyFor } from './copy';
import { DEFAULT_SEVERITY, isRetryable } from './policy';
import type { Failure, FailureCategory, FailureSeverity } from './types';

export interface ClassifyContext {
  /** Product area — drives per-feature copy and diagnostics grouping. */
  feature: string;
  /** Force a category when the caller already knows (e.g. a 402 paywall gate). */
  category?: FailureCategory;
  /** Override the default severity for this category. */
  severity?: FailureSeverity;
  /** HTTP status, when the caller has one. Never shown to the user. */
  status?: number;
  /** Extra breadcrumbs for diagnostics. Never shown to the user. */
  context?: Record<string, unknown>;
}

/** Pull a lowercase message out of anything throwable, for matching only. */
function messageOf(cause: unknown): string {
  if (!cause) return '';
  if (typeof cause === 'string') return cause.toLowerCase();
  if (cause instanceof Error) return `${cause.name} ${cause.message}`.toLowerCase();
  if (typeof cause === 'object') {
    const c = cause as Record<string, unknown>;
    const parts = [c.message, c.error, c.code, c.name, c.details]
      .filter((p): p is string => typeof p === 'string');
    if (parts.length) return parts.join(' ').toLowerCase();
  }
  return '';
}

function has(haystack: string, ...needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/** Map an HTTP status to a category. Status itself never reaches the user. */
function fromStatus(status: number): FailureCategory | null {
  if (status === 401) return 'auth-expired';
  if (status === 403) return 'auth-denied';
  if (status === 402) return 'subscription-required';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 422 || status === 400) return 'validation';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'server-unavailable';
  return null;
}

/**
 * Decide which category a raw error belongs to.
 *
 * Order matters: the most specific and most actionable signals are checked
 * first, so a 401 wrapped in a network-sounding message still routes to
 * re-authentication rather than to a pointless retry.
 */
export function categorize(cause: unknown, ctx: ClassifyContext): FailureCategory {
  if (ctx.category) return ctx.category;

  if (typeof ctx.status === 'number') {
    const fromCode = fromStatus(ctx.status);
    if (fromCode) return fromCode;
  }

  const m = messageOf(cause);
  if (!m) return 'unknown';

  // Cancellation/abort reads as a timeout — from the user's side, the thing
  // they were waiting for didn't arrive.
  if (has(m, 'aborterror', 'aborted', 'timeout', 'timed out', 'etimedout')) return 'timeout';

  // React Native's fetch failure is a bare `TypeError: Network request failed`,
  // which is indistinguishable from being offline at this layer. The
  // connectivity store decides between `offline` and `poor-connection` when it
  // presents — see present.ts.
  if (has(m, 'network request failed', 'network error', 'failed to fetch', 'enotfound', 'econnrefused', 'econnreset', 'dns')) {
    return 'offline';
  }
  if (has(m, 'offline', 'no internet', 'unreachable')) return 'offline';

  if (has(m, 'jwt', 'session expired', 'not authenticated', 'invalid token', 'token expired', 'refresh_token')) {
    return 'auth-expired';
  }
  if (has(m, 'invalid login', 'invalid credentials', 'user not found', 'no user', 'wrong password', 'email not confirmed', 'not confirmed', 'access_denied', 'not authorized', 'unauthorized')) {
    return 'auth-denied';
  }

  if (has(m, 'rate limit', 'too many requests', 'quota', 'throttl')) return 'rate-limited';
  if (has(m, 'permission', 'denied by user', 'not granted')) return 'permission-denied';
  if (has(m, 'subscription', 'premium', 'entitlement')) return 'subscription-required';

  // Parsing sits above generic AI failures: a model that returned unreadable
  // output is a different recovery story (offer manual entry) from one that
  // couldn't answer at all (offer retry).
  if (has(m, 'json', 'unexpected token', 'parse', 'malformed', 'invalid response')) return 'ai-parsing';
  if (has(m, 'upload', 'multipart', 'formdata')) return 'upload-failed';
  if (has(m, 'image', 'photo', 'decode', 'manipulat')) return 'image-processing';
  if (has(m, 'scrape', 'extract', 'import')) return 'import-failed';
  if (has(m, 'completion', 'model', 'prompt', 'generation')) return 'ai-generation';

  if (has(m, 'not configured', 'missing api key', 'missing key', 'no api key')) return 'not-configured';
  if (has(m, 'validation', 'required', 'invalid input', 'must be')) return 'validation';
  if (has(m, 'server', 'internal', 'bad gateway', 'service unavailable')) return 'server-unavailable';

  return 'unknown';
}

/**
 * Turn anything throwable into a presentable `Failure`.
 *
 * This is the entry point every catch block should use. The raw `cause` is
 * attached for diagnostics but never contributes to the wording — `copyFor()`
 * supplies all of that from the category alone.
 */
export function classifyFailure(cause: unknown, ctx: ClassifyContext): Failure {
  const category = categorize(cause, ctx);
  const { title, body, action } = copyFor(category, ctx.feature);

  return {
    category,
    severity: ctx.severity ?? DEFAULT_SEVERITY[category],
    feature: ctx.feature,
    title,
    body,
    action,
    retryable: isRetryable(category),
    cause,
    context: ctx.status ? { ...ctx.context, status: ctx.status } : ctx.context,
  };
}

/**
 * Build a `Failure` for a category we already know, with no underlying error —
 * e.g. a paywall gate or a failed client-side validation.
 */
export function makeFailure(
  category: FailureCategory,
  ctx: Omit<ClassifyContext, 'category'>,
): Failure {
  return classifyFailure(undefined, { ...ctx, category });
}

/**
 * A field-level validation failure with its own wording.
 *
 * Validation is the one category whose copy is inherently local — "those
 * passwords don't match" can't live in a global catalogue keyed by category,
 * and a generic "please check the details above" is measurably less useful.
 *
 * CONSTRAINT: `title` and `body` must be written literals. Never pass a caught
 * error, an API response field, or anything derived from one — that would
 * reopen exactly the hole this system closes. Everything non-validation goes
 * through `classifyFailure`.
 */
export function validationFailure(
  title: string,
  body = 'Please update it and try again.',
  feature = 'form',
): Failure {
  const base = makeFailure('validation', { feature });
  return { ...base, title, body };
}
