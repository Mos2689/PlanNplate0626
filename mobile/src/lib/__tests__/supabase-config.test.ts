import {
  CANONICAL_SUPABASE_URL,
  resolveSupabaseUrl,
} from '../supabase-config';

describe('resolveSupabaseUrl', () => {
  it('uses the branded URL when configuration is missing', () => {
    expect(resolveSupabaseUrl(undefined)).toEqual({
      url: CANONICAL_SUPABASE_URL,
      usedFallback: true,
      migratedLegacyHost: false,
    });
  });

  it('migrates the legacy project hostname to the branded URL', () => {
    expect(
      resolveSupabaseUrl('https://wcjsrhdlnmfugdjtvadj.supabase.co'),
    ).toEqual({
      url: CANONICAL_SUPABASE_URL,
      usedFallback: false,
      migratedLegacyHost: true,
    });
  });

  it('keeps valid staging URLs available', () => {
    expect(resolveSupabaseUrl('https://staging.example.com/').url).toBe(
      'https://staging.example.com',
    );
  });

  it('falls back safely for an invalid URL', () => {
    expect(resolveSupabaseUrl('not a URL').url).toBe(CANONICAL_SUPABASE_URL);
  });
});
