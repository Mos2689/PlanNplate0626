// End-to-end coverage of a share, with the boundaries stubbed.
//
// This is the closest this repo can get to an integration test without a device:
// the orchestrator takes every service as an argument, so the whole sequence —
// validate, authenticate, meter, de-duplicate, import, persist, decide what
// happens to the pending link — runs for real here. What's faked is only the
// four things that need a phone: the network, the Zustand store, the auth
// session, and the clock.
//
// The cases below are the ones the brief calls out: auth present, auth missing,
// auth expiring mid-import, backend success, duplicate, backend failure,
// retryable network failure, and a payload delivered twice.

import { runSharedImport, type ShareImportDeps } from '../share/import-orchestrator';
// Straight to classify.ts rather than the barrel — see the note in
// lib/share/outcome.ts. The barrel pulls in NetInfo.
import { classifyFailure } from '../failure/classify';
import type { ImportedRecipe } from '../recipeImport';
import type { SharePayload } from '../share/types';

const RECIPE: ImportedRecipe = {
  name: 'Slow Roast Lamb',
  description: 'Shoulder, six hours, very little effort.',
  cookTime: 360,
  prepTime: 15,
  servings: 6,
  ingredients: [{ name: 'lamb shoulder', quantity: '2', unit: 'kg', category: 'meat' }],
  instructions: ['Season.', 'Roast low and slow.'],
  tags: ['dinner'],
  calories: 620,
};

const payload = (overrides: Partial<SharePayload> = {}): SharePayload => ({
  id: 'share-1',
  url: 'https://example.com/lamb',
  capturedAt: 1_000,
  entryPoint: 'share_intent',
  ...overrides,
});

interface Harness {
  deps: ShareImportDeps;
  retained: jest.Mock;
  discarded: jest.Mock;
  marked: jest.Mock;
  extract: jest.Mock;
  persist: jest.Mock;
  events: string[];
}

function harness(overrides: Partial<ShareImportDeps> = {}): Harness {
  const retained = jest.fn().mockResolvedValue(undefined);
  const discarded = jest.fn().mockResolvedValue(undefined);
  const marked = jest.fn().mockResolvedValue(undefined);
  const extract = jest.fn().mockResolvedValue(RECIPE);
  const persist = jest.fn().mockResolvedValue({
    kind: 'saved',
    recipeId: 'recipe-1',
    recipeName: RECIPE.name,
  });
  const events: string[] = [];

  let clock = 5_000;

  const deps: ShareImportDeps = {
    extract: extract as unknown as ShareImportDeps['extract'],
    persist: persist as unknown as ShareImportDeps['persist'],
    findDuplicate: () => null,
    authState: () => 'signed-in',
    gate: () => 'allowed',
    hasProcessed: async () => false,
    markProcessed: marked,
    retain: retained,
    discard: discarded,
    classify: (cause) => classifyFailure(cause, { feature: 'recipe-share' }),
    onEvent: (event) => events.push(event.type),
    now: () => {
      clock += 120;
      return clock;
    },
    ...overrides,
  };

  return { deps, retained, discarded, marked, extract, persist, events };
}

describe('a signed-in user shares a recipe', () => {
  it('imports it through the existing pipeline and saves it', async () => {
    const h = harness();
    const outcome = await runSharedImport(h.deps, payload());

    expect(outcome).toMatchObject({ kind: 'saved', recipeId: 'recipe-1', recipeName: RECIPE.name });
    expect(h.extract).toHaveBeenCalledWith('https://example.com/lamb');
    expect(h.persist).toHaveBeenCalledTimes(1);
    expect(h.marked).toHaveBeenCalledWith('share-1');
    expect(h.discarded).toHaveBeenCalled();
    expect(h.retained).not.toHaveBeenCalled();
  });

  it('records how long it took', async () => {
    const outcome = await runSharedImport(harness().deps, payload());
    expect(outcome.kind).toBe('saved');
    if (outcome.kind === 'saved') expect(outcome.durationMs).toBeGreaterThan(0);
  });

  it('saves against the cleaned link, so a re-share matches the same recipe', async () => {
    const h = harness();
    await runSharedImport(
      h.deps,
      payload({ url: 'https://example.com/lamb?utm_source=ig&fbclid=x' }),
    );
    expect(h.persist).toHaveBeenCalledWith(
      expect.objectContaining({ sourceUrl: 'https://example.com/lamb' }),
    );
  });

  it('announces the link and the start of the import', async () => {
    const h = harness();
    await runSharedImport(h.deps, payload());
    expect(h.events).toEqual(['url-detected', 'import-started', 'settled']);
  });
});

