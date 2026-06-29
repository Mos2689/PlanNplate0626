import { create } from 'zustand';
import {
  hasEntitlement,
  getCustomerInfo,
  setUserId,
  isRevenueCatEnabled,
} from './revenuecatClient';
import {
  fetchUserSubscription,
  updateUserPremiumStatus,
  updateUserProfile,
  upsertUser,
  pauseUserAccount,
  resumeUserAccount,
  deleteUserAccount,
  type UserSubscription,
  type AccountStatus,
} from './database';

// The trigger that opened the PaywallSheet — useful for analytics +
// for the sheet to show context-aware headline copy (e.g. "Keep cooking
// the vibe" when triggered from PnP, "Keep importing recipes" from
// the import flow, etc).
export type PaywallTrigger =
  | 'pnp-second-tap'
  | 'vibe-cooking'
  | 'import-recipe'
  | 'curated-plans'
  | 'profile-banner'
  | 'onboarding'
  | 'generating-plan'
  | 'speak-grocery-limit'
  | 'generic';

interface SubscriptionStore {
  // State
  isPremium: boolean;
  isLoading: boolean;
  userSubscription: UserSubscription | null;
  accountStatus: AccountStatus;
  _initializingUserId: string | null; // Track which user is being initialized

  // ── PaywallSheet visibility (global) ──
  // The sheet is mounted once at the root of the Meal Planning tab
  // and consumes this state. Any caller anywhere in the app can pop
  // it by invoking openPaywallSheet(trigger).
  paywallSheetTrigger: PaywallTrigger | null;
  openPaywallSheet: (trigger: PaywallTrigger) => void;
  closePaywallSheet: () => void;

  // ── Post-signup welcome beat (global, ephemeral) ──
  // Shown for ~1.2 s after a guest converts to a real account, before the
  // onboarding paywall slides up. Not persisted — a force-quit during the
  // welcome cleanly resets it.
  postSignupWelcome: { visible: boolean; name: string } | null;
  showPostSignupWelcome: (name: string) => void;
  hidePostSignupWelcome: () => void;

  // Actions
  initializeSubscription: (userId: string, email: string, name?: string) => Promise<void>;
  checkPremiumStatus: (userId: string) => Promise<boolean>;
  syncWithRevenueCat: (userId: string) => Promise<void>;
  clearSubscription: () => void;
  declineTrialOffer: (userId: string) => Promise<boolean>;

  // Account Management
  pauseAccount: (userId: string) => Promise<boolean>;
  resumeAccount: (userId: string) => Promise<boolean>;
  deleteAccount: (userId: string) => Promise<boolean>;

  // Profile Management
  updateProfile: (userId: string, updates: { name?: string; avatarUrl?: string | null; profileCompleted?: boolean }) => Promise<boolean>;
}

