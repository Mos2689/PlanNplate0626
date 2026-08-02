import type { Ingredient } from './store';
import { apiCall } from './api-router';

// Call OpenAI via Supabase Edge Function
async function callOpenAIDirect(messages: Array<{ role: string; content: string }>): Promise<string> {
  console.log('[RecipeImport] Calling via Supabase Edge Function (ai-chat)...');

  const result = await apiCall<{ choices: Array<{ message: { content: string } }> }>('ai-chat', {
    messages,
    model: 'gpt-4o-mini',
    temperature: 0.7,
    max_tokens: 2048,
  });

  if (result.failure) {
    // Throw the classified failure rather than re-wrapping its text. Wrapping
    // in `new Error(string)` used to erase the category, so everything upstream
    // re-classified as 'unknown'.
    throw result.failure;
  }

  const content = result.data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('No response from AI');

  console.log('[RecipeImport] Response received successfully');
  return content;
}

export interface ImportedRecipe {
  name: string;
  description: string;
  cookTime: number;
  prepTime: number;
  servings: number;
  ingredients: Array<{
    name: string;
    quantity: string;
    unit: string;
    category: Ingredient['category'];
  }>;
  instructions: string[];
  tags: string[];
  calories: number;
  sourceUrl?: string;
  // The source post's own image (e.g. Instagram og:image) when the import
  // parser can extract it — the real dish photo. Preferred over a Pexels search.
  imageUrl?: string;
}

export interface ImportJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  sourceUrl?: string;
  sourceText?: string;
  recipe?: ImportedRecipe;
  error?: string;
  createdAt: string;
}

/**
 * Fetch webpage content and clean it for recipe extraction
 */
// Pull the source post's hero image from its Open Graph / Twitter meta tags —
// this is the real dish photo (Instagram, blogs, etc.), preferred over a Pexels
// search. Returns an absolute http(s) URL or undefined.
// Decode the HTML entities that appear inside meta-tag attribute values. This
// matters most for signed CDN image URLs (Facebook/Instagram): their query
// strings are written with `&amp;`, and leaving those encoded produces params
// like `amp;_nc_map=…` that break the signature so the CDN returns an error.
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/g, '&')
    .replace(/&#x0*26;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function extractOgImage(html: string): string | undefined {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    const raw = m?.[1]?.trim();
    const src = raw ? decodeHtmlEntities(raw) : undefined;
    if (src && /^https?:\/\//i.test(src)) return src;
  }
  return undefined;
}

// Fetch an arbitrary page and pull its og:image (used for embed pages that
// aren't login-walled). Best-effort; returns undefined on any failure.
async function fetchOgImageFrom(pageUrl: string): Promise<string | undefined> {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    return extractOgImage(html) ?? extractInstagramDisplayUrl(html);
  } catch {
    return undefined;
  }
}

