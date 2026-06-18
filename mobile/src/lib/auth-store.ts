import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from './supabase';
import type { User, Session } from '@supabase/supabase-js';
import { useSubscriptionStore } from './subscription-store';
import { sendWelcomeEmail, sendVerificationEmail } from './email';
import { logoutUser as revenuecatLogout } from './revenuecatClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * AUTH ARCHITECTURE:
 *
 * SEPARATE FLOWS:
 * - signUp(): Calls supabase.auth.signUp() directly. NEVER does a pre-flight
 *   signInWithPassword (that pattern was removed because it created a real
 *   session as a side effect, which raced the auth listener and briefly
 *   logged users into the home tab — a real security/UX bug).
 * - login(): Uses supabase.auth.signInWithPassword() for existing accounts.
 *
 * DUPLICATE EMAIL DETECTION (in signUp):
 *   With Supabase "Confirm email" enabled (production setting), Supabase
 *   intentionally returns a user object with identities=[] for existing
 *   emails (anti-enumeration). That is the canonical signal we use to
 *   block duplicate signups, in addition to the explicit
 *   "User already registered" error string and a created_at age check.
 *   Returns: "An account with this email already exists. Please log in instead."
 *
 * SIGNUP SESSION GUARD:
 *   The store exposes an _isSigningUp flag. While true, the
 *   onAuthStateChange listener will NOT promote any session to
 *   isAuthenticated=true. This prevents any transient session created
 *   by signUp() from racing the defensive signOut() and briefly routing
 *   the user into the home tab.
 *
 * SESSION ROUTING:
 * - initialize(): Checks supabase.auth.getSession() on app startup.
 * - If session exists with valid access_token => route to Home (/(tabs))
 * - If no session => route to Login (/login)
 * - Listens to supabase.auth.onAuthStateChange() to keep UI in sync.
 *
 * PERSISTENCE:
 * - Supabase client configured with AsyncStorage for session persistence.
 * - Users stay logged in across app restarts (autoRefreshToken: true).
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

interface AuthStore {
  // Hydration
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;

  // Auth state
  currentUser: AuthUser | null;
  session: Session | null;
  isAuthenticated: boolean;
  // True while the user is on a silent Supabase ANONYMOUS session (no email
  // yet). They can use onboarding / plan / grocery; signup links this same
  // user to an email (preserving all their data), flipping this to false.
  isAnonymous: boolean;
  isLoading: boolean;

  // Guard: when true, the onAuthStateChange listener will NOT promote a
  // session to isAuthenticated=true. Set during signUp() so that any
  // transient session created by Supabase (e.g. when Confirm Email is OFF,
  // or during a re-signup attempt) cannot race the defensive signOut() and
  // briefly route the user into the app. Always cleared in finally.
  _isSigningUp: boolean;

  // OTP state for password reset
  otpEmail: string | null;
  otpSessionId: string | null;
  isPasswordResetFlow: boolean; // Track if user is in password reset flow

  // Actions
  initialize: () => Promise<void>;
  checkEmailExists: (email: string) => Promise<{ exists: boolean; error?: string }>;
  signUp: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  sendPasswordResetOTP: (email: string) => Promise<{ success: boolean; error?: string }>;
  verifyOTP: (otp: string) => Promise<{ success: boolean; error?: string }>;
  resetPasswordWithOTP: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  clearOTPState: () => void;
  logout: () => Promise<void>;
  setSession: (session: Session | null) => void;

  // DEV ONLY: Nuke all persisted auth state (Supabase tokens, Zustand, meal
  // plan store). Use when a session is stuck and cannot be cleared by normal
  // logout. This wipes AsyncStorage keys used by Supabase and resets all
  // stores, giving a true "fresh install" experience on next launch.
  devClearAllSessions: () => Promise<void>;
}

const mapSupabaseUser = (user: User): AuthUser => ({
  id: user.id,
  email: user.email || '',
  name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
  createdAt: user.created_at,
});

