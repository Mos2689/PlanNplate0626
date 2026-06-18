// useTimerChime — fire-and-forget audio playback for the Vibe Cooking
// timer's zero-tick moment. Pairs with the existing success haptic so
// the cook hears the chime even when the phone is face-down on the
// counter (haptic alone gets missed when hands are busy).
//
// Why expo-av (not expo-audio):
//   expo-audio's `useAudioPlayer` is hook-based and tied to component
//   lifecycle. For a one-shot fire-and-forget chime triggered from a
//   timer callback, expo-av's fully-imperative `Audio.Sound.createAsync`
//   is the cleaner pattern. expo-av is still shipped (the project
//   imports it via package.json) and will be migrated when expo-audio
//   ships an equivalent imperative entry point.
//
// Failure tolerance:
//   The bundled asset (`chef-bell.mp3`) ships as a placeholder by
//   default — see assets/sounds/SOURCES.md for the swap-in spec. If
//   load or playback fails for any reason (missing/invalid bytes,
//   audio session conflict, OS-level mute), the wrapper absorbs the
//   error and logs a single warning. The timer flow continues
//   unaffected, the haptic still fires, the overlay still mounts.

import { useCallback, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';

// Static require so Metro can bundle the asset reference at build
// time. The placeholder MP3 will fail to decode at runtime — that's
// OK, the try/catch in `playChime` handles it gracefully.
const CHEF_BELL_ASSET = require('../../assets/sounds/chef-bell.mp3');

export interface UseTimerChime {
  /** Plays the chime once. Safe to call from any context; never throws. */
  playChime: () => void;
}

/**
 * Returns a stable `playChime` callback. The hook owns no state and
 * doesn't pre-load the sound — each call creates a short-lived
 * Sound instance, plays it, and unloads after `didJustFinish`. For
 * a one-shot chime this is simpler than managing a long-lived player
 * and avoids the audio-session contention that long-lived players
 * cause when the user backgrounds the app.
 */
export function useTimerChime(): UseTimerChime {
  // Track in-flight sounds so we can clean them up on unmount even
  // if the user navigates away before the chime finishes playing.
  // Set rather than array so a stray double-call doesn't cause us
  // to leak a reference.
  const inFlightSoundsRef = useRef<Set<Audio.Sound>>(new Set());

  useEffect(() => {
    return () => {
      // Best-effort cleanup on unmount. Sounds that have already
      // unloaded will throw on a second unloadAsync — absorb that.
      inFlightSoundsRef.current.forEach((sound) => {
        sound.unloadAsync().catch(() => {});
      });
      inFlightSoundsRef.current.clear();
    };
  }, []);

  const playChime = useCallback(async () => {
    let sound: Audio.Sound | null = null;
    try {
      // Ensure the audio session is configured to play even if the
      // physical silent switch is engaged on iOS.
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const result = await Audio.Sound.createAsync(CHEF_BELL_ASSET, {
        shouldPlay: true,
        // Single-shot. No looping.
        isLooping: false,
      });
      sound = result.sound;
      inFlightSoundsRef.current.add(sound);

      // Auto-unload once playback finishes so we don't leak memory
      // across repeated timer cycles. The status callback fires
      // multiple times during playback; only act on completion.
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          const s = sound;
          if (s) {
            inFlightSoundsRef.current.delete(s);
            s.unloadAsync().catch(() => {});
          }
        }
      });
    } catch (err) {
      // Asset placeholder, missing file, OS-level audio failure,
      // backgrounded app — absorb. The cooking flow continues; the
      // user still gets the haptic + the time's-up overlay.
      console.warn('[useTimerChime] chime playback failed', err);
      if (sound) {
        inFlightSoundsRef.current.delete(sound);
        sound.unloadAsync().catch(() => {});
      }
    }
  }, []);

  return { playChime };
}
