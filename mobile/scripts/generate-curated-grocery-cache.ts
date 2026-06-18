import fs from 'fs';
import path from 'path';
import { CURATED_MEAL_PLANS } from '../src/lib/curated-meal-plans';
import { validateIngredient } from '../src/lib/ingredient-validator';
import { convertToBaseUnit } from '../src/lib/unit-conversion';
import { normalizeIngredientName } from '../src/lib/ingredient-aliases';
// We need to implement getCanonicalCategory and curatedNameSlug
import { getIngredientCategory } from '../src/lib/ingredient-unit-rules';

const CACHE_FILE = path.join(__dirname, '../src/lib/curated-grocery-cache.ts');

function getCanonicalCategory(
  ingredientName: string,
  originalCategory: 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other'
): 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other' {
  const INGREDIENT_CATEGORY_MAP: Record<string, 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other'> = {
    'chicken': 'meat', 'beef': 'meat', 'pork': 'meat', 'lamb': 'meat', 'turkey': 'meat', 'duck': 'meat', 'fish': 'meat',
    'salmon': 'meat', 'tuna': 'meat', 'cod': 'meat', 'shrimp': 'meat', 'prawn': 'meat', 'crab': 'meat', 'lobster': 'meat',
    'anchovy': 'meat', 'anchovy fillet': 'meat', 'bacon': 'meat', 'ham': 'meat', 'sausage': 'meat', 'mince': 'meat',
    'ground beef': 'meat', 'ground pork': 'meat', 'ground chicken': 'meat', 'steak': 'meat',
    'milk': 'dairy', 'cheese': 'dairy', 'butter': 'dairy', 'cream': 'dairy', 'yogurt': 'dairy', 'yoghurt': 'dairy',
    'sour cream': 'dairy', 'mozzarella': 'dairy', 'mozzarella ball': 'dairy', 'parmesan': 'dairy', 'cheddar': 'dairy',
    'feta': 'dairy', 'egg': 'dairy', 'eggs': 'dairy',
    'tomato': 'produce', 'onion': 'produce', 'garlic': 'produce', 'carrot': 'produce', 'celery': 'produce',
    'potato': 'produce', 'bell pepper': 'produce', 'cucumber': 'produce', 'lettuce': 'produce', 'spinach': 'produce',
    'cabbage': 'produce', 'broccoli': 'produce', 'cauliflower': 'produce', 'mushroom': 'produce', 'apple': 'produce',
    'banana': 'produce', 'orange': 'produce', 'lemon': 'produce', 'lime': 'produce', 'strawberry': 'produce',
    'blueberry': 'produce', 'avocado': 'produce', 'ginger': 'produce', 'ginger root': 'produce', 'fresh herbs': 'produce',
    'coriander': 'produce', 'parsley': 'produce', 'basil': 'produce', 'mint': 'produce', 'thyme': 'produce',
    'rosemary': 'produce', 'chives': 'produce', 'dill': 'produce', 'sweet potato': 'produce', 'zucchini': 'produce',
    'kale': 'produce', 'arugula': 'produce', 'rocket': 'produce', 'mixed greens': 'produce', 'salad mix': 'produce',
    'green beans': 'produce', 'peas': 'produce', 'asparagus': 'produce', 'eggplant': 'produce', 'corn': 'produce',
    'rice': 'pantry', 'pasta': 'pantry', 'bread': 'pantry', 'flour': 'pantry', 'oats': 'pantry', 'quinoa': 'pantry',
    'couscous': 'pantry', 'olive oil': 'pantry', 'vegetable oil': 'pantry', 'coconut oil': 'pantry', 'sesame oil': 'pantry',
    'honey': 'pantry', 'maple syrup': 'pantry', 'soy sauce': 'pantry', 'vinegar': 'pantry', 'salt': 'pantry',
    'pepper': 'pantry', 'black pepper': 'pantry', 'sugar': 'pantry', 'brown sugar': 'pantry', 'spices': 'pantry',
    'canned tomatoes': 'pantry', 'can tomatoes': 'pantry', 'tomato paste': 'pantry', 'tomato sauce': 'pantry',
    'beans': 'pantry', 'black beans': 'pantry', 'kidney beans': 'pantry', 'chickpeas': 'pantry', 'lentils': 'pantry',
    'peanut butter': 'pantry', 'almond butter': 'pantry', 'nuts': 'pantry', 'almonds': 'pantry', 'walnuts': 'pantry',
    'seeds': 'pantry', 'chia seeds': 'pantry', 'flax seeds': 'pantry', 'pumpkin seeds': 'pantry', 'sunflower seeds': 'pantry',
    'tofu': 'pantry', 'tempeh': 'pantry',
    'frozen vegetables': 'frozen', 'frozen berries': 'frozen', 'frozen peas': 'frozen', 'frozen corn': 'frozen',
    'frozen spinach': 'frozen', 'ice cream': 'frozen',
    'croissant': 'bakery', 'baguette': 'bakery', 'pastry': 'bakery', 'cake': 'bakery', 'muffin': 'bakery'
  };

  const normalized = normalizeIngredientName(ingredientName).toLowerCase();
  if (INGREDIENT_CATEGORY_MAP[normalized]) {
    return INGREDIENT_CATEGORY_MAP[normalized];
  }
  for (const [key, category] of Object.entries(INGREDIENT_CATEGORY_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return category;
    }
  }
  return originalCategory;
}

function curatedNameSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface CachedGroceryItem {
  normalizedKey: string;
  canonicalName: string;
  category: 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other';
  quantity_base: number;
  base_unit: string;
}

function generateCache() {
  const cache: Record<string, CachedGroceryItem[]> = {};
  const processedSourceIds = new Set<string>();

  CURATED_MEAL_PLANS.forEach(plan => {
    plan.meals.forEach(meal => {
      // @ts-ignore
      const _sourceIdOverride = meal.recipe.sourceId;
      const curatedSourceId = _sourceIdOverride ?? `${plan.id}::${curatedNameSlug(meal.recipe.name)}`;

      if (processedSourceIds.has(curatedSourceId)) return;
      processedSourceIds.add(curatedSourceId);

      const cachedItems: CachedGroceryItem[] = [];

      meal.recipe.ingredients.forEach(ing => {
        const validated = validateIngredient({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          category: ing.category as any
        });

        const baseConversion = convertToBaseUnit(validated.quantity, validated.unit, validated.name);
        const normalizedName = normalizeIngredientName(validated.name);
        const canonicalCategory = getCanonicalCategory(validated.name, validated.category as any);
        const key = `${normalizedName}-${baseConversion.unit}-${canonicalCategory}`;
        
        const existing = cachedItems.find(c => c.normalizedKey === key);
        if (existing) {
          existing.quantity_base += baseConversion.quantity;
        } else {
          cachedItems.push({
            normalizedKey: key,
            canonicalName: normalizedName,
            category: canonicalCategory,
            quantity_base: baseConversion.quantity,
            base_unit: baseConversion.unit
          });
        }
      });

      cache[curatedSourceId] = cachedItems;
    });
  });

  const fileContent = `/**
 * AUTO-GENERATED CACHE - DO NOT EDIT MANUALLY
 * Generated by mobile/scripts/generate-curated-grocery-cache.ts
 * 
 * This cache contains pre-calculated, perfectly uniform grocery ingredients
 * for all curated meal plans to ensure zero duplication during grocery generation.
 */

export interface CachedGroceryItem {
  normalizedKey: string;
  canonicalName: string;
  category: 'produce' | 'dairy' | 'meat' | 'pantry' | 'frozen' | 'bakery' | 'other';
  quantity_base: number;
  base_unit: string;
}

export const CURATED_GROCERY_CACHE: Record<string, CachedGroceryItem[]> = ${JSON.stringify(cache, null, 2)};
`;

  fs.writeFileSync(CACHE_FILE, fileContent);
  console.log('Successfully generated Curated Grocery Cache with ' + Object.keys(cache).length + ' recipes!');
}

generateCache();
