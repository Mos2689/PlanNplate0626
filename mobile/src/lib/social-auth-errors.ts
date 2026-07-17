export type SocialAuthProvider = 'google' | 'facebook' | 'apple';

export type SocialAuthErrorCode =
  | 'provider_disabled'
  | 'provider_exchange_failed'
  | 'network_error'
  | 'missing_email'
  | 'access_denied'
  | 'unknown';

export interface SocialAuthErrorPresentation {
  code: SocialAuthErrorCode;
  message: string;
}

const providerName = (provider: SocialAuthProvider): string =>
  provider === 'google' ? 'Google' : provider === 'facebook' ? 'Facebook' : 'Apple';

/** OAuth errors can contain one-time codes, so raw errors never reach the UI. */
export const presentSocialAuthError = (
  provider: SocialAuthProvider,
  error?: string,
): SocialAuthErrorPresentation => {
  const name = providerName(provider);
  const message = error?.toLowerCase() ?? '';

  if (message.includes('provider is not enabled') || message.includes('unsupported provider')) {
    return {
      code: 'provider_disabled',
      message: `${name} sign in is not configured yet. Please contact support.`,
    };
  }

  if (
    message.includes('unable to exchange external code') ||
    message.includes('invalid_grant') ||
    message.includes('cannot fetch token')
  ) {
    return {
      code: 'provider_exchange_failed',
      message: `We couldn't complete ${name} sign in. Please try again. If this continues, contact support.`,
    };
  }

  if (message.includes('network') || message.includes('fetch')) {
    return {
      code: 'network_error',
      message: `We couldn't reach ${name}. Check your connection and try again.`,
    };
  }

  if (message.includes('email') && (message.includes('missing') || message.includes('supply'))) {
    return {
      code: 'missing_email',
      message: `${name} did not provide an email address. Allow email access and try again.`,
    };
  }

  if (message.includes('access_denied') || message.includes('not authorized')) {
    return {
      code: 'access_denied',
      message: `${name} sign in was not authorized.`,
    };
  }

  return {
    code: 'unknown',
    message: `${name} sign in failed. Please try again.`,
  };
};
