// meta-oembed — proxies Instagram / Facebook oEmbed so the Meta app token
// stays SERVER-SIDE and is never bundled into the mobile app.
//
// The client (recipeImport.ts → metaOembedThumbnail) POSTs { url } and gets
// back { thumbnailUrl }.
//
// The client calls this authenticated (with the signed-in user's JWT), so
// deploy with the DEFAULT jwt verification — do NOT pass --no-verify-jwt, which
// would make the endpoint public.
//
// Deploy:
//   supabase functions deploy meta-oembed
// Set the secret (App ID | App Secret, note the pipe):
//   supabase secrets set META_OEMBED_TOKEN="1322904000051973|YOUR_APP_SECRET"

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// @ts-ignore — Deno global is provided by the Supabase Edge runtime.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { url } = (await req.json().catch(() => ({ url: '' }))) as {
      url?: string;
    };
    // @ts-ignore — Deno.env
    const token = Deno.env.get('META_OEMBED_TOKEN');
    if (!url || !token) return json({ thumbnailUrl: null });

    const u = url.toLowerCase();
    let endpoint: string | null = null;
    if (u.includes('instagram.com')) {
      endpoint = `https://graph.facebook.com/v19.0/instagram_oembed?url=${encodeURIComponent(
        url,
      )}&fields=thumbnail_url&access_token=${token}`;
    } else if (u.includes('facebook.com') || u.includes('fb.watch')) {
      endpoint = `https://graph.facebook.com/v19.0/oembed_post?url=${encodeURIComponent(
        url,
      )}&fields=thumbnail_url&access_token=${token}`;
    }
    if (!endpoint) return json({ thumbnailUrl: null });

    const r = await fetch(endpoint);
    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      console.log('[meta-oembed] upstream error', r.status, errText.slice(0, 200));
      return json({ thumbnailUrl: null });
    }
    const data = await r.json();
    const thumb = data?.thumbnail_url ?? null;
    return json({ thumbnailUrl: typeof thumb === 'string' ? thumb : null });
  } catch (e) {
    console.log('[meta-oembed] error', String(e));
    return json({ thumbnailUrl: null });
  }
});
