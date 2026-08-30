// Production-renderer approval fixtures.
//
// These fixtures contain no user data. They exercise every distinct lifecycle
// layout using the same block and shell functions as a real campaign. The
// dispatcher supplies a real send id and the authorised test account's opaque
// unsubscribe token, so CTA attribution and unsubscribe routing can be tested
// end to end without enabling a campaign.

import {
  BLOCKS,
  renderEmail,
  type CtaTarget,
} from './engagement-email.ts';

export interface ApprovalEmail {
  campaignId: string;
  variant: string;
  period: 'weekly' | 'monthly';
  subject: string;
  preheader: string;
  sendId: string;
  blockKeys: string[];
  html: string;
  text: string;
}

type Fixture = Omit<ApprovalEmail, 'sendId' | 'html' | 'text' | 'blockKeys'> & {
  ctaTarget: CtaTarget;
  ctaLabel: string;
  blocks: string[];
  signals: Record<string, unknown>;
};

const recipe = {
  curry: { id: '11111111-1111-4111-8111-111111111111', name: 'Coconut Chickpea Curry', image_url: null, prep_time: 30 },
  salmon: { id: '22222222-2222-4222-8222-222222222222', name: 'Honey Soy Salmon Bowls', image_url: null, prep_time: 25 },
  pasta: { id: '33333333-3333-4333-8333-333333333333', name: 'Roasted Tomato Pasta', image_url: null, prep_time: 35 },
  tacos: { id: '44444444-4444-4444-8444-444444444444', name: 'Crispy Fish Tacos', image_url: null, prep_time: 30 },
  tray: { id: '55555555-5555-4555-8555-555555555555', name: 'Lemon Herb Chicken Tray Bake', image_url: null, prep_time: 40 },
};

const common = {
  first_name: 'Mia',
  week_start: '2026-08-31',
  library_count: 24,
  recap: { planned_this_week: 6, cooked_this_week: 5, recipes_added_this_week: 2 },
  orphan_recipes: [
    { ...recipe.tacos, days_since_saved: 18 },
    { ...recipe.tray, days_since_saved: 27 },
  ],
  grocery_open_items: 7,
};

