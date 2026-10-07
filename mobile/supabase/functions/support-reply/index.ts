// support-reply — appends a message to an existing thread.
//
// One function, two callers. An agent replying from the admin console and a
// user replying in the app are the same operation on the same table; splitting
// them into two endpoints would duplicate the thread lookup, the ownership
// check and the timestamp bump, and the two copies would drift.
//
// Why this isn't a direct insert from the admin SPA: the reply email and the
// push send need the Resend key and must not be reachable from a browser. The
// SPA could insert through RLS, but then a reply would silently never reach the
// user if the client forgot to also call something else.

import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { replyEmail, sendSupportEmail } from '../_shared/support-email.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_MESSAGE = 4000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

type PushTokenRow = { token: string; platform: string };

type ExpoPushResult = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

/**
 * How long to wait before asking Expo whether FCM/APNs accepted the message.
 *
 * A ticket only says Expo queued it; the receipt is where provider failures
 * surface — including `InvalidCredentials` when the FCM V1 key isn't uploaded
 * to EAS, which is the most likely way Android push breaks without anyone
 * noticing. Expo suggests waiting a while; receipts not ready yet are logged
 * as pending rather than treated as failures.
 */
const RECEIPT_DELAY_MS = 30_000;

/**
 * Remove tokens Expo says will never deliver again (app uninstalled, token
 * rotated). Without this every future reply keeps retrying dead devices.
 */
async function pruneDeadTokens(
  admin: ReturnType<typeof createClient>,
  tokens: string[],
) {
  if (!tokens.length) return;
  const { error } = await admin.from('user_push_tokens').delete().in('token', tokens);
  if (error) {
    console.warn('[SupportReply] Could not prune dead push tokens:', error.message);
  } else {
    console.log('[SupportReply] Pruned', tokens.length, 'dead push token(s)');
  }
}

/** Fetch receipts for tickets Expo accepted, log provider failures, prune dead tokens. */
async function checkReceipts(
  admin: ReturnType<typeof createClient>,
  tickets: Map<string, PushTokenRow>,
) {
  await new Promise((resolve) => setTimeout(resolve, RECEIPT_DELAY_MS));

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ids: [...tickets.keys()] }),
    });
    if (!res.ok) {
      console.warn('[SupportReply] Push receipts returned', res.status);
      return;
    }

    const receipts: Record<string, ExpoPushResult> =
      (await res.json().catch(() => null))?.data ?? {};
    const dead: string[] = [];

    for (const [id, row] of tickets) {
      const receipt = receipts[id];
      if (!receipt) {
        console.log('[SupportReply] Push receipt pending', { id, platform: row.platform });
      } else if (receipt.status === 'error') {
        console.warn('[SupportReply] Push delivery failed', {
          platform: row.platform,
          error: receipt.details?.error,
          message: receipt.message,
        });
        if (receipt.details?.error === 'DeviceNotRegistered') dead.push(row.token);
      } else {
        console.log('[SupportReply] Push delivered to provider', { platform: row.platform });
      }
    }

    await pruneDeadTokens(admin, dead);
  } catch (e) {
    console.warn('[SupportReply] Push receipt check failed:', e);
  }
}

/**
 * Best-effort push. Never throws, never blocks the reply.
 *
 * Notifications are the convenience channel; the email is the guarantee. If
 * Expo is unreachable the user still gets the reply — it just arrives in their
 * inbox rather than on their lock screen.
 *
 * Expo answers 200 even when individual messages fail, so success is judged
 * per ticket, never by the HTTP status alone.
 */
