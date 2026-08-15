# PlanNplate — AI-Generated Recipe Disclaimers

> **DRAFT — not legal advice.** Reviewed wording should be confirmed with your lawyer. These are the user-facing disclaimers to show wherever AI-generated or AI-adapted recipes, meal plans, or nutrition figures appear, plus imported (social/web) recipes.

**Last updated:** 3 August 2026

---

## Why this matters
PlanNplate generates and adapts recipes with AI and filters them against user allergies/diets. AI output can be wrong, and allergen filtering is best-effort. Clear, consistently-placed disclaimers reduce user harm and legal risk. Recipe content also touches food safety, so the language deliberately avoids implying medical, nutritional or allergen guarantees.

## Where to show each version

| Placement | Version to use |
|---|---|
| Recipe detail screen (AI-generated or imported recipes) | **Short inline** |
| Recipe generation / "Plan My Meals" result screens | **Short inline** |
| Import review screen (recipe pulled from a link/social) | **Import** |
| Nutrition / calorie figures shown anywhere | **Nutrition** micro-note |
| First-run / onboarding acknowledgement, and Settings → About | **Full** |
| Allergen line on a recipe (already present in `recipe-detail.tsx`) | **Allergen** |

---

## 1. Short inline disclaimer
Use under AI-generated or adapted recipes and meal-plan results.

> ✨ AI-generated. Recipes, times and nutrition are estimates and may be inaccurate. Always check ingredients and allergens before cooking. Not medical or dietary advice.

Compact one-liner (tight spaces):

> AI-generated — double-check ingredients and allergens before cooking.

## 2. Allergen disclosure (food-label style, not a personalised warning)
Pair with the "Contains: …" line already rendered from detected ingredients.

> **Contains:** {allergens}.
> Allergen detection is automatic and may be incomplete — always verify every ingredient and label yourself if you have an allergy or intolerance.

## 3. Import disclaimer (social / web)
Show on the import review screen before saving.

> This recipe was extracted automatically from an external source and may be incomplete or inaccurate. Please review and edit it before saving. Imported content belongs to its original creator; make sure you have the right to use it.

## 4. Nutrition micro-note
Show next to any calorie/mac/nutrition value.

> Nutrition figures are AI estimates for general guidance only, not a substitute for professional advice or product labels.

## 5. Full disclaimer
Use for the onboarding acknowledgement and Settings → About. Consider requiring a one-time "I understand" acknowledgement.

> **About AI-generated recipes**
>
> PlanNplate uses artificial intelligence to create, adapt and suggest recipes and meal plans, and to estimate cook times, serving sizes and nutrition. This content can be inaccurate, incomplete, or unsuitable for your needs.
>
> PlanNplate does not provide medical, nutritional, dietary or health advice, and is not a substitute for a qualified professional. Consult a professional for any dietary, medical or allergy needs.
>
> Allergen and dietary filtering is a convenience, not a guarantee. If you have allergies, intolerances or medical conditions, always independently verify every ingredient, label and preparation step before cooking or eating. You are responsible for confirming that any recipe is safe and appropriate for you and anyone you cook for, and for safe food handling, cooking and storage.
>
> By continuing, you acknowledge and accept the above.

---

## Implementation notes (for the team)
- Keep a single source of truth. Suggest adding these strings to `src/lib/legal.ts` (e.g. `AI_RECIPE_DISCLAIMER_SHORT`, `_FULL`, `_IMPORT`, `_NUTRITION`, `_ALLERGEN`) and importing them wherever shown, so wording stays consistent and is easy to update after legal review.
- Suggested surfaces in the current code:
  - `src/app/recipe-detail.tsx` — short inline + allergen note (allergen line already exists near the "Contains:" disclosure).
  - `src/app/generate-recipe.tsx` and the Plan My Meals result — short inline.
  - `src/app/import-review.tsx` — import disclaimer.
  - `src/app/onboarding.tsx` and Settings/About — full disclaimer (+ optional one-time acknowledgement stored in preferences).
- These are UI copy only. Say the word and I can wire the constants into `legal.ts` and drop the disclaimers into those screens.
