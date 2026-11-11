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
    expect(payload.version).toBe(1);
    expect(payload.settings.level).toBe('5k');
    expect(payload.vocabulary.serendipity?.status).toBe('learning');
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
});
