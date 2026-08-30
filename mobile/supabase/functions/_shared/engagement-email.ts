// Engagement email — the weekly and monthly lifecycle messages.
//
// Kept separate from support-email.ts (quiet, person-shaped) and from
// email-send/index.ts (transactional welcome/reset templates). This one is a
// third thing: a composed page. A weekly send carries a hero block that
// justifies the interruption plus up to two supporting blocks that make it
// worth reading once opened.
//
// THE POINT OF RICH EMAIL: a user who declined the push permission receives
// nothing from PlanNplate today — every daily reminder is a local notification
// behind that permission. For them this email is the entire relationship, so
// it has to be useful in the inbox, not just a knock on the door. That is why
// the grocery block prints the actual list and the plan block prints the
// actual week.
//
// HTML RULES (learned the hard way by everyone who has ever sent email):
//   • Tables for layout. No flex, no grid — Outlook renders neither.
//   • Inline styles only. <style> blocks are stripped by Gmail's clipper.
//   • ~600px max width.
//   • Every block ships a plain-text equivalent. Some people read text/plain,
//     and spam filters distrust HTML-only mail.
//   • No background images, no web fonts.

import {
  clickUrl,
  esc,
  unsubscribeUrl,
  type CtaTarget,
} from './engagement-links.ts';

// Re-exported so existing importers (and the tests) keep one entry point,
// while engagement-click can depend on the small links module alone rather
// than pulling this whole template engine into its bundle.
export {
  clickUrl,
  CTA_TARGETS,
  deepLinkFor,
  esc,
  isCtaTarget,
  publicBase,
  unsubscribeUrl,
  type CtaTarget,
} from './engagement-links.ts';

// ── Brand ──────────────────────────────────────────────────────────────────
// Carried over from email-send/index.ts so lifecycle mail looks like the
// welcome mail the user already received.
const SAGE = '#6a7d56';
const SAGE_DARK = '#546445';
const INK = '#15140F';
const MUTED = '#9A968B';
const HAIRLINE = '#ECEAE2';
const PAPER = '#FFFFFF';
const WASH = '#F7F6F1';

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Sender for engagement mail ONLY. */
export function engagementFrom(): string {
  return (
    Deno.env.get('ENGAGEMENT_FROM') ||
    'PlanNplate <hello@news.plannplate.com.au>'
  );
}

/**
 * Postal address, required in the footer by CAN-SPAM and good practice under
 * the Australian Spam Act. Configurable so it can be corrected without a
 * deploy — but it must never be empty in production.
 */
function postalAddress(): string {
  return Deno.env.get('ENGAGEMENT_POSTAL_ADDRESS') || 'PlanNplate, Australia';
}


/** Strip HTML-ish characters for the plain-text alternative. */
function plain(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

// ── Small components ───────────────────────────────────────────────────────

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px;">
  <tr><td style="background:${SAGE};border-radius:10px;">
    <a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(label)}</a>
  </td></tr>
</table>`;
}

/**
 * Recipe thumbnail, or a lettered tile when there is no image.
 *
 * `recipes.image_url` is frequently null (custom meals, quick adds), and a
 * broken-image icon in an inbox looks like a broken product.
 */
function thumb(name: string, imageUrl: string | null | undefined, size = 56): string {
  if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
    return `<img src="${esc(imageUrl)}" width="${size}" height="${size}" alt="" style="display:block;width:${size}px;height:${size}px;border-radius:8px;object-fit:cover;border:0;" />`;
  }
  const letter = esc((name || '?').trim().charAt(0).toUpperCase());
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:${size}px;height:${size}px;background:${WASH};border-radius:8px;">
  <tr><td align="center" style="font-family:${FONT};font-size:${Math.round(size / 2.6)}px;font-weight:600;color:${SAGE};">${letter}</td></tr>
</table>`;
}

