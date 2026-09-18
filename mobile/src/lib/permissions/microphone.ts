// Microphone permission — the single place that knows how the OS behaves.
//
// Three screens record audio (onboarding dish capture, add-recipe "Speak it",
// grocery "Talk"). Each used to call `Audio.requestPermissionsAsync()` directly
// and show "Microphone permission is required" on anything but `granted` — a
// dead end, because once iOS has been told "Don't Allow" the request resolves
// denied WITHOUT ever prompting again. The user's only way forward was to find
// the Settings app themselves, which nothing in the UI suggested.
//
// The distinction that matters is not granted/denied but whether the OS will
// still prompt:
//
//   denied   — the OS will ask again (Android's first decline). Re-running the
//              flow re-prompts, so "Try again" is the right affordance.
//   blocked  — the OS will NOT ask again (every iOS decline, Android's
//              "don't ask again"). Only Settings can change this, so this is
//              the ONLY state that should route a user out of the app.
//
// Sending a `denied` user to Settings would be worse than the bug it fixes:
// they'd leave the app to flip a switch the in-app prompt would have set.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Linking from 'expo-linking';

/** Which voice surface asked for the microphone. */
export type VoiceSurface = 'onboarding-dishes' | 'add-recipe' | 'grocery';

export type MicPermissionOutcome =
  /** Recording may start. */
  | 'granted'
  /** Declined, but the OS will prompt again — offer a retry, not Settings. */
  | 'denied'
  /** Declined permanently — only Settings can change it. */
  | 'blocked';

/**
 * Resolve the microphone permission, prompting only when the OS will actually
 * show something.
 *
 * Reading with `getPermissionsAsync()` first is what makes `blocked`
 * detectable: `requestPermissionsAsync()` reports the same `granted: false` for
 * "user just said no" and "user said no months ago and iOS stopped asking".
 * `canAskAgain` is the only thing that separates them.
 */
export async function ensureMicrophonePermission(): Promise<MicPermissionOutcome> {
  try {
    const current = await Audio.getPermissionsAsync();
    if (current.granted) return 'granted';

    // Undetermined, or Android after a soft decline — the prompt still works,
    // so this preserves the first-run experience exactly as it was.
    if (current.canAskAgain) {
      const next = await Audio.requestPermissionsAsync();
      if (next.granted) return 'granted';
      return next.canAskAgain ? 'denied' : 'blocked';
    }

    return 'blocked';
  } catch (e) {
    // A permissions module that throws is not a permission problem, and must
    // not send the user to Settings. Report it as a soft denial so the caller
    // offers a retry.
    console.warn('[MicPermission] permission check failed', e);
    return 'denied';
  }
}

/** Current permission without ever prompting — for the "did they fix it?" check. */
export async function isMicrophoneGranted(): Promise<boolean> {
  try {
    const current = await Audio.getPermissionsAsync();
    return current.granted;
  } catch (e) {
    console.warn('[MicPermission] permission read failed', e);
    return false;
  }
}

// ── Resume breadcrumb ───────────────────────────────────────────────────────
//
// iOS terminates the app when the microphone switch is toggled in Settings, so
// the trip back is a COLD START — the user lands on the home screen with no
// memory of what they were doing. Onboarding survives this on its own (it
// resumes from `preferences.onboardingStep`), but add-recipe and grocery don't.
//
// So we leave a note before walking out the door. On next launch MicReadyNudge
// reads it and offers a one-tap way back. AsyncStorage matches the convention
// used by offer-funnel-store.ts and picks-for-you-cache.ts.

const RESUME_KEY = 'plannplate:voice-resume-intent';

/**
 * How long a breadcrumb stays meaningful. Long enough to cover a detour through
 * Settings, short enough that a launch tomorrow doesn't nudge someone about a
 * recipe they abandoned.
 */
const RESUME_TTL_MS = 10 * 60 * 1000;

export interface VoiceResumeIntent {
  surface: VoiceSurface;
  at: number;
}

export async function writeVoiceResumeIntent(surface: VoiceSurface): Promise<void> {
  try {
    const intent: VoiceResumeIntent = { surface, at: Date.now() };
    await AsyncStorage.setItem(RESUME_KEY, JSON.stringify(intent));
  } catch (e) {
    // Losing the breadcrumb only costs the nudge, never the Settings trip.
    console.warn('[MicPermission] could not store resume intent', e);
  }
}

export async function readVoiceResumeIntent(): Promise<VoiceResumeIntent | null> {
  try {
    const raw = await AsyncStorage.getItem(RESUME_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<VoiceResumeIntent>;
    const { surface, at } = parsed;
    if (surface !== 'onboarding-dishes' && surface !== 'add-recipe' && surface !== 'grocery') {
      return null;
    }
    if (typeof at !== 'number' || Date.now() - at > RESUME_TTL_MS) {
      await clearVoiceResumeIntent();
      return null;
    }
    return { surface, at };
  } catch (e) {
    console.warn('[MicPermission] could not read resume intent', e);
    return null;
  }
}

export async function clearVoiceResumeIntent(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RESUME_KEY);
  } catch (e) {
    console.warn('[MicPermission] could not clear resume intent', e);
  }
}

/**
 * Leave the breadcrumb, then open the OS settings page for this app.
 *
 * The write is awaited deliberately: on iOS the app can be terminated the
 * instant the user flips the switch, and an unflushed AsyncStorage write would
 * take the resume path with it.
 */
export async function openMicrophoneSettings(surface: VoiceSurface): Promise<void> {
  await writeVoiceResumeIntent(surface);
  try {
    await Linking.openSettings();
  } catch (e) {
    console.warn('[MicPermission] could not open settings', e);
    await clearVoiceResumeIntent();
  }
}
