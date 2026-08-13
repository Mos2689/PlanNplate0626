// Support diagnostics — the PURE half, and the privacy boundary of the whole
// support system.
//
// Split from diagnostics.ts for the same reason onboarding-analytics-policy.ts
// is split from onboarding-analytics.ts: everything worth testing lives here,
// with no expo-constants, no expo-device, no NetInfo and no store in the import
// graph, so jest exercises it directly.
//
// PRIVACY RULE, enforced by construction rather than by review:
// this module builds its output field by field from a narrow input type. There
// is no object spread anywhere in it, and no `Record<string, unknown>` passes
// through untouched. Adding a field to the payload therefore requires editing
// BOTH `SupportDiagnostics` and `buildDiagnostics`, and the accompanying test
// fails on any key it doesn't already know about — so a field cannot be added
// quietly.
//
// What must never reach a support record:
//   • recipe titles, ingredients, instructions, dish names
//   • meal-plan or grocery-list contents
//   • the user's name, or any email other than the account they wrote from
//   • auth tokens, session ids, API keys
//   • precise location
//   • full URLs (hostname only — the same rule lib/share/analytics.ts follows,
//     because an import URL's path can identify a person's blog or profile)
//   • the `cause` strings from the failure ring buffer. Those are raw error
//     text: they carry ids, interpolated user input and occasionally a
//     transcript fragment. This module keeps the category and drops the cause
//     rather than attempting to scrub it — scrubbing is a guess, dropping is a
//     guarantee.

import type { SupportIntent } from './types';

/** How the ring buffer's entries look once stripped for support. */
export interface SafeFailureEntry {
  at: string;
  category: string;
  feature: string;
}

/**
 * The exact, complete shape of what gets attached to a support request.
 *
 * If you are reading this to find out "what does PlanNplate send when I report
 * a bug?", this type is the answer, and the in-app disclosure sheet renders
 * from the same source.
 */
export interface SupportDiagnostics {
  // ── Build ────────────────────────────────────────────────────────────────
  appVersion: string;
  buildNumber: string;
  platform: 'ios' | 'android' | 'web' | 'unknown';
  osVersion: string;
  deviceModel: string;
  locale: string;

  // ── Situation ────────────────────────────────────────────────────────────
  screen: string;
  previousScreen: string;
  online: boolean;
  connectionType: string;

  // ── Account (states, never identifiers beyond the user's own id) ─────────
  signedIn: boolean;
  isPremium: boolean;

  // ── Request ──────────────────────────────────────────────────────────────
  intent: SupportIntent;
  feature: string;
  featureIds: Record<string, string>;

  // ── Recent trouble ───────────────────────────────────────────────────────
  recentFailures: SafeFailureEntry[];

  capturedAt: string;
}

/**
 * The raw material `buildDiagnostics` is allowed to see.
 *
 * Note what is NOT declared here: there is no `user`, no `preferences`, no
 * `recipes`. The impure collector in diagnostics.ts cannot pass them in even by
 * accident, because this type would reject them.
 */
export interface DiagnosticsInput {
  appVersion?: string | null;
  buildNumber?: string | null;
  platform?: string | null;
  osVersion?: string | null;
  deviceModel?: string | null;
  locale?: string | null;
  screen?: string | null;
  previousScreen?: string | null;
  online?: boolean;
  connectionType?: string | null;
  signedIn?: boolean;
  isPremium?: boolean;
  intent: SupportIntent;
  feature?: string | null;
  featureIds?: Record<string, string>;
  /**
   * Entries from lib/failure/diagnostics.ts `recentFailures()`. Their `cause`
   * and `context` fields are deliberately not read.
   */
  failures?: readonly { at: string; category: string; feature: string }[];
  now?: Date;
}

/** How many recent failures travel with a report. Ten covers a session's worth
 *  of context without turning the payload into a log dump. */
export const MAX_RECENT_FAILURES = 10;

/** Fallback used wherever a native module returned nothing. Never an empty
 *  string, so a missing value is distinguishable from an unread one. */
const UNKNOWN = 'unknown';

const asString = (value: string | null | undefined): string =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : UNKNOWN;

function asPlatform(value: string | null | undefined): SupportDiagnostics['platform'] {
  return value === 'ios' || value === 'android' || value === 'web' ? value : 'unknown';
}

/**
 * A UUID, or nothing.
 *
 * `featureIds` is the one place a caller hands over data that came from the
 * app's own model, so it is the one place worth policing. Anything that isn't
 * shaped like a UUID is dropped rather than truncated — a recipe *name* would
 * survive truncation, and that's exactly the leak this guards.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sanitiseFeatureIds(input?: Record<string, string>): Record<string, string> {
  if (!input) return {};
  const out: Record<string, string> = {};
  for (const key of Object.keys(input).sort()) {
    const value = input[key];
    if (typeof value === 'string' && UUID_RE.test(value)) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Strip the failure ring down to the three fields that are safe to send.
 *
 * Built with explicit property reads, not a destructure-and-rest, so a future
 * field added to the ring entry can't ride along.
 */
export function sanitiseFailures(
  failures?: readonly { at: string; category: string; feature: string }[],
): SafeFailureEntry[] {
  if (!failures?.length) return [];
  return failures.slice(-MAX_RECENT_FAILURES).map((f) => ({
    at: asString(f.at),
    category: asString(f.category),
    feature: asString(f.feature),
  }));
}

/**
 * Build the diagnostics payload.
 *
 * Every field is assigned individually and every one is present in the output,
 * so the shape is stable across reports — which is what lets the admin console
 * render it as a fixed table rather than guessing at keys.
 */
export function buildDiagnostics(input: DiagnosticsInput): SupportDiagnostics {
  return {
    appVersion: asString(input.appVersion),
    buildNumber: asString(input.buildNumber),
    platform: asPlatform(input.platform),
    osVersion: asString(input.osVersion),
    deviceModel: asString(input.deviceModel),
    locale: asString(input.locale),

    screen: asString(input.screen),
    previousScreen: asString(input.previousScreen),
    online: input.online ?? true,
    connectionType: asString(input.connectionType),

    signedIn: input.signedIn ?? false,
    isPremium: input.isPremium ?? false,

    intent: input.intent,
    feature: asString(input.feature),
    featureIds: sanitiseFeatureIds(input.featureIds),

    recentFailures: sanitiseFailures(input.failures),

    capturedAt: (input.now ?? new Date()).toISOString(),
  };
}

/**
 * The human-readable version, for the "app details" disclosure in the composer.
 *
 * Derived from the same object that gets sent, so the list a user sees cannot
 * drift from the payload. That's the point: a hand-maintained list of "what we
 * collect" is a promise; a derived one is a fact.
 */
export function describeDiagnostics(d: SupportDiagnostics): string[] {
  const lines = [
    `App version ${d.appVersion} (${d.buildNumber})`,
    `${d.platform === 'ios' ? 'iOS' : d.platform === 'android' ? 'Android' : 'Device'} ${d.osVersion} · ${d.deviceModel}`,
    `Screen: ${d.screen}`,
    d.online ? `Connection: ${d.connectionType}` : 'Connection: offline',
    d.isPremium ? 'Subscription: Premium' : 'Subscription: free',
  ];
  if (d.recentFailures.length > 0) {
    lines.push(`Recent hiccups: ${d.recentFailures.length}`);
  }
  return lines;
}
