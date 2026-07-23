// Voice → dish names for onboarding "What do you cook often?".
//
// Whisper transcribes a spoken list of dishes WITHOUT punctuation
// ("Veg au gratin Shakshuka Bhindi Masala"), so naive comma-splitting captures
// them as a single chip. This uses the cheap ai-chat model (gpt-4o-mini) to
// split the raw transcript into distinct dish names — the same pattern the
// grocery voice flow uses (parseGroceryItemsFromTranscript).

import { apiCall } from './api-router';

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

  if (result.error) throw new Error(result.error);

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
