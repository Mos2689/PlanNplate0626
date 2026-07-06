import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Set how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermissions() {
  if (Platform.OS === 'web') return false;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  return finalStatus === 'granted';
}

export async function cancelAllNotifications() {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function scheduleInactivityNotifications(userName: string = '') {
  if (Platform.OS === 'web') return;

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
}
