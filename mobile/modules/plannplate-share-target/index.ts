// The one door share payloads come through, on both platforms.
//
// The two platforms deliver a share in completely different shapes and the
// difference is not the app's business:
//
//   Android — the app process IS the share target. `MainActivity` receives an
//     ACTION_SEND intent, so the payload is read straight off the intent and the
//     extra is cleared immediately (an intent survives activity recreation, and
//     a rotation must not look like a second share).
//
//   iOS — a separate extension process captured the link, wrote it to the shared
//     App Group container and exited. Apple provides no sanctioned way for an
//     extension to launch its containing app, so the app collects whatever is
//     waiting when it next runs.
//
// Both arrive here as the same `SharePayload`, already carrying the id that
// makes the whole flow idempotent (see lib/share/import-orchestrator.ts).

import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { EventSubscription } from 'expo-modules-core';

/** A payload exactly as the OS handed it over. All fields are untrusted. */
export interface NativeSharePayload {
  /** Minted natively at CAPTURE time — the idempotency key. */
  id: string;
  /** A `public.url` item / an intent extra that parsed as a URL. */
  url?: string;
  /** `public.plain-text` / `Intent.EXTRA_TEXT`. May be a caption around a link. */
  text?: string;
  /** `Intent.EXTRA_SUBJECT`, or the item's title on iOS. */
  subject?: string;
  /** Unix milliseconds, recorded natively when the share happened. */
  capturedAt: number;
}

type ShareTargetEvents = {
  /** Android only: a new ACTION_SEND arrived while the app was already running. */
  onShareReceived: (payload: NativeSharePayload) => void;
};

declare class PlanNplateShareTargetModule extends NativeModule<ShareTargetEvents> {
  /**
   * Everything waiting to be imported, oldest first, and clear it.
   *
   * Draining rather than peeking is the point: whatever this returns is now the
   * caller's responsibility, and a crash mid-import falls back to the pending
   * store (lib/share/pending-share.ts) rather than replaying from the OS.
   */
  getPendingShares(): Promise<NativeSharePayload[]>;
  /** Forget a specific payload without importing it — the user cancelled. */
  consumePendingShare(id: string): Promise<void>;
  /** Was this app launch caused by a share? Reported as `cold_start`. */
  wasLaunchedFromShare(): boolean;
  /**
   * iOS: can this process see the shared App Group container?
   *
   * False means the entitlement isn't granted by the provisioning profile —
   * which looks exactly like "no shares waiting", because the API returns nil
   * rather than raising. Always true on Android, which has no container.
   */
  isContainerReachable(): boolean;
}

/**
 * Resolved OPTIONALLY, and this is load-bearing.
 *
 * `requireNativeModule` THROWS when the module isn't registered, and it throws
 * at import time — which meant a share target that failed to link took down the
 * whole app at launch, before any error boundary existed to catch it. The root
 * layout imports this transitively, so the blast radius was "PlanNplate opens
 * and closes instantly", with nothing on screen to explain why.
 *
 * The optional variant returns null instead. Every accessor below degrades to
 * "there is nothing to share", which is exactly right: an app that cannot
 * receive shares should still be an app.
 *
 * Legitimately null in Expo Go, in a dev client built before this module
 * existed, and on any build where autolinking or the native target failed.
 */
const nativeModule = requireOptionalNativeModule<PlanNplateShareTargetModule>(
  'PlanNplateShareTarget',
);

if (__DEV__ && !nativeModule) {
  console.warn(
    '[ShareTarget] Native module unavailable — incoming shares will be ignored. ' +
      'Expected in Expo Go or a dev client built before this module was added; ' +
      'rebuild the app if you meant to test sharing.',
  );
}

/** True when this build can actually receive shares. */
export const isShareTargetAvailable = nativeModule != null;

export async function getPendingShares(): Promise<NativeSharePayload[]> {
  return nativeModule ? nativeModule.getPendingShares() : [];
}

export async function consumePendingShare(id: string): Promise<void> {
  await nativeModule?.consumePendingShare(id);
}

export function wasLaunchedFromShare(): boolean {
  return nativeModule?.wasLaunchedFromShare() ?? false;
}

export function isContainerReachable(): boolean {
  return nativeModule?.isContainerReachable() ?? false;
}

export function addShareListener(
  listener: (payload: NativeSharePayload) => void,
): EventSubscription {
  if (!nativeModule) {
    // A subscription that never fires, so callers don't need a null branch and
    // cleanup stays symmetrical.
    return { remove: () => {} } as EventSubscription;
  }
  return nativeModule.addListener('onShareReceived', listener);
}

export default nativeModule;