// Instagram embed HTML sometimes carries the image in a JSON "display_url"
// field rather than an og:image meta tag.
function extractInstagramDisplayUrl(html: string): string | undefined {
  const m = html.match(/"display_url":"([^"]+)"/);
  if (m?.[1]) {
    const decoded = m[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    if (/^https?:\/\//i.test(decoded)) return decoded;
  }
  return undefined;
}

// instagram.com/(p|reel|tv)/{shortcode}/… → the PUBLIC embed page, which (unlike
// the main post URL) isn't login-walled and exposes the image.
function toInstagramEmbedUrl(url: string): string | undefined {
  const m = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? `https://www.instagram.com/p/${m[1]}/embed/captioned/` : undefined;
}

// Ask the `meta-oembed` edge function for a post's thumbnail. The Meta app
// token lives ONLY on the server (Supabase function secret META_OEMBED_TOKEN),
// so it's never bundled into the client. Returns undefined on any failure.
// Uses an authenticated call (default) — recipe import only ever runs for a
// signed-in user, and apiCall's requireAuth:false path is a no-op that returns
// an error without ever hitting the network.
async function metaOembedThumbnail(url: string): Promise<string | undefined> {
  try {
    const res = await apiCall<{ thumbnailUrl?: string | null }>(
      'meta-oembed',
      { url },
    );
    const t = res.data?.thumbnailUrl;
    return t && /^https?:\/\//i.test(t) ? t : undefined;
  } catch {
    return undefined;
  }
}

// Resolve a source image for social URLs whose main page doesn't hand an
// og:image to a plain client fetch. Returns undefined → caller falls back to
// the page's own og:image, then to Pexels.
export async function resolveSourceImageUrl(url: string): Promise<string | undefined> {
  const u = url.toLowerCase();

  // YouTube — public oEmbed, no auth. Returns the video thumbnail.
  if (u.includes('youtube.com') || u.includes('youtu.be')) {
    try {
      const r = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      );
      if (r.ok) {
        const j = await r.json();
        if (j?.thumbnail_url && /^https?:\/\//i.test(j.thumbnail_url)) return j.thumbnail_url;
      }
    } catch {
      /* fall through */
    }
  }

  // Instagram — try the public embed page first (no token needed), then the
  // server-side Meta oEmbed proxy.
  if (u.includes('instagram.com')) {
    const embed = toInstagramEmbedUrl(url);
    const img = embed ? await fetchOgImageFrom(embed) : undefined;
    if (img) return img;
    const viaProxy = await metaOembedThumbnail(url);
    if (viaProxy) return viaProxy;
  }

  // Facebook — server-side Meta oEmbed proxy (needs the app token).
  if (u.includes('facebook.com') || u.includes('fb.watch')) {
    const viaProxy = await metaOembedThumbnail(url);
    if (viaProxy) return viaProxy;
  }

  return undefined;
}

async function fetchWebpageContent(
  url: string,
): Promise<{ content: string; ogImage?: string }> {
  console.log('Fetching webpage content from:', url);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      console.log('Failed to fetch webpage, status:', response.status);
      throw new Error(`Failed to fetch webpage: ${response.status}`);
    }

    const html = await response.text();
    console.log('Fetched HTML length:', html.length);

    const ogImage = extractOgImage(html);
    // Clean HTML and extract text content
    const cleanedContent = cleanHtmlContent(html, url);
    console.log('Cleaned content length:', cleanedContent.length, '| ogImage:', ogImage ? 'found' : 'none');

    return { content: cleanedContent, ogImage };
  } catch (error) {
    console.error('Error fetching webpage:', error);
    // Return the URL as fallback so AI can try to infer
    return { content: `Unable to fetch page content. URL: ${url}` };
  }
}

/**
 * Clean HTML content and extract relevant text
 */
