// Support analytics — bounded property builders.
//
// Same construction as lib/share/analytics.ts and lib/onboarding-analytics.ts:
// the builders accept a narrow shape and can never be handed free text, so a
// user's message cannot reach a dashboard even by mistake. Call sites pass an
// intent and a feature key; they do not pass the thing the user typed.
//
// The event list answers six questions and nothing else:
//   why are people contacting us · where do problems happen · which repeat ·
//   are the quick answers landing · where do people give up · which product
//   areas create friction
// Anything that doesn't move one of those isn't instrumented.

import { track } from '../analytics';
import type { SupportEntry, SupportIntent } from './types';

/**
 * Message length as a bucket, never a length and never the text.
 *
 * Useful because abandonment at 0 characters (wrong door) and abandonment at
 * 200 (gave up mid-thought) are different problems with different fixes.
 */
export function charsBucket(length: number): '0' | '1-40' | '41-200' | '200+' {
  if (length <= 0) return '0';
  if (length <= 40) return '1-40';
  if (length <= 200) return '41-200';
  return '200+';
}

interface BaseProps {
  intent?: SupportIntent;
  feature?: string;
  entry?: SupportEntry;
}

export const supportAnalytics = {
  opened: (source: string) => track('support_opened', { source }),

  composerOpened: (p: BaseProps) =>
    track('support_composer_opened', {
      support_type: p.intent,
      feature: p.feature ?? 'none',
      entry: p.entry ?? 'help_home',
    }),

  screenshotAttached: (p: BaseProps) =>
    track('support_screenshot_attached', { support_type: p.intent }),

  submitted: (p: BaseProps & { chars: number; hasAttachment: boolean }) =>
    track('support_submitted', {
      support_type: p.intent,
      feature: p.feature ?? 'none',
      entry: p.entry ?? 'help_home',
      chars_bucket: charsBucket(p.chars),
      has_attachment: p.hasAttachment,
    }),

  submitFailed: (p: BaseProps & { category: string }) =>
    track('support_submit_failed', {
      support_type: p.intent,
      // The failure CATEGORY from lib/failure, never a message.
      category: p.category,
    }),

  /** Fired when the sheet closes with text in it and nothing sent. */
  abandoned: (p: BaseProps & { chars: number }) =>
    track('support_composer_abandoned', {
      support_type: p.intent,
      feature: p.feature ?? 'none',
      chars_bucket: charsBucket(p.chars),
    }),

  faqOpened: (faqId: string) => track('faq_opened', { faq_id: faqId }),

  /** The signal that a quick answer isn't answering. */
  faqContactClicked: (faqId: string) => track('faq_contact_clicked', { faq_id: faqId }),

  threadOpened: (p: { intent: SupportIntent; hadUnread: boolean }) =>
    track('support_thread_opened', {
      support_type: p.intent,
      had_unread: p.hadUnread,
    }),

  userReplied: () => track('support_user_replied'),

  /** A contextual prompt was rendered — the denominator for its click-through. */
  contextualShown: (feature: string) => track('contextual_support_shown', { feature }),
};
