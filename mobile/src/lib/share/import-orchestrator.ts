// One pass of the share pipeline, start to finish.
//
// Separated from the screen so the sequence — extract · validate · normalise ·
// authenticate · meter · de-duplicate · import · persist — is one readable
// function instead of a tangle of effects, and so it can actually be tested.
//
// EVERY dependency is injected. That isn't ceremony: the real implementations
// reach into the Zustand store, Supabase, React Native's fetch and the analytics
// SDK, none of which load in this repo's Jest environment (plain node, no
// jest-expo, no native mocks — see jest.config.js). Injection is what makes the
// "auth missing", "duplicate", "retryable network failure" and "repeated
// payload" cases genuinely covered rather than described.
//
// Idempotency is layered, because no single layer is trustworthy on its own:
//   1. `hasProcessed(id)` — the share id, minted natively at capture. Catches
//      an iOS extension re-run, an Android intent redelivered after process
//      death, and a React remount.
//   2. `findDuplicate(canonicalKey)` — content-level. Catches the same post
//      shared twice from two different apps, which produces two share ids.
//   3. `store.addRecipe`'s upsert (lib/recipe-identity.ts). The backstop: even
//      if 1 and 2 both miss, the library gets one row, not two.
// Disabling a button is not on that list, and never should be.

import type { Failure } from '../failure';
import type { ImportedRecipe } from '../recipeImport';
import {
  ingestSharedPayload,
  resolveShortenedUrl,
  isShortenedUrl,
} from './url-ingest';
import { reasonForFailure, reasonForIngest, shouldRetainPendingOn } from './outcome';
import type {
  IngestedUrl,
  ShareImportOutcome,
  SharePayload,
} from './types';

/** What the caller knows about the user right now. */
export type ShareAuthState = 'signed-in' | 'signed-out' | 'guest';

/** Outcome of the free-tier meter. Sharing spends the same allowance as pasting. */
export type ShareGateState = 'allowed' | 'blocked';

export interface ShareImportDeps {
  /** The existing extractor — `extractRecipeFromUrl` from lib/recipeImport.ts. */
  extract(url: string): Promise<ImportedRecipe>;
  /** The existing saver — `persistImportedRecipe` from ./persist-imported-recipe. */
  persist(
    recipe: ImportedRecipe,
  ): Promise<{ kind: 'saved' | 'duplicate'; recipeId: string; recipeName: string }>;
  /** Library lookup by canonical URL. Returns the existing row, or null. */
  findDuplicate(canonicalKey: string): { recipeId: string; recipeName: string } | null;
  authState(): ShareAuthState;
  gate(): ShareGateState;
  /** Has this share id already been handled? Layer 1. */
  hasProcessed(id: string): Promise<boolean>;
  /** Record the share id as handled. Called on every terminal outcome. */
  markProcessed(id: string): Promise<void>;
  /** Keep the link for later (sign-in, retry). Called when the outcome is resumable. */
  retain(ingested: IngestedUrl, payload: SharePayload): Promise<void>;
  /** Drop the link — it will never import. */
  discard(): Promise<void>;
  /** Classify anything thrown by `extract`/`persist`. `classifyFailure` in practice. */
  classify(cause: unknown): Failure;
  /** Called once the URL is known and once at the terminal outcome. */
  onEvent?(event: ShareOrchestratorEvent): void;
  now?(): number;
}

/** Progress notifications for the screen. Never carries the full URL. */
export type ShareOrchestratorEvent =
  | { type: 'url-detected'; host: string; source: IngestedUrl['source'] }
  | { type: 'import-started'; host: string }
  | { type: 'settled'; outcome: ShareImportOutcome; host?: string };

/**
 * Run one shared payload all the way to a saved recipe, or to a typed reason it
 * couldn't be.
 *
 * Never throws. Every path produces a `ShareImportOutcome`, records the share id
 * as processed, and makes an explicit decision about whether the pending link
 * survives — the brief's requirement that no failure leaves the user at a dead
 * end with a lost link.
 */
