import { relativeTime } from './format';
import { INTENT_LABEL, type SupportStatus, type Thread } from './types';

const TABS: { key: SupportStatus; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
];

const EMPTY_LABEL: Record<SupportStatus, string> = {
  new: 'Nothing waiting.',
  open: 'Nothing in progress.',
  resolved: 'Nothing resolved yet.',
};

interface InboxProps {
  threads: Thread[];
  status: SupportStatus;
  selectedId: string | null;
  loading: boolean;
  onStatusChange: (status: SupportStatus) => void;
  onSelect: (thread: Thread) => void;
  onSignOut: () => void;
}

export function Inbox({
  threads,
  status,
  selectedId,
  loading,
  onStatusChange,
  onSelect,
  onSignOut,
}: InboxProps) {
  return (
    <aside>
      <div className="inbox-header">
        <h1 className="inbox-title">Messages</h1>
        <button className="signout" onClick={onSignOut}>
          Sign out
        </button>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className="tab"
            role="tab"
            aria-selected={status === tab.key}
            onClick={() => onStatusChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="thread-list">
        {loading && <p className="empty">Loading…</p>}

        {!loading && threads.length === 0 && (
          <p className="empty">
            {EMPTY_LABEL[status]}
            <br />
            {/* An agent whose account isn't in support_agents sees an empty
                inbox rather than an error, because RLS simply returns no rows.
                This line is the only thing that distinguishes "no messages"
                from "no access" — without it, a mis-provisioned account looks
                like a quiet week. */}
            If you expected messages here and see none, your account may not be
            on the support team yet.
          </p>
        )}

        {threads.map((thread) => (
          <button
            key={thread.id}
            className="thread-row"
            aria-current={selectedId === thread.id}
            onClick={() => onSelect(thread)}
          >
            <div className="thread-meta">
              <span className="pill">{INTENT_LABEL[thread.type]}</span>
              {thread.feature && <span className="pill feature">{thread.feature}</span>}
            </div>
            <p className="thread-subject">{thread.subject}</p>
            <div className="thread-when">{relativeTime(thread.last_message_at)}</div>
          </button>
        ))}
      </div>
    </aside>
  );
}
