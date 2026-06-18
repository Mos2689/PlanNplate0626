/**
 * API Router for Supabase Edge Functions
 *
 * Unified API client that replaces all direct backend calls with
 * Supabase Edge Function calls. Handles authentication, token refresh,
 * and response parsing.
 */

import { supabase, isSupabaseConfigured } from './supabase';

// Session refresh lock to prevent concurrent refreshes
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

interface ApiResponse<T> {
  data?: T;
  error?: string;
  rateLimitRemaining?: number;
  resetsAt?: string;
}

interface EdgeFunctionResponse<T> {
  data?: T;
  error?: string;
  details?: string;
  rateLimitRemaining?: number;
  resetsAt?: string;
}

/**
 * Get a valid access token, refreshing if needed.
 *
 * Self-healing: if the current token is expired AND a server-side refresh
 * fails (e.g. the refresh token is also expired — common after long idle
 * periods in Expo Go), we sign out the dead session and create a fresh
 * anonymous guest session so API calls can proceed.
 */
async function getValidAccessToken(): Promise<string | null> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const currentToken = sessionData.session?.access_token;

  if (currentToken) {
    try {
      const parts = currentToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        const now = Math.floor(Date.now() / 1000);
        const expiresIn = payload.exp - now;
        if (expiresIn > 60) {
          return currentToken;
        }
      }
    } catch {
      // Continue to refresh
    }
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      // Attempt 1: server-side refresh
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session?.access_token) {
        // Validate the refreshed token is actually usable
        try {
          const parts = data.session.access_token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            if (payload.exp > Math.floor(Date.now() / 1000) + 30) {
              return data.session.access_token;
            }
          }
        } catch {
          // fall through to recovery
        }
      }

      // Attempt 2: the session is truly dead — sign out the stale session
      // and create a fresh anonymous guest so the app can keep working.
      console.warn('[API] Session refresh failed — creating fresh anonymous session...');
      await supabase.auth.signOut().catch(() => {});
      const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
      if (anonError || !anonData.session?.access_token) {
        console.error('[API] Anonymous sign-in recovery failed:', anonError?.message);
        return null;
      }
      console.log('[API] Fresh anonymous session created — token recovered');
      return anonData.session.access_token;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Make a JSON API call to a Supabase Edge Function
 */
export async function apiCall<T>(
  functionName: string,
  body: Record<string, unknown>,
  options: { requireAuth?: boolean } = { requireAuth: true }
): Promise<ApiResponse<T>> {
  if (!isSupabaseConfigured()) {
    return { error: 'Supabase is not configured' };
  }

  const { requireAuth = true } = options;

  if (requireAuth) {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return { error: 'Session expired. Please log in again.' };
    }

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        if (response.status === 401) return { error: 'Session expired. Please log in again.' };
        if (response.status === 429) return { error: 'Rate limit exceeded. Please try again later.' };
        return { error: errorData.error || 'Request failed' };
      }

      const data = await response.json() as EdgeFunctionResponse<T>;

      if (data.error) {
        return {
          error: data.details ? `${data.error}: ${data.details}` : data.error,
          rateLimitRemaining: data.rateLimitRemaining,
          resetsAt: data.resetsAt,
        };
      }

      return {
        data: data.data,
        rateLimitRemaining: data.rateLimitRemaining,
        resetsAt: data.resetsAt,
      };
    } catch (error) {
      console.error('[API] Request error:', error);
      return { error: 'Network error. Please check your connection.' };
    }
  }

  return { error: 'Authentication required' };
}

/**
 * Make a form data API call to a Supabase Edge Function (for file uploads/audio)
 */
export async function apiFormCall<T>(
  functionName: string,
  formData: FormData,
  options: { requireAuth?: boolean } = { requireAuth: true }
): Promise<ApiResponse<T>> {
  if (!isSupabaseConfigured()) {
    return { error: 'Supabase is not configured' };
  }

  const { requireAuth = true } = options;

  if (requireAuth) {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return { error: 'Session expired. Please log in again.' };
    }

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': supabaseAnonKey,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`[API] Form request failed: HTTP ${response.status} ${response.statusText}`);
        console.error(`[API] Response body: ${errorText.substring(0, 500)}`);
        let errorData: any;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `HTTP ${response.status}: ${response.statusText || 'Unknown error'}` };
        }
        if (response.status === 401) return { error: 'Session expired. Please log in again.' };
        if (response.status === 429) return { error: 'Rate limit exceeded. Please try again later.' };
        return { error: errorData.error || `Request failed (HTTP ${response.status})` };
      }

      const data = await response.json() as EdgeFunctionResponse<T>;

      if (data.error) {
        return {
          error: data.error,
          rateLimitRemaining: data.rateLimitRemaining,
          resetsAt: data.resetsAt,
        };
      }

      return {
        data: data.data,
        rateLimitRemaining: data.rateLimitRemaining,
        resetsAt: data.resetsAt,
      };
    } catch (error) {
      console.error('[API] Form request error:', error);
      return { error: 'Network error. Please check your connection.' };
    }
  }

  return { error: 'Authentication required' };
}

/**
 * Make a DELETE request to a Supabase Edge Function
 */
export async function apiDelete<T>(
  functionName: string,
  body: Record<string, unknown> = {},
  options: { requireAuth?: boolean } = { requireAuth: true }
): Promise<ApiResponse<T>> {
  if (!isSupabaseConfigured()) {
    return { error: 'Supabase is not configured' };
  }

  const { requireAuth = true } = options;

  if (requireAuth) {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return { error: 'Session expired. Please log in again.' };
    }

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': supabaseAnonKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        if (response.status === 401) return { error: 'Session expired. Please log in again.' };
        if (response.status === 429) return { error: 'Rate limit exceeded. Please try again later.' };
        return { error: errorData.error || 'Request failed' };
      }

      const data = await response.json() as EdgeFunctionResponse<T>;

      if (data.error) {
        return { error: data.error };
      }

      return { data: data.data };
    } catch (error) {
      console.error('[API] Delete request error:', error);
      return { error: 'Network error. Please check your connection.' };
    }
  }

  return { error: 'Authentication required' };
}