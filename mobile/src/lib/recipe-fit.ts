// Culinary-fit guardrails for recipe generation.
//
// Two independent checks that stop "must-use" kitchen ingredients being
// shoehorned into incoherent dishes (the banana-with-grilled-prawns class of
// bug):
//
//   • vetKitchenIngredients()  — LAYER 3, runs BEFORE generation. Picks the
//     largest MUTUALLY COHERENT subset of the user's kitchen ingredients for
//     this meal type + mood, names the best anchor, and reports what it
//     rejected and why. An empty result means "cook to the mood/meal type and
//     ignore the kitchen entirely" — kitchen ingredients are never mandatory.
//
//   • judgeRecipeCoherence()   — LAYER 2, runs AFTER generation. An INDEPENDENT
//     pass (fresh context, so it isn't defending its own work) that scores the
//     finished recipe against the fit rubric and names any clashing pairs.
//
// Both are deliberately small/cheap gpt-4o-mini calls at low temperature, and
// both FAIL OPEN — if the call errors, generation proceeds rather than blocking
// the user.
//
// Kept free of imports from ./openai to avoid a circular dependency: callers
// pass plain strings/arrays.

import { apiCall } from './api-router';

// ── The shared "genuinely fit" rubric ────────────────────────────────────────
// Used verbatim by both calls so the pre-flight and the post-check judge
// against the SAME definition. The subtraction test is the decisive one — it's
// far more answerable than "is this delicious".
const FIT_RUBRIC = `An ingredient "genuinely fits" a dish only if ALL of these hold:
1. NAMEABLE — the result maps to a recognisable dish or established dish-family. If you cannot name what it is, it is a gimmick.
2. ROLE — the ingredient has a coherent role (anchor, supporting, garnish or seasoning), not bolted on.
3. PRECEDENT — the pairing is supported by a real culinary tradition. Legitimate cross-cultural pairings ARE allowed (e.g. mango with prawns, pineapple with pork, banana in a Keralan fish curry) — do not reject those.
4. SUBTRACTION TEST (decisive) — the dish would NOT be better with the ingredient removed. If removing it improves the dish, it does not fit.
5. GUEST TEST — a competent cook would serve it to a guest without apologising.`;

