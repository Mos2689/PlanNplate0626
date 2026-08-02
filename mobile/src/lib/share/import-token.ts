// The credential the iOS share extension uses, and nothing else.
//
// The extension cannot reach the app's Supabase session — it lives in
// AsyncStorage in another process — and it shouldn't be able to. A session token
// opens the whole account; an extension is launched by arbitrary third-party
// apps with whatever content they choose to hand it. So it gets a credential
// that resolves to a user id for one purpose and can be revoked on its own.
//
// Three properties this is built around:
//   • The plaintext exists only in the device Keychain, in a group the app and
//     the extension share. The server keeps a SHA-256 hash.
//   • It is revoked on sign-out, so a shared device can't leak imports between
//     accounts.
//   • Losing it is recoverable and cheap — the app mints a new one on next
//     launch, and the worst case is one share that has to be retried.
//
// Android has no equivalent and needs none: the app process IS the share target
// there, so the ordinary session applies.

import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../supabase';
import { swallow } from '../failure';

/**
 * Keychain access group shared between the app and the share extension.
 *
 * Must match `keychain-access-groups` in app.config.js and the extension's
 * entitlements. The team prefix is required by iOS — a bare bundle id here
 * silently fails to match and every read comes back empty.
 */
export const SHARE_KEYCHAIN_ACCESS_GROUP = 'KP2T42YA49.com.vibecode.planplate.8ctfq2';

/** Keychain item name. Also hard-coded in targets/share/KeychainReader.swift. */
export const SHARE_TOKEN_KEY = 'plannplate.share.import-token';

const TOKEN_BYTES = 32;

/** Hex SHA-256 — the only form the server ever sees. */
export async function hashToken(token: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, token, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Ensure this device has a usable import credential.
 *
 * Idempotent and safe to call on every launch: if the Keychain already holds a
 * token whose hash is registered and unrevoked, nothing happens. Only iOS needs
 * this, so it is a no-op elsewhere.
 *
 * Never throws — a missing credential degrades the extension to the previous
 * behaviour (capture the link, import when the app opens), which is worse but
 * not broken, and is not worth failing a launch over.
 */
export async function ensureShareImportToken(userId: string): Promise<void> {
  if (Platform.OS !== 'ios') return;

  try {
    const existing = await readShareImportToken();
    if (existing) {
      const { data } = await supabase
        .from('share_import_tokens')
        .select('id')
        .eq('token_hash', await hashToken(existing))
        .eq('user_id', userId)
        .is('revoked_at', null)
        .maybeSingle();
      if (data) return; // Still valid.
    }

    const token = toHex(await Crypto.getRandomBytesAsync(TOKEN_BYTES));
    const tokenHash = await hashToken(token);

    const { error } = await supabase
      .from('share_import_tokens')
      .insert({ user_id: userId, token_hash: tokenHash });
    if (error) throw error;

    await SecureStore.setItemAsync(SHARE_TOKEN_KEY, token, {
      accessGroup: SHARE_KEYCHAIN_ACCESS_GROUP,
      // The extension can run while the device is locked-but-unlocked-once
      // (a share sheet from the lock screen widget, say), so the item has to
      // survive that. It never leaves the device and is not synced to iCloud.
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  } catch (error) {
    swallow(error, 'share import credential is best-effort; capture still works without it', 'recipe-share');
  }
}

/** The plaintext token, or null. Used only to check validity from the app side. */
export async function readShareImportToken(): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    return await SecureStore.getItemAsync(SHARE_TOKEN_KEY, {
      accessGroup: SHARE_KEYCHAIN_ACCESS_GROUP,
    });
  } catch {
    return null;
  }
}

/**
 * Revoke every credential for the account and clear the Keychain.
 *
 * Called on sign-out. The server row is revoked FIRST: if the app is killed
 * between the two steps, a stranded Keychain item that no longer resolves is
 * harmless, whereas a live credential with no local copy would be a credential
 * nobody can see and nobody can revoke.
 */
export async function revokeShareImportTokens(userId: string): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    await supabase
      .from('share_import_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null);
  } catch (error) {
    swallow(error, 'token revocation is retried on next sign-in', 'recipe-share');
  }

  try {
    await SecureStore.deleteItemAsync(SHARE_TOKEN_KEY, {
      accessGroup: SHARE_KEYCHAIN_ACCESS_GROUP,
    });
  } catch (error) {
    swallow(error, 'keychain cleanup is best-effort', 'recipe-share');
  }
}
