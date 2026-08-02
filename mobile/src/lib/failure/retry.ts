// Retry orchestration.
//
// Two hard rules encoded here, both from the product brief:
//
//   1. Never auto-retry something that needs the user to act first. A wrong
//      password retried three times is three wrong passwords.
//   2. Never auto-retry a non-idempotent call. A "create recipe" that timed out
//      may well have succeeded server-side; retrying it silently duplicates
//      data. Mutations retry ONLY when the user taps the recovery action.
//
// The second rule is why `withRetry` takes an explicit `idempotent` flag rather
// than inferring anything.

import { classifyFailure, type ClassifyContext } from './classify';
import { backoffDelayMs, maxAttemptsFor } from './policy';
import type { Failure } from './types';

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

export interface RetryOptions extends ClassifyContext {
  /**
   * Whether re-running `fn` is safe. Reads are idempotent; writes usually are
   * not. Non-idempotent operations get exactly one attempt — the user can still
   * retry deliberately via the failure's action.
   */
  idempotent?: boolean;
  /** Abort in-flight work (screen unmounted, user navigated away). */
  signal?: AbortSignal;
  /** Called before each retry, so callers can surface "Trying again…". */
  onRetry?: (attempt: number, failure: Failure) => void;
}

/**
 * Run `fn`, retrying transient failures according to the category policy.
 *
 * Throws the final classified `Failure` when every attempt is exhausted, so
 * callers can `catch (f)` and hand it straight to `presentFailure`.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { idempotent = false, signal, onRetry, ...ctx } = options;
  let attempt = 0;
  let lastFailure: Failure | undefined;

  for (;;) {
    attempt++;
    try {
      return await fn(attempt);
    } catch (cause) {
      // An abort is a deliberate cancellation, not a failure to report.
      if (cause instanceof Error && cause.name === 'AbortError') throw cause;

      const failure = classifyFailure(cause, ctx);
      failure.attempt = attempt;
      lastFailure = failure;

      const allowed = idempotent ? maxAttemptsFor(failure.category) : 1;
      if (!failure.retryable || attempt >= allowed) break;

      onRetry?.(attempt, failure);
      await sleep(backoffDelayMs(attempt), signal);
    }
  }

  throw lastFailure;
}

/**
 * Race a promise against a deadline so nothing can hang forever — the brief's
 * "no endless spinners" requirement. On expiry the result is a `timeout`
 * failure with real recovery copy, not a spinner that never resolves.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  ctx: ClassifyContext,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } catch (cause) {
    if (controller.signal.aborted) {
      throw classifyFailure(cause, { ...ctx, category: 'timeout' });
    }
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}
