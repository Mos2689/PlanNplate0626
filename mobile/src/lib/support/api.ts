// Support API.
//
// Follows the convention stated in lib/failure/types.ts: modules under lib/
// classify and RETURN failures; screens present them. Nothing here shows a
// toast or a dialog — the composer decides when the user should see something,
// because a background thread refresh has no business interrupting anyone.
//
// Writes go through edge functions (they need the service role for the
// notification side-effects). Reads go straight to the table, because RLS is
// the access rule and an edge function in front of a SELECT would just be a
// slower way of applying the same policy.

import { supabase } from '../supabase';
import { apiCall } from '../api-router';
import { classifyFailure, err, ok, type Result } from '../failure';
import type {
  SupportAttachment,
  SupportIntent,
  SupportMessage,
  SupportThread,
  SupportThreadDetail,
} from './types';

const FEATURE = 'support';

interface ThreadRow {
  id: string;
  type: SupportIntent;
  status: SupportThread['status'];
  subject: string;
  feature: string | null;
  last_message_at: string;
  unread_for_user: boolean;
  created_at: string;
}

interface MessageRow {
  id: string;
  thread_id: string;
  author: 'user' | 'agent';
  body: string;
  attachments: SupportAttachment[] | null;
  created_at: string;
}

const toThread = (r: ThreadRow): SupportThread => ({
  id: r.id,
  type: r.type,
  status: r.status,
  subject: r.subject,
  feature: r.feature,
  lastMessageAt: r.last_message_at,
  unreadForUser: r.unread_for_user,
  createdAt: r.created_at,
});

const toMessage = (r: MessageRow): SupportMessage => ({
  id: r.id,
  threadId: r.thread_id,
  author: r.author,
  body: r.body,
  attachments: r.attachments ?? [],
  createdAt: r.created_at,
});

/**
 * Open a new thread.
 *
 * Returns the thread id so the confirmation can deep-link into the
 * conversation, though v1's confirmation deliberately doesn't — sending people
 * straight into a thread they have no reason to read yet is busywork.
 */
export async function submitSupportRequest(input: {
  intent: SupportIntent;
  message: string;
  feature?: string;
  context: Record<string, unknown>;
  attachments: SupportAttachment[];
}): Promise<Result<{ threadId: string }>> {
  const response = await apiCall<{ threadId: string }>(
    'support-submit',
    {
      intent: input.intent,
      message: input.message,
      feature: input.feature ?? null,
      context: input.context,
      attachments: input.attachments,
    },
    { feature: FEATURE },
  );

  if (response.failure) return err(response.failure);
  if (!response.data?.threadId) {
    return err(classifyFailure('no thread returned', { feature: FEATURE }));
  }
  return ok({ threadId: response.data.threadId });
}

/** Add the user's reply to an existing conversation. */
export async function replyToThread(
  threadId: string,
  message: string,
): Promise<Result<void>> {
  const response = await apiCall<{ threadId: string }>(
    'support-reply',
    { threadId, message },
    { feature: FEATURE },
  );
  if (response.failure) return err(response.failure);
  return ok(undefined);
}

/** The user's conversations, newest first. */
export async function listThreads(): Promise<Result<SupportThread[]>> {
  try {
    const { data, error } = await supabase
      .from('support_threads')
      .select('id, type, status, subject, feature, last_message_at, unread_for_user, created_at')
      .order('last_message_at', { ascending: false });

    if (error) return err(classifyFailure(error, { feature: FEATURE }));
    return ok((data as ThreadRow[]).map(toThread));
  } catch (cause) {
    return err(classifyFailure(cause, { feature: FEATURE }));
  }
}

/** One conversation with its full message trail. */
export async function getThread(threadId: string): Promise<Result<SupportThreadDetail>> {
  try {
    const [threadResult, messagesResult] = await Promise.all([
      supabase
        .from('support_threads')
        .select('id, type, status, subject, feature, last_message_at, unread_for_user, created_at')
        .eq('id', threadId)
        .single(),
      supabase
        .from('support_messages')
        .select('id, thread_id, author, body, attachments, created_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true }),
    ]);

    if (threadResult.error) {
      return err(classifyFailure(threadResult.error, { feature: FEATURE }));
    }
    if (messagesResult.error) {
      return err(classifyFailure(messagesResult.error, { feature: FEATURE }));
    }

    return ok({
      ...toThread(threadResult.data as ThreadRow),
      messages: (messagesResult.data as MessageRow[]).map(toMessage),
    });
  } catch (cause) {
    return err(classifyFailure(cause, { feature: FEATURE }));
  }
}

/**
 * Clear the unread flag once the user has actually seen the reply.
 *
 * Best-effort: a failure here means the dot lingers until the next open, which
 * is a far smaller problem than an error surfacing while someone reads a reply.
 */
export async function markThreadRead(threadId: string): Promise<void> {
  try {
    await supabase
      .from('support_threads')
      .update({ unread_for_user: false })
      .eq('id', threadId);
  } catch {
    // Intentionally ignored — see above.
  }
}

/**
 * A short-lived link to a private attachment.
 *
 * Attachments are stored as paths rather than URLs precisely so that every
 * read mints a fresh, expiring signature.
 */
export async function signedAttachmentUrl(path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('support-attachments')
      .createSignedUrl(path, 60 * 60);
    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
