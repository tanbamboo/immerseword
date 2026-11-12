import { beforeEach, describe, expect, it } from 'vitest';
import { createVocabStore, type VocabStorageLike } from '../../src/shared/vocab';
import type { WordStatus } from '../../src/shared/types';

function fakeStorage() {
  const data = new Map<string, unknown>();
  const storage: VocabStorageLike = {
    async get(keys) {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (data.has(k)) out[k] = data.get(k);
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    },
  };
  return { storage, dump: () => data };
}

describe('vocab store', () => {
  let setup: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    setup = fakeStorage();
  });

  it('returns undefined for unseen lemmas', async () => {
    const store = createVocabStore(setup.storage);
    expect(await store.statusOf('serendipity')).toBeUndefined();
    expect(await store.getEntry('serendipity')).toBeUndefined();
  });

  it('persists status changes and preserves history fields', async () => {
    const store = createVocabStore(setup.storage);
    const first = await store.setStatus('petrichor', 'unknown');
    expect(first.status).toBe('unknown');
    expect(first.timesSeen).toBe(1);

    const bumped = await store.setStatus('petrichor', 'learning');
    expect(bumped.status).toBe('learning');
    expect(bumped.timesSeen).toBe(2);
    expect(bumped.firstSeen).toBe(first.firstSeen);
    expect(bumped.lastSeen).toBeGreaterThanOrEqual(first.lastSeen);

    expect(await store.statusOf('petrichor')).toBe('learning');
  });

  it('bumpLookup records lookups without inventing status changes', async () => {
    const store = createVocabStore(setup.storage);
    await store.setStatus('gossamer', 'learning');
    await store.bumpLookup('gossamer');
    const entry = await store.getEntry('gossamer');
    expect(entry?.lookupCount).toBe(1);
    expect(entry?.status).toBe('learning'); // unchanged
  });

  it('all() exposes the full map for the side panel', async () => {
    const store = createVocabStore(setup.storage);
    await store.setStatus('a', 'known');
    await store.setStatus('b', 'ignored');
    const all = await store.all();
    expect(Object.keys(all).sort()).toEqual(['a', 'b']);
    expect(all['a']?.status).toBe('known');
  });

  it('cycles through statuses like a learner would', async () => {
    const store = createVocabStore(setup.storage);
    const journey: WordStatus[] = ['unknown', 'learning', 'known'];
    for (const status of journey) await store.setStatus('ephemeral', status);
    expect((await store.getEntry('ephemeral'))?.status).toBe('known');
    expect((await store.getEntry('ephemeral'))?.timesSeen).toBe(3);
  });

  it('addExample records sentences newest-first, capped at three', async () => {
    const store = createVocabStore(setup.storage);
    await store.setStatus('gossamer', 'learning');
    for (const n of ['first', 'second', 'third', 'fourth']) {
      await store.addExample('gossamer', { text: `the ${n} sentence.`, url: `https://a.example/${n}` });
    }
    const entry = await store.getEntry('gossamer');
    expect(entry?.examples?.map((e) => e.text)).toEqual([
      'the fourth sentence.',
      'the third sentence.',
      'the second sentence.',
    ]);
    expect(entry?.examples?.[0]?.url).toBe('https://a.example/fourth');
    expect(entry?.examples?.[0]?.capturedAt).toBeGreaterThan(0);
  });

  it('addExample dedupes identical text and refreshes its recency', async () => {
    const store = createVocabStore(setup.storage);
    await store.addExample('petrichor', { text: 'one.', url: 'https://a/1' });
    await store.addExample('petrichor', { text: 'two.', url: 'https://a/2' });
    const older = (await store.getEntry('petrichor'))?.examples?.find((e) => e.text === 'one.');
    await new Promise((r) => setTimeout(r, 2)); // capturedAt advances
    await store.addExample('petrichor', { text: 'one.', url: 'https://a/1-again' });
    const entry = await store.getEntry('petrichor');
    expect(entry?.examples?.map((e) => e.text)).toEqual(['one.', 'two.']);
    expect(entry?.examples?.[0]?.url).toBe('https://a/1-again');
    expect(entry?.examples?.[0]?.capturedAt).toBeGreaterThan(older!.capturedAt);
  });

  it('addExample creates a missing entry defaulting to unknown', async () => {
    const store = createVocabStore(setup.storage);
    const entry = await store.addExample('quixotic', { text: 'seen once.', url: 'https://a/' });
    expect(entry.status).toBe('unknown');
    expect(entry.examples).toHaveLength(1);
    expect((await store.getEntry('quixotic'))?.examples?.[0]?.text).toBe('seen once.');
  });

  it('setStatus and bumpLookup preserve captured examples', async () => {
    const store = createVocabStore(setup.storage);
    await store.setStatus('ephemeral', 'learning');
    await store.addExample('ephemeral', { text: 'a sentence.', url: 'https://a/' });
    await store.setStatus('ephemeral', 'known');
    await store.bumpLookup('ephemeral');
    const entry = await store.getEntry('ephemeral');
    expect(entry?.status).toBe('known');
    expect(entry?.lookupCount).toBe(1);
    expect(entry?.examples?.map((e) => e.text)).toEqual(['a sentence.']);
  });
});
