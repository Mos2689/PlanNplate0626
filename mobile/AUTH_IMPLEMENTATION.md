# Supabase Authentication Implementation Guide

## Overview
This document describes the authentication system for the Meal Planning App. It ensures users cannot create duplicate accounts with the same email and properly routes them based on their authentication state.

## Architecture

### 1. Authentication Flows

#### Sign Up Flow (New Accounts)
```
User → Sign Up Screen → Fill Form → Click "Create Account"
  ↓
  signUp() called with (email, password, name)
  ↓
  Uses: supabase.auth.signUp()
  ↓
  If Success:
    - Sets isAuthenticated = true
    - Initializes subscription
    - Routes to /(tabs)
  ↓
  If Duplicate Email:
    - Returns: "Account already exists with this email. Please log in instead."
    - Shows error for 2 seconds
    - Auto-redirects to /login
  ↓
  If Other Error:
    - Shows error message
    - User can retry
```

#### Login Flow (Existing Accounts)
```
User → Login Screen → Fill Email & Password → Click "Sign In"
  ↓
  login() called with (email, password)
  ↓
  Uses: supabase.auth.signInWithPassword()
  ↓
  If Success:
    - Sets isAuthenticated = true
    - Initializes subscription
    - Routes to /(tabs)
  ↓
  If Wrong Credentials:
    - Returns: "Invalid login credentials"
    - Shows error message
    - User can retry
```

#### Session Detection on App Startup
```
App Launches
  ↓
  StoreHydration mounts
  ↓
  useAuthStore.initialize() called
  ↓
  supabase.auth.getSession() checks for persisted session
  ↓
  If Valid Session:
    - Sets isAuthenticated = true
    - Routes to /(tabs)
    - Subscription initialized
  ↓
  If No Session:
    - Sets isAuthenticated = false
    - Routes to /login
    - Shows login form
```

### 2. Key Files

#### `src/lib/supabase.ts` - Singleton Supabase Client
```typescript
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,        // Secure mobile storage
    autoRefreshToken: true,       // Auto-refresh tokens
    persistSession: true,         // Persist across restarts
    detectSessionInUrl: false,    // Not needed for mobile
  },
});
```
**Key Features:**
- Single instance used app-wide (singleton pattern)
- Session persists in secure AsyncStorage
- Tokens auto-refresh before expiry
- No URL detection needed for mobile

#### `src/lib/auth-store.ts` - Auth State Management
**Actions:**
- `initialize()` - Check session and set up listeners on app startup
- `signUp(email, password, name)` - Create new account
- `login(email, password)` - Log in to existing account
- `logout()` - Sign out user
- `setSession(session)` - Manual session update

**Error Handling:**
```typescript
if (error) {
  const errorMessage = error.message.toLowerCase();
  if (errorMessage.includes('already registered') ||
      errorMessage.includes('user already exists') ||
      errorMessage.includes('email already') ||
      error.status === 400) {
    return { success: false, error: 'Account already exists with this email. Please log in instead.' };
  }
  return { success: false, error: error.message };
}
```

**State:**
- `currentUser` - Current authenticated user
- `session` - Auth session object
- `isAuthenticated` - Boolean flag
- `isLoading` - Loading state

#### `src/app/_layout.tsx` - Protected Route Hook
```typescript
function useProtectedRoute() {
  const segments = useSegments();
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (isLoading || !hasHydrated) return; // Wait for auth init

    const inAuthGroup = segments[0] === 'login' || segments[0] === 'signup';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login');           // Not logged in? Go to login
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');          // Logged in? Go to home
    }
  }, [isAuthenticated, isLoading, hasHydrated, segments, router]);
}
```
**Logic:**
- Waits for auth store to hydrate before routing
- Prevents authenticated users from accessing /login or /signup
- Forces unauthenticated users to /login
- Runs on every auth or route change

#### `src/app/signup.tsx` - Sign Up Screen
```typescript
export default function SignupScreen() {
  const router = useRouter();
  const signUp = useAuthStore((s) => s.signUp);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Prevent authenticated users from accessing signup
  React.useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, router]);

  const handleSignup = useCallback(async () => {
    const result = await signUp(email, password, name);

    if (result.success) {
      router.replace('/(tabs)');
    } else {
      setError(result.error);

      // Auto-redirect on duplicate email
      if (result.error?.toLowerCase().includes('already exists')) {
        setTimeout(() => {
          router.replace('/login');
        }, 2000);
      }
    }
  }, [...]);
}
```
**Features:**
- Auth state guard redirects logged-in users
- Auto-redirect to login on duplicate email (after 2 second delay)
- Clear error messages
- Links to login screen for existing users

#### `src/app/login.tsx` - Login Screen
```typescript
export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Prevent authenticated users from accessing login
  React.useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, router]);

  // Uses login() - NEVER calls signUp()
}
```
**Features:**
- Auth state guard redirects logged-in users
- Uses only `login()` - never calls `signUp()`
- Clear error messages
- Links to signup for new users

