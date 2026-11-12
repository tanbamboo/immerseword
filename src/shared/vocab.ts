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
  /** Sentences captured where the word was marked Learning (SIP-002). */
  examples?: VocabExample[];
}

/** A personal example sentence (SIP-002), newest first, capped at MAX_WORD_EXAMPLES. */
export interface VocabExample {
  text: string;
  /** Page origin + pathname (query/hash stripped, PRD §8). */
  url: string;
  capturedAt: number;
}

export const MAX_WORD_EXAMPLES = 3;

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
  addExample(lemma: string, example: { text: string; url: string }): Promise<VocabEntry>;
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
        examples: prev?.examples,
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
        examples: prev?.examples,
      };
      await write(all);
    },
    async addExample(lemma, example) {
      const all = await readAll();
      const prev = all[lemma];
      const now = Date.now();
      // A re-met sentence moves to the front with a fresh capturedAt.
      const kept = (prev?.examples ?? []).filter((e) => e.text !== example.text);
      const fresh: VocabExample = { text: example.text, url: example.url, capturedAt: now };
      const entry: VocabEntry = {
        status: prev?.status ?? 'unknown',
        firstSeen: prev?.firstSeen ?? now,
        lastSeen: now,
        timesSeen: prev?.timesSeen ?? 0,
        lookupCount: prev?.lookupCount ?? 0,
        examples: [fresh, ...kept].slice(0, MAX_WORD_EXAMPLES),
      };
      all[lemma] = entry;
      await write(all);
      return entry;
    },
    async all() {
      return readAll();
    },
  };
}