function recipeRow(
  name: string,
  imageUrl: string | null | undefined,
  meta: string,
  href: string,
): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 10px;">
  <tr>
    <td width="56" valign="top" style="padding-right:12px;">${thumb(name, imageUrl)}</td>
    <td valign="middle" style="font-family:${FONT};">
      <a href="${esc(href)}" style="font-size:15.5px;font-weight:600;color:${INK};text-decoration:none;">${esc(name)}</a>
      ${meta ? `<div style="font-size:13px;color:${MUTED};margin-top:3px;">${esc(meta)}</div>` : ''}
    </td>
  </tr>
</table>`;
}

function sectionHeading(text: string): string {
  return `<p style="margin:26px 0 10px;font-family:${FONT};font-size:11.5px;letter-spacing:.09em;text-transform:uppercase;color:${SAGE};font-weight:700;">${esc(text)}</p>`;
}

// ── Ingredient aggregation ─────────────────────────────────────────────────

export interface RawIngredient {
  name?: string;
  quantity?: string | number;
  unit?: string;
  category?: string;
  quantity_base?: number;
  base_unit?: string;
}

/**
 * Combine the ingredients of several recipes into one shopping list.
 *
 * This is a deliberately REDUCED version of the app's pipeline
 * (src/lib/intelligent-aggregation.ts and friends). It relies on the
 * `quantity_base` / `base_unit` fields that the app's ingredient validator
 * already writes onto every stored ingredient, so all it has to do is group
 * and sum — it does not re-derive unit conversions, and it does not attempt
 * the count-to-weight lookup the app performs.
 *
 * Consequence, stated plainly: an email list can differ slightly from the
 * in-app list for ingredients recorded in mixed unit types. That is why the
 * block is labelled a preview and the CTA opens the real, tickable list.
 * Anything that cannot be summed confidently is listed separately rather than
 * being guessed at — a wrong quantity in a shopping list is worse than two
 * lines.
 */
export function aggregateIngredients(
  groups: Array<{ ingredients?: RawIngredient[] | null }>,
): Array<{ name: string; display: string; category: string }> {
  const byKey = new Map<
    string,
    { name: string; category: string; base: number; baseUnit: string | null; loose: string[] }
  >();

  for (const group of groups) {
    for (const ing of group?.ingredients ?? []) {
      const rawName = String(ing?.name ?? '').trim();
      if (!rawName) continue;

      const key = rawName.toLowerCase();
      const entry = byKey.get(key) ?? {
        name: rawName,
        category: String(ing?.category ?? 'other'),
        base: 0,
        baseUnit: null as string | null,
        loose: [] as string[],
      };

      const baseQty = Number(ing?.quantity_base);
      const baseUnit = ing?.base_unit ? String(ing.base_unit) : null;

      if (Number.isFinite(baseQty) && baseQty > 0 && baseUnit) {
        if (entry.baseUnit === null || entry.baseUnit === baseUnit) {
          entry.baseUnit = baseUnit;
          entry.base += baseQty;
        } else {
          // Different base units for the same name (e.g. "500 g tomato" and
          // "2 piece tomato"). Don't invent a conversion — keep it visible.
          entry.loose.push(`${ing.quantity ?? ''} ${ing.unit ?? ''}`.trim());
        }
      } else {
        const q = `${ing.quantity ?? ''} ${ing.unit ?? ''}`.trim();
        if (q) entry.loose.push(q);
      }

      byKey.set(key, entry);
    }
  }

  const out: Array<{ name: string; display: string; category: string }> = [];
  for (const e of byKey.values()) {
    const parts: string[] = [];
    if (e.baseUnit && e.base > 0) parts.push(formatBase(e.base, e.baseUnit));
    if (e.loose.length) parts.push(e.loose.join(' + '));
    out.push({
      name: e.name,
      display: parts.join(' + ') || '',
      category: e.category,
    });
  }

  // Group by aisle, then alphabetically — the order someone actually shops in.
  const order = ['produce', 'meat', 'dairy', 'bakery', 'frozen', 'pantry', 'other'];
  out.sort((a, b) => {
    const ai = order.indexOf(a.category);
    const bi = order.indexOf(b.category);
    if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    return a.name.localeCompare(b.name);
  });
  return out;
}

/**
 * Metric-only display, matching the app's rule that base units are ml, g and
 * piece and that imperial never appears.
 */
function formatBase(qty: number, unit: string): string {
  const round = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));
  if (unit === 'g') return qty >= 1000 ? `${round(qty / 1000)} kg` : `${round(Math.round(qty / 5) * 5)} g`;
  if (unit === 'ml') return qty >= 1000 ? `${round(qty / 1000)} L` : `${round(Math.round(qty / 5) * 5)} mL`;
  return `${round(qty)}${unit === 'piece' ? '' : ` ${unit}`}`;
}

// ── Blocks ─────────────────────────────────────────────────────────────────

export interface BlockContext {
  sendId: string;
  signals: Record<string, any>;
  ctaTarget: CtaTarget;
  ctaLabel: string;
  /** Recipe the CTA points at, when the campaign is recipe-specific. */
  ctaRecipeId?: string | null;
}

export interface RenderedBlock {
  html: string;
  text: string;
}

type BlockFn = (ctx: BlockContext) => RenderedBlock | null;

const DOW_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** W1 — the week grid, with the gaps made obvious. */
const heroPlanUnfinished: BlockFn = (ctx) => {
  const s = ctx.signals;
  const slots: any[] = Array.isArray(s.planned_slots) ? s.planned_slots : [];
  const planHref = clickUrl(ctx.sendId, 'plan');

  const byDate = new Map<string, any[]>();
  for (const slot of slots) {
    const list = byDate.get(slot.date) ?? [];
    list.push(slot);
    byDate.set(slot.date, list);
  }

  const start = new Date(`${s.week_start}T00:00:00Z`);
  const rows: string[] = [];
  const textRows: string[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const dayLabel = DOW_LABEL[i];
    const items = byDate.get(key) ?? [];

    if (items.length) {
      const names = items.map((x) => x.name).filter(Boolean).join(' · ');
      rows.push(`<tr>
  <td width="46" style="padding:9px 0;font-family:${FONT};font-size:13px;font-weight:700;color:${SAGE};">${dayLabel}</td>
  <td style="padding:9px 0;font-family:${FONT};font-size:14.5px;color:${INK};border-bottom:1px solid ${HAIRLINE};">${esc(names)}</td>
