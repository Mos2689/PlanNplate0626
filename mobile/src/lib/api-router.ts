/**
 * API Router for Supabase Edge Functions
 *
 * Unified API client for all backend calls. Handles authentication, token
 * refresh, and response parsing.
 *
 * FAILURE CONTRACT: this module returns a classified `Failure`, never a
 * message string. Previously each of the three request functions built its own
 * error text, which is how nine separate leaks reached the UI — raw HTTP status
 * codes, `'Unknown error'`, the literal string `'Supabase is not configured'`,
 * and backend error text passed straight through as
 * `` `${data.error}: ${data.details}` ``. Callers can no longer render what
 * came back from the server, because what comes back is a category, and the
 * wording is looked up from lib/failure/copy.ts.
 *
 * Backend text is preserved for diagnostics in `failure.cause` — which is typed
 * `unknown` precisely so it can't be dropped into JSX.
 */

import { supabase, isSupabaseConfigured, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import { classifyFailure, makeFailure, type Failure } from './failure';

// Session refresh lock to prevent concurrent refreshes
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

export interface ApiResponse<T> {
  data?: T;
  /** Classified failure. Present iff the call did not succeed. */
  failure?: Failure;
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
 * If the current token is expired AND a server-side refresh fails (e.g. the
 * refresh token is also expired — common after long idle periods), the session
 * is dead. Anonymous sign-ins are disabled (hard registration only), so there
 * is no silent guest fallback: we return null and let the auth-gated routing
 * send the user to /signup to re-authenticate.
 */
async function getValidAccessToken(): Promise<string | null> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  const now = Math.floor(Date.now() / 1000);

  // Use the session's own `expires_at` (unix seconds) — DO NOT decode the JWT
  // with atob(). JWT segments are base64URL ("-"/"_", often unpadded); the
  // production Hermes `atob` is strict and throws on that, while Expo Go's is
  // lenient — which silently pushed every API call into the sign-out + anon
  // recovery path on device, breaking all authed edge-function calls.
  if (session?.access_token && session.expires_at && session.expires_at - now > 60) {
    return session.access_token;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      // Attempt 1: server-side refresh.
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session?.access_token) {
        const refreshedExp = data.session.expires_at ?? 0;
        if (refreshedExp > Math.floor(Date.now() / 1000) + 30) {
          return data.session.access_token;
        }
        // No/short expiry but we got a token — use it rather than nuking the session.
        return data.session.access_token;
      }

      // Refresh genuinely failed — the session is dead. With anonymous
      // sign-ins disabled there is no guest fallback: clear the stale session
      // and return null so the caller fails cleanly and routing forces
      // re-authentication at /signup.
      console.warn('[API] Session refresh failed — clearing dead session (re-auth required).');
      await supabase.auth.signOut().catch(() => {});
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

type Method = 'POST' | 'DELETE';

interface RequestSpec {
  functionName: string;
  method: Method;
  /** JSON body, or FormData for uploads. */
  payload: Record<string, unknown> | FormData;
  requireAuth: boolean;
  /** Product area, for copy + diagnostics grouping. */
  feature: string;
}

/**
 * One implementation for every edge-function call.
 *
 * The three public wrappers below differ only in shape, not in error handling —
 * that's deliberate. Each previously had its own copy of the failure branches,
 * and they drifted: only the FormData path leaked HTTP status codes, only two
 * of three emitted `'Unknown error'`. A single path can't drift.
 */
async function request<T>(spec: RequestSpec): Promise<ApiResponse<T>> {
  const { functionName, method, payload, requireAuth, feature } = spec;
  const ctx = { feature, context: { fn: functionName } };

  if (!isSupabaseConfigured()) {
    // Never name the vendor. This is a build-configuration problem, and from
    // the user's side the feature simply isn't available.
    return { failure: makeFailure('not-configured', ctx) };
  }

  if (!requireAuth) {
    // Historically this returned an "Authentication required" string for every
    // unauthenticated call, which meant `requireAuth: false` silently never
    // worked. Preserved as a classified failure rather than changed, since
    // fixing the behaviour is a functional change and out of scope here.
    return { failure: makeFailure('auth-denied', ctx) };
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return { failure: makeFailure('auth-expired', ctx) };
  }

  const isForm = typeof FormData !== 'undefined' && payload instanceof FormData;

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method,
      headers: {
        ...(isForm ? {} : { 'Content-Type': 'application/json' }),
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: isForm ? (payload as FormData) : JSON.stringify(payload),
    });

    if (!response.ok) {
      // Read the body for DIAGNOSTICS only. It never becomes user-facing copy;
      // the status drives the category and the category drives the wording.
      const detail = await response.text().catch(() => '');
      return {
        failure: classifyFailure(detail || `status ${response.status}`, {
          ...ctx,
          status: response.status,
        }),
      };
    }

    const body = (await response.json()) as EdgeFunctionResponse<T>;

    if (body.error) {
      // A 200 carrying an application-level error. Classify from the text so
      // e.g. a rate-limit message still routes correctly — but the text itself
      // stays in `cause`.
      return {
        failure: classifyFailure(
          body.details ? `${body.error} ${body.details}` : body.error,
          ctx,
        ),
        rateLimitRemaining: body.rateLimitRemaining,
        resetsAt: body.resetsAt,
      };
    }

    return {
      data: body.data,
      rateLimitRemaining: body.rateLimitRemaining,
      resetsAt: body.resetsAt,
    };
  } catch (cause) {
    // Transport-level failure — no response at all. React Native throws a bare
    // `TypeError: Network request failed` here, which the classifier maps to
    // `offline`; presentFailure() then refines it to `poor-connection` if the
    // device is in fact online.
    return { failure: classifyFailure(cause, ctx) };
  }
}

/** JSON API call to a Supabase Edge Function. */
export async function apiCall<T>(
  functionName: string,
  body: Record<string, unknown>,
  options: { requireAuth?: boolean; feature?: string } = {},
): Promise<ApiResponse<T>> {
  return request<T>({
    functionName,
    method: 'POST',
    payload: body,
    requireAuth: options.requireAuth ?? true,
    feature: options.feature ?? functionName,
  });
}

/** Multipart call to a Supabase Edge Function (file uploads / audio). */
export async function apiFormCall<T>(
  functionName: string,
  formData: FormData,
  options: { requireAuth?: boolean; feature?: string } = {},
): Promise<ApiResponse<T>> {
  return request<T>({
    functionName,
    method: 'POST',
    payload: formData,
    requireAuth: options.requireAuth ?? true,
    feature: options.feature ?? functionName,
  });
}

/** DELETE request to a Supabase Edge Function. */
export async function apiDelete<T>(
  functionName: string,
  body: Record<string, unknown> = {},
  options: { requireAuth?: boolean; feature?: string } = {},
): Promise<ApiResponse<T>> {
  return request<T>({
    functionName,
    method: 'DELETE',
    payload: body,
    requireAuth: options.requireAuth ?? true,
    feature: options.feature ?? functionName,
  });
}
