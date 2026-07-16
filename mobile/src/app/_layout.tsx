import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import { ThemeProvider } from '@react-navigation/core';
import { Stack, useRouter, useSegments, useGlobalSearchParams } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AppState, type AppStateStatus, Text, TextInput, View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useColorScheme } from '@/lib/useColorScheme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { StoreHydration } from '@/components/StoreHydration';
import { useAuthStore } from '@/lib/auth-store';
import { useNeedsProfileSetup, useSubscriptionLoading, useSubscriptionStore } from '@/lib/subscription-store';
import { useMealPlanStore } from '@/lib/store';
import { posthog, posthogEnabled } from '@/lib/analytics';
import { PostHogProvider } from 'posthog-react-native';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { initializeCacheTable } from '@/lib/recipe-cache';
import { PaywallSheet } from '@/components/PaywallSheet';
import { PostSignupWelcome } from '@/components/PostSignupWelcome';
import { ReviewPromptModal } from '@/components/ReviewPromptModal';
import {
  useFonts,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
} from '@expo-google-fonts/geist';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import { initializeMetaSDK } from '@/lib/meta-sdk';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { scheduleInactivityNotifications, cancelAllNotifications, requestNotificationPermissions } from '@/lib/notifications';



export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Globally disable font scaling to ensure UI consistency across devices,
// especially on Android where system font scaling often breaks layouts.
if (Platform.OS === 'android') {
  // @ts-expect-error - defaultProps is not strictly typed on Text in newer RN versions
  if (Text.defaultProps == null) Text.defaultProps = {};
  // @ts-expect-error
  Text.defaultProps.allowFontScaling = false;

  // @ts-expect-error
  if (TextInput.defaultProps == null) TextInput.defaultProps = {};
  // @ts-expect-error
  TextInput.defaultProps.allowFontScaling = false;
}

const queryClient = new QueryClient();

function useProtectedRoute() {
  const segments = useSegments();
  const router = useRouter();
  const params = useGlobalSearchParams<{ reauth?: string }>();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAnonymous = useAuthStore((s) => s.isAnonymous);
  const isLoading = useAuthStore((s) => s.isLoading);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const isPasswordResetFlow = useAuthStore((s) => s.isPasswordResetFlow);

  useEffect(() => {
    // Don't redirect while auth is still loading or hydrating
    if (isLoading || !hasHydrated) {
      return;
    }

    const inAuthGroup = segments[0] === 'login' || segments[0] === 'signup' || segments[0] === 'reset-password' || segments[0] === 'verify-otp';
    const inOnboarding = segments[0] === 'onboarding';

    // If in password reset flow, don't redirect away from auth screens
    if (isPasswordResetFlow) {
      return;
    }

    // AUTH-LAST: we no longer force unauthenticated users to /login. On launch
    // the auth store creates a silent anonymous session, so the app opens
    // straight into onboarding. The login/signup screens are only reached
    // intentionally (the signup gate, or "already have an account?").
    //
    // Bounce a fully signed-up (NON-anonymous) user off the auth screens once
    // they're authenticated. An ANONYMOUS user must be allowed to sit on
    // /login or /signup — that's the gate where they create their account.
    // Deliberate re-auth intent (welcome "Sign in" passes ?reauth=1): keep the
    // user on the login form instead of bouncing them to the tabs.
    const reauthIntent = segments[0] === 'login' && params.reauth === '1';

    if (
      isAuthenticated &&
      !isAnonymous &&
      inAuthGroup &&
      !reauthIntent &&
      segments[0] !== 'reset-password' &&
      segments[0] !== 'verify-otp' &&
      !inOnboarding
    ) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isAnonymous, isLoading, hasHydrated, segments, router, isPasswordResetFlow, params.reauth]);
}

