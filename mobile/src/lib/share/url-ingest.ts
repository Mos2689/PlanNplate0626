// The one place a URL becomes trusted.
//
// Both entry points funnel through here — the share sheet (iOS extension /
// Android intent) and the paste field on import-recipe.tsx. That's deliberate:
// before this file existed the paste flow validated with `isUrl()` and
// normalised with `normalizeAndValidateUrl()`, while nothing validated a shared
// payload at all. Two entry points with two rulesets is how "it works when I
// paste but not when I share" bugs are born.
//
// Everything arriving here is UNTRUSTED. A share payload is arbitrary text from
// another app, so the guards below are not defensive politeness — a `file://`
// or `http://169.254.169.254/` URL reaching `fetch()` is a real problem.
//
// Nothing in this file evaluates, renders or logs the shared text.

// Imported from recipe-source rather than recipeImport: identical functions,
// but that module is free of the Supabase client, so this layer stays loadable
// (and therefore testable) outside a React Native runtime.
import { detectSourceType } from '../recipe-source';
import { normalizeRecipeSourceUrl } from '../recipe-identity';
import type { IngestOutcome, SharePayload, ShareSourceType } from './types';

/** Absurd payloads are rejected outright rather than scanned. */
const MAX_PAYLOAD_CHARS = 64_000;
/** Stop after this many candidates — a caption full of links is not a recipe. */
const MAX_CANDIDATES = 20;
/** Longest URL we'll accept. Beyond this it's almost certainly a data blob. */
const MAX_URL_CHARS = 2_048;

/**
 * Query parameters removed before the URL is used or keyed.
 *
 * Strip-list rather than keep-list: a keep-list would silently drop the params
 * that actually identify content on sites we haven't seen (`?recipe=`, `?p=`,
 * `?id=`), turning two different recipes into one dedup key. Anything not named
 * here survives.
 */
const TRACKING_PARAMS: readonly string[] = [
  'fbclid', 'gclid', 'dclid', 'msclkid', 'ttclid', 'twclid', 'epik',
  'igshid', 'igsh', 'mibextid', 'rdid', 'share_id', 'share_url',
  'ref_src', 'ref_url', 'si', 'feature', 'app', 'is_from_webapp',
  'sender_device', 'web_id', '_branch_match_id', '__twitter_impression',
];

/** Redirector wrappers that carry the real destination in a query parameter. */
const WRAPPERS: Record<string, readonly string[]> = {
  'l.instagram.com': ['u'],
  'l.facebook.com': ['u'],
  'lm.facebook.com': ['u'],
  'out.reddit.com': ['url'],
  'www.google.com': ['q', 'url'],
  'href.li': [],
};

/**
 * Shorteners we resolve before importing.
 *
 * `youtu.be` is absent on purpose — `normalizeRecipeSourceUrl` already canonicalises
 * it without a network round trip, and resolving it would only add latency.
 * `fb.watch` is absent because it IS the content URL as far as the importer's
 * `meta-oembed` path is concerned.
 */
const SHORTENER_HOSTS: ReadonlySet<string> = new Set([
  'vm.tiktok.com', 'vt.tiktok.com', 'pin.it', 'bit.ly', 'tinyurl.com',
  't.co', 'ow.ly', 'buff.ly', 'cutt.ly', 'rb.gy', 'shorturl.at',
  'lnkd.in', 'goo.gl', 's.id', 'trib.al',
]);

/** Schemes we will hand to `fetch`. Everything else is refused by name. */
const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

