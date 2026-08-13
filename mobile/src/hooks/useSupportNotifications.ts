// Turns a tapped support-reply notification into the right screen.
//
// Mounted once in RootLayoutNav, alongside useShareTarget and the deep-link
// effect, and for the same reason: it has to survive whatever screen the user
// happens to be on when the notification arrives.
//
// `support-reply` sends `data: { type: 'support_reply', threadId }`. Everything
// here is about getting from that payload to /help/<threadId> in all three
// launch states, without fighting the app's auth and onboarding gates.
//
// Three things it is careful about:
//
//   COLD START IS NOT AN EVENT. If the app was killed, no listener fires — the
//   tap that launched it is only readable via getLastNotificationResponseAsync.
//
//   THAT CALL IS STICKY. It returns the most recent response for as long as the
//   OS retains it, so a naive implementation re-opens the same thread on every
//   launch afterwards. The handled identifier is persisted and checked.
//
//   DON'T FIGHT THE GATES. The root layout redirects un-onboarded and
//   unauthenticated users to /onboarding and /signup. Pushing a thread into
//   that would just get bounced, so navigation waits until the app is somewhere
//   it can actually show it, then fires.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { areNotificationsAvailable } from '@/lib/notifications';
import { useAuthStore } from '@/lib/auth-store';
import { useMealPlanStore } from '@/lib/store';
import { swallow } from '@/lib/failure';
import { track } from '@/lib/analytics';

/** Identifier of the launch notification we've already acted on. */
const HANDLED_KEY = 'plannplate_handled_support_notification';

/** Screens where a support thread must not be pushed on top. */
const GATE_SEGMENTS = new Set([
  'login',
  'signup',
  'verify-otp',
  'reset-password',
  'onboarding',
]);

/**
 * Pull a thread id out of a notification response, or null.
 *
 * Validates the shape rather than trusting it: notification payloads are
 * remote input, and `router.push` with a malformed id would land on a broken
 * screen. Anything that isn't our own message type with a string id is ignored.
 */
function threadIdFrom(
  response: Notifications.NotificationResponse | null,
): string | null {
  const data = response?.notification?.request?.content?.data as
    | Record<string, unknown>
    | undefined;

  if (!data || data.type !== 'support_reply') return null;
  const threadId = data.threadId;
  return typeof threadId === 'string' && threadId.length > 0 ? threadId : null;
}

export function useSupportNotifications() {
  const router = useRouter();
  const segments = useSegments();

  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const storeHydrated = useMealPlanStore((s) => s._hasHydrated);
  const hasCompletedOnboarding = useMealPlanStore(
    (s) => s.preferences.hasCompletedOnboarding,
  );

  // Guards against a re-entrant push if the effect re-runs while navigating.
  const navigating = useRef(false);

  const queue = useCallback((threadId: string, source: 'cold_start' | 'tap') => {
    track('support_notification_opened', { source });
    setPendingThreadId(threadId);
  }, []);

  // ── Collect ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!areNotificationsAvailable()) return;

    let alive = true;

    // Cold start: the tap that launched the app.
    (async () => {
      try {
        const response = await Notifications.getLastNotificationResponseAsync();
        const threadId = threadIdFrom(response);
        if (!alive || !threadId || !response) return;

        // getLastNotificationResponseAsync keeps returning this same response
        // on subsequent launches. Without this check, one support reply would
        // hijack every cold start from then on.
        const identifier = response.notification.request.identifier;
        const handled = await AsyncStorage.getItem(HANDLED_KEY);
        if (handled === identifier) return;

        await AsyncStorage.setItem(HANDLED_KEY, identifier);
        if (alive) queue(threadId, 'cold_start');
      } catch (e) {
        swallow(e, 'could not read the launch notification', 'support-notification');
      }
    })();

    // Warm start and foreground taps.
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const threadId = threadIdFrom(response);
        if (threadId) queue(threadId, 'tap');
      },
    );

    return () => {
      alive = false;
      subscription.remove();
    };
  }, [queue]);

  // ── Navigate, once the app can actually show it ──────────────────────────
  useEffect(() => {
    if (!pendingThreadId || navigating.current) return;

    // Wait for the gates rather than racing them.
    if (!storeHydrated || !hasCompletedOnboarding || !isAuthenticated) return;

    // `typedRoutes` gives useSegments() a narrow tuple type, which doesn't
    // describe the nested route we need to inspect. Widen once, here.
    const path = segments as readonly string[];
    if (GATE_SEGMENTS.has(path[0])) return;

    // Already looking at this thread — the notification arrived while the user
    // was reading it. Clear the intent and leave them alone.
    if (path[0] === 'help' && path[1] === pendingThreadId) {
      setPendingThreadId(null);
      return;
    }

    navigating.current = true;
    const threadId = pendingThreadId;
    setPendingThreadId(null);

    router.push(`/help/${threadId}`);

    // Released on the next tick so a second notification tapped immediately
    // afterwards still routes.
    setTimeout(() => {
      navigating.current = false;
    }, 0);
  }, [
    pendingThreadId,
    storeHydrated,
    hasCompletedOnboarding,
    isAuthenticated,
    segments,
    router,
  ]);
}