// A session may be promoted to authenticated when its user is either a real
// (email-verified) account OR a silent anonymous guest. Anonymous users have
// no email to confirm, so they bypass the email-verified requirement.
const isAnonUser = (user?: User | null): boolean => !!user?.is_anonymous;
const isUsableSession = (user?: User | null): boolean =>
  !!user && (isAnonUser(user) || !!user.email_confirmed_at);

/**
 * Ensures a user entry exists in the users table.
 * This is a fallback in case the database trigger fails.
 * Includes comprehensive logging for debugging.
 */
const ensureUserTableEntry = async (
  userId: string,
  email: string,
  name: string
): Promise<void> => {
  if (!isSupabaseConfigured()) {
    console.warn('[Auth] Supabase not configured - skipping user table entry');
    return;
  }

  try {
    console.log('[Auth] Ensuring user table entry exists for:', userId);

    // First check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is expected for new users
      console.error('[Auth] Error checking for existing user:', checkError);
    }

    if (existingUser) {
      console.log('[Auth] User already exists in users table:', userId);
      return;
    }

    // User doesn't exist, create entry
    console.log('[Auth] Creating user entry in users table:', {
      userId,
      email,
      name,
      timestamp: new Date().toISOString(),
    });

    const { error: insertError } = await supabase.from('users').insert({
      id: userId,
      email: email,
      name: name,
      is_premium: false,
      account_status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error('[Auth] Error creating user entry:', {
        error: insertError,
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        userId,
        email,
      });

      // If it's a duplicate key error, the trigger might have created it
      if (insertError.code === '23505') {
        console.log('[Auth] User entry was created by trigger (duplicate key)');
        return;
      }

      throw insertError;
    }

    console.log('[Auth] Successfully created user entry in users table:', {
      userId,
      email,
      name,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Auth] Failed to ensure user table entry:', {
      error,
      userId,
      email,
      name,
      timestamp: new Date().toISOString(),
    });
    // Don't throw - we don't want to block the signup flow
    // The user can still use the app, and we can retry later
  }
};