export const useSubscriptionStore = create<SubscriptionStore>()((set, get) => ({
  // Initial state
  isPremium: false,
  isLoading: true,
  userSubscription: null,
  accountStatus: 'active' as AccountStatus,
  _initializingUserId: null,
  paywallSheetTrigger: null,

  openPaywallSheet: (trigger: PaywallTrigger) => {
    set({ paywallSheetTrigger: trigger });
  },
  closePaywallSheet: () => {
    set({ paywallSheetTrigger: null });
  },

  postSignupWelcome: null,
  showPostSignupWelcome: (name: string) => {
    set({ postSignupWelcome: { visible: true, name } });
  },
  hidePostSignupWelcome: () => {
    set({ postSignupWelcome: null });
  },

  // Initialize subscription for a user
  initializeSubscription: async (userId: string, email: string, name?: string) => {
    const timestamp = new Date().toISOString();

    // RACE CONDITION PROTECTION: Check if already initializing this user
    const currentlyInitializing = get()._initializingUserId;
    if (currentlyInitializing === userId) {
      console.log(`[Subscription] ${timestamp} - SKIPPED: Already initializing user ${userId}`);
      return;
    }

    console.log(`[Subscription] ${timestamp} - START: Initializing subscription for user: ${userId}, email: ${email}`);

    // Set lock to prevent concurrent initialization
    set({ isLoading: true, _initializingUserId: userId });

    try {
      // Ensure user exists in Supabase - WITH RETRY for RLS timing issues
      console.log(`[Subscription] ${timestamp} - Upserting user in database (attempt 1)...`);

      let user = await upsertUser(userId, email, name);

      // RETRY MECHANISM: If first attempt fails, wait and retry
      if (!user) {
        console.warn(`[Subscription] ${timestamp} - First upsert attempt failed, retrying after 500ms...`);
        await new Promise(resolve => setTimeout(resolve, 500));

        console.log(`[Subscription] ${timestamp} - Upserting user in database (attempt 2)...`);
        user = await upsertUser(userId, email, name);

        if (!user) {
          console.warn(`[Subscription] ${timestamp} - Second upsert attempt failed, retrying after 1000ms...`);
          await new Promise(resolve => setTimeout(resolve, 1000));

          console.log(`[Subscription] ${timestamp} - Upserting user in database (attempt 3 - FINAL)...`);
          user = await upsertUser(userId, email, name);
        }
      }

      if (user) {
        console.log(`[Subscription] ${timestamp} - SUCCESS: User record created/updated: ${user.id}`);
        set({
          userSubscription: user,
          isPremium: user.isPremium,
          accountStatus: user.accountStatus || 'active',
        });
      } else {
        console.error(`[Subscription] ${timestamp} - FAILURE: Failed to create/update user record after 3 attempts`);
      }

      // Link RevenueCat to this user
      if (isRevenueCatEnabled()) {
        console.log(`[Subscription] ${timestamp} - Linking RevenueCat to user...`);
        await setUserId(userId);
      }

      // Sync subscription status with RevenueCat
      await get().syncWithRevenueCat(userId);

      console.log(`[Subscription] ${timestamp} - COMPLETE: Subscription initialization complete`);
    } catch (error) {
      console.error(`[Subscription] ${timestamp} - ERROR: Exception during subscription initialization:`, error);
    } finally {
      set({ isLoading: false, _initializingUserId: null });
    }
  },

  // Check if user has premium (from local state or refetch)
  checkPremiumStatus: async (userId: string) => {
    const { userSubscription } = get();

    // Quick check from local state
    if (userSubscription?.isPremium) {
      // Verify expiration
      if (userSubscription.premiumExpiresAt) {
        const expiresAt = new Date(userSubscription.premiumExpiresAt);
        if (expiresAt > new Date()) {
          return true;
        }
      } else {
        return true; // No expiration = lifetime or still active
      }
    }

    // Fetch fresh from database
    const subscription = await fetchUserSubscription(userId);
    if (subscription) {
      set({
        userSubscription: subscription,
        isPremium: subscription.isPremium,
        accountStatus: subscription.accountStatus || 'active',
      });
      return subscription.isPremium;
    }

    return false;
  },

  // Sync RevenueCat subscription status to Supabase
  syncWithRevenueCat: async (userId: string) => {
    if (!isRevenueCatEnabled()) {
      // If RevenueCat isn't configured, just use Supabase data
      const subscription = await fetchUserSubscription(userId);
      if (subscription) {
        set({
          userSubscription: subscription,
          isPremium: subscription.isPremium,
          accountStatus: subscription.accountStatus || 'active',
        });
      }
      return;
    }

    try {
      // Check RevenueCat entitlement. A transient SDK error can return
      // `ok: false` even for a paying user, so retry once before falling
      // back to the (possibly stale) Supabase row — a silent fallback
      // here is what risks a paid user seeing the paywall.
      let premiumResult = await hasEntitlement('premium');
      if (!premiumResult.ok && premiumResult.reason === 'sdk_error') {
        await new Promise((r) => setTimeout(r, 600));
        premiumResult = await hasEntitlement('premium');
      }

      if (!premiumResult.ok) {
        // Fallback to Supabase data if RevenueCat fails
        const subscription = await fetchUserSubscription(userId);
        if (subscription) {
          set({
            userSubscription: subscription,
            isPremium: subscription.isPremium,
            accountStatus: subscription.accountStatus || 'active',
          });
        }
        return;
      }

      const isPremium = premiumResult.data;

      // Get expiration date from RevenueCat
      let expiresAt: string | null = null;
      let revenuecatCustomerId: string | null = null;

      const customerInfoResult = await getCustomerInfo();
      if (customerInfoResult.ok) {
        const customerInfo = customerInfoResult.data;
        revenuecatCustomerId = customerInfo.originalAppUserId;

        // Get expiration from the premium entitlement
        const premiumEntitlement = customerInfo.entitlements.active?.['premium'];
        if (premiumEntitlement?.expirationDate) {
          expiresAt = premiumEntitlement.expirationDate;
        }
      }

      // Update Supabase with RevenueCat status
      await updateUserPremiumStatus(userId, isPremium, expiresAt, revenuecatCustomerId);

      // Fetch updated user data
      const subscription = await fetchUserSubscription(userId);
      if (subscription) {
        set({
          userSubscription: subscription,
          isPremium: subscription.isPremium,
          accountStatus: subscription.accountStatus || 'active',
        });
      } else {
        set({ isPremium });
      }
    } catch (error) {
      console.error('Error syncing with RevenueCat:', error);
    }
  },

  // Clear subscription state on logout
  clearSubscription: () => {
    set({
      isPremium: false,
      isLoading: false,
      userSubscription: null,
      accountStatus: 'active',
      _initializingUserId: null,
    });
  },

  // Mark user as having declined trial offer
  declineTrialOffer: async (userId: string) => {
    console.log(`[Subscription] User ${userId} declined trial offer`);
    // No action needed - RevenueCat will show isPremium = false since they didn't purchase
    return true;
  },

  // Pause account - stops subscription, keeps data
  pauseAccount: async (userId: string) => {
    try {
      const success = await pauseUserAccount(userId);
      if (success) {
        set({ accountStatus: 'paused' });
        // Update local subscription state
        const { userSubscription } = get();
        if (userSubscription) {
          set({
            userSubscription: {
              ...userSubscription,
              accountStatus: 'paused',
              pausedAt: new Date().toISOString(),
            },
          });
        }
      }
      return success;
    } catch (error) {
      console.error('Error pausing account:', error);
      return false;
    }
  },

  // Resume account - reactivates paused account
  resumeAccount: async (userId: string) => {
    try {
      const success = await resumeUserAccount(userId);
      if (success) {
        set({ accountStatus: 'active' });
        // Update local subscription state
        const { userSubscription } = get();
        if (userSubscription) {
          set({
            userSubscription: {
              ...userSubscription,
              accountStatus: 'active',
              pausedAt: null,
            },
          });
        }
      }
      return success;
    } catch (error) {
      console.error('Error resuming account:', error);
      return false;
    }
  },

  // Delete account - removes all data permanently
  deleteAccount: async (userId: string) => {
    try {
      const success = await deleteUserAccount(userId);
      if (success) {
        set({ accountStatus: 'deleted' });
      }
      return success;
    } catch (error) {
      console.error('Error deleting account:', error);
      return false;
    }
  },

  // Update user profile (name, avatar, etc.)
  updateProfile: async (userId: string, updates: { name?: string; avatarUrl?: string | null; profileCompleted?: boolean }) => {
    try {
      const updatedUser = await updateUserProfile(userId, updates);
      if (updatedUser) {
        set({ userSubscription: updatedUser });
        return true;
      }
      // Even if DB update fails, update local state so the modal closes
      // This handles the case where avatar_url/profile_completed columns don't exist yet
      const currentSubscription = get().userSubscription;
      if (currentSubscription) {
        set({
          userSubscription: {
            ...currentSubscription,
            name: updates.name ?? currentSubscription.name,
            avatarUrl: updates.avatarUrl ?? currentSubscription.avatarUrl,
            profileCompleted: updates.profileCompleted ?? currentSubscription.profileCompleted ?? true,
          }
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error updating profile:', error);
      return false;
    }
  },
}));

// Selector hooks for optimized re-renders
export const useIsPremium = () => useSubscriptionStore((s) => s.isPremium);
export const useSubscriptionLoading = () => useSubscriptionStore((s) => s.isLoading);
export const useAccountStatus = () => useSubscriptionStore((s) => s.accountStatus);
export const useIsAccountPaused = () => useSubscriptionStore((s) => s.accountStatus === 'paused');

// True only when we have a definitive answer for `isPremium`. While the
// store is still loading or `initializeSubscription` is mid-flight, the
// `isPremium=false` default is NOT trustworthy — call sites that gate
// features must hold off until this returns true, otherwise a paid user
// could see the paywall during the cold-start race.
export const useIsPremiumResolved = () =>
  useSubscriptionStore((s) => !s.isLoading && s._initializingUserId === null);

// Single boolean for gating call sites: "ok to open the paywall now?"
// False while resolving — call sites should no-op the tap (and kick a
// re-sync) rather than gate a paying user.
export const useCanGatePaywall = () => {
  const isPremium = useSubscriptionStore((s) => s.isPremium);
  const resolved = useIsPremiumResolved();
  return resolved && !isPremium;
};

// ───────────────────────────────────────────────────────────────────────────────
// ACCESS MODEL (no client-side trial)
// ───────────────────────────────────────────────────────────────────────────────
//
// Premium access is now strictly RevenueCat-driven. `isPremium` flips true
// when the user holds the 'premium' entitlement (paid subscription). There
// is no client-side soft trial — the previous 30-day comp on "Maybe later"
// has been removed.
//
// `useHasPremiumAccess` (and its alias `useHasAIAccess`) is the canonical
// access gate everywhere in the app.

/**
 * Canonical premium-access selector. Use this EVERYWHERE we gate AI /
 * premium features.
 */
export const useHasPremiumAccess = () => useSubscriptionStore((s) => s.isPremium);

// Alias kept for backward compatibility with existing call sites that
// import `useHasAIAccess`.
export const useHasAIAccess = useHasPremiumAccess;

// First-run paywall gating for the planning flow.
// Users get ONE free end-to-end planning flow (plan → save → grocery list).
// After they generate their first grocery list, hasUsedFreeTrial flips to true
// and from then on the paywall fires for any subsequent planning session.
// Premium subscribers are always allowed.
//
// NOTE: Reads `hasUsedFreeTrial` from useMealPlanStore via direct getState() to
// avoid circular dependency between stores. Components using this hook should
// also subscribe to isPremium so re-renders fire when premium status flips.
import { useMealPlanStore } from './store';

export const useNeedsPaywallForPlanning = () => {
  const isPremium = useSubscriptionStore((s) => s.isPremium);
  const isLoading = useSubscriptionStore((s) => s.isLoading);
  const initializingUserId = useSubscriptionStore((s) => s._initializingUserId);
  const hasUsedFreeTrial = useMealPlanStore((s) => s.preferences.hasUsedFreeTrial ?? false);
  if (isPremium) return false;
  // Don't gate while subscription state is still resolving — the
  // `isPremium=false` default isn't trustworthy yet, and gating here
  // would briefly paywall a paying user on cold start.
  if (isLoading || initializingUserId !== null) return false;
  return hasUsedFreeTrial;
};

// Inverse helper for clarity at call sites that read like "do I have access?"
export const useHasPlanningAccess = () => !useNeedsPaywallForPlanning();

// (Trial-days selector now defined alongside the trial-state group above;
//  the legacy "always returns 0" stub was removed when we wired the real
//  30-day client-side trial anchored on userSubscription.createdAt.)

// Check if profile setup is needed (first-time user)
// A user needs profile setup if profileCompleted is not true
// Note: We DON'T check for name because users provide their name during signup,
// but we still want to show onboarding for first-time users
export const useNeedsProfileSetup = () => useSubscriptionStore((s) => {
  // If still loading, we can't determine yet - return false but caller should check isLoading
  if (s.isLoading) return false;

  // If no userSubscription after loading completes, user needs setup (new user)
  if (!s.userSubscription) return true;

  // Only rely on profileCompleted flag - this is set to true after onboarding is complete
  if (s.userSubscription.profileCompleted) return false;

  // Otherwise, needs profile setup
  return true;
});

// Get user avatar URL
export const useUserAvatar = () => useSubscriptionStore((s) => s.userSubscription?.avatarUrl ?? null);

// Get user name
export const useUserName = () => useSubscriptionStore((s) => s.userSubscription?.name ?? null);
