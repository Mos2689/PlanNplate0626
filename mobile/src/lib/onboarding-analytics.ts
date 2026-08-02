// Onboarding analytics — the EMITTING half. The pure builders and the privacy
// rule live in onboarding-analytics-policy.ts; read that file first.
//
// Why this module exists at all: the onboarding flow was rewritten from five
// persona steps to two (dish capture, then taste picks) and the instrumentation
// wasn't. What remained fired two events whose funnel no longer matched the
// screens, and shipped eleven "persona" properties that are now the same
// constants for every user. Everything below replaces that.
//
// These events are PostHog-only by construction, not by omission: none of the
// names appear in buildFirebaseAnalyticsCommand (lib/firebase-analytics-policy.ts),
// so the Firebase sink resolves them to null and drops them. That's deliberate —
// Firebase is a narrow Google Ads conversion bridge (docs/FIREBASE_ANALYTICS.md),
// not a product-analytics destination. `onboarding_completed` is the one event
// here that Firebase does care about, and it maps on NAME only, so rewriting its
// payload leaves the ad conversion untouched.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { track } from './analytics';
import { useAuthStore } from './auth-store';
import {
  buildOnboardingCompletedProps,
  buildPersonaUpdatedProps,
  stepKeyForIndex,
  type DishInputMethod,
  type DishSplitSource,
  type OnboardingCompletedInput,
  type OnboardingEntryPoint,
  type PersonaSnapshot,
  type SuggestionSource,
  type VoiceFailureReason,
} from './onboarding-analytics-policy';

export type OnboardingAnalyticsEvent =
  | 'onboarding_started'
  | 'onboarding_welcome_viewed'
  | 'onboarding_welcome_action'
  | 'onboarding_step_viewed'
  | 'onboarding_step_completed'
  | 'onboarding_step_back'
  | 'onboarding_abandoned'
  | 'onboarding_completed'
  | 'onboarding_dish_capture_started'
  | 'onboarding_voice_permission_denied'
  | 'onboarding_voice_recording_stopped'
  | 'onboarding_voice_transcribe_succeeded'
  | 'onboarding_voice_transcribe_failed'
  | 'onboarding_dish_added'
  | 'onboarding_dish_removed'
  | 'onboarding_dish_renamed'
  | 'onboarding_taste_grid_viewed'
  | 'onboarding_taste_pick_toggled'
  | 'persona_updated';

type AuthState = 'signed-in' | 'guest' | 'signed-out';

// Read auth without subscribing. VoiceDishCapture and the modal both emit from
// callbacks, not render, so a hook would only add re-renders. Same adapter
// pattern as `isSigningUpNow` in components/StoreHydration.tsx.
const authState = (): AuthState => {
  const { isAuthenticated, isAnonymous } = useAuthStore.getState();
  if (!isAuthenticated) return 'signed-out';
  return isAnonymous ? 'guest' : 'signed-in';
};

/** Context on every event, matching lib/share/analytics.ts. */
const emit = (event: OnboardingAnalyticsEvent, props?: Record<string, unknown>) => {
  track(event, {
    platform: Platform.OS,
    app_version: Constants.expoConfig?.version ?? 'unknown',
    auth_state: authState(),
    ...props,
  });
};

// ── Funnel ──────────────────────────────────────────────────────────────────

export const trackOnboardingStarted = (
  entryPoint: OnboardingEntryPoint,
  resumedAtStep: number,
) => emit('onboarding_started', { entry_point: entryPoint, resumed_at_step: resumedAtStep });

export const trackWelcomeViewed = () => emit('onboarding_welcome_viewed');

export const trackWelcomeAction = (action: 'get_started' | 'sign_in') =>
  emit('onboarding_welcome_action', { action });

/**
 * Kept under its original name so the one insight that still works doesn't
 * break, but with an index and a stable key added — the old payload carried
 * only a display name, which is why the flow rewrite silently orphaned it.
 */
