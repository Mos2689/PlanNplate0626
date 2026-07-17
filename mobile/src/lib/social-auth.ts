import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import type { Session } from '@supabase/supabase-js';
import { parseAuthCallback, type AuthCallbackType } from './auth-callback';
import {
  presentSocialAuthError,
  type SocialAuthProvider,
} from './social-auth-errors';
import { supabase } from './supabase';

export type SocialProvider = SocialAuthProvider;

export interface CompletedAuthCallback {
  handled: boolean;
  session: Session | null;
  type: AuthCallbackType;
  error?: string;
}

export interface SocialAuthLaunchResult extends CompletedAuthCallback {
  cancelled: boolean;
}

export const SOCIAL_AUTH_REDIRECT_URI = AuthSession.makeRedirectUri({
  scheme: 'plannplate',
  path: 'auth/callback',
});

WebBrowser.maybeCompleteAuthSession();

const callbackCache = new Map<string, Promise<CompletedAuthCallback>>();

const providerScopes: Record<SocialProvider, string> = {
  google: 'openid email profile',
  facebook: 'email public_profile',
  apple: 'name email',
};

export const providerDisplayName = (provider: SocialProvider): string =>
  provider === 'google' ? 'Google' : provider === 'facebook' ? 'Facebook' : 'Apple';

const completeAuthCallbackOnce = async (url: string): Promise<CompletedAuthCallback> => {
  const parsed = parseAuthCallback(url);

  if (!parsed.isAuthCallback) {
    return { handled: false, session: null, type: parsed.type };
  }

  if (parsed.error) {
    return {
      handled: true,
      session: null,
      type: parsed.type,
      error: parsed.error,
    };
  }

  if (parsed.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(parsed.code);
    return {
      handled: true,
      session: data.session,
      type: parsed.type,
      error: error?.message,
    };
  }

  if (parsed.accessToken) {
    if (!parsed.refreshToken) {
      return {
        handled: true,
        session: null,
        type: parsed.type,
        error: 'The authentication response did not include a refresh token.',
      };
    }

    const { data, error } = await supabase.auth.setSession({
      access_token: parsed.accessToken,
      refresh_token: parsed.refreshToken,
    });
    return {
      handled: true,
      session: data.session,
      type: parsed.type,
      error: error?.message,
    };
  }

  return { handled: false, session: null, type: parsed.type };
};

/** Deduplicates callbacks that may reach both Linking and openAuthSessionAsync. */
export const completeAuthCallback = (url: string): Promise<CompletedAuthCallback> => {
  const cached = callbackCache.get(url);
  if (cached) return cached;

  const request = completeAuthCallbackOnce(url);
  callbackCache.set(url, request);
  setTimeout(() => callbackCache.delete(url), 30_000);
  return request;
};

export const startSocialAuth = async (
  provider: SocialProvider,
): Promise<SocialAuthLaunchResult> => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: SOCIAL_AUTH_REDIRECT_URI,
      skipBrowserRedirect: true,
      scopes: providerScopes[provider],
    },
  });

  if (error || !data.url) {
    return {
      handled: true,
      cancelled: false,
      session: null,
      type: null,
      error: error?.message || `Unable to start ${providerDisplayName(provider)} sign in.`,
    };
  }

  const browserResult = await WebBrowser.openAuthSessionAsync(
    data.url,
    SOCIAL_AUTH_REDIRECT_URI,
  );

  if (browserResult.type !== 'success' || !('url' in browserResult)) {
    return {
      handled: true,
      cancelled: true,
      session: null,
      type: null,
    };
  }

  const completed = await completeAuthCallback(browserResult.url);
  return { ...completed, cancelled: false };
};

export const getSocialAuthErrorMessage = (
  provider: SocialProvider,
  error?: string,
): string => presentSocialAuthError(provider, error).message;
