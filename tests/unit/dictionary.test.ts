import { describe, expect, it } from 'vitest';
import {
  cleanSynonyms,
  createDictionaryService,
  normalizeApiEntry,
  normalizeMwLearnersEntry,
  type CoreDictionary,
} from '../../src/background/dictionary';
import { DEFAULT_SETTINGS, type IwSettings } from '../../src/shared/types';

function fakeStorage() {
  const data = new Map<string, unknown>();
  return {
    async get(keys: string[]) {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (data.has(k)) out[k] = data.get(k);
      return out;
    },
    async set(items: Record<string, unknown>) {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    },
    dump: () => data,
  };
}

const CORE: CoreDictionary = {
  study: { s: [['n', 'a detailed critical inspection']] },
  happy: {
    s: [['a', 'enjoying or showing joy'], ['adj2', 'well expressed']],
    syn: ['Felicitous', 'glad', 'glad', 'happy', 'x', 'well'],
  },
  shape: { s: [['n', 'the external form of something'], ['v', 'give form to']] },
  roughly: { s: [['r', 'about; approximately']] },
  rough: { s: [['a', 'having an uneven surface']] },
  market: { s: [['n', 'a place where goods are traded']] },
  hope: { s: [['v', 'expect and wish']] },
};

function apiResponse(lemma: string) {
  return [
    {
      word: lemma,
      phonetic: '/səˈlendɪpɪti/',
      phonetics: [{ text: '/səˈlendɪpɪti/' }, { text: '' }],
      meanings: [
        {
          partOfSpeech: 'noun',
          definitions: [
            { definition: 'good luck in making unexpected discoveries', example: 'a fortunate find' },
          ],
        },
      ],
    },
  ];
}

const MW_LEARNERS_FIXTURE = [
  {
    meta: { id: 'qat' },
    hwi: { hw: 'qat', prs: [{ mw: 'ˈkɑːt' }] },
    fl: 'noun',
    def: [
      {
        fl: 'noun',
        senses: [
          {
            dt: [
              ['text', 'a plant whose leaves are chewed {it}as a stimulant{/it}'],
              ['vis', [{ t: 'The leaves of the qat plant are chewed.' }]],
            ],
          },
        ],
      },
    ],
  },
];

