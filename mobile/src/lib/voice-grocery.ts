// voice-grocery — turn a spoken grocery list into structured, categorized items.
//
// Flow: record audio (caller) → transcribeAudioToText() (openai-transcribe) →
// parseGroceryItemsFromTranscript() (ai-chat) which both extracts each item's
// name + quantity + unit AND classifies it into a grocery aisle category.
import * as FileSystem from 'expo-file-system/legacy';
import { apiCall, apiFormCall } from './api-router';

export type GroceryCategory =
  | 'produce'
  | 'dairy'
  | 'meat'
  | 'pantry'
  | 'frozen'
  | 'bakery'
  | 'other';

const CATEGORIES: GroceryCategory[] = [
  'produce',
  'dairy',
  'meat',
  'pantry',
  'frozen',
  'bakery',
  'other',
];

export interface ParsedGroceryItem {
  name: string;
  quantity: string;
  unit: string;
  category: GroceryCategory;
}

/** Transcribe a recorded audio file (m4a) to plain text via the edge function. */
export async function transcribeAudioToText(audioUri: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(audioUri);
  if (!info.exists) throw new Error('Audio file not found');

  const formData = new FormData();
  formData.append('file', {
    uri: audioUri,
    type: 'audio/m4a',
    name: 'recording.m4a',
  } as any);
  formData.append('model', 'whisper-1');

  const result = await apiFormCall<{ text: string }>('openai-transcribe', formData);
  if (result.error) throw new Error(result.error);
  return (result.data?.text ?? '').trim();
}

/**
 * Parse a spoken grocery list into structured items, each classified into a
 * grocery aisle category. Uses the same ai-chat edge function as recipe gen.
 */
export async function parseGroceryItemsFromTranscript(
  transcript: string,
): Promise<ParsedGroceryItem[]> {
  const trimmed = transcript.trim();
  if (!trimmed) return [];

  const prompt = `Extract a grocery shopping list from this spoken text. Return ONLY a JSON array (no prose, no markdown).
Each element must be: {"name": string, "quantity": string, "unit": string, "category": string}.
Rules:
- "name": the singular, lowercase item name with NO quantity/number words (e.g. "onion", "chicken breast", "milk").
- "quantity": a number as a string. Default "1" when none is spoken (e.g. "two onions" → "2", "a dozen eggs" → "12").
- "unit": e.g. "g", "kg", "ml", "l", "piece", "bunch", "loaf", "can", "bottle", "pack". Default "item" when none is spoken.
- "category": EXACTLY one of: produce | dairy | meat | pantry | frozen | bakery | other. Classify by item type:
  • produce = fruit & vegetables
  • dairy = milk, cheese, yoghurt, butter, cream, eggs
  • meat = meat, poultry, fish, seafood
  • bakery = bread, buns, bagels, pastries, cakes
  • frozen = frozen foods, ice cream, frozen veg
  • pantry = dry/canned goods, oils, spices, grains, pasta, rice, condiments, sauces
  • other = anything that doesn't clearly fit
- Split combined phrases into separate items. Ignore filler words ("um", "and", "also", "I need").
Spoken text: "${trimmed}"`;

  const result = await apiCall<{ choices: Array<{ message: { content: string } }> }>('ai-chat', {
    messages: [
      {
        role: 'system',
        content: 'You extract structured grocery lists and output only valid JSON arrays.',
      },
      { role: 'user', content: prompt },
    ],
    model: 'gpt-4o-mini',
    temperature: 0.2,
    max_tokens: 1024,
  });

  if (result.error) throw new Error(result.error);

  const content = result.data?.choices?.[0]?.message?.content ?? '[]';
  const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Salvage the first JSON array if the model wrapped it in stray text.
    const match = cleaned.match(/\[[\s\S]*\]/);
    parsed = match ? JSON.parse(match[0]) : [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((raw): ParsedGroceryItem => {
      const it = (raw ?? {}) as Record<string, unknown>;
      const category = String(it.category ?? 'other').toLowerCase() as GroceryCategory;
      return {
        name: String(it.name ?? '').trim(),
        quantity: (String(it.quantity ?? '1').trim() || '1'),
        unit: (String(it.unit ?? 'item').trim() || 'item'),
        category: CATEGORIES.includes(category) ? category : 'other',
      };
    })
    .filter((it) => it.name.length > 0);
}
