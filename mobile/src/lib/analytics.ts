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
  // Onboarding
  | 'onboarding_step_viewed'
  | 'onboarding_completed'
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
