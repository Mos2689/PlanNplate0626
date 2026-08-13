// Unread reply count.
//
// Backs the dot on the Help & support row in Settings. Kept as a `head: true`
// count rather than fetching threads, because the Settings screen only needs to
// know whether the dot shows — pulling every thread to answer a boolean would
// be a query the user never sees the result of.
//
// Refreshed on focus rather than polled or subscribed. A support reply is not
// time-critical to the second, and a realtime subscription open for the life of
// the app is a socket held for something that happens a handful of times a
// year.

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../supabase';
import { useAuthStore } from '../auth-store';

/** Number of conversations with an unread reply. 0 when signed out. */
export function useSupportUnread(): number {
  const [count, setCount] = useState(0);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) {
        setCount(0);
        return;
      }

      let alive = true;
      supabase
        .from('support_threads')
        .select('id', { count: 'exact', head: true })
        .eq('unread_for_user', true)
        .then(({ count: n }) => {
          // Failure here means no dot, which is the right way to be wrong:
          // an unread badge that can't be cleared is worse than a missed one.
          if (alive) setCount(n ?? 0);
        });

      return () => {
        alive = false;
      };
    }, [isAuthenticated]),
  );

  return count;
}
