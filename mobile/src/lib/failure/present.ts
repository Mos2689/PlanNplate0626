// Presentation routing — the bridge between a classified failure and the screen.
//
// Modelled on the existing global-overlay pattern in this codebase: PaywallSheet
// is mounted once at the root and driven from anywhere via
// `openPaywallSheet(trigger)` on a zustand store (see lib/subscription-store.ts
// and app/_layout.tsx). Failures work identically, so any module — a store, a
// helper, a screen — can present one without prop-drilling or local state.

import { create } from 'zustand';
import { classifyFailure, type ClassifyContext } from './classify';
import { isOnline } from './connectivity';
import {
  consecutiveFailures,
  failureKey,
  reportAbandon,
  reportFailure,
  reportRecovery,
} from './diagnostics';
import { copyFor } from './copy';
import type { Failure } from './types';

interface FailureState {
  /** Transient, non-blocking — rendered as a toast. */
  toast: Failure | null;
  /** Degraded surface — rendered as a banner beneath the header. */
  banner: Failure | null;
  /** Requires a decision — rendered as a dialog over everything. */
  dialog: Failure | null;
  /** Set by the presenter so the UI knows what to run on "Try again". */
  retryHandler: (() => void | Promise<void>) | null;

  show: (failure: Failure, onRetry?: () => void | Promise<void>) => void;
  dismissToast: () => void;
  dismissBanner: () => void;
  dismissDialog: () => void;
}

export const useFailureStore = create<FailureState>((set, get) => ({
  toast: null,
  banner: null,
  dialog: null,
  retryHandler: null,

  show: (failure, onRetry) => {
    switch (failure.severity) {
      case 'silent':
        return; // already reported by presentFailure; nothing to render
      case 'info':
        set({ toast: failure, retryHandler: onRetry ?? null });
        return;
      case 'warning':
        set({ banner: failure, retryHandler: onRetry ?? null });
        return;
      case 'blocking':
        set({ dialog: failure, retryHandler: onRetry ?? null });
        return;
    }
  },

  dismissToast: () => {
    const f = get().toast;
    if (f) reportAbandon(f);
    set({ toast: null });
  },
  dismissBanner: () => {
    const f = get().banner;
    if (f) reportAbandon(f);
    set({ banner: null });
  },
  dismissDialog: () => {
    const f = get().dialog;
    if (f) reportAbandon(f);
    set({ dialog: null, retryHandler: null });
  },
}));

/**
 * Report a failure and show it, choosing the surface from its severity.
 *
 * This is what a screen calls in a catch block. Infrastructure under `lib/`
 * should classify and RETURN instead, letting the screen decide when to present
 * — otherwise a background refresh can throw a dialog over whatever the user is
 * currently doing.
 */
export function presentFailure(
  failure: Failure,
  onRetry?: () => void | Promise<void>,
): void {
  // A generic network error is indistinguishable from being offline at the
  // fetch layer (React Native throws a bare `TypeError: Network request
  // failed` for both). Now that connectivity is actually observed, refine it
  // here so the user gets "You're offline" — which is actionable — rather than
  // "we're having trouble", which isn't.
  const refined: Failure =
    failure.category === 'offline' && isOnline()
      ? { ...failure, category: 'poor-connection', ...copyFor('poor-connection', failure.feature) }
      : failure;

  reportFailure(refined);

  // Count AFTER reporting, so the occurrence just reported is included. This is
  // what drives the "persistent" tier: the surfaces offer a way to reach a
  // person from the second occurrence of the same problem onward, never the
  // first. Most failures are transient and the retry works — offering help
  // immediately would make the app feel fragile rather than helpful.
  const attempt = consecutiveFailures(failureKey(refined));

  useFailureStore.getState().show({ ...refined, attempt }, onRetry);
}

/**
 * Classify and present in one step — the common case inside a screen's catch.
 *
 *   try { … } catch (e) { reportAndPresent(e, { feature: 'grocery' }, retry); }
 */
export function reportAndPresent(
  cause: unknown,
  ctx: ClassifyContext,
  onRetry?: () => void | Promise<void>,
): Failure {
  const failure = classifyFailure(cause, ctx);
  presentFailure(failure, onRetry);
  return failure;
}

/** Record a successful recovery and clear whatever surface was showing. */
export function resolveFailure(failure: Failure, via: 'retry' | 'action' = 'retry'): void {
  reportRecovery(failure, via);
  useFailureStore.setState({ toast: null, banner: null, dialog: null, retryHandler: null });
}
