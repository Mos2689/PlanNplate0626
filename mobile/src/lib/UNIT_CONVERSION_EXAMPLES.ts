/**
 * Unit Conversion Display Format Examples
 *
 * These examples demonstrate how the formatFromBaseUnit function
 * displays ingredient quantities according to strict unit system rules.
 *
 * VOLUMES (ml base unit):
 * 510 ml  → "2 cups + 2 tbsp"  (>=1 cup: use cups+tbsp system)
 * 480 ml  → "2 cups"           (exactly 2 cups)
 * 240 ml  → "1 cup"            (exactly 1 cup)
 * 30 ml   → "2 tbsp"           (<1 cup, >=1 tbsp: use tbsp+tsp system)
 * 20 ml   → "1 tbsp + 1 tsp"   (tbsp + tsp)
 * 7 ml    → "1.5 tsp"          (<1 tbsp: use tsp only)
 * 5 ml    → "1 tsp"            (exactly 1 tsp)
 * 3 ml    → "3 ml"             (<5 ml: use ml as fallback)
 *
 * WEIGHTS (g base unit):
 * 1500 g  → "1.5 kg"           (>=1kg: use kg only)
 * 1000 g  → "1 kg"             (exactly 1 kg)
 * 500 g   → "500 g"            (<1kg: use g only)
 * 250 g   → "250 g"            (quarter kg in grams)
 *
 * COUNTS (pieces):
 * 5       → "5"                (count display)
 * 1       → "1"                (single count)
 *
 * NEVER MIXED (Invalid Examples):
 * ❌ "2 tbsp + 10 ml"   - mixing kitchen units with metric
 * ❌ "1 cup + 100 ml"   - mixing kitchen units with metric
 * ❌ "500 g + 1 kg"     - mixing g and kg (should be 1.5 kg)
 * ❌ "2 tbsp ml"        - appending base unit to kitchen units
 */

// Example usage with the updated conversion functions:

import { convertToBaseUnit, formatFromBaseUnit } from './unit-conversion';

// Example 1: Adding olive oil with different units
const oil1 = convertToBaseUnit('2', 'cups', 'olive oil');
// Result: { quantity: 480, unit: 'ml', category: 'volume' }

const oil2 = convertToBaseUnit('2', 'tbsp', 'olive oil');
// Result: { quantity: 30, unit: 'ml', category: 'volume' }

// Combined in grocery list:
const combinedOil = oil1.quantity + oil2.quantity; // 510 ml
const displayOil = formatFromBaseUnit(510, 'ml', 'olive oil');
// Result: "2 cups + 2 tbsp" ✓

// Example 2: Adding butter with count units
const butter1 = convertToBaseUnit('2', 'slices', 'butter');
// Result: { quantity: 2, unit: 'piece', category: 'count' }

const butter2 = convertToBaseUnit('1', 'can', 'butter');
// Result: { quantity: 1, unit: 'piece', category: 'count' }

// Combined:
const combinedButter = butter1.quantity + butter2.quantity; // 3 pieces
const displayButter = formatFromBaseUnit(3, 'piece', 'butter');
// Result: "3" ✓

// Example 3: Avoiding mixed units
// BAD: "2 tbsp + 10 ml" would violate unit system rules
// GOOD: Convert both to base (30 + 10 = 40ml), then format as "2 tbsp + 2 tsp"
const smallVolume = formatFromBaseUnit(40, 'ml', 'vanilla extract');
// Result: "2 tbsp + 2 tsp" ✓ (not "2 tbsp + 10 ml")
