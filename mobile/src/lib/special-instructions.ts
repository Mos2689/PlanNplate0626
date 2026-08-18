// Special Instructions — the free-text box on Plan My Meals ("no beef, only
// vegetarian, more chicken"). Because the Get-Inspired selector is a
// deterministic local scorer (not an LLM), the sentence has to be turned into
// STRUCTURED rules first:
//
//   { exclude: ["beef"], include: ["chicken"], diets: ["vegetarian"] }
//
// Primary path: one LLM extraction call per plan generation. Fallback: a local
// keyword parser (offline / call failure). Since dropping the diet preference
// made this box the only guard against a halal user getting pork, EXCLUDES are
// applied downstream as HARD filters, and the parsed result is echoed back to
// the user for confirmation.
import { apiCall } from './api-router';

export interface ParsedInstructions {
  /** Ingredients / proteins to hard-exclude (canonical-ish lowercase). */
  exclude: string[];
  /** Ingredients / proteins to prefer (soft boost). */
  include: string[];
  /** Ingredients to use LESS of but NOT remove ("less oil" → ["oil"]). Soft. */
  reduce: string[];
  /** Diet tags to hard-filter on (matched against recipe.dietary). */
  diets: string[];
  /** Cuisines the user wants ("only Indian" → ["Indian"]). Feeds cuisinePreferences. */
  cuisines: string[];
  /** Original text, kept for the AI prompt + audit. */
  raw: string;
}

export const EMPTY_INSTRUCTIONS: ParsedInstructions = {
  exclude: [],
  include: [],
  reduce: [],
  diets: [],
  cuisines: [],
  raw: '',
};

// Diet vocabulary we can hard-filter on (must match InspiredRecipe.dietary tags).
const DIET_CANON: Record<string, string> = {
  vegetarian: 'Vegetarian',
  veggie: 'Vegetarian',
  vegan: 'Vegan',
  pescatarian: 'Pescatarian',
  pesca: 'Pesca',
  halal: 'Halal',
  kosher: 'Kosher',
  'gluten free': 'Gluten-Free',
  'gluten-free': 'Gluten-Free',
  glutenfree: 'Gluten-Free',
  'dairy free': 'Dairy-Free',
  'dairy-free': 'Dairy-Free',
  dairyfree: 'Dairy-Free',
  keto: 'Keto',
  'low carb': 'Low-Carb',
  'low-carb': 'Low-Carb',
  paleo: 'Paleo',
};

// Common proteins/ingredients people exclude/reduce — used by the keyword
// fallback. Includes seasoning/fat items ("oil", "salt", …) so "less oil" and
// "no salt" resolve even though they aren't proteins.
const KNOWN_FOODS = [
  'beef', 'pork', 'chicken', 'lamb', 'mutton', 'goat', 'veal', 'bacon', 'ham',
  'fish', 'salmon', 'tuna', 'prawn', 'prawns', 'shrimp', 'crab', 'lobster',
  'shellfish', 'seafood', 'egg', 'eggs', 'dairy', 'milk', 'cheese', 'nuts',
  'peanut', 'peanuts', 'soy', 'tofu', 'mushroom', 'mushrooms', 'onion',
  'garlic', 'gluten', 'wheat', 'lentils', 'chickpea', 'chickpeas', 'paneer',
  'turkey', 'duck', 'coriander', 'cilantro', 'capsicum', 'eggplant',
  'oil', 'salt', 'sugar', 'butter', 'cream', 'spice', 'spices', 'chilli',
  'chili', 'pepper', 'carbs', 'carbohydrates',
];

// Cuisines the keyword fallback can recognise. Matched anywhere in the text and
// echoed back Title-Cased so they slot straight into cuisinePreferences.
const KNOWN_CUISINES = [
  'indian', 'italian', 'chinese', 'thai', 'japanese', 'korean', 'mexican',
  'mediterranean', 'greek', 'french', 'spanish', 'vietnamese', 'american',
  'middle eastern', 'lebanese', 'moroccan', 'turkish', 'ethiopian',
  'caribbean', 'german', 'british', 'indonesian', 'malaysian', 'filipino',
  'cajun', 'tex-mex',
];

