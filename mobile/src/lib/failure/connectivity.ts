// Connectivity awareness.
//
// @react-native-community/netinfo was already a dependency but had never been
// imported — the app had no idea whether it was online. That's why a dropped
// connection surfaced as a generic failure rather than the one thing the user
// could actually act on.
//
// Scope is deliberately detection + retry gating. There is NO offline write
// queue: replaying mutations against the existing Supabase sync in store.ts
// would risk duplicate or lost writes, which is a worse failure than the one
// being solved.

import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { create } from 'zustand';

interface ConnectivityState {
  /** False only when we're confident there's no usable connection. */
  isOnline: boolean;
  /** Connected to a network, but the internet itself is unreachable. */
  isInternetReachable: boolean | null;
  /** True once NetInfo has reported at least once — avoids a false "offline" flash on boot. */
  hasResolved: boolean;
  /**
   * 'wifi' | 'cellular' | 'none' | … Retained for support diagnostics: "failed
   * on cellular, works on wifi" is one of the few network details that
   * genuinely changes what an agent looks at first.
   */
  connectionType: string;
  setState: (s: NetInfoState) => void;
}

export const useConnectivity = create<ConnectivityState>((set) => ({
  // Optimistic default. Assuming online until told otherwise prevents an
  // offline banner flashing during the first frames of a cold start.
  isOnline: true,
  isInternetReachable: null,
  hasResolved: false,
  connectionType: 'unknown',
  setState: (s) =>
    set({
      // `isInternetReachable` is null while undetermined; only treat the device
      // as offline when NetInfo is actually sure.
      isOnline: Boolean(s.isConnected) && s.isInternetReachable !== false,
      isInternetReachable: s.isInternetReachable,
      hasResolved: true,
      connectionType: s.type ?? 'unknown',
    }),
}));

let unsubscribe: (() => void) | null = null;

/** Begin listening. Called once from the root layout. Idempotent. */
export function startConnectivityMonitoring(): () => void {
  if (unsubscribe) return unsubscribe;
  unsubscribe = NetInfo.addEventListener((state) => {
    useConnectivity.getState().setState(state);
  });
  // Prime immediately so the first read isn't the optimistic default.
  void NetInfo.fetch().then((s) => useConnectivity.getState().setState(s));
  return unsubscribe;
}

export function stopConnectivityMonitoring(): void {
  unsubscribe?.();
  unsubscribe = null;
}

/** Non-reactive read, for stores and helpers outside React. */
export function isOnline(): boolean {
  return useConnectivity.getState().isOnline;
}

/** Non-reactive read of the current transport, for support diagnostics. */
export function connectionType(): string {
  return useConnectivity.getState().connectionType;
}

/**
 * Resolve once the device is back online, or when `timeoutMs` elapses.
 *
 * This is the retry-gating primitive: rather than burning an attempt budget
 * against a connection that isn't there, callers wait for the network to come
 * back and then try once. Resolves `true` if connectivity returned.
 */
export function waitForConnection(timeoutMs = 15000): Promise<boolean> {
  if (isOnline()) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      resolve(result);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const unsub = useConnectivity.subscribe((state) => {
      if (state.isOnline) finish(true);
    });
  });
}
