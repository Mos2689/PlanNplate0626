import PostHog from 'posthog-react-native';

export type AnalyticsEvent = 
  | 'onboarding_step_viewed'
  | 'onboarding_completed'
  | 'ui_button_tapped'
  | 'auth_signup'
  | 'auth_login';

type Sink = (event: AnalyticsEvent, props?: Record<string, any>) => void;

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

export const posthog = new PostHog(process.env.EXPO_PUBLIC_POSTHOG_API_KEY || '', {
  host: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
});

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

const sinks: Sink[] = [postHogSink, devSink];

export const track = (event: AnalyticsEvent, props?: Record<string, any>) => {
  sinks.forEach((sink) => {
    try {
      sink(event, props);
    } catch (e) {
      console.error(`[Analytics Error] Sink failed for event: ${event}`, e);
    }
  });
};