export async function runSharedImport(
  deps: ShareImportDeps,
  payload: SharePayload,
): Promise<ShareImportOutcome> {
  const now = deps.now ?? Date.now;
  const emit = (event: ShareOrchestratorEvent) => deps.onEvent?.(event);

  const settle = async (
    outcome: ShareImportOutcome,
    host?: string,
  ): Promise<ShareImportOutcome> => {
    emit({ type: 'settled', outcome, host });
    return outcome;
  };

  // ── Layer 1: has this exact share already been handled? ───────────────────
  if (await deps.hasProcessed(payload.id)) {
    return settle({ kind: 'already-processed' });
  }

  // ── Extract + validate ────────────────────────────────────────────────────
  const ingestOutcome = ingestSharedPayload(payload);
  if (ingestOutcome.kind !== 'ok') {
    const reason = reasonForIngest(ingestOutcome);
    await deps.markProcessed(payload.id);
    await deps.discard();
    return settle({ kind: 'failed', reason });
  }

  // ── Normalise: follow a shortener, re-validating the destination ──────────
  let ingested: IngestedUrl = ingestOutcome;
  if (isShortenedUrl(ingested.url)) {
    const resolved = await resolveShortenedUrl(ingested);
    if (resolved.kind !== 'ok') {
      const reason = reasonForIngest(resolved);
      await deps.markProcessed(payload.id);
      await deps.discard();
      return settle({ kind: 'failed', reason });
    }
    ingested = resolved;
  }

  emit({ type: 'url-detected', host: ingested.host, source: ingested.source });

  // ── Authentication ────────────────────────────────────────────────────────
  // The link is retained BEFORE the user is sent anywhere, so a sign-in detour
  // (or a cold start that lands on onboarding) can never lose it.
  if (deps.authState() !== 'signed-in') {
    await deps.retain(ingested, payload);
    return settle({ kind: 'auth-required' }, ingested.host);
  }

  // ── Free-tier meter ───────────────────────────────────────────────────────
  // Sharing spends the same allowance as pasting; otherwise the share sheet is
  // a paywall bypass. Retained, so upgrading and returning resumes the import.
  if (deps.gate() !== 'allowed') {
    await deps.retain(ingested, payload);
    return settle({ kind: 'gated' }, ingested.host);
  }

  // ── Layer 2: content-level duplicate ──────────────────────────────────────
  const existing = deps.findDuplicate(ingested.canonicalKey);
  if (existing) {
    await deps.markProcessed(payload.id);
    await deps.discard();
    return settle({ kind: 'duplicate', ...existing }, ingested.host);
  }

  // ── Import ────────────────────────────────────────────────────────────────
  emit({ type: 'import-started', host: ingested.host });
  const startedAt = now();

  try {
    const recipe = await deps.extract(ingested.url);
    // Key the saved recipe on the CLEANED url, so the row this creates and the
    // duplicate check above agree the next time the same post is shared.
    const saved = await deps.persist({ ...recipe, sourceUrl: ingested.url });

    await deps.markProcessed(payload.id);
    await deps.discard();

    if (saved.kind === 'duplicate') {
      // Layer 3 fired — `addRecipe` matched an existing row on full identity
      // (same name + ingredients from a different URL, typically). Still a
      // success from the user's side.
      return settle(
        { kind: 'duplicate', recipeId: saved.recipeId, recipeName: saved.recipeName },
        ingested.host,
      );
    }

    return settle(
      {
        kind: 'saved',
        recipeId: saved.recipeId,
        recipeName: saved.recipeName,
        durationMs: now() - startedAt,
      },
      ingested.host,
    );
  } catch (cause) {
    const failure = deps.classify(cause);

    // An expired session mid-import is not a failure to show — it's a sign-in
    // prompt with the link kept, same as arriving signed out.
    if (failure.category === 'auth-expired' || failure.category === 'auth-denied') {
      await deps.retain(ingested, payload);
      return settle({ kind: 'auth-required' }, ingested.host);
    }

    const reason = reasonForFailure(failure);
    if (shouldRetainPendingOn(reason)) {
      await deps.retain(ingested, payload);
    } else {
      await deps.markProcessed(payload.id);
      await deps.discard();
    }
    return settle({ kind: 'failed', reason }, ingested.host);
  }
}
