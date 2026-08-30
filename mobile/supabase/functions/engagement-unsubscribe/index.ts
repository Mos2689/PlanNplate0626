// engagement-unsubscribe — the way out.
//
// Two callers, two methods, and the difference matters:
//
//   POST — Gmail and Yahoo's one-click unsubscribe. Sent by the mail provider
//          on the user's behalf when they hit the header button. It must apply
//          IMMEDIATELY and answer 200. This is RFC 8058, and since 2024 both
//          providers require bulk senders to honour it.
//
//   GET  — a human clicking the footer link. Also applies immediately and then
//          shows a confirmation page.
//
// GET applying the change is a deliberate choice against the usual advice
// about non-idempotent GETs. The alternative — a page with a confirm button —
// leaves people who close the tab still subscribed, and the Australian Spam
// Act's requirement is that unsubscribing be simple. Mail scanners prefetching
// the link will unsubscribe someone who didn't ask, which is a real cost, but
// it is the cheaper error: a wrongly-unsubscribed user is annoyed, a
// wrongly-still-subscribed user reports spam and damages the sending domain.
//
// No login. Somebody who has lost access to their account must still be able
// to stop the email. The token is an opaque UUID and grants nothing except the
// ability to stop mail.
//
// No email address in the URL. Addresses in links leak through referrers,
// proxy logs and browser history.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Derived from a real call rather than `ReturnType<typeof createClient>`: the
// no-argument form resolves to different generics and won't accept a client
// built from a url and key. Same note as engagement-dispatch.
const makeAdmin = (url: string, key: string) =>
  createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

type AdminClient = ReturnType<typeof makeAdmin>;

const SAGE = '#546445';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

type Scope = 'weekly' | 'monthly' | 'all';

function html(title: string, body: string, status = 200): Response {
  return new Response(
    `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title}</title>
<meta name="robots" content="noindex,nofollow" />
</head>
<body style="margin:0;font-family:${FONT};background:#F7F6F1;color:#15140F;">
  <div style="max-width:440px;margin:0 auto;padding:64px 24px;">
    <p style="font-size:15px;font-weight:700;color:${SAGE};margin:0 0 28px;">PlanNplate</p>
    ${body}
  </div>
</body></html>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}

function scopeFrom(value: string | null): Scope {
  return value === 'weekly' || value === 'monthly' ? value : 'all';
}

/**
 * Apply the opt-out. Returns false only when the token doesn't resolve.
 *
 * A global unsubscribe also writes the address to `email_suppressions`, so the
 * decision survives even if the row is later recreated — and so a shared
 * address stays quiet.
 */
async function applyOptOut(
  admin: AdminClient,
  token: string,
  scope: Scope,
): Promise<boolean> {
  const { data: state } = await admin
    .from('user_engagement_state')
    .select('user_id')
    .eq('unsubscribe_token', token)
    .maybeSingle();

  if (!state) return false;
  const userId = (state as { user_id: string }).user_id;

  const patch: Record<string, boolean> = {};
  if (scope === 'weekly' || scope === 'all') patch.weekly_opt_out = true;
  if (scope === 'monthly' || scope === 'all') patch.monthly_opt_out = true;

  const { error } = await admin
    .from('user_engagement_state')
    .update(patch)
    .eq('user_id', userId);

  if (error) {
    console.error('[Unsubscribe] Could not apply opt-out:', error);
    return false;
  }

  if (scope === 'all') {
    const { data: account } = await admin
      .from('users')
      .select('email')
      .eq('id', userId)
      .maybeSingle();

    const email = (account as { email?: string } | null)?.email?.trim().toLowerCase();
    if (email) {
      await admin
        .from('email_suppressions')
        .upsert(
          { email, reason: 'unsubscribed', detail: 'user requested' },
          { onConflict: 'email' },
        );
    }
  }

  return true;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // One-click providers put the token in the query string of the URL they were
  // given in the List-Unsubscribe header, and POST an empty-ish body to it.
  const token = url.searchParams.get('t') ?? '';
  const scope = scopeFrom(url.searchParams.get('p'));

  if (!UUID_RE.test(token)) {
    // Same response for a malformed token as for an unknown one — no oracle
    // for probing which tokens exist.
    return req.method === 'POST'
      ? new Response('OK', { status: 200 })
      : html(
          'Link expired',
          `<h1 style="font-size:21px;font-weight:600;margin:0 0 12px;">This link isn't valid</h1>
           <p style="font-size:15.5px;line-height:1.6;color:#6B675C;margin:0;">It may have expired. You can turn these emails off any time in the app, under Profile.</p>`,
          200,
        );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('[Unsubscribe] Missing service configuration.');
    // Never tell a provider the unsubscribe failed — it will treat the
    // header as broken and may start filtering.
    return req.method === 'POST'
      ? new Response('OK', { status: 200 })
      : html('Something went wrong', '<p>Please try again shortly.</p>', 200);
  }

  const admin = makeAdmin(supabaseUrl, serviceKey);

  const ok = await applyOptOut(admin, token, scope);

  if (req.method === 'POST') {
    // RFC 8058: body content is irrelevant, the status is the whole answer.
    return new Response('OK', { status: 200 });
  }

  if (!ok) {
    return html(
      'Link expired',
      `<h1 style="font-size:21px;font-weight:600;margin:0 0 12px;">This link isn't valid</h1>
       <p style="font-size:15.5px;line-height:1.6;color:#6B675C;margin:0;">It may have expired. You can turn these emails off any time in the app, under Profile.</p>`,
    );
  }

  const what =
    scope === 'all'
      ? 'all PlanNplate engagement emails'
      : `PlanNplate's ${scope} email`;

  return html(
    'Unsubscribed',
    `<h1 style="font-size:21px;font-weight:600;margin:0 0 12px;">You're unsubscribed</h1>
     <p style="font-size:15.5px;line-height:1.6;color:#6B675C;margin:0 0 18px;">You won't receive ${what} again. This takes effect immediately.</p>
     <p style="font-size:14px;line-height:1.6;color:#9A968B;margin:0;">
       Your in-app reminders and account emails — password resets, support replies — are unaffected.
       ${
         scope !== 'all'
           ? `<br /><a href="?t=${encodeURIComponent(token)}&p=all" style="color:${SAGE};">Unsubscribe from all engagement emails</a>`
           : ''
       }
     </p>`,
  );
});
