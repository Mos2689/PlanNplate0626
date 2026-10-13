/**
 * Release-level feature switches.
 *
 * Social authentication remains implemented and tested, but is intentionally
 * hidden from this release while the external provider configuration is being
 * finalized. Set this to true when the providers are ready to ship.
 */
export const FEATURE_FLAGS = {
  socialAuth: false,
  /**
   * "Share to PlanNplate" — the iOS share extension and Android share target.
   *
   * The kill switch is JavaScript-side on purpose. The OS entries (the iOS
   * extension, the Android intent filter) are compiled into the binary and
   * cannot be withdrawn without a store release, but flipping this to false
   * makes the app ignore incoming payloads and stop routing to the share
   * screen — which ships in an ordinary update. See docs/SHARE_TO_PLANNPLATE.md.
   */
  shareToPlanNplate: true,
  /**
   * "Watch ~30 seconds of ads to unlock Premium for 7 days" on the paywall
   * (Google AdMob rewarded video). JavaScript-side kill switch: false hides the
   * option everywhere without a store release. See src/lib/rewarded-ad.ts.
   */
  adUnlock: true,
} as const;
