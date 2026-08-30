// engagement-webhook — Resend delivery events.
//
// Two jobs:
//   1. Complete the funnel. delivered / opened / clicked land on the matching
//      engagement_sends row, so "did this work?" is answerable without a
//      separate analytics product.
//   2. Protect the sending domain. A hard bounce or a spam complaint writes the
//      address to email_suppressions, and the dispatcher checks that list
//      before every send. Without this, one bad address gets mailed weekly
//      forever and the complaint rate quietly poisons deliverability for
//      password resets too.
//
// The endpoint is public by necessity, so the Svix signature is verified
// before anything is written. An unverified body is remote input claiming to
// be Resend, and acting on it would let anyone suppress any address — a
// trivial denial-of-service against a user's account recovery.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Svix tolerates a 5-minute clock skew; beyond that a replay is assumed. */
const TOLERANCE_SECONDS = 300;

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Verify a Svix-signed payload (the scheme Resend uses).
 *
 * Implemented directly against Web Crypto rather than pulling the svix package
 * in — it is thirty lines of HMAC, and a webhook verifier is a bad place for a
 * dependency whose supply chain we don't watch.
 */
async function verifySignature(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
  signatureHeader: string,
): Promise<boolean> {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;

  // `whsec_<base64>` — the prefix is not part of the key material.
  const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  // `.buffer` rather than the view: recent TypeScript parameterises typed
  // arrays by their backing buffer, and a plain `Uint8Array` no longer
  // satisfies `BufferSource` without narrowing.
  const key = await crypto.subtle.importKey(
    'raw',
    b64ToBytes(raw).buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signed = new TextEncoder().encode(`${id}.${timestamp}.${body}`);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, signed));

  // The header carries a space-separated list of `v1,<base64>` — more than one
  // during a secret rotation. Any match is a pass.
  for (const part of signatureHeader.split(' ')) {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) continue;
    try {
      if (timingSafeEqual(expected, b64ToBytes(value))) return true;
    } catch {
      // Malformed entry — keep checking the rest.
    }
  }
  return false;
}

/** Resend event type → the column it stamps. */
const STAMP_COLUMN: Record<string, string> = {
  'email.delivered': 'delivered_at',
  'email.opened': 'opened_at',
  'email.clicked': 'clicked_at',
  'email.bounced': 'bounced_at',
  'email.complained': 'complained_at',
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  if (!secret) {
    console.error('[EngagementWebhook] RESEND_WEBHOOK_SECRET not set.');
    return new Response('Server configuration error', { status: 500 });
  }

  const body = await req.text();
  const svixId = req.headers.get('svix-id') ?? '';
  const svixTimestamp = req.headers.get('svix-timestamp') ?? '';
  const svixSignature = req.headers.get('svix-signature') ?? '';

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing signature headers', { status: 400 });
  }

  const valid = await verifySignature(secret, svixId, svixTimestamp, body, svixSignature);
  if (!valid) {
    console.warn('[EngagementWebhook] Rejected an unverified payload.');
    return new Response('Invalid signature', { status: 401 });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const type = String(event.type ?? '');
  const data = event.data ?? {};
  const messageId = String((data as { email_id?: string }).email_id ?? '');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return new Response('Server configuration error', { status: 500 });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const column = STAMP_COLUMN[type];
    if (column && messageId) {
      // Only stamp if empty — first occurrence is the interesting one, and
      // providers redeliver.
      await admin
        .from('engagement_sends')
        .update({ [column]: new Date().toISOString() })
        .eq('resend_message_id', messageId)
        .is(column, null);
    }

    // ── Reputation protection.
    if (type === 'email.bounced' || type === 'email.complained') {
      const recipients = (data as { to?: string[] | string }).to;
      const addresses = (Array.isArray(recipients) ? recipients : [recipients])
        .filter((a): a is string => typeof a === 'string' && a.includes('@'))
        .map((a) => a.trim().toLowerCase());

      // A soft bounce (full mailbox, temporary failure) is not a dead address,
      // and suppressing on one would quietly lose real users. Only hard
      // failures and complaints are permanent.
      const bounceType = String(
        (data as { bounce?: { type?: string } }).bounce?.type ?? '',
      ).toLowerCase();
      const isHard = type === 'email.complained' || bounceType !== 'softbounce';

      if (isHard) {
        for (const email of addresses) {
          await admin.from('email_suppressions').upsert(
            {
              email,
              reason: type === 'email.complained' ? 'complained' : 'bounced',
              detail: bounceType || type,
            },
            { onConflict: 'email' },
          );
        }
      }
    }
  } catch (e) {
    // Answer 200 regardless. A non-2xx makes Resend retry, and a retry storm
    // against a bug here would be worse than a lost analytics stamp. The
    // failure is logged and the funnel has a hole; nothing breaks.
    console.error('[EngagementWebhook] Handling failed:', e);
  }

  return new Response('OK', { status: 200 });
});
