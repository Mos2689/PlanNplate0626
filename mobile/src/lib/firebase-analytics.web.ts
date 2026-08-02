import type { FirebaseTrackContext } from './firebase-analytics-policy';

// This project has no Firebase web app configuration. Keep web builds usable
// while native iOS/Android builds use the platform Firebase SDKs.
export const trackFirebaseConversion = (
  _event: string,
  _postHogProps?: Record<string, any>,
  _context?: FirebaseTrackContext,
) => {};

export const setFirebaseUserId = async (_userId: string | null) => {};

/** Mirrors the native module's export. Always false on web — no Firebase app. */
export const isFirebaseAnalyticsAvailable = (): boolean => false;