function makeService(overrides: { settings?: IwSettings; mwKey?: string } = {}) {
  const storage = fakeStorage();
  const fetchCalls: string[] = [];
  const service = createDictionaryService({
    fetchImpl: (async (url: string) => {
      fetchCalls.push(url);
      if (url.includes('dictionaryapi.com') && url.includes('/qat')) {
        return { ok: true, status: 200, json: async () => MW_LEARNERS_FIXTURE };
      }
      if (url.endsWith('/serendipity')) {
        return { ok: true, status: 200, json: async () => apiResponse('serendipity') };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }) as never,
    storage,
    loadCore: async () => CORE,
    getSettings: async () => overrides.settings ?? DEFAULT_SETTINGS,
    getMwKey: async () => overrides.mwKey ?? '',
  });
  return { service, storage, fetchCalls };
}

describe('dictionary service — lookup chain', () => {
  it('resolves bundled core words instantly without cache or network', async () => {
    const { service, storage, fetchCalls } = makeService();
    const result = await service.lookup('study');
    expect(result.source).toBe('core');
    expect(result.entry?.senses[0]?.definition).toBe('a detailed critical inspection');
    expect(result.entry?.senses[0]?.partOfSpeech).toBe('noun');
    expect(fetchCalls).toHaveLength(0);
    expect(storage.dump().size).toBe(0);
  });

  it('resolves surfaces against core headwords before the chain (bug-2026-11-11-003)', async () => {
    const { service, fetchCalls } = makeService();
    // Own-headword surfaces keep themselves — never a related word's entry.
    const roughly = await service.lookup('roughly');
    expect(roughly.source).toBe('core');
    expect(roughly.lemma).toBe('roughly');
    expect(roughly.entry?.senses[0]?.definition).toBe('about; approximately');
    // Possessive is not a headword → possessed noun's entry.
    const possessive = await service.lookup("market's");
    expect(possessive.source).toBe('core');
    expect(possessive.lemma).toBe('market');
    // Unlisted inflection → base headword's entry.
    const hoped = await service.lookup('hoped');
    expect(hoped.source).toBe('core');
    expect(hoped.lemma).toBe('hope');
    expect(hoped.entry?.senses[0]?.definition).toBe('expect and wish');
    // Inflections whose base is not in core stay themselves for the API.
    const embedding = await service.lookup('embedding');
    expect(embedding.source).toBe('none');
    expect(embedding.lemma).toBe('embedding');
    expect(fetchCalls.some((url) => url.endsWith('/embedding'))).toBe(true);
  });

  it('normalizes case and skips empty input', async () => {
    const { service } = makeService();
    expect((await service.lookup('Study')).source).toBe('core');
    expect((await service.lookup('  ')).source).toBe('none');
  });

  it('fetches the API for non-core words, then serves from cache', async () => {
    const { service, fetchCalls } = makeService();
    const first = await service.lookup('serendipity');
    expect(first.source).toBe('api');
    expect(first.entry?.phonetic).toBe('/səˈlendɪpɪti/');
    expect(first.entry?.senses[0]?.example).toBe('a fortunate find');
    expect(fetchCalls).toHaveLength(1);

    const second = await service.lookup('serendipity');
    expect(second.source).toBe('cache');
    expect(second.entry?.lemma).toBe('serendipity');
    expect(fetchCalls).toHaveLength(1); // no refetch
  });

  it('negative-caches 404s so unknown words never hit the network twice', async () => {
    const { service, fetchCalls } = makeService();
    expect((await service.lookup('zzzqqq')).source).toBe('none');
    expect((await service.lookup('zzzqqq')).source).toBe('none');
    expect(fetchCalls).toHaveLength(1);
  });

  it('does not go online when onlineFallback is disabled', async () => {
    const { service, fetchCalls } = makeService({ settings: { ...DEFAULT_SETTINGS, onlineFallback: false } });
    expect((await service.lookup('serendipity')).source).toBe('none');
    expect(fetchCalls).toHaveLength(0);
  });

  it('network errors return none without negative caching', async () => {
    const storage = fakeStorage();
    const service = createDictionaryService({
      fetchImpl: (async () => {
        throw new Error('offline');
      }) as never,
      storage,
      loadCore: async () => null, // no core at all
      getSettings: async () => DEFAULT_SETTINGS,
    getMwKey: async () => '',
    });
    expect((await service.lookup('serendipity')).source).toBe('none');
    expect((await service.lookup('serendipity')).source).toBe('none');
    expect(storage.dump().size).toBe(0); // nothing cached
  });

  it('retries a failed core load on the next lookup instead of caching it (bug-2026-11-11-006)', async () => {
    let attempts = 0;
    const service = createDictionaryService({
      fetchImpl: (async (url: string) => {
        return { ok: false, status: 404, json: async () => ({}) };
      }) as never,
      storage: fakeStorage(),
      loadCore: async () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return CORE;
      },
      getSettings: async () => ({ ...DEFAULT_SETTINGS, onlineFallback: false }),
    getMwKey: async () => '',
    });

    // First lookup: core load fails transiently → degrades (offline → none)…
    const degraded = await service.lookup('study');
    expect(degraded.source).toBe('none');
    expect(attempts).toBe(1);

    // …but the failure is not cached: the next lookup retries and recovers.
    const recovered = await service.lookup('study');
    expect(recovered.source).toBe('core');
    expect(recovered.lemma).toBe('study');
    expect(attempts).toBe(2);
  });

  it('survives a missing core dictionary (online-only degradation)', async () => {
    const { service } = makeService();
    const custom = createDictionaryService({
      fetchImpl: (async (_url: string) => ({ ok: false, status: 404, json: async () => ({}) })) as never,
      storage: fakeStorage(),
      loadCore: async () => null,
      getSettings: async () => DEFAULT_SETTINGS,
    getMwKey: async () => '',
    });
    expect((await custom.lookup('study')).source).toBe('none');
    expect((await service.lookup('study')).source).toBe('core'); // sanity
  });
});

describe('dictionary cache — LRU pruning', () => {
  it('prunes oldest entries when the cap is exceeded', async () => {
    const storage = fakeStorage();
    const service = createDictionaryService({
      fetchImpl: (async () => ({ ok: false, status: 404, json: async () => ({}) })) as never,
      storage,
      loadCore: async () => null,
      getSettings: async () => DEFAULT_SETTINGS,
    getMwKey: async () => '',
    });
    for (let i = 0; i < 2_050; i++) {
      await service.lookup(`w${i}q`); // 404 → negative cache entries
    }
    const cache = storage.dump().get('iw:dictCache') as Record<string, unknown>;
    expect(Object.keys(cache).length).toBe(1_650); // 2050 − 400 pruned
    expect(cache['w0q']).toBeUndefined(); // oldest gone
    expect(cache['w2049q']).toBeDefined(); // newest kept
  });
});

describe('normalizeApiEntry', () => {
  it('caps senses at 3 and prefers definitions with examples', () => {
    const entry = normalizeApiEntry('word', [
      {
        word: 'word',
        meanings: [1, 2, 3, 4].map((i) => ({
          partOfSpeech: i === 1 ? 'noun' : 'verb',
          definitions: [{ definition: `sense ${i}`, example: i === 2 ? 'an example' : undefined }],
        })),
      },
    ]);
    expect(entry?.senses).toHaveLength(3);
    expect(entry?.senses[1]?.example).toBe('an example');
  });

  it('returns null for empty or malformed bodies', () => {
    expect(normalizeApiEntry('x', [])).toBeNull();
    expect(normalizeApiEntry('x', [{ word: 'x' }])).toBeNull();
    expect(normalizeApiEntry('x', [{ word: 'x', meanings: [{ definitions: [] }] }])).toBeNull();
  });
});

