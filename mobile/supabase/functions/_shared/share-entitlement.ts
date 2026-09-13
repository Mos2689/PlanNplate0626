// Is this user allowed one more recipe import?
//
// Two halves, neither of which existed before the share extension needed them:
//
//   • PREMIUM. There is no subscription table and no RevenueCat webhook in this
//     project — `useHasPremiumAccess` reads the RevenueCat SDK on the device and
//     nothing is ever written to Postgres. So the server asks RevenueCat
//     directly. That works because the app calls `Purchases.logIn(userId)` with
//     the Supabase user id (src/lib/subscription-store.ts), which makes the
//     Supabase id the RevenueCat app_user_id.
//
//   • ALLOWANCE. `spend_import_allowance` (migration 20260913120000) checks and
//     increments in one statement, so two links shared back to back cannot both
//     pass the same check.
//
// The failure posture is deliberate and asymmetric: anything we cannot determine
// resolves to 'unknown', and the caller turns that into a queued share rather
// than a block. Wrongly gating a paying user is a support ticket; wrongly
// allowing one import is a rounding error.

/** Entitlement id configured in RevenueCat — see subscription-store.ts. */
const PREMIUM_ENTITLEMENT = 'premium';

/**
 * Lifetime free-tier import allowance.
 *
 * Must stay equal to `MONTHLY_FEATURE_LIMITS.importRecipe` in src/lib/store.ts,
 * which is listed in LIFETIME_FEATURES and therefore never resets.
 */
export const IMPORT_ALLOWANCE_LIMIT = 10;

export type EntitlementState = 'premium' | 'allowed' | 'gated' | 'unknown';

/**
 * Ask RevenueCat whether this user's `premium` entitlement is active.
 *
 * Returns null — not false — when we cannot tell (no key, network failure, 5xx).
 * A 404 IS an answer: RevenueCat has never seen this user, so they have never
 * subscribed.
 */
async function hasPremiumEntitlement(userId: string): Promise<boolean | null> {
  const secretKey = Deno.env.get('REVENUECAT_SECRET_KEY');
  if (!secretKey) {
    console.warn('[Entitlement] REVENUECAT_SECRET_KEY is not set — cannot verify premium');
    return null;
  }

  try {
    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        headers: { Authorization: `Bearer ${secretKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      },
    );

    // Never purchased anything. A definite "not premium".
    if (response.status === 404) return false;
    if (!response.ok) {
      console.error('[Entitlement] RevenueCat responded', response.status);
      return null;
    }

    const body = await response.json();
    const entitlement =
      body?.subscriber?.entitlements?.[PREMIUM_ENTITLEMENT];
    if (!entitlement) return false;

    // `expires_date` is null for a lifetime/non-expiring grant.
    const expiresAt = entitlement.expires_date;
    if (!expiresAt) return true;
    return new Date(expiresAt).getTime() > Date.now();
  } catch (error) {
    console.error('[Entitlement] RevenueCat lookup failed:', error);
    return null;
  }
}

/**
 * Resolve entitlement and, for a non-premium user, SPEND one import.
 *
 * The allowance is spent before extraction rather than after, so that two
 * concurrent shares cannot both observe the same remaining count. Extraction
 * failures call `refundImportAllowance` — a user must not be charged for a
 * recipe that never arrived.
 */
export async function claimImportAllowance(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
): Promise<{ state: EntitlementState; spent: boolean }> {
  const premium = await hasPremiumEntitlement(userId);

  if (premium === null) return { state: 'unknown', spent: false };
  if (premium) return { state: 'premium', spent: false };

  const { data, error } = await supabase.rpc('spend_import_allowance', {
    p_user_id: userId,
    p_limit: IMPORT_ALLOWANCE_LIMIT,
  });

  if (error) {
    console.error('[Entitlement] spend_import_allowance failed:', error);
    return { state: 'unknown', spent: false };
  }

  // The function returns a single row: { allowed, used }.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { state: 'unknown', spent: false };

  return row.allowed
    ? { state: 'allowed', spent: true }
    : { state: 'gated', spent: false };
}

/** Hand back an allowance spent on an import that then failed. */
export async function refundImportAllowance(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
): Promise<void> {
  const { error } = await supabase.rpc('refund_import_allowance', { p_user_id: userId });
  if (error) {
    // Not worth failing the request over — the user already has their answer,
    // and the worst case is one import they paid for and didn't get.
    console.error('[Entitlement] refund_import_allowance failed:', error);
  }
}
