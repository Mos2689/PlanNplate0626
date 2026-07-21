import { getAnalytics, logEvent, setUserId } from '@react-native-firebase/analytics';
import {
  buildFirebaseAnalyticsCommand,
  normalizeFirebaseUserId,
  type FirebaseAnalyticsCommand,
  type FirebaseTrackContext,
} from './firebase-analytics-policy';

export type {
  FirebaseTrackContext,
  VerifiedSubscriptionConversion,
} from './firebase-analytics-policy';

const pendingTransactions = new Set<string>();
const completedTransactions = new Set<string>();

let lastFirebaseUserId: string | null | undefined;

const warn = (message: string, error?: unknown) => {
  if (__DEV__) {
    console.warn(`[Firebase Analytics] ${message}`, error ?? '');
  }
};

const logCommand = async (command: FirebaseAnalyticsCommand) => {
  const analytics = getAnalytics();
  switch (command.name) {
    case 'sign_up':
      await logEvent(analytics, command.name, command.params);
      break;
    case 'onboarding_complete':
    case 'meal_plan_created':
      await logEvent(analytics, command.name);
      break;
    case 'trial_started':
      await logEvent(analytics, command.name, command.params);
      break;
    case 'purchase':
      await logEvent(analytics, command.name, command.params);
      break;
  }
};

const logSubscriptionCommand = async (
  command: Extract<
    FirebaseAnalyticsCommand,
    { name: 'trial_started' | 'purchase' }
  >,
) => {
  const transactionId = command.params.transaction_id;
  if (
    pendingTransactions.has(transactionId) ||
    completedTransactions.has(transactionId)
  ) {
    return;
  }

  pendingTransactions.add(transactionId);
  try {
    await logCommand(command);
    completedTransactions.add(transactionId);
  } catch (error) {
    warn('Failed to log a verified subscription conversion.', error);
  } finally {
    pendingTransactions.delete(transactionId);
  }
};

/**
 * Strict Firebase allowlist shared by iOS and Android. PostHog receives the
 * original event and payload; Firebase receives only the sanitized command
 * constructed by the pure policy module.
 */
export const trackFirebaseConversion = (
  event: string,
  postHogProps?: Record<string, any>,
  context?: FirebaseTrackContext,
) => {
  const command = buildFirebaseAnalyticsCommand(event, postHogProps, context);
  if (!command) return;

  if (command.name === 'trial_started' || command.name === 'purchase') {
    void logSubscriptionCommand(command);
    return;
  }

  void logCommand(command).catch((error) =>
    warn(`Failed to log ${command.name}.`, error),
  );
};

/** Set only the app's internal authenticated UUID; null clears it on logout. */
export const setFirebaseUserId = async (userId: string | null) => {
  const safeUserId = normalizeFirebaseUserId(userId);
  if (userId && !safeUserId) {
    warn('Rejected a non-UUID user ID and cleared the Firebase user ID.');
  }
  if (safeUserId === lastFirebaseUserId) return;

  try {
    await setUserId(getAnalytics(), safeUserId);
    lastFirebaseUserId = safeUserId;
  } catch (error) {
    warn('Failed to update the Firebase user ID.', error);
  }
};