const FIXTURES: Fixture[] = [
  {
    campaignId: 'weekly_plan_unfinished', variant: 'approval_test', period: 'weekly',
    subject: '[APPROVAL TEST] Next week is 3 of 6 planned',
    preheader: '3 days still open — pick up where you left off.',
    ctaTarget: 'plan', ctaLabel: 'Finish next week',
    blocks: ['hero_plan_unfinished', 'recap_strip', 'rediscovery_card'],
    signals: {
      ...common, planned_count: 3, typical_count: 6, unplanned_day_count: 3,
      planned_slots: [
        { date: '2026-08-31', name: recipe.curry.name },
        { date: '2026-09-02', name: recipe.salmon.name },
        { date: '2026-09-04', name: recipe.pasta.name },
      ],
    },
  },
  {
    campaignId: 'weekly_grocery_ready', variant: 'approval_test', period: 'weekly',
    subject: '[APPROVAL TEST] 4 meals planned — your list is ready to build',
    preheader: "We've combined the ingredients across all of them.",
    ctaTarget: 'grocery', ctaLabel: 'Open your list',
    blocks: ['hero_grocery_ready', 'recap_strip'],
    signals: {
      ...common, planned_count: 4, planned_recipe_count: 4,
      planned_ingredients: [
        { ingredients: [
          { name: 'Chickpeas', quantity_base: 800, base_unit: 'g', category: 'pantry' },
          { name: 'Coconut milk', quantity_base: 400, base_unit: 'ml', category: 'pantry' },
          { name: 'Baby spinach', quantity_base: 150, base_unit: 'g', category: 'produce' },
          { name: 'Brown onion', quantity_base: 2, base_unit: 'piece', category: 'produce' },
        ] },
        { ingredients: [
          { name: 'Salmon fillets', quantity_base: 600, base_unit: 'g', category: 'meat' },
          { name: 'Broccoli', quantity_base: 2, base_unit: 'piece', category: 'produce' },
          { name: 'Soy sauce', quantity_base: 60, base_unit: 'ml', category: 'pantry' },
          { name: 'Brown rice', quantity_base: 300, base_unit: 'g', category: 'pantry' },
        ] },
        { ingredients: [
          { name: 'Cherry tomatoes', quantity_base: 500, base_unit: 'g', category: 'produce' },
          { name: 'Pasta', quantity_base: 400, base_unit: 'g', category: 'pantry' },
          { name: 'Parmesan', quantity_base: 100, base_unit: 'g', category: 'dairy' },
        ] },
      ],
    },
  },
  {
    campaignId: 'weekly_plan_next_week', variant: 'approval_test', period: 'weekly',
    subject: `[APPROVAL TEST] Start next week with ${recipe.curry.name}`,
    preheader: 'Three meals that went down well — one tap to reuse them.',
    ctaTarget: 'plan', ctaLabel: 'Plan next week',
    blocks: ['hero_plan_next_week', 'rediscovery_card', 'grocery_preview'],
    signals: { ...common, planned_count: 0, repeat_candidates: [recipe.curry, recipe.salmon, recipe.pasta] },
  },
  {
    campaignId: 'weekly_saved_rediscovery', variant: 'approval_test', period: 'weekly',
    subject: `[APPROVAL TEST] ${recipe.tacos.name} is still waiting`,
    preheader: 'Saved 18 days ago and never planned.',
    ctaTarget: 'recipe', ctaLabel: 'See the recipe',
    blocks: ['hero_rediscovery', 'recap_strip'],
    signals: { ...common, recently_saved_recipe: recipe.tacos.name, days_since_saved: 18 },
  },
  {
    campaignId: 'monthly_meal_story', variant: 'approval_test', period: 'monthly',
    subject: '[APPROVAL TEST] Your August: 22 meals, 11 recipes',
    preheader: `${recipe.curry.name} came up 4 times.`,
    ctaTarget: 'plan', ctaLabel: 'Plan from your favourites',
    blocks: ['hero_monthly_story'],
    signals: {
      ...common, month_name: 'August', planned_meal_count: 22,
      distinct_recipe_count: 11, most_planned_recipe: { ...recipe.curry, count: 4 },
      most_planned_count: 4, favourite_cuisine: 'Mediterranean', cooked_count: 17,
      usual_plan_dow: 0, new_recipe_count: 5,
    },
  },
  {
    campaignId: 'monthly_meal_story', variant: 'rediscovery_approval_test', period: 'monthly',
    subject: `[APPROVAL TEST] Remember ${recipe.tray.name}?`,
    preheader: 'A reliable favourite has quietly dropped out of rotation.',
    ctaTarget: 'recipe', ctaLabel: 'See the recipe',
    blocks: ['hero_monthly_rediscovery'],
    signals: {
      ...common, favourite_recipe: recipe.tray.name,
      dormant_favourite: { ...recipe.tray, cook_count: 5, gap_days: 43 },
    },
  },
];

export function renderApprovalPack(unsubToken: string): ApprovalEmail[] {
  return FIXTURES.map((fixture) => {
    const sendId = crypto.randomUUID();
    const renderedBlocks = fixture.blocks
      .map((key) => BLOCKS[key]?.({
        sendId,
        signals: fixture.signals,
        ctaTarget: fixture.ctaTarget,
        ctaLabel: fixture.ctaLabel,
        ctaRecipeId: null,
      }))
      .filter((block): block is NonNullable<typeof block> => Boolean(block))
      .slice(0, 3);

    if (!renderedBlocks.length) throw new Error(`Approval fixture rendered no blocks: ${fixture.campaignId}`);
    const rendered = renderEmail({
      preheader: fixture.preheader,
      blocks: renderedBlocks,
      unsubToken,
      period: fixture.period,
    });

    return {
      campaignId: fixture.campaignId,
      variant: fixture.variant,
      period: fixture.period,
      subject: fixture.subject,
      preheader: fixture.preheader,
      sendId,
      blockKeys: fixture.blocks,
      html: rendered.html,
      text: rendered.text,
    };
  });
}

