// Tests for the engagement decision logic.
//
//   cd mobile/supabase/functions && deno test --allow-env _shared/
//
// `--allow-env` is only needed because the link builders read the public base
// URL from the environment, the same way they will in production.
//
// The bias throughout is toward asserting the SILENT cases. Every rule here
// exists to stop an email going out, and a regression that makes the engine
// too chatty is the expensive kind — email unsubscribes are permanent.

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  ctaRecipeId,
  isNthWeekdayOfMonth,
  isoWeekKey,
  localClock,
  meetsMinData,
  monthKey,
  passesTrigger,
  previousMonthStart,
  templateVars,
  toMinutes,
} from './engagement-rules.ts';

import {
  aggregateIngredients,
  clickUrl,
  deepLinkFor,
  isCtaTarget,
  renderTemplate,
  unsubscribeUrl,
} from './engagement-email.ts';
import { renderApprovalPack } from './engagement-approval.ts';

// ── Local time ─────────────────────────────────────────────────────────────

Deno.test('localClock resolves a zone east of UTC', () => {
  // 2026-08-29 is a Saturday. 23:30 UTC is Sunday morning in Sydney.
  const clock = localClock(new Date('2026-08-29T23:30:00Z'), 'Australia/Sydney');
  assertEquals(clock.date, '2026-08-30');
  assertEquals(clock.dow, 0); // Sunday
  assertEquals(clock.minutes, 9 * 60 + 30);
});

Deno.test('localClock resolves a zone west of UTC', () => {
  // Same instant is still Saturday evening in New York — the exact case that
  // makes a server-timezone calculation wrong.
  const clock = localClock(new Date('2026-08-29T23:30:00Z'), 'America/New_York');
  assertEquals(clock.date, '2026-08-29');
  assertEquals(clock.dow, 6); // Saturday
  assertEquals(clock.minutes, 19 * 60 + 30);
});

Deno.test('localClock falls back to UTC on a bad zone rather than throwing', () => {
  const clock = localClock(new Date('2026-08-29T09:15:00Z'), 'Not/AZone');
  assertEquals(clock.date, '2026-08-29');
  assertEquals(clock.minutes, 9 * 60 + 15);
});

Deno.test('localClock handles a DST transition', () => {
  // London is UTC+1 in August.
  const summer = localClock(new Date('2026-08-29T09:00:00Z'), 'Europe/London');
  assertEquals(summer.minutes, 10 * 60);
  // ...and UTC+0 in January.
  const winter = localClock(new Date('2026-01-10T09:00:00Z'), 'Europe/London');
  assertEquals(winter.minutes, 9 * 60);
});

Deno.test('toMinutes parses both time shapes Postgres may return', () => {
  assertEquals(toMinutes('09:00'), 540);
  assertEquals(toMinutes('10:30:00'), 630);
});

// ── Period keys ────────────────────────────────────────────────────────────

Deno.test('isoWeekKey is stable across a Monday-anchored week', () => {
  // Mon 2026-08-24 → Sun 2026-08-30 is one ISO week.
  const monday = isoWeekKey('2026-08-24');
  assertEquals(isoWeekKey('2026-08-29'), monday);
  assertEquals(isoWeekKey('2026-08-30'), monday);
  // The next day starts a new one.
  assert(isoWeekKey('2026-08-31') !== monday);
});

Deno.test('isoWeekKey rolls the year at the boundary', () => {
  // 2026-12-31 is a Thursday, which ISO puts in week 53 of 2026.
  assertEquals(isoWeekKey('2026-12-31'), '2026-W53');
  // 2027-01-01 is a Friday — same ISO week.
  assertEquals(isoWeekKey('2027-01-01'), '2026-W53');
});

Deno.test('previousMonthStart wraps January back to December', () => {
  assertEquals(previousMonthStart('2026-09-02'), '2026-08-01');
  assertEquals(previousMonthStart('2026-01-07'), '2025-12-01');
  assertEquals(monthKey(previousMonthStart('2026-01-07')), '2025-12');
});

Deno.test('isNthWeekdayOfMonth identifies the first weekday of a month', () => {
  const at = (dayOfMonth: number) => ({ date: '', dow: 3, minutes: 0, dayOfMonth });
  assert(isNthWeekdayOfMonth(at(1), 1));
  assert(isNthWeekdayOfMonth(at(7), 1));
  assert(!isNthWeekdayOfMonth(at(8), 1));
  assert(isNthWeekdayOfMonth(at(8), 2));
  assert(isNthWeekdayOfMonth(at(14), 2));
});