</tr>`);
      textRows.push(`  ${dayLabel}: ${plain(names)}`);
    } else {
      rows.push(`<tr>
  <td width="46" style="padding:9px 0;font-family:${FONT};font-size:13px;font-weight:700;color:${MUTED};">${dayLabel}</td>
  <td style="padding:9px 0;font-family:${FONT};font-size:14.5px;border-bottom:1px solid ${HAIRLINE};">
    <a href="${esc(planHref)}" style="color:${MUTED};text-decoration:none;">— add a meal</a>
  </td>
</tr>`);
      textRows.push(`  ${dayLabel}: —`);
    }
  }

  const html = `<p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};">
  ${s.first_name ? `${esc(s.first_name)}, y` : 'Y'}ou've got <strong>${esc(s.planned_count)}</strong> of your usual <strong>${esc(s.typical_count)}</strong> meals down for next week. Here's where it stands:
</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows.join('')}</table>
${button(planHref, ctx.ctaLabel)}`;

  const text = `You've got ${s.planned_count} of your usual ${s.typical_count} meals down for next week.

${textRows.join('\n')}

${ctx.ctaLabel}: ${planHref}`;

  return { html, text };
};

/** W2 — the actual shopping list, in the inbox. */
const heroGroceryReady: BlockFn = (ctx) => {
  const s = ctx.signals;
  const groups: any[] = Array.isArray(s.planned_ingredients) ? s.planned_ingredients : [];
  const items = aggregateIngredients(groups).slice(0, 40);
  if (items.length === 0) return null;

  const groceryHref = clickUrl(ctx.sendId, 'grocery');

  let currentCategory = '';
  const rows: string[] = [];
  const textRows: string[] = [];
  for (const item of items) {
    if (item.category !== currentCategory) {
      currentCategory = item.category;
      rows.push(`<tr><td colspan="2" style="padding:14px 0 4px;font-family:${FONT};font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};font-weight:700;">${esc(currentCategory)}</td></tr>`);
      textRows.push(`\n  ${currentCategory.toUpperCase()}`);
    }
    rows.push(`<tr>
  <td style="padding:6px 0;font-family:${FONT};font-size:14.5px;color:${INK};border-bottom:1px solid ${HAIRLINE};">${esc(item.name)}</td>
  <td align="right" style="padding:6px 0;font-family:${FONT};font-size:13.5px;color:${MUTED};border-bottom:1px solid ${HAIRLINE};white-space:nowrap;">${esc(item.display)}</td>
