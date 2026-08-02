// The failure model — the vocabulary every other file in this folder speaks.
//
// The single most important rule lives here: a `Failure` carries the raw error
// in `cause`, typed `unknown`, and NOTHING in the UI layer is allowed to read
// it. User-facing wording comes only from `copy.ts`, keyed by category. That's
// what stops an exception string, a stack trace or an HTTP status from reaching
// a screen — which is exactly what used to happen in ErrorBoundary and
// api-router before this system existed.

/**
 * Every way the app can fail, from the user's point of view — not the
 * system's. Two different exceptions that mean the same thing to a person
 * share a category (a DNS failure and a dropped socket are both `offline`).
 *
 * Adding a category here is the ONLY step needed to introduce a new failure
 * mode: `copy.ts` and `retry.ts` are keyed by this union, so TypeScript will
 * refuse to compile until wording and a retry policy exist for it.
 */
export type FailureCategory =
  // ── Connectivity ──────────────────────────────────────────────────────
  | 'offline'              // no connection at all
  | 'poor-connection'      // connected, but requests keep failing
  | 'timeout'              // request exceeded its budget
  | 'server-unavailable'   // we reached the server and it couldn't answer
  // ── Identity ──────────────────────────────────────────────────────────
  | 'auth-expired'         // session no longer valid — needs sign-in
  | 'auth-denied'          // credentials rejected, or not permitted
  | 'validation'           // the input itself needs changing
  // ── Content pipelines ─────────────────────────────────────────────────
  | 'upload-failed'
  | 'image-processing'
  | 'ai-generation'        // the model couldn't produce a usable result
  | 'ai-parsing'           // it produced something we couldn't read
  | 'import-failed'        // couldn't read a recipe from a URL/photo/text
  // ── Access ────────────────────────────────────────────────────────────
  | 'permission-denied'    // OS permission (camera, mic, photos, notifications)
  | 'subscription-required'
  | 'rate-limited'
  // ── Background ────────────────────────────────────────────────────────
  | 'sync-failed'
  | 'not-configured'       // a required service isn't set up in this build
  | 'unknown';

/**
 * How loudly a failure should interrupt.
 *
 *   silent   — the user doesn't need to know; log and move on. Reserved for
 *              genuinely ignorable background work (a missed prefetch, an
 *              analytics flush). Must still be reported for diagnostics.
 *   info     — worth a glance, doesn't block. Toast.
 *   warning  — the current surface is degraded. Banner.
 *   blocking — the user cannot continue without deciding something. Dialog.
 */
export type FailureSeverity = 'silent' | 'info' | 'warning' | 'blocking';

/**
 * The recovery affordance offered alongside the message. Chosen per failure so
 * the user is never left at a dead end — the brief's core requirement.
 *
 * `dismiss` is the only option that offers no forward path, and is reserved for
 * failures where the surrounding screen is already fully usable.
 */
export type FailureActionKind =
  | 'retry'
  | 'reconnect'
  | 'sign-in'
  | 'upgrade'
  | 'open-settings'
  | 'manual-entry'
  | 'choose-another-photo'
  | 'continue-editing'
  | 'go-home'
  | 'contact-support'
  | 'dismiss';

export interface FailureAction {
  kind: FailureActionKind;
  /** Button text. Comes from `copy.ts`; never assembled at the call site. */
  label: string;
}

/**
 * A classified, presentable failure.
 *
 * Construct these with `classifyFailure()` rather than by hand, so the category
 * and retry policy stay consistent with everything else in the app.
 */
export interface Failure {
  category: FailureCategory;
  severity: FailureSeverity;
  /**
   * Product area, for diagnostics and per-feature copy overrides.
   * e.g. 'recipe-generation', 'grocery-sync', 'auth', 'recipe-import'.
   */
  feature: string;
  /** Headline. Already user-safe — sourced from `copy.ts`. */
  title: string;
  /** Supporting sentence. Already user-safe. */
  body: string;
  /** What the user can do next. */
  action: FailureAction;
  /** Whether an automatic retry is permitted for this category. */
  retryable: boolean;
  /**
   * The original error. DIAGNOSTICS ONLY — never render this, never
   * string-interpolate it into anything the user can see. Typed `unknown`
   * deliberately: reading it requires a narrowing cast, which makes an
   * accidental `{failure.cause}` in JSX a type error rather than a leak.
   */
  cause?: unknown;
  /** Structured breadcrumbs for the diagnostics sink. Never rendered. */
  context?: Record<string, unknown>;
  /** How many retries have been attempted so far. Set by `retry.ts`. */
  attempt?: number;
}

/**
 * Result type for infrastructure (`lib/`) functions.
 *
 * The convention this codebase follows: modules under `lib/` classify and
 * RETURN failures; screens under `app/` and `components/` present them. That
 * split is what stops every internal hiccup becoming a user-facing toast.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; failure: Failure };

export const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
export const err = <T,>(failure: Failure): Result<T> => ({ ok: false, failure });

/** Narrowing helper so callers can `if (isFailure(r)) return r;`. */
export function isFailure<T>(r: Result<T>): r is { ok: false; failure: Failure } {
  return !r.ok;
}
