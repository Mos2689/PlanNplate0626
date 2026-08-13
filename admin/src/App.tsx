import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { SignIn } from './SignIn';
import { Inbox } from './Inbox';
import { Thread } from './Thread';
import type { SupportStatus, Thread as ThreadType } from './types';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  const [status, setStatus] = useState<SupportStatus>('new');
  const [threads, setThreads] = useState<ThreadType[]>([]);
  const [selected, setSelected] = useState<ThreadType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadThreads = useCallback(async () => {
    if (!session) return;
    setLoading(true);

    // No agent check in this query. RLS decides: a signed-in user with an
    // active support_agents row sees every thread, and anyone else sees none.
    // Adding a client-side check here would be a second place for the rule to
    // live, and eventually to disagree with itself.
    const { data } = await supabase
      .from('support_threads')
      .select('*')
      .eq('status', status)
      .order('last_message_at', { ascending: false })
      .limit(100);

    const rows = (data ?? []) as ThreadType[];
    setThreads(rows);
    setLoading(false);

    // Keep the open thread selected across a refresh, but drop it if it moved
    // out of the current filter — otherwise resolving a thread leaves it on
    // screen under a tab it no longer belongs to.
    setSelected((current) =>
      current ? rows.find((t) => t.id === current.id) ?? null : null,
    );
  }, [session, status]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  // Deep link from the internal notification email:
  // admin.plannplate.com.au/?thread=<id>
  useEffect(() => {
    if (!session) return;
    const id = new URLSearchParams(window.location.search).get('thread');
    if (!id) return;

    supabase
      .from('support_threads')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const thread = data as ThreadType;
        setStatus(thread.status);
        setSelected(thread);
      });
  }, [session]);

  if (!ready) return null;
  if (!session) return <SignIn />;

  return (
    <div className={`app ${selected ? '' : 'list-only'}`}>
      <Inbox
        threads={threads}
        status={status}
        selectedId={selected?.id ?? null}
        loading={loading}
        onStatusChange={(next) => {
          setStatus(next);
          setSelected(null);
        }}
        onSelect={setSelected}
        onSignOut={() => supabase.auth.signOut()}
      />

      {selected ? (
        <Thread thread={selected} onUpdated={loadThreads} />
      ) : (
        <main>
          <p className="empty">Pick a message to read it.</p>
        </main>
      )}
    </div>
  );
}
