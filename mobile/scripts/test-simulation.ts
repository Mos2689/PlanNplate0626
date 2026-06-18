import { applyCuratedMealPlan } from '../src/lib/curated-meal-plans';
import { useMealPlanStore } from '../src/lib/store';
import { CURATED_MEAL_PLANS } from '../src/lib/curated-meal-plans';

// Simple mock for addRecipe
const addRecipe = (recipe: any) => {
  console.log(`Added recipe: ${recipe.name}`);
  return recipe.id;
};

// Simple mock for addMealToSlot
const addMealToSlot = (slot: any) => {
  console.log(`Added slot for date: ${slot.date}`);
};

const plan = CURATED_MEAL_PLANS.find(p => p.id === 'high-protein-simple');
if (plan) {
  applyCuratedMealPlan(plan, '2026-06-17', addRecipe, addMealToSlot);
}
