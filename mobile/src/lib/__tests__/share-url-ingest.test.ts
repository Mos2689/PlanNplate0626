// The ingestion layer is the app's only contact with untrusted text, so this is
// the file that has to be paranoid. Two things are being proved:
//
//   1. A link is found in every shape the source apps actually hand over —
//      a bare URL, a caption wrapped around one, several lines, several links.
//   2. Nothing that shouldn't reach `fetch` ever does — foreign schemes,
//      loopback, private ranges, the cloud metadata address.
//
// And one thing that is easy to lose in a refactor: the canonical key this
// produces has to keep agreeing with `normalizeRecipeSourceUrl`, because that
// is what every already-saved recipe is keyed on.

import {
  findUrlCandidates,
  ingestPastedUrl,
  ingestSharedPayload,
  isBlockedHost,
  isShortenedUrl,
  resolveShortenedUrl,
  selectBestUrl,
  stripTrackingParams,
} from '../share/url-ingest';
import { normalizeRecipeSourceUrl } from '../recipe-identity';
import type { IngestedUrl, SharePayload } from '../share/types';

const payload = (fields: Partial<SharePayload>): SharePayload => ({
  id: 'share-1',
  capturedAt: 1_700_000_000_000,
  entryPoint: 'share_intent',
  ...fields,
});

const ok = (outcome: ReturnType<typeof ingestSharedPayload>): IngestedUrl => {
  if (outcome.kind !== 'ok') {
    throw new Error(`expected an importable link, got "${outcome.kind}"`);
  }
  return outcome;
};

describe('extracting a link from what apps actually share', () => {
  it('takes a bare URL handed over as a public.url item', () => {
    const result = ok(ingestSharedPayload(payload({ url: 'https://example.com/recipes/ragu' })));
    expect(result.url).toBe('https://example.com/recipes/ragu');
    expect(result.host).toBe('example.com');
  });

  it('finds the link inside an Instagram-style caption', () => {
    const result = ok(
      ingestSharedPayload(
        payload({
          text: 'The easiest weeknight ragù 🍝 full recipe: https://www.instagram.com/p/Cx1y2z3AbCd/ #pasta',
        }),
      ),
    );
    expect(result.url).toBe('https://www.instagram.com/p/Cx1y2z3AbCd/');
    expect(result.source).toBe('instagram');
  });

  it('finds a link on its own line in multi-line text', () => {
    const result = ok(
      ingestSharedPayload(
        payload({
          text: 'Check this out\n\nSlow roast lamb\nhttps://cooking.example.org/lamb\n\nSent from my phone',
        }),
      ),
    );
    expect(result.url).toBe('https://cooking.example.org/lamb');
  });

  it('trims the sentence punctuation people leave stuck to a link', () => {
    const result = ok(
      ingestSharedPayload(payload({ text: 'Made this last night: https://example.com/pie.' })),
    );
    expect(result.url).toBe('https://example.com/pie');
  });

  it('accepts a www-prefixed link with no scheme', () => {
    const result = ok(
      ingestSharedPayload(payload({ text: 'recipe here www.example.com/soup' })),
    );
    expect(result.url).toBe('https://www.example.com/soup');
  });

  it('reads the subject line when that is all there is', () => {
    const result = ok(ingestSharedPayload(payload({ subject: 'https://example.com/tart' })));
    expect(result.url).toBe('https://example.com/tart');
  });

  it('reports no link for text that has none', () => {
    expect(ingestSharedPayload(payload({ text: 'dinner at 8 tomorrow?' })).kind).toBe('no-url');
  });

  it('reports no link for an empty payload', () => {
    expect(ingestSharedPayload(payload({})).kind).toBe('no-url');
    expect(ingestSharedPayload(payload({ text: '' })).kind).toBe('no-url');
  });

  it('refuses a payload far larger than any caption', () => {
    const huge = `${'a'.repeat(70_000)} https://example.com/x`;
    expect(ingestSharedPayload(payload({ text: huge })).kind).toBe('payload-too-large');
  });
});