function parseJsonLoose(content: string): unknown {
  const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

// ── LAYER 3 — pre-flight ingredient vetting ──────────────────────────────────

export interface VettedKitchen {
  /** Best primary ingredient to build the dish around, or null if none fits. */
  anchor: string | null;
  /** Other kitchen ingredients that work WITH the anchor in the same dish. */
  supporting: string[];
  /** Ingredients deliberately left out, with the reason (for logging/UI). */
  rejected: Array<{ name: string; reason: string }>;
}

export interface VetKitchenInput {
  ingredients: string[];
  mealType: string;
  /** Optional mood/vibe direction, e.g. the selected vibe's prompt snippet. */
  vibe?: string;
  dietaryRestrictions?: string[];
  allergies?: string[];
}

/**
 * Choose the largest subset of the user's kitchen ingredients that works
 * TOGETHER in one coherent dish for this meal type + mood. Judges the
 * combination, not each ingredient in isolation — banana and prawns are each
 * fine for dinner; it's the pairing that fails.
 *
 * Fails open: on any error returns every ingredient as `supporting` with no
 * anchor, so generation still runs but nothing is forced.
 */
export async function vetKitchenIngredients(
  input: VetKitchenInput,
): Promise<VettedKitchen> {
  const items = (input.ingredients ?? []).map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) return { anchor: null, supporting: [], rejected: [] };

  const failOpen: VettedKitchen = { anchor: null, supporting: items, rejected: [] };

  const prompt = `A user wants a ${input.mealType} recipe${input.vibe ? ` with this mood/direction: ${input.vibe}` : ''}.
These ingredients are available in their kitchen: ${items.join(', ')}.

${FIT_RUBRIC}

Select the LARGEST subset of the available ingredients that works TOGETHER in ONE coherent dish. Judge the COMBINATION, not each ingredient on its own.
It is completely acceptable to reject some or ALL of them: if no genuinely palatable dish can be built from these for a ${input.mealType}, return anchor=null and supporting=[] and we will cook to the mood instead. Never stretch to include something just because it is available.
Prefer a protein or a substantial vegetable as the anchor for a main meal; only use sweet fruit as the anchor for breakfast, dessert, snack or an explicitly sweet dish.
${input.allergies?.length ? `The user is allergic to: ${input.allergies.join(', ')} — never select those.\n` : ''}${input.dietaryRestrictions?.length ? `Dietary restrictions: ${input.dietaryRestrictions.join(', ')} — never select anything incompatible.\n` : ''}
Return ONLY JSON (no prose, no markdown):
{"anchor": string|null, "supporting": string[], "rejected": [{"name": string, "reason": string}]}
Use the ingredient names exactly as given.`;

  try {
    const result = await apiCall<{ choices: Array<{ message: { content: string } }> }>('ai-chat', {
      messages: [
        {
          role: 'system',
          content:
            'You are a chef vetting which available ingredients can coherently share one dish. You output only valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 512,
    });

    if (result.error) return failOpen;
    const parsed = parseJsonLoose(result.data?.choices?.[0]?.message?.content ?? '') as
      | Record<string, unknown>
      | null;
    if (!parsed) return failOpen;

    const known = new Set(items.map((i) => i.toLowerCase()));
    const anchorRaw = typeof parsed.anchor === 'string' ? parsed.anchor.trim() : '';
    const anchor = anchorRaw && known.has(anchorRaw.toLowerCase()) ? anchorRaw : null;

    const supporting = Array.isArray(parsed.supporting)
      ? parsed.supporting
          .map((v) => (typeof v === 'string' ? v.trim() : ''))
          .filter((v) => v.length > 0 && known.has(v.toLowerCase()) && v.toLowerCase() !== anchor?.toLowerCase())
      : [];

    const rejected = Array.isArray(parsed.rejected)
      ? parsed.rejected
          .map((r) => {
            const o = (r ?? {}) as Record<string, unknown>;
            return {
              name: String(o.name ?? '').trim(),
              reason: String(o.reason ?? '').trim(),
            };
          })
          .filter((r) => r.name.length > 0)
      : [];

    return { anchor, supporting, rejected };
  } catch (e) {
    console.warn('[RecipeFit] Ingredient vetting failed, proceeding unforced:', e);
    return failOpen;
  }
}

// ── LAYER 2 — independent coherence judge ────────────────────────────────────

export interface CoherenceVerdict {
  /** False only on a clear failure — borderline dishes pass. */
  ok: boolean;
  /** 1 (incoherent) … 5 (a dish a chef would happily serve). */
  score: number;
  /** Specific clashing ingredient pairs, e.g. ["banana + prawns"]. */
  clashes: string[];
  reason: string;
}

export interface JudgeRecipeInput {
  name: string;
  description?: string;
  ingredients: Array<{ name: string }>;
  instructions?: string[];
  mealType: string;
}

/**
 * Independently score a finished recipe against the fit rubric. Run in a fresh
 * context so it is not defending a recipe it just wrote.
 *
 * Fails open (ok: true) on any error — a flaky judge must never block a
 * generation the user is waiting on.
 */
export async function judgeRecipeCoherence(
  recipe: JudgeRecipeInput,
): Promise<CoherenceVerdict> {
  const failOpen: CoherenceVerdict = { ok: true, score: 5, clashes: [], reason: 'judge unavailable' };

  const ingredientList = (recipe.ingredients ?? []).map((i) => i.name).filter(Boolean).join(', ');
  if (!recipe.name || !ingredientList) return failOpen;

  const prompt = `Judge whether this ${recipe.mealType} recipe is a genuinely palatable, coherent dish.

Name: ${recipe.name}
${recipe.description ? `Description: ${recipe.description}\n` : ''}Ingredients: ${ingredientList}

${FIT_RUBRIC}

Score 1-5 where 1 = incoherent/gimmicky and 5 = a dish a chef would happily serve.
Be fair: legitimate cross-cultural pairings are GOOD, not clashes. Only flag genuine clashes.
Return ONLY JSON (no prose, no markdown):
{"score": 1-5, "clashes": ["ingredient + ingredient"], "reason": "one short sentence"}`;

  try {
    const result = await apiCall<{ choices: Array<{ message: { content: string } }> }>('ai-chat', {
      messages: [
        {
          role: 'system',
          content: 'You are a critical head chef reviewing recipes for coherence. You output only valid JSON.',
        },
        { role: 'user', content: prompt },
      ],
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 256,
    });

    if (result.error) return failOpen;
    const parsed = parseJsonLoose(result.data?.choices?.[0]?.message?.content ?? '') as
      | Record<string, unknown>
      | null;
    if (!parsed) return failOpen;

    const score = Number(parsed.score);
    const safeScore = Number.isFinite(score) ? Math.min(5, Math.max(1, score)) : 5;
    const clashes = Array.isArray(parsed.clashes)
      ? parsed.clashes.map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean)
      : [];

    return {
      // Only a clear failure rejects; 3+ passes so we don't over-reject.
      ok: safeScore >= 3,
      score: safeScore,
      clashes,
      reason: String(parsed.reason ?? '').trim(),
    };
  } catch (e) {
    console.warn('[RecipeFit] Coherence judge failed, accepting recipe:', e);
    return failOpen;
  }
}
