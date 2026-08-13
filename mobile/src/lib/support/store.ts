// Composer state.
//
// Mounted once at the root and driven from anywhere, exactly like
// PaywallSheet (`openPaywallSheet` in lib/subscription-store.ts) and
// FailureHost (lib/failure/present.ts). That pattern is why a contextual
// support prompt buried three components deep inside the grocery tab costs one
// function call and no prop drilling.
//
// Diagnostics are captured at OPEN time, not at send time. By the time someone
// finishes typing, `currentScreenName()` is the composer — the screen they were
// actually on, which is the single most useful field in the payload, is already
// gone.

import { create } from 'zustand';
import { collectDiagnostics } from './diagnostics';
import { supportAnalytics } from './analytics';
import type { SupportDiagnostics } from './diagnostics-policy';
import type { SupportAttachment, SupportComposerRequest } from './types';

interface SupportComposerState {
  isOpen: boolean;
  request: SupportComposerRequest | null;
  /** Snapshot taken when the sheet opened. */
  diagnostics: SupportDiagnostics | null;

  /**
   * The draft, kept in the store rather than in component state so that a
   * failed send — or an accidental dismiss — never costs the user their words.
   * This is the difference between "that didn't send, try again" and "that
   * didn't send, write it out again".
   */
  draft: string;
  attachments: SupportAttachment[];

  open: (request: SupportComposerRequest) => void;
  close: () => void;
  setDraft: (draft: string) => void;
  addAttachment: (attachment: SupportAttachment) => void;
  removeAttachment: (path: string) => void;
  /** Wipe the draft after a send that actually landed. */
  reset: () => void;
}

export const useSupportComposer = create<SupportComposerState>((set, get) => ({
  isOpen: false,
  request: null,
  diagnostics: null,
  draft: '',
  attachments: [],

  open: (request) => {
    const previous = get().request;
    // Reopening the SAME intent keeps whatever was typed — someone who
    // dismissed the sheet to go re-read an error message shouldn't lose their
    // draft. A different intent is a different message, so it starts clean.
    const keepDraft = previous?.intent === request.intent;

    set({
      isOpen: true,
      request,
      diagnostics: collectDiagnostics(request),
      draft: keepDraft ? get().draft : '',
      attachments: keepDraft ? get().attachments : [],
    });

    supportAnalytics.composerOpened({
      intent: request.intent,
      feature: request.feature,
      entry: request.entry,
    });
  },

  close: () => {
    const { draft, request } = get();
    // Only counts as abandonment if they'd actually started writing.
    if (draft.trim().length > 0 && request) {
      supportAnalytics.abandoned({
        intent: request.intent,
        feature: request.feature,
        chars: draft.trim().length,
      });
    }
    set({ isOpen: false });
  },

  setDraft: (draft) => set({ draft }),

  addAttachment: (attachment) =>
    set((s) => ({ attachments: [...s.attachments, attachment] })),

  removeAttachment: (path) =>
    set((s) => ({ attachments: s.attachments.filter((a) => a.path !== path) })),

  reset: () => set({ draft: '', attachments: [], request: null, diagnostics: null }),
}));

/**
 * Raise the composer from anywhere.
 *
 *   openSupportComposer({ intent: 'bug', feature: 'recipe-import', entry: 'contextual' })
 */
export function openSupportComposer(request: SupportComposerRequest): void {
  useSupportComposer.getState().open(request);
}