export const trackStepViewed = (stepIndex: number, stepName: string, totalSteps: number) =>
  emit('onboarding_step_viewed', {
    step_index: stepIndex,
    step_key: stepKeyForIndex(stepIndex),
    step_name: stepName,
    total_steps: totalSteps,
  });

export const trackStepCompleted = (stepIndex: number, dwellMs: number) =>
  emit('onboarding_step_completed', {
    step_index: stepIndex,
    step_key: stepKeyForIndex(stepIndex),
    dwell_ms: dwellMs,
  });

export const trackStepBack = (fromStepIndex: number, to: 'previous_step' | 'signup') =>
  emit('onboarding_step_back', {
    from_step_index: fromStepIndex,
    step_key: stepKeyForIndex(fromStepIndex),
    to,
  });

export const trackOnboardingAbandoned = (
  lastStepIndex: number,
  dishCount: number,
  dwellMs: number,
) =>
  emit('onboarding_abandoned', {
    last_step_index: lastStepIndex,
    step_key: stepKeyForIndex(lastStepIndex),
    dish_count: dishCount,
    dwell_ms: dwellMs,
  });

export const trackOnboardingCompleted = (input: OnboardingCompletedInput) =>
  emit('onboarding_completed', buildOnboardingCompletedProps(input));

// ── Step 1 — dish capture ───────────────────────────────────────────────────

export const trackDishCaptureStarted = (method: DishInputMethod) =>
  emit('onboarding_dish_capture_started', { method });

export const trackVoicePermissionDenied = () => emit('onboarding_voice_permission_denied');

export const trackVoiceRecordingStopped = (durationSec: number) =>
  emit('onboarding_voice_recording_stopped', { duration_sec: durationSec });

export const trackVoiceTranscribeSucceeded = (
  latencyMs: number,
  dishCount: number,
  splitSource: DishSplitSource,
) =>
  emit('onboarding_voice_transcribe_succeeded', {
    latency_ms: latencyMs,
    dish_count: dishCount,
    split_source: splitSource,
  });

/** `reason` is a bounded enum — the caught error itself never travels. */
export const trackVoiceTranscribeFailed = (
  reason: VoiceFailureReason,
  latencyMs?: number,
) => emit('onboarding_voice_transcribe_failed', { reason, latency_ms: latencyMs });

export const trackDishAdded = (
  method: DishInputMethod,
  addedCount: number,
  dishCountAfter: number,
  atMax: boolean,
) =>
  emit('onboarding_dish_added', {
    method,
    added_count: addedCount,
    dish_count_after: dishCountAfter,
    at_max: atMax,
  });

export const trackDishRemoved = (dishCountAfter: number) =>
  emit('onboarding_dish_removed', { dish_count_after: dishCountAfter });

export const trackDishRenamed = (dishCountAfter: number) =>
  emit('onboarding_dish_renamed', { dish_count_after: dishCountAfter });

// ── Step 2 — taste picks ────────────────────────────────────────────────────

export const trackTasteGridViewed = (
  suggestionCount: number,
  suggestionSource: SuggestionSource,
) =>
  emit('onboarding_taste_grid_viewed', {
    suggestion_count: suggestionCount,
    suggestion_source: suggestionSource,
  });

export const trackTastePickToggled = (
  selected: boolean,
  selectedCount: number,
  mealType: string,
) =>
  emit('onboarding_taste_pick_toggled', {
    selected,
    selected_count: selectedCount,
    meal_type: mealType,
  });

// ── Persona ─────────────────────────────────────────────────────────────────

/** No-ops when nothing changed — an opened-and-closed editor isn't an edit. */
export const trackPersonaUpdated = (
  after: PersonaSnapshot,
  fieldsChanged: string[],
  source = 'edit_profile',
) => {
  if (fieldsChanged.length === 0) return;
  emit('persona_updated', buildPersonaUpdatedProps(after, fieldsChanged, source));
};
