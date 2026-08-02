import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useMealPlanStore } from './store';

// CRITICAL (production launch safety): expo-notifications is a NATIVE module.
// If the running binary doesn't include it — e.g. an expo-updates OTA pushed
// this JS onto an older native build, or the app hasn't been rebuilt since the
// module was added — any call into it throws. Because this file is imported at
// startup (from _layout.tsx) and `setNotificationHandler` runs at module load,
// an unguarded throw here fails the whole root import and the app hangs on the
// splash forever (works in Expo Go, spins in TestFlight/App Store). So we detect
// availability once and make every entry point a safe no-op when it's missing.
const isNativeNotificationsAvailable = (() => {
  if (Platform.OS === 'web') return false;
  return (
    typeof (Notifications as { setNotificationHandler?: unknown }).setNotificationHandler ===
    'function'
  );
})();

// Set how notifications are handled when the app is in the foreground.
if (isNativeNotificationsAvailable) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        // SDK 54 (expo-notifications 0.32) split the deprecated `shouldShowAlert`
        // into `shouldShowBanner` (heads-up) + `shouldShowList` (notification centre).
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    console.warn('[notifications] setNotificationHandler unavailable:', e);
  }
}

export async function requestNotificationPermissions() {
  if (!isNativeNotificationsAvailable) return false;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (e) {
    console.warn('[notifications] requestNotificationPermissions failed:', e);
    return false;
  }
}

/**
 * Take down the "tap to add it" banner the iOS share extension posted.
 *
 * The extension is a separate process that ends the moment its sheet closes, so
 * it has no way to know the import later ran. Left alone, the banner sits in
 * Notification Center inviting a tap into work that is already done. Called once
 * the share screen is up, which is the point at which the notification has
 * served its only purpose — getting the user here.
 *
 * NOTE: `cancelAllNotifications` does NOT cover this. That cancels *scheduled*
 * notifications; this one has no trigger, so it is delivered immediately and is
 * only reachable through the dismiss API.
 *
 * The identifier format is fixed by targets/share/ShareNotification.swift.
 * Change one, change both.
 */
export async function dismissShareNotification(shareId: string) {
  if (!isNativeNotificationsAvailable) return;
  try {
    await Notifications.dismissNotificationAsync(`share-import.${shareId}`);
  } catch (e) {
    // Best-effort tidying. A stale banner is a blemish, not a failure, and it
    // must never be the reason an import doesn't happen.
    console.warn('[notifications] dismissShareNotification failed:', e);
  }
}

export async function cancelAllNotifications() {
  if (!isNativeNotificationsAvailable) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.warn('[notifications] cancelAllNotifications failed:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Meal-plan reminders (for ACTIVE users with a plan)
//
// Scheduled alongside the inactivity notifications when the app backgrounds:
//   • 8am  — morning heads-up of the day's plan (if anything is planned)
//   • 11am — lunch reminder (only if a lunch is planned + not yet cooked)
//   • 5pm  — dinner reminder (only if a dinner is planned + not yet cooked)
// All times are LOCAL: we build each Date from local Y/M/D + hour, so the OS
// fires it at that wall-clock time in the user's timezone. Any slot the user has
// already logged (cooked/skipped/swapped) is skipped.
// ─────────────────────────────────────────────────────────────────────────────

const localDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function scheduleMealNotificationAt(
  day: Date,
  hour: number,
  title: string,
  body: string,
) {
  const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0);
  // Skip anything in the past (or within the next minute) — can't fire it.
  if (when.getTime() <= Date.now() + 60_000) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { kind: 'meal-plan' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
  });
}

