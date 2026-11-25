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

/** dict-core.json value (SIP-005): lemma → senses + same-synset synonyms. */
export interface CoreEntry {
  s: Array<[string, string] | [string, string, string]>;
  syn?: string[];
}
export type CoreDictionary = Record<string, CoreEntry>;

const SYN_CAP = 8; // mirrors the build-time cap (SIP-005)

const POS_LABEL: Record<string, string> = {
  n: 'noun',
  v: 'verb',
  a: 'adjective',
  s: 'adjective',
  r: 'adverb',
};

export type DictSource = 'core' | 'api' | 'mw' | 'cache' | 'error' | 'network' | 'none';

/** Why an on-demand learner's lookup has no entry (SIP-013, SBFP-012). */
export type LearnersReason = 'notfound' | 'rejected' | 'nokey' | 'network';

function learnersReasonOf(source: DictSource): LearnersReason {
  if (source === 'error') return 'rejected'; // HTTP 401/403: key refused
  if (source === 'network') return 'network'; // fetch threw / timed out
  return 'notfound';
}

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

// v2 (SBFP-012): the v1 cache holds 7-day negative entries written by the
// broken MW normalizer — the bump orphans them; caches refill on demand.
const CACHE_KEY = 'iw:dictCache2';
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
  /** SIP-012: the Merriam-Webster Learner's key ('' = tier disabled). */
  getMwKey: () => Promise<string>;
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
    const found = data?.[lemma];
    if (!found?.s || found.s.length === 0) return null;
    const entry: DictionaryEntry = {
      lemma,
      senses: found.s.map((s) => {
        const sense: DictionarySense = {
          partOfSpeech: POS_LABEL[s[0]] ?? s[0],
          definition: s[1],
        };
        if (s[2]) sense.example = s[2];
        return sense;
      }),
    };
    const syns = cleanSynonyms(found.syn ?? [], lemma);
    if (syns.length > 0) entry.synonyms = syns;
    return entry;
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

  /**
   * SIP-012 tier 3 — Merriam-Webster Learner's Dictionary, only when the
   * user pasted a key (dictionaryapi.com, free non-commercial tier).
   * 404s negative-cache like the other tiers; auth failures do NOT (the
   * key may be fixed on the options page at any time). `cacheKey`
   * namespaces the on-demand path (SIP-013) so it never pollutes the
   * automatic chain's entries.
   */
  async function fromMwLearners(lemma: string, key: string, cacheKey = lemma): Promise<LookupResult> {
    try {
      const res = await deps.fetchImpl(
        // Host per the official product page (SBFP-013): www.dictionaryapi.com.
        `https://www.dictionaryapi.com/api/v3/references/learners/json/${encodeURIComponent(lemma)}?key=${encodeURIComponent(key)}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (!res.ok) {
        if (res.status === 404) await writeCache(cacheKey, { neg: Date.now() });
        else console.warn('[ImmerseWord] Merriam-Webster Learner\'s request failed:', res.status);
        return { lemma, entry: null, source: res.status === 401 || res.status === 403 ? 'error' : 'none' };
      }
      const entry = normalizeMwLearnersEntry(lemma, await res.json());
      if (!entry) {
        await writeCache(cacheKey, { neg: Date.now() });
        return { lemma, entry: null, source: 'none' };
      }
      await writeCache(cacheKey, { e: entry });
      return { lemma, entry, source: 'mw' };
    } catch (err) {
      // Network unavailable / timeout (SBFP-012): never cached, and the
      // caller can tell it apart from a miss and from an auth refusal.
      console.warn('[ImmerseWord] Merriam-Webster Learner\'s request failed:', err);
      return { lemma, entry: null, source: 'network' };
    }
  }

  return {
    /**
     * SIP-013: on-demand Learner's lookup — straight to the MW tier,
     * cached under a `mw:` namespace so the automatic chain never sees
     * these entries. Reasons: 'nokey' (tier disabled), 'rejected' (the
     * key was refused — point the user at the options page), 'notfound'.
     */
    async lookupLearners(
      rawLemma: string,
    ): Promise<{ entry: DictionaryEntry | null; reason?: LearnersReason }> {
      const surface = rawLemma.toLowerCase().trim();
      if (!surface) return { entry: null, reason: 'notfound' };
      const key = (await deps.getMwKey()).trim();
      if (!key) return { entry: null, reason: 'nokey' };
      const cacheKey = `mw:${surface}`;
      const cached = await readCache(cacheKey);
      if (cached) return cached.entry ? { entry: cached.entry } : { entry: null, reason: 'notfound' };
      const result = await fromMwLearners(surface, key, cacheKey);
      if (result.entry) return { entry: result.entry };
      return { entry: null, reason: learnersReasonOf(result.source) };
    },

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
      if (settings.onlineFallback) {
        const api = await fromApi(lemma);
        if (api.entry) return api;
      }

      // SIP-012: learner's tier — appended last, opt-in via stored key.
      const mwKey = (await deps.getMwKey()).trim();
      if (mwKey) return fromMwLearners(lemma, mwKey);

      return { lemma, entry: null, source: 'none' };
    },
  };
}

/** Dedupes, headword-excludes, caps a raw synonym list (SIP-005). */
export function cleanSynonyms(raw: unknown, lemma: string): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const word = item.toLowerCase().trim();
    if (word === lemma || seen.has(word)) continue;
    if (!/^[a-z]{2,}$/.test(word)) continue; // single letters, multiword, junk
    seen.add(word);
    out.push(word);
    if (out.length >= SYN_CAP) break;
  }
  return out;
}

/** Maps a Free Dictionary API response array to our DictionaryEntry shape. */
export function normalizeApiEntry(lemma: string, body: unknown): DictionaryEntry | null {
  if (!Array.isArray(body) || body.length === 0) return null;
  const first = body[0] as {
    phonetic?: string;
    phonetics?: Array<{ text?: string }>;
    meanings?: Array<{
      partOfSpeech?: string;
      synonyms?: string[];
      definitions?: Array<{ definition?: string; example?: string; synonyms?: string[] }>;
    }>;
  };
  const phonetic =
    first.phonetic ?? first.phonetics?.map((p) => p.text).find((t) => !!t && t.length > 0);
  const senses: DictionarySense[] = [];
  const rawSyns: string[] = [];
  for (const meaning of first.meanings ?? []) {
    rawSyns.push(...(meaning.synonyms ?? []));
    const def = meaning.definitions?.[0];
    if (!def?.definition) continue;
    rawSyns.push(...(def.synonyms ?? []));
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
  const syns = cleanSynonyms(rawSyns, lemma);
  if (syns.length > 0) entry.synonyms = syns;
  return entry;
}

/**
 * SIP-012: maps a Merriam-Webster Learner's JSON response (array) to our
 * DictionaryEntry. Real shape (per dictionaryapi.com's JSON structure
 * reference, SBFP-012): entries[0] carries `hwi.prs[0].mw` (phonetics)
 * and `fl` (part of speech); senses are TAGGED TUPLES inside
 * `def[].sseq[][]` — `["sense", { sn, dt }]`, sometimes wrapped in
 * `["pseq", [ …sense tuples… ]]`. `dt` items are tagged: `["text", …]`
 * is the definition, `["vis", [{ t }]]` the examples. Text may carry
 * `{bc}`/`{it}`/`{wi}` markup, which is stripped.
 */
export function normalizeMwLearnersEntry(lemma: string, body: unknown): DictionaryEntry | null {
  if (!Array.isArray(body) || body.length === 0) return null;
  const first = body[0] as {
    hwi?: { hw?: string; prs?: Array<{ mw?: string; ipa?: string }> };
    fl?: string;
    def?: Array<{ sseq?: unknown[][] }>;
  };
  if (!first.def?.length) return null; // miss: MW suggests words as a string array

  const clean = (text: string): string => text.replace(/\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();

  // Learner's pronunciations carry `ipa` (per the official sample);
  // `mw` covers the collegiate-style shape — accept either.
  const phonetic = first.hwi?.prs
    ?.map((p) => p.ipa ?? p.mw)
    .find((t) => !!t && t.length > 0);
  const senses: DictionarySense[] = [];

  const senseFromTuple = (senseObj: { dt?: Array<[string, unknown]> }): void => {
    const dt = senseObj.dt ?? [];
    const textItem = dt.find(([tag]) => tag === 'text');
    if (!textItem || typeof textItem[1] !== 'string' || !textItem[1].trim()) return;
    const definition = clean(textItem[1]);
    if (!definition) return;
    const senseEntry: DictionarySense = { partOfSpeech: first.fl, definition };
    const visItem = dt.find(([tag]) => tag === 'vis');
    const example = Array.isArray(visItem?.[1])
      ? ((visItem[1] as Array<{ t?: string }>)[0]?.t ?? undefined)
      : undefined;
    if (example) senseEntry.example = clean(example);
    senses.push(senseEntry);
  };

  outer: for (const defGroup of first.def) {
    for (const seq of defGroup.sseq ?? []) {
      for (const tuple of seq ?? []) {
        if (!Array.isArray(tuple) || tuple.length < 2) continue;
        if (tuple[0] === 'sense') {
          senseFromTuple(tuple[1] as { dt?: Array<[string, unknown]> });
        } else if (tuple[0] === 'pseq') {
          // parenthesized sense sequence: its payload is an array of tuples
          for (const inner of (tuple[1] as unknown[]) ?? []) {
            if (Array.isArray(inner) && inner[0] === 'sense') {
              senseFromTuple(inner[1] as { dt?: Array<[string, unknown]> });
            }
          }
        } // "sen"/"bs"/"ri"… carry no plain dt text — skipped
        if (senses.length >= 3) break outer;
      }
    }
  }
  if (senses.length === 0) return null;
  const entry: DictionaryEntry = { lemma, senses };
  if (phonetic) entry.phonetic = `/${phonetic}/`;
  return entry;
}
