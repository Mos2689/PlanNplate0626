// Shared option vocabularies for editable user preferences.
//
// Lifted out of EditProfileModal so the persistent profile editor
// and the per-plan PlanTuneSheet stay in lock-step — any new diet,
// cuisine, or allergy entry shows up everywhere automatically and
// can't drift between the two surfaces.
//
// Keep the shapes minimal: arrays of plain strings for free-form
// multi-select chips, arrays of `{id, label, ...}` for surfaces
// that need a stable id distinct from the human label.

import type { WeeknightMinutes } from './store';

// ── Diet & safety ────────────────────────────────────────────────────────────
export const DIETARY_OPTIONS = [
  'Vegetarian',
  'Vegan',
  'Pescatarian',
  'Gluten-Free',
  'Dairy-Free',
  'Keto',
  'Paleo',
  'Low-Carb',
  'Low-Sodium',
  'Halal',
  'Kosher',
] as const;

export const CUISINE_OPTIONS = [
  'Italian',
  'Mexican',
  'Asian',
  'Mediterranean',
  'Indian',
  'American',
  'French',
  'Japanese',
  'Chinese',
  'Korean',
  'Thai',
  'Greek',
] as const;

export const ALLERGY_OPTIONS = [
  'Peanuts',
  'Tree Nuts',
  'Milk',
  'Eggs',
  'Wheat',
  'Soy',
  'Fish',
  'Shellfish',
  'Sesame',
] as const;

// ── Cooking ──────────────────────────────────────────────────────────────────
export const SKILL_LEVELS = [
  { key: 'beginner',     label: 'Beginner',     description: 'Simple recipes, basic techniques' },
  { key: 'intermediate', label: 'Intermediate', description: 'More variety, some advanced techniques' },
  { key: 'advanced',     label: 'Advanced',     description: 'Complex recipes, diverse cuisines' },
] as const;

export const PREP_TIME_OPTIONS = [
  { key: 'quick',     label: 'Quick',     description: 'Under 30 min' },
  { key: 'moderate',  label: 'Moderate',  description: '30–60 min' },
  { key: 'elaborate', label: 'Elaborate', description: 'No limit' },
] as const;

// Discrete weeknight-minute buckets surfaced as pills in the
// PlanTuneSheet. Mirrors the same WeeknightMinutes type the store
// uses so the values round-trip cleanly into preferences.
export const WEEKNIGHT_MINUTE_OPTIONS: readonly WeeknightMinutes[] = [15, 30, 45, 60, 90] as const;

// ── Household ────────────────────────────────────────────────────────────────
export const HOUSEHOLD_OPTIONS = [
  { id: 'solo' as const,         label: 'Just me' },
  { id: 'couple' as const,       label: 'Couple' },
  { id: 'family_kids' as const,  label: 'Family with kids' },
  { id: 'roommates' as const,    label: 'Roommates' },
];

export const EQUIPMENT_OPTIONS = [
  { id: 'oven',           label: 'Oven' },
  { id: 'stovetop',       label: 'Stovetop' },
  { id: 'microwave',      label: 'Microwave' },
  { id: 'air_fryer',      label: 'Air Fryer' },
  { id: 'instant_pot',    label: 'Instant Pot' },
  { id: 'slow_cooker',    label: 'Slow Cooker' },
  { id: 'blender',        label: 'Blender' },
  { id: 'grill',          label: 'Grill' },
  { id: 'rice_cooker',    label: 'Rice Cooker' },
  { id: 'food_processor', label: 'Food Processor' },
];

export const MEAL_HABIT_OPTIONS = {
  breakfast: [
    { id: 'skip' as const, label: 'Skip' },
    { id: 'cook' as const, label: 'Cook' },
    { id: 'grab' as const, label: 'Grab & go' },
  ],
  lunch: [
    { id: 'leftovers' as const, label: 'Leftovers' },
    { id: 'cook' as const,      label: 'Cook fresh' },
    { id: 'buy' as const,       label: 'Buy out' },
  ],
  dinner: [
    { id: 'leftovers' as const, label: 'Leftovers' },
    { id: 'cook' as const,      label: 'Cook fresh' },
    { id: 'buy' as const,       label: 'Buy out' },
  ],
};

// ── Tastes & goals ───────────────────────────────────────────────────────────
export const ADVENTURE_LEVELS = [1, 2, 3, 4, 5] as const;

export const GOAL_OPTIONS = [
  { id: 'eat_healthier', label: 'Eat healthier' },
  { id: 'save_money',    label: 'Save money' },
  { id: 'reduce_waste',  label: 'Reduce waste' },
  { id: 'learn_recipes', label: 'Learn new recipes' },
  { id: 'lose_weight',   label: 'Lose weight' },
  { id: 'more_protein',  label: 'More protein' },
];
