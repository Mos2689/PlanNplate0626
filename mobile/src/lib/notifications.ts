import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
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

// ─────────────────────────────────────────────────────────────────────────────
// Android notification channels
//
// On Android 8+ every notification needs a channel, and Expo's guidance for
// Android 13+ is that one exists before the permission prompt and token fetch.
// Two channels so users can mute meal reminders without also muting support
// replies (or vice versa) from system settings.
//
// Channel ids are a contract with the server: support-reply sends
// `channelId: 'support'`. Change one, change both.
//
// NOTE: Android locks a channel's importance the moment it's created — calling
// setNotificationChannelAsync again later can rename it but can't raise or
// lower it. To change importance, ship a NEW channel id and delete the old one.
// The reminders channel keeps the id 'default' for exactly this reason: it
// already exists on installed builds.
// ─────────────────────────────────────────────────────────────────────────────

/** Meal-plan reminders and the inactivity nudges — everything scheduled locally. */
export const REMINDERS_CHANNEL_ID = 'default';
/** Remote pushes from support-reply. */
export const SUPPORT_CHANNEL_ID = 'support';

let channelsReady: Promise<void> | null = null;

/** Create the Android channels once per launch. No-op on iOS/web. */
export function setupNotificationChannels(): Promise<void> {
  if (!isNativeNotificationsAvailable || Platform.OS !== 'android') {
    return Promise.resolve();
  }
  if (!channelsReady) {
    const shared = {
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6a7d56',
      sound: 'default',
    };
    channelsReady = Promise.all([
      Notifications.setNotificationChannelAsync(REMINDERS_CHANNEL_ID, {
        ...shared,
        name: 'Meal reminders',
        description: "Your day's menu and heads-ups before lunch and dinner.",
      }),
      Notifications.setNotificationChannelAsync(SUPPORT_CHANNEL_ID, {
        ...shared,
        name: 'Support replies',
        description: 'When the PlanNplate team replies to your message.',
      }),
    ])
      .then(() => undefined)
      .catch((e) => {
        // Let the next caller retry rather than caching the failure.
        channelsReady = null;
        console.warn('[notifications] setupNotificationChannels failed:', e);
      });
  }
  return channelsReady;
}

/**
 * Whether the native notifications module is actually present in this binary.
 *
 * Exported so callers outside this file (the support notification router) can
 * apply the same guard rather than duplicating the detection — and, more
 * importantly, so they inherit the OTA-safety reasoning above rather than
 * assuming the module is there.
 */
export function areNotificationsAvailable(): boolean {
  return isNativeNotificationsAvailable;
}

