/**
 * Duplicate Ingredient Finder
 * Detects similar ingredient names accounting for plurals, spelling variations, and common aliases
 */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'fresh', 'dried', 'frozen', 'canned', 'cooked', 'raw',
  'organic', 'chopped', 'sliced', 'diced', 'minced', 'grated', 'shredded',
  // Prep/cut descriptors — these don't denote a different ingredient, so
  // "Paneer, Cubed" should still match "Paneer". (Variety words like
  // "snow"/"green"/"red" are deliberately NOT here — they distinguish.)
  'cubed', 'crumbled', 'halved', 'quartered', 'peeled', 'trimmed',
  'drained', 'rinsed', 'toasted', 'roasted', 'mashed', 'julienned',
  'cubes', 'pieces', 'piece', 'whole', 'boneless', 'skinless',
]);

/**
 * Descriptor words that can be dropped when matching spices/herbs/ingredients.
 * E.g., "cumin" == "cumin seed" == "cumin seeds" == "cumin powder" == "ground cumin"
 */
const MODIFIER_WORDS = new Set([
  'seed', 'seeds', 'powder', 'powdered', 'ground', 'whole', 'crushed',
  'flake', 'flakes', 'leaf', 'leaves', 'stick', 'sticks', 'pod', 'pods',
  'root', 'roots', 'bean', 'beans', 'kernel', 'kernels',
]);

/**
 * Extract significant words from ingredient name
 */
function getSignificantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Extract core words (strip both stop words and common modifier words).
 * Used to determine whether two ingredients share the same "core" base.
 */
function getCoreWords(text: string): string[] {
  return getSignificantWords(text)
    .map(singularize)
    .filter((w) => !MODIFIER_WORDS.has(w));
}

/**
 * Remove common plural/singular variations
 */
function singularize(word: string): string {
  const lower = word.toLowerCase();

  // Remove common plural endings
  if (lower.endsWith('ies')) return lower.slice(0, -3) + 'y';
  if (lower.endsWith('es')) return lower.slice(0, -2);
  if (lower.endsWith('s')) return lower.slice(0, -1);

  return lower;
}

/**
 * Calculate word overlap score between two ingredient names
 * Takes into account plurals and common variations
 */
function wordOverlapScore(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  const singularizedA = a.map(singularize);
  const singularizedB = b.map(singularize);

  const setA = new Set(singularizedA);
  const overlap = singularizedB.filter((w) => setA.has(w)).length;

  return overlap / Math.max(a.length, b.length);
}

/**
 * Check if two ingredients are likely duplicates
 * Accounts for spelling variations, plurals, and similar names
 */
export function areDuplicateIngredients(name1: string, name2: string): boolean {
  if (name1.toLowerCase() === name2.toLowerCase()) {
    return true;
  }

  const words1 = getSignificantWords(name1);
  const words2 = getSignificantWords(name2);

  // No significant words means they're empty/similar enough
  if (words1.length === 0 || words2.length === 0) {
    return name1.toLowerCase().trim() === name2.toLowerCase().trim();
  }

  // Compare using "core" words (strips modifier words like seed/powder/ground/flakes
  // and prep descriptors like cubed/crumbled). After stripping, two names are
  // duplicates only if their core word sets are EQUAL — so "cumin" == "cumin seed"
  // == "ground cumin" and "paneer" == "paneer cubed", but distinct varieties that
  // share only a head noun ("snow pea" vs "frozen pea", "green chili" vs "red chili")
  // keep their distinguishing word and are NOT treated as duplicates.
  const core1 = getCoreWords(name1);
  const core2 = getCoreWords(name2);

  if (core1.length > 0 && core2.length > 0) {
    const coreSet1 = new Set(core1);
    const coreSet2 = new Set(core2);
    const equalSets =
      coreSet1.size === coreSet2.size &&
      Array.from(coreSet1).every((w) => coreSet2.has(w));
    if (equalSets) return true;
    // Differing core word sets → different ingredient/variety. Do not group.
    return false;
  }

  // No core words on one side — fall back to high overlap on significant words.
  const overlapScore = wordOverlapScore(words1, words2);
  return overlapScore >= 0.75;
}

export interface DuplicateIngredientGroup {
  key: string;
  ingredientIds: string[]; // IDs of grocery items in this group
  names: string[]; // Display names for each item
  quantities: string[]; // Quantities for each item
  units: string[]; // Resolved units for each item (parsed from quantity, then unit, then base_unit)
}

/**
 * Resolve the user-visible unit for a grocery item.
 * Priority: parsed from quantity display > unit field > base_unit (with "piece" → "pieces")
 */
function resolveDisplayUnit(item: { quantity: string; unit: string; base_unit?: string }): string {
  // Try to parse unit from quantity display string (e.g., "2 pieces" → "pieces", "120 g" → "g")
  const match = item.quantity?.match(/^\s*[\d.]+\s+(\S.*)$/);
  if (match && match[1].trim()) {
    return match[1].trim();
  }

  // Fall back to explicit unit field
  if (item.unit && item.unit.trim()) {
    return item.unit.trim();
  }

  // Fall back to base_unit (map singular "piece" to plural "pieces" for user-friendly display)
  const baseUnit = item.base_unit || 'piece';
  return baseUnit === 'piece' ? 'pieces' : baseUnit;
}

/**
 * Find all duplicate ingredient groups in a grocery list
 */
export function findDuplicateIngredientGroups(
  groceryItems: Array<{ id: string; name: string; quantity: string; unit: string; base_unit?: string }>
): DuplicateIngredientGroup[] {
  const visited = new Set<string>();
  const groups: DuplicateIngredientGroup[] = [];

  for (let i = 0; i < groceryItems.length; i++) {
    if (visited.has(groceryItems[i].id)) continue;

    const group: typeof groceryItems = [groceryItems[i]];
    const groupIds = [groceryItems[i].id];

    for (let j = i + 1; j < groceryItems.length; j++) {
      if (visited.has(groceryItems[j].id)) continue;
      if (areDuplicateIngredients(groceryItems[i].name, groceryItems[j].name)) {
        group.push(groceryItems[j]);
        groupIds.push(groceryItems[j].id);
        visited.add(groceryItems[j].id);
      }
    }

    // Only return groups with 2 or more items
    if (group.length >= 2) {
      visited.add(groceryItems[i].id);
      const keyWords = getSignificantWords(groceryItems[i].name);
      groups.push({
        key: keyWords.sort().join('-') || groceryItems[i].id,
        ingredientIds: groupIds,
        names: group.map((g) => g.name),
        quantities: group.map((g) => g.quantity),
        units: group.map((g) => resolveDisplayUnit(g)),
      });
    }
  }

  return groups;
}