describe('the same share arriving more than once', () => {
  it('does nothing the second time', async () => {
    const h = harness({ hasProcessed: async () => true });
    const outcome = await runSharedImport(h.deps, payload());

    expect(outcome).toEqual({ kind: 'already-processed' });
    expect(h.extract).not.toHaveBeenCalled();
    expect(h.persist).not.toHaveBeenCalled();
  });

  it('reports a duplicate without importing again', async () => {
    const h = harness({
      findDuplicate: () => ({ recipeId: 'recipe-9', recipeName: 'Slow Roast Lamb' }),
    });
    const outcome = await runSharedImport(h.deps, payload());

    expect(outcome).toMatchObject({ kind: 'duplicate', recipeId: 'recipe-9' });
    expect(h.extract).not.toHaveBeenCalled();
    expect(h.marked).toHaveBeenCalledWith('share-1');
  });

  it('treats a save that matched an existing recipe as a duplicate, not a failure', async () => {
    // The store's own upsert is the last line of defence — it can match on name
    // plus ingredients when the URLs differ.
    const h = harness();
    h.persist.mockResolvedValue({
      kind: 'duplicate',
      recipeId: 'recipe-7',
      recipeName: 'Slow Roast Lamb',
    });
    const outcome = await runSharedImport(h.deps, payload());
    expect(outcome).toMatchObject({ kind: 'duplicate', recipeId: 'recipe-7' });
  });

  it('looks the duplicate up by the canonical key, not the raw link', async () => {
    const findDuplicate = jest.fn().mockReturnValue(null);
    const h = harness({ findDuplicate });
    await runSharedImport(h.deps, payload({ url: 'https://www.youtube.com/watch?v=abc&si=xyz' }));
    expect(findDuplicate).toHaveBeenCalledWith('https://youtube.com/watch?v=abc');
  });
});

describe('the user is not signed in', () => {
  it('keeps the link and asks them to sign in', async () => {
    const h = harness({ authState: () => 'signed-out' });
    const outcome = await runSharedImport(h.deps, payload());

    expect(outcome).toEqual({ kind: 'auth-required' });
    expect(h.retained).toHaveBeenCalledTimes(1);
    expect(h.retained.mock.calls[0][0]).toMatchObject({ url: 'https://example.com/lamb' });
    // Not marked processed — signing in has to be able to resume it.
    expect(h.marked).not.toHaveBeenCalled();
    expect(h.extract).not.toHaveBeenCalled();
  });

  it('treats a guest the same way', async () => {
    const h = harness({ authState: () => 'guest' });
    expect(await runSharedImport(h.deps, payload())).toEqual({ kind: 'auth-required' });
    expect(h.retained).toHaveBeenCalled();
  });

  it('keeps the link when the session expires mid-import', async () => {
    const h = harness();
    h.extract.mockRejectedValue(new Error('JWT expired'));

    const outcome = await runSharedImport(h.deps, payload());

    expect(outcome).toEqual({ kind: 'auth-required' });
    expect(h.retained).toHaveBeenCalled();
    expect(h.persist).not.toHaveBeenCalled();
    expect(h.marked).not.toHaveBeenCalled();
  });

  it('resumes after sign-in without needing the link shared again', async () => {
    // Pass one: signed out, link retained.
    const first = harness({ authState: () => 'signed-out' });
    await runSharedImport(first.deps, payload());
    const retained = first.retained.mock.calls[0][0];

    // Pass two: same id, same link, now signed in.
    const second = harness();
    const outcome = await runSharedImport(
      second.deps,
      payload({ id: 'share-1', url: retained.url }),
    );

    expect(outcome.kind).toBe('saved');
    expect(second.extract).toHaveBeenCalledWith('https://example.com/lamb');
  });
});

