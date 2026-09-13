// Everything the iOS share extension needs in place before it can import on its
// own, arranged once per signed-in session.
//
// Three things, and none of them is allowed to fail loudly:
//
//   1. The ENDPOINT. Published into the App Group so the extension knows which
//      Supabase project to call. It can't read `.env`, and compiling a URL into
//      it would point a TestFlight build at whatever the last developer had
//      configured.
//   2. The CREDENTIAL. A share-import token in the shared Keychain — revocable,
//      scoped to one action, and never the user's session. See ./import-token.
//   3. The METER. Reconciles the local free-tier import count with the server,
//      which is the only copy the extension's edge function can read.
//
// Every one of them degrades to the behaviour that shipped before: the extension
// queues the link and the app imports it on next open. That is why this is
// called fire-and-forget from StoreHydration rather than awaited — a share
// feature must never be able to hold up or break app launch.

import { Platform } from 'react-native';
import { configureShareImport } from '../../../modules/plannplate-share-target';
import { SUPABASE_URL } from '../supabase';
import { swallow } from '../failure';
import { syncImportAllowance } from '../database';
import { useMealPlanStore } from '../store';
import {
  SHARE_KEYCHAIN_ACCESS_GROUP,
  ensureShareImportToken,
  revokeShareImportTokens,
} from './import-token';

/** The edge function the extension posts page HTML to. */
const SHARE_IMPORT_FUNCTION = 'share-import';

/**
 * Called once per signed-in user, after their data has loaded.
 *
 * Idempotent and cheap to repeat: `ensureShareImportToken` returns immediately
 * when the Keychain already holds a valid token, and publishing the endpoint is
 * two `UserDefaults` writes.
 */
export async function prepareShareImport(userId: string): Promise<void> {
  // Before the iOS gate on purpose. The import allowance is an ACCOUNT-level
  // number, not a per-platform one: an Android user's local count still has to
  // reach the server, or the day they install on iOS the extension would look
  // up a stale count and hand them a fresh ten.
  await reconcileImportAllowance();

  if (Platform.OS !== 'ios') return;

  try {
    if (SUPABASE_URL) {
      const published = configureShareImport(
        `${SUPABASE_URL}/functions/v1/${SHARE_IMPORT_FUNCTION}`,
        SHARE_KEYCHAIN_ACCESS_GROUP,
      );
      if (__DEV__ && !published) {
        console.warn(
          '[ShareImport] Could not publish the endpoint to the App Group — the ' +
            'extension will queue links instead of importing them. Either this ' +
            'build predates configureShareImport, or the App Groups entitlement ' +
            'is missing.',
        );
      }
    }

    await ensureShareImportToken(userId);
  } catch (error) {
    swallow(error, 'share import setup is best-effort; capture still works', 'recipe-share');
  }
}

/**
 * Take the higher of the local and server import counts, and keep both.
 *
 * The local counter has always been the source of truth
 * (`preferences.lifetimeFeatureUsage`, never written to the database — see the
 * note in store.ts's rehydrate). The extension can't reach it, so the server now
 * keeps a copy. Reconciling in both directions is what stops an existing user
 * being handed a fresh allowance the first time they share, and stops a
 * reinstall clearing one.
 *
 * Called on launch AND on every successful in-app import
 * (`useRecipeFeatureGate.markUsed`). Launch alone is not enough: without the
 * second call a user could paste-import their way through the allowance and then
 * share from Instagram in the same session, against a server count that hadn't
 * moved since launch. Never throws — the local meter is unaffected either way.
 */
export async function reconcileImportAllowance(): Promise<void> {
  try {
    const store = useMealPlanStore.getState();
    const local = store.getMonthlyFeatureCount('importRecipe');

    const reconciled = await syncImportAllowance(local);
    // null means the RPC isn't deployed yet. Local metering continues unchanged.
    if (reconciled === null || reconciled === local) return;

    store.setImportAllowanceUsed(reconciled);
  } catch (error) {
    swallow(error, 'the local import meter is unaffected by a failed sync', 'recipe-share');
  }
}

/**
 * Called on sign-out.
 *
 * Revoking matters on a shared device: without it, the extension's credential
 * would still resolve to the previous account and a shared link would land in
 * someone else's library.
 */
export async function teardownShareImport(userId: string): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await revokeShareImportTokens(userId);
  } catch (error) {
    swallow(error, 'token revocation is retried on next sign-in', 'recipe-share');
  }
}
