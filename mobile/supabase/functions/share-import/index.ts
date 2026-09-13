// Turn a shared link into a saved recipe, without the app ever waking up.
//
// This is the half of "Share to PlanNplate" that an iOS share extension cannot
// do for itself. The extension is a separate process with no Supabase session,
// no React Native runtime and none of the app's JavaScript, so before this
// function existed it could only queue the link and ask the user to tap a
// notification — four touch points for something a competitor does in one.
//
// THE FETCH STAYS ON THE PHONE. The extension reads the page itself, with an
// iPhone Safari user-agent on the user's residential connection, and posts the
// HTML here. That is the whole reason this design works: Instagram and TikTok
// block datacenter addresses far more aggressively than a phone, so a server
// that fetched the page itself would import strictly fewer recipes than the app
// does today. We take the HTML and do everything that needs a secret or a
// database.
//
// Every outcome is HTTP 200 with an `outcome` discriminator. The extension has
// one parse path, and anything it cannot parse — a 500, a timeout, airplane mode
// — is treated as `fallback`, which is precisely the behaviour that shipped
// before: the link stays queued and the app imports it on next open. There is no
// response from this function that can lose a user's recipe.

import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { normalizeRecipeSourceUrl } from '../_shared/recipe-source-url.ts';
import { completeChat } from '../_shared/ai-provider.ts';
import {
  claimImportAllowance,
  refundImportAllowance,
} from '../_shared/share-entitlement.ts';
import {
  MAX_HTML_BYTES,
  buildExtractionMessages,
  cleanHtmlContent,
  extractOgImage,
  parseRecipeJson,
} from '../_shared/recipe-parser.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Placeholder when the source page carries no image of its own. */
const FALLBACK_IMAGE_URL =
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400';

/**
 * Meta serves recipe photos from signed CDN hosts whose URLs expire after a few
 * days. Those get re-hosted; stable hosts are linked as-is. Same regex as
 * `isEphemeralImageUrl` in src/lib/share/persist-imported-recipe.ts.
 */
const EPHEMERAL_IMAGE_HOST = /(?:fbcdn\.net|cdninstagram\.com|scontent)/i;

const INGREDIENT_CATEGORIES = new Set([
  'produce',
  'dairy',
  'meat',
  'pantry',
  'frozen',
  'bakery',
  'other',
]);

/**
 * What the share sheet shows on success.
 *
 * The counts are not decoration. The sheet has one chance to prove we understood
 * what the user shared, and "Saved" alone is a receipt — "Cheesy Garlic Bread ·
 * 8 ingredients · 25 min" is evidence, and it is exactly what they would
 * otherwise open the app to check.
 */
interface SavedRecipeSummary {
  recipeId: string;
  recipeName: string;
  ingredientCount: number;
  totalMinutes: number;
  imageUrl: string | null;
}

type Outcome =
  | ({ outcome: 'imported' } & SavedRecipeSummary)
  | ({ outcome: 'duplicate' } & SavedRecipeSummary)
  | { outcome: 'gated' }
  | { outcome: 'unsupported' }
  | { outcome: 'fallback'; reason: string };

function json(body: Outcome, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
}

/** Hex SHA-256 — must match `hashToken` in src/lib/share/import-token.ts. */
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Resolve a share-import token to a user id.
 *
 * Deliberately NOT `_shared/auth.ts`: that verifies a Supabase JWT, and a JWT is
 * exactly what the extension must never hold. This credential can do one thing
 * and is revoked on sign-out.
 */
async function resolveToken(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  authHeader: string | null,
): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  const { data, error } = await supabase
    .from('share_import_tokens')
    .select('id, user_id')
    .eq('token_hash', await hashToken(token))
    .is('revoked_at', null)
    .maybeSingle();

  if (error || !data) return null;

  // Best-effort; a failed timestamp write must not fail an import.
  void supabase
    .from('share_import_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {});

  return data.user_id as string;
}

/**
 * The source post's own photo, re-hosted when it would otherwise expire.
 *
 * Best-effort throughout: an image problem must never cost the user the recipe,
 * so every failure falls through to the next option and finally to the
 * placeholder.
 */
