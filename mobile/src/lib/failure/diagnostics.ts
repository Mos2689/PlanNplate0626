// Developer-facing capture. The counterpart to copy.ts: everything the user
// must NOT see goes here, and nothing here is ever rendered.
//
// The app has no crash reporter (no Sentry/Bugsnag/Crashlytics) — only PostHog
// and Firebase Analytics via lib/analytics.ts. So this rides on the existing
// `track()` multi-sink rather than adding a vendor. That gives good aggregate
// signal (which categories, which features, whether users recover) but weaker
// stack-trace grouping than a real crash reporter would. If exception-level
// diagnosis becomes necessary, this is the single file that would change.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { track } from '../analytics';
import type { Failure } from './types';

/** Serialise a cause for logging. Truncated, and never returned to the UI. */
function describeCause(cause: unknown): string {
  if (!cause) return 'none';
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
  if (typeof cause === 'string') return cause;
  try {
    return JSON.stringify(cause).slice(0, 500);
  } catch {
    return 'unserialisable';
  }
}

/**
 * A stable-ish grouping key so repeated instances of the same underlying
 * problem aggregate in analytics. Deliberately coarse — category + feature +
 * the error name — because the message often contains ids and timestamps that
 * would fragment the grouping.
 */
function fingerprint(failure: Failure): string {
  const name =
    failure.cause instanceof Error ? failure.cause.name : typeof failure.cause;
  return `${failure.feature}:${failure.category}:${name}`;
}

// Bounded in-memory log. Survives navigation, not restarts. Lets support ask a
// user to send recent diagnostics without shipping logs off-device by default.
interface LogEntry {
  at: string;
  category: string;
  feature: string;
  cause: string;
  context?: Record<string, unknown>;
}
const RING_SIZE = 50;
const ring: LogEntry[] = [];

function pushRing(entry: LogEntry) {
  ring.push(entry);
  if (ring.length > RING_SIZE) ring.shift();
}

/** Recent failures, newest last. For a support-email attachment. */
export function recentFailures(): readonly LogEntry[] {
  return ring;
}

let currentScreen = 'unknown';
let previousScreen = 'unknown';
/** Called from the root layout's segment tracking so failures know where they happened. */
export function setCurrentScreen(screen: string) {
  if (screen === currentScreen) return;
  previousScreen = currentScreen;
  currentScreen = screen;
}

/** Where the user is now. Read by the support diagnostics collector. */
export function currentScreenName(): string {
  return currentScreen;
}

/**
 * Where the user was immediately before.
 *
 * Worth more than the current screen for support: a user reports "it broke"
 * from wherever they landed, and the screen they came FROM is usually where
 * the problem actually is.
 */
export function previousScreenName(): string {
  return previousScreen;
}

/**
 * How many of the last `window` failures share this fingerprint.
 *
 * Drives the "persistent" tier of the error hierarchy: support is offered on
 * the SECOND occurrence of the same problem, never the first, because most
 * failures are transient and the retry works. Offering help immediately would
 * make the app feel fragile.
 */
export function consecutiveFailures(fingerprintKey: string, window = 6): number {
  let count = 0;
  for (let i = ring.length - 1; i >= 0 && ring.length - i <= window; i -= 1) {
    const entry = ring[i];
    if (`${entry.feature}:${entry.category}` === fingerprintKey) count += 1;
  }
  return count;
}

/** The coarse grouping key used by `consecutiveFailures`. */
export function failureKey(failure: Pick<Failure, 'feature' | 'category'>): string {
  return `${failure.feature}:${failure.category}`;
}

/**
 * Record a failure for developers. Safe to call for every failure including
 * `silent` ones — that's the point, so silently-degraded paths are still
 * visible in aggregate.
 */
export function reportFailure(failure: Failure): void {
  const causeText = describeCause(failure.cause);

  const entry: LogEntry = {
    at: new Date().toISOString(),
    category: failure.category,
    feature: failure.feature,
    cause: causeText,
    context: failure.context,
  };
  pushRing(entry);

  if (__DEV__) {
    console.error(
      `[Failure] ${failure.feature} · ${failure.category} · attempt ${failure.attempt ?? 1}`,
      causeText,
      failure.context ?? '',
      failure.cause instanceof Error ? failure.cause.stack : '',
    );
  }

  // Aggregate signal. Note there is deliberately no raw message here — event
  // properties end up in dashboards that shouldn't hold arbitrary error text.
  track('app_failure', {
    category: failure.category,
    feature: failure.feature,
    severity: failure.severity,
    screen: currentScreen,
    attempt: failure.attempt ?? 1,
    retryable: failure.retryable,
    fingerprint: fingerprint(failure),
    platform: Platform.OS,
    app_version: Constants.expoConfig?.version ?? 'unknown',
  });
}

/**
 * Record that a user recovered from a failure (retry succeeded, or they took
 * the offered action). This is the metric that says whether the recovery paths
 * actually work, as opposed to just existing.
 */
export function reportRecovery(failure: Failure, via: 'retry' | 'action'): void {
  track('app_failure_recovered', {
    category: failure.category,
    feature: failure.feature,
    via,
    attempt: failure.attempt ?? 1,
  });
}

/** Record that a user dismissed or abandoned a failure without recovering. */
export function reportAbandon(failure: Failure): void {
  track('app_failure_abandoned', {
    category: failure.category,
    feature: failure.feature,
    attempt: failure.attempt ?? 1,
  });
}

/**
 * Explicitly ignore a failure. Use INSTEAD of a bare `catch {}` so that
 * "we chose not to care about this" is visible in code review and still shows
 * up in diagnostics. Every argument-less catch in the codebase should become
 * one of these with a written reason.
 */
export function swallow(cause: unknown, reason: string, feature = 'background'): void {
  if (__DEV__) {
    console.warn(`[Failure:ignored] ${feature} — ${reason}`, describeCause(cause));
  }
  pushRing({
    at: new Date().toISOString(),
    category: 'ignored',
    feature,
    cause: describeCause(cause),
    context: { reason },
  });
}
