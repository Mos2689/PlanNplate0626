import PostHog from 'posthog-react-native';
import {
  setFirebaseUserId,
  trackFirebaseConversion,
  type FirebaseTrackContext,
} from './firebase-analytics';

export { setFirebaseUserId };

// Known events are documented here to prevent typos and give autocomplete,
// but `track()` accepts ANY string so new critical-path events can be added
// at the call site without editing this union first.
export type KnownAnalyticsEvent =
  // Lifecycle
  | 'app_installed'
  | 'app_opened'
  // Onboarding — funnel, dish capture and taste picks. Properties are built
  // exclusively by lib/onboarding-analytics.ts, which accepts counts and a
  // derived profile and never a dish name.
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
  // Persona — collected in EditProfileModal, which is the only surface that
  // gathers diet / allergies / cuisine / skill since the old onboarding steps
  // were removed.
  | 'persona_updated'
  // Auth
  | 'auth_signup'
  | 'auth_login'
  // Paywall / purchase
  | 'paywall_viewed'
  | 'paywall_dismissed'
  | 'purchase_started'
  | 'purchase_completed'
  | 'purchase_failed'
  // Core funnels
  | 'recipe_generate_started'
  | 'recipe_generate_succeeded'
  | 'recipe_generate_failed'
  | 'meal_plan_created'
  | 'recipe_added_to_plan'
  | 'grocery_list_generated'
  // Share to PlanNplate — properties are built exclusively by
  // lib/share/analytics.ts, which accepts a hostname and never a full URL.
  | 'recipe_share_target_opened'
  | 'recipe_share_payload_received'
  | 'recipe_share_url_detected'
  | 'recipe_share_import_started'
  | 'recipe_share_import_succeeded'
  | 'recipe_share_import_failed'
  | 'recipe_share_duplicate_detected'
  | 'recipe_share_cancelled'
  | 'recipe_share_auth_required'
  | 'recipe_share_opened_in_app'
  // Support — properties are built exclusively by lib/support/analytics.ts,
  // which accepts an intent and a feature key and never the message text.
  // Length travels as a bucket, never a character count.
  | 'support_opened'
  | 'support_composer_opened'
  | 'support_screenshot_attached'
  | 'support_submitted'
  | 'support_submit_failed'
  | 'support_composer_abandoned'
  | 'support_thread_opened'
  | 'support_user_replied'
  | 'support_notification_opened'
  | 'contextual_support_shown'
  | 'faq_opened'
  | 'faq_contact_clicked'
  // Generic UI
  | 'ui_button_tapped';

// `(string & {})` keeps the literal autocomplete from KnownAnalyticsEvent while
// still permitting arbitrary event names.
export type AnalyticsEvent = KnownAnalyticsEvent | (string & {});

type Sink = (
  event: AnalyticsEvent,
  props?: Record<string, any>,
  firebaseContext?: FirebaseTrackContext,
) => void;

// Strip undefined values because PostHog rejects them
const cleanProps = (props?: Record<string, any>) => {
  if (!props) return undefined;
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
};

// PostHog throws at construction if no API key is passed. When the key is
// absent (e.g. it isn't in .env / this build's env), we must NOT construct a
// real client — otherwise the throw crashes the whole app at import time
// (analytics.ts is pulled in by the root layout). Fall back to a no-op stub so
// analytics is simply disabled and the app boots normally.
const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY || '';
export const posthogEnabled = POSTHOG_API_KEY.length > 0;

function createPostHogStub(): PostHog {
  const noop = () => {};
  return {
    capture: noop,
    flush: noop,
    screen: noop,
    identify: noop,
    reset: noop,
    register: noop,
    unregister: noop,
    optIn: noop,
    optOut: noop,
  } as unknown as PostHog;
}

export const posthog: PostHog = (() => {
  if (!posthogEnabled) {
    if (__DEV__) {
      console.log('[Analytics] EXPO_PUBLIC_POSTHOG_API_KEY not set — analytics disabled.');
    }
    return createPostHogStub();
  }
  try {
    return new PostHog(POSTHOG_API_KEY, {
      host: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    });
  } catch (e) {
    console.warn('[Analytics] PostHog init failed — analytics disabled.', e);
    return createPostHogStub();
  }
})();

const postHogSink: Sink = (event, props) => {
  posthog.capture(event, cleanProps(props));
  if (__DEV__) {
    // Flush immediately in dev for easier debugging
    posthog.flush();
  }
};

const devSink: Sink = (event, props) => {
  if (__DEV__) {
    console.log(`[Analytics] ${event}`, props ? props : '');
  }
};

const firebaseSink: Sink = (event, props, firebaseContext) => {
  trackFirebaseConversion(event, props, firebaseContext);
};

const sinks: Sink[] = [postHogSink, firebaseSink, devSink];

export const track = (
  event: AnalyticsEvent,
  props?: Record<string, any>,
  firebaseContext?: FirebaseTrackContext,
) => {
  sinks.forEach((sink) => {
    try {
      sink(event, props, firebaseContext);
    } catch (e) {
      console.error(`[Analytics Error] Sink failed for event: ${event}`, e);
    }
  });
};
