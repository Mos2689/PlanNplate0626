import { useCallback, useEffect, useState } from 'react';
import { callFunction, supabase } from './supabase';
import { contextRows, relativeTime } from './format';
import { INTENT_LABEL, type Message, type SupportStatus, type Thread as ThreadType } from './types';

interface ThreadProps {
  thread: ThreadType;
  onUpdated: () => void;
}

export function Thread({ thread, onUpdated }: ThreadProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [reply, setReply] = useState('');
  const [resolveOnSend, setResolveOnSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('support_messages')
      .select('*')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: true });

    const rows = (data ?? []) as Message[];
    setMessages(rows);

    // Attachments live in a private bucket, so each one needs a signed URL.
    // Agents can read them because of the agent policy on storage.objects.
    const paths = rows.flatMap((m) => m.attachments?.map((a) => a.path) ?? []);
    if (paths.length) {
      const { data: signed } = await supabase.storage
        .from('support-attachments')
        .createSignedUrls(paths, 60 * 60);

      const map: Record<string, string> = {};
      signed?.forEach((s) => {
        if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
      });
      setAttachmentUrls(map);
    }
  }, [thread.id]);

  useEffect(() => {
    setReply('');
    setResolveOnSend(false);
    setError(null);
    void load();
  }, [load]);

  async function handleSend() {
    const body = reply.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);

    // Through the edge function, never a direct insert — that is what sends the
    // user their email and push. A row written straight to the table would be
    // a reply the user never hears about.
    const result = await callFunction('support-reply', {
      threadId: thread.id,
      message: body,
      status: resolveOnSend ? 'resolved' : 'open',
    });

    setSending(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setReply('');
    setResolveOnSend(false);
    await load();
    onUpdated();
  }

  /** Status change without a reply — e.g. closing a duplicate. */
  async function handleStatus(next: SupportStatus) {
    await supabase.from('support_threads').update({ status: next }).eq('id', thread.id);
    onUpdated();
  }

  return (
    <main>
      <div className="thread-head">
        <span className="pill">{INTENT_LABEL[thread.type]}</span>
        <h2>{thread.subject}</h2>
        <select
          className="status-select"
          value={thread.status}
          onChange={(e) => handleStatus(e.target.value as SupportStatus)}
          aria-label="Status"
        >
          <option value="new">New</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      <div className="messages">
        {/* Diagnostics sit above the conversation, collapsed. Open by default
            for bug reports, where they're usually the first thing an agent
            needs; folded away for questions and ideas, where they're clutter. */}
        <details className="context" open={thread.type === 'bug'}>
          <summary>App details</summary>
          <table>
            <tbody>
              {contextRows(thread.context).map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>

        {messages.map((message) => (
          <div key={message.id} className={`msg ${message.author}`}>
            <div className="msg-who">
              {message.author === 'agent' ? 'You' : 'Them'} · {relativeTime(message.created_at)}
            </div>
            <div className="msg-body">{message.body}</div>
            {message.attachments?.map((attachment) =>
              attachmentUrls[attachment.path] ? (
                <a
                  key={attachment.path}
                  href={attachmentUrls[attachment.path]}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img src={attachmentUrls[attachment.path]} alt="Screenshot from the user" />
                </a>
              ) : null,
            )}
          </div>
        ))}
      </div>

      <div className="reply">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Write back…"
          aria-label="Your reply"
        />
        <div className="reply-actions">
          <button className="primary" onClick={handleSend} disabled={!reply.trim() || sending}>
            {sending ? 'Sending…' : 'Send reply'}
          </button>
          <label className="hint">
            <input
              type="checkbox"
              checked={resolveOnSend}
              onChange={(e) => setResolveOnSend(e.target.checked)}
            />{' '}
            Mark resolved
          </label>
          <span className="hint">Sends an email and a notification.</span>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </main>
  );
}
