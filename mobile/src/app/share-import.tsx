// Where a shared link becomes a recipe.
//
// This screen is the wiring, not the logic: it hands the real services to
// `runSharedImport` (lib/share/import-orchestrator.ts) and renders whatever
// comes back. Everything decidable — validation, auth, the meter, duplicates,
// idempotency, which failures keep the link — lives in the orchestrator, which
// is why those cases have tests and this file doesn't need branching.
//
// It reuses the paste flow's pipeline exactly: `extractRecipeFromUrl` from
// lib/recipeImport.ts and `persistImportedRecipe`, which is the review screen's
// own save path lifted into lib/share/persist-imported-recipe.ts. There is one
// importer and one saver in this app, and sharing does not add a second.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { ShareImportSheet, type ShareSheetUiState } from '@/components/share';
import { useRecipeFeatureGate } from '@/hooks/useRecipeFeatureGate';
import { useAuthStore } from '@/lib/auth-store';
import { classifyFailure } from '@/lib/failure';
import { dismissShareNotification } from '@/lib/notifications';
import { extractRecipeFromUrl } from '@/lib/recipeImport';
import { useColorScheme } from '@/lib/useColorScheme';
import { useMealPlanStore } from '@/lib/store';
import { trackShare, trackShareOutcome } from '@/lib/share/analytics';
import {
  runSharedImport,
  type ShareAuthState,
  type ShareImportDeps,
} from '@/lib/share/import-orchestrator';
import { shareFailure } from '@/lib/share/outcome';
import { pendingShares, type PendingShare } from '@/lib/share/pending-share';
import {
  findDuplicateBySourceUrl,
  persistImportedRecipe,
} from '@/lib/share/persist-imported-recipe';
import type { ShareImportOutcome, SharePayload } from '@/lib/share/types';

/**
 * How long "Saved to PlanNplate" holds before the recipe itself replaces it.
 *
 * The recipe IS the payoff; a card announcing that one exists is a receipt, and
 * putting a tap between the user and the thing they shared for was the whole
 * complaint. Long enough to register as a completed action and to read the name
 * we gave it, short enough that nobody reaches for a button first — and the
 * buttons stay live throughout, so anyone who does is served immediately.
 */
const REVEAL_DELAY_MS = 1100;