async function sendPush(
  admin: ReturnType<typeof createClient>,
  userId: string,
  body: string,
  threadId: string,
) {
  try {
    const { data: rows } = await admin
      .from('user_push_tokens')
      .select('token, platform')
      .eq('user_id', userId);

    const tokens = (rows ?? []) as PushTokenRow[];
    if (!tokens.length) {
      console.log('[SupportReply] No push tokens for user — email only');
      return;
    }

    const messages = tokens.map((t) => ({
      to: t.token,
      // Says what it is without support jargon, and distinguishes this from the
      // app's meal reminders at a glance. Duplicated wording rather than
      // imported: this runs in Deno and cannot reach src/lib/support/copy.ts.
      title: 'PlanNplate replied',
      // One line of the actual reply, not "You have a new message" — the user
      // should be able to tell whether it needs them without opening anything.
      body: body.replace(/\s+/g, ' ').slice(0, 140),
      // Read by useSupportNotifications() to route the tap to /help/<threadId>.
      data: { type: 'support_reply', threadId },
      sound: 'default',
      // Android channel created by setupNotificationChannels() in
      // src/lib/notifications.ts (SUPPORT_CHANNEL_ID). Change one, change both.
      channelId: 'support',
      // Groups replies per conversation in the tray instead of stacking one
      // entry per reply.
      threadId: `support-${threadId}`,
    }));

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });

    const payload = await res.json().catch(() => null);

    if (!res.ok || !Array.isArray(payload?.data)) {
      // Request-level failure (malformed body, tokens from mixed projects, …).
      console.warn('[SupportReply] Push send failed', res.status, payload?.errors ?? payload);
      return;
    }

    // Tickets come back in the same order as the messages we sent.
    const tickets = payload.data as ExpoPushResult[];
    const accepted = new Map<string, PushTokenRow>();
    const dead: string[] = [];

    tickets.forEach((ticket, i) => {
      const row = tokens[i];
      if (!row) return;
      if (ticket.status === 'ok' && ticket.id) {
        accepted.set(ticket.id, row);
      } else if (ticket.status === 'error') {
        console.warn('[SupportReply] Push ticket error', {
          platform: row.platform,
          error: ticket.details?.error,
          message: ticket.message,
        });
        if (ticket.details?.error === 'DeviceNotRegistered') dead.push(row.token);
      }
    });

    console.log('[SupportReply] Push tickets', {
      sent: messages.length,
      accepted: accepted.size,
      platforms: tokens.map((t) => t.platform),
    });

    await pruneDeadTokens(admin, dead);

    // Receipts arrive later; don't hold the agent's reply open for them.
    if (accepted.size) {
      const receiptWork = checkReceipts(admin, accepted);
      // @ts-ignore — EdgeRuntime is provided by the Supabase edge runtime.
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(receiptWork);
    }
  } catch (e) {
    console.warn('[SupportReply] Push send failed:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { user, error: authError } = await verifyAuth(req);
    if (authError || !user) return json({ error: authError || 'Unauthorized' }, 401);

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Invalid request body' }, 400);

    const threadId = String(body.threadId ?? '');
    const message = String(body.message ?? '').trim();
    // Agents may close a thread in the same action as their reply.
    const nextStatus = body.status ? String(body.status) : null;

    if (!threadId) return json({ error: 'Thread is required' }, 400);
    if (!message) return json({ error: 'Message is required' }, 400);
    if (message.length > MAX_MESSAGE) return json({ error: 'Message is too long' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return json({ error: 'Server configuration error' }, 500);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Who is calling? Membership of support_agents is the ONLY thing that
    // grants agent powers, and it's read here with the service role rather
    // than trusted from the request.
    const { data: agent } = await admin
      .from('support_agents')
      .select('name, active')
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle();

    const isAgent = Boolean(agent);

    const { data: thread, error: threadError } = await admin
      .from('support_threads')
      .select('id, user_id, status')
      .eq('id', threadId)
      .maybeSingle();

    if (threadError || !thread) return json({ error: 'Conversation not found' }, 404);

    // A non-agent may only ever write into their own thread. Returning 404
    // rather than 403 keeps the existence of other threads unobservable.
    if (!isAgent && thread.user_id !== user.id) {
      return json({ error: 'Conversation not found' }, 404);
    }

    const { error: insertError } = await admin.from('support_messages').insert({
      thread_id: thread.id,
      author: isAgent ? 'agent' : 'user',
      agent_id: isAgent ? user.id : null,
      body: message,
    });

    if (insertError) {
      console.error('[SupportReply] Message insert failed:', insertError);
      return json({ error: 'Could not save reply' }, 500);
    }

    // A user replying to a resolved thread reopens it — "reply anytime to
    // reopen" is what the app tells them, so the backend has to honour it.
    const status = isAgent
      ? nextStatus && ['new', 'open', 'resolved'].includes(nextStatus)
        ? nextStatus
        : 'open'
      : 'open';

    await admin
      .from('support_threads')
      .update({
        status,
        last_message_at: new Date().toISOString(),
        // Only an agent's reply is "unread for the user"; the user's own
        // message obviously isn't.
        unread_for_user: isAgent,
      })
      .eq('id', thread.id);

    // ── Notify the user, if this was an agent speaking.
    if (isAgent) {
      const { data: opening } = await admin
        .from('support_messages')
        .select('body')
        .eq('thread_id', thread.id)
        .eq('author', 'user')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const { data: recipient } = await admin.auth.admin.getUserById(thread.user_id);
      const email = recipient?.user?.email;

      if (email) {
        const mail = replyEmail({
          agentName: (agent as { name: string }).name,
          body: message,
          originalMessage: opening?.body ?? '',
          threadId: thread.id,
        });
        await sendSupportEmail({
          to: email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
      }

      await sendPush(admin, thread.user_id, message, thread.id);
    }

    return json({ data: { threadId: thread.id, status } });
  } catch (error) {
    console.error('[SupportReply] Edge function error:', error);
    return json({ error: 'Internal server error' }, 500);
  }
});
