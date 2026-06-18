import { useMealPlanStore } from '../src/lib/store';
import { applyCuratedMealPlan, CURATED_MEAL_PLANS } from '../src/lib/curated-meal-plans';

const store = useMealPlanStore.getState();

const plan = CURATED_MEAL_PLANS.find(p => p.id === 'high-protein-simple');
if (plan) {
  applyCuratedMealPlan(plan, '2026-06-17', store.addRecipe, store.addMealToSlot);
}

store.generateGroceryList('2026-06-17', '2026-06-24');

const updatedStore = useMealPlanStore.getState();

const milks = updatedStore.groceryItems.filter(i => i.name.toLowerCase().includes('milk'));
console.log('Milk entries in Grocery List:');
console.log(JSON.stringify(milks, null, 2));