export async function requestNotificationPermissions() {
  if (!isNativeNotificationsAvailable) return false;

  try {
    // Channels first: Expo's guidance for Android 13+ is that a channel exists
    // before the permission prompt is shown.
    await setupNotificationChannels();

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
// Remote push registration
//
// Everything above this line is LOCAL notifications, which the app has always
// used. This is the first remote push path, added so a support reply can reach
// someone who isn't in the app.
//
// Email remains the guarantee and push the convenience. That ordering is
// deliberate: push depends on a token round-trip, a native entitlement and a
// third-party relay, any of which can be silently wrong in a way we'd only
// discover from a user saying "nobody ever replied". support-reply sends the
// email regardless of whether a token exists.
//
// NOTE: we do NOT prompt for permission here. Asking someone to enable
// notifications at the moment they're reporting a bug is the worst possible
// timing. This registers a token only when permission has ALREADY been granted
// for the meal reminders.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Store this device's push token, if we're allowed one.
 *
 * Safe to call on every app open: the upsert is keyed on the token, so a device
 * that changes hands re-points to the new account rather than delivering one
 * person's support replies to another.
 */
export async function registerPushToken(): Promise<void> {
  if (!isNativeNotificationsAvailable) return;

  try {
    // Never triggers the OS prompt — only proceeds if the user already said
    // yes for the reminders.
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    // The support channel must exist before a push targeting it arrives.
    await setupNotificationChannels();

    const { useAuthStore } = await import('./auth-store');
    const auth = useAuthStore.getState();
    if (!auth.isAuthenticated || !auth.currentUser?.id) return;

    // `projectId` is required by EAS's push service and is not inferable in a
    // bare build. It lives in app.json under extra.eas.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) {
      console.warn('[notifications] No EAS projectId — skipping push registration.');
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    const { supabase } = await import('./supabase');
    const { error } = await supabase.from('user_push_tokens').upsert(
      {
        token,
        user_id: auth.currentUser.id,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    );
    // supabase-js returns errors rather than throwing, so without this check
    // an RLS or network failure would leave the device silently unreachable.
    if (error) {
      console.warn('[notifications] push token upsert failed:', error.message);
    }
  } catch (e) {
    // A device with no push capability, a network blip, or a build without the
    // entitlement. None of these are worth telling the user about — the email
    // path is unaffected.
    console.warn('[notifications] registerPushToken failed:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduled local notifications — the daily engagement channel
//
//   • Meal-plan reminders for the next 7 days, LOCAL wall-clock times:
//       8am  — morning heads-up of the day's plan (if anything is planned)
//       11am — lunch reminder (only if a lunch is planned + not yet cooked)
//       5pm  — dinner reminder (only if a dinner is planned + not yet cooked)
//     Any slot the user has already logged (cooked/skipped/swapped) is skipped.
//   • Inactivity nudges 3, 10 and 17 days after the last time the app was used.
//
// RELIABILITY — why this is a "sync" rather than cancel-all-then-schedule:
// the old flow cancelled everything and then re-created ~20 notifications one
// bridge call at a time, only when the app backgrounded. If Android killed the
// process mid-way (user swipes the app away from recents), the user was left
// with NOTHING scheduled. Now every notification has a stable identifier, so
// scheduling one REPLACES its previous copy (expo-notifications keys both its
// store and the AlarmManager PendingIntent on the identifier). We schedule
// first and prune stale ones after, so there is never a window with an empty
// schedule — an interrupted sync leaves the previous schedule in place.
//
// It runs on launch, on every foreground and on every background, so the
// schedule is already in place before the user leaves rather than depending on
// the last seconds of a backgrounding app.
// ─────────────────────────────────────────────────────────────────────────────

type PlannedNotification = {
  identifier: string;
  content: Notifications.NotificationContentInput;
  trigger: Notifications.DateTriggerInput | Notifications.TimeIntervalTriggerInput;
};

const DAY_IN_SECONDS = 24 * 60 * 60;

const localDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function buildMealPlanReminders(): PlannedNotification[] {
  const planned: PlannedNotification[] = [];
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

  const add = (day: Date, hour: number, title: string, body: string) => {
    const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0);
    // Skip anything in the past (or within the next minute) — can't fire it.
    if (when.getTime() <= Date.now() + 60_000) return;
    planned.push({
      identifier: `meal-${localDateKey(day)}-${hour}`,
      content: { title, body, sound: true, data: { kind: 'meal-plan' } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        channelId: REMINDERS_CHANNEL_ID,
      },
    });
  };

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
      add(day, 8, `Today's menu 🍳`, body);
    }

    // Lunch reminder @ 11am
    if (lunch) {
      const n = nameFor(lunch.recipeId, lunch.customMealName);
      const body = n
        ? `Today's lunch is ${n}. A little prep now and you're set.`
        : `You've got lunch planned today — time to start cooking.`;
      add(day, 11, `Lunch coming up 🥗`, body);
    }

    // Dinner reminder @ 5pm
    if (dinner) {
      const n = nameFor(dinner.recipeId, dinner.customMealName);
      const body = n
        ? `Tonight it's ${n}. Start whenever you're ready.`
        : `Dinner's on tonight's plan — time to start cooking.`;
      add(day, 17, `Dinner's on the horizon 🍲`, body);
    }
  }

  return planned;
}

function buildInactivityNudges(userName: string): PlannedNotification[] {
  // Fallback to "there" if no name is provided
  const name = userName || 'there';
  const nudges: [number, string][] = [
    [3, `Hey ${name}, ready when you are. Tell us how you like to eat and we'll plan your week + shopping list in one go.`],
    [10, `Still thinking it over, ${name}? A few taps sorts your meals and your shopping list. We'll keep it simple.`],
    [17, `No rush, ${name} — whenever you're ready, your meal planner and recipe keeper are right here waiting.`],
  ];

  // Re-scheduling these on every sync pushes them out again, which is exactly
  // "N days after the user was last here".
  return nudges.map(([day, body]) => ({
    identifier: `nudge-day-${day}`,
    content: { title: 'PlanNplate', body, sound: true, data: { kind: 'inactivity' } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: day * DAY_IN_SECONDS,
      repeats: false,
      channelId: REMINDERS_CHANNEL_ID,
    },
  }));
}

const describeTrigger = (n: PlannedNotification) =>
  'date' in n.trigger
    ? new Date(n.trigger.date).toLocaleString()
    : `in ${Math.round(n.trigger.seconds / DAY_IN_SECONDS)}d`;

async function runSync(userName: string): Promise<void> {
  if (!isNativeNotificationsAvailable) return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      if (__DEV__) console.log(`[notifications] permission is "${status}" — nothing scheduled`);
      return;
    }

    await setupNotificationChannels();

    const planned = [...buildInactivityNudges(userName), ...buildMealPlanReminders()];

    // Schedule first: same identifier replaces the previous copy in place.
    for (const n of planned) {
      await Notifications.scheduleNotificationAsync(n);
    }

    // Then prune anything we no longer want — slots cooked or removed since the
    // last sync, days that rolled out of the horizon, and the random-id
    // notifications scheduled by builds before this change.
    const keep = new Set(planned.map((n) => n.identifier));
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (!keep.has(n.identifier)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }

    if (__DEV__) {
      console.log(
        `[notifications] ${planned.length} scheduled:\n` +
          planned.map((n) => `  ${n.identifier} → ${describeTrigger(n)}`).join('\n'),
      );
    }
  } catch (e) {
    console.warn('[notifications] syncScheduledNotifications failed:', e);
  }
}

// Serialises syncs so a foreground and a background firing close together
// can't interleave their schedule/prune passes.
let syncQueue: Promise<void> = Promise.resolve();

/**
 * Bring the device's scheduled notifications in line with the current meal
 * plan and reset the inactivity nudges. Idempotent and safe to call often.
 */
export function syncScheduledNotifications(userName: string = ''): Promise<void> {
  syncQueue = syncQueue.then(() => runSync(userName));
  return syncQueue;
}