function RootLayoutNav({ colorScheme }: { colorScheme: 'light' | 'dark' | null | undefined }) {
  useProtectedRoute();
  const router = useRouter();
  const segments = useSegments();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAnonymous = useAuthStore((s) => s.isAnonymous);
  const isSigningUp = useAuthStore((s) => s._isSigningUp);
  const handleAuthRedirect = useAuthStore((s) => s.handleAuthRedirect);
  const needsProfileSetup = useNeedsProfileSetup();
  const subscriptionLoading = useSubscriptionLoading();
  const storeHydrated = useMealPlanStore((s) => s._hasHydrated);
  const isSyncing = useMealPlanStore((s) => s.isSyncing);
  const hasCompletedOnboarding = useMealPlanStore(
    (s) => s.preferences.hasCompletedOnboarding,
  );
  const currentUser = useAuthStore((s) => s.currentUser);

  // PostHog screen tracking
  useEffect(() => {
    if (segments.length > 0) {
      posthog.screen(segments.join('/'));
    }
  }, [segments]);

  // PostHog auth tracking
  useEffect(() => {
    if (isAuthenticated && currentUser?.id && !isAnonymous) {
      posthog.identify(currentUser.id, {
        email: currentUser.email,
        name: currentUser.name || '',
      });
    } else if (!isAuthenticated) {
      posthog.reset();
    }
  }, [isAuthenticated, isAnonymous, currentUser]);

  // AUTH-LAST: onboarding comes FIRST, before the meal-planning screen, for
  // every fresh user. We gate on the locally-persisted `hasCompletedOnboarding`
  // flag (reset on data-clear) rather than auth/subscription state, so the
  // redirect fires even before — or independent of — the anonymous session.
  useEffect(() => {
    // Wait for the persisted preferences to hydrate, otherwise the default
    // (false) would briefly bounce a user who HAS completed onboarding.
    if (!storeHydrated) return;

    const isInOnboarding = segments[0] === 'onboarding';
    const isInAuthGroup = segments[0] === 'login' || segments[0] === 'signup' ||
                          segments[0] === 'reset-password' || segments[0] === 'verify-otp';
    if (isInOnboarding || isInAuthGroup) return;

    if (!hasCompletedOnboarding) {
      // Suppress the redirect while signup is mid-flight OR while server data
      // is still being pulled in for a freshly-signed-in user. Without this,
      // the brief window between auth-state-changed and loadUserData() finishing
      // makes us race-redirect to /onboarding even though the server has
      // hasCompletedOnboarding=true — which is what was happening for
      // returning users on logout → log-back-in.
      if (isSigningUp || isSyncing) return;

      // AUTH-FIRST: unauthenticated OR anonymous users must create an account
      // (or sign in) BEFORE onboarding. Signup is now the first screen; the
      // deferred signup gate (post plan+grocery) no longer fires because users
      // are never anonymous once they're through here.
      if (!isAuthenticated || isAnonymous) {
        const timer = setTimeout(() => {
          router.replace('/signup');
        }, 50);
        return () => clearTimeout(timer);
      }

      // A real (non-anonymous) signed-in account that hasn't finished onboarding.
      // While subscription state is still resolving right after sign-in, WAIT
      // rather than bounce — otherwise a RETURNING user briefly lands here. A
      // returning account that already completed onboarding (profileCompleted)
      // is never sent to onboarding; a fresh signup (profileCompleted=false)
      // falls through to the persona flow.
      if (subscriptionLoading) return; // still resolving — don't decide yet
      if (!needsProfileSetup) return; // returning account, already set up

      console.log('[Navigation] Redirecting to onboarding (not yet completed)');
      const timer = setTimeout(() => {
        router.replace('/onboarding');
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [
    storeHydrated,
    hasCompletedOnboarding,
    isAuthenticated,
    isAnonymous,
    isSigningUp,
    isSyncing,
    subscriptionLoading,
    needsProfileSetup,
    segments,
    router,
  ]);

  // Initialize recipe cache on app start
  useEffect(() => {
    initializeCacheTable();
  }, []);

  // Re-sync RevenueCat on foreground. Webhook-driven entitlement changes
  // (new subscription, refund, restore on another device) won't reach a
  // backgrounded app — without this, a paying user could come back to a
  // stale `isPremium=false` and see the paywall on their next tap.
  useEffect(() => {
    const handleChange = (status: AppStateStatus) => {
      if (status === 'active') {
        const userId = useAuthStore.getState().currentUser?.id;
        if (userId) {
          void useSubscriptionStore.getState().syncWithRevenueCat(userId);
        }
      }
    };
    const sub = AppState.addEventListener('change', handleChange);
    return () => sub.remove();
  }, []);

  // Handle inactivity notifications scheduling based on AppState
  useEffect(() => {
    // We optionally request permissions on first mount in this component 
    // so we can schedule them when they leave.
    requestNotificationPermissions().catch(() => {});

    const handleAppStateChange = (status: AppStateStatus) => {
      if (status === 'active') {
        // App is foregrounded, cancel all pending inactivity notifications
        void cancelAllNotifications();
      } else if (status === 'background' || status === 'inactive') {
        // App went to background, schedule inactivity notifications
        const profileName = useSubscriptionStore.getState().userSubscription?.name;
        const emailName = useAuthStore.getState().currentUser?.email?.split('@')[0];
        const userName = profileName || emailName || '';
        
        void scheduleInactivityNotifications(userName);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  // Handle PKCE OAuth callbacks plus legacy password-reset/email fragment links.
  // Never log the incoming URL: it can contain a one-time code or session token.
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const result = await handleAuthRedirect(event.url);
      if (!result.handled) return;

      if (!result.success) {
        console.error('[DeepLink] Auth callback failed:', result.error);
        return;
      }

      router.replace(result.type === 'recovery' ? '/reset-password' : '/(tabs)');
    };

    // Handle initial URL (app opened via link)
    Linking.getInitialURL()
      .then((url) => {
        if (url) void handleDeepLink({ url });
      })
      .catch((error) => {
        console.error('[DeepLink] Unable to read initial URL:', error);
      });

    // Listen for incoming links while app is open
    const subscription = Linking.addEventListener('url', handleDeepLink);

    return () => {
      subscription.remove();
    };
  }, [handleAuthRedirect, router]);

  // Prevent the first-launch flash of the meal tab: for an un-onboarded user
  // the tab group can render for a frame before the gate redirects to
  // signup/onboarding. We only hold while a redirect is ACTUALLY going to
  // happen — i.e. the user will be sent to signup (unauthenticated/anonymous)
  // or to onboarding (a fresh account that still needs profile setup).
  //
  // CRITICAL: a returning account (authenticated, profileCompleted → so
  // needsProfileSetup is false) is intentionally kept on the tabs by the
  // redirect effect even when its locally-loaded preferences report
  // hasCompletedOnboarding=false (e.g. the server has no preferences row yet).
  // In that case NO navigation occurs, so gating the overlay purely on
  // !hasCompletedOnboarding left it covering the loaded tabs forever — an
  // infinite spinner. Aligning the hold with the redirect decision fixes it.
  const seg0 = segments[0];
  const onAuthOrOnboarding =
    seg0 === 'login' || seg0 === 'signup' || seg0 === 'reset-password' ||
    seg0 === 'verify-otp' || seg0 === 'onboarding';
  const willRedirectAway =
    !hasCompletedOnboarding &&
    !isSigningUp &&
    (!isAuthenticated || isAnonymous || needsProfileSetup);
  const holdForRedirect = storeHydrated && willRedirectAway && !onAuthOrOnboarding;

  return (
    <View style={{ flex: 1 }}>
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen name="verify-otp" options={{ headerShown: false }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="recipe-detail"
          options={{
            headerShown: false,
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="select-recipe"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="generate-recipe"
          options={{
            headerShown: false,
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="add-recipe"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="curated-meal-plan"
          options={{
            headerShown: false,
            // 'card' (not 'modal') — entire curated flow is a fullscreen
            // push stack from tabs. Using 'modal' here showed a bottom-
            // sheet-style sheet that stayed visible behind the detail page
            // when you tapped a plan (because card pushes inside the
            // modal's nav stack, the modal effect persists).
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="curated-plan-detail"
          options={{
            headerShown: false,
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="curated-recipe-detail"
          options={{
            headerShown: false,
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="curated-plan-browse"
          options={{
            headerShown: false,
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="curated-plan-setup"
          options={{
            headerShown: false,
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="import-recipe"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="import-review"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="paywall"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="vibe-cooking"
          options={{
            headerShown: false,
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="onboarding"
          options={{
            headerShown: false,
            // Disable iOS edge-swipe-back so users can't accidentally pop
            // the entire onboarding flow and land back on the meal plan
            // tab. The screen handles its own step-by-step back via the
            // in-screen ArrowLeft button + Android hardware back handler.
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="plan-meals" options={{ headerShown: false }} />
        <Stack.Screen name="privacy" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
      {/* Global PaywallSheet — mounted at the root so any caller from
          any tab/screen can fire openPaywallSheet(trigger) and the
          sheet slides up over the current view. */}
      <PaywallSheet isDark={colorScheme === 'dark'} />
      {/* Post-signup celebratory beat — fades in for ~1.2 s after a guest
          links their account, then auto-opens the onboarding paywall.
          Rendered AFTER the paywall so it stacks above during the cross-fade. */}
      <PostSignupWelcome />
      {/* Global review prompt — fired from positive moments via
          useReviewStore.getState().maybePrompt(). Self-gates on
          already-reviewed / snooze / don't-ask-again. */}
      <ReviewPromptModal isDark={colorScheme === 'dark'} />
    </ThemeProvider>
      {holdForRedirect && (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: '#fefdfb', alignItems: 'center', justifyContent: 'center' },
          ]}
        >
          <ActivityIndicator size="large" color="#6a7d56" />
        </View>
      )}
    </View>
  );
}

export default function RootLayout() {
  // App refreshed with updated OpenAI and auth code
  const colorScheme = useColorScheme();

  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    InstrumentSerif_400Regular_Italic,
  });

  // Register global JS exception interceptor
  useEffect(() => {
    const globalAny = global as any;
    if (globalAny.ErrorUtils) {
      const previousHandler = globalAny.ErrorUtils.getGlobalHandler();
      globalAny.ErrorUtils.setGlobalHandler((error: any, isFatal: any) => {
        console.error('[GlobalErrorHandler] Caught global JS error:', error, 'isFatal:', isFatal);
        if (previousHandler) {
          previousHandler(error, isFatal);
        }
      });
    }
  }, []);

  // CRITICAL: Hide the native splash screen once the app has mounted.
  // Without this call, production iOS builds (App Store, TestFlight) get stuck
  // on a blank/white splash screen forever because preventAutoHideAsync() above
  // tells iOS not to dismiss it automatically. StoreHydration shows its own
  // loading indicator while data hydrates, so it's safe to hide immediately.
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {
        // Ignore - splash may already be hidden or unavailable on web
      });
    }
  }, [fontsLoaded, fontError]);

  // Initialize Meta SDK (ATT request on iOS, standard tracking initialization)
  useEffect(() => {
    initializeMetaSDK();
  }, []);


  if (!fontsLoaded && !fontError) {
    return null;
  }

  const tree = (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <StoreHydration>
              <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
              <RootLayoutNav colorScheme={colorScheme} />
            </StoreHydration>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );

  // Only mount PostHogProvider when analytics is actually configured — with no
  // API key `posthog` is a no-op stub and the provider's autocapture would have
  // nothing valid to talk to.
  // Cast to `any`: posthog-react-native's provider return type (`Element | null`)
  // trips React 19's stricter JSX component typing. Runtime is unaffected.
  const Provider = PostHogProvider as any;
  return posthogEnabled ? (
    <Provider client={posthog} autocapture>
      {tree}
    </Provider>
  ) : (
    tree
  );
}
