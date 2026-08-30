// engagement-click — turns an https link in an email into an app screen.
//
// WHY THIS EXISTS AT ALL: PlanNplate has no universal links. app.json declares
// the `plannplate://` scheme and nothing else — no `associatedDomains`, no
// verified Android App Links. support-email.ts already records that some mail
// clients refuse to render a custom scheme as a clickable link, so every CTA in
// an engagement email has to be an ordinary https URL. This is where those land.
//
// WHY A 302: Supabase Edge Functions rewrite HTML returned from GET requests to
// text/plain, so an HTML app-opening interstitial is rendered as source code.
// Redirecting the ordinary HTTPS email CTA to the app's already-registered
// custom scheme keeps this flow backend-only and works with the released app.
//
// SECURITY: this endpoint is public and lives on a domain we are actively
// teaching users to trust. It therefore resolves an ALLOWLISTED KEY to a
// destination. It never redirects to a URL supplied in the query string; doing
// so would make PlanNplate an open-redirect laundering service for phishing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { deepLinkFor, isCtaTarget } from '../_shared/engagement-links.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function appRedirect(deepLink: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: deepLink,
      // Attribution must be recorded once per real click, not served from a
      // proxy cache.
      'Cache-Control': 'no-store, max-age=0',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const sendId = url.searchParams.get('s');
  const target = url.searchParams.get('t');
  const recipeId = url.searchParams.get('r');

  // An unrecognised target is not redirected anywhere interesting — it lands
  // on the recipe library. Silently degrading beats both a scary error page
  // and an obliging redirect to wherever the caller asked for.
  const safeTarget = isCtaTarget(target) ? target : 'recipes';
  const safeRecipeId = recipeId && UUID_RE.test(recipeId) ? recipeId : null;

  const safeSendId = sendId && UUID_RE.test(sendId) ? sendId : null;
  const deepLink = deepLinkFor(safeTarget, safeRecipeId, safeSendId);

  // Stamp the click, best-effort. Analytics must never stand between someone
  // and the thing they tapped, so this is fire-and-forget and every failure
  // path still returns the page.
  if (safeSendId) {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && serviceKey) {
        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        // First click only — `is('clicked_at', null)` keeps the timestamp
        // meaningful when someone opens the same email twice.
        await admin
          .from('engagement_sends')
          .update({ clicked_at: new Date().toISOString() })
          .eq('id', safeSendId)
          .is('clicked_at', null);
      }
    } catch (e) {
      console.warn('[EngagementClick] Could not record click:', e);
    }
  }

  return appRedirect(deepLink);
});
