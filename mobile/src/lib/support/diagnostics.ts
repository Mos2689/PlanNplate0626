// Support diagnostics — the IMPURE half.
//
// Reads the native modules and the app's stores, then hands the raw values to
// `buildDiagnostics` in diagnostics-policy.ts, which decides what survives.
// This file deliberately contains no filtering logic of its own: if the
// decision about what to send lived here, it couldn't be tested without a
// device.
//
// Every read is wrapped, because this runs at the exact moment something has
// already gone wrong. A support form that throws while collecting diagnostics
// would be the worst possible failure mode — the user is already frustrated
// and now the "tell us" button is broken too.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Localization from 'expo-localization';

import {
  connectionType,
  currentScreenName,
  isOnline,
  previousScreenName,
  recentFailures,
} from '../failure';
import { useAuthStore } from '../auth-store';
import { useSubscriptionStore } from '../subscription-store';
import { buildDiagnostics, type SupportDiagnostics } from './diagnostics-policy';
import type { SupportComposerRequest } from './types';

/** Read something that might throw on an unusual device, and never propagate. */
function safe<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

function appVersion(): string {
  return (
    safe(() => Application.nativeApplicationVersion, null) ??
    safe(() => Constants.expoConfig?.version ?? null, null) ??
    'unknown'
  );
}

function buildNumber(): string {
  // `nativeBuildVersion` is the store-facing build number on both platforms.
  // Falling back to the manifest keeps this useful in Expo Go and on web,
  // where the native value is null.
  return (
    safe(() => Application.nativeBuildVersion, null) ??
    safe(
      () =>
        (Platform.OS === 'ios'
          ? Constants.expoConfig?.ios?.buildNumber
          : String(Constants.expoConfig?.android?.versionCode ?? '')) || null,
      null,
    ) ??
    'unknown'
  );
}

/**
 * Collect everything attached to a support request.
 *
 * Call this at composer-open time rather than at send time: the user may spend
 * a minute typing, and by then the screen they were on — the single most useful
 * field — has already changed to the composer.
 */
export function collectDiagnostics(request: SupportComposerRequest): SupportDiagnostics {
  return buildDiagnostics({
    appVersion: appVersion(),
    buildNumber: buildNumber(),
    platform: Platform.OS,
    osVersion: safe(() => Device.osVersion, null),
    deviceModel: safe(() => Device.modelName, null),
    locale: safe(() => Localization.getLocales()[0]?.languageTag ?? null, null),

    screen: currentScreenName(),
    previousScreen: previousScreenName(),
    online: safe(() => isOnline(), true),
    connectionType: safe(() => connectionType(), null),

    signedIn: safe(() => useAuthStore.getState().isAuthenticated, false),
    isPremium: safe(() => useSubscriptionStore.getState().isPremium, false),

    intent: request.intent,
    feature: request.feature ?? null,
    featureIds: request.featureIds,

    failures: safe(() => recentFailures(), []),
  });
}

/** The account address a reply will be sent to. Shown in the confirmation. */
export function replyAddress(): string | null {
  return safe(() => useAuthStore.getState().currentUser?.email ?? null, null);
}
