// Collects incoming shares and gets the user to the right screen.
//
// Mounted once in RootLayoutNav, next to the existing deep-link effect. It is
// deliberately the only place that talks to the native module, so there is
// exactly one path from "the OS handed us something" to "the share screen is
// showing", on both platforms and in all three launch states.
//
// The two things it is careful about:
//
//   COLLECT BEFORE NAVIGATING. Reading the native queue is destructive — on iOS
//   the App Group file is truncated as it's read. So the payload is distilled
//   and persisted to `pendingShares` first, and only then does anything
//   navigate. If the app is killed between the two, the link is still there.
//
//   DON'T FIGHT THE GATES. The root layout redirects un-onboarded and
//   unauthenticated users to /signup and /onboarding. Pushing the share screen
//   into that would just get bounced, so the navigation waits until the app is
//   somewhere it can actually show it, and fires then — which is why sharing to
//   a freshly-installed PlanNplate still works: the link waits through signup
//   and onboarding and opens the moment they land.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import {
  addShareListener,
  getPendingShares,
  isContainerReachable,
  isShareTargetAvailable,
  wasLaunchedFromShare,
  type NativeSharePayload,
} from '../../modules/plannplate-share-target';
import { FEATURE_FLAGS } from '@/lib/feature-flags';
import { useMealPlanStore } from '@/lib/store';
import { pendingShares, type PendingShare } from '@/lib/share/pending-share';
import { ingestSharedPayload } from '@/lib/share/url-ingest';
import { reasonForIngest } from '@/lib/share/outcome';
import { trackShare } from '@/lib/share/analytics';
import type { ShareEntryPoint } from '@/lib/share/types';
import { swallow } from '@/lib/failure';

const ENTRY_POINT: ShareEntryPoint =
  Platform.OS === 'ios' ? 'share_extension' : 'share_intent';

/**
 * Turn a raw OS payload into the distilled record we store.
 *
 * Ingestion happens HERE rather than on the screen so the caption is discarded
 * at the earliest possible moment — only the link (or the reason there wasn't
 * one) is written to disk.
 */
export function distill(payload: NativeSharePayload, receivedAt: number): PendingShare {
  const outcome = ingestSharedPayload({
    id: payload.id,
    url: payload.url,
    text: payload.text,
    subject: payload.subject,
    capturedAt: payload.capturedAt,
    entryPoint: ENTRY_POINT,
  });

  const base = { id: payload.id, entryPoint: ENTRY_POINT, receivedAt };

  if (outcome.kind !== 'ok') {
    return { ...base, rejectedAs: reasonForIngest(outcome) };
  }

  return {
    ...base,
    url: outcome.url,
    canonicalKey: outcome.canonicalKey,
    host: outcome.host,
    source: outcome.source,
  };
}

