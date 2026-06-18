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

  if (result.error) {
    throw new Error(result.error);
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
async function fetchWebpageContent(url: string): Promise<string> {
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

    // Clean HTML and extract text content
    const cleanedContent = cleanHtmlContent(html, url);
    console.log('Cleaned content length:', cleanedContent.length);

    return cleanedContent;
  } catch (error) {
    console.error('Error fetching webpage:', error);
    // Return the URL as fallback so AI can try to infer
    return `Unable to fetch page content. URL: ${url}`;
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

  // First, fetch the webpage content
  const webpageContent = await fetchWebpageContent(url);

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

/**
 * Check if a string looks like a URL
 */
export function isUrl(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Detect the source type from a URL
 */
export function detectSourceType(url: string): 'instagram' | 'tiktok' | 'youtube' | 'pinterest' | 'website' {
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes('instagram.com') || lowerUrl.includes('instagr.am')) {
    return 'instagram';
  }
  if (lowerUrl.includes('tiktok.com') || lowerUrl.includes('vm.tiktok.com')) {
    return 'tiktok';
  }
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
    return 'youtube';
  }
  if (lowerUrl.includes('pinterest.com') || lowerUrl.includes('pin.it')) {
    return 'pinterest';
  }

  return 'website';
}