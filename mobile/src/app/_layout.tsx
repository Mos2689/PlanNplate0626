import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import { ThemeProvider } from '@react-navigation/core';
import { Stack, useRouter, useSegments, useGlobalSearchParams } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AppState, type AppStateStatus, Text, TextInput, View, ActivityIndicator, StyleSheet, Platform, InteractionManager } from 'react-native';
import { useColorScheme } from '@/lib/useColorScheme';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { StoreHydration } from '@/components/StoreHydration';
import { useAuthStore } from '@/lib/auth-store';
import { useNeedsProfileSetup, useSubscriptionLoading, useSubscriptionStore } from '@/lib/subscription-store';
import { useMealPlanStore } from '@/lib/store';
import { posthog, posthogEnabled, setFirebaseUserId } from '@/lib/analytics';
import { PostHogProvider } from 'posthog-react-native';
import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { initializeCacheTable } from '@/lib/recipe-cache';
import { PaywallSheet } from '@/components/PaywallSheet';
import { ManageMembershipSheet } from '@/components/ManageMembershipSheet';
import { AnnualOfferSheet } from '@/components/AnnualOfferSheet';
import { LimitedTimeMonthlyOfferSheet } from '@/components/LimitedTimeMonthlyOfferSheet';
import { useOfferFunnelStore } from '@/lib/offer-funnel-store';
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
import { FailureHost } from '@/components/failure';
import { SupportComposer } from '@/components/support/SupportComposer';
import { setCurrentScreen, startConnectivityMonitoring } from '@/lib/failure';
import { useShareTarget } from '@/hooks/useShareTarget';
import { useSupportNotifications } from '@/hooks/useSupportNotifications';
import { scheduleInactivityNotifications, scheduleMealPlanNotifications, cancelAllNotifications, requestNotificationPermissions, registerPushToken } from '@/lib/notifications';



export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
// `.catch()` swallows the dev-only "No native splash screen registered…"
// rejection that fires on Fast Refresh (the native splash is already gone by
// then). Harmless — production cold starts still show/hide it correctly.
SplashScreen.preventAutoHideAsync().catch(() => {});

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
  // One-time boot-landing guard. The login/signup paths redirect to Recipes
  // explicitly, but a RESTORED session (existing user reopening the app) skips
  // those screens and renders the tabs group root — which is `index` (Meal
  // Plan). We nudge that first boot to Recipes once, then never again, so later
  // taps on the Meal Plan tab aren't bounced.
  const didInitialLanding = useRef(false);

  useEffect(() => {
    // Don't redirect while auth is still loading or hydrating
    if (isLoading || !hasHydrated) {
      return;
    }

    const inAuthGroup = segments[0] === 'login' || segments[0] === 'signup' || segments[0] === 'reset-password' || segments[0] === 'verify-otp';
    const inOnboarding = segments[0] === 'onboarding';

    // First settled render: if a signed-up user booted straight onto the tabs
    // root (Meal Plan, the group index), send them to Recipes — the app's home.
    // Runs exactly once per launch; if they're anywhere else (recipes, auth,
    // onboarding) we just arm the guard so a later Meal Plan tap never bounces.
    // Wait for segments to resolve (empty during the very first boot frames) so
    // we don't arm the guard before the tabs route has mounted.
    if (!didInitialLanding.current && segments.length > 0) {
      didInitialLanding.current = true;
      if (
        isAuthenticated &&
        !isAnonymous &&
        segments[0] === '(tabs)' &&
        segments.length === 1
      ) {
        router.replace('/(tabs)/recipes');
        return;
      }
    }

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
      router.replace('/(tabs)/recipes');
    }
  }, [isAuthenticated, isAnonymous, isLoading, hasHydrated, segments, router, isPasswordResetFlow, params.reauth]);
}

