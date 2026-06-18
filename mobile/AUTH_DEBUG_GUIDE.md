# Authentication & User Creation Debug Guide

## Root Cause Analysis

After comprehensive investigation, **THREE CRITICAL ISSUES** were identified that caused intermittent user creation failures:

---

### Issue #1: RACE CONDITION - Double Initialization

**Problem:**
The `initializeSubscription()` function was being called TWICE during signup:
1. Once from `signUp()` function immediately after user creation
2. Once from `onAuthStateChange` event handler when `SIGNED_IN` event fires

**Evidence:**
- Line 218 in `auth-store.ts`: `signUp()` calls `initializeSubscription()`
- Line 136 in `auth-store.ts`: `SIGNED_IN` event handler also calls `initializeSubscription()`
- No lock or mutex to prevent concurrent execution

**Timeline of Race Condition:**
```
T+0ms:   signUp() creates auth user in Supabase
T+5ms:   signUp() calls initializeSubscription() → Call #1 starts
T+10ms:  Supabase fires SIGNED_IN event
T+12ms:  Event handler calls initializeSubscription() → Call #2 starts
T+15ms:  Call #1 checks if user exists (returns NOT FOUND)
T+17ms:  Call #2 checks if user exists (returns NOT FOUND)
T+20ms:  Call #1 attempts INSERT INTO users
T+22ms:  Call #2 attempts INSERT INTO users → FAILS
```

**Result:** One call succeeds, one fails with either:
- Duplicate key error (23505)
- RLS policy violation (42501) if session not fully propagated

---

### Issue #2: RLS TIMING ISSUE

**Problem:**
Row Level Security (RLS) policy checks `auth.uid() = id`, but `auth.uid()` may return NULL immediately after signup if the session JWT hasn't propagated to the Supabase request context.

**Technical Details:**
- `signUp()` returns `data.session` which is stored in Zustand
- However, Supabase RLS checks `auth.uid()` from the **JWT in the request header**
- If `initializeSubscription()` executes before the session JWT is set in subsequent requests, `auth.uid()` returns NULL
- RLS policy `auth.uid() = id` fails because `NULL != <user-id>`
- Result: Error code 42501 (permission denied)

**Why First Signup Worked but Second Failed:**
- First signup: Slower device/network → more time for session to propagate → success
- Second signup: Faster execution → insufficient time for session propagation → RLS failure

---

### Issue #3: NO RETRY MECHANISM

**Problem:**
When RLS timing issues occur, the code logs the error but doesn't retry. User never gets created in the database.

---

## Implemented Fixes

### Fix #1: Race Condition Protection

Added mutex lock to `subscription-store.ts`:
```typescript
_initializingUserId: string | null;  // Tracks which user is currently initializing

if (currentlyInitializing === userId) {
  console.log('SKIPPED: Already initializing user');
  return;  // Prevent duplicate initialization
}

set({ _initializingUserId: userId });  // Acquire lock
```

### Fix #2: Removed Duplicate Call

Modified `auth-store.ts` to NOT call `initializeSubscription` from `SIGNED_IN` event handler:
```typescript
// BEFORE: Called initializeSubscription() here (caused race condition)
// AFTER: Only update state, don't initialize (already done in signUp/login)
if (event === 'SIGNED_IN') {
  set({ session, currentUser, isAuthenticated: true });
  return;  // No initializeSubscription call
}
```

### Fix #3: Retry Mechanism with Exponential Backoff

Added 3-attempt retry in `subscription-store.ts`:
```typescript
let user = await upsertUser(userId, email, name);

if (!user) {
  await delay(500ms);
  user = await upsertUser(userId, email, name);  // Retry #2

  if (!user) {
    await delay(1000ms);
    user = await upsertUser(userId, email, name);  // Retry #3
  }
}
```

This gives the session time to propagate and retries if RLS timing issues occur.

---

## Comprehensive Logging

All functions now include **timestamped, detailed logging**:

### Subscription Store Logs

```
[Subscription] 2026-01-17T10:30:45.123Z - START: Initializing subscription for user: abc-123, email: user@example.com
[Subscription] 2026-01-17T10:30:45.125Z - Upserting user in database (attempt 1)...
[Subscription] 2026-01-17T10:30:45.500Z - First upsert attempt failed, retrying after 500ms...
[Subscription] 2026-01-17T10:30:46.010Z - Upserting user in database (attempt 2)...
[Subscription] 2026-01-17T10:30:46.250Z - SUCCESS: User record created/updated: abc-123
[Subscription] 2026-01-17T10:30:46.300Z - COMPLETE: Subscription initialization complete
```