// Matches an absolute http(s) URL, or a bare `www.`-prefixed host. Trailing
// punctuation is trimmed separately — captions routinely end "…recipe here!
// https://example.com/thing." and the full stop is not part of the link.
// Square brackets are ALLOWED through, because an IPv6 host is written
// `http://[::1]/` — excluding them meant such a URL was never even seen as a
// candidate, so it was reported as "no link" instead of being refused as a
// blocked address. Unbalanced brackets are trimmed below, the same way stray
// closing parentheses are.
const ABSOLUTE_URL = /https?:\/\/[^\s<>"'`{}|\\^]+/gi;
const WWW_URL = /(?:^|[\s(])(?:www\.)[^\s<>"'`{}|\\^]+/gi;
// Any `scheme:` that isn't http(s) — used to tell "no link" apart from
// "a link we refuse to open", which are different messages to a person.
const FOREIGN_SCHEME = /\b(?:file|javascript|data|content|ftp|mailto|tel|blob|about|chrome|intent|market|itms-apps)\s*:/i;

/** Drop the sentence punctuation captions leave stuck to the end of a link. */
function trimTrailingPunctuation(raw: string): string {
  let url = raw;
  while (url.length > 0 && /[.,;:!?'"»›]$/.test(url)) {
    url = url.slice(0, -1);
  }
  // Only unbalanced closers are trimmed: Wikipedia-style links legitimately end
  // in ')', and an IPv6 host legitimately contains '[' and ']'.
  url = trimUnbalanced(url, '(', ')');
  url = trimUnbalanced(url, '[', ']');
  return url;
}

function trimUnbalanced(url: string, open: string, close: string): string {
  const opens = url.split(open).length - 1;
  const closes = url.split(close).length - 1;
  let extra = closes - opens;
  let result = url;
  while (extra > 0 && result.endsWith(close)) {
    result = result.slice(0, -1);
    extra -= 1;
  }
  return result;
}

/**
 * Is this host one we refuse to fetch?
 *
 * Blocks loopback, private, link-local (which covers the 169.254.169.254 cloud
 * metadata endpoint), unique-local IPv6, and single-label hostnames — an
 * intranet name like `wiki` has no business in a recipe share and is the
 * classic SSRF pivot.
 */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa')) return true;

  // IPv6
  if (host === '::' || host === '::1') return true;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;          // link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;          // unique-local fc00::/7
  if (host.startsWith('::ffff:')) return true;                // IPv4-mapped

  // IPv4
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;                  // incl. metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;        // CGNAT
    if (a >= 224) return true;                                // multicast / reserved
    return false;
  }

  // A hostname with no dot can only resolve on the local network.
  if (!host.includes('.')) return true;

  return false;
}

/** Unwrap `l.instagram.com/?u=<encoded>` style redirectors, once. */
function unwrapRedirector(url: URL): URL {
  const params = WRAPPERS[url.hostname.toLowerCase()];
  if (!params) return url;
  for (const key of params) {
    const inner = url.searchParams.get(key);
    if (!inner) continue;
    try {
      const candidate = new URL(decodeURIComponent(inner));
      if (ALLOWED_PROTOCOLS.has(candidate.protocol)) return candidate;
    } catch {
      // Not a URL — try the next parameter.
    }
  }
  return url;
}

/**
 * Remove tracking parameters. Runs BEFORE the canonical key is derived so the
 * same post shared from two apps produces one key.
 *
 * Deliberately NOT folded into `normalizeRecipeSourceUrl`: that function is the
 * dedup key for every recipe already saved on every device, and changing what it
 * returns would orphan those keys and resurface old recipes as "new".
 */
export function stripTrackingParams(url: URL): URL {
  const cleaned = new URL(url.toString());
  for (const key of [...cleaned.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS.includes(lower) || lower.startsWith('utm_') || lower.startsWith('_nc_')) {
      cleaned.searchParams.delete(key);
    }
  }
  // `?` with nothing after it is noise and would split the dedup key.
  if ([...cleaned.searchParams.keys()].length === 0) cleaned.search = '';
  return cleaned;
}

/** Every http(s) candidate in a blob of text, in document order, deduped. */
export function findUrlCandidates(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const url = trimTrailingPunctuation(raw.trim());
    if (!url || url.length > MAX_URL_CHARS) return;
    if (seen.has(url)) return;
    seen.add(url);
    found.push(url);
  };

  for (const match of text.matchAll(ABSOLUTE_URL)) {
    if (found.length >= MAX_CANDIDATES) break;
    push(match[0]);
  }
  if (found.length < MAX_CANDIDATES) {
    for (const match of text.matchAll(WWW_URL)) {
      if (found.length >= MAX_CANDIDATES) break;
      push(`https://${match[0].trim().replace(/^www\./i, 'www.')}`);
    }
  }
  return found;
}

/**
 * Pick the most likely recipe link out of several.
 *
 * A recognised social host wins: when a caption mixes a creator's link-in-bio
 * with the post's own permalink, the permalink is the recipe. Otherwise the LAST
 * link wins — captions end with the link far more often than they begin with it.
 */
export function selectBestUrl(candidates: URL[]): URL | undefined {
  if (candidates.length === 0) return undefined;
  const recognised = candidates.find((u) => detectSourceType(u.toString()) !== 'website');
  return recognised ?? candidates[candidates.length - 1];
}

/**
 * Turn an untrusted payload into a URL we're willing to import, or say exactly
 * why not. Pure and synchronous — shortener resolution is a separate, optional,
 * network-bound step so the UI can render its first frame without waiting.
 */
export function ingestSharedPayload(payload: SharePayload): IngestOutcome {
  const parts = [payload.url, payload.text, payload.subject].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  const blob = parts.join('\n');

  if (blob.length === 0) return { kind: 'no-url' };
  if (blob.length > MAX_PAYLOAD_CHARS) return { kind: 'payload-too-large' };

  const raw = findUrlCandidates(blob);
  if (raw.length === 0) {
    // Distinguish "nothing that looks like a link" from "a link we won't open".
    return FOREIGN_SCHEME.test(blob) ? { kind: 'unsupported-scheme' } : { kind: 'no-url' };
  }

  const parsed: URL[] = [];
  let sawForeignScheme = false;
  let sawBlockedHost = false;

  for (const candidate of raw) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
      sawForeignScheme = true;
      continue;
    }
    const unwrapped = unwrapRedirector(url);
    if (!ALLOWED_PROTOCOLS.has(unwrapped.protocol)) {
      sawForeignScheme = true;
      continue;
    }
    if (isBlockedHost(unwrapped.hostname)) {
      sawBlockedHost = true;
      continue;
    }
    parsed.push(unwrapped);
  }

  const chosen = selectBestUrl(parsed);
  if (!chosen) {
    if (sawBlockedHost) return { kind: 'blocked-host' };
    if (sawForeignScheme || FOREIGN_SCHEME.test(blob)) return { kind: 'unsupported-scheme' };
    return { kind: 'no-url' };
  }

  return describe(stripTrackingParams(chosen), false);
}

