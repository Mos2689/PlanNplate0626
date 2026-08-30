import {
  BLOCKS,
  renderEmail,
  type CtaTarget,
} from '../../mobile/supabase/functions/_shared/engagement-email.ts';

type Preview = {
  slug: string;
  name: string;
  cadence: 'weekly' | 'monthly';
  subject: string;
  preheader: string;
  trigger: string;
  ctaLabel: string;
  ctaTarget: CtaTarget;
  blockKeys: string[];
  signals: Record<string, unknown>;
};

const recipes = {
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
    { ...recipes.tacos, days_since_saved: 18 },
    { ...recipes.tray, days_since_saved: 27 },
  ],
  grocery_open_items: 7,
};

const previews: Preview[] = [
  {
    slug: '01-weekly-unfinished-plan',
    name: 'Weekly · Unfinished plan',
    cadence: 'weekly',
    subject: 'Next week is 3 of 6 planned',
    preheader: '3 days still open — pick up where you left off.',
    trigger: 'The user started next week, but it remains materially incomplete versus their normal week.',
    ctaLabel: 'Finish next week',
    ctaTarget: 'plan',
    blockKeys: ['hero_plan_unfinished', 'recap_strip', 'rediscovery_card'],
    signals: {
      ...common,
      planned_count: 3,
      typical_count: 6,
      unplanned_day_count: 3,
      planned_slots: [
        { date: '2026-08-31', name: recipes.curry.name },
        { date: '2026-09-02', name: recipes.salmon.name },
        { date: '2026-09-04', name: recipes.pasta.name },
      ],
    },
  },
  {
    slug: '02-weekly-grocery-ready',
    name: 'Weekly · Grocery list ready',
    cadence: 'weekly',
    subject: '4 meals planned — your list is ready to build',
    preheader: "We've combined the ingredients across all of them.",
    trigger: 'At least three recipe meals are planned, but the grocery list has not been generated.',
    ctaLabel: 'Open your list',
    ctaTarget: 'grocery',
    blockKeys: ['hero_grocery_ready', 'recap_strip'],
    signals: {
      ...common,
      planned_count: 4,
      planned_recipe_count: 4,
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
    slug: '03-weekly-head-start',
    name: 'Weekly · Plan with a head start',
    cadence: 'weekly',
    subject: `Start next week with ${recipes.curry.name}`,
    preheader: 'Three meals that went down well — one tap to reuse them.',
    trigger: 'Next week is empty and the user has strong repeat candidates from recent history.',
    ctaLabel: 'Plan next week',
    ctaTarget: 'plan',
    blockKeys: ['hero_plan_next_week', 'rediscovery_card', 'grocery_preview'],
    signals: {
      ...common,
      planned_count: 0,
      repeat_candidates: [recipes.curry, recipes.salmon, recipes.pasta],
    },
  },
  {
    slug: '04-weekly-saved-rediscovery',
    name: 'Weekly · Saved recipe rediscovery',
    cadence: 'weekly',
    subject: `${recipes.tacos.name} is still waiting`,
    preheader: 'Saved 18 days ago and never planned.',
    trigger: 'At least two recipes were saved but never added to a meal plan.',
    ctaLabel: 'See the recipe',
    ctaTarget: 'recipe',
    blockKeys: ['hero_rediscovery', 'recap_strip'],
    signals: {
      ...common,
      recently_saved_recipe: recipes.tacos.name,
      days_since_saved: 18,
    },
  },
  {
    slug: '05-monthly-meal-story',
    name: 'Monthly · Meal story',
    cadence: 'monthly',
    subject: 'Your August: 22 meals, 11 recipes',
    preheader: `${recipes.curry.name} came up 4 times.`,
    trigger: 'A meaningful month accumulated: at least eight meals, four recipes, and two active weeks.',
    ctaLabel: 'Plan from your favourites',
    ctaTarget: 'plan',
    blockKeys: ['hero_monthly_story'],
    signals: {
      ...common,
      month_name: 'August',
      planned_meal_count: 22,
      distinct_recipe_count: 11,
      library_count: 24,
      most_planned_recipe: { ...recipes.curry, count: 4 },
      most_planned_count: 4,
      favourite_cuisine: 'Mediterranean',
      cooked_count: 17,
      usual_plan_dow: 0,
      new_recipe_count: 5,
      top_recipes: [recipes.curry, recipes.salmon, recipes.pasta],
    },
  },
  {
    slug: '06-monthly-forgotten-favourite',
    name: 'Monthly fallback · Forgotten favourite',
    cadence: 'monthly',
    subject: `Remember ${recipes.tray.name}?`,
    preheader: 'A reliable favourite has quietly dropped out of rotation.',
    trigger: 'The monthly story lacks enough data, but a repeatedly cooked favourite has gone dormant.',
    ctaLabel: 'See the recipe',
    ctaTarget: 'recipe',
    blockKeys: ['hero_monthly_rediscovery'],
    signals: {
      ...common,
      favourite_recipe: recipes.tray.name,
      dormant_favourite: { ...recipes.tray, cook_count: 5, gap_days: 43 },
    },
  },
];

const escHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const cards: string[] = [];
for (let i = 0; i < previews.length; i++) {
  const p = previews[i];
  const sendId = `aaaaaaaa-aaaa-4aaa-8aaa-${String(i + 1).padStart(12, '0')}`;
  const blocks = p.blockKeys
    .map((key) => BLOCKS[key]?.({
      sendId,
      signals: p.signals,
      ctaTarget: p.ctaTarget,
      ctaLabel: p.ctaLabel,
      ctaRecipeId: null,
    }))
    .filter((block): block is NonNullable<typeof block> => Boolean(block))
    .slice(0, 3);

  if (!blocks.length) throw new Error(`No blocks rendered for ${p.slug}`);
  const rendered = renderEmail({
    preheader: p.preheader,
    blocks,
    unsubToken: 'preview-only-token',
    period: p.cadence,
  });
  await Deno.writeTextFile(`${p.slug}.html`, rendered.html);
  await Deno.writeTextFile(`${p.slug}.txt`, `Subject: ${p.subject}\nPreheader: ${p.preheader}\n\n${rendered.text}`);

  cards.push(`<section class="card" id="${p.slug}">
    <div class="meta">
      <div class="eyebrow">${escHtml(p.cadence)} · Preview ${i + 1} of ${previews.length}</div>
      <h2>${escHtml(p.name)}</h2>
      <dl>
        <dt>Subject</dt><dd>${escHtml(p.subject)}</dd>
        <dt>Preheader</dt><dd>${escHtml(p.preheader)}</dd>
        <dt>Why it sends</dt><dd>${escHtml(p.trigger)}</dd>
        <dt>CTA</dt><dd>${escHtml(p.ctaLabel)} → ${escHtml(p.ctaTarget)}</dd>
      </dl>
      <p class="links"><a href="${p.slug}.html" target="_blank">Open email alone</a> · <a href="${p.slug}.txt" target="_blank">Plain-text version</a></p>
      <label><input type="checkbox"> Approved</label>
      <label><input type="checkbox"> Copy changes needed</label>
      <label><input type="checkbox"> Design changes needed</label>
    </div>
    <div class="device"><iframe src="${p.slug}.html" title="${escHtml(p.name)}"></iframe></div>
  </section>`);
}

const index = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PlanNplate engagement email approval pack</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#ecebe5;color:#15140f;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.top{padding:44px max(24px,calc((100vw - 1440px)/2));background:#15140f;color:#fff}.top h1{margin:8px 0 10px;font-size:34px;letter-spacing:-.03em}.top p{margin:0;color:#c9c7bd;max-width:760px;line-height:1.55}.pill{display:inline-block;border:1px solid #5f6855;border-radius:999px;padding:6px 10px;color:#cdd9c2;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}.notice{margin:22px auto 0;max-width:1440px;padding:13px 16px;background:#fff7dd;border:1px solid #e7d697;border-radius:10px;color:#67591f;font-size:14px}.wrap{max-width:1440px;margin:0 auto;padding:26px 24px 70px}.card{display:grid;grid-template-columns:minmax(310px,390px) minmax(640px,1fr);gap:28px;align-items:start;background:#fff;border:1px solid #dcdad1;border-radius:18px;padding:24px;margin:0 0 28px;box-shadow:0 8px 28px rgba(30,28,20,.06)}.meta{position:sticky;top:18px}.eyebrow{font-size:11px;color:#6a7d56;text-transform:uppercase;letter-spacing:.1em;font-weight:800}.meta h2{font-size:24px;letter-spacing:-.025em;margin:8px 0 22px}.meta dl{margin:0}.meta dt{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8c897f;font-weight:800;margin-top:16px}.meta dd{margin:5px 0 0;line-height:1.45}.meta label{display:block;margin:10px 0;color:#555248;font-size:14px}.links{font-size:14px;margin:20px 0}.links a{color:#546445;font-weight:650}.device{background:#d5d3ca;border-radius:14px;padding:18px;overflow:hidden}.device iframe{display:block;width:100%;height:940px;border:0;border-radius:8px;background:white}@media(max-width:980px){.card{grid-template-columns:1fr}.meta{position:static}.device{padding:8px}.device iframe{height:900px}}@media print{.top{background:#fff;color:#111}.top p{color:#444}.notice{display:none}.card{break-before:page;display:block;box-shadow:none}.meta{position:static}.device{margin-top:20px;padding:0}.device iframe{height:1000px}}
</style></head><body>
<header class="top"><span class="pill">Approval pack · no emails sent</span><h1>PlanNplate lifecycle emails</h1><p>Six rendered messages from the production template code: four weekly campaigns, the monthly meal story, and its forgotten-favourite fallback. Example data is realistic but fictional.</p></header>
<div class="notice">CTA and unsubscribe URLs use a deliberately non-production preview domain. They are shown for visual approval only.</div>
<main class="wrap">${cards.join('\n')}</main></body></html>`;

await Deno.writeTextFile('index.html', index);
console.log(`Generated ${previews.length} approval previews.`);
