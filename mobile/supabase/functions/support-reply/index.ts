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

/**
 * Best-effort push. Never throws, never blocks the reply.
 *
 * Notifications are the convenience channel; the email is the guarantee. If
 * Expo is unreachable the user still gets the reply — it just arrives in their
 * inbox rather than on their lock screen.
 */
async function sendPush(
  admin: ReturnType<typeof createClient>,
  userId: string,
  body: string,
  threadId: string,
) {
  try {
    const { data: tokens } = await admin
      .from('user_push_tokens')
      .select('token')
      .eq('user_id', userId);

    if (!tokens?.length) return;

    const messages = tokens.map((t: { token: string }) => ({
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
      // Groups replies per conversation in the tray instead of stacking one
      // entry per reply.
      threadId: `support-${threadId}`,
    }));

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      console.warn('[SupportReply] Push send returned', res.status);
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
