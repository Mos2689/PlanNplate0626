const APPLE_PRIVATE_RELAY_DOMAINS = [
  'privaterelay.appleid.com',
  'private.icloud.com',
] as const;

export const isApplePrivateRelayEmail = (email?: string | null): boolean => {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;

  return APPLE_PRIVATE_RELAY_DOMAINS.some((domain) =>
    normalized.endsWith(`@${domain}`),
  );
};

export const getAccountEmailLabel = (email?: string | null): string =>
  isApplePrivateRelayEmail(email)
    ? 'Account email · Private via Apple'
    : 'Account email';
