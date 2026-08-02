// The recipe parser. There is exactly one, and this is it.
//
// Lifted from src/lib/recipeImport.ts so that the app and the iOS share
// extension read a page the same way. The alternative — reimplementing HTML
// cleaning, JSON-LD extraction and the extraction prompt in Swift — would have
// been a second parser that drifts from the first, which is the thing this
// feature was explicitly not allowed to create.
//
// Note what does NOT live here: fetching. Both callers fetch the page from the
// DEVICE and post the HTML. Instagram and TikTok block datacenter addresses far
// more aggressively than a phone on a residential connection, so pulling the
// fetch server-side would have quietly degraded the imports that work today.

/** Cap on the HTML we will consider. Beyond this it isn't a recipe page. */
export const MAX_HTML_BYTES = 1_500_000;
/** Cap on the text handed to the model — mirrors the app's original limit. */
const MAX_CONTENT_CHARS = 8000;

/**
 * Pull the page's own hero image out of its Open Graph / Twitter meta tags.
 * HTML entities are decoded because signed CDN URLs (Instagram, Facebook) write
 * their query strings with `&amp;`, and leaving those encoded produces params
 * like `amp;_nc_map=…` that break the signature.
 */
export function decodeHtmlEntities(s: string): string {
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

export function extractOgImage(html: string): string | undefined {
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
  // Instagram embeds sometimes carry the image in a JSON `display_url` field
  // rather than a meta tag.
  const display = html.match(/"display_url":"([^"]+)"/);
  if (display?.[1]) {
    const decoded = display[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    if (/^https?:\/\//i.test(decoded)) return decoded;
  }
  return undefined;
}

/**
 * Reduce a page to the text worth asking a model about.
 *
 * Structured recipe data (JSON-LD `@type: Recipe`) is pulled out verbatim when
 * present — it's the difference between a good import and a guess on most recipe
 * sites — and the rest is flattened with the list and heading structure kept as
 * hints.
 */
export function cleanHtmlContent(html: string, url: string): string {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const jsonLdMatch = html.match(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  );
  let structuredData = '';
  if (jsonLdMatch) {
    for (const match of jsonLdMatch) {
      const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, '');
      try {
        const parsed = JSON.parse(jsonContent);
        if (
          parsed['@type'] === 'Recipe' ||
          (Array.isArray(parsed['@graph']) &&
            parsed['@graph'].some((item: { '@type'?: string }) => item['@type'] === 'Recipe'))
        ) {
          structuredData = JSON.stringify(parsed, null, 2);
          break;
        }
      } catch {
        // Not every ld+json block is valid or relevant.
      }
    }
  }

  const metaDescription =
    html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i)?.[1] || '';
  const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i)?.[1] || '';
  const ogDescription =
    html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i)?.[1] || '';

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

  if (text.length > MAX_CONTENT_CHARS) {
    text = text.substring(0, MAX_CONTENT_CHARS) + '...';
  }

  let finalContent = `URL: ${url}\n\n`;
  if (ogTitle) finalContent += `Title: ${decodeHtmlEntities(ogTitle)}\n`;
  if (metaDescription || ogDescription) {
    finalContent += `Description: ${decodeHtmlEntities(metaDescription || ogDescription)}\n\n`;
  }
  if (structuredData) finalContent += `Structured Recipe Data:\n${structuredData}\n\n`;
  finalContent += `Page Content:\n${text}`;

  return finalContent;
}

/** The extraction prompt. Unchanged from the app's original wording. */
export function buildExtractionMessages(webpageContent: string) {
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

  return [
    {
      role: 'system',
      content:
        'You are a helpful recipe extraction expert that extracts recipe information from webpage content. Only output valid JSON, no markdown or explanations.',
    },
    { role: 'user', content: prompt },
  ];
}

/** Pull the recipe object out of a model response that may be fenced or chatty. */
export function parseRecipeJson(text: string): Record<string, unknown> {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.substring(start, end + 1);
  }
  return JSON.parse(cleaned.trim());
}
