import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, ActivityIndicator, Text, ScrollView } from 'react-native';
import { useMealPlanStore } from '@/lib/store';
import { useAuthStore } from '@/lib/auth-store';
import { reclassifyAllRecipes } from '@/lib/recipe-reclassifier';
import { prefetchPlanHeroImages } from '@/lib/image-prefetch';

// Adapter: read the signup-in-progress flag without subscribing to it. The
// signup flow may briefly desync isAuthenticated as Supabase swaps the anon
// session for the new real session; while _isSigningUp is true we must NOT
// interpret that as "user signed out" and wipe local data.
const isSigningUpNow = (): boolean => useAuthStore.getState()._isSigningUp;

interface StoreHydrationProps {
  children: React.ReactNode;
}

const HYDRATION_TIMEOUT = 30000; // 30 seconds - generous for tunnel/slow connections

export function StoreHydration({ children }: StoreHydrationProps) {
  const mealPlanHydrated = useMealPlanStore((s) => s._hasHydrated);
  const authHydrated = useAuthStore((s) => s._hasHydrated);
  const initializeAuth = useAuthStore((s) => s.initialize);
  const currentUser = useAuthStore((s) => s.currentUser);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const session = useAuthStore((s) => s.session);
  const loadUserData = useMealPlanStore((s) => s.loadUserData);
  const clearAllData = useMealPlanStore((s) => s.clearAllData);
  const isSyncing = useMealPlanStore((s) => s.isSyncing);
  const recipes = useMealPlanStore((s) => s.recipes);
  const updateRecipe = useMealPlanStore((s) => s.updateRecipe);

  const [isReady, setIsReady] = useState(false);
  const [hasLoadedUserData, setHasLoadedUserData] = useState(false);
  const [hasReclassified, setHasReclassified] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const previousUserIdRef = useRef<string | null>(null);
  const isLoadingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReadyRef = useRef(false);

  // Log initialization state
  useEffect(() => {
    console.log('[StoreHydration] State:', {
      mealPlanHydrated,
      authHydrated,
      isAuthenticated,
      hasValidSession: Boolean(session?.access_token),
      hasLoadedUserData,
      isSyncing,
      isReady,
    });
  }, [mealPlanHydrated, authHydrated, isAuthenticated, session?.access_token, hasLoadedUserData, isSyncing, isReady]);

  // Initialize auth on mount
  useEffect(() => {
    console.log('[StoreHydration] Initializing auth...');
    initializeAuth();
  }, [initializeAuth]);

  // Load user data when authenticated
  const loadData = useCallback(async (userId: string) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    console.log('Loading user data for:', userId);
    try {
      await loadUserData(userId);
      setHasLoadedUserData(true);
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      isLoadingRef.current = false;
    }
  }, [loadUserData]);

  useEffect(() => {
    const currentUserId = currentUser?.id || null;
    const hasValidSession = Boolean(session?.access_token);

    // Only load data if we have BOTH authentication state AND a valid session
    if (isAuthenticated && currentUserId && mealPlanHydrated && hasValidSession) {
      // Always load data when user logs in, even if it's the same user
      // This ensures fresh data from the database overrides stale local storage
      if (currentUserId !== previousUserIdRef.current) {
        loadData(currentUserId);
        previousUserIdRef.current = currentUserId;
      }
    }

    // User logged out or session became invalid.
    // CRITICAL: skip during signUp() — the anon → real swap briefly desyncs
    // isAuthenticated and wiping here would erase the guest's persona answers
    // (hasCompletedOnboarding etc), bouncing the freshly-signed-up user back
    // into /onboarding.
    if (
      (!isAuthenticated || !hasValidSession) &&
      previousUserIdRef.current &&
      !isSigningUpNow()
    ) {
      console.log('Clearing user data - session invalid or user logged out');
      clearAllData();
      previousUserIdRef.current = null;
      setHasLoadedUserData(false);
    }
  }, [isAuthenticated, currentUser?.id, session?.access_token, mealPlanHydrated, loadData, clearAllData]);

  // Reclassify existing recipes based on meal type content analysis
  useEffect(() => {
    if (hasLoadedUserData && recipes.length > 0 && !hasReclassified) {
      // IMPORTANT: Set flag BEFORE any async operations to prevent race condition
      // This prevents the effect from running twice when updateRecipe modifies the recipes array
      setHasReclassified(true);

      console.log('[RecipeReclassification] Starting reclassification of existing recipes...');

      const { report, updatedRecipes } = reclassifyAllRecipes(recipes);

      // Update recipes that were reclassified
      if (report.reclassified > 0) {
        console.log(`[RecipeReclassification] Updating ${report.reclassified} recipes with new meal types`);
        report.changes.forEach(change => {
          const updatedRecipe = updatedRecipes.find(r => r.name === change.recipeName);
          if (updatedRecipe) {
            updateRecipe(updatedRecipe.id, { tags: updatedRecipe.tags });
          }
        });
      }
    }
  }, [hasLoadedUserData, recipes, hasReclassified, updateRecipe]);

  // Keep ref in sync so the timeout callback can check current readiness
  useEffect(() => {
    isReadyRef.current = isReady;
    if (isReady && timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [isReady]);

  // Timeout handler - start once on mount, only show error if still not ready
  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      if (isReadyRef.current) return; // App loaded in time, no error
      const error = [
        `[Initialization Timeout] App took too long to load after ${HYDRATION_TIMEOUT / 1000} seconds.`,
        'Please check your internet connection and restart the app.',
      ].join('\n');
      console.error('[StoreHydration]', error);
      setInitError(error);
    }, HYDRATION_TIMEOUT);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []); // Only run once on mount

  useEffect(() => {
    // Wait for both stores to hydrate
    if (mealPlanHydrated && authHydrated) {
      const hasValidSession = Boolean(session?.access_token);

      // If user is authenticated WITH a valid session, wait for user data to load
      // If not authenticated or no valid session, we're ready immediately
      if (isAuthenticated && hasValidSession) {
        // Allow some time for data sync, or proceed if already synced
        if (hasLoadedUserData || !isSyncing) {
          console.log('[StoreHydration] Ready - authenticated user with loaded data');
          setIsReady(true);
          // Fire-and-forget: warm the 5 curated plan hero images so the home
          // tab + Curated Meal Plans listing render instantly on first open.
          // Idempotent at the helper level — safe to fire on every re-run.
          prefetchPlanHeroImages();
        }
      } else {
        console.log('[StoreHydration] Ready - unauthenticated or no valid session');
        setIsReady(true);
        prefetchPlanHeroImages();
      }
    }
  }, [mealPlanHydrated, authHydrated, isAuthenticated, session?.access_token, hasLoadedUserData, isSyncing]);

  if (initError) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#fefdfb' }}>
        <View style={{ padding: 20, paddingTop: 60 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#d32f2f', marginBottom: 16 }}>
            App Initialization Error
          </Text>
          <Text style={{ fontSize: 14, color: '#666', lineHeight: 22, fontFamily: 'monospace' }}>
            {initError}
          </Text>
          <Text style={{ fontSize: 12, color: '#999', marginTop: 20 }}>
            This usually means Supabase, authentication, or a required service failed to initialize.
            Please check your environment variables and internet connection, then restart the app.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fefdfb' }}>
        <ActivityIndicator size="large" color="#6a7d56" />
        <Text style={{ marginTop: 16, color: '#999', fontSize: 12 }}>Loading app...</Text>
      </View>
    );
  }

  return <>{children}</>;
}
