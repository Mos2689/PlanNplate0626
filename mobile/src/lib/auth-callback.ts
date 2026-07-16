export type AuthCallbackType =
  | 'recovery'
  | 'signup'
  | 'email_change'
  | 'magiclink'
  | string
  | null;

export interface ParsedAuthCallback {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  type: AuthCallbackType;
  error: string | null;
  isAuthCallback: boolean;
}

const readParams = (value: string | undefined): URLSearchParams =>
  new URLSearchParams(value || '');

/**
 * Parses Supabase PKCE callbacks and legacy fragment-token callbacks without
 * logging or otherwise exposing credentials contained in the URL.
 */
export const parseAuthCallback = (url: string): ParsedAuthCallback => {
  const queryStart = url.indexOf('?');
  const hashStart = url.indexOf('#');
  const queryEnd = hashStart >= 0 ? hashStart : url.length;
  const query = readParams(
    queryStart >= 0 ? url.slice(queryStart + 1, queryEnd) : undefined,
  );
  const fragment = readParams(hashStart >= 0 ? url.slice(hashStart + 1) : undefined);

  const getParam = (key: string) => query.get(key) ?? fragment.get(key);
  const code = getParam('code');
  const accessToken = getParam('access_token');
  const refreshToken = getParam('refresh_token');
  const type = getParam('type');
  const error =
    getParam('error_description') ??
    getParam('error_message') ??
    getParam('error');

  return {
    code,
    accessToken,
    refreshToken,
    type,
    error,
    isAuthCallback: Boolean(code || accessToken || error),
  };
};