// ── Minimum data ───────────────────────────────────────────────────────────

Deno.test('meetsMinData blocks a month with too little in it', () => {
  const min = {
    planned_meal_count_min: 8,
    distinct_recipe_count_min: 4,
    active_weeks_min: 2,
  };
  assertEquals(
    meetsMinData(min, { planned_meal_count: 3, distinct_recipe_count: 3, active_weeks: 1 }),
    'month_too_thin',
  );
  // Enough meals, but the same dish over and over — no story to tell.
  assertEquals(
    meetsMinData(min, { planned_meal_count: 10, distinct_recipe_count: 2, active_weeks: 3 }),
    'month_too_repetitive',
  );
  // One busy day is not a month.
  assertEquals(
    meetsMinData(min, { planned_meal_count: 10, distinct_recipe_count: 6, active_weeks: 1 }),
    'month_not_active_enough',
  );
  assertEquals(
    meetsMinData(min, { planned_meal_count: 10, distinct_recipe_count: 6, active_weeks: 3 }),
    null,
  );
});

Deno.test('meetsMinData requires a finished week before calling one unfinished', () => {
  const min = { planned_count_min: 1, requires_complete_prior_week: true };
  assertEquals(
    meetsMinData(min, { planned_count: 2, has_complete_prior_week: false }),
    'no_complete_prior_week',
  );
  assertEquals(meetsMinData(min, { planned_count: 2, has_complete_prior_week: true }), null);
});

Deno.test('meetsMinData ignores thresholds a campaign does not set', () => {
  assertEquals(meetsMinData({}, {}), null);
});

// ── Triggers ───────────────────────────────────────────────────────────────

Deno.test('plan_unfinished stays quiet when the week is already done', () => {
  const t = (planned: number, typical: number) =>
    passesTrigger('weekly_plan_unfinished', { planned_count: planned, typical_count: typical });

  assertEquals(t(0, 5), 'nothing_started');
  // No history to compare against — we don't know what "finished" means here.
  assertEquals(t(2, 0), 'no_baseline');
  // Already at their usual number. Telling this person they're behind would be
  // telling them something untrue.
  assertEquals(t(5, 5), 'week_already_complete');
  assertEquals(t(6, 5), 'week_already_complete');
  assertEquals(t(3, 5), null);
});

Deno.test('grocery_ready counts recipes, not decided slots', () => {
  // A week padded with "Leftovers · X" placeholders is fully PLANNED but has
  // nothing to shop for. Found in production: users routinely fill every lunch
  // this way, so keying this campaign off planned_count would promise a
  // shopping list that doesn't exist.
  const leftoversWeek = {
    planned_count: 13,
    planned_recipe_count: 2,
    grocery_covered: false,
    saved_list_since_plan: false,
    planned_ingredients: [{ ingredients: [{ name: 'onion' }] }],
  };
  assertEquals(passesTrigger('weekly_grocery_ready', leftoversWeek), 'not_enough_planned');
  assertEquals(
    meetsMinData({ planned_recipe_count_min: 3 }, leftoversWeek),
    'below_planned_recipe_count_min',
  );
});

Deno.test('grocery_ready stays quiet once the list exists in any form', () => {
  const base = {
    planned_count: 4,
    planned_recipe_count: 4,
    grocery_covered: false,
    saved_list_since_plan: false,
    planned_ingredients: [{ ingredients: [{ name: 'onion' }] }],
  };
  assertEquals(passesTrigger('weekly_grocery_ready', base), null);
  assertEquals(
    passesTrigger('weekly_grocery_ready', { ...base, grocery_covered: true }),
    'list_already_started',
  );
  assertEquals(
    passesTrigger('weekly_grocery_ready', { ...base, saved_list_since_plan: true }),
    'list_already_saved',
  );
  assertEquals(
    passesTrigger('weekly_grocery_ready', { ...base, planned_recipe_count: 2 }),
    'not_enough_planned',
  );
  // The list is the entire value of this email. Nothing to print, nothing to send.
  assertEquals(
    passesTrigger('weekly_grocery_ready', { ...base, planned_ingredients: [{ ingredients: [] }] }),
    'no_ingredient_data',
  );
});

