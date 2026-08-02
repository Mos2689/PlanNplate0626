import { NativeModules } from 'react-native';
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

// ─────────────────────────────────────────────────────────────────────────────
// SDK resolution
//
// This module used to `import { getAnalytics } from '@react-native-firebase/
// analytics'` at the top level. When the native side isn't in the running
// binary — an iOS build made before the Firebase config plugin was added, or
// Expo Go, which can't contain custom native modules — that import throws
// "Native module RNFBAppModule not found" at REQUIRE time, which is fatal and
// takes down the whole app before the first frame.
//
// It's fatal specifically because analytics.ts re-exports `setFirebaseUserId`
// (`export { setFirebaseUserId }`), and a re-exported binding can't be
// deferred, so Metro's `inlineRequires` doesn't save us: importing analytics
// eagerly evaluates this file.
//
// Analytics is telemetry. Losing it should degrade silently, never crash the
// product. This mirrors the PostHog stub already in analytics.ts: resolve the
// SDK lazily, and fall back to a no-op when it isn't there.
//
// CRUCIALLY, a try/catch around require() is NOT enough. Metro's module loader
// (@expo/cli/build/metro-require/require.js) wraps every load:
//
//     try { returnValue = loadModuleImplementation(...); }
//     catch (e) { global.ErrorUtils.reportFatalError(e); }
//     return returnValue;
//
// It reports the throw to ErrorUtils — surfacing a red-box "fatal" — and then
// SWALLOWS it, returning undefined. So our catch never runs, and the failure is
// already on screen before we could handle it.
//
// The only reliable defence is to never require the package when the native
// side is absent. `NativeModules` is always safe to read, so probe there first
// — the same approach meta-sdk.ts uses for the Facebook SDK.
// ─────────────────────────────────────────────────────────────────────────────

type AnalyticsSdk = typeof import('@react-native-firebase/analytics');

// undefined = not resolved yet, null = resolved and unavailable.
let sdk: AnalyticsSdk | null | undefined;

const warn = (message: string, error?: unknown) => {
  if (__DEV__) {
    console.warn(`[Firebase Analytics] ${message}`, error ?? '');
  }
};

/**
 * Resolve the Firebase Analytics SDK once, tolerating a missing native module.
 * Returns null when unavailable; every caller must handle that.
 */
function getSdk(): AnalyticsSdk | null {
  if (sdk !== undefined) return sdk;

  // The native module every @react-native-firebase package depends on. Absent
  // in Expo Go, and in any dev client built before the Firebase config plugin
  // was added. Reading NativeModules never throws.
  if (!NativeModules.RNFBAppModule) {
    warn('Native module not present in this build — analytics disabled for this session.');
    sdk = null;
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const resolved = require('@react-native-firebase/analytics') as AnalyticsSdk | undefined;
  // Metro returns undefined rather than throwing when a module fails to load,
  // so an explicit check is needed — otherwise `sdk` stays undefined and every
  // call retries the require.
  sdk = resolved ?? null;
  if (!sdk) warn('SDK failed to load — analytics disabled for this session.');
  return sdk;
}

const pendingTransactions = new Set<string>();
const completedTransactions = new Set<string>();

let lastFirebaseUserId: string | null | undefined;

const logCommand = async (command: FirebaseAnalyticsCommand) => {
  const firebase = getSdk();
  if (!firebase) return;

  // `getAnalytics()` can also throw if the app module resolved but failed to
  // initialise (missing GoogleService-Info.plist / google-services.json), so
  // it's guarded separately from the require above.
  let analytics: ReturnType<AnalyticsSdk['getAnalytics']>;
  try {
    analytics = firebase.getAnalytics();
  } catch (error) {
    warn('Analytics is not initialised in this build.', error);
    sdk = null; // stop retrying for the rest of the session
    return;
  }

  switch (command.name) {
    case 'sign_up':
      await firebase.logEvent(analytics, command.name, command.params);
      break;
    case 'onboarding_complete':
    case 'meal_plan_created':
      await firebase.logEvent(analytics, command.name);
      break;
    case 'trial_started':
      await firebase.logEvent(analytics, command.name, command.params);
      break;
    case 'purchase':
      await firebase.logEvent(analytics, command.name, command.params);
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

  const firebase = getSdk();
  if (!firebase) return;

  try {
    await firebase.setUserId(firebase.getAnalytics(), safeUserId);
    lastFirebaseUserId = safeUserId;
  } catch (error) {
    warn('Failed to update the Firebase user ID.', error);
  }
};

/**
 * Whether Firebase Analytics is usable in this build. Exposed so a diagnostics
 * surface can report "analytics unavailable" rather than silently dropping
 * events. Resolves the SDK on first call.
 */
export const isFirebaseAnalyticsAvailable = (): boolean => getSdk() !== null;
