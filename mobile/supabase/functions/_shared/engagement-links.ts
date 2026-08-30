// Engagement links — URL building and HTML escaping for the lifecycle emails.
//
// Split out of engagement-email.ts because two very different consumers need
// it. The email renderer builds these links; engagement-click RESOLVES them,
// and that endpoint has no business importing an 800-line HTML template engine
// to get three pure functions. Keeping the link contract in one small module
// also means the sender and the resolver cannot drift apart — they agree by
// construction rather than by review.
//
// Nothing here renders anything. No I/O beyond reading configuration.

/** Public base URL for the click and unsubscribe endpoints. */
export function publicBase(): string {
  const explicit = Deno.env.get('ENGAGEMENT_PUBLIC_BASE_URL');
  if (explicit) {
    return explicit.replace(/^http:\/\//i, 'https://').replace(/\/+$/, '');
  }
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  return `${url.replace(/^http:\/\//i, 'https://').replace(/\/+$/, '')}/functions/v1`;
}

/**
 * Escape before anything user-authored touches HTML.
 *
 * Recipe names, custom meal names and ingredient names are all user-authored
 * (imported from arbitrary web pages, in the case of `is_imported` recipes).
 * Same implementation as support-email.ts — duplicated rather than imported
 * only to keep those modules independently deployable.
 */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Allowlisted CTA targets.
 *
 * The email carries a KEY, never a URL — engagement-click resolves it. An
 * endpoint that redirected to whatever a query string asked for would be an
 * open redirect on a domain users are being taught to trust.
 */
export type CtaTarget = 'plan' | 'grocery' | 'recipe' | 'recipes' | 'profile';

export const CTA_TARGETS: readonly CtaTarget[] = [
  'plan',
  'grocery',
  'recipe',
  'recipes',
  'profile',
] as const;

export function isCtaTarget(value: unknown): value is CtaTarget {
  return typeof value === 'string' && (CTA_TARGETS as readonly string[]).includes(value);
}

/**
 * The app-side destination for each allowlisted target.
 *
 * `plannplate:///path` — the triple slash is deliberate. It gives an empty
 * host and a real path, which is what expo-router's linking expects; the
 * two-slash form makes the first segment a hostname and routes inconsistently.
 * The scheme is declared in app.json.
 */
export function deepLinkFor(
  target: CtaTarget,
  recipeId?: string | null,
  /**
   * Send id, echoed into the link as `pnp_send`. Lets the app fire the
   * "destination actually opened" event that closes the funnel — the click
   * endpoint can only prove someone tapped, not that the app came up. Read by
   * hooks/useEngagementLinks and otherwise ignored by every screen.
   */
  sendId?: string | null,
): string {
  const tail = sendId ? `pnp_send=${encodeURIComponent(sendId)}` : '';
  const join = (path: string, query = '') => {
    const parts = [query, tail].filter(Boolean).join('&');
    return parts ? `${path}?${parts}` : path;
  };

  switch (target) {
    case 'plan':
      return join('plannplate:///plan-meals');
    case 'grocery':
      return join('plannplate:///grocery');
    case 'recipes':
      return join('plannplate:///recipes');
    case 'profile':
      return join('plannplate:///preferences');
    case 'recipe':
      return recipeId
        ? join('plannplate:///recipe-detail', `id=${encodeURIComponent(recipeId)}`)
        : join('plannplate:///recipes');
  }
}

/**
 * Tracked click URL. Always https — PlanNplate has no universal links
 * (no `associatedDomains`, no verified App Links), and support-email.ts
 * already records that some clients refuse to render `plannplate://` as a
 * link at all. Routing through https also gets us click attribution.
 */
export function clickUrl(
  sendId: string,
  target: CtaTarget,
  recipeId?: string | null,
): string {
  const params = new URLSearchParams({ s: sendId, t: target });
  if (recipeId) params.set('r', recipeId);
  return `${publicBase()}/engagement-click?${params.toString()}`;
}

/** Unsubscribe URL. Opaque token — never an email address in a link. */
export function unsubscribeUrl(token: string, scope: 'weekly' | 'monthly' | 'all'): string {
  return `${publicBase()}/engagement-unsubscribe?t=${encodeURIComponent(token)}&p=${scope}`;
}
