// The ONLY place user-facing support wording lives.
//
// Same discipline as lib/failure/copy.ts, and covered by the same banned-terms
// test (__tests__/support-copy.test.ts reuses that file's BANNED list). No
// screen composes its own support sentence.
//
// VOICE: calm, concise, warm, human. The test also bans the vocabulary of
// support software — ticket, case, submit, reference number, agent, inquiry,
// "successfully" — because those words are what make a product feel like it has
// a support department rather than a team.
//
// The rule of thumb behind most of these: say what happens next, in the order
// the user cares about. "We got it → a person will read it → here's when → here's
// where the reply lands."

import type { SupportIntent } from './types';

export const supportCopy = {
  // ── Help home ────────────────────────────────────────────────────────────
  home: {
    // Split so "help?" can carry the Instrument Serif italic accent — the
    // brand's signature flourish, used once per screen and never twice.
    titleLead: 'How can we',
    titleAccent: 'help?',
    subtitle: 'Real people read every message. Usually back within a day.',
    quickAnswers: 'Quick answers',
    conversations: 'Your conversations',
    // Sits under everything, quiet. Reassurance, not a legal notice.
    footer: 'We only ever ask for what we need to look into it.',
    footerLink: 'How we handle your details',
  },

  /**
   * The three doors. Each is one action phrased three ways — not three
   * destinations — which is why they read as a list rather than a grid of
   * cards.
   */
  intents: {
    bug: {
      row: "Something's not working",
      rowHint: 'Tell us what happened',
      title: 'What happened?',
      placeholder: 'Tell us what you were doing and what went wrong.',
    },
    question: {
      row: 'Ask us something',
      rowHint: 'How things work, account, billing',
      title: 'What can we help with?',
      placeholder: 'Ask us anything about PlanNplate.',
    },
    idea: {
      row: 'Share an idea',
      rowHint: 'What would make this easier?',
      title: 'What would make this easier?',
      placeholder: 'Anything at all — big or small.',
    },
  } satisfies Record<SupportIntent, {
    row: string;
    rowHint: string;
    title: string;
    placeholder: string;
  }>,

  // ── Composer ─────────────────────────────────────────────────────────────
  composer: {
    attach: 'Add a screenshot',
    attachRemove: 'Remove screenshot',
    // The underlined half opens the disclosure. Kept to one sentence: a
    // paragraph about data collection at the moment someone is reporting a bug
    // is friction disguised as transparency.
    disclosureLead: "We'll include your app version and",
    disclosureLink: 'app details',
    disclosureTitle: 'What we include',
    disclosureBody:
      "Just enough to look into it. Nothing about your recipes, meals or grocery lists.",
    send: 'Send',
    sending: 'Sending',
    close: 'Close',
  },

  // ── Confirmation ─────────────────────────────────────────────────────────
  confirmation: {
    title: 'Got it.',
    /** `{email}` is replaced with the account address at render time. */
    body: "Someone on the team will read this and get back to you at {email}, usually within a day.",
    bodyNoEmail: 'Someone on the team will read this and get back to you, usually within a day.',
    action: 'Back to cooking',
  },

  // ── Trouble sending ──────────────────────────────────────────────────────
  // Note what this does NOT say: it never suggests rewriting or resending from
  // scratch, because the draft is kept. The anxiety being answered is "did I
  // just lose what I typed?".
  sendFailed: {
    title: "That didn't send",
    body: 'Your message is saved here. Try once more.',
    action: 'Try again',
  },

  // ── Contextual + failure entry points ────────────────────────────────────
  prompts: {
    persistent: 'Still not working?',
    persistentAction: 'Tell us what happened',
    critical: 'Tell us what happened',
    recipeImport: "Some sites are stubborn. Tell us which one and we'll take a look.",
    groceryEmpty: 'Something missing from this list?',
    subscription: 'Trouble with your subscription? We can sort it.',
    action: 'Tell us',
  },

  // ── Conversation ─────────────────────────────────────────────────────────
  thread: {
    team: 'PlanNplate',
    you: 'You',
    replyPlaceholder: 'Reply…',
    // Status as a sentence, never a badge. A badge turns a conversation into a
    // record; a sentence keeps it a conversation.
    statusNew: "We've got this — someone will take a look shortly.",
    statusOpen: "We're looking into this.",
    statusResolved: 'Sorted — reply anytime to reopen.',
    send: 'Send',
  },

  // ── FAQ ──────────────────────────────────────────────────────────────────
  faq: {
    stillStuck: 'Still stuck?',
    stillStuckAction: 'Tell us',
  },
} as const;

/** Fill the confirmation line with the address the reply will go to. */
export function confirmationBody(email: string | null): string {
  if (!email) return supportCopy.confirmation.bodyNoEmail;
  return supportCopy.confirmation.body.replace('{email}', email);
}
