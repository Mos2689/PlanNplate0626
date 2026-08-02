// Where a shared link waits.
//
// Two jobs, both about "exactly once":
//
//   1. HOLD a link across a boundary the user has to cross before it can be
//      imported — signing up, finishing onboarding, or (on iOS) opening the app
//      at all. Losing it there would mean asking them to go back and share
//      again, which is the friction this whole feature exists to remove.
//   2. REMEMBER what's already been handled. A share can be delivered more than
//      once: iOS can re-run an extension, Android redelivers an intent after
//      process death, and React remounts on its own schedule. Without a record,
//      each redelivery is an import.
//
// The processed-id set is the FIRST of three idempotency layers. The other two
// are the content-level `hasRecipeWithSourceUrl` pre-check and `addRecipe`'s
// existing upsert (lib/recipe-identity.ts) — so a slip here still cannot create
// a duplicate recipe row, it would only re-run the extraction.

import type { ShareEntryPoint, ShareFailureReason, ShareSourceType } from './types';

/**
 * A share captured from a share sheet, waiting to be imported.
 *
 * This is the DISTILLED form: the raw payload is run through
 * `ingestSharedPayload` the moment it's collected, and only the link survives.
 * The caption never reaches storage — it's user content, it's often long, and
 * it has no use once the link has been found.
 *
 * `url` and `rejectedAs` are mutually exclusive: either we found something
 * importable, or we know exactly why we didn't and can say so without having to
 * keep the text around to re-examine.
 */
export interface PendingShare {
  /** Minted natively at capture. The idempotency key. */
  id: string;
  entryPoint: ShareEntryPoint;
  /** Unix ms, when the app took ownership of it. */
  receivedAt: number;

  url?: string;
  canonicalKey?: string;
  host?: string;
  source?: ShareSourceType;

  /** Set when ingestion refused the payload. No link is retained. */
  rejectedAs?: ShareFailureReason;
}

interface ShareState {
  pending: PendingShare | null;
  /** Bounded FIFO of share ids already imported (or deliberately dropped). */
  processedIds: string[];
}

export const SHARE_STATE_KEY = 'plannplate.share.v1';

/**
 * How long an abandoned share is worth resuming.
 *
 * A week is long enough to survive "I'll sign up later" and short enough that a
 * link the user has forgotten about doesn't silently appear in their recipes a
 * month on.
 */
export const PENDING_SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Enough history to cover redelivery; short enough to stay a cheap read. */
const MAX_PROCESSED_IDS = 50;

const EMPTY: ShareState = { pending: null, processedIds: [] };

/** The slice of AsyncStorage this module needs. Narrow, so tests can stub it. */
export interface ShareKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface PendingShareStore {
  /** The pending share, or null if there is none or it has expired. */
  read(): Promise<PendingShare | null>;
  /** Replace the pending share. A newer share supersedes an unclaimed older one. */
  put(share: PendingShare): Promise<void>;
  /** Drop the pending share without marking it processed (user cancelled). */
  clear(): Promise<void>;
  /** Record an id as handled and drop it from pending. Idempotent. */
  markProcessed(id: string): Promise<void>;
  hasProcessed(id: string): Promise<boolean>;
  /** Wipe everything. Called on sign-out — one account's link is not another's. */
  reset(): Promise<void>;
}

/**
 * Build a store over any key-value backend.
 *
 * Exported as a factory because the unit tests run in a plain node environment
 * (see jest.config.js — no jest-expo, no native mocks), so they inject a Map.
 * Nothing here touches React Native.
 */
export function createPendingShareStore(
  storage: ShareKeyValueStore,
  now: () => number = Date.now,
): PendingShareStore {
  async function load(): Promise<ShareState> {
    try {
      const raw = await storage.getItem(SHARE_STATE_KEY);
      if (!raw) return { ...EMPTY };
      const parsed = JSON.parse(raw) as Partial<ShareState>;
      return {
        pending: parsed.pending ?? null,
        processedIds: Array.isArray(parsed.processedIds) ? parsed.processedIds : [],
      };
    } catch {
      // Corrupt or unreadable state must not wedge the feature. Starting from
      // empty costs at most one re-import, which the content-level dedup
      // absorbs.
      return { ...EMPTY };
    }
  }

  async function save(state: ShareState): Promise<void> {
    try {
      await storage.setItem(SHARE_STATE_KEY, JSON.stringify(state));
    } catch {
      // Best-effort. A failed write means the share is handled in-memory for
      // this session only, which is strictly better than aborting the import.
    }
  }

  return {
    async read() {
      const state = await load();
      if (!state.pending) return null;
      if (now() - state.pending.receivedAt > PENDING_SHARE_TTL_MS) {
        await save({ ...state, pending: null });
        return null;
      }
      return state.pending;
    },

    async put(share) {
      const state = await load();
      if (state.processedIds.includes(share.id)) return;
      await save({ ...state, pending: share });
    },

    async clear() {
      const state = await load();
      if (!state.pending) return;
      await save({ ...state, pending: null });
    },

    async markProcessed(id) {
      const state = await load();
      const processedIds = state.processedIds.includes(id)
        ? state.processedIds
        : [...state.processedIds, id].slice(-MAX_PROCESSED_IDS);
      const pending = state.pending?.id === id ? null : state.pending;
      await save({ pending, processedIds });
    },

    async hasProcessed(id) {
      const { processedIds } = await load();
      return processedIds.includes(id);
    },

    async reset() {
      try {
        await storage.removeItem(SHARE_STATE_KEY);
      } catch {
        // Nothing actionable; the next write overwrites it anyway.
      }
    },
  };
}

// ── Default instance ────────────────────────────────────────────────────────
// AsyncStorage is resolved lazily rather than imported at module scope so this
// file stays importable from the node-environment tests. A static import would
// pull in the native module and fail before a single assertion ran.
let defaultStore: PendingShareStore | null = null;

function getStore(): PendingShareStore {
  if (!defaultStore) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default as ShareKeyValueStore;
    defaultStore = createPendingShareStore(AsyncStorage);
  }
  return defaultStore;
}

export const pendingShares: PendingShareStore = {
  read: () => getStore().read(),
  put: (share) => getStore().put(share),
  clear: () => getStore().clear(),
  markProcessed: (id) => getStore().markProcessed(id),
  hasProcessed: (id) => getStore().hasProcessed(id),
  reset: () => getStore().reset(),
};
