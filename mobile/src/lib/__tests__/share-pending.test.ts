// The pending store is what stops a shared link being lost at a sign-in
// boundary and what stops it being imported twice. Both are invisible when they
// work and expensive when they don't, so they're pinned here.
//
// A Map stands in for AsyncStorage — the store takes its backend as an argument
// precisely so this can run without React Native.

import {
  createPendingShareStore,
  PENDING_SHARE_TTL_MS,
  SHARE_STATE_KEY,
  type PendingShare,
  type ShareKeyValueStore,
} from '../share/pending-share';

function memoryStorage(): ShareKeyValueStore & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  return {
    raw,
    async getItem(key) {
      return raw.get(key) ?? null;
    },
    async setItem(key, value) {
      raw.set(key, value);
    },
    async removeItem(key) {
      raw.delete(key);
    },
  };
}

const share = (overrides: Partial<PendingShare> = {}): PendingShare => ({
  id: 'share-1',
  entryPoint: 'share_intent',
  receivedAt: 1_000,
  url: 'https://example.com/recipe',
  canonicalKey: 'https://example.com/recipe',
  host: 'example.com',
  source: 'website',
  ...overrides,
});

describe('holding a link across a boundary', () => {
  it('gives back what was put in', async () => {
    const store = createPendingShareStore(memoryStorage(), () => 1_000);
    await store.put(share());
    expect(await store.read()).toMatchObject({ id: 'share-1', url: 'https://example.com/recipe' });
  });

  it('has nothing to give when nothing was shared', async () => {
    const store = createPendingShareStore(memoryStorage());
    expect(await store.read()).toBeNull();
  });

  it('keeps a link that has been waiting less than a week', async () => {
    let now = 1_000;
    const store = createPendingShareStore(memoryStorage(), () => now);
    await store.put(share({ receivedAt: now }));
    now += PENDING_SHARE_TTL_MS - 1;
    expect(await store.read()).not.toBeNull();
  });

  it('lets an abandoned link expire rather than surfacing it weeks later', async () => {
    let now = 1_000;
    const storage = memoryStorage();
    const store = createPendingShareStore(storage, () => now);
    await store.put(share({ receivedAt: now }));

    now += PENDING_SHARE_TTL_MS + 1;
    expect(await store.read()).toBeNull();
    // And it's cleared from disk, not just hidden.
    expect(JSON.parse(storage.raw.get(SHARE_STATE_KEY)!).pending).toBeNull();
  });

  it('lets a newer share replace one the user never acted on', async () => {
    const store = createPendingShareStore(memoryStorage(), () => 1_000);
    await store.put(share({ id: 'first' }));
    await store.put(share({ id: 'second' }));
    expect((await store.read())?.id).toBe('second');
  });

  it('drops the link when the user cancels', async () => {
    const store = createPendingShareStore(memoryStorage(), () => 1_000);
    await store.put(share());
    await store.clear();
    expect(await store.read()).toBeNull();
  });

  it('remembers a refusal without keeping the shared text', async () => {
    const store = createPendingShareStore(memoryStorage(), () => 1_000);
    await store.put({
      id: 'share-2',
      entryPoint: 'share_extension',
      receivedAt: 1_000,
      rejectedAs: 'no-url',
    });
    const held = await store.read();
    expect(held?.rejectedAs).toBe('no-url');
    expect(held?.url).toBeUndefined();
  });
});

describe('processing a share exactly once', () => {
  it('reports an id as processed once it has been marked', async () => {
    const store = createPendingShareStore(memoryStorage(), () => 1_000);
    expect(await store.hasProcessed('share-1')).toBe(false);
    await store.markProcessed('share-1');
    expect(await store.hasProcessed('share-1')).toBe(true);
  });

  it('clears the pending link when its own id is marked', async () => {
    const store = createPendingShareStore(memoryStorage(), () => 1_000);
    await store.put(share());
    await store.markProcessed('share-1');
    expect(await store.read()).toBeNull();
  });

  it('leaves a different pending link alone', async () => {
    const store = createPendingShareStore(memoryStorage(), () => 1_000);
    await store.put(share({ id: 'current' }));
    await store.markProcessed('an-older-one');
    expect((await store.read())?.id).toBe('current');
  });

  it('refuses to re-accept a share that was already handled', async () => {
    // This is what makes a redelivered Android intent, or an iOS extension
    // re-run, a no-op rather than a second import.
    const store = createPendingShareStore(memoryStorage(), () => 1_000);
    await store.markProcessed('share-1');
    await store.put(share({ id: 'share-1' }));
    expect(await store.read()).toBeNull();
  });

  it('marking the same id twice changes nothing', async () => {
    const storage = memoryStorage();
    const store = createPendingShareStore(storage, () => 1_000);
    await store.markProcessed('share-1');
    await store.markProcessed('share-1');
    expect(JSON.parse(storage.raw.get(SHARE_STATE_KEY)!).processedIds).toEqual(['share-1']);
  });

  it('keeps the history bounded so it stays a cheap read', async () => {
    const storage = memoryStorage();
    const store = createPendingShareStore(storage, () => 1_000);
    for (let i = 0; i < 60; i += 1) {
      await store.markProcessed(`share-${i}`);
    }
    const { processedIds } = JSON.parse(storage.raw.get(SHARE_STATE_KEY)!);
    expect(processedIds).toHaveLength(50);
    // The oldest fall off, the most recent — the ones a redelivery would
    // actually repeat — are kept.
    expect(processedIds[processedIds.length - 1]).toBe('share-59');
    expect(processedIds).not.toContain('share-0');
  });
});

describe('cleanup and resilience', () => {
  it('wipes everything on reset, so one account never sees another’s link', async () => {
    const storage = memoryStorage();
    const store = createPendingShareStore(storage, () => 1_000);
    await store.put(share());
    await store.markProcessed('other');
    await store.reset();
    expect(storage.raw.has(SHARE_STATE_KEY)).toBe(false);
    expect(await store.read()).toBeNull();
  });

  it('starts clean rather than wedging when the stored state is corrupt', async () => {
    const storage = memoryStorage();
    storage.raw.set(SHARE_STATE_KEY, '{not json');
    const store = createPendingShareStore(storage, () => 1_000);
    expect(await store.read()).toBeNull();
    await expect(store.put(share())).resolves.toBeUndefined();
    expect((await store.read())?.id).toBe('share-1');
  });

  it('does not throw when storage itself fails', async () => {
    const failing: ShareKeyValueStore = {
      getItem: async () => {
        throw new Error('storage unavailable');
      },
      setItem: async () => {
        throw new Error('storage unavailable');
      },
      removeItem: async () => {
        throw new Error('storage unavailable');
      },
    };
    const store = createPendingShareStore(failing, () => 1_000);
    await expect(store.put(share())).resolves.toBeUndefined();
    await expect(store.read()).resolves.toBeNull();
    await expect(store.reset()).resolves.toBeUndefined();
  });
});