</tr>`);
    textRows.push(`    ${plain(item.name)}${item.display ? ` — ${plain(item.display)}` : ''}`);
  }

  // planned_recipe_count, not planned_count: only recipe-bearing slots have
  // ingredients. A week padded with "Leftovers · X" is fully planned but has
  // nothing to shop for, and quoting the larger number would promise a list
  // longer than the one below it.
  const recipeCount = s.planned_recipe_count ?? s.planned_count;
  const html = `<p style="margin:0 0 6px;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};">
  You've planned <strong>${esc(recipeCount)}</strong> meals for next week but haven't built the list yet. Here it is — everything combined across all ${esc(recipeCount)} recipes.
</p>
<p style="margin:0 0 4px;font-family:${FONT};font-size:13px;color:${MUTED};">Shop from this, or open the app to tick items off as you go.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows.join('')}</table>
${button(groceryHref, ctx.ctaLabel)}`;

  const text = `You've planned ${recipeCount} meals for next week but haven't built the list yet.
Everything combined:
${textRows.join('\n')}

${ctx.ctaLabel}: ${groceryHref}`;

  return { html, text };
};

/** W3 — the head start. Never renders without candidates. */
const heroPlanNextWeek: BlockFn = (ctx) => {
  const s = ctx.signals;
  const candidates: any[] = Array.isArray(s.repeat_candidates) ? s.repeat_candidates : [];
  if (candidates.length === 0) return null;

  const planHref = clickUrl(ctx.sendId, 'plan');
  const rows = candidates
    .map((c) =>
      recipeRow(
        c.name,
        c.image_url,
        c.prep_time ? `${c.prep_time} min` : '',
        clickUrl(ctx.sendId, 'recipe', c.id),
      ),
    )
    .join('');

  const html = `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};">
  Next week is still empty${s.first_name ? `, ${esc(s.first_name)}` : ''}. You don't have to start from scratch — these went down well recently:
</p>
${rows}
${button(planHref, ctx.ctaLabel)}`;

  const text = `Next week is still empty. These went down well recently:
${candidates.map((c) => `  • ${plain(c.name)}`).join('\n')}

${ctx.ctaLabel}: ${planHref}`;

  return { html, text };
};

/** W4 — saved, never planned. */
const heroRediscovery: BlockFn = (ctx) => {
  const s = ctx.signals;
  const orphans: any[] = Array.isArray(s.orphan_recipes) ? s.orphan_recipes : [];
  if (orphans.length === 0) return null;

  const [first, ...rest] = orphans;
  const firstHref = clickUrl(ctx.sendId, 'recipe', first.id);

  const html = `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};">
  You saved <strong>${esc(first.name)}</strong> ${esc(first.days_since_saved)} days ago and haven't planned it yet.
</p>
${recipeRow(first.name, first.image_url, first.prep_time ? `${first.prep_time} min` : '', firstHref)}
${
    rest.length
      ? `${sectionHeading(`${rest.length} more waiting`)}${rest
          .map((r) => recipeRow(r.name, r.image_url, `saved ${r.days_since_saved} days ago`, clickUrl(ctx.sendId, 'recipe', r.id)))
          .join('')}`
      : ''
  }
