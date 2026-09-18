// MicReadyNudge — the cold-start half of the "go to Settings and come back"
// flow.
//
// iOS terminates the app when the microphone switch is toggled in Settings, so
// a user who does exactly what we asked gets dropped on the home screen with no
// memory of the recipe they were dictating. useMicPermissionGate can't help:
// nothing in the JS runtime survives a termination.
//
// What survives is the breadcrumb `openMicrophoneSettings` wrote before leaving.
// On launch this reads it, confirms the microphone is now actually on, and
// offers ONE tap back to the surface they started from. It deliberately does
// not auto-navigate: relaunching straight into a recording screen the user
// didn't ask for would be its own kind of hijack.
//
// Mounted once at the root beside FailureHost — same pattern as PaywallSheet.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { Mic } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { designTokens } from '@/lib/design-tokens';
import {
  clearVoiceResumeIntent,
  isMicrophoneGranted,
  readVoiceResumeIntent,
  type VoiceSurface,
} from '@/lib/permissions/microphone';

/** Long enough to notice, short enough not to sit over the first tap. */
const VISIBLE_MS = 8000;

const LABEL: Record<VoiceSurface, string> = {
  'add-recipe': 'Microphone is on — tap to speak your recipe',
  grocery: 'Microphone is on — tap to speak your items',
  // Onboarding resumes itself from preferences.onboardingStep, so it never
  // reaches the pill. Present only so the map stays total.
  'onboarding-dishes': 'Microphone is on',
};

export function MicReadyNudge() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();

  const [surface, setSurface] = useState<VoiceSurface | null>(null);
  const checkedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setSurface(null);
  }, []);

  // Launch check, once. A breadcrumb with the microphone still off means the
  // user went to Settings and changed their mind — nudging them about a
  // permission they declined twice would be nagging, so it's dropped silently.
  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    let cancelled = false;
    void (async () => {
      const intent = await readVoiceResumeIntent();
      if (!intent || cancelled) return;

      if (intent.surface === 'onboarding-dishes') {
        await clearVoiceResumeIntent();
        return;
      }

      const granted = await isMicrophoneGranted();
      if (!granted) {
        await clearVoiceResumeIntent();
        return;
      }
      if (cancelled) return;

      setSurface(intent.surface);
      timerRef.current = setTimeout(() => {
        setSurface(null);
        void clearVoiceResumeIntent();
      }, VISIBLE_MS);
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const resume = useCallback(() => {
    if (!surface) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    hide();
    void clearVoiceResumeIntent();

    if (surface === 'add-recipe') {
      // Reuses add-recipe's existing `?action=speak` auto-start effect, so the
      // mic opens on arrival with no extra tap.
      router.push('/add-recipe?action=speak');
    } else if (surface === 'grocery') {
      router.push('/(tabs)/grocery?addItem=voice');
    }
  }, [surface, hide, router]);

  // Never over signup, login or onboarding: those flows own the screen, and
  // onboarding in particular resumes its own voice step unaided.
  const seg0 = segments[0] as string | undefined;
  const onGatedRoute =
    seg0 === 'login' ||
    seg0 === 'signup' ||
    seg0 === 'reset-password' ||
    seg0 === 'verify-otp' ||
    seg0 === 'onboarding';

  if (!surface || onGatedRoute) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(240)}
      exiting={FadeOutDown.duration(180)}
      style={[styles.container, { bottom: insets.bottom + 96 }]}
    >
      <Pressable
        onPress={resume}
        style={styles.pill}
        accessibilityRole="button"
        accessibilityLabel={LABEL[surface]}
      >
        <Mic size={14} color={designTokens.colors.cream} strokeWidth={2} />
        <Text style={styles.text}>{LABEL[surface]}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 980,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: designTokens.colors.charcoal,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  text: {
    fontFamily: designTokens.font.medium,
    fontSize: 13,
    letterSpacing: -0.1,
    color: designTokens.colors.cream,
  },
});
