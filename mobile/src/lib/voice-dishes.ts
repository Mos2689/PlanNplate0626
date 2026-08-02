// Voice → dish names for onboarding "What do you cook often?".
//
// Whisper transcribes a spoken list of dishes WITHOUT punctuation
// ("Veg au gratin Shakshuka Bhindi Masala"), so naive comma-splitting captures
// them as a single chip. This uses the cheap ai-chat model (gpt-4o-mini) to
// split the raw transcript into distinct dish names — the same pattern the
// grocery voice flow uses (parseGroceryItemsFromTranscript).

import { apiCall } from './api-router';

// Whisper hallucinates stock phrases ("thank you for watching", "please
// subscribe", music notes, …) on silence/noise — treat those, and anything too
// short, as "not heard" rather than capturing them as a dish.
const NOISE_PATTERNS: RegExp[] = [
  /\bthank you\b/i,
  /\bthanks for\b/i,
  /\bfor watching\b/i,
  /\bsubscribe\b/i,
  /\bsee you (next|again|soon)\b/i,
  /[♪♫]/,
];

export function looksLikeNoise(s: string): boolean {
  const t = (s || '').trim();
  if (t.replace(/[^a-z0-9]/gi, '').length < 3) return true; // empty / too short
  return NOISE_PATTERNS.some((re) => re.test(t));
}

/**
 * A spoken or typed answer may name several dishes ("Butter Chicken, Vindaloo,
 * Aloo Gobi") — split on commas / semicolons / newlines into separate dishes.
 * NOTE: we deliberately do NOT split on " and " (breaks "Fish and Chips",
 * "Mac and Cheese", …).
 */
export function splitDishNames(raw: string): string[] {
  return (raw || '')
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !looksLikeNoise(s));
}

/**
 * Split a spoken transcript into distinct dish names. Keeps multi-word dish
 * names intact ("Fish and Chips", "Veg au Gratin") and only separates
 * genuinely different dishes. Returns [] on failure so callers can fall back
 * to the raw transcript.
 */
export async function parseDishNamesFromTranscript(
  transcript: string,
): Promise<string[]> {
  const trimmed = transcript.trim();
  if (!trimmed) return [];

  const prompt = `The user spoke the names of dishes they cook often. Split the text into DISTINCT dish names and return ONLY a JSON array of strings (no prose, no markdown).
Rules:
- Each element is ONE complete dish name.
- Keep multi-word dish names together — never split a single dish into separate words. Examples that stay as one: "Fish and Chips", "Mac and Cheese", "Bhindi Masala", "Veg au Gratin", "Butter Chicken".
- Only separate genuinely different dishes.
- Fix obvious mis-transcriptions of well-known dish names (e.g. "Veg Ogratin" → "Veg au Gratin", "Shakshuka" stays "Shakshuka") but do NOT invent dishes that weren't said.
- Use Title Case. Ignore filler words ("um", "and also", "I cook", "I make").
Spoken text: "${trimmed}"`;

  const result = await apiCall<{ choices: Array<{ message: { content: string } }> }>('ai-chat', {
    messages: [
      {
        role: 'system',
        content: 'You split spoken dish lists into distinct dish names and output only a valid JSON array of strings.',
      },
      { role: 'user', content: prompt },
    ],
    model: 'gpt-4o-mini',
    temperature: 0.2,
    max_tokens: 256,
  });

  if (result.failure) throw result.failure;

  const content = result.data?.choices?.[0]?.message?.content ?? '[]';
  const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    parsed = match ? JSON.parse(match[0]) : [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((s) => s.length > 0);
}