Deno.test('plan_next_week refuses to nag without a head start', () => {
  assertEquals(
    passesTrigger('weekly_plan_next_week', { planned_count: 0, repeat_candidates: [] }),
    'no_head_start',
  );
  assertEquals(
    passesTrigger('weekly_plan_next_week', {
      planned_count: 0,
      repeat_candidates: [{ name: 'Laksa' }],
    }),
    null,
  );
  // They've already started — this campaign has nothing to offer.
  assertEquals(
    passesTrigger('weekly_plan_next_week', {
      planned_count: 2,
      repeat_candidates: [{ name: 'Laksa' }],
    }),
    'already_planning',
  );
});

// ── Templates ──────────────────────────────────────────────────────────────

Deno.test('renderTemplate fills known tokens and clears unknown ones', () => {
  assertEquals(
    renderTemplate('Next week is {{planned_count}} of {{typical_count}} planned', {
      planned_count: 3,
      typical_count: 5,
    }),
    'Next week is 3 of 5 planned',
  );
  // A campaign row referencing a variable that doesn't exist must not leak
  // "{{mystery}}" into somebody's subject line.
  assertEquals(renderTemplate('Hello {{mystery}} there', {}), 'Hello there');
});

Deno.test('renderTemplate treats zero as a value, not a blank', () => {
  assertEquals(renderTemplate('{{orphan_count}} left', { orphan_count: 0 }), '0 left');
});

Deno.test('templateVars degrades to empty strings rather than "undefined"', () => {
  const vars = templateVars({});
  assertEquals(vars.repeat_candidate_1, '');
  assertEquals(vars.most_planned_recipe, '');
  assertEquals(vars.planned_count, 0);
  // The failure this guards against: "Start next week with undefined".
  assertEquals(renderTemplate('Start next week with {{repeat_candidate_1}}', vars).includes('undefined'), false);
});

// ── CTA allowlist ──────────────────────────────────────────────────────────

Deno.test('isCtaTarget accepts only the allowlist', () => {
  for (const t of ['plan', 'grocery', 'recipe', 'recipes', 'profile']) {
    assert(isCtaTarget(t), `${t} should be allowed`);
  }
  assert(!isCtaTarget('https://evil.example.com'));
  assert(!isCtaTarget('../../etc/passwd'));
  assert(!isCtaTarget(''));
  assert(!isCtaTarget(null));
});

Deno.test('deepLinkFor builds triple-slash scheme URLs expo-router can route', () => {
  assertEquals(deepLinkFor('plan'), 'plannplate:///plan-meals');
  assertEquals(deepLinkFor('grocery'), 'plannplate:///grocery');
  assertEquals(
    deepLinkFor('recipe', '123e4567-e89b-12d3-a456-426614174000'),
    'plannplate:///recipe-detail?id=123e4567-e89b-12d3-a456-426614174000',
  );
  // A recipe target with no recipe falls back to the library instead of
  // producing a detail screen with no id.
  assertEquals(deepLinkFor('recipe', null), 'plannplate:///recipes');
});

Deno.test('deepLinkFor threads the send id through for funnel attribution', () => {
  assertEquals(
    deepLinkFor('plan', null, 'send-123'),
    'plannplate:///plan-meals?pnp_send=send-123',
  );
  // Must not clobber the recipe id when both are present.
  assertEquals(
    deepLinkFor('recipe', 'abc', 'send-123'),
    'plannplate:///recipe-detail?id=abc&pnp_send=send-123',
  );
});

Deno.test('clickUrl is always https and carries no email address', () => {
  Deno.env.set('ENGAGEMENT_PUBLIC_BASE_URL', 'https://example.test/functions/v1');
  const url = clickUrl('123e4567-e89b-12d3-a456-426614174000', 'grocery');
  // Not a custom scheme: mail clients strip or refuse to linkify `plannplate://`,
  // which is the whole reason engagement-click exists.
  assert(url.startsWith('https://'), 'CTAs must be https');
  assert(url.includes('t=grocery'));
  // Addresses in URLs leak via referrers, proxies and history.
  assert(!url.includes('@'));
});

