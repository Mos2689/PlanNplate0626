// Share-flow analytics.
//
// Privacy rule, enforced by construction rather than by review: this module is
// the ONLY thing that builds share event properties, and it accepts a `host`,
// never a URL. A full shared URL can carry a private post id, a signed CDN
// token or a session parameter, and a caption is user content — neither is
// allowed anywhere near a sink.
//
// Firebase is a strict allowlist (lib/firebase-analytics-policy.ts), and none of
// these events are on it, so they resolve to `null` there and reach PostHog and
// the dev sink only. That's intentional: share events are product telemetry, not
// ad-conversion signals.

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { track } from '../analytics';
import type { ShareEntryPoint, ShareImportOutcome, ShareSourceType } from './types';
import { resultLabel } from './outcome';

export type ShareAnalyticsEvent =
  | 'recipe_share_target_opened'
  | 'recipe_share_payload_received'
  | 'recipe_share_url_detected'
  | 'recipe_share_import_started'
  | 'recipe_share_import_succeeded'
  | 'recipe_share_import_failed'
  | 'recipe_share_duplicate_detected'
  | 'recipe_share_cancelled'
  | 'recipe_share_auth_required'
  | 'recipe_share_opened_in_app';

/** Non-identifying context attached to every share event. */
export interface ShareEventContext {
  entryPoint: ShareEntryPoint;
  /** Hostname only — never the path, query or fragment. */
  host?: string;
  source?: ShareSourceType;
  /** True when the app was launched by this share rather than already running. */
  coldStart?: boolean;
  authState?: 'signed-in' | 'signed-out' | 'guest';
  durationMs?: number;
  result?: string;
  retryable?: boolean;
}

const osVersion = (): string =>
  Device.osVersion ?? (Platform.Version != null ? String(Platform.Version) : 'unknown');

export function trackShare(event: ShareAnalyticsEvent, ctx: ShareEventContext): void {
  track(event, {
    platform: Platform.OS,
    os_version: osVersion(),
    entry_point: ctx.entryPoint,
    source_domain: ctx.host,
    source: ctx.source,
    cold_start: ctx.coldStart,
    auth_state: ctx.authState,
    duration_ms: ctx.durationMs,
    result: ctx.result,
    retryable: ctx.retryable,
  });
}

/** Emit the terminal event for a completed share, whatever the outcome. */
export function trackShareOutcome(
  outcome: ShareImportOutcome,
  ctx: ShareEventContext,
): void {
  const props: ShareEventContext = { ...ctx, result: resultLabel(outcome) };

  switch (outcome.kind) {
    case 'saved':
      trackShare('recipe_share_import_succeeded', { ...props, durationMs: outcome.durationMs });
      return;
    case 'duplicate':
      trackShare('recipe_share_duplicate_detected', props);
      return;
    case 'auth-required':
      trackShare('recipe_share_auth_required', props);
      return;
    case 'gated':
    case 'already-processed':
      trackShare('recipe_share_cancelled', props);
      return;
    case 'failed':
      trackShare('recipe_share_import_failed', props);
      return;
  }
}
