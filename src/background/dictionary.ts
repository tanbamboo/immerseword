/**
 * Monolingual dictionary service (ADR-0002). Lookup chain:
 *
 *   1. bundled offline core (dict-core.json, WordNet-derived)
 *   2. chrome.storage.local LRU cache (positives + negative TTL entries)
 *   3. Free Dictionary API (dictionaryapi.dev) when online fallback is on
 *
 * Dependencies are injected so unit tests never touch the network.
 */

import { createLemmatizer } from '../shared/lemmatizer';
import type { DictionaryEntry, DictionarySense, IwSettings } from '../shared/types';

/** dict-core.json value: lemma → senses of [posCode, definition, example?]. */
export type CoreDictionary = Record<string, Array<[string, string] | [string, string, string]>>;

const POS_LABEL: Record<string, string> = {
  n: 'noun',
  v: 'verb',
  a: 'adjective',
  s: 'adjective',
  r: 'adverb',
};

export type DictSource = 'core' | 'api' | 'cache' | 'none';

export interface LookupResult {
  lemma: string;
  entry: DictionaryEntry | null;
  source: DictSource;
}

export interface LocalStorageLike {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface FetchLike {
  (url: string, init?: { signal?: AbortSignal }): Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }>;
}

const CACHE_KEY = 'iw:dictCache';
const CACHE_CAP = 2_000;
const CACHE_PRUNE = 400; // dropped from the oldest end when cap is exceeded
const NEGATIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CacheShape {
  [lemma: string]: { e?: DictionaryEntry; neg?: number }; // neg = timestamp
}

export interface DictionaryDeps {
  fetchImpl: FetchLike;
  storage: LocalStorageLike;
  loadCore: () => Promise<CoreDictionary | null>;
  getSettings: () => Promise<IwSettings>;
}

export function createDictionaryService(deps: DictionaryDeps) {
  let corePromise: Promise<CoreDictionary | null> | null = null;
  /** Lemmatizer validated against core headwords; built once core loads. */
  let lemmatizer: ReturnType<typeof createLemmatizer> | null = null;

  const core = (): Promise<CoreDictionary | null> => {
    if (!corePromise) {
      corePromise = deps.loadCore().catch((err: unknown) => {
        // Transient fetch failure (e.g. the worker was torn down mid-load
        // on extension reload): do NOT cache the failure — retry on the
        // next lookup instead of degrading the worker's whole lifetime.
        corePromise = null;
        console.warn('[ImmerseWord] core dictionary unavailable, will retry:', err);
        return null;
      });
    }
    return corePromise;
  };

  function fromCore(lemma: string, data: CoreDictionary | null): DictionaryEntry | null {
    const senses = data?.[lemma];
    if (!senses || senses.length === 0) return null;
    return {
      lemma,
      senses: senses.map((s) => {
        const sense: DictionarySense = {
          partOfSpeech: POS_LABEL[s[0]] ?? s[0],
          definition: s[1],
        };
        if (s[2]) sense.example = s[2];
        return sense;
      }),
    };
  }

  async function readCache(lemma: string): Promise<LookupResult | null> {
    const found = await deps.storage.get([CACHE_KEY]);
    const cache = (found[CACHE_KEY] ?? {}) as CacheShape;
    const hit = cache[lemma];
    if (!hit) return null;
    if (hit.e) return { lemma, entry: hit.e, source: 'cache' };
    if (hit.neg && Date.now() - hit.neg < NEGATIVE_TTL_MS) {
      return { lemma, entry: null, source: 'none' };
    }
    return null; // expired negative — treat as miss
  }

  async function writeCache(lemma: string, value: { e?: DictionaryEntry; neg?: number }) {
    const found = await deps.storage.get([CACHE_KEY]);
    const cache = (found[CACHE_KEY] ?? {}) as CacheShape;
    delete cache[lemma]; // re-insert so key order reflects recency
    cache[lemma] = value;
    const keys = Object.keys(cache);
    if (keys.length > CACHE_CAP) {
      for (const k of keys.slice(0, CACHE_PRUNE)) delete cache[k];
    }
    await deps.storage.set({ [CACHE_KEY]: cache });
  }

  async function fromApi(lemma: string): Promise<LookupResult> {
    try {
      const res = await deps.fetchImpl(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(lemma)}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (!res.ok) {
        if (res.status === 404) await writeCache(lemma, { neg: Date.now() });
        return { lemma, entry: null, source: 'none' };
      }
      const entry = normalizeApiEntry(lemma, await res.json());
      if (!entry) return { lemma, entry: null, source: 'none' };
      await writeCache(lemma, { e: entry });
      return { lemma, entry, source: 'api' };
    } catch {
      // Network unavailable / timeout: no negative cache — retry next time.
      return { lemma, entry: null, source: 'none' };
    }
  }

  return {
    async lookup(rawLemma: string): Promise<LookupResult> {
      const surface = rawLemma.toLowerCase().trim();
      if (!surface) return { lemma: surface, entry: null, source: 'none' };

      const coreData = await core();

      // A surface with its own core entry keeps itself ("roughly", "evening"
      // are headwords, not inflections). Only a core miss resolves against
      // headwords: possessives → the noun ("market's" → "market"), unlisted
      // inflections → the base ("hoped" → "hope", "studies" → "study").
      let lemma = surface;
      if (!coreData?.[surface]) {
        if (coreData) {
          lemmatizer ??= createLemmatizer({ knownLemmas: new Set(Object.keys(coreData)) });
          const resolved = lemmatizer.lemma(surface);
          if (coreData[resolved]) lemma = resolved;
        }
      }

      const coreEntry = fromCore(lemma, coreData);
      if (coreEntry) return { lemma, entry: coreEntry, source: 'core' };

      const cached = await readCache(lemma);
      if (cached) return cached;

      const settings = await deps.getSettings();
      if (!settings.onlineFallback) return { lemma, entry: null, source: 'none' };

      return fromApi(lemma);
    },
  };
}

/** Maps a Free Dictionary API response array to our DictionaryEntry shape. */
export function normalizeApiEntry(lemma: string, body: unknown): DictionaryEntry | null {
  if (!Array.isArray(body) || body.length === 0) return null;
  const first = body[0] as {
    phonetic?: string;
    phonetics?: Array<{ text?: string }>;
    meanings?: Array<{
      partOfSpeech?: string;
      definitions?: Array<{ definition?: string; example?: string }>;
    }>;
  };
  const phonetic =
    first.phonetic ?? first.phonetics?.map((p) => p.text).find((t) => !!t && t.length > 0);
  const senses: DictionarySense[] = [];
  for (const meaning of first.meanings ?? []) {
    const def = meaning.definitions?.[0];
    if (!def?.definition) continue;
    const sense: DictionarySense = {
      partOfSpeech: meaning.partOfSpeech,
      definition: def.definition,
    };
    if (def.example) sense.example = def.example;
    senses.push(sense);
    if (senses.length >= 3) break;
  }
  if (senses.length === 0) return null;
  const entry: DictionaryEntry = { lemma, senses };
  if (phonetic) entry.phonetic = phonetic;
  return entry;
}