Deno.test('unsubscribeUrl carries an opaque token, not an address', () => {
  Deno.env.set('ENGAGEMENT_PUBLIC_BASE_URL', 'https://example.test/functions/v1');
  const url = unsubscribeUrl('123e4567-e89b-12d3-a456-426614174000', 'weekly');
  assert(url.startsWith('https://'));
  assert(url.includes('p=weekly'));
  assert(!url.includes('@'));
});

Deno.test('ctaRecipeId points the rediscovery variant at the dormant favourite', () => {
  assertEquals(
    ctaRecipeId('monthly_meal_story', 'rediscovery', { dormant_favourite: { id: 'abc' } }),
    'abc',
  );
  assertEquals(
    ctaRecipeId('weekly_saved_rediscovery', 'default', { orphan_recipes: [{ id: 'xyz' }] }),
    'xyz',
  );
  assertEquals(ctaRecipeId('weekly_grocery_ready', 'default', {}), null);
});

// ── Ingredient aggregation ─────────────────────────────────────────────────

Deno.test('aggregateIngredients sums matching base units across recipes', () => {
  const out = aggregateIngredients([
    { ingredients: [{ name: 'Chicken', quantity_base: 500, base_unit: 'g', category: 'meat' }] },
    { ingredients: [{ name: 'chicken', quantity_base: 600, base_unit: 'g', category: 'meat' }] },
  ]);
  assertEquals(out.length, 1);
  assertEquals(out[0].display, '1.1 kg');
});

Deno.test('aggregateIngredients keeps mismatched unit types visible instead of guessing', () => {
  // "500 g tomato" and "2 pieces tomato" cannot be summed without an average
  // weight, and inventing one puts a wrong number on a shopping list.
  const out = aggregateIngredients([
    { ingredients: [{ name: 'tomato', quantity_base: 500, base_unit: 'g', category: 'produce' }] },
    {
      ingredients: [
        { name: 'tomato', quantity_base: 2, base_unit: 'piece', quantity: '2', unit: 'piece', category: 'produce' },
      ],
    },
  ]);
  assertEquals(out.length, 1);
  assert(out[0].display.includes('500 g'));
  assert(out[0].display.includes('2 piece'));
});

Deno.test('aggregateIngredients orders by shopping aisle', () => {
  const out = aggregateIngredients([
    {
      ingredients: [
        { name: 'Milk', quantity_base: 500, base_unit: 'ml', category: 'dairy' },
        { name: 'Rice', quantity_base: 500, base_unit: 'g', category: 'pantry' },
        { name: 'Spinach', quantity_base: 200, base_unit: 'g', category: 'produce' },
      ],
    },
  ]);
  assertEquals(out.map((i) => i.category), ['produce', 'dairy', 'pantry']);
});

Deno.test('aggregateIngredients survives missing and malformed entries', () => {
  const out = aggregateIngredients([
    { ingredients: null },
    {},
    { ingredients: [{ name: '   ' }] },
    { ingredients: [{ name: 'Salt', quantity: '1', unit: 'pinch', category: 'pantry' }] },
  ]);
  assertEquals(out.length, 1);
  assertEquals(out[0].name, 'Salt');
  assertEquals(out[0].display, '1 pinch');
});

Deno.test('aggregateIngredients converts to friendly metric', () => {
  const litres = aggregateIngredients([
    { ingredients: [{ name: 'Stock', quantity_base: 1500, base_unit: 'ml', category: 'pantry' }] },
  ]);
  assertEquals(litres[0].display, '1.5 L');

  // Grams round to the nearest 5 — nobody weighs out 127 g of anything.
  const grams = aggregateIngredients([
    { ingredients: [{ name: 'Flour', quantity_base: 127, base_unit: 'g', category: 'pantry' }] },
  ]);
  assertEquals(grams[0].display, '125 g');
});

Deno.test('approval pack renders every planned email without production data', () => {
  Deno.env.set('ENGAGEMENT_PUBLIC_BASE_URL', 'https://example.test/functions/v1');
  const pack = renderApprovalPack('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assertEquals(pack.length, 6);
  assertEquals(new Set(pack.map((message) => message.sendId)).size, 6);
  assert(pack.every((message) => message.subject.startsWith('[APPROVAL TEST]')));
  assert(pack.every((message) => message.html.includes('https://example.test/functions/v1/engagement-click')));
  assert(pack.every((message) => message.html.includes('engagement-unsubscribe')));
});
