// support-submit — creates a support thread and its opening message.
//
// The one thing this function must never do is fail in a way that loses the
// user's words. So the order is: write the record first, notify second, and
// treat a failed notification as a warning rather than an error. The admin
// console reads the table, not the inbox.

import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { internalDigest, sendSupportEmail, supportInbox } from '../_shared/support-email.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const INTENTS = ['bug', 'question', 'idea'];
const MAX_MESSAGE = 4000;
const MAX_ATTACHMENTS = 3;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { user, error: authError } = await verifyAuth(req);
    if (authError || !user) return json({ error: authError || 'Unauthorized' }, 401);

    // Shares the app-wide hourly budget. Support is not special-cased upward:
    // a client looping on submit is a bug, and a human has no reason to file
    // fifty reports an hour.
    const rate = await checkRateLimit(user.id);
    if (!rate.allowed) {
      return json({ error: 'Rate limit exceeded', resetsAt: rate.resetsAt }, 429);
    }

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Invalid request body' }, 400);

    const intent = String(body.intent ?? '');
    const message = String(body.message ?? '').trim();
    const feature = body.feature ? String(body.feature).slice(0, 64) : null;
    const context = (body.context ?? {}) as Record<string, unknown>;
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    if (!INTENTS.includes(intent)) return json({ error: 'Invalid request type' }, 400);
    if (!message) return json({ error: 'Message is required' }, 400);
    if (message.length > MAX_MESSAGE) return json({ error: 'Message is too long' }, 400);
    if (attachments.length > MAX_ATTACHMENTS) {
      return json({ error: 'Too many attachments' }, 400);
    }

    // Every attachment path must sit inside the caller's own storage folder.
    // The bucket's RLS already enforces this for the upload, but the path
    // arrives here as client-supplied data, and a forged path would let one
    // user staple another's screenshot to their own thread.
    const safeAttachments = [];
    for (const a of attachments) {
      const path = String(a?.path ?? '');
      if (!path.startsWith(`${user.id}/`)) {
        return json({ error: 'Invalid attachment' }, 400);
      }
      safeAttachments.push({
        path,
        width: Number(a?.width) || 0,
        height: Number(a?.height) || 0,
        bytes: Number(a?.bytes) || 0,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) return json({ error: 'Server configuration error' }, 500);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Subject is a denormalised preview for the admin list — the user never
    // writes one and never sees one.
    const subject = message.replace(/\s+/g, ' ').slice(0, 80);

    const { data: thread, error: threadError } = await admin
      .from('support_threads')
      .insert({
        user_id: user.id,
        type: intent,
        subject,
        feature,
        context,
        status: 'new',
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (threadError || !thread) {
      console.error('[SupportSubmit] Thread insert failed:', threadError);
      return json({ error: 'Could not save request' }, 500);
    }

    const { error: messageError } = await admin.from('support_messages').insert({
      thread_id: thread.id,
      author: 'user',
      body: message,
      attachments: safeAttachments,
    });

    if (messageError) {
      // The thread without its message is an empty shell an agent can't act
      // on, so roll it back rather than leaving a ghost in the inbox.
      console.error('[SupportSubmit] Message insert failed:', messageError);
      await admin.from('support_threads').delete().eq('id', thread.id);
      return json({ error: 'Could not save request' }, 500);
    }

    // ── Notify. Past this point the user's message is safely stored, so
    //    nothing below may turn into an error response.
    const digest = internalDigest({
      intent,
      message,
      feature,
      userEmail: user.email ?? null,
      userId: user.id,
      threadId: thread.id,
      attachmentCount: safeAttachments.length,
      context,
    });

    await sendSupportEmail({
      to: supportInbox(),
      subject: digest.subject,
      html: digest.html,
      text: digest.text,
      // Lets an agent answer straight from the inbox in a pinch, even though
      // the console is the intended path.
      replyTo: user.email ?? undefined,
    });

    return json({ data: { threadId: thread.id } });
  } catch (error) {
    console.error('[SupportSubmit] Edge function error:', error);
    return json({ error: 'Internal server error' }, 500);
  }
});