describe('choosing between several links', () => {
  it('prefers a recognised source over a link-in-bio', () => {
    const result = ok(
      ingestSharedPayload(
        payload({
          text: 'All my recipes: https://linktr.ee/chef — this one: https://www.tiktok.com/@chef/video/7123456789',
        }),
      ),
    );
    expect(result.url).toContain('tiktok.com');
    expect(result.source).toBe('tiktok');
  });

  it('falls back to the last link when none is a recognised source', () => {
    const result = ok(
      ingestSharedPayload(
        payload({ text: 'via https://news.example.com and https://blog.example.com/recipe' }),
      ),
    );
    expect(result.url).toBe('https://blog.example.com/recipe');
  });

  it('prefers the public.url item over anything in the caption', () => {
    const result = ok(
      ingestSharedPayload(
        payload({
          url: 'https://www.youtube.com/watch?v=abc123',
          text: 'see also https://sponsor.example.com',
        }),
      ),
    );
    expect(result.url).toContain('youtube.com');
  });

  it('stops scanning once a caption is nothing but links', () => {
    const spam = Array.from({ length: 40 }, (_, i) => `https://example.com/${i}`).join(' ');
    expect(findUrlCandidates(spam)).toHaveLength(20);
  });

  it('returns nothing to choose from when there are no candidates', () => {
    expect(selectBestUrl([])).toBeUndefined();
  });
});

describe('schemes we refuse by name', () => {
  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html;base64,PHNjcmlwdD4=',
    'content://media/external/images/1',
    'intent://scan/#Intent;scheme=zxing;end',
  ])('refuses %s rather than calling it "no link"', (value) => {
    expect(ingestSharedPayload(payload({ text: value })).kind).toBe('unsupported-scheme');
  });

  it('still finds the good link when a foreign scheme sits beside one', () => {
    const result = ok(
      ingestSharedPayload(
        payload({ text: 'javascript:void(0) and https://example.com/recipe' }),
      ),
    );
    expect(result.url).toBe('https://example.com/recipe');
  });

  it('never executes what it was handed', () => {
    // The guard is that nothing is ever eval'd or constructed as code — the
    // value is only ever parsed as a URL. A payload that would be dangerous if
    // evaluated simply comes back as a refusal.
    expect(
      ingestSharedPayload(payload({ text: '<img src=x onerror="fetch(`/steal`)">' })).kind,
    ).toBe('no-url');
  });
});

describe('addresses the importer must never be pointed at', () => {
  it.each([
    ['localhost', 'http://localhost:3000/x'],
    ['loopback', 'http://127.0.0.1/admin'],
    ['all-zeros', 'http://0.0.0.0/'],
    ['private 10/8', 'http://10.1.2.3/'],
    ['private 172.16/12', 'http://172.20.0.5/'],
    ['private 192.168/16', 'http://192.168.1.1/'],
    ['carrier NAT', 'http://100.100.0.1/'],
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['IPv6 loopback', 'http://[::1]/'],
    ['mDNS', 'http://printer.local/'],
    ['single label', 'http://intranet/'],
  ])('blocks %s', (_label, url) => {
    expect(ingestSharedPayload(payload({ text: url })).kind).toBe('blocked-host');
  });

  it('lets ordinary public hosts through', () => {
    expect(isBlockedHost('example.com')).toBe(false);
    expect(isBlockedHost('93.184.216.34')).toBe(false);
    expect(isBlockedHost('www.instagram.com')).toBe(false);
  });

  it('unwraps a redirector but re-checks where it points', () => {
    const good = ok(
      ingestSharedPayload(
        payload({
          text: 'https://l.instagram.com/?u=https%3A%2F%2Fexample.com%2Frecipe&e=xyz',
        }),
      ),
    );
    expect(good.url).toBe('https://example.com/recipe');

    expect(
      ingestSharedPayload(
        payload({ text: 'https://l.instagram.com/?u=http%3A%2F%2F127.0.0.1%2Fadmin' }),
      ).kind,
    ).toBe('blocked-host');
  });
});

