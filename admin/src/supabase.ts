import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Fail loudly at startup rather than producing a console full of 401s that
  // look like an auth bug.
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local.',
  );
}

export const supabase = createClient(url, anonKey);

/** Base for the edge functions this console calls. */
export const functionsUrl = `${url}/functions/v1`;

/**
 * Call an edge function as the signed-in agent.
 *
 * Replies must go through `support-reply` rather than a direct insert: that
 * function is what sends the user their email and push notification. A row
 * written straight to the table would be a reply the user never learns about.
 */
export async function callFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<{ data?: T; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { error: 'Signed out' };

  const response = await fetch(`${functionsUrl}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: anonKey!,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    return { error: payload.error || `Request failed (${response.status})` };
  }
  return { data: payload.data as T };
}
