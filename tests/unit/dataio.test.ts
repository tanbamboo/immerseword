import { describe, expect, it } from 'vitest';
import { buildExportPayload, parseImportPayload } from '../../src/shared/dataio';
import { DEFAULT_SETTINGS } from '../../src/shared/types';
import type { VocabEntry } from '../../src/shared/vocab';

const VOCAB: Record<string, VocabEntry> = {
  serendipity: {
    status: 'learning',
    firstSeen: 1,
    lastSeen: 2,
    timesSeen: 3,
    lookupCount: 4,
    examples: [
      { text: 'A fortunate serendipity brought them together.', url: 'https://example.com/story', capturedAt: 5 },
      { text: 'Another serendipity followed.', url: 'https://example.com/other', capturedAt: 6 },
    ],
  },
};

describe('data export', () => {
  it('builds a self-describing payload', () => {
    const payload = buildExportPayload({
      settings: DEFAULT_SETTINGS,
      readerPrefs: { theme: 'sepia', fontFamily: 'serif', fontSize: 19, width: 'medium' },
      vocabulary: VOCAB,
    });
    expect(payload.app).toBe('immerseword');
    expect(payload.version).toBe(2);
    expect(payload.settings.level).toBe('5k');
    expect(payload.vocabulary.serendipity?.status).toBe('learning');
    expect(payload.vocabulary.serendipity?.examples).toHaveLength(2);
    expect(() => JSON.stringify(payload)).not.toThrow();
  });
});

describe('data import', () => {
  const valid = JSON.stringify(
    buildExportPayload({
      settings: { ...DEFAULT_SETTINGS, level: '10k' },
      readerPrefs: { theme: 'dark', fontFamily: 'sans', fontSize: 20, width: 'wide' },
      vocabulary: VOCAB,
    }),
  );

  it('round-trips an export', () => {
    const result = parseImportPayload(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.imported).toBe(1);
    expect(result.vocabulary.serendipity?.status).toBe('learning');
    expect(result.vocabulary.serendipity?.examples?.[0]?.text).toBe('A fortunate serendipity brought them together.');
    expect(result.vocabulary.serendipity?.examples?.[1]?.capturedAt).toBe(6);
    expect(result.settings?.level).toBe('10k');
  });

  it('rejects non-JSON and foreign JSON', () => {
    expect(parseImportPayload('{nope')).toMatchObject({ ok: false });
    expect(parseImportPayload('{"app":"other"}')).toMatchObject({ ok: false });
    expect(parseImportPayload('{"app":"immerseword"}')).toMatchObject({ ok: false }); // no vocab
  });

  it('drops malformed entries but keeps good ones', () => {
    const payload = JSON.parse(valid);
    payload.vocabulary = {
      ...payload.vocabulary,
      'has space': { status: 'known' }, // non-word key dropped
      ghost: { status: 'nonsense' }, // invalid status dropped
      validword: { status: 'known' }, // minimal entry accepted, defaults filled
    };
    const result = parseImportPayload(JSON.stringify(payload));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vocabulary['has space']).toBeUndefined();
    expect(result.vocabulary.ghost).toBeUndefined();
    expect(result.vocabulary.validword?.status).toBe('known');
    expect(result.vocabulary.validword?.timesSeen).toBe(1); // defaulted
    expect(result.imported).toBe(2);
  });

  it('only accepts known setting values', () => {
    const payload = JSON.parse(valid);
    payload.settings = { level: '50k', taggingEnabled: 'yes' };
    const result = parseImportPayload(JSON.stringify(payload));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings?.level).toBeUndefined();
    expect(result.settings?.taggingEnabled).toBeUndefined();
  });

  it('drops malformed example items but keeps valid ones, capped at three', () => {
    const payload = JSON.parse(valid);
    payload.vocabulary.word = {
      status: 'learning',
      examples: [
        { text: 'first met.', url: 'https://a/1', capturedAt: 1 },
        { text: '   ' }, // blank text → dropped
        'not an object', // dropped
        { text: 'second met.', url: 'https://a/2' }, // capturedAt defaulted
        { url: 'https://a/x', capturedAt: 9 }, // no text → dropped
        { text: 'third met.', capturedAt: 3 }, // url defaulted
        { text: 'fourth met.', capturedAt: 4 }, // over the cap → dropped
      ],
    };
    const result = parseImportPayload(JSON.stringify(payload));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const examples = result.vocabulary.word?.examples;
    expect(examples?.map((e) => e.text)).toEqual(['first met.', 'second met.', 'third met.']);
    expect(examples?.[1]?.capturedAt).toBeTypeOf('number');
    expect(examples?.[2]?.url).toBe('');
  });

  it('still imports version-1 exports without examples', () => {
    const payload = JSON.parse(valid);
    payload.version = 1;
    payload.vocabulary.serendipity.examples = undefined;
    const result = parseImportPayload(JSON.stringify(payload));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vocabulary.serendipity?.examples).toBeUndefined();
    expect(result.vocabulary.serendipity?.status).toBe('learning');
  });
});
