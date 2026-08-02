// The vocabulary of the "Share to PlanNplate" flow.
//
// Everything crossing the native → JavaScript boundary, and everything the
// orchestrator returns, is described here. Two rules the rest of the folder
// depends on:
//
//   1. Outcomes are TYPED, never strings. A share can fail in a dozen ways and
//      each one maps to different copy, a different retry policy and a different
//      cleanup decision — a `string` erases all three, which is exactly how the
//      pre-existing api-router leaks happened (see lib/failure/types.ts).
//   2. The raw shared text NEVER travels beyond this layer. Captions are user
//      content; they go in `Failure.context` for diagnostics at most, and never
//      into analytics or a rendered string.

/** Where a payload entered the app. Reported to analytics; drives copy nuance. */
export type ShareEntryPoint = 'share_extension' | 'share_intent' | 'pasted_link';

/**
 * A raw payload as handed over by the OS.
 *
 * `url` and `text` are both optional and both untrusted: Instagram hands us a
 * caption with the link buried in it, Safari hands us a clean `public.url`,
 * and some apps hand us both with different values.
 */
export interface SharePayload {
  /** Stable id minted at CAPTURE time (native side), not at read time. */
  id: string;
  /** A `public.url` item, when the source app provided one. */
  url?: string;
  /** A `public.plain-text` item — may be a bare URL, or a caption containing one. */
  text?: string;
  /** `EXTRA_SUBJECT` on Android / the item's title on iOS. Often the post title. */
  subject?: string;
  /** Unix ms, set natively when the share was captured. */
  capturedAt: number;
  entryPoint: ShareEntryPoint;
}

/** Sources the importer recognises. Mirrors `detectSourceType` in recipeImport.ts. */
export type ShareSourceType = 'instagram' | 'tiktok' | 'youtube' | 'pinterest' | 'website';

/**
 * The result of turning an untrusted payload into something we're willing to
 * hand to the importer.
 *
 * The rejection kinds are deliberately fine-grained: "there was no link at all"
 * and "there was a link but it pointed at localhost" are the same HTTP outcome
 * and completely different messages to a person.
 */
export type IngestOutcome =
  | {
      kind: 'ok';
      /** Cleaned, absolute https/http URL — safe to fetch. */
      url: string;
      /** Dedup key, agreed with store.addRecipe's upsert. */
      canonicalKey: string;
      source: ShareSourceType;
      /** Hostname only. This is the ONLY part of the URL analytics may see. */
      host: string;
      /** True when `url` came out of a shortener and was resolved. */
      wasShortened: boolean;
    }
  | { kind: 'no-url' }
  | { kind: 'unsupported-scheme' }
  | { kind: 'blocked-host' }
  | { kind: 'payload-too-large' };

/** Narrowing helper — `outcome.kind === 'ok'` reads worse at three call sites. */
export type IngestedUrl = Extract<IngestOutcome, { kind: 'ok' }>;

/**
 * What happened to a share, end to end.
 *
 * `duplicate` and `saved` are both successes — the user's link is in PlanNplate
 * either way, and the screen says so rather than treating "already saved" as an
 * error, which is what the old import-review path did (it raised a `validation`
 * failure for a duplicate).
 */
export type ShareImportOutcome =
  | { kind: 'saved'; recipeId: string; recipeName: string; durationMs: number }
  | { kind: 'duplicate'; recipeId: string; recipeName: string }
  | { kind: 'auth-required' }
  | { kind: 'gated' }
  | { kind: 'already-processed' }
  | { kind: 'failed'; reason: ShareFailureReason };

/**
 * Every way a share can fail, before it becomes a `Failure`.
 *
 * Kept separate from `FailureCategory` because the mapping is one-way and
 * lossy: `no-url` and `unsupported-scheme` both present as `validation`, but
 * they need different copy and different analytics. Collapsing them at the
 * source would throw that away.
 */
export type ShareFailureReason =
  | 'no-url'
  | 'unsupported-scheme'
  | 'blocked-host'
  | 'payload-too-large'
  | 'offline'
  | 'timeout'
  | 'inaccessible'
  | 'rate-limited'
  | 'unknown';