export function useShareTarget(): void {
  const router = useRouter();
  const segments = useSegments();
  const storeHydrated = useMealPlanStore((s) => s._hasHydrated);
  const hasCompletedOnboarding = useMealPlanStore(
    (s) => s.preferences.hasCompletedOnboarding,
  );

  /** Ids we've already routed for this session — stops a re-render re-navigating. */
  const routed = useRef<Set<string>>(new Set());
  /**
   * Bumped every time a share lands. STATE, not a ref, and that distinction is
   * the whole reason this works.
   *
   * The navigation effect below can only run when React re-renders. Collection
   * finishes inside an async callback, so a ref set there is invisible: nothing
   * schedules a render, the effect never re-runs, and the share sits in storage
   * untouched. That is exactly the shape of tapping the share notification while
   * the app is still in memory — AppState fires, `drain` runs, and none of the
   * effect's other dependencies move. It appeared to work only when something
   * unrelated happened to re-render the root layout first (the RevenueCat
   * foreground sync landing, usually), which is why it failed intermittently
   * rather than always.
   *
   * A counter rather than a boolean: two shares in a row must produce two
   * signals, and re-setting `true` would be a no-op.
   */
  const [collectedAt, setCollectedAt] = useState(0);

  const collect = useCallback(async (payloads: NativeSharePayload[]) => {
    if (payloads.length === 0) return;
    const receivedAt = Date.now();

    // Only the most recent share is kept. Two links shared back to back before
    // the app opened is vanishingly rare, and quietly queueing the older one to
    // appear later would be more surprising than dropping it.
    const latest = payloads[payloads.length - 1];
    const distilled = distill(latest, receivedAt);

    trackShare('recipe_share_payload_received', {
      entryPoint: distilled.entryPoint,
      host: distilled.host,
      source: distilled.source,
      coldStart: Platform.OS === 'android' ? wasLaunchedFromShare() : false,
      result: distilled.rejectedAs ?? 'ok',
    });

    await pendingShares.put(distilled);
    // Written to disk BEFORE the signal, so the effect can never wake up to an
    // empty store.
    setCollectedAt(Date.now());
  }, []);

  const drain = useCallback(async () => {
    if (!FEATURE_FLAGS.shareToPlanNplate) return;

    // Both ways this can fail are SILENT: an unregistered native module returns
    // an empty list, and an App Group the profile doesn't grant makes
    // `containerURL` return nil rather than raise. From the user's side both
    // look identical — the extension says "Saved" and the recipe never arrives.
    // One line here separates them without another build cycle.
    if (!isShareTargetAvailable) {
      if (__DEV__) {
        console.warn(
          '[ShareTarget] Native module is NOT registered — shares will be ignored. ' +
            'The iOS pod did not link, or this build predates the module.',
        );
      }
      return;
    }

    if (Platform.OS === 'ios' && !isContainerReachable()) {
      if (__DEV__) {
        console.warn(
          '[ShareTarget] App Group container is NOT reachable from the app. ' +
            'The extension can write to it but the app cannot read it — enable the ' +
            'App Groups capability on the app’s App ID and regenerate the profile.',
        );
      }
      return;
    }

    try {
      const payloads = await getPendingShares();
      if (__DEV__) {
        console.log(`[ShareTarget] drained ${payloads.length} pending share(s)`);
      }
      await collect(payloads);
    } catch (error) {
      // Collecting shares is the least important thing happening at startup.
      // Whatever goes wrong here, the app still has to open.
      swallow(error, 'share collection is best-effort at startup', 'recipe-share');
    }
  }, [collect]);

  // Cold start, and every return to the foreground. The foreground pass is what
  // makes iOS work at all: an extension cannot wake the app, so this is the
  // moment a link shared while PlanNplate was closed gets picked up.
  useEffect(() => {
    if (!FEATURE_FLAGS.shareToPlanNplate) return;

    void drain();
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') void drain();
    });
    return () => subscription.remove();
  }, [drain]);

  // Android only: a share arriving at an app that's already running.
  useEffect(() => {
    if (!FEATURE_FLAGS.shareToPlanNplate || !isShareTargetAvailable) return;
    if (Platform.OS !== 'android') return;
    try {
      const subscription = addShareListener((payload) => {
        void collect([payload]);
      });
      return () => subscription.remove();
    } catch (error) {
      swallow(error, 'share listener is unavailable in this build', 'recipe-share');
      return undefined;
    }
  }, [collect]);

  // Navigate once the app is somewhere it can actually present the sheet.
  //
  // Runs on `collectedAt` (a share arrived) AND on the gate dependencies (the
  // app became ready). Either can be the later of the two — a cold start
  // launched from the notification usually collects before hydration finishes,
  // a warm foreground the other way round — and whichever lands second is what
  // triggers the navigation. `routed` makes the extra passes harmless.
  useEffect(() => {
    if (!FEATURE_FLAGS.shareToPlanNplate) return;
    if (collectedAt === 0) return;
    if (!storeHydrated || !hasCompletedOnboarding) return;
    if (segments[0] === 'share-import') return;

    let cancelled = false;
    void (async () => {
      const pending = await pendingShares.read();
      if (cancelled || !pending || routed.current.has(pending.id)) return;
      routed.current.add(pending.id);
      trackShare('recipe_share_target_opened', {
        entryPoint: pending.entryPoint,
        host: pending.host,
        source: pending.source,
      });
      router.push('/share-import');
    })();

    return () => {
      cancelled = true;
    };
  }, [collectedAt, storeHydrated, hasCompletedOnboarding, segments, router]);
}