function titleCaseCuisine(c: string): string {
  return c.replace(/\b\w/g, (m) => m.toUpperCase());
}

// ── Keyword fallback ────────────────────────────────────────────────────────
// Deliberately conservative: catches explicit "no X / without X / avoid X"
// (exclude), "less X / go easy on X" (reduce), "with X / more X / prefer X"
// (include), diet words, and known cuisines. Anything fuzzy is dropped (better a
// missed preference than a wrong exclusion). The LLM path handles the rest.
export function parseInstructionsKeyword(text: string): ParsedInstructions {
  const raw = (text ?? '').trim();
  const lower = raw.toLowerCase();
  if (!lower) return { ...EMPTY_INSTRUCTIONS };

  const diets = new Set<string>();
  for (const [kw, canon] of Object.entries(DIET_CANON)) {
    // "only vegetarian", "vegetarian only", or a bare diet word.
    if (new RegExp(`\\b${kw.replace(/[-\s]/g, '[-\\s]?')}\\b`).test(lower)) {
      diets.add(canon);
    }
  }

  const cuisines = new Set<string>();
  for (const c of KNOWN_CUISINES) {
    if (new RegExp(`\\b${c.replace(/[-\s]/g, '[-\\s]?')}\\b`).test(lower)) {
      cuisines.add(titleCaseCuisine(c));
    }
  }

  const exclude = new Set<string>();
  const include = new Set<string>();
  const reduce = new Set<string>();

  // Split into clauses. Break on commas / ";" / "and", THEN also before each
  // signal word — so "less oil no garlic" (no comma) still splits into
  // "less oil" + "no garlic" and each food lands under the right verb.
  const clauses = lower
    .split(/[,;]|\band\b/g)
    .flatMap((c) =>
      c.split(
        /(?=\b(?:no|without|avoid|exclude|hold the|skip|except|not|less|reduce|fewer|light on|go easy on|more|with|prefer|extra|lots of|include|want|give me|only)\b)/g,
      ),
    )
    .map((c) => c.trim())
    .filter(Boolean);

  for (const clause of clauses) {
    const isReduce = /\b(less|reduce|reduced|fewer|light on|go easy on|minimal)\b/.test(clause);
    const isNeg = /\b(no|without|avoid|exclude|hold the|skip|except|not?)\b/.test(clause);
    const isPos = /\b(with|more|prefer|extra|lots of|include|want|give me|only)\b/.test(clause);
    for (const food of KNOWN_FOODS) {
      if (new RegExp(`\\b${food}\\b`).test(clause)) {
        // Precedence: hard exclude wins over reduce wins over soft prefer, so a
        // safety-critical "no X" is never softened to a mere "less X".
        if (isNeg) exclude.add(singular(food));
        else if (isReduce) reduce.add(singular(food));
        else if (isPos) include.add(singular(food));
      }
    }
  }

  // "only vegetarian/vegan" also implies excluding meat/fish — but the diet
  // filter already enforces that against recipe tags, so we don't double up.
  return {
    exclude: [...exclude],
    include: [...include].filter((f) => !exclude.has(f)),
    reduce: [...reduce].filter((f) => !exclude.has(f)),
    diets: [...diets],
    cuisines: [...cuisines],
    raw,
  };
}

function singular(food: string): string {
  return food.endsWith('s') && food.length > 3 ? food.replace(/s$/, '') : food;
}

