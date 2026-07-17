import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveSupabaseUrl } from './supabase-config';

// Built-in fallbacks so the app's backend (auth + AI edge functions) ALWAYS
// works, even if a build profile forgot the EXPO_PUBLIC_* env (which is what
// broke TestFlight: the `preview`/`development` eas.json profiles had no `env`,
// so every Supabase/AI call silently failed). These two values are PUBLISHABLE
// — the project URL and the `sb_publishable_…` anon key are designed to ship in
// the client (Row-Level Security protects the data), so embedding them is safe
// and standard. Env still wins when present, so staging/other projects work too.
const FALLBACK_SUPABASE_ANON_KEY = 'sb_publishable_NihKFWAv5fqC1iyZRlHDHA_yuvikvsI';

const supabaseUrlResolution = resolveSupabaseUrl(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
);

export const SUPABASE_URL = supabaseUrlResolution.url;
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

if (
  supabaseUrlResolution.usedFallback ||
  !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
) {
  console.warn(
    '[Supabase] EXPO_PUBLIC_SUPABASE_* env missing for this build — using built-in fallback credentials. Add the env to every eas.json build profile to override.',
  );
}

if (supabaseUrlResolution.migratedLegacyHost) {
  console.warn(
    '[Supabase] Legacy project hostname detected; OAuth has been routed through the branded vanity hostname.',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    // Keep the original project-ref-based key after moving to the vanity
    // hostname. Supabase derives this key from the URL by default, which would
    // otherwise make existing persisted sessions appear signed out.
    storageKey: 'sb-wcjsrhdlnmfugdjtvadj-auth-token',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

// Always configured now (env or fallback). Kept for call-site compatibility.
export const isSupabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
