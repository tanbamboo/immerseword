/**
 * Personal vocabulary store (ADR-0003 layer 2). Persisted in
 * chrome.storage.local as one map of lemma → entry. Both the content script
 * and the side panel use this module directly against the same storage
 * area; cross-context updates propagate via chrome.storage.onChanged.
 */

import type { WordStatus } from './types';

export interface VocabEntry {
  status: WordStatus;
  firstSeen: number;
  lastSeen: number;
  timesSeen: number;
  lookupCount: number;
}

export interface VocabStorageLike {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const KEY = 'iw:vocab';

export interface VocabStore {
  statusOf(lemma: string): Promise<WordStatus | undefined>;
  getEntry(lemma: string): Promise<VocabEntry | undefined>;
  setStatus(lemma: string, status: WordStatus): Promise<VocabEntry>;
  bumpLookup(lemma: string): Promise<void>;
  all(): Promise<Record<string, VocabEntry>>;
}

export function createVocabStore(storage: VocabStorageLike): VocabStore {
  async function readAll(): Promise<Record<string, VocabEntry>> {
    const found = await storage.get([KEY]);
    return (found[KEY] ?? {}) as Record<string, VocabEntry>;
  }

  async function write(next: Record<string, VocabEntry>): Promise<void> {
    await storage.set({ [KEY]: next });
  }

  return {
    async statusOf(lemma) {
      return (await readAll())[lemma]?.status;
    },
    async getEntry(lemma) {
      return (await readAll())[lemma];
    },
    async setStatus(lemma, status) {
      const all = await readAll();
      const now = Date.now();
      const prev = all[lemma];
      const entry: VocabEntry = {
        status,
        firstSeen: prev?.firstSeen ?? now,
        lastSeen: now,
        timesSeen: (prev?.timesSeen ?? 0) + 1,
        lookupCount: prev?.lookupCount ?? 0,
      };
      all[lemma] = entry;
      await write(all);
      return entry;
    },
    async bumpLookup(lemma) {
      const all = await readAll();
      const prev = all[lemma];
      const now = Date.now();
      all[lemma] = {
        status: prev?.status ?? 'unknown',
        firstSeen: prev?.firstSeen ?? now,
        lastSeen: now,
        timesSeen: prev?.timesSeen ?? 0,
        lookupCount: (prev?.lookupCount ?? 0) + 1,
      };
      await write(all);
    },
    async all() {
      return readAll();
    },
  };
}