describe('the free-tier meter', () => {
  it('stops the share flow being a way around the paywall', async () => {
    const h = harness({ gate: () => 'blocked' });
    const outcome = await runSharedImport(h.deps, payload());

    expect(outcome).toEqual({ kind: 'gated' });
    expect(h.extract).not.toHaveBeenCalled();
    // Held, so upgrading and coming back finishes the job.
    expect(h.retained).toHaveBeenCalled();
  });
});

describe('when the link cannot be imported', () => {
  it('refuses a payload with no link in it, and does not hold onto it', async () => {
    const h = harness();
    const outcome = await runSharedImport(
      h.deps,
      payload({ url: undefined, text: 'dinner tomorrow?' }),
    );

    expect(outcome).toEqual({ kind: 'failed', reason: 'no-url' });
    expect(h.discarded).toHaveBeenCalled();
    expect(h.retained).not.toHaveBeenCalled();
    expect(h.marked).toHaveBeenCalledWith('share-1');
  });

  it('refuses a scheme it will not open', async () => {
    const h = harness();
    const outcome = await runSharedImport(
      h.deps,
      payload({ url: undefined, text: 'javascript:alert(1)' }),
    );
    expect(outcome).toEqual({ kind: 'failed', reason: 'unsupported-scheme' });
    expect(h.retained).not.toHaveBeenCalled();
  });

  it('refuses a private address', async () => {
    const h = harness();
    const outcome = await runSharedImport(
      h.deps,
      payload({ url: undefined, text: 'http://169.254.169.254/latest/meta-data/' }),
    );
    expect(outcome).toEqual({ kind: 'failed', reason: 'blocked-host' });
  });

  it('holds the link when the connection drops, so retrying is possible', async () => {
    const h = harness();
    h.extract.mockRejectedValue(new TypeError('Network request failed'));

    const outcome = await runSharedImport(h.deps, payload());

    expect(outcome).toEqual({ kind: 'failed', reason: 'offline' });
    expect(h.retained).toHaveBeenCalled();
    expect(h.discarded).not.toHaveBeenCalled();
  });

  it('holds the link when the request times out', async () => {
    const h = harness();
    h.extract.mockRejectedValue(new Error('The request timed out'));

    const outcome = await runSharedImport(h.deps, payload());
    expect(outcome).toEqual({ kind: 'failed', reason: 'timeout' });
    expect(h.retained).toHaveBeenCalled();
  });

  it('holds the link when the user is being rate limited', async () => {
    const h = harness();
    h.extract.mockRejectedValue(new Error('rate limit exceeded'));

    const outcome = await runSharedImport(h.deps, payload());
    expect(outcome).toEqual({ kind: 'failed', reason: 'rate-limited' });
    expect(h.retained).toHaveBeenCalled();
  });

  it('lets go of a post it will never be able to read', async () => {
    const h = harness();
    h.extract.mockRejectedValue(new Error('Failed to extract recipe from page'));

    const outcome = await runSharedImport(h.deps, payload());

    expect(outcome).toEqual({ kind: 'failed', reason: 'inaccessible' });
    // Retrying a private post produces the same answer every time, so holding
    // it would only mean asking about it again on every launch.
    expect(h.discarded).toHaveBeenCalled();
    expect(h.retained).not.toHaveBeenCalled();
  });

  it('holds the link when the failure is one we cannot categorise', async () => {
    const h = harness();
    h.persist.mockRejectedValue(new Error('something odd'));

    const outcome = await runSharedImport(h.deps, payload());
    expect(outcome).toEqual({ kind: 'failed', reason: 'unknown' });
    expect(h.retained).toHaveBeenCalled();
  });

  it('never throws, whatever the pipeline does', async () => {
    const h = harness();
    h.extract.mockImplementation(() => {
      throw new Error('thrown synchronously');
    });
    await expect(runSharedImport(h.deps, payload())).resolves.toMatchObject({ kind: 'failed' });
  });
});