function cleanHtmlContent(html: string, url: string): string {
  // Remove script and style tags
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Try to extract structured recipe data (JSON-LD)
  const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  let structuredData = '';

  if (jsonLdMatch) {
    for (const match of jsonLdMatch) {
      const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, '');
      try {
        const parsed = JSON.parse(jsonContent);
        if (parsed['@type'] === 'Recipe' ||
            (Array.isArray(parsed['@graph']) && parsed['@graph'].some((item: { '@type'?: string }) => item['@type'] === 'Recipe'))) {
          structuredData = JSON.stringify(parsed, null, 2);
          console.log('Found structured recipe data');
          break;
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  // Extract meta tags for additional context
  const metaDescription = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i)?.[1] || '';
  const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i)?.[1] || '';
  const ogDescription = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i)?.[1] || '';

  // Remove HTML tags but keep structure hints
  text = text
    .replace(/<(h[1-6])[^>]*>/gi, '\n### ')
    .replace(/<\/(h[1-6])>/gi, '\n')
    .replace(/<(li)[^>]*>/gi, '\n- ')
    .replace(/<(p|div|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Limit content length to avoid token limits
  const maxLength = 8000;
  if (text.length > maxLength) {
    text = text.substring(0, maxLength) + '...';
  }

  // Build final content with context
  let finalContent = `URL: ${url}\n\n`;

  if (ogTitle) {
    finalContent += `Title: ${ogTitle}\n`;
  }
  if (metaDescription || ogDescription) {
    finalContent += `Description: ${metaDescription || ogDescription}\n\n`;
  }

  if (structuredData) {
    finalContent += `Structured Recipe Data:\n${structuredData}\n\n`;
  }

  finalContent += `Page Content:\n${text}`;

  return finalContent;
}

/**
 * Helper to parse recipe JSON from AI response
 */
function parseRecipeJson(text: string): ImportedRecipe {
  let cleanedText = text.trim();

  // Remove markdown code blocks
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.slice(7);
  } else if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.slice(3);
  }
  if (cleanedText.endsWith('```')) {
    cleanedText = cleanedText.slice(0, -3);
  }

  // Find the JSON object
  const jsonStartIndex = cleanedText.indexOf('{');
  const jsonEndIndex = cleanedText.lastIndexOf('}');

  if (jsonStartIndex !== -1 && jsonEndIndex !== -1 && jsonEndIndex > jsonStartIndex) {
    cleanedText = cleanedText.substring(jsonStartIndex, jsonEndIndex + 1);
  }

  try {
    return JSON.parse(cleanedText.trim()) as ImportedRecipe;
  } catch (error) {
    console.error('Failed to parse recipe JSON:', text);
    throw new Error('Failed to parse recipe. Please try again with different content.');
  }
}

/**
 * Normalize and validate URLs, especially YouTube URLs
 */
function normalizeAndValidateUrl(url: string): string {
  try {
    const trimmedUrl = url.trim();

    // Check if it's a YouTube URL
    if (trimmedUrl.includes('youtube.com') || trimmedUrl.includes('youtu.be')) {
      const urlObj = new URL(trimmedUrl.startsWith('http') ? trimmedUrl : `https://${trimmedUrl}`);
      const pathname = urlObj.pathname;

      // Handle YouTube Shorts (youtube.com/shorts/{videoId})
      if (pathname.includes('/shorts/')) {
        const videoId = pathname.split('/shorts/')[1]?.split('?')[0] || '';
        if (videoId) {
          return `https://www.youtube.com/shorts/${videoId}`;
        }
      }

      // Handle regular YouTube videos
      if (urlObj.hostname.includes('youtu.be')) {
        // youtu.be/{videoId}
        const videoId = pathname.split('/').filter(Boolean)[0];
        if (videoId) {
          return `https://www.youtube.com/watch?v=${videoId}`;
        }
      } else if (urlObj.hostname.includes('youtube.com')) {
        // youtube.com/watch?v={videoId}
        const videoId = urlObj.searchParams.get('v');
        if (videoId) {
          return `https://www.youtube.com/watch?v=${videoId}`;
        }
      }

      // If we couldn't parse it, return as-is with protocol
      if (!trimmedUrl.startsWith('http')) {
        return `https://${trimmedUrl}`;
      }
      return trimmedUrl;
    }

    // For non-YouTube URLs, ensure protocol
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      return `https://${trimmedUrl}`;
    }

    return trimmedUrl;
  } catch (error) {
    console.warn('[RecipeImport] Failed to normalize URL, returning original:', error);
    return url.trim();
  }
}

/**
 * Extract recipe from a URL (website, social media post, etc.)
 */
