// The ONLY place user-facing failure wording lives.
//
// Everything a person reads when something goes wrong comes from this file.
// No screen composes its own message, and no raw error string is ever
// interpolated in — that's enforced by `__tests__/failure-copy.test.ts`, which
// fails the build if any string here mentions a vendor, an HTTP code, a stack,
// "undefined"/"null", or the words "error"/"failed" in a technical sense.
//
// Tone, per the product brief: calm, concise, confident, helpful. Never
// dramatic, never robotic, never apologetic to the point of sounding fragile.
// The reassurance that the user's data is safe is doing real work here — most
// of these failures are transient, and the biggest risk to trust is a user
// believing they've lost their plan.

import type { FailureAction, FailureCategory } from './types';

export interface FailureCopy {
  title: string;
  body: string;
  action: FailureAction;
}

/**
 * Default wording per category. A feature can override any of these via
 * `FEATURE_COPY` below when it can say something more specific and more useful.
 */
export const CATEGORY_COPY: Record<FailureCategory, FailureCopy> = {
  offline: {
    title: "You're offline",
    body: 'Your plan is saved on this device. Everything will sync once you reconnect.',
    action: { kind: 'reconnect', label: 'Try again' },
  },
  'poor-connection': {
    title: 'Your connection is unsteady',
    body: 'We’ll keep trying in the background. Nothing you’ve done has been lost.',
    action: { kind: 'retry', label: 'Try again' },
  },
  timeout: {
    title: 'That took longer than expected',
    body: 'Your plan is still safe. Give it another go.',
    action: { kind: 'retry', label: 'Try again' },
  },
  'server-unavailable': {
    title: 'We’re having trouble right now',
    body: 'This is on our side, not yours. Please try again in a moment.',
    action: { kind: 'retry', label: 'Try again' },
  },

  'auth-expired': {
    title: 'Please sign in again',
    body: 'You’ve been signed out for security. Your recipes and plans are waiting for you.',
    action: { kind: 'sign-in', label: 'Sign in' },
  },
  'auth-denied': {
    title: 'We couldn’t sign you in',
    body: 'Please check your details and try once more.',
    action: { kind: 'retry', label: 'Try again' },
  },
  validation: {
    title: 'Just needs a small change',
    body: 'Please review the highlighted details and try again.',
    action: { kind: 'continue-editing', label: 'Continue editing' },
  },

  'upload-failed': {
    title: 'That photo didn’t make it',
    body: 'Nothing else was affected. You can try the same photo again or pick a different one.',
    action: { kind: 'retry', label: 'Retry upload' },
  },
  'image-processing': {
    title: 'We couldn’t use that photo',
    body: 'Try a different one — a clear, well-lit shot works best.',
    action: { kind: 'choose-another-photo', label: 'Choose another photo' },
  },
  'ai-generation': {
    title: 'We couldn’t finish that this time',
    body: 'Your preferences are saved. Give it another go, or add the recipe yourself.',
    action: { kind: 'retry', label: 'Try again' },
  },
  'ai-parsing': {
    title: 'We couldn’t finish that step this time',
    body: 'Nothing was lost. You can try again, or add the details yourself.',
    action: { kind: 'manual-entry', label: 'Add it manually' },
  },
  'import-failed': {
    title: 'We couldn’t read that recipe',
    body: 'Some sites keep their recipes locked away. You can type it in instead — it only takes a minute.',
    action: { kind: 'manual-entry', label: 'Enter it manually' },
  },

  'permission-denied': {
    title: 'We need your permission first',
    body: 'You can turn this on in Settings whenever you’re ready.',
    action: { kind: 'open-settings', label: 'Open Settings' },
  },
  'subscription-required': {
    title: 'This is a Premium feature',
    body: 'Unlock unlimited plans, imports and smart grocery lists.',
    action: { kind: 'upgrade', label: 'See Premium' },
  },
  'rate-limited': {
    title: 'Let’s take a short break',
    body: 'You’ve been busy. This will be available again shortly.',
    action: { kind: 'dismiss', label: 'Got it' },
  },

  'sync-failed': {
    title: 'Changes saved on this device',
    body: 'We’ll finish syncing as soon as the connection settles. Nothing is lost.',
    action: { kind: 'dismiss', label: 'Got it' },
  },
  'not-configured': {
    title: 'This isn’t available right now',
    body: 'We’re working on it. Please try again a little later.',
    action: { kind: 'dismiss', label: 'Got it' },
  },
  unknown: {
    title: 'Something didn’t go through',
    body: 'Your plan is safe. Please try that once more.',
    action: { kind: 'retry', label: 'Try again' },
  },
};

/**
 * Per-feature overrides, for when a category can be said better in context.
 * Keyed `${feature}:${category}`. Falls back to CATEGORY_COPY when absent, so
 * a new feature inherits sensible wording without touching this file — which is
 * the extensibility requirement.
 */
