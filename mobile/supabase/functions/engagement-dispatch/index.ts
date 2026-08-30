// engagement-dispatch — decides who gets a weekly or monthly email, and sends it.
//
// Called hourly by pg_cron. Each run asks: for every timezone where it is
// currently inside a campaign's local send window, which users have accumulated
// enough for PlanNplate to have something worth saying?
//
// The default answer is silence. Every gate below is a reason NOT to send, and
// a run that mails nobody is a correct run.
//
// WHY HOURLY, NOT DAILY: sends are anchored to the user's LOCAL morning, and
// users are spread across timezones. An hourly job lets each zone be picked up
// when its own clock reaches the window. `period_key` makes re-entry harmless.
//
// SAFETY POSTURE
//   • Campaigns ship disabled. Enabling is a deliberate UPDATE.
//   • `dry_run` records the full decision and sends nothing. Use it first.
//   • The engagement_sends row is written BEFORE the send, and its unique
//     constraint on (user_id, campaign_id, period_key) is what makes scheduler
//     reruns, overlapping invocations and retries harmless.
//   • A hard per-run send ceiling. If the eligibility logic is ever wrong, it
//     is wrong for a few hundred people, not the entire user base.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { renderApprovalPack } from '../_shared/engagement-approval.ts';
import {
  BLOCKS,
  isCtaTarget,
  renderEmail,
  renderTemplate,
  sendEngagementEmail,
  type CtaTarget,
  type RenderedBlock,
} from '../_shared/engagement-email.ts';
// The decision logic lives in _shared so it can be unit-tested — this module
// calls Deno.serve at import time, so a test importing it would start a server.
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
  type LocalClock,
} from '../_shared/engagement-rules.ts';

/**
 * Service-role client.
 *
 * Wrapped in a factory so `AdminClient` can be derived from a REAL call.
 * `ReturnType<typeof createClient>` — the obvious spelling — resolves the
 * generics with no arguments and produces a different, incompatible type from
 * the one an actual `createClient(url, key, opts)` returns, which is why
 * passing a client into a helper typed that way fails to compile. Deriving
 * from the factory keeps the two in step across supabase-js versions.
 */
const makeAdmin = (url: string, key: string) =>
  createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

type AdminClient = ReturnType<typeof makeAdmin>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/**
 * Ceiling on sends per invocation. Deliberately low relative to any plausible
 * user base: the worst outcome of this system is a mass send nobody asked for,
 * and a cap turns that from a catastrophe into an incident.
 */
const MAX_SENDS_PER_RUN = Number(Deno.env.get('ENGAGEMENT_MAX_SENDS_PER_RUN') ?? 500);

/** Users pulled per timezone. Keeps memory flat. */
const USER_BATCH = 200;

interface Campaign {
  campaign_id: string;
  name: string;
  period: 'weekly' | 'monthly';
  priority: number;
  send_dow: number;
  send_nth_of_month: number | null;
  send_window_start: string;
  send_window_end: string;
  min_data: Record<string, unknown>;
  eligibility: Record<string, unknown>;
  suppression: Record<string, unknown>;
  subject_template: string;
  preheader_template: string;
  body_blocks: string[];
  cta_route: string;
  cta_label: string;
  variant: string;
  start_date: string | null;
  end_date: string | null;
}