${button(firstHref, ctx.ctaLabel)}`;

  const text = `You saved ${plain(first.name)} ${first.days_since_saved} days ago and haven't planned it yet.
${rest.map((r) => `  • ${plain(r.name)} — saved ${r.days_since_saved} days ago`).join('\n')}

${ctx.ctaLabel}: ${firstHref}`;

  return { html, text };
};

/** M1 — the month, Wrapped-shaped, ending in one forward action. */
const heroMonthlyStory: BlockFn = (ctx) => {
  const s = ctx.signals;
  const top = s.most_planned_recipe;
  const planHref = clickUrl(ctx.sendId, 'plan');

  const stat = (value: string | number, label: string) =>
    `<td width="33%" align="center" style="padding:16px 6px;font-family:${FONT};">
      <div style="font-size:28px;font-weight:700;color:${SAGE};line-height:1.1;">${esc(value)}</div>
      <div style="font-size:12px;color:${MUTED};margin-top:5px;">${esc(label)}</div>
    </td>`;

  const extras: string[] = [];
  const textExtras: string[] = [];
  if (s.favourite_cuisine) {
    extras.push(`<li style="margin-bottom:7px;">You leaned <strong>${esc(s.favourite_cuisine)}</strong> more than anything else.</li>`);
    textExtras.push(`  • You leaned ${plain(s.favourite_cuisine)} more than anything else.`);
  }
  if (typeof s.cooked_count === 'number' && s.cooked_count > 0) {
    extras.push(`<li style="margin-bottom:7px;">You logged <strong>${esc(s.cooked_count)}</strong> of them as actually cooked.</li>`);
    textExtras.push(`  • You logged ${s.cooked_count} of them as actually cooked.`);
  }
  if (typeof s.usual_plan_dow === 'number') {
    const label = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][s.usual_plan_dow];
    extras.push(`<li style="margin-bottom:7px;"><strong>${esc(label)}</strong> is when you usually sit down to plan.</li>`);
    textExtras.push(`  • ${label} is when you usually sit down to plan.`);
  }
  if (typeof s.new_recipe_count === 'number' && s.new_recipe_count > 0) {
    extras.push(`<li style="margin-bottom:7px;"><strong>${esc(s.new_recipe_count)}</strong> new recipes joined your library.</li>`);
    textExtras.push(`  • ${s.new_recipe_count} new recipes joined your library.`);
  }

  const html = `<p style="margin:0 0 4px;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};">
  Here's what ${esc(s.month_name)} looked like${s.first_name ? `, ${esc(s.first_name)}` : ''}.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${WASH};border-radius:12px;margin:16px 0 8px;">
  <tr>
    ${stat(s.planned_meal_count ?? 0, 'meals planned')}
    ${stat(s.distinct_recipe_count ?? 0, 'different recipes')}
    ${stat(s.library_count ?? 0, 'in your library')}
  </tr>
</table>
${
    top
      ? `${sectionHeading('Your most-cooked dish')}
${recipeRow(top.name, top.image_url, `planned ${top.count} times`, clickUrl(ctx.sendId, 'recipe', top.id))}`
      : ''
  }
${
    extras.length
      ? `${sectionHeading('Also worth knowing')}<ul style="margin:0;padding-left:20px;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK};">${extras.join('')}</ul>`
      : ''
  }
<p style="margin:24px 0 0;font-family:${FONT};font-size:15.5px;line-height:1.6;color:${INK};">
  Next month doesn't need starting from scratch — build it from what already works.
</p>
${button(planHref, ctx.ctaLabel)}`;

  const text = `Here's what ${plain(s.month_name)} looked like.

  ${s.planned_meal_count ?? 0} meals planned
  ${s.distinct_recipe_count ?? 0} different recipes
  ${s.library_count ?? 0} recipes in your library