export const useAuthStore = create<AuthStore>()((set, get) => ({
  // Hydration
  _hasHydrated: false,
  setHasHydrated: (state) => set({ _hasHydrated: state }),

  // Initial state
  currentUser: null,
  session: null,
  isAuthenticated: false,
  isAnonymous: false,
  isLoading: true,
  otpEmail: null,
  otpSessionId: null,
  isPasswordResetFlow: false,
  _isSigningUp: false,

  // Initialize - check for existing session
  initialize: async () => {
    if (!isSupabaseConfigured()) {
      console.warn('[Auth] Supabase not configured - auth disabled');
      set({ _hasHydrated: true, isLoading: false });
      return;
    }

    try {
      console.log('[Auth] Initializing - checking for existing session...');
      let { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.error('[Auth] Error getting session:', error.message);
        // Clear any stale session data on error
        set({
          _hasHydrated: true,
          isLoading: false,
          session: null,
          currentUser: null,
          isAuthenticated: false,
          isAnonymous: false,
        });
        return;
      }

      // AUTH-LAST: a fresh install has no session. Rather than forcing the
      // login screen, sign in SILENTLY as an anonymous guest so the user can
      // go straight into onboarding → first plan → first grocery. Signup later
      // links this same user (keeping all their data). Requires "Anonymous
      // sign-ins" enabled in the Supabase project; if it's disabled the call
      // errors and we fall back to an unauthenticated state.

      // ── Guard: validate that an existing session's JWT is actually usable ──
      // Supabase caches sessions in AsyncStorage and getSession() returns them
      // even when the access_token has expired. If the JWT is expired, try a
      // server-side refresh. If that also fails the session is truly dead —
      // sign it out so we can fall through to a fresh anonymous session below.
      if (session?.access_token) {
        let tokenAlive = false;
        try {
          const parts = session.access_token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            tokenAlive = payload.exp > Math.floor(Date.now() / 1000) + 30; // 30s buffer
          }
        } catch {
          // malformed token → treat as expired
        }

        if (!tokenAlive) {
          console.log('[Auth] Existing session JWT expired — attempting refresh...');
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError || !refreshData.session) {
            console.warn('[Auth] Refresh failed — clearing stale session:', refreshError?.message);
            await supabase.auth.signOut().catch(() => {});
            session = null; // fall through to anonymous sign-in below
          } else {
            console.log('[Auth] Session refreshed successfully');
            session = refreshData.session;
          }
        }
      }

      if (!session?.user) {
        console.log('[Auth] No session - creating anonymous guest session...');
        const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
        if (anonError) {
          console.error(
            '[Auth] Anonymous sign-in failed (is "Anonymous sign-ins" enabled in Supabase?):',
            anonError.message,
          );
        } else {
          session = anonData.session;
        }
      }

      // Promote a session that is usable: anonymous guest OR verified real user.
      if (session?.user && session?.access_token && isUsableSession(session.user)) {
        const anonymous = isAnonUser(session.user);
        console.log(
          `[Auth] Active session for ${anonymous ? 'anonymous guest' : 'user'}:`,
          session.user.id,
        );
        const authUser = mapSupabaseUser(session.user);
        set({
          session,
          currentUser: authUser,
          isAuthenticated: true,
          isAnonymous: anonymous,
          _hasHydrated: true,
          isLoading: false,
        });

        // Initialize subscription for the session (guest or real).
        console.log('[Auth] Initializing subscription...');
        useSubscriptionStore.getState().initializeSubscription(
          authUser.id,
          authUser.email,
          authUser.name
        );
      } else if (session?.user) {
        // Real user with an unverified email — keep the existing security
        // behaviour: do not authenticate, sign the stale session out.
        console.log('[Auth] Session found but email not verified - signing out');
        await supabase.auth.signOut();
        set({
          _hasHydrated: true,
          isLoading: false,
          session: null,
          currentUser: null,
          isAuthenticated: false,
          isAnonymous: false,
        });
        // Settle the subscription gate so the app doesn't hang on a loading
        // state while there's no usable session.
        useSubscriptionStore.getState().clearSubscription();
      } else {
        // No session at all (e.g. anonymous sign-in unavailable). Don't hang —
        // onboarding routing keys off the local flag, and the subscription gate
        // is settled so downstream screens render.
        console.log('[Auth] No valid session found');
        set({
          _hasHydrated: true,
          isLoading: false,
          session: null,
          currentUser: null,
          isAuthenticated: false,
          isAnonymous: false,
        });
        useSubscriptionStore.getState().clearSubscription();
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange((event, session) => {
        console.log('[Auth] Auth state changed:', event, session?.user?.id);

        // Skip INITIAL_SESSION if we already handled it above
        if (event === 'INITIAL_SESSION') {
          return;
        }

        // Only update state for meaningful auth events
        // Ignore TOKEN_REFRESHED to prevent brief unauthenticated states
        if (event === 'TOKEN_REFRESHED' && session?.user) {
          // Just update the session, keep authenticated state
          set({
            session,
            currentUser: mapSupabaseUser(session.user),
            isAnonymous: isAnonUser(session.user),
          });
          return;
        }

        // Handle SIGNED_IN event - this is when user logs in or signs up
        // NOTE: We do NOT call initializeSubscription here because it's already
        // called from signUp() and login() functions. Calling it twice causes race conditions.
        if (event === 'SIGNED_IN' && session?.user && session?.access_token) {
          // SECURITY: never promote a session created during signUp() to
          // authenticated state. Without this guard, Supabase's signUp()
          // call can briefly create a session that fires SIGNED_IN before
          // signUp()'s defensive signOut() runs, racing the router into the
          // home tab. The signUp() flow is responsible for routing on success.
          if (get()._isSigningUp) {
            console.log('[Auth] Ignoring SIGNED_IN during signup flow (guard)');
            return;
          }
          // Verified real user OR anonymous guest may authenticate.
          if (!isUsableSession(session.user)) {
            console.log('[Auth] User signed in but email not verified - not authenticating');
            return;
          }
          console.log('[Auth] User signed in:', session.user.id);
          const authUser = mapSupabaseUser(session.user);
          set({
            session,
            currentUser: authUser,
            isAuthenticated: true,
            isAnonymous: isAnonUser(session.user),
          });
          // Do NOT initialize subscription here - it's handled by signUp/login
          return;
        }

        if (session?.user && session?.access_token) {
          // Same guard as above for any non-SIGNED_IN session promotion.
          if (get()._isSigningUp) {
            console.log('[Auth] Ignoring session promotion during signup flow (guard)');
            return;
          }
          // Verified real user OR anonymous guest may authenticate.
          if (!isUsableSession(session.user)) {
            console.log('[Auth] Session active but email not verified - not authenticating');
            return;
          }
          console.log('[Auth] User session active:', session.user.id);
          set({
            session,
            currentUser: mapSupabaseUser(session.user),
            isAuthenticated: true,
            isAnonymous: isAnonUser(session.user),
          });
        } else if (event === 'SIGNED_OUT') {
          console.log('[Auth] User signed out');
          // Only clear auth on explicit sign out
          set({
            session: null,
            currentUser: null,
            isAuthenticated: false,
            isAnonymous: false,
          });
        }
      });
    } catch (error) {
      console.error('[Auth] Auth initialization error:', error);
      set({
        _hasHydrated: true,
        isLoading: false,
        session: null,
        currentUser: null,
        isAuthenticated: false,
      });
    }
  },

  // Check if email already exists (for early validation during signup)
  checkEmailExists: async (email: string) => {
    if (!isSupabaseConfigured()) {
      return { exists: false, error: 'Supabase not configured' };
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (!normalizedEmail || !normalizedEmail.includes('@') || !normalizedEmail.includes('.')) {
      return { exists: false }; // Invalid email, don't check
    }

    try {
      console.log('[Auth] Checking if email already exists:', normalizedEmail);

      // Use signInWithOtp with shouldCreateUser: false
      // If user does NOT exist, Supabase returns an error
      // If user DOES exist, it sends an OTP (we don't care about that here)
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: false },
      });

      if (error) {
        // "Email not confirmed" or similar means user exists but unverified
        if (error.message.toLowerCase().includes('not confirmed') ||
            error.message.toLowerCase().includes('email not confirmed')) {
          return { exists: true };
        }
        // "Email rate limit exceeded" means the user exists (OTP was attempted before)
        if (error.message.toLowerCase().includes('rate limit') ||
            error.message.toLowerCase().includes('too many requests')) {
          return { exists: true };
        }
        // If no user found, Supabase returns a specific error
        if (error.message.toLowerCase().includes('invalid login') ||
            error.message.toLowerCase().includes('user not found') ||
            error.message.toLowerCase().includes('no user')) {
          return { exists: false };
        }
        // For other errors, assume doesn't exist to not block signup
        return { exists: false };
      }

      // No error means OTP was sent - user exists
      return { exists: true };
    } catch (error) {
      console.error('[Auth] Check email exists error:', error);
      return { exists: false, error: 'Failed to check email' };
    }
  },

  // Sign up
  signUp: async (email, password, name) => {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Supabase not configured. Please add your credentials in the ENV tab.' };
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Validation
    if (!normalizedEmail || !password || !name.trim()) {
      return { success: false, error: 'All fields are required' };
    }

    if (!normalizedEmail.includes('@') || !normalizedEmail.includes('.')) {
      return { success: false, error: 'Please enter a valid email address' };
    }

    if (password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }

    // AUTH-LAST: if the current session is an anonymous guest, take the
    // anonymous-to-permanent link path (updateUser) below. That path preserves
    // auth.users.id, so the guest's entire meal plan, grocery list, recipes,
    // and persona — all keyed by user_id server-side — automatically belong to
    // the new account with zero migration. Requires the Supabase project to
    // have both "Confirm email" and "Secure email change" turned OFF (see plan
    // file). The previous signOut-then-signUp approach minted a NEW user id,
    // which orphaned every server-side row of the guest's work; not doing that
    // anymore.
    const wasAnonymousGuest = get().isAnonymous && !!get().currentUser;

    // SECURITY: set the guard BEFORE calling supabase.auth.signUp() so the
    // onAuthStateChange listener cannot promote any transient session that
    // signUp() may create (e.g. for an existing user when Confirm Email is
    // somehow off, or due to a Supabase behaviour quirk). Always cleared
    // in the finally block.
    set({ _isSigningUp: true });

    try {
      // ─────────────────────────────────────────────────────────────────
      // PATH A — anonymous guest → permanent account
      // ─────────────────────────────────────────────────────────────────
      // Use Supabase's documented anonymous-to-permanent pattern:
      // supabase.auth.updateUser({ email, password }) PROMOTES the existing
      // anonymous user to a permanent one in place. auth.users.id is preserved,
      // so every FK in user_preferences/recipes/meal_slots/grocery_items/
      // saved_grocery_lists/users keeps pointing at the SAME user — the guest's
      // entire meal plan, grocery list, recipes, and persona automatically
      // belong to the new account with zero migration.
      //
      // Required Supabase dashboard settings (BOTH must be OFF — see plan):
      //   - Authentication → Email → Confirm email
      //   - Authentication → Email → Secure email change
      // With both off, this single call sets email, marks it verified, sets
      // password, and flips is_anonymous to false — no emails, no pending
      // state, no two-step verification.
      if (wasAnonymousGuest) {
        const previousId = get().currentUser?.id;
        console.log(
          '[Auth] Linking anonymous guest to email:',
          normalizedEmail,
          '— preserving user id:',
          previousId,
        );

        const { data: linkData, error: linkError } =
          await supabase.auth.updateUser({
            email: normalizedEmail,
            password,
            data: { name: name.trim() },
          });

        if (linkError) {
          const msg = linkError.message.toLowerCase();
          if (
            msg.includes('already') &&
            (msg.includes('registered') || msg.includes('exists') || msg.includes('use'))
          ) {
            console.log('[Auth] Link blocked — email already belongs to another account');
            return {
              success: false,
              error: 'An account with this email already exists. Please log in instead.',
            };
          }
          console.error('[Auth] Anonymous link failed:', linkError.message);
          return { success: false, error: linkError.message };
        }

        const linkedUser = linkData.user;
        if (!linkedUser) {
          return { success: false, error: 'Sign up failed. Please try again.' };
        }

        // Idempotent — the users-table row was already created for the anon id
        // during initialize(); this just upserts name/email onto it.
        await ensureUserTableEntry(linkedUser.id, normalizedEmail, name.trim());

        // updateUser refreshes the session token to reflect is_anonymous=false.
        // Pull the latest session so we promote with valid tokens.
        const { data: { session: freshSession } } = await supabase.auth.getSession();
        const sessionToUse = freshSession ?? get().session;

        const authUser = mapSupabaseUser(linkedUser);
        set({
          session: sessionToUse,
          currentUser: authUser,
          isAuthenticated: true,
          isAnonymous: false,
        });
        // RC identity stays aliased to the same Supabase user id — same person,
        // same account, same id. Re-initialize so subscription-store picks up
        // the email and name now that the user is no longer anonymous.
        useSubscriptionStore.getState().initializeSubscription(
          authUser.id,
          authUser.email,
          authUser.name,
        );

        console.log('[Auth] Anonymous guest linked to account:', linkedUser.id);
        return { success: true };
      }

      // ─────────────────────────────────────────────────────────────────
      // PATH B — no anonymous session, plain new-user signup
      // ─────────────────────────────────────────────────────────────────
      // Reached when someone navigates straight to /signup without an active
      // anonymous session (e.g. on a device where signInAnonymously failed).
      // Standard signUp creates a fresh user; there's no guest data to lose.
      console.log('[Auth] Calling supabase.auth.signUp for:', normalizedEmail);

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            name: name.trim(),
          },
        },
      });

      // 1) Explicit error from Supabase ("User already registered" etc.)
      if (signUpError) {
        const msg = signUpError.message.toLowerCase();
        if (
          msg.includes('already registered') ||
          msg.includes('user already exists') ||
          msg.includes('email already')
        ) {
          console.log('[Auth] Signup blocked — explicit duplicate-email error from Supabase');
          return {
            success: false,
            error: 'An account with this email already exists. Please log in instead.',
          };
        }
        return { success: false, error: signUpError.message };
      }

      // 2) Obscured response from Supabase for an existing email.
      //    With "Confirm email" enabled, Supabase intentionally returns a user
      //    object with identities=[] instead of leaking the account's existence.
      if (signUpData.user) {
        const identities = signUpData.user.identities || [];
        if (identities.length === 0) {
          console.log('[Auth] Signup blocked — Supabase obscured response (identities=[]) indicates existing user');
          if (signUpData.session) {
            await supabase.auth.signOut();
          }
          return {
            success: false,
            error: 'An account with this email already exists. Please log in instead.',
          };
        }

        // 3) Belt-and-braces: if the user object's created_at is older than a
        //    few seconds, it cannot be a brand-new account — treat as existing.
        const createdAt = new Date(signUpData.user.created_at);
        const ageMs = Date.now() - createdAt.getTime();
        if (ageMs > 10_000) {
          console.log('[Auth] Signup blocked — returned user has old created_at, must be existing account');
          if (signUpData.session) {
            await supabase.auth.signOut();
          }
          return {
            success: false,
            error: 'An account with this email already exists. Please log in instead.',
          };
        }

        // Genuinely new user. With "Confirm email" OFF, signUp returns an
        // active session — promote it and seed the users table.
        console.log('[Auth] New user created:', signUpData.user.id);

        await ensureUserTableEntry(
          signUpData.user.id,
          normalizedEmail,
          name.trim(),
        );

        if (signUpData.session && signUpData.session.access_token) {
          const authUser = mapSupabaseUser(signUpData.user);
          set({
            session: signUpData.session,
            currentUser: authUser,
            isAuthenticated: true,
            isAnonymous: false,
          });
          useSubscriptionStore.getState().initializeSubscription(
            authUser.id,
            authUser.email,
            authUser.name,
          );
        }

        return { success: true };
      }

      return { success: false, error: 'Sign up failed. Please try again.' };
    } catch (error) {
      console.error('[Auth] Sign up error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    } finally {
      set({ _isSigningUp: false });
    }
  },

  // Login
  login: async (email, password) => {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Supabase not configured. Please add your credentials in the ENV tab.' };
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Provide specific error messages for missing fields
    if (!normalizedEmail && !password) {
      return { success: false, error: 'Email and password are required' };
    }

    if (!normalizedEmail) {
      return { success: false, error: 'Email is required' };
    }

    if (!password) {
      return { success: false, error: 'Password is required' };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      if (data.user) {
        const authUser = mapSupabaseUser(data.user);
        set({
          session: data.session,
          currentUser: authUser,
          isAuthenticated: true,
        });

        // Initialize subscription on login
        useSubscriptionStore.getState().initializeSubscription(
          authUser.id,
          authUser.email,
          authUser.name
        );

        // Send welcome email only for new users, not on subsequent logins
        sendWelcomeEmail(authUser.id, authUser.email, authUser.name, false).catch((err) => {
          console.error('[Auth] Failed to send welcome email:', err);
        });

        return { success: true };
      }

      return { success: false, error: 'Login failed. Please try again.' };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  // Send OTP for password reset
  sendPasswordResetOTP: async (email: string) => {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Supabase not configured. Please add your credentials in the ENV tab.' };
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (!normalizedEmail) {
      return { success: false, error: 'Email is required' };
    }

    if (!normalizedEmail.includes('@') || !normalizedEmail.includes('.')) {
      return { success: false, error: 'Please enter a valid email address' };
    }

    try {
      console.log('[Auth] Sending OTP to:', normalizedEmail);

      // Use signInWithOtp with the OTP method - this sends a 6-digit OTP via email
      const { data, error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: false, // Don't create user if doesn't exist
          emailRedirectTo: undefined, // No redirect needed for OTP
        },
      });

      if (error) {
        console.error('[Auth] OTP send error:', error.message);
        console.error('[Auth] Full error:', error);

        // Check if it's an email configuration issue
        if (error.message.includes('email') || error.message.includes('provider')) {
          return {
            success: false,
            error: 'Email sending is not configured in Supabase. Please contact support to set up email authentication.'
          };
        }

        return { success: false, error: error.message };
      }

      // Store email for OTP verification and mark as password reset flow
      set({
        otpEmail: normalizedEmail,
        otpSessionId: normalizedEmail,
        isPasswordResetFlow: true,
      });

      console.log('[Auth] OTP sent successfully to email');
      console.log('[Auth] Data:', data);
      return { success: true };
    } catch (error) {
      console.error('[Auth] Send OTP error:', error);
      return { success: false, error: 'An unexpected error occurred while sending OTP' };
    }
  },

  // Verify OTP
  verifyOTP: async (otp: string) => {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Supabase not configured.' };
    }

    const state = get();
    if (!state.otpEmail) {
      return { success: false, error: 'No email found for OTP verification' };
    }

    if (!otp || otp.length !== 6) {
      return { success: false, error: 'OTP must be 6 digits' };
    }

    try {
      console.log('[Auth] Verifying OTP...');

      const { data, error } = await supabase.auth.verifyOtp({
        email: state.otpEmail,
        token: otp,
        type: 'email',
      });

      if (error) {
        console.error('[Auth] OTP verification error:', error.message);
        return { success: false, error: error.message };
      }

      if (data.session) {
        console.log('[Auth] OTP verified successfully');
        // Store session for password reset but don't set isAuthenticated
        // This prevents auto-redirect to main app during password reset flow
        set({
          session: data.session,
          otpSessionId: data.session.access_token,
          // Keep isAuthenticated as false during password reset flow
        });
        return { success: true };
      }

      return { success: false, error: 'OTP verification failed' };
    } catch (error) {
      console.error('[Auth] Verify OTP error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  // Reset password with OTP
  resetPasswordWithOTP: async (newPassword: string) => {
    if (!isSupabaseConfigured()) {
      return { success: false, error: 'Supabase not configured.' };
    }

    const state = get();
    if (!state.session) {
      return { success: false, error: 'No active session for password reset' };
    }

    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }

    try {
      console.log('[Auth] Resetting password...');

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        console.error('[Auth] Password reset error:', error.message);
        return { success: false, error: error.message };
      }

      console.log('[Auth] Password reset successfully');

      // Sign out the user after password reset so they can log in fresh
      await supabase.auth.signOut();

      // Clear all OTP and session state
      set({
        otpEmail: null,
        otpSessionId: null,
        isPasswordResetFlow: false,
        session: null,
        currentUser: null,
        isAuthenticated: false,
      });

      return { success: true };
    } catch (error) {
      console.error('[Auth] Reset password error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  // Clear OTP state
  clearOTPState: () => {
    set({
      otpEmail: null,
      otpSessionId: null,
      isPasswordResetFlow: false,
    });
  },

  // Logout
  logout: async () => {
    // CRITICAL: log out of RevenueCat first so the next user who signs
    // up on this device gets a fresh anonymous identity. Without this,
    // RC aliases the new user with the previous identity (which is tied
    // via Apple ID / Play account to any active subscription), so the
    // new user inherits Premium even though they never paid.
    try {
      await revenuecatLogout();
    } catch (error) {
      // Non-fatal — keep going with Supabase signOut even if RC logout
      // fails. The next initializeSubscription call will reconcile.
      console.error('RevenueCat logout error:', error);
    }

    // Clear meal-plan store (preferences, recipes, grocery, etc.) so that
    // the next session — which will be a fresh anonymous user — starts
    // with hasCompletedOnboarding=false and routes to onboarding.
    // NOTE: imported lazily to avoid circular dep (store.ts imports auth-store).
    try {
      const { useMealPlanStore } = require('./store');
      useMealPlanStore.getState().clearAllData();
    } catch (e) {
      console.error('[Auth] Failed to clear meal plan store on logout:', e);
    }

    if (!isSupabaseConfigured()) {
      set({
        session: null,
        currentUser: null,
        isAuthenticated: false,
        isAnonymous: false,
      });
      useSubscriptionStore.getState().clearSubscription();
      return;
    }

    try {
      await supabase.auth.signOut();
      set({
        session: null,
        currentUser: null,
        isAuthenticated: false,
        isAnonymous: false,
      });
      useSubscriptionStore.getState().clearSubscription();
    } catch (error) {
      console.error('Logout error:', error);
      // Still clear local state even if server logout fails
      set({
        session: null,
        currentUser: null,
        isAuthenticated: false,
        isAnonymous: false,
      });
      useSubscriptionStore.getState().clearSubscription();
    }
  },

  // Set session (for auth state changes)
  setSession: (session) => {
    if (session?.user) {
      set({
        session,
        currentUser: mapSupabaseUser(session.user),
        isAuthenticated: true,
        isAnonymous: isAnonUser(session.user),
      });
    } else {
      set({
        session: null,
        currentUser: null,
        isAuthenticated: false,
        isAnonymous: false,
      });
    }
  },

  // DEV ONLY: nuclear option to clear absolutely everything.
  // Use from the React Native debugger console or a hidden dev button:
  //   useAuthStore.getState().devClearAllSessions()
  devClearAllSessions: async () => {
    console.warn('[Auth] DEV: Clearing ALL sessions and persisted state...');

    // 1. Sign out from Supabase (server-side token revocation)
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('[Auth] DEV: signOut error (continuing):', e);
    }

    // 2. RevenueCat logout
    try {
      await revenuecatLogout();
    } catch (e) {
      console.warn('[Auth] DEV: RevenueCat logout error (continuing):', e);
    }

    // 3. Nuke all Supabase-related keys from AsyncStorage.
    //    Supabase stores tokens under keys prefixed with the project ref.
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const supabaseKeys = allKeys.filter(
        (k) => k.startsWith('sb-') || k.includes('supabase'),
      );
      if (supabaseKeys.length > 0) {
        await AsyncStorage.multiRemove(supabaseKeys);
        console.log('[Auth] DEV: Removed Supabase keys:', supabaseKeys);
      }
      // Also clear the Zustand persisted meal-plan store
      await AsyncStorage.removeItem('meal-plan-storage');
      console.log('[Auth] DEV: Removed meal-plan-storage key');
    } catch (e) {
      console.warn('[Auth] DEV: AsyncStorage cleanup error:', e);
    }

    // 4. Clear the meal plan store in memory
    try {
      const { useMealPlanStore } = require('./store');
      useMealPlanStore.getState().clearAllData();
    } catch (e) {
      console.warn('[Auth] DEV: clearAllData error:', e);
    }

    // 5. Reset all auth + subscription Zustand state
    set({
      session: null,
      currentUser: null,
      isAuthenticated: false,
      isAnonymous: false,
      isLoading: false,
      _isSigningUp: false,
      otpEmail: null,
      otpSessionId: null,
      isPasswordResetFlow: false,
    });
    useSubscriptionStore.getState().clearSubscription();

    console.warn(
      '[Auth] DEV: All sessions cleared. Restart the app for a fresh start.',
    );
  },
}));