export async function extractRecipeFromUrl(url: string): Promise<ImportedRecipe> {
  console.log('Extracting recipe from URL:', url);

  // First, fetch the webpage content (+ the post's own hero image if present).
  const { content: webpageContent, ogImage } = await fetchWebpageContent(url);

  const prompt = `You are a recipe extraction expert. Given the following webpage content, extract the recipe information.

${webpageContent}

Please analyze this content and extract the recipe information. Look for:
- Recipe name/title
- Description or summary
- Ingredients list with quantities and units
- Cooking instructions/steps
- Prep time and cook time
- Number of servings
- Any tags or categories mentioned

Return a JSON object with this exact structure:
{
  "name": "Recipe Name",
  "description": "A brief, appetizing description of the dish",
  "cookTime": 20,
  "prepTime": 10,
  "servings": 4,
  "ingredients": [
    {"name": "Ingredient Name", "quantity": "1", "unit": "cup", "category": "produce|dairy|meat|pantry|frozen|bakery|other"}
  ],
  "instructions": ["Step 1 instruction", "Step 2 instruction"],
  "tags": ["tag1", "tag2"],
  "calories": 400
}

Ingredient categories must be one of: produce, dairy, meat, pantry, frozen, bakery, other

If you cannot find specific values, make reasonable estimates based on the recipe type. Times should be in minutes.

Only return valid JSON, no markdown or explanation.`;

  const responseText = await callOpenAIDirect([
    {
      role: 'system',
      content: 'You are a helpful recipe extraction expert that extracts recipe information from webpage content. Only output valid JSON, no markdown or explanations.',
    },
    {
      role: 'user',
      content: prompt,
    },
  ]);

  const recipe = parseRecipeJson(responseText);

  // Normalize and validate the URL
  const normalizedUrl = normalizeAndValidateUrl(url);
  recipe.sourceUrl = normalizedUrl;
  // Attach the source post's own photo so import-review uses it as the hero
  // instead of a Pexels search. Try the page's og:image first; if the platform
  // login-walls the direct fetch (Instagram/Facebook) or hides it (YouTube),
  // fall back to oEmbed / the public embed page. Undefined → Pexels fallback.
  if (ogImage) {
    // If the page handed back an og:image, use it and skip the embed-page /
    // Meta-oembed proxy. (Its HTML entities are already decoded in extractOgImage.)
    recipe.imageUrl = ogImage;
  } else {
    const resolved = await resolveSourceImageUrl(url);
    if (resolved) recipe.imageUrl = resolved;
  }

  console.log('[RecipeImport] Extracted recipe with sourceUrl:', {
    recipeName: recipe.name,
    originalUrl: url,
    normalizedUrl: recipe.sourceUrl,
    sourceUrlLength: recipe.sourceUrl?.length,
    sourceUrlType: typeof recipe.sourceUrl,
  });
  return recipe;
}

/**
 * Extract recipe from pasted text (recipe description, ingredients list, etc.)
 */
export async function extractRecipeFromText(inputText: string): Promise<ImportedRecipe> {
  console.log('Extracting recipe from text...');

  const prompt = `You are a recipe extraction expert. Given the following text, extract and structure the recipe information.

Text:
"""
${inputText}
"""

Please extract the recipe information from this text. If some information is missing, make reasonable estimates based on the available content.

Return a JSON object with this exact structure:
{
  "name": "Recipe Name",
  "description": "A brief, appetizing description of the dish",
  "cookTime": 20,
  "prepTime": 10,
  "servings": 4,
  "ingredients": [
    {"name": "Ingredient Name", "quantity": "1", "unit": "cup", "category": "produce|dairy|meat|pantry|frozen|bakery|other"}
  ],
  "instructions": ["Step 1 instruction", "Step 2 instruction"],
  "tags": ["tag1", "tag2"],
  "calories": 400
}

Ingredient categories should be one of: produce, dairy, meat, pantry, frozen, bakery, other.

Only return valid JSON, no markdown or explanation.`;

  const responseText = await callOpenAIDirect([
    {
      role: 'system',
      content: 'You are a helpful recipe extraction expert that structures recipe information into JSON format. Only output valid JSON, no markdown or explanations.',
    },
    {
      role: 'user',
      content: prompt,
    },
  ]);

  return parseRecipeJson(responseText);
}

// `isUrl` and `detectSourceType` moved to ./recipe-source so the shared
// ingestion layer can use them without dragging the Supabase client and the
// edge-function router into a plain-node test process. Re-exported here so every
// existing import site keeps working unchanged.
export { detectSourceType, isUrl } from './recipe-source';