async function resolveImage(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  html: string,
  userId: string,
  previewImageUrl?: string,
): Promise<string> {
  // The extension's image wins when it has one. That is not a courtesy: for
  // Instagram it came from the public embed page, which the post URL hides and
  // which the extension fetched from the user's own connection. We could not
  // reproduce it here — Instagram treats a datacenter address very differently
  // from a phone — so `extractOgImage` on this HTML would find nothing and the
  // recipe would get a placeholder.
  const sourceImage =
    (previewImageUrl && /^https:\/\//i.test(previewImageUrl) ? previewImageUrl : undefined) ??
    extractOgImage(html);
  if (!sourceImage) return FALLBACK_IMAGE_URL;
  if (!EPHEMERAL_IMAGE_HOST.test(sourceImage)) return sourceImage;

  try {
    const response = await fetch(sourceImage, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return sourceImage;

    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const bytes = new Uint8Array(await response.arrayBuffer());
    const path = `recipe-images/${userId}-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('user-uploads')
      .upload(path, bytes, { contentType, upsert: true });
    if (error) {
      console.warn('[ShareImport] image re-host failed:', error.message);
      return sourceImage;
    }

    const { data } = supabase.storage.from('user-uploads').getPublicUrl(path);
    return data?.publicUrl || sourceImage;
  } catch (error) {
    console.warn('[ShareImport] image re-host error:', error);
    return sourceImage;
  }
}

/**
 * Coerce the model's output into the shape `recipes` expects.
 *
 * Note what this does NOT do: normalise units, convert imperial to metric or
 * classify the meal type. That logic is ~2,000 lines of lookup tables in
 * src/lib (ingredient-validator + ingredient-unit-rules + the AU average-weight
 * table), and copying it here would create a second copy that drifts from the
 * one the paste flow uses — silently, and in a place nobody would look.
 *
 * The app normalises instead, on arrival, through the pass that already exists
 * for exactly this purpose (`normalizeLibraryRecipes`, called where
 * `reclassifyAllRecipes` always has been). That pass is idempotent and runs over
 * pasted recipes too, so there is one implementation and the share path cannot
 * drift from it.
 */
function toRecipeRow(
  // deno-lint-ignore no-explicit-any
  parsed: any,
  sourceUrl: string,
  imageUrl: string,
  userId: string,
) {
  const num = (value: unknown, fallback: number): number => {
    const n = typeof value === 'string' ? parseFloat(value) : Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const ingredients = (Array.isArray(parsed.ingredients) ? parsed.ingredients : [])
    .filter((ing: unknown) => ing && typeof ing === 'object')
    .map((ing: Record<string, unknown>, index: number) => ({
      id: `${Date.now()}-${index}`,
      name: String(ing.name ?? '').trim(),
      quantity: String(ing.quantity ?? '1'),
      unit: String(ing.unit ?? ''),
      category: INGREDIENT_CATEGORIES.has(String(ing.category))
        ? String(ing.category)
        : 'other',
    }))
    .filter((ing: { name: string }) => ing.name.length > 0);

  const instructions = (Array.isArray(parsed.instructions) ? parsed.instructions : [])
    .map((step: unknown) => String(step).trim())
    .filter(Boolean);

  const calories = num(parsed.calories, 0);

  return {
    user_id: userId,
    name: String(parsed.name ?? '').trim(),
    description: String(parsed.description ?? '').trim(),
    image_url: imageUrl,
    cook_time: Math.round(num(parsed.cookTime, 0)),
    prep_time: Math.round(num(parsed.prepTime, 0)),
    servings: Math.max(1, Math.round(num(parsed.servings, 4))),
    ingredients,
    instructions,
    tags: (Array.isArray(parsed.tags) ? parsed.tags : [])
      .map((t: unknown) => String(t).trim())
      .filter(Boolean),
    calories: calories > 0 ? calories : null,
    is_ai_generated: false,
    is_saved: false,
    is_imported: true,
    source_url: sourceUrl,
    created_at: new Date().toISOString(),
  };
}

/** Everything after authentication. Separated so it can be handed to `waitUntil`. */
async function runImport(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  url: string,
  html: string,
  previewImageUrl?: string,
): Promise<Outcome> {
  const sourceUrl = normalizeRecipeSourceUrl(url);

  // ── Duplicate ───────────────────────────────────────────────────────────
  // Runs before the meter so re-sharing a saved recipe is free, and before
  // extraction so it costs nothing. This is also what makes a replay safe: if
  // the extension dies mid-request and the app later drains the queued link,
  // both paths key on the same normalized URL.
  const { data: existing } = await supabase
    .from('recipes')
    .select('id, name, ingredients, prep_time, cook_time, image_url')
    .eq('user_id', userId)
    .eq('source_url', sourceUrl)
    .limit(1)
    .maybeSingle();

  if (existing) {
    // The same card the success state shows, so re-sharing a saved recipe
    // confirms WHICH one rather than just refusing.
    return {
      outcome: 'duplicate',
      recipeId: existing.id,
      recipeName: existing.name,
      ingredientCount: Array.isArray(existing.ingredients) ? existing.ingredients.length : 0,
      totalMinutes: (existing.prep_time ?? 0) + (existing.cook_time ?? 0),
      imageUrl: existing.image_url ?? null,
    };
  }

  // ── Entitlement ─────────────────────────────────────────────────────────
  const { state, spent } = await claimImportAllowance(supabase, userId);
  if (state === 'gated') return { outcome: 'gated' };
  if (state === 'unknown') {
    // Could not determine premium status. Queue it rather than risk gating a
    // paying user or handing out a free import.
    return { outcome: 'fallback', reason: 'entitlement-unknown' };
  }

  const giveBack = async () => {
    if (spent) await refundImportAllowance(supabase, userId);
  };

  // ── Extract ─────────────────────────────────────────────────────────────
  let parsed: Record<string, unknown>;
  try {
    const content = cleanHtmlContent(html, url);
    const response = await completeChat(buildExtractionMessages(content), {
      temperature: 0.7,
      maxTokens: 2048,
    });
    parsed = parseRecipeJson(response);
  } catch (error) {
    console.error('[ShareImport] extraction failed:', error);
    await giveBack();
    return { outcome: 'fallback', reason: 'extraction-failed' };
  }

  const imageUrl = await resolveImage(supabase, html, userId, previewImageUrl);
  const row = toRecipeRow(parsed, sourceUrl, imageUrl, userId);

  // A page that parsed but yielded nothing usable is not a recipe. Say so
  // rather than saving an empty card — and drop it, because retrying will
  // produce the same answer forever.
  if (!row.name || row.ingredients.length === 0) {
    await giveBack();
    return { outcome: 'unsupported' };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('recipes')
    .insert(row)
    .select('id, name')
    .single();

  if (insertError || !inserted) {
    console.error('[ShareImport] insert failed:', insertError);
    await giveBack();
    return { outcome: 'fallback', reason: 'insert-failed' };
  }

  return {
    outcome: 'imported',
    recipeId: inserted.id,
    recipeName: inserted.name,
    ingredientCount: row.ingredients.length,
    totalMinutes: row.prep_time + row.cook_time,
    // The resolved image — re-hosted if the source was an expiring Meta CDN
    // URL — rather than whatever the page handed the extension.
    imageUrl: row.image_url === FALLBACK_IMAGE_URL ? null : row.image_url,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ outcome: 'fallback', reason: 'method' }, 405);
  }

  // ── Kill switch ───────────────────────────────────────────────────────────
  // FEATURE_FLAGS.shareToPlanNplate is JavaScript and cannot reach a native
  // extension that is already on someone's phone. This is the lever that can:
  // unset it and every share falls back to the queue-and-notify flow that
  // shipped before, in an ordinary function deploy and with no app release.
  if (Deno.env.get('SHARE_DIRECT_IMPORT_ENABLED') !== 'true') {
    return json({ outcome: 'fallback', reason: 'disabled' });
  }

  try {
    const supabase = serviceClient();

    const userId = await resolveToken(supabase, req.headers.get('Authorization'));
    if (!userId) {
      // Signed out, revoked on another device, or a build that predates token
      // minting. All of them mean "the app should handle this one".
      return json({ outcome: 'fallback', reason: 'unauthenticated' });
    }

    const rateLimit = await checkRateLimit(userId);
    if (!rateLimit.allowed) {
      return json({ outcome: 'fallback', reason: 'rate-limited' });
    }

    const body = await req.json().catch(() => null);
    const url = typeof body?.url === 'string' ? body.url : '';
    const html = typeof body?.html === 'string' ? body.html : '';
    // Optional. The extension resolved a better image than this HTML carries —
    // for Instagram, from the public embed page, fetched on the user's own
    // connection. Older extension builds simply omit it.
    const previewImageUrl =
      typeof body?.previewImageUrl === 'string' ? body.previewImageUrl : undefined;

    if (!/^https?:\/\//i.test(url)) {
      return json({ outcome: 'unsupported' });
    }
    if (!html) {
      return json({ outcome: 'fallback', reason: 'no-html' });
    }
    if (html.length > MAX_HTML_BYTES) {
      // The extension caps this already; a body over the limit means something
      // upstream changed, and truncating silently would produce a worse import
      // than letting the app retry with its own fetch.
      return json({ outcome: 'fallback', reason: 'payload-too-large' });
    }

    // Register the work with the runtime AND await it. `waitUntil` guarantees
    // the isolate survives to finish the import if the user dismisses the share
    // sheet mid-request — which they will, because the sheet auto-dismisses —
    // while the await is what lets the response carry the recipe's name back to
    // a sheet that is still on screen.
    const work = runImport(supabase, userId, url, html, previewImageUrl);
    // @ts-ignore — EdgeRuntime is provided by the Supabase edge runtime.
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);

    return json(await work);
  } catch (error) {
    console.error('[ShareImport] unhandled:', error);
    return json({ outcome: 'fallback', reason: 'unhandled' });
  }
});
