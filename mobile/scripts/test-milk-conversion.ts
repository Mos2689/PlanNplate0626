import { convertToBaseUnit } from '../src/lib/unit-conversion';
import { normalizeIngredientName } from '../src/lib/ingredient-aliases';
import { getIngredientCategory } from '../src/lib/ingredient-unit-rules';

const ing1 = { name: 'milk', quantity: 1, unit: 'cup', category: 'dairy' };
const ing2 = { name: 'milk', quantity: 200, unit: 'ml', category: 'dairy' };

const res1 = convertToBaseUnit(ing1.quantity, ing1.unit, ing1.name);
const res2 = convertToBaseUnit(ing2.quantity, ing2.unit, ing2.name);

console.log('Ing1:', res1);
console.log('Ing2:', res2);

console.log('Norm1:', normalizeIngredientName(ing1.name));
console.log('Norm2:', normalizeIngredientName(ing2.name));

console.log('Cat1:', getIngredientCategory(ing1.name));
console.log('Cat2:', getIngredientCategory(ing2.name));