${top ? `\n  Most-cooked: ${plain(top.name)} — planned ${top.count} times` : ''}
${textExtras.join('\n')}

${ctx.ctaLabel}: ${planHref}`;

  return { html, text };
};

/** M1 fallback — not enough month to summarise, but a favourite went quiet. */
const heroMonthlyRediscovery: BlockFn = (ctx) => {
  const s = ctx.signals;
  const fav = s.dormant_favourite;
  if (!fav) return null;
  const href = clickUrl(ctx.sendId, 'recipe', fav.id);

  const html = `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};">
  You cooked <strong>${esc(fav.name)}</strong> ${esc(fav.cook_count)} times — and then it quietly dropped out of the rotation about ${esc(fav.gap_days)} days ago.
</p>
${recipeRow(fav.name, fav.image_url, `cooked ${fav.cook_count} times`, href)}
${button(href, 'See the recipe')}`;

  const text = `You cooked ${plain(fav.name)} ${fav.cook_count} times, then it dropped out of the rotation about ${fav.gap_days} days ago.

See the recipe: ${href}`;

  return { html, text };
};

/** Supporting — one quiet line about the week just gone. */
const recapStrip: BlockFn = (ctx) => {
  const r = ctx.signals?.recap ?? {};
  const planned = Number(r.planned_this_week ?? 0);
  if (planned < 3) return null;

  const bits = [`${planned} meals planned`];
  if (Number(r.cooked_this_week ?? 0) > 0) bits.push(`${r.cooked_this_week} cooked`);
  if (Number(r.recipes_added_this_week ?? 0) > 0) bits.push(`${r.recipes_added_this_week} recipes added`);

  return {
    html: `${sectionHeading('This week')}
<p style="margin:0;font-family:${FONT};font-size:14.5px;color:${MUTED};">${esc(bits.join(' · '))}</p>`,
    text: `\nThis week: ${bits.join(' · ')}`,
  };
};

/** Supporting — one forgotten recipe, when it isn't already the hero. */
const rediscoveryCard: BlockFn = (ctx) => {
  const orphans: any[] = Array.isArray(ctx.signals?.orphan_recipes) ? ctx.signals.orphan_recipes : [];
  if (orphans.length === 0) return null;
  const r = orphans[0];
  return {
    html: `${sectionHeading('Still in your library')}
${recipeRow(r.name, r.image_url, `saved ${r.days_since_saved} days ago, never planned`, clickUrl(ctx.sendId, 'recipe', r.id))}`,
    text: `\nStill in your library: ${plain(r.name)} — saved ${r.days_since_saved} days ago, never planned.`,
  };
};

/** Supporting — the list they already started. */
const groceryPreview: BlockFn = (ctx) => {
  const open = Number(ctx.signals?.grocery_open_items ?? 0);
  if (open < 1) return null;
  const href = clickUrl(ctx.sendId, 'grocery');
  return {
    html: `${sectionHeading('Your list')}
<p style="margin:0;font-family:${FONT};font-size:14.5px;color:${INK};">
  <a href="${esc(href)}" style="color:${SAGE_DARK};font-weight:600;text-decoration:none;">${esc(open)} item${open === 1 ? '' : 's'} still unticked →</a>
