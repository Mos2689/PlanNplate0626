export const CANONICAL_SUPABASE_URL = 'https://plannplate.supabase.co';

const LEGACY_PROJECT_HOSTS = new Set([
  'wcjsrhdlnmfugdjtvadj.supabase.co',
]);

export interface SupabaseUrlResolution {
  url: string;
  usedFallback: boolean;
  migratedLegacyHost: boolean;
}

/**
 * Resolves the public Supabase URL used by the shipped client.
 *
 * The original project hostname and the vanity hostname address the same
 * Supabase project, but iOS displays the first hostname opened by OAuth. A
 * stale build environment must not regress that prompt to the project ref.
 */
export const resolveSupabaseUrl = (
  configuredUrl?: string,
): SupabaseUrlResolution => {
  const candidate = configuredUrl?.trim();
  if (!candidate) {
    return {
      url: CANONICAL_SUPABASE_URL,
      usedFallback: true,
      migratedLegacyHost: false,
    };
  }

  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();

    if (LEGACY_PROJECT_HOSTS.has(hostname)) {
      return {
        url: CANONICAL_SUPABASE_URL,
        usedFallback: false,
        migratedLegacyHost: true,
      };
    }

    return {
      url: parsed.origin,
      usedFallback: false,
      migratedLegacyHost: false,
    };
  } catch {
    return {
      url: CANONICAL_SUPABASE_URL,
      usedFallback: true,
      migratedLegacyHost: false,
    };
  }
};
