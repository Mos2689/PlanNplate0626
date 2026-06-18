// Authentication helper for Supabase Edge Functions
// Validates JWT and returns user info

/**
 * Verify the JWT token from the Authorization header
 * Returns the user object if valid, or an error message
 * @param {Request} req
 * @returns {Promise<{user: {id: string, email?: string, role?: string} | null, error: string | null}>}
 */
export async function verifyAuth(req) {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader) {
    return { user: null, error: 'Missing Authorization header' };
  }

  // Extract the token from "Bearer <token>"
  const token = authHeader.replace('Bearer ', '');

  if (!token || token === authHeader) {
    return { user: null, error: 'Invalid Authorization header format. Expected: Bearer <token>' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  // Use SUPABASE_ANON_KEY from secrets
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing SUPABASE_URL or PROJECT_ANON_KEY');
    return { user: null, error: 'Server configuration error' };
  }

  try {
    // CRITICAL FIX: Use ANON_KEY instead of SERVICE_ROLE_KEY for JWT verification
    // The user's JWT token is validated against the anon key, not service role key
    console.log('[Auth] Verifying JWT token...', {
      tokenPrefix: token.slice(0, 20),
      supabaseUrl,
      hasAnonKey: !!supabaseAnonKey
    });

    // Verify the JWT by calling Supabase auth API
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': supabaseAnonKey,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[Auth] Verification failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
        tokenUsed: token.slice(0, 20) + '...',
        supabaseUrl
      });
      return { user: null, error: 'Invalid or expired token' };
    }

    const userData = await response.json();
    console.log('[Auth] JWT verification successful:', {
      userId: userData.id,
      email: userData.email
    });

    if (!userData.id) {
      return { user: null, error: 'Invalid user data' };
    }

    return {
      user: {
        id: userData.id,
        email: userData.email,
        role: userData.role,
      },
      error: null,
    };
  } catch (error) {
    console.error('Auth verification error:', error);
    return { user: null, error: 'Authentication verification failed' };
  }
}