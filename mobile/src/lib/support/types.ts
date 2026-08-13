// The support vocabulary. Shared by the composer, the API layer, the thread
// view and the diagnostics policy.

/**
 * What the user is trying to do — NOT a support category.
 *
 * The distinction matters: a category asks the user to classify their own
 * problem ("Billing? Sync? Data loss?"), which they can't reliably do and
 * shouldn't have to. An intent is just which door they walked through, and it
 * only changes the heading and the placeholder.
 */
export type SupportIntent = 'bug' | 'question' | 'idea';

/** Agent-facing workflow state. Shown to the user as a sentence, never a badge. */
export type SupportStatus = 'new' | 'open' | 'resolved';

/** How the composer was reached. Drives analytics only. */
export type SupportEntry = 'help_home' | 'failure' | 'contextual' | 'faq';

/**
 * An uploaded screenshot, as stored on a message.
 *
 * `path` is a bucket path, never a URL — signed URLs expire, so they're minted
 * at read time rather than persisted.
 */
export interface SupportAttachment {
  path: string;
  width: number;
  height: number;
  bytes: number;
}

export interface SupportMessage {
  id: string;
  threadId: string;
  author: 'user' | 'agent';
  body: string;
  attachments: SupportAttachment[];
  createdAt: string;
}

export interface SupportThread {
  id: string;
  type: SupportIntent;
  status: SupportStatus;
  subject: string;
  feature: string | null;
  lastMessageAt: string;
  unreadForUser: boolean;
  createdAt: string;
}

export interface SupportThreadDetail extends SupportThread {
  messages: SupportMessage[];
}

/**
 * Everything the composer needs to open. Assembled by the caller —
 * `openSupportComposer({ intent: 'bug', feature: 'recipe-import' })`.
 */
export interface SupportComposerRequest {
  intent: SupportIntent;
  /** Product area, matching `Failure.feature` so support and telemetry group alike. */
  feature?: string;
  entry?: SupportEntry;
  /**
   * Opaque ids for the specific object the user was looking at (a meal plan, an
   * import attempt). Attached ONLY from contextual entry points, and only ever
   * UUIDs — never names, titles or user-authored text.
   */
  featureIds?: Record<string, string>;
}
