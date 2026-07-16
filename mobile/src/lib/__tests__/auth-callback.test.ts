import { parseAuthCallback } from '../auth-callback';

describe('parseAuthCallback', () => {
  it('parses a PKCE authorization-code callback', () => {
    expect(parseAuthCallback('plannplate://auth/callback?code=one-time-code')).toEqual({
      code: 'one-time-code',
      accessToken: null,
      refreshToken: null,
      type: null,
      error: null,
      isAuthCallback: true,
    });
  });

  it('keeps compatibility with legacy fragment-token recovery links', () => {
    expect(
      parseAuthCallback(
        'plannplate://auth/callback#access_token=access&refresh_token=refresh&type=recovery',
      ),
    ).toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
      type: 'recovery',
      isAuthCallback: true,
    });
  });

  it('decodes provider errors without requiring a session', () => {
    expect(
      parseAuthCallback(
        'plannplate://auth/callback?error=access_denied&error_description=User%20cancelled',
      ),
    ).toMatchObject({
      error: 'User cancelled',
      isAuthCallback: true,
    });
  });

  it('ignores unrelated deep links', () => {
    expect(parseAuthCallback('plannplate://recipe/123').isAuthCallback).toBe(false);
  });
});