export async function scheduleMealPlanNotifications() {
  if (!isNativeNotificationsAvailable) return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    // Remove any meal-plan reminders we scheduled earlier so repeated calls don't
    // stack duplicates (identified by content.data.kind).
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if ((n.content?.data as { kind?: string } | undefined)?.kind === 'meal-plan') {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }

    const { mealSlots, recipes, cookingLogs } = useMealPlanStore.getState();

    const nameFor = (recipeId: string | null, custom?: string): string | null => {
      if (recipeId) {
        const r = recipes.find((x) => x.id === recipeId);
        if (r?.name) return r.name;
      }
      return custom?.trim() || null;
    };
    // Any log for a slot means the user has acted on it (cooked/skipped/swapped) —
    // don't remind them to cook it.
    const isResolved = (slotId: string) => cookingLogs.some((l) => l.slotId === slotId);
    const isPlanned = (s: { recipeId: string | null; customMealName?: string; id: string }) =>
      !!(s.recipeId || s.customMealName) && !isResolved(s.id);

    const now = new Date();
    const HORIZON_DAYS = 7;
    for (let i = 0; i < HORIZON_DAYS; i++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const key = localDateKey(day);
      const slots = mealSlots.filter((s) => (s.date || '').slice(0, 10) === key);
      if (slots.length === 0) continue;

      const lunch = slots.find((s) => s.mealType === 'lunch' && isPlanned(s));
      const dinner = slots.find((s) => s.mealType === 'dinner' && isPlanned(s));
      const anyPlanned = slots.some((s) => isPlanned(s));

      // Morning heads-up @ 8am
      if (anyPlanned) {
        const l = lunch ? nameFor(lunch.recipeId, lunch.customMealName) : null;
        const d = dinner ? nameFor(dinner.recipeId, dinner.customMealName) : null;
        const body =
          l && d
            ? `Lunch: ${l} · Dinner: ${d}. Here's your plan for today.`
            : l || d
              ? `${l ?? d} is on today's plan. Tap to see the details.`
              : `Your meals are planned for today — tap to take a look.`;
        await scheduleMealNotificationAt(day, 8, `Today's menu 🍳`, body);
      }

      // Lunch reminder @ 11am
      if (lunch) {
        const n = nameFor(lunch.recipeId, lunch.customMealName);
        const body = n
          ? `Today's lunch is ${n}. A little prep now and you're set.`
          : `You've got lunch planned today — time to start cooking.`;
        await scheduleMealNotificationAt(day, 11, `Lunch coming up 🥗`, body);
      }

      // Dinner reminder @ 5pm
      if (dinner) {
        const n = nameFor(dinner.recipeId, dinner.customMealName);
        const body = n
          ? `Tonight it's ${n}. Start whenever you're ready.`
          : `Dinner's on tonight's plan — time to start cooking.`;
        await scheduleMealNotificationAt(day, 17, `Dinner's on the horizon 🍲`, body);
      }
    }
  } catch (e) {
    console.warn('[notifications] scheduleMealPlanNotifications failed:', e);
  }
}

export async function scheduleInactivityNotifications(userName: string = '') {
  if (!isNativeNotificationsAvailable) return;
  try {

  // 1. Cancel existing notifications to reset the timer
  await cancelAllNotifications();

  // Make sure we have permission before attempting to schedule
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    return;
  }

  // Fallback to "there" if no name is provided
  const name = userName ? userName : 'there';
  
  const DAY_IN_SECONDS = 24 * 60 * 60;
  
  // Schedule Day 3
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'PlanNplate',
      body: `Hey ${name}, ready when you are. Tell us how you like to eat and we'll plan your week + shopping list in one go.`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 3 * DAY_IN_SECONDS,
      repeats: false,
    },
  });

  // Schedule Day 10
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'PlanNplate',
      body: `Still thinking it over, ${name}? A few taps sorts your meals and your shopping list. We'll keep it simple.`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 10 * DAY_IN_SECONDS,
      repeats: false,
    },
  });

  // Schedule Day 17
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'PlanNplate',
      body: `No rush, ${name} — whenever you're ready, your meal planner and recipe keeper are right here waiting.`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 17 * DAY_IN_SECONDS,
      repeats: false,
    },
  });
  } catch (e) {
    console.warn('[notifications] scheduleInactivityNotifications failed:', e);
  }
}