function RootLayoutNav({ colorScheme }: { colorScheme: 'light' | 'dark' | null | undefined }) {
  useProtectedRoute();
  // Collects links arriving from the iOS share extension and the Android share
  // sheet, and opens /share-import once the app is past its auth/onboarding
  // gates. Mounted here for the same reason the deep-link effect below is: it
  // has to survive every screen the user might be on when a share arrives.
  useShareTarget();
  // Routes a tapped support-reply notification to /help/<threadId>, in all
  // three launch states. Mounted here for the same reason useShareTarget is:
  // the notification can arrive on any screen.
  useSupportNotifications();
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
      const screen = segments.join('/');
      posthog.screen(screen);
      // Every failure reported from here on is tagged with this screen, so
      // diagnostics can answer "where does this break?" without extra plumbing.
      setCurrentScreen(screen);
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

  // Firebase receives only the internal UUID. PostHog identification above is
  // intentionally unchanged and remains the primary analytics identity flow.
  useEffect(() => {
    void setFirebaseUserId(
      isAuthenticated && currentUser?.id && !isAnonymous ? currentUser.id : null,
    );
  }, [isAuthenticated, isAnonymous, currentUser?.id]);

  // Offer funnel: hydrate per-user AsyncStorage state (also catches up any
  // elapsed 24-hour window), and re-check the window whenever the app returns to
  // the foreground so a live limited-time offer can surface.
  useEffect(() => {
    const uid = currentUser?.id;
    if (uid) void useOfferFunnelStore.getState().hydrate(uid);
  }, [currentUser?.id]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') useOfferFunnelStore.getState().checkMonthlyWindow();
    });
    return () => sub.remove();
  }, []);

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

  // Initialize recipe cache on app start.
  // PERF: this is a Supabase round-trip whose result is never read (it only
  // warns when the table is missing), so running it during the first frame just
  // stole bandwidth from the user-data load. Deferred until after the initial
  // render/animation work settles — the check is equally useful a beat later.
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      initializeCacheTable();
    });
    return () => task.cancel();
  }, []);

  // Live entitlement updates: RevenueCat pushes new customer info the instant a
  // purchase or restore completes, so `isPremium` (and the profile Premium tag)
  // flips immediately instead of only after a tab switch or app refresh.
  useEffect(() => {
    useSubscriptionStore.getState().setupCustomerInfoListener();
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
    // PERF: deferred off the first frame — this triggers a native permission
    // dialog and its associated bridge work. It still resolves long before the
    // app can be backgrounded, which is the only place the permission is used.
    // The AppState listener below is registered synchronously, unchanged.
    const permissionTask = InteractionManager.runAfterInteractions(() => {
      requestNotificationPermissions()
        // Register the push token straight after, so a support reply can reach
        // the user when the app is closed. registerPushToken never prompts on
        // its own — it no-ops unless permission was already granted above.
        .then(() => registerPushToken())
        .catch(() => {});
    });

    const handleAppStateChange = (status: AppStateStatus) => {
      if (status === 'active') {
        // App is foregrounded, cancel all pending inactivity notifications
        void cancelAllNotifications();
      } else if (status === 'background' || status === 'inactive') {
        // App went to background, schedule inactivity notifications
        const profileName = useSubscriptionStore.getState().userSubscription?.name;
        const emailName = useAuthStore.getState().currentUser?.email?.split('@')[0];
        const userName = profileName || emailName || '';

        // Order matters: scheduleInactivityNotifications cancels ALL scheduled
        // notifications first, so schedule the meal-plan reminders AFTER it.
        void scheduleInactivityNotifications(userName).then(() =>
          scheduleMealPlanNotifications(),
        );
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      permissionTask.cancel();
      subscription.remove();
    };
  }, []);

  // Handle PKCE OAuth callbacks plus legacy password-reset/email fragment links.
  // Never log the incoming URL: it can contain a one-time code or session token.
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const result = await handleAuthRedirect(event.url);
      if (!result.handled) {
        // Not an auth callback. `parseAuthCallback` only claims URLs carrying a
        // code, access_token or error, so everything else falls through here.
        //
        // The iOS share extension asks iOS to open this after queueing a link
        // (see targets/share/ShareViewController.swift). If the OS grants it,
        // the import runs immediately instead of waiting for the user's next
        // launch. If it doesn't, nothing arrives and the queue is drained on
        // foreground as before — the app behaves identically either way.
        if (event.url.includes('share-import')) {
          router.push('/share-import');
        }
        return;
      }

      if (!result.success) {
        // Provider errors can contain one-time authorization codes. Keep the
        // diagnostic useful without writing credentials into production logs.
        console.error('[DeepLink] Auth callback failed.');
        return;
      }

      router.replace(result.type === 'recovery' ? '/reset-password' : '/(tabs)/recipes');
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
  // ALSO hold while a freshly-signed-in (non-anonymous) account is still
  // resolving its subscription/profile state. During that window
  // useNeedsProfileSetup() returns false ("can't tell yet, still loading"), so
  // willRedirectAway is briefly false AND the redirect effect early-returns on
  // `subscriptionLoading` — leaving the tabs (meal plan) visible for a frame
  // before the onboarding redirect fires. This closes that gap. It's
  // time-bounded (clears when loading completes), so a returning user that
  // resolves to needsProfileSetup=false just sees a brief spinner, not a hang.
  const resolvingFreshAccount =
    isAuthenticated &&
    !isAnonymous &&
    !isSigningUp &&
    !hasCompletedOnboarding &&
    subscriptionLoading;
  const holdForRedirect =
    storeHydrated && (willRedirectAway || resolvingFreshAccount) && !onAuthOrOnboarding;

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
        {/* "curated-meal-plan" is now the "inspired" tab (app/(tabs)/inspired.tsx). */}
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
        {/* Share to PlanNplate. Transparent so the sheet reads as an overlay on
            whatever the user was doing, rather than a full screen change — a
            share is a quick decision, not a destination. */}
        <Stack.Screen
          name="share-import"
          options={{
            headerShown: false,
            presentation: 'transparentModal',
            animation: 'fade',
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
        <Stack.Screen name="help/index" options={{ headerShown: false }} />
        <Stack.Screen name="help/[threadId]" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
      {/* Global PaywallSheet — mounted at the root so any caller from
          any tab/screen can fire openPaywallSheet(trigger) and the
          sheet slides up over the current view. */}
      <PaywallSheet isDark={colorScheme === 'dark'} />
      {/* Manage Membership — the PREMIUM counterpart to the paywall. Members'
          membership entry points open this (via openManageMembership) instead
          of the sales paywall. */}
      <ManageMembershipSheet isDark={colorScheme === 'dark'} />
      {/* Post-paywall offer funnel — the one-time annual offer and the later
          24-hour $3.99 offer. Both self-gate via useOfferFunnelStore. */}
      <AnnualOfferSheet isDark={colorScheme === 'dark'} />
      <LimitedTimeMonthlyOfferSheet isDark={colorScheme === 'dark'} />
      {/* Post-signup celebratory beat — fades in for ~1.2 s after a guest
          links their account, then auto-opens the onboarding paywall.
          Rendered AFTER the paywall so it stacks above during the cross-fade. */}
      <PostSignupWelcome />
      {/* Global review prompt — fired from positive moments via
          useReviewStore.getState().maybePrompt(). Self-gates on
          already-reviewed / snooze / don't-ask-again. */}
      <ReviewPromptModal isDark={colorScheme === 'dark'} />
      {/* Global support composer — raised from anywhere via
          openSupportComposer({ intent, feature }). Mounted BEFORE FailureHost
          so a failure toast can still appear over the sheet: the two surfaces
          co-operate (a failed send re-presents through FailureHost). */}
      <SupportComposer />
      {/* Global failure surfaces — toast / banner / dialog / offline banner.
          Same pattern as PaywallSheet above: mounted once, driven from
          anywhere via presentFailure(). Rendered last so it stacks on top. */}
      <FailureHost isDark={colorScheme === 'dark'} />
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

  // Connectivity monitoring. NetInfo was a dependency the app never imported,
  // so offline was previously indistinguishable from a generic request failure.
  useEffect(() => startConnectivityMonitoring(), []);


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
