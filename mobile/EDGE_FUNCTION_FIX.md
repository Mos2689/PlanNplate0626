# CRITICAL FIX: Edge Function JWT Verification

## FINAL ROOT CAUSE (January 2026)

The `401 {"code": 401, "message": "Invalid JWT"}` error was coming from **Supabase's gateway-level JWT verification**, NOT from our Edge Function code.

### The Problem

Supabase Edge Functions have **TWO layers of JWT verification**:
1. **Gateway-level (automatic)** - Supabase infrastructure verifies JWT BEFORE your code runs
2. **Code-level (our `verifyAuth()`)** - Our custom verification inside the function

The gateway was rejecting valid JWTs before our code could even execute.

### The Solution

Add a `supabase/config.toml` file to disable gateway-level JWT verification:

```toml
[functions.openai-chat]
verify_jwt = false

[functions.openai-transcribe]
verify_jwt = false
```

This lets our custom `verifyAuth()` function handle authentication instead.

---

## Previous Root Cause (for reference)

The Edge Function was using `SUPABASE_SERVICE_ROLE_KEY` in the `apikey` header when verifying JWT tokens. This is **incorrect** and causes all JWT verification to fail with "Invalid JWT" errors.

### The Problem
```javascript
// ❌ WRONG - This was causing 401 errors
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'apikey': supabaseServiceKey,  // ❌ WRONG KEY!
  },
});
```

### The Fix
```javascript
// ✅ CORRECT - Use ANON KEY for JWT verification
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
  headers: {
    'Authorization': `Bearer ${token}`,
    'apikey': supabaseAnonKey,  // ✅ CORRECT KEY!
  },
});
```

## Why This Matters

- User JWT tokens are issued and verified against the **ANON KEY**, not the service role key
- The service role key bypasses Row Level Security and is for server-side admin operations
- Using the wrong key causes Supabase Auth to reject all user tokens as "Invalid JWT"

## Files Changed

1. **`supabase/functions/_shared/auth.mjs`** - Fixed JWT verification to use ANON KEY
2. **`src/lib/secure-api.ts`** - Added comprehensive JWT debugging logs

## Deployment Steps

### 1. Ensure config.toml exists

Make sure `supabase/config.toml` exists with:
```toml
[functions.openai-chat]
verify_jwt = false

[functions.openai-transcribe]
verify_jwt = false
```

### 2. Set the PROJECT_ANON_KEY Secret

The Edge Function requires `PROJECT_ANON_KEY` to be set as a secret:

```bash
# Get your anon key from Supabase Dashboard > Settings > API
# It starts with "eyJh..." and is your public/anon key

# Set it as a secret (use PROJECT_ANON_KEY, not SUPABASE_ANON_KEY)
# Supabase doesn't allow secret names starting with SUPABASE_
supabase secrets set PROJECT_ANON_KEY=your-anon-key-here

# Verify it's set
supabase secrets list
```

You should see:
```
OPENAI_API_KEY
PROJECT_ANON_KEY
```

### 3. Redeploy Edge Functions

```bash
# Link to your project (if not already linked)
supabase link --project-ref your-project-ref

# Deploy the Edge Functions with the new config
supabase functions deploy openai-chat
supabase functions deploy openai-transcribe

# Or deploy all at once
supabase functions deploy
```

**IMPORTANT**: The `config.toml` file tells Supabase to skip gateway-level JWT verification.

### 3. Test the Fix

After deployment, try generating a recipe in the app. You should see these logs:

```
[SecureAPI] Refreshing session before API call...
[SecureAPI] ===== TOKEN DEBUG INFO =====
[SecureAPI] Token expires in: 3540 seconds
[SecureAPI] Token is expired: false
[SecureAPI] Calling edge function: openai-chat
```

And the Edge Function should log:
```
[Auth] Verifying JWT token...
[Auth] JWT verification successful: { userId: "...", email: "..." }
```

## Comprehensive Debug Logs

The fix includes extensive debug logging to diagnose JWT issues:

### Client Side (`secure-api.ts`)
- Session refresh status
- Token expiration time
- Token length and validity
- User ID and session info

### Server Side (`auth.mjs`)
- Token verification attempts
- Supabase Auth API responses
- User data extraction
- Error details with context

## Testing Checklist

- [ ] Set `SUPABASE_ANON_KEY` secret in Supabase
- [ ] Deploy updated Edge Functions
- [ ] Clear app cache and restart
- [ ] Try generating a single recipe
- [ ] Try generating a meal plan
- [ ] Check logs for JWT verification success
- [ ] Verify no more "Invalid JWT" errors

## Additional Notes

### If Problems Persist

1. **Check Environment Variables**
   ```bash
   # Verify secrets are set correctly
   supabase secrets list
   ```

2. **Check Edge Function Logs**
   - Go to Supabase Dashboard > Edge Functions > Logs
   - Look for `[Auth]` log entries
   - Verify JWT verification is successful

3. **Check Token Expiration**
   - Tokens expire after 1 hour by default
   - The app now auto-refreshes before each API call
   - Check logs for "Token is expired: false"

4. **Verify ANON_KEY Matches**
   - The `SUPABASE_ANON_KEY` in Edge Functions must match the `EXPO_PUBLIC_SUPABASE_ANON_KEY` in your app
   - Both should be the same anon/public key from your Supabase project

### Why the Session Refresh Didn't Work Before

Even though we added session refresh in the client, the Edge Function was still rejecting the refreshed tokens because it was verifying them against the wrong key. Both fixes are needed:

1. **Client**: Refresh tokens before API calls (prevents sending expired tokens)
2. **Server**: Verify tokens with correct key (accepts valid user tokens)