describe('normalisation and the duplicate key', () => {
  it('strips tracking parameters but keeps the ones that identify content', () => {
    const cleaned = stripTrackingParams(
      new URL('https://example.com/r?id=42&utm_source=ig&fbclid=abc&igsh=xyz&page=2'),
    );
    expect(cleaned.searchParams.get('id')).toBe('42');
    expect(cleaned.searchParams.get('page')).toBe('2');
    expect(cleaned.searchParams.get('utm_source')).toBeNull();
    expect(cleaned.searchParams.get('fbclid')).toBeNull();
    expect(cleaned.searchParams.get('igsh')).toBeNull();
  });

  it('drops the question mark when nothing survives the strip', () => {
    expect(stripTrackingParams(new URL('https://example.com/r?utm_source=ig')).toString()).toBe(
      'https://example.com/r',
    );
  });

  it('gives the same link the same key however it was shared', () => {
    const fromInstagram = ok(
      ingestSharedPayload(payload({ text: 'https://example.com/r?igsh=AAA&utm_source=ig_web' })),
    );
    const fromSafari = ok(ingestSharedPayload(payload({ url: 'https://example.com/r' })));
    expect(fromInstagram.canonicalKey).toBe(fromSafari.canonicalKey);
  });

  it('keeps the key agreeing with the one saved recipes already use', () => {
    const result = ok(
      ingestSharedPayload(payload({ url: 'https://www.youtube.com/watch?v=abc123&si=track' })),
    );
    expect(result.canonicalKey).toBe(normalizeRecipeSourceUrl(result.url));
    // The YouTube rule in recipe-identity.ts collapses to the video id, which is
    // what stops the same video importing twice from two different share sheets.
    expect(result.canonicalKey).toBe('https://youtube.com/watch?v=abc123');
  });

  it('recognises the sources the importer knows about', () => {
    const cases: [string, string][] = [
      ['https://www.instagram.com/reel/abc/', 'instagram'],
      ['https://vm.tiktok.com/ZM123/', 'tiktok'],
      ['https://youtu.be/abc123', 'youtube'],
      ['https://pin.it/abc', 'pinterest'],
      ['https://smittenkitchen.com/2024/01/soup/', 'website'],
    ];
    for (const [url, source] of cases) {
      expect(ok(ingestSharedPayload(payload({ url }))).source).toBe(source);
    }
  });
});

describe('the payload shapes the real apps hand over', () => {
  // Instagram is the most important source for this product and the most
  // awkward: it shares plain text, not a `public.url`, and it appends an `igsh`
  // tracking parameter that differs per share — so the same reel shared twice
  // would produce two different dedup keys if it weren't stripped.
  it('imports a reel shared from Instagram', () => {
    const result = ok(
      ingestSharedPayload(
        payload({
          text: 'https://www.instagram.com/reel/C8xYz1AbCdE/?igsh=MzRlODBiNWFlZA==',
        }),
      ),
    );
    expect(result.url).toBe('https://www.instagram.com/reel/C8xYz1AbCdE/');
    expect(result.source).toBe('instagram');
  });

  it('gives the same reel one key however many times it is shared', () => {
    const first = ok(
      ingestSharedPayload(payload({ text: 'https://www.instagram.com/reel/C8xYz1AbCdE/?igsh=AAA' })),
    );
    const second = ok(
      ingestSharedPayload(payload({ text: 'https://www.instagram.com/reel/C8xYz1AbCdE/?igsh=BBB' })),
    );
    expect(first.canonicalKey).toBe(second.canonicalKey);
  });

  it('imports a reel shared with its caption attached', () => {
    const result = ok(
      ingestSharedPayload(
        payload({
          text: 'Creamy tomato pasta 🍅 save this one\n\nhttps://www.instagram.com/reel/C8xYz1AbCdE/?igsh=MzRl',
        }),
      ),
    );
    expect(result.url).toBe('https://www.instagram.com/reel/C8xYz1AbCdE/');
  });

  it('imports a post shared from Facebook', () => {
    const result = ok(
      ingestSharedPayload(
        payload({ text: 'https://www.facebook.com/reel/1234567890?mibextid=abc' }),
      ),
    );
    expect(result.url).toBe('https://www.facebook.com/reel/1234567890');
  });

  it('imports a TikTok share, tracking parameters and all', () => {
    const result = ok(
      ingestSharedPayload(
        payload({
          text: 'Check out this recipe! https://www.tiktok.com/@chef/video/7123456789?is_from_webapp=1&sender_device=pc',
        }),
      ),
    );
    expect(result.url).toBe('https://www.tiktok.com/@chef/video/7123456789');
    expect(result.source).toBe('tiktok');
  });

  it('imports a YouTube Short shared from the app', () => {
    const result = ok(
      ingestSharedPayload(payload({ text: 'https://youtube.com/shorts/abc123?si=xYz&feature=share' })),
    );
    expect(result.url).toBe('https://youtube.com/shorts/abc123');
    expect(result.source).toBe('youtube');
  });

  it('imports a Pinterest pin shared as a short link', () => {
    const result = ok(ingestSharedPayload(payload({ text: 'https://pin.it/abcDEF123' })));
    expect(result.source).toBe('pinterest');
    expect(isShortenedUrl(result.url)).toBe(true);
  });
});