export const FEATURE_COPY: Partial<Record<string, FailureCopy>> = {
  'recipe-generation:ai-generation': {
    title: 'We couldn’t build that plan',
    body: 'Your preferences are saved, so nothing needs redoing. Try once more, or pick from Explore in the meantime.',
    action: { kind: 'retry', label: 'Try again' },
  },
  'recipe-generation:timeout': {
    title: 'Your plan is taking a while',
    body: 'Good food takes time, but this is longer than usual. Your preferences are saved.',
    action: { kind: 'retry', label: 'Try again' },
  },
  'recipe-import:import-failed': {
    title: 'We couldn’t read that link',
    body: 'Some sites don’t share their recipes. Paste the text instead and we’ll take it from there.',
    action: { kind: 'manual-entry', label: 'Paste the recipe' },
  },
  'grocery-sync:sync-failed': {
    title: 'Your list is saved here',
    body: 'We’ll sync it across your devices once the connection settles.',
    action: { kind: 'dismiss', label: 'Got it' },
  },
  'auth:auth-denied': {
    title: 'That didn’t match',
    body: 'Please check your email and password, then try once more.',
    action: { kind: 'retry', label: 'Try again' },
  },
  // Distinct feature key so the "already registered" case keeps its own
  // wording without needing its own category. This copy pre-dates the failure
  // system and was already good — preserved rather than rewritten.
  'auth-existing-account:validation': {
    title: 'You already have an account',
    body: 'An account with this email exists. Sign in and we’ll pick up where you left off.',
    action: { kind: 'sign-in', label: 'Sign in instead' },
  },
  'auth:validation': {
    title: 'Just needs a small change',
    body: 'Please check the details above and try again.',
    action: { kind: 'continue-editing', label: 'Continue editing' },
  },
  // Email delivery isn't wired up in this build. The user can't fix that, so
  // point them at support rather than at a retry that will never work.
  'auth-link:auth-expired': {
    title: 'That link has expired',
    body: 'Sign-in links are single-use and short-lived. Request a fresh one and you’re in.',
    action: { kind: 'sign-in', label: 'Back to sign in' },
  },
  'auth-no-account:validation': {
    title: 'We couldn’t find that account',
    body: 'Double-check the address you signed up with, or create a new account.',
    action: { kind: 'sign-in', label: 'Try a different email' },
  },
  'share:unknown': {
    title: 'That didn’t send',
    body: 'Your recipe is safe here. Try sharing it again.',
    action: { kind: 'retry', label: 'Try again' },
  },
  'clipboard:unknown': {
    title: 'Nothing was copied',
    body: 'Your device didn’t allow the copy. Try once more.',
    action: { kind: 'retry', label: 'Try again' },
  },
  'clipboard:validation': {
    title: 'Your clipboard looks empty',
    body: 'Copy the recipe first, then paste it here.',
    action: { kind: 'dismiss', label: 'Got it' },
  },
  'external-link:unknown': {
    title: 'We couldn’t open that link',
    body: 'Your device wasn’t able to open it. Copying the address into a browser usually works.',
    action: { kind: 'dismiss', label: 'Got it' },
  },
  'source-link:validation': {
    title: 'No link saved for this recipe',
    body: 'This one was added by hand, so there’s no original page to open.',
    action: { kind: 'dismiss', label: 'Got it' },
  },
  'recipe-import:validation': {
    title: 'You’ve already saved this one',
    body: 'It’s in your recipes — no need to import it twice.',
    action: { kind: 'dismiss', label: 'Got it' },
  },
  // ── Share to PlanNplate ───────────────────────────────────────────────────
  // A shared post is arbitrary text from another app, so these say what was
  // wrong with the SHARE rather than with the recipe — the user didn't type
  // anything and shouldn't be told to check their input.
  'recipe-share:validation': {
    title: 'We couldn’t find a recipe link',
    body: 'Try sharing the post again, or paste its link in PlanNplate.',
    action: { kind: 'manual-entry', label: 'Paste a link' },
  },
  'recipe-share-unsupported:validation': {
    title: 'This link isn’t supported yet',
    body: 'Try importing the recipe link directly in PlanNplate.',
    action: { kind: 'manual-entry', label: 'Open import' },
  },
  'recipe-share:import-failed': {
    title: 'We couldn’t access this recipe',
    body: 'The post may be private, restricted or no longer available.',
    action: { kind: 'manual-entry', label: 'Paste the recipe' },
  },
  'recipe-share:auth-expired': {
    title: 'Sign in to finish saving',
    body: 'We’ve kept this link for you. Sign in and we’ll add it to your recipes.',
    action: { kind: 'sign-in', label: 'Sign in' },
  },
  'recipe-share:unknown': {
    title: 'We couldn’t save this recipe',
    body: 'Nothing has been added to your recipes. Please try that once more.',
    action: { kind: 'retry', label: 'Try again' },
  },
  'auth-email:not-configured': {
    title: 'We can’t send that email right now',
    body: 'Please contact support and we’ll get you signed in.',
    action: { kind: 'contact-support', label: 'Contact support' },
  },
  // A restore that finds nothing was previously a bare OS alert with a single
  // "OK" — a dead end at the exact moment a person who believes they have paid
  // is told we can't see it. That is the most trust-damaging state in the app,
  // so it is the one place a direct line to a human is the primary action.
  'subscription-restore-empty:validation': {
    title: 'We couldn’t find a subscription',
    body: 'There’s nothing to restore on this account. If you’re sure you subscribed, tell us and we’ll sort it out.',
    action: { kind: 'contact-support', label: 'Tell us' },
  },
  'voice:permission-denied': {
    title: 'Microphone access is off',
    body: 'Turn it on in Settings to add items by voice. You can always type them instead.',
    action: { kind: 'open-settings', label: 'Open Settings' },
  },
  'photo:permission-denied': {
    title: 'Photo access is off',
    body: 'Turn it on in Settings to add your own recipe photos.',
    action: { kind: 'open-settings', label: 'Open Settings' },
  },
};

/** Resolve the wording for a category, preferring a feature-specific override. */
export function copyFor(category: FailureCategory, feature?: string): FailureCopy {
  if (feature) {
    const override = FEATURE_COPY[`${feature}:${category}`];
    if (override) return override;
  }
  return CATEGORY_COPY[category];
}