describe('synonyms (SIP-005)', () => {
  it('core entries carry cleaned same-synset words', async () => {
    const { service } = makeService();
    const result = await service.lookup('happy');
    expect(result.source).toBe('core');
    // lowercased, deduped, headword and single letters dropped
    expect(result.entry?.synonyms).toEqual(['felicitous', 'glad', 'well']);
  });

  it('entries without syn data simply have no synonyms', async () => {
    const { service } = makeService();
    expect((await service.lookup('study')).entry?.synonyms).toBeUndefined();
  });

  it('normalizes API synonyms from meanings and definitions', () => {
    const entry = normalizeApiEntry('serendipity', [
      {
        word: 'serendipity',
        meanings: [
          {
            partOfSpeech: 'noun',
            synonyms: ['lucky strike', 'fluke'],
            definitions: [
              { definition: 'good luck in discovery', synonyms: ['serendipity', 'FLUKE', 'chance'] },
            ],
          },
        ],
      },
    ]);
    // multiword dropped, case folded, deduped, headword excluded
    expect(entry?.synonyms).toEqual(['fluke', 'chance']);
  });

  it('cleanSynonyms caps at 8', () => {
    const words = Array.from({ length: 12 }, (_, i) => `w${'abcdefghijkl'[i]}${'mnopqrstuvwxyz'[i]}`);
    expect(words).toHaveLength(12); // e.g. wam, wbn … letter-only, all valid
    expect(cleanSynonyms(words, 'lemma')).toHaveLength(8);
    expect(cleanSynonyms('not-an-array' as never, 'lemma')).toEqual([]);
  });
});

describe("Merriam-Webster Learner's tier (SIP-012)", () => {
  const MW_BODY = [
    {
      meta: { id: 'copiously' },
      hwi: { hw: 'copiously', prs: [{ mw: 'ˈkoʊ-pi-əs-li', sound: { audio: 'copio01' } }] },
      fl: 'adverb',
      def: [
        {
          fl: 'adverb',
          senses: [
            {
              dt: [
                ['text', 'in large amounts {it}rained copiously{/it}'],
                ['vis', [{ t: 'He wrote copiously on the subject.' }]],
              ],
            },
          ],
        },
      ],
    },
  ];

  it('normalizes the MW learners shape: phonetics, POS, sense, example', () => {
    const entry = normalizeMwLearnersEntry('copiously', MW_BODY);
    expect(entry?.lemma).toBe('copiously');
    expect(entry?.phonetic).toBe('/ˈkoʊ-pi-əs-li/');
    expect(entry?.senses).toHaveLength(1);
    expect(entry?.senses[0]?.partOfSpeech).toBe('adverb');
    expect(entry?.senses[0]?.definition).toBe('in large amounts rained copiously');
    expect(entry?.senses[0]?.example).toBe('He wrote copiously on the subject.');
  });

  it('returns null for empty or malformed bodies', () => {
    expect(normalizeMwLearnersEntry('x', [])).toBeNull();
    expect(normalizeMwLearnersEntry('x', [{ meta: { id: 'x' } }])).toBeNull();
  });

  it('answers last: only after core miss, cache miss, and dev miss', async () => {
    const { service, storage, fetchCalls } = makeService({ mwKey: 'test-key' });
    const result = await service.lookup('qat');
    expect(fetchCalls.some((u) => u.includes('dictionaryapi.dev'))).toBe(true);
    expect(fetchCalls.some((u) => u.includes('dictionaryapi.com') && u.includes('key=test-key'))).toBe(true);
    expect(result.source).toBe('mw');
    expect(result.entry?.senses[0]?.definition).toBe('a plant whose leaves are chewed as a stimulant');
    // Cached: the second lookup makes no network calls at all.
    const again = await service.lookup('qat');
    expect(again.source).toBe('cache');
    expect(fetchCalls.filter((u) => u.includes('dictionaryapi.com'))).toHaveLength(1);
    expect(storage.dump().size).toBeGreaterThan(0);
  });

  it('never contacts MW without a key', async () => {
    const { service, fetchCalls } = makeService();
    await service.lookup('qat'); // core miss → dev 404 → no key → none
    expect(fetchCalls.some((u) => u.includes('dictionaryapi.com'))).toBe(false);
  });

  it('a MW 404 ends the chain as none', async () => {
    const { service } = makeService({ mwKey: 'test-key' });
    const result = await service.lookup('zzzznope');
    expect(result.source).toBe('none');
    expect(result.entry).toBeNull();
  });
});