#### `src/components/StoreHydration.tsx` - Initialization
```typescript
export function StoreHydration({ children }: StoreHydrationProps) {
  const initializeAuth = useAuthStore((s) => s.initialize);
  const [isReady, setIsReady] = useState(false);

  // Initialize auth on mount
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Wait for auth to hydrate before showing app
  if (!isReady) {
    return <ActivityIndicator />;
  }

  return <>{children}</>;
}
```
**Features:**
- Calls `initialize()` on app startup
- Waits for auth state to hydrate
- Shows loading spinner during initialization
- Ensures auth state is ready before routing

## Error Handling

### Duplicate Email Signup
**Scenario:** User tries to sign up with email that already exists
**Flow:**
1. `signUp()` calls `supabase.auth.signUp()`
2. Supabase returns error: "User already exists" (or similar)
3. Error is detected and mapped to: "Account already exists with this email. Please log in instead."
4. UI shows error on screen for 2 seconds
5. Auto-redirects to /login screen

**Why Auto-redirect?** Gives user time to read the error, then automatically guides them to login.

### Invalid Login Credentials
**Scenario:** User enters wrong email or password
**Flow:**
1. `login()` calls `supabase.auth.signInWithPassword()`
2. Supabase returns error: "Invalid login credentials"
3. Error is shown on login screen
4. User can retry or navigate to signup

### RLS Policy Error (Known Issue)
**Scenario:** User successfully signs up but can't insert into `users` table
**Cause:** Database Row-Level Security policy is too restrictive
**Solution:** Update RLS policy in Supabase dashboard:
```sql
CREATE POLICY "Allow users to insert their own row"
ON public.users
FOR INSERT
WITH CHECK (auth.uid() = id);
```
**Note:** This is a database configuration issue, not an auth flow issue.

## Session Management

### Persistence
- Sessions persist in secure AsyncStorage on mobile
- Tokens automatically refresh before expiry
- Users stay logged in across app restarts
- No login required after closing the app (unless token expired)

### Real-Time Sync
- Listens to `supabase.auth.onAuthStateChange()`
- Updates UI immediately when auth state changes
- Handles: SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED
- Prevents race conditions with unique user ID tracking

### Session Validation
- Every 24 hours (default), tokens are refreshed
- Expired tokens are automatically renewed
- Invalid sessions are cleared and user is logged out
- Next app launch redirects to login

## Testing Guide

### Test 1: Fresh Install (No Session)
```
1. Clear app data / First install
2. Launch app
3. Should see Login screen
4. Click "Create account" → Go to Signup
5. Fill form and click "Create Account"
6. Should see home screen ✓
```

### Test 2: Session Persistence
```
1. Log in with valid credentials
2. Go to home screen
3. Force close app (kill process)
4. Reopen app
5. Should see home screen (still logged in) ✓
6. No redirect to login required
```

### Test 3: Duplicate Email Signup
```
1. Sign up with email: test@example.com
2. Sign out
3. Try to sign up again with test@example.com
4. Should see: "Account already exists with this email. Please log in instead."
5. After 2 seconds, should redirect to Login screen ✓
6. Can now click "Sign In" and login with test@example.com
```

### Test 4: Wrong Credentials
```
1. Go to Login screen
2. Enter correct email but wrong password
3. Click "Sign In"
4. Should see: "Invalid login credentials"
5. Can retry with correct password ✓
```

### Test 5: Already Logged In - No Access to Auth Screens
```
1. Log in successfully
2. Try to manually navigate to /login or /signup
3. Should immediately redirect to /(tabs) ✓
4. Cannot access login/signup screens while authenticated
```

### Test 6: Logout
```
1. Log in successfully
2. Go to Settings tab
3. Click "Sign Out"
4. Should redirect to Login screen ✓
5. Should not auto-login
```

## Important Notes

### Do NOT
- ❌ Call `signUp()` from login flow
- ❌ Create multiple Supabase client instances
- ❌ Store session data in local state (use auth-store)
- ❌ Skip the hydration check before routing
- ❌ Call `initialize()` more than once

### DO
- ✅ Use separate `login()` and `signUp()` functions
- ✅ Check `isAuthenticated` state before routing
- ✅ Use the singleton Supabase client
- ✅ Call `initialize()` once in StoreHydration
- ✅ Wait for auth to hydrate before showing UI
- ✅ Handle duplicate email errors gracefully

## Dependencies
- `@supabase/supabase-js` - Auth client
- `zustand` - State management
- `@react-native-async-storage/async-storage` - Session persistence
- `expo-router` - Navigation

## Related Documentation
- Supabase Auth Docs: https://supabase.com/docs/guides/auth
- Zustand Docs: https://github.com/pmndrs/zustand
- Expo Router Docs: https://docs.expo.dev/routing/introduction/