/**
 * The paste field's entry point — same rules, different tolerance.
 *
 * A shared caption and a pasted link are not the same kind of input. In a
 * caption, treating every bare `word.word` as a link would misread prose; in
 * the paste field the whole input is meant to BE a link, and people routinely
 * paste `example.com/recipes/5` without a scheme. `extractRecipeFromUrl`'s own
 * `normalizeAndValidateUrl` has always added `https://` for exactly that case,
 * so refusing it here would be a regression.
 *
 * Everything after the scheme is added is the shared path — the same host
 * guards, the same tracking-parameter stripping, the same canonical key. That
 * is the point: a link must not be judged differently depending on how it
 * arrived.
 */
export function ingestPastedUrl(input: string): IngestOutcome {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'no-url' };
  if (trimmed.length > MAX_PAYLOAD_CHARS) return { kind: 'payload-too-large' };

  // Only supply a scheme when there isn't one at all. A `javascript:` paste
  // must still be refused by name rather than quietly turned into a URL.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const looksLikeHost = /^[^\s/]+\.[^\s/]{2,}(?:[/?#]|$)/.test(trimmed);
  const candidate = !hasScheme && looksLikeHost ? `https://${trimmed}` : trimmed;

  return ingestSharedPayload({
    id: 'paste',
    text: candidate,
    capturedAt: Date.now(),
    entryPoint: 'pasted_link',
  });
}

/** Build the success outcome for an already-validated URL. */
function describe(url: URL, wasShortened: boolean): IngestOutcome {
  const href = url.toString();
  return {
    kind: 'ok',
    url: href,
    canonicalKey: normalizeRecipeSourceUrl(href),
    source: detectSourceType(href) as ShareSourceType,
    host: url.hostname.toLowerCase(),
    wasShortened,
  };
}

/** Is this a link that only becomes useful after following its redirect? */
export function isShortenedUrl(url: string): boolean {
  try {
    return SHORTENER_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export interface ResolveOptions {
  timeoutMs?: number;
  /** Injected in tests; defaults to the platform `fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * Follow a shortener to its destination and re-run every guard on the result.
 *
 * The redirect CHAIN is not inspectable from React Native's `fetch` — only the
 * final `response.url` is exposed — so depth is bounded by the timeout instead
 * of a hop count, and the destination is validated as strictly as the original.
 * A shortener that lands on `http://10.0.0.1/` is refused here, not followed.
 *
 * Never throws: an unresolvable short link falls back to the original URL, which
 * the importer may still handle.
 */
export async function resolveShortenedUrl(
  ingested: Extract<IngestOutcome, { kind: 'ok' }>,
  options: ResolveOptions = {},
): Promise<IngestOutcome> {
  if (!isShortenedUrl(ingested.url)) return ingested;

  const { timeoutMs = 6_000, fetchImpl = fetch } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(ingested.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // The same UA the importer uses. Shorteners for social apps hand a
        // different destination to a desktop client.
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const finalUrl = response.url;
    if (!finalUrl || finalUrl === ingested.url) return ingested;

    const resolved = new URL(finalUrl);
    if (!ALLOWED_PROTOCOLS.has(resolved.protocol)) return { kind: 'unsupported-scheme' };
    if (isBlockedHost(resolved.hostname)) return { kind: 'blocked-host' };

    return describe(stripTrackingParams(resolved), true);
  } catch {
    // Offline, timed out, or the shortener refused us. The original link is
    // still worth a try — the importer classifies its own network failures.
    return ingested;
  } finally {
    clearTimeout(timer);
  }
}