describe('the paste field', () => {
  it('still accepts a link typed without a scheme, as it always has', () => {
    const result = ingestPastedUrl('smittenkitchen.com/2024/01/soup/');
    expect(result.kind).toBe('ok');
    expect((result as IngestedUrl).url).toBe('https://smittenkitchen.com/2024/01/soup/');
  });

  it('does not quietly turn a dangerous scheme into a web address', () => {
    expect(ingestPastedUrl('javascript:alert(1)').kind).toBe('unsupported-scheme');
  });

  it('applies the same host guards as a share', () => {
    expect(ingestPastedUrl('http://169.254.169.254/latest/').kind).toBe('blocked-host');
  });

  it('treats an empty field as nothing to do', () => {
    expect(ingestPastedUrl('   ').kind).toBe('no-url');
  });

  it('normalises a pasted link exactly like a shared one', () => {
    const pasted = ingestPastedUrl('https://example.com/r?utm_source=news');
    const shared = ingestSharedPayload(payload({ url: 'https://example.com/r' }));
    expect((pasted as IngestedUrl).canonicalKey).toBe((shared as IngestedUrl).canonicalKey);
  });
});

describe('shortened links', () => {
  it('knows which hosts need following', () => {
    expect(isShortenedUrl('https://vm.tiktok.com/ZM123/')).toBe(true);
    expect(isShortenedUrl('https://pin.it/abc')).toBe(true);
    // Already canonicalised without a network call — following it would only
    // add latency.
    expect(isShortenedUrl('https://youtu.be/abc')).toBe(false);
    expect(isShortenedUrl('https://example.com/r')).toBe(false);
  });

  it('follows a shortener and re-keys on the destination', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      url: 'https://www.tiktok.com/@chef/video/7123?is_from_webapp=1',
    }) as unknown as typeof fetch;

    const start = ok(ingestSharedPayload(payload({ url: 'https://vm.tiktok.com/ZM123/' })));
    const resolved = ok(await resolveShortenedUrl(start, { fetchImpl }));

    expect(resolved.url).toBe('https://www.tiktok.com/@chef/video/7123');
    expect(resolved.wasShortened).toBe(true);
    expect(resolved.host).toBe('www.tiktok.com');
  });

  it('refuses a shortener that lands on a private address', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      url: 'http://192.168.0.1/admin',
    }) as unknown as typeof fetch;

    const start = ok(ingestSharedPayload(payload({ url: 'https://bit.ly/abc' })));
    expect((await resolveShortenedUrl(start, { fetchImpl })).kind).toBe('blocked-host');
  });

  it('refuses a shortener that lands on a foreign scheme', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      url: 'myapp://open/thing',
    }) as unknown as typeof fetch;

    const start = ok(ingestSharedPayload(payload({ url: 'https://bit.ly/abc' })));
    expect((await resolveShortenedUrl(start, { fetchImpl })).kind).toBe('unsupported-scheme');
  });

  it('keeps the original link when the shortener cannot be reached', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('Network request failed')) as unknown as typeof fetch;
    const start = ok(ingestSharedPayload(payload({ url: 'https://bit.ly/abc' })));
    expect(await resolveShortenedUrl(start, { fetchImpl })).toEqual(start);
  });

  it('leaves a link that was never shortened alone, without a request', async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    const start = ok(ingestSharedPayload(payload({ url: 'https://example.com/r' })));
    expect(await resolveShortenedUrl(start, { fetchImpl })).toEqual(start);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