// ── LLM extraction (primary) ────────────────────────────────────────────────
const EXTRACTION_SYSTEM = `You convert a cook's free-text meal-planning notes into strict JSON.
Return ONLY this shape, no prose:
{"exclude": string[], "include": string[], "reduce": string[], "diets": string[], "cuisines": string[]}
Rules:
- "exclude": foods/ingredients/proteins the user does NOT want AT ALL (e.g. "no beef" -> ["beef"]). Lowercase, singular where natural.
- "include": foods they want MORE of (e.g. "more chicken" -> ["chicken"]).
- "reduce": foods to use LESS of but NOT remove entirely (e.g. "less oil" -> ["oil"], "go easy on salt" -> ["salt"]). Do NOT also put these in "exclude".
- "diets": ONLY from this exact set when clearly implied: ["Vegetarian","Vegan","Pescatarian","Halal","Kosher","Gluten-Free","Dairy-Free","Keto","Low-Carb","Paleo"]. "only pescatarian" -> ["Pescatarian"]. Correct obvious misspellings (e.g. "prescatrian" -> "Pescatarian").
- "cuisines": cuisines the user wants, Title Case (e.g. "only Indian" -> ["Indian"], "thai or japanese" -> ["Thai","Japanese"]). Free-form; not limited to a fixed set.
- If nothing applies to a field, use an empty array. Never invent items the user didn't imply.`;

/**
 * Parse via the LLM, falling back to the keyword parser on any failure (offline,
 * timeout, bad JSON). Always resolves — never throws — so plan generation is
 * never blocked by this.
 */
export async function parseInstructions(text: string): Promise<ParsedInstructions> {
  const raw = (text ?? '').trim();
  if (!raw) return { ...EMPTY_INSTRUCTIONS };

  try {
    const result = await apiCall<{ choices: Array<{ message: { content: string } }> }>(
      'ai-chat',
      {
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM },
          { role: 'user', content: raw },
        ],
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 256,
      },
    );
    const content = result.data?.choices?.[0]?.message?.content;
    if (result.failure) throw result.failure;
    if (!content) throw new Error('empty response');

    const json = extractJson(content);
    const parsed = normaliseParsed(json, raw);
    console.log('[SPECIAL-INSTR] LLM parsed:', JSON.stringify(parsed));
    return parsed;
  } catch (e) {
    console.warn('[SPECIAL-INSTR] LLM parse failed, using keyword fallback:', e);
    return parseInstructionsKeyword(raw);
  }
}

function extractJson(text: string): any {
  // Model may wrap in ```json fences or add stray text — grab the first {...}.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON object in response');
  return JSON.parse(match[0]);
}

function normaliseParsed(json: any, raw: string): ParsedInstructions {
  const arr = (v: any): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : [];
  const validDiets = new Set(Object.values(DIET_CANON));
  const exclude = arr(json.exclude).map((s) => s.toLowerCase());
  const include = arr(json.include)
    .map((s) => s.toLowerCase())
    .filter((f) => !exclude.includes(f));
  // "reduce" is soft; never let it shadow a hard exclude of the same item.
  const reduce = arr(json.reduce)
    .map((s) => s.toLowerCase())
    .filter((f) => !exclude.includes(f));
  // Keep only diets that actually exist as recipe tags.
  const diets = arr(json.diets).filter((d) => validDiets.has(d));
  // Cuisines are free-form; keep as Title-Cased strings.
  const cuisines = arr(json.cuisines).map(titleCaseCuisine);
  return { exclude, include, reduce, diets, cuisines, raw };
}

/** Human-readable echo for the confirmation chip ("Got it — indian · no garlic · less oil"). */
export function describeInstructions(p: ParsedInstructions): string {
  const parts: string[] = [];
  for (const c of p.cuisines) parts.push(c.toLowerCase());
  for (const d of p.diets) parts.push(d.toLowerCase());
  for (const x of p.exclude) parts.push(`no ${x}`);
  for (const r of p.reduce) parts.push(`less ${r}`);
  for (const i of p.include) parts.push(`more ${i}`);
  return parts.join(' · ');
}
