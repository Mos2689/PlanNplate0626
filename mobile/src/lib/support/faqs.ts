// Quick answers.
//
// EIGHT. Not eighty. The purpose of this list is to instantly resolve the
// handful of questions that repeat, not to build a knowledge base — and
// certainly not to deflect contact, which is why it sits BELOW the three
// contact rows on the Help screen rather than in front of them.
//
// Why no search: search over eight items is theatre. It adds a control, an
// empty state and a keyboard to a list that fits on one screen.
//
// Items 4, 7 and 8 (failed imports, subscription changes, account deletion) are
// here because they generate contact volume in every consumer app, not because
// they're the most interesting features. Answers are ≤45 words and every one
// ends with a way to reach a person — a quick answer that doesn't land must
// never be a dead end.
//
// `id` is stable and never renumbered: it's the analytics key that tells us
// which answers aren't working.

export interface Faq {
  id: string;
  question: string;
  answer: string;
}

export const FAQS: readonly Faq[] = [
  {
    id: 'plan-basics',
    question: 'How does a weekly plan work?',
    answer:
      'Pick the days and meals you want to cook, and we fill them with recipes that match your preferences. Nothing is locked in — swap, skip or clear any meal whenever you like.',
  },
  {
    id: 'move-meal',
    question: 'How do I move or swap a meal?',
    answer:
      'Tap the meal in your plan. From there you can swap it for something else, move it to another day, or mark it as cooked or skipped.',
  },
  {
    id: 'import-recipe',
    question: 'Can I import a recipe from a website?',
    answer:
      'Yes — paste a link, or share a page to PlanNplate from your browser or social app. We read the ingredients and steps and save it to your recipes.',
  },
  {
    id: 'import-failed',
    question: "Why didn't my recipe import properly?",
    answer:
      "Some sites keep their recipes behind scripts or logins we can't read, and a few block us entirely. Pasting the recipe text works every time. If a site you use often keeps failing, tell us and we'll look at supporting it.",
  },
  {
    id: 'edit-recipe',
    question: 'Can I edit a recipe after importing it?',
    answer:
      'Yes. Open the recipe and edit anything — ingredients, quantities, steps, servings or the photo. Your changes flow through to your plan and grocery list.',
  },
  {
    id: 'grocery-list',
    question: 'How does my grocery list get made?',
    answer:
      'We take the ingredients from every meal in your plan and combine them, so three recipes using onions become one line. You can add, edit or tick off anything by hand.',
  },
  {
    id: 'subscription',
    question: 'How do I change or cancel my subscription?',
    answer:
      'Subscriptions are handled by the App Store or Google Play, so changes and cancellations happen in your device settings. Profile → Manage subscription takes you straight there.',
  },
  {
    id: 'delete-account',
    question: 'How do I delete my account?',
    answer:
      'Profile → Settings → Fresh Start removes your recipes, plans and preferences. Deleting the account itself removes everything permanently, including anything you have sent us.',
  },
] as const;