export default function ShareImportScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const gate = useRecipeFeatureGate('import', 'import-recipe');

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAnonymous = useAuthStore((s) => s.isAnonymous);

  const [pending, setPending] = useState<PendingShare | null>(null);
  const [state, setState] = useState<ShareSheetUiState>({ kind: 'loading' });
  const [savedRecipeId, setSavedRecipeId] = useState<string | null>(null);

  /** Guards the import against a remount or a retry landing mid-flight. */
  const running = useRef(false);
  /**
   * The import now starts on mount rather than on a tap, so the injected deps
   * can't close over `pending` state — it wouldn't have been set yet. The ref is
   * written before the run begins and read from inside the deps.
   */
  const pendingRef = useRef<PendingShare | null>(null);
  /** Pending hand-off to the recipe — see REVEAL_DELAY_MS. */
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Every route out of this screen cancels it. A timer that fires after the
  // screen has been popped would replace whatever the user navigated to.
  const cancelReveal = useCallback(() => {
    if (revealTimer.current) {
      clearTimeout(revealTimer.current);
      revealTimer.current = null;
    }
  }, []);
  useEffect(() => cancelReveal, [cancelReveal]);

  const authState = useCallback((): ShareAuthState => {
    if (!isAuthenticated) return 'signed-out';
    return isAnonymous ? 'guest' : 'signed-in';
  }, [isAuthenticated, isAnonymous]);

  // ── Real services, handed to the orchestrator ───────────────────────────
  const deps: ShareImportDeps = useMemo(
    () => ({
      extract: extractRecipeFromUrl,

      persist: async (recipe) => {
        const result = await persistImportedRecipe({
          name: recipe.name,
          description: recipe.description,
          prepTime: recipe.prepTime,
          cookTime: recipe.cookTime,
          servings: recipe.servings,
          // `|| undefined` matches the review screen, where an unparsed or zero
          // calorie count is stored as absent rather than as 0.
          calories: recipe.calories || undefined,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          tags: recipe.tags,
          sourceUrl: recipe.sourceUrl,
          imageUrl: recipe.imageUrl,
        });
        return {
          kind: result.kind,
          recipeId: result.recipeId,
          recipeName: result.recipe.name,
        };
      },

      findDuplicate: (canonicalKey) => {
        const match = findDuplicateBySourceUrl(
          useMealPlanStore.getState().recipes,
          canonicalKey,
        );
        return match ? { recipeId: match.id, recipeName: match.name } : null;
      },

      authState,
      gate: () => (gate.accessGranted ? 'allowed' : 'blocked'),

      hasProcessed: (id) => pendingShares.hasProcessed(id),
      markProcessed: (id) => pendingShares.markProcessed(id),

      retain: async (ingested, payload) => {
        await pendingShares.put({
          id: payload.id,
          entryPoint: payload.entryPoint,
          receivedAt: Date.now(),
          url: ingested.url,
          canonicalKey: ingested.canonicalKey,
          host: ingested.host,
          source: ingested.source,
        });
      },
      discard: () => pendingShares.clear(),

      classify: (cause) => classifyFailure(cause, { feature: 'recipe-share' }),

      onEvent: (event) => {
        if (event.type === 'import-started') {
          trackShare('recipe_share_import_started', {
            entryPoint: pendingRef.current?.entryPoint ?? 'share_intent',
            host: event.host,
            authState: authState(),
          });
        }
      },
    }),
    [authState, gate.accessGranted],
  );

  const apply = useCallback(
    (outcome: ShareImportOutcome, share: PendingShare) => {
      trackShareOutcome(outcome, {
        entryPoint: share.entryPoint,
        host: share.host,
        source: share.source,
        authState: authState(),
      });

      switch (outcome.kind) {
        case 'saved': {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          // Spends one free-tier use, exactly as a successful paste import does.
          gate.markUsed();
          setSavedRecipeId(outcome.recipeId);
          setState({ kind: 'saved', recipeName: outcome.recipeName });
          const { recipeId } = outcome;
          revealTimer.current = setTimeout(() => {
            revealTimer.current = null;
            router.replace({ pathname: '/recipe-detail', params: { id: recipeId } });
          }, REVEAL_DELAY_MS);
          return;
        }
        case 'duplicate':
          // Not auto-advanced. Landing on a recipe they saved weeks ago with no
          // explanation reads as a bug; here the card's message is the point.
          setSavedRecipeId(outcome.recipeId);
          setState({ kind: 'duplicate', recipeName: outcome.recipeName });
          return;
        case 'auth-required':
          setState({ kind: 'auth-required' });
          return;
        case 'gated':
          // The paywall sheet is already showing over this one; leave quietly.
          router.back();
          return;
        case 'already-processed':
          router.back();
          return;
        case 'failed':
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setState({ kind: 'failed', failure: shareFailure(outcome.reason) });
          return;
      }
    },
    [authState, gate, router],
  );

  const runImport = useCallback(
    async (share: PendingShare) => {
      if (!share.url || running.current) return;
      running.current = true;
      pendingRef.current = share;
      setState({ kind: 'importing', host: share.host });

      const payload: SharePayload = {
        id: share.id,
        url: share.url,
        capturedAt: share.receivedAt,
        entryPoint: share.entryPoint,
      };

      try {
        apply(await runSharedImport(deps, payload), share);
      } finally {
        running.current = false;
      }
    },
    [apply, deps],
  );

  // ── Load whatever is waiting, then go ───────────────────────────────────
  // Placed after `runImport` so the effect closes over an initialised binding.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const waiting = await pendingShares.read();
      if (cancelled) return;

      if (!waiting) {
        // Nothing to do — the user got here by an unexpected route, or the
        // link expired. Leave rather than show an empty sheet.
        router.back();
        return;
      }

      setPending(waiting);
      pendingRef.current = waiting;

      // The iOS extension's notification has done its job the moment this
      // screen is up. Fire-and-forget: tidying a banner must never delay or
      // block the import.
      void dismissShareNotification(waiting.id);

      if (waiting.rejectedAs) {
        // Ingestion already refused this at collection time, so the reason is
        // known without having kept the shared text around.
        setState({ kind: 'failed', failure: shareFailure(waiting.rejectedAs) });
        trackShareOutcome(
          { kind: 'failed', reason: waiting.rejectedAs },
          { entryPoint: waiting.entryPoint, host: waiting.host, source: waiting.source },
        );
        return;
      }

      trackShare('recipe_share_url_detected', {
        entryPoint: waiting.entryPoint,
        host: waiting.host,
        source: waiting.source,
        authState: authState(),
      });

      // Straight into the import. A signed-out user isn't skipped past anything
      // — the orchestrator checks auth before it touches the network and returns
      // `auth-required`, which is its own decision point.
      void runImport(waiting);
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally runs once: re-reading on every auth change would restart an
    // import the user is already watching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = useCallback(() => {
    cancelReveal();
    if (pending) {
      trackShare('recipe_share_cancelled', {
        entryPoint: pending.entryPoint,
        host: pending.host,
        source: pending.source,
      });
      // Cancelling is a decision, not a deferral — the link is dropped and the
      // id remembered so a redelivery of the same share doesn't ask again.
      void pendingShares.markProcessed(pending.id);
    }
    router.back();
  }, [cancelReveal, pending, router]);

  const handleDone = useCallback(() => {
    cancelReveal();
    router.back();
  }, [cancelReveal, router]);

  const handleViewRecipe = useCallback(() => {
    if (!savedRecipeId) return;
    // Beating the reveal to it. Tracked as an interaction because it is one —
    // the automatic hand-off deliberately doesn't fire this, or every import
    // would look like a tap.
    cancelReveal();
    trackShare('recipe_share_opened_in_app', {
      entryPoint: pending?.entryPoint ?? 'share_intent',
      host: pending?.host,
      source: pending?.source,
    });
    router.replace({ pathname: '/recipe-detail', params: { id: savedRecipeId } });
  }, [cancelReveal, pending, router, savedRecipeId]);

  const handleEditDetails = useCallback(() => {
    cancelReveal();
    // Saved recipes are edited in place; an unsaved link goes to the paste flow
    // with the URL already filled in, so nothing has to be shared again.
    if (savedRecipeId) {
      router.replace({ pathname: '/recipe-detail', params: { id: savedRecipeId } });
      return;
    }
    router.replace({
      pathname: '/import-recipe',
      params: pending?.url ? { sharedUrl: pending.url } : {},
    });
  }, [cancelReveal, pending?.url, router, savedRecipeId]);

  const handleSignIn = useCallback(() => {
    cancelReveal();
    // The link is already retained by the orchestrator, so signing in and
    // coming back resumes rather than restarts.
    router.replace('/signup');
  }, [cancelReveal, router]);

  const handleRetry = useCallback(() => {
    cancelReveal();
    if (!pending?.url) {
      router.back();
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void runImport(pending);
  }, [cancelReveal, pending, router, runImport]);

  // The paywall is showing over this screen — render nothing behind it, the
  // same contract every other gated screen follows.
  if (gate.blocked) return null;

  return (
    <View style={{ flex: 1 }}>
      <ShareImportSheet
        state={state}
        isDark={isDark}
        onCancel={handleCancel}
        onDone={handleDone}
        onViewRecipe={handleViewRecipe}
        onEditDetails={handleEditDetails}
        onSignIn={handleSignIn}
        onRetry={handleRetry}
      />
    </View>
  );
}