// ── Main ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Service-to-service only. pg_cron supplies this header via pg_net.
  const expected = Deno.env.get('ENGAGEMENT_DISPATCH_SECRET');
  if (!expected) return json({ error: 'Server configuration error' }, 500);
  if (req.headers.get('x-engagement-secret') !== expected) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(req.url);
  // Default is to send. `dry_run=1` is the pre-launch validation mode: full
  // decision, full render, nothing leaves the building.
  const dryRun = url.searchParams.get('dry_run') === '1';
  // Test hooks. `only_user` restricts a run to one account; `force_now` pins
  // the clock so a Saturday campaign can be exercised on a Tuesday.
  const onlyUser = url.searchParams.get('only_user');
  const forceNow = url.searchParams.get('force_now');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server configuration error' }, 500);

  const admin = makeAdmin(supabaseUrl, serviceKey);

  // One-shot approval pack. This path is independent of campaign activation,
  // timing and eligibility. The recipient lives in the service-only singleton
  // settings row; callers cannot supply an arbitrary address. Claiming the
  // enabled flag before rendering makes retries and replayed requests inert.
  if (url.searchParams.get('approval_test') === '1') {
    return sendApprovalPack(admin);
  }

  const holder = crypto.randomUUID();
  const { data: gotLock } = await admin.rpc('engagement_acquire_lock', {
    p_holder: holder,
    p_seconds: 600,
  });
  if (!gotLock) {
    // Not an error. A previous run is still going; this one has nothing to do.
    return json({ skipped: 'dispatch_already_running' });
  }

  const now = forceNow ? new Date(forceNow) : new Date();
  const stats = {
    dry_run: dryRun,
    timezones_considered: 0,
    users_evaluated: 0,
    sent: 0,
    suppressed: 0,
    failed: 0,
    by_reason: {} as Record<string, number>,
  };
  const note = (reason: string) => {
    stats.by_reason[reason] = (stats.by_reason[reason] ?? 0) + 1;
  };

  try {
    const { data: campaignRows, error: campaignError } = await admin
      .from('engagement_campaigns')
      .select('*')
      .eq('enabled', true)
      .order('priority', { ascending: false });

    if (campaignError) throw campaignError;
    const campaigns = (campaignRows ?? []) as Campaign[];
    if (campaigns.length === 0) {
      return json({ ...stats, note: 'no_enabled_campaigns' });
    }

    // Fully server-driven cohort: create missing state rows and refresh recent
    // activity from data PlanNplate already stores. The app has no engagement
    // UI, timezone heartbeat, or lifecycle-email integration.
    const { error: cohortError } = await admin.rpc('engagement_sync_state_cohort');
    if (cohortError) throw cohortError;

    // Every distinct zone we have users in. Far cheaper than reasoning about
    // each user's clock individually.
    const { data: tzRows } = await admin
      .from('user_engagement_state')
      .select('timezone')
      .not('timezone', 'is', null);

    const timezones = [...new Set((tzRows ?? []).map((r: { timezone: string }) => r.timezone))];

    for (const tz of timezones) {
      const clock = localClock(now, tz);

      // Which campaigns are due right now, in this zone?
      const due = campaigns.filter((c) => {
        if (c.send_dow !== clock.dow) return false;
        if (clock.minutes < toMinutes(c.send_window_start)) return false;
        if (clock.minutes >= toMinutes(c.send_window_end)) return false;
        if (c.start_date && clock.date < c.start_date) return false;
        if (c.end_date && clock.date > c.end_date) return false;
        if (c.period === 'monthly') {
          const nth = c.send_nth_of_month ?? 1;
          if (!isNthWeekdayOfMonth(clock, nth)) return false;
        }
        return true;
      });

      if (due.length === 0) continue;
      stats.timezones_considered++;

      // Monthly outranks weekly when both land in the same window. In practice
      // the send days are chosen so they can't (Sat vs. first Wed), but the
      // days are configurable and this keeps the invariant if someone changes
      // them.
      due.sort((a, b) => {
        if (a.period !== b.period) return a.period === 'monthly' ? -1 : 1;
        return b.priority - a.priority;
      });

      let from = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (stats.sent >= MAX_SENDS_PER_RUN) break;

        let q = admin
          .from('user_engagement_state')
          .select('user_id, timezone, last_active_at, weekly_opt_out, monthly_opt_out, unsubscribe_token')
          .eq('timezone', tz)
          .order('user_id', { ascending: true })
          .range(from, from + USER_BATCH - 1);

        if (onlyUser) q = q.eq('user_id', onlyUser);

        const { data: states, error: statesError } = await q;
        if (statesError) throw statesError;
        if (!states || states.length === 0) break;
        from += states.length;

        for (const state of states) {
          if (stats.sent >= MAX_SENDS_PER_RUN) break;
          stats.users_evaluated++;

          const outcome = await evaluateUser({
            admin,
            state,
            clock,
            due,
            dryRun,
            now,
          });

          if (outcome.status === 'sent') stats.sent++;
          else if (outcome.status === 'failed') stats.failed++;
          else stats.suppressed++;
          if (outcome.reason) note(outcome.reason);
        }

        if (states.length < USER_BATCH) break;
      }
    }

    return json(stats);
  } catch (e) {
    console.error('[Engagement] Dispatch failed:', e);
    return json({ error: 'Dispatch failed', detail: String(e), stats }, 500);
  } finally {
    await admin.rpc('engagement_release_lock', { p_holder: holder });
  }
});

