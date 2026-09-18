// useMicPermissionGate — the warm half of the "go to Settings and come back"
// flow, for a single voice surface.
//
// After `openSettings()` the user leaves the app. Two things can happen:
//
//   WARM  — they come back without the OS killing us (Android always; iOS when
//           they backed out without touching the switch, and sometimes even
//           when they did). This hook notices the foreground transition,
//           re-reads the permission, and hands control back to the screen so it
//           can pick up exactly where it left off.
//
//   COLD  — iOS terminates the app the moment the microphone switch is toggled.
//           Nothing in this hook survives that; the breadcrumb written by
//           `openMicrophoneSettings` does, and MicReadyNudge handles it.
//
// The listener is only registered while a Settings trip is actually pending, so
// an ordinary background/foreground cycle never re-checks permissions or
// restarts a recorder behind the user's back.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  clearVoiceResumeIntent,
  ensureMicrophonePermission,
  isMicrophoneGranted,
  openMicrophoneSettings,
  type MicPermissionOutcome,
  type VoiceSurface,
} from '@/lib/permissions/microphone';

interface Options {
  surface: VoiceSurface;
  /**
   * Run when the user returns from Settings having granted the microphone.
   * Typically the screen's `startRecording` — the point of the whole flow is
   * that they don't have to tap the mic a second time.
   */
  onGranted: () => void;
}

/**
 * Deliberately state-free, and the returned object is referentially STABLE for
 * the life of the component.
 *
 * Screens put their `startRecording` in a `useCallback` that depends on this
 * gate, and at least one of them (`add-recipe`'s `?action=speak` auto-start)
 * feeds that callback into a `useEffect` dependency array. A gate that changed
 * identity on every render would re-run that effect on every render — whose
 * cleanup cancels the pending auto-start while the re-run early-returns on its
 * already-ran guard, so the recording would never begin.
 *
 * Callers keep their own "is it blocked" state from `check()`'s return value,
 * which is what drives their UI anyway.
 */
interface MicPermissionGate {
  /** Resolve the permission, prompting if the OS still will. */
  check: () => Promise<MicPermissionOutcome>;
  /** Leave a resume breadcrumb and open the OS settings page. */
  openSettings: () => Promise<void>;
}

export function useMicPermissionGate({ surface, onGranted }: Options): MicPermissionGate {
  // True only between openSettings() and the next foreground. Without this
  // guard, any app switch would re-check and could auto-start a recording.
  const awaitingReturnRef = useRef(false);
  const mountedRef = useRef(true);

  // Kept in a ref so the AppState effect never re-subscribes when the screen
  // re-renders with a new callback identity.
  const onGrantedRef = useRef(onGranted);
  onGrantedRef.current = onGranted;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const check = useCallback(() => ensureMicrophonePermission(), []);

  const openSettings = useCallback(async () => {
    awaitingReturnRef.current = true;
    await openMicrophoneSettings(surface);
  }, [surface]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status !== 'active') return;
      if (!awaitingReturnRef.current) return;
      awaitingReturnRef.current = false;

      void (async () => {
        const granted = await isMicrophoneGranted();
        // The screen may have unmounted while the user was away (they could
        // have navigated elsewhere before backgrounding). Never resume a
        // recorder on a surface that is gone.
        if (!mountedRef.current) return;

        if (granted) {
          // The nudge is for cold restarts only — we're already back on the
          // right screen, so retire the breadcrumb.
          void clearVoiceResumeIntent();
          onGrantedRef.current();
        }
      })();
    });

    return () => subscription.remove();
  }, []);

  // `surface` is a literal at every call site, so this memo never recomputes —
  // which is the point: see the note on MicPermissionGate above.
  return useMemo(() => ({ check, openSettings }), [check, openSettings]);
}