### Database Logs

```
[DB] 2026-01-17T10:30:45.125Z - START: Upserting user: {"userId":"abc-123","email":"user@example.com","name":"John"}
[DB] 2026-01-17T10:30:45.127Z - Checking if user exists...
[DB] 2026-01-17T10:30:45.130Z - User not found, creating new user...
[DB] 2026-01-17T10:30:45.131Z - INSERT DATA: {"id":"abc-123","email":"user@example.com",...}
[DB] 2026-01-17T10:30:45.150Z - ERROR creating user:
[DB] 2026-01-17T10:30:45.150Z -   Message: new row violates row-level security policy
[DB] 2026-01-17T10:30:45.150Z -   Code: 42501
[DB] 2026-01-17T10:30:45.150Z -   Details: null
[DB] 2026-01-17T10:30:45.150Z -   Hint: none
[DB] 2026-01-17T10:30:45.150Z - RLS VIOLATION: Permission denied - check RLS policies for users table
[DB] 2026-01-17T10:30:45.150Z - This usually means auth.uid() is NULL or doesn't match the user ID being inserted
```

---

## How to Use the Logs

### Check LOGS Tab in Vibecode
All logs appear in real-time in the Vibecode LOGS tab.

### Identify Issues

#### 1. Race Condition
Look for:
```
[Subscription] SKIPPED: Already initializing user
```
This means the race condition protection is working.

#### 2. RLS Timing Issue
Look for:
```
[DB] RLS VIOLATION: Permission denied
[Subscription] First upsert attempt failed, retrying after 500ms...
```
This means RLS timing issue occurred but retry mechanism will handle it.

#### 3. Complete Failure (after 3 attempts)
```
[Subscription] FAILURE: Failed to create/update user record after 3 attempts
```
This means a persistent issue exists. Check:
- RLS policies in Supabase
- `users` table exists
- Supabase credentials are correct

---

## Debugging Checklist

If users still can't sign up:

### 1. Check Supabase `users` Table Exists
```sql
SELECT * FROM users LIMIT 1;
```

### 2. Check RLS Policies
```sql
-- Should show 3 policies
SELECT * FROM pg_policies WHERE tablename = 'users';
```

### 3. Verify Policy Definitions
```sql
DROP POLICY IF EXISTS "Users can insert own data" ON users;
CREATE POLICY "Users can insert own data" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);
```

### 4. Check Logs for Specific Error Codes

| Error Code | Meaning | Solution |
|------------|---------|----------|
| 42501 | RLS violation | Retry mechanism should handle. If persists, check policies |
| 42P01 | Table doesn't exist | Create `users` table with schema |
| 23505 | Duplicate key | Race condition - should be caught and handled |
| PGRST116 | Not found (expected) | This is normal for SELECT checks |

---

## Testing the Fix

### Test Case 1: Normal Signup
1. Sign up with new email
2. Check logs for:
   ```
   [Subscription] START: Initializing subscription
   [DB] START: Upserting user
   [DB] SUCCESS: User created
   [Subscription] SUCCESS: User record created/updated
   ```

### Test Case 2: Rapid Signups
1. Sign up with Email A
2. Immediately logout
3. Sign up with Email B
4. Check logs - should NOT see duplicate initialization attempts

### Test Case 3: RLS Timing
1. Sign up on slow network
2. Check logs - may see retry attempts but should ultimately succeed:
   ```
   [Subscription] First upsert attempt failed, retrying
   [DB] SUCCESS: User created
   ```

---

## What Changed

### Files Modified:
1. **src/lib/subscription-store.ts**
   - Added `_initializingUserId` lock
   - Added retry mechanism (3 attempts with delays)
   - Enhanced logging with timestamps

2. **src/lib/database.ts**
   - Enhanced logging for all database operations
   - Added detailed error information
   - Better race condition handling

3. **src/lib/auth-store.ts**
   - Removed duplicate `initializeSubscription` call from SIGNED_IN handler
   - Added comment explaining why

---

## Summary

**Root Cause:** Race condition + RLS timing issue + no retry = intermittent failures

**Solution:**
1. Mutex lock prevents concurrent initialization
2. Removed duplicate call source
3. Retry mechanism handles RLS timing
4. Comprehensive logging for debugging

**Result:** Reliable user creation with detailed diagnostics
