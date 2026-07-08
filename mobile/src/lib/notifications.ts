import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

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

export async function cancelAllNotifications() {
  if (!isNativeNotificationsAvailable) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.warn('[notifications] cancelAllNotifications failed:', e);
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