</p>`,
    text: `\nYour list: ${open} item${open === 1 ? '' : 's'} still unticked — ${href}`,
  };
};

export const BLOCKS: Record<string, BlockFn> = {
  hero_plan_unfinished: heroPlanUnfinished,
  hero_grocery_ready: heroGroceryReady,
  hero_plan_next_week: heroPlanNextWeek,
  hero_rediscovery: heroRediscovery,
  hero_monthly_story: heroMonthlyStory,
  hero_monthly_rediscovery: heroMonthlyRediscovery,
  recap_strip: recapStrip,
  rediscovery_card: rediscoveryCard,
  grocery_preview: groceryPreview,
};

// ── Shell ──────────────────────────────────────────────────────────────────

export interface ShellInput {
  preheader: string;
  blocks: RenderedBlock[];
  unsubToken: string;
  period: 'weekly' | 'monthly';
}

export function renderEmail(input: ShellInput): { html: string; text: string } {
  const unsubAll = unsubscribeUrl(input.unsubToken, 'all');
  const unsubThis = unsubscribeUrl(input.unsubToken, input.period);
  const cadence = input.period === 'weekly' ? 'weekly' : 'monthly';

  const body = input.blocks.map((b) => b.html).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>PlanNplate</title>
</head>
<body style="margin:0;padding:0;background:${WASH};">
<!-- Preheader: the grey line after the subject in most inboxes. Left empty it
     fills with whatever HTML comes first, which is never flattering. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(input.preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${WASH};">
  <tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:${PAPER};border-radius:16px;">
      <tr><td style="padding:30px 30px 8px;">
        <p style="margin:0 0 20px;font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:-.01em;color:${SAGE_DARK};">PlanNplate</p>
        ${body}
      </td></tr>
      <tr><td style="padding:26px 30px 30px;">
        <div style="border-top:1px solid ${HAIRLINE};padding-top:18px;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">
          <p style="margin:0 0 6px;">You're getting this ${esc(cadence)} email because you have a PlanNplate account. It's separate from your in-app reminders.</p>
          <p style="margin:0 0 6px;">
            <a href="${esc(unsubThis)}" style="color:${MUTED};text-decoration:underline;">Stop ${esc(cadence)} emails</a>
            &nbsp;·&nbsp;
            <a href="${esc(unsubAll)}" style="color:${MUTED};text-decoration:underline;">Unsubscribe from all</a>
          </p>
          <p style="margin:0;">${esc(postalAddress())}</p>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = `PlanNplate

${input.blocks.map((b) => b.text).join('\n\n')}

—
You're getting this ${cadence} email because you have a PlanNplate account.
Stop ${cadence} emails: ${unsubThis}
Unsubscribe from all: ${unsubAll}
${postalAddress()}`;

  return { html, text };
}

// ── Send ───────────────────────────────────────────────────────────────────

async function getResendClient() {
  // Lifecycle mail has its own restricted Resend credential. Do not fall back
  // to the shared transactional key: a missing engagement secret must stop
  // this channel without affecting welcome, reset, or support emails.
  const apiKey = Deno.env.get('ENGAGEMENT_RESEND_API_KEY');
  if (!apiKey) return null;
  const { Resend } = await import('https://esm.sh/resend@3.2.0');
  return new Resend(apiKey);
}

/**
 * Send one engagement email. Never throws.
 *
 * Same posture as sendSupportEmail: the `engagement_sends` row is written
 * before this is called and is the source of truth. A delivery failure is
 * recorded and moved past — it must never take down a batch of other users'
 * sends.
 *
 * The List-Unsubscribe headers are not optional decoration. Gmail and Yahoo
 * require them of bulk senders, and their absence is on its own enough to get
 * lifecycle mail filtered.
 */
export async function sendEngagementEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubToken: string;
  period: 'weekly' | 'monthly';
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const resend = await getResendClient();
    if (!resend) {
      console.warn('[Engagement] ENGAGEMENT_RESEND_API_KEY not set — skipping send.');
      return { ok: false, error: 'resend_not_configured' };
    }

    const { data, error } = await resend.emails.send({
      from: engagementFrom(),
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl(opts.unsubToken, 'all')}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    if (error) {
      console.error('[Engagement] Send error:', error);
      return { ok: false, error: String((error as { message?: string }).message ?? error) };
    }
    return { ok: true, id: (data as { id?: string } | null)?.id };
  } catch (e) {
    console.error('[Engagement] Unexpected send failure:', e);
    return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}

/** Fill `{{token}}` placeholders from a flat map. Unknown tokens are cleared. */
export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return template
    .replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, key: string) => {
      const v = vars[key];
      return v === undefined || v === null ? '' : String(v);
    })
    .replace(/\s{2,}/g, ' ')
    .trim();
}
