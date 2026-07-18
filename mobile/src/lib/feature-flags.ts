/**
 * Release-level feature switches.
 *
 * Social authentication remains implemented and tested, but is intentionally
 * hidden from this release while the external provider configuration is being
 * finalized. Set this to true when the providers are ready to ship.
 */
export const FEATURE_FLAGS = {
  socialAuth: false,
} as const;