async function sendApprovalPack(admin: AdminClient): Promise<Response> {
  const { data: setting, error: claimError } = await admin
    .from('engagement_settings')
    .update({ approval_test_enabled: false, updated_at: new Date().toISOString() })
    .eq('singleton', true)
    .eq('approval_test_enabled', true)
    .not('approval_test_email', 'is', null)
    .select('approval_test_email')
    .maybeSingle();

  if (claimError) return json({ error: 'Approval setting claim failed' }, 500);
  const email = String(setting?.approval_test_email ?? '').trim().toLowerCase();
  if (!email) return json({ skipped: 'approval_test_not_enabled' }, 409);

  const { data: user, error: userError } = await admin
    .from('users')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (userError || !user?.id) return json({ error: 'Approval recipient is not a PlanNplate account' }, 400);

  // A real token makes the footer links testable. The account is opted out at
  // rest so this internal address can never drift into production eligibility.
  const { data: state, error: stateError } = await admin
    .from('user_engagement_state')
    .upsert({
      user_id: user.id,
      timezone: 'Australia/Sydney',
        timezone_source: 'server_default',
      weekly_opt_out: true,
      monthly_opt_out: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select('unsubscribe_token')
    .single();
  if (stateError || !state?.unsubscribe_token) return json({ error: 'Approval state setup failed' }, 500);

  const pack = renderApprovalPack(state.unsubscribe_token);
  const batchId = crypto.randomUUID();
  const results: Array<Record<string, unknown>> = [];

  for (const message of pack) {
    const periodKey = `approval:${batchId}:${message.variant}`;
    const { error: insertError } = await admin.from('engagement_sends').insert({
      id: message.sendId,
      user_id: user.id,
      campaign_id: message.campaignId,
      variant: message.variant,
      period_key: periodKey,
      subject: message.subject,
      blocks: message.blockKeys,
      signals: { approval_test: true, batch_id: batchId },
      status: 'would_send',
    });

    if (insertError) {
      results.push({ campaign_id: message.campaignId, variant: message.variant, ok: false, error: 'audit_insert_failed' });
      continue;
    }

    const sent = await sendEngagementEmail({
      to: email,
      subject: message.subject,
      html: message.html,
      text: message.text,
      unsubToken: state.unsubscribe_token,
      period: message.period,
    });

    await admin.from('engagement_sends').update({
      status: sent.ok ? 'sent' : 'failed',
      sent_at: sent.ok ? new Date().toISOString() : null,
      resend_message_id: sent.id ?? null,
      error: sent.error ?? null,
    }).eq('id', message.sendId);

    results.push({ campaign_id: message.campaignId, variant: message.variant, ok: sent.ok, message_id: sent.id ?? null, error: sent.error ?? null });
  }

  const sentCount = results.filter((result) => result.ok === true).length;
  return json({ approval_test: true, batch_id: batchId, attempted: pack.length, sent: sentCount, failed: pack.length - sentCount, results });
}

// ── Per-user evaluation ────────────────────────────────────────────────────

interface EvalInput {
  admin: AdminClient;
  state: {
    user_id: string;
    timezone: string;
    last_active_at: string | null;
    weekly_opt_out: boolean;
    monthly_opt_out: boolean;
    unsubscribe_token: string;
  };
  clock: LocalClock;
  due: Campaign[];
  dryRun: boolean;
  now: Date;
}

async function evaluateUser(
  input: EvalInput,
): Promise<{ status: 'sent' | 'suppressed' | 'failed'; reason?: string }> {
  const { admin, state, clock, due, dryRun, now } = input;

  // ── Account-level gates. Cheapest first, and each one is a reason the whole
  // user is out regardless of campaign.
  const { data: account } = await admin
    .from('users')
    .select('email, account_status')
    .eq('id', state.user_id)
    .maybeSingle();

  const email = (account as { email?: string } | null)?.email?.trim();
  if (!email || !email.includes('@')) return { status: 'suppressed', reason: 'no_email' };
  if ((account as { account_status?: string } | null)?.account_status !== 'active') {
    return { status: 'suppressed', reason: 'account_not_active' };
  }

  const { data: suppressed } = await admin
    .from('email_suppressions')
    .select('reason')
    .eq('email', email.toLowerCase())
    .maybeSingle();
  if (suppressed) {
    return { status: 'suppressed', reason: `suppressed_${(suppressed as { reason: string }).reason}` };
  }

  // No activity record at all. Every row is created by syncEngagementState,
  // which always writes a timestamp, so this is close to impossible — but
  // "close to" isn't "never", and mailing someone we cannot confirm is a real
  // active user is the wrong way to be wrong. Given its own reason so it shows
  // up in the run stats rather than hiding inside long_inactive.
  if (!state.last_active_at) {
    return { status: 'suppressed', reason: 'no_activity_record' };
  }

  const lastActive = new Date(state.last_active_at);
  const hoursSinceActive = (now.getTime() - lastActive.getTime()) / 3_600_000;
  const daysSinceActive = hoursSinceActive / 24;

  // Cooldown lookups are identical for any two campaigns sharing a window, so
  // cache by window length rather than re-querying down the ladder.
  const cooldownCache = new Map<number, boolean>();
  const isWithinCooldown = async (days: number): Promise<boolean> => {
    const cached = cooldownCache.get(days);
    if (cached !== undefined) return cached;
    const since = new Date(now.getTime() - days * 86_400_000).toISOString();
    const { count } = await admin
      .from('engagement_sends')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', state.user_id)
      .eq('status', 'sent')
      .gte('sent_at', since);
    const within = (count ?? 0) > 0;
    cooldownCache.set(days, within);
    return within;
  };

  // ── One email per user per run. Walk the ladder, take the first that fits.
  for (const campaign of due) {
    // `continue`, not `return`: opting out of the weekly email is not opting
    // out of the monthly one, and the two are separate switches in the app.
    if (campaign.period === 'weekly' && state.weekly_opt_out) continue;
    if (campaign.period === 'monthly' && state.monthly_opt_out) continue;

    const supp = campaign.suppression ?? {};
    const activityHours = Number(supp.recent_activity_hours ?? 6);
    const maxInactiveDays = Number(supp.max_inactive_days ?? 21);
    const cooldownDays = Number(supp.cooldown_days ?? 5);

    // Recently in the app: they have already seen everything this email would
    // tell them.
    if (hoursSinceActive < activityHours) {
      return { status: 'suppressed', reason: 'recently_active' };
    }
    // Long gone: this user belongs to the existing daily inactivity sequence.
    // Two re-engagement systems talking over each other is the worst possible
    // experience, so this one stays quiet.
    if (daysSinceActive > maxInactiveDays) {
      return { status: 'suppressed', reason: 'long_inactive' };
    }

    // Global spacing across weekly AND monthly. This is the frequency ceiling
    // the whole design leans on.
    if (await isWithinCooldown(cooldownDays)) {
      return { status: 'suppressed', reason: 'within_cooldown' };
    }

    // ── Signals.
    const periodKey =
      campaign.period === 'weekly'
        ? isoWeekKey(clock.date)
        : monthKey(previousMonthStart(clock.date));

    const { data: signalData, error: signalError } =
      campaign.period === 'weekly'
        ? await admin.rpc('compute_weekly_signals', {
            p_user_id: state.user_id,
            p_local_date: clock.date,
            // Without this the SQL casts timestamptz to date in the SERVER's
            // zone, which shifts every window by a day for anyone west of UTC.
            p_timezone: state.timezone,
          })
        : await admin.rpc('compute_monthly_signals', {
            p_user_id: state.user_id,
            p_month_start: previousMonthStart(clock.date),
            p_timezone: state.timezone,
          });

    if (signalError) {
      console.error('[Engagement] Signal computation failed:', signalError);
      continue;
    }
    const signals = (signalData ?? {}) as Record<string, any>;

    // ── Does this campaign have anything to say?
    let variant = campaign.variant;
    let thresholdReason = meetsMinData(campaign.min_data ?? {}, signals);
    let triggerReason = thresholdReason ? null : passesTrigger(campaign.campaign_id, signals);

    // Monthly falls back to rediscovery when the month is too thin for a
    // story but a favourite has gone quiet. Same campaign, same cooldown —
    // it just has a second thing it can be about.
    if (
      campaign.campaign_id === 'monthly_meal_story' &&
      (thresholdReason || triggerReason) &&
      signals.dormant_favourite
    ) {
      variant = 'rediscovery';
      thresholdReason = null;
      triggerReason = null;
    }

    const blocked = thresholdReason ?? triggerReason;
    if (blocked) {
      // Not eligible for THIS campaign — try the next rung rather than giving
      // up on the user.
      continue;
    }

    // ── Compose.
    const vars = templateVars(signals);
    const subject = renderTemplate(
      variant === 'rediscovery' ? 'Remember {{favourite_recipe}}?' : campaign.subject_template,
      vars,
    );
    const preheader = renderTemplate(campaign.preheader_template ?? '', vars);

    const target: CtaTarget = isCtaTarget(campaign.cta_route) ? campaign.cta_route : 'plan';
    const recipeId = ctaRecipeId(campaign.campaign_id, variant, signals);

    const sendId = crypto.randomUUID();
    const blockKeys =
      variant === 'rediscovery'
        ? ['hero_monthly_rediscovery']
        : (campaign.body_blocks ?? []);

    const rendered: RenderedBlock[] = [];
    const usedBlocks: string[] = [];
    for (const key of blockKeys) {
      const fn = BLOCKS[key];
      if (!fn) continue;
      const block = fn({
        sendId,
        signals,
        ctaTarget: variant === 'rediscovery' ? 'recipe' : target,
        ctaLabel: campaign.cta_label,
        ctaRecipeId: recipeId,
      });
      if (!block) continue;
      rendered.push(block);
      usedBlocks.push(key);
      // Hero plus at most two supporting blocks. Past that it stops being a
      // message and starts being a newsletter.
      if (rendered.length >= 3) break;
    }

    // The hero is the whole justification. If it declined to render (its data
    // evaporated between the SQL and here) there is no email to send.
    if (rendered.length === 0 || !usedBlocks[0]?.startsWith('hero_')) {
      await recordSuppressed(admin, {
        sendId, state, campaign, variant, periodKey, signals,
        reason: 'hero_block_empty',
      });
      return { status: 'suppressed', reason: 'hero_block_empty' };
    }

    const { html, text } = renderEmail({
      preheader,
      blocks: rendered,
      unsubToken: state.unsubscribe_token,
      period: campaign.period,
    });

    // ── Claim the slot BEFORE sending. A unique violation here means another
    // run already handled this user/campaign/period — back off silently.
    const { error: insertError } = await admin.from('engagement_sends').insert({
      id: sendId,
      user_id: state.user_id,
      campaign_id: campaign.campaign_id,
      variant,
      period_key: periodKey,
      subject,
      blocks: usedBlocks,
      signals,
      status: dryRun ? 'would_send' : 'sent',
      sent_at: dryRun ? null : new Date().toISOString(),
    });

    if (insertError) {
      const isDuplicate =
        (insertError as { code?: string }).code === '23505' ||
        /duplicate key/i.test(insertError.message ?? '');
      if (isDuplicate) return { status: 'suppressed', reason: 'already_sent_this_period' };
      console.error('[Engagement] Send row insert failed:', insertError);
      return { status: 'failed', reason: 'insert_failed' };
    }

    if (dryRun) return { status: 'suppressed', reason: 'dry_run' };

    const result = await sendEngagementEmail({
      to: email,
      subject,
      html,
      text,
      unsubToken: state.unsubscribe_token,
      period: campaign.period,
    });

    if (!result.ok) {
      // Recorded, not retried. A retry inside the same period would race the
      // unique constraint and, worse, could double-deliver if the first send
      // actually landed and only the response was lost.
      await admin
        .from('engagement_sends')
        .update({ status: 'failed', error: result.error ?? 'unknown', sent_at: null })
        .eq('id', sendId);
      return { status: 'failed', reason: 'send_failed' };
    }

    await admin
      .from('engagement_sends')
      .update({ resend_message_id: result.id ?? null })
      .eq('id', sendId);

    return { status: 'sent' };
  }

  return { status: 'suppressed', reason: 'no_campaign_qualified' };
}

/**
 * Record a decision not to send.
 *
 * These rows are the most diagnostic data the system produces: they answer
 * "why was it quiet?", which is otherwise unanswerable. Best-effort — failing
 * to write one must never abort a run.
 */
async function recordSuppressed(
  admin: AdminClient,
  args: {
    sendId: string;
    state: { user_id: string };
    campaign: Campaign;
    variant: string;
    periodKey: string;
    signals: Record<string, unknown>;
    reason: string;
  },
) {
  const { error } = await admin.from('engagement_sends').insert({
    id: args.sendId,
    user_id: args.state.user_id,
    campaign_id: args.campaign.campaign_id,
    variant: args.variant,
    period_key: args.periodKey,
    signals: args.signals,
    status: 'suppressed',
    suppression_reason: args.reason,
  });
  if (error && (error as { code?: string }).code !== '23505') {
    console.warn('[Engagement] Could not record suppression:', error.message);
  }
}
