import { presentSocialAuthError } from '../social-auth-errors';

describe('presentSocialAuthError', () => {
  it('does not expose an external Google authorization code', () => {
    const result = presentSocialAuthError(
      'google',
      'Unable to exchange external code: 4/0AbCdEfSecretCode',
    );

    expect(result.code).toBe('provider_exchange_failed');
    expect(result.message).not.toContain('4/0AbCdEfSecretCode');
    expect(result.message).toContain('Google sign in');
  });

  it('does not echo unknown provider errors', () => {
    const result = presentSocialAuthError('facebook', 'internal provider detail');

    expect(result.code).toBe('unknown');
    expect(result.message).toBe('Facebook sign in failed. Please try again.');
  });
});
