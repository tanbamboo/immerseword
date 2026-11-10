import { describe, expect, it } from 'vitest';
import { tokenize, isAcronym } from '../../src/shared/tokenizer';
import { createFrequencyIndex } from '../../src/shared/frequency';
import { createLemmatizer } from '../../src/shared/lemmatizer';

describe('tokenizer', () => {
  it('finds words with offsets', () => {
    const tokens = tokenize('The quick brown fox!');
    expect(tokens.map((t) => t.text)).toEqual(['The', 'quick', 'brown', 'fox']);
    const quick = tokens[1]!;
    expect('The quick brown'.slice(quick.start, quick.end)).toBe('quick');
  });

  it('keeps contractions together', () => {
    // Trailing apostrophe without following letters is dropped ("believin'").
    expect(tokenize("don't stop believin'").map((t) => t.text)).toEqual([
      "don't",
      'stop',
      'believin',
    ]);
  });

  it('handles curly apostrophes', () => {
    expect(tokenize('it’s Sarah’s').map((t) => t.text)).toEqual(['it’s', 'Sarah’s']);
  });

  it('skips single letters and pure digits', () => {
    // 'a', 'I' are single letters; digits split 'b7x' into 'b' and 'x' (both single) → nothing survives
    expect(tokenize('a 42 I b7x').map((t) => t.text)).toEqual([]);
  });

  it('detects acronyms', () => {
    expect(isAcronym('NASA')).toBe(true);
    expect(isAcronym('BBC')).toBe(true);
    expect(isAcronym('Hello')).toBe(false);
    expect(isAcronym('I')).toBe(false);
  });
});

describe('frequency index', () => {
  // Ordered list: rank = index + 1. 'study' rank 4, 'running' rank 6.
  const words = ['the', 'of', 'and', 'study', 'house', 'running', 'observe'];
  const index = createFrequencyIndex(words, (s) => createLemmatizer({ knownLemmas: new Set(words) }).lemma(s));

  it('returns surface rank first', () => {
    expect(index.rankOf('study')).toBe(4);
    expect(index.rankOf('running')).toBe(6); // surface listed → its own rank
  });

  it('falls back to lemma rank for inflections', () => {
    expect(index.rankOf('studies')).toBe(4); // lemma 'study'
    expect(index.rankOf('houses')).toBe(5); // lemma 'house'
  });

  it('returns 0 for rare/unknown words', () => {
    expect(index.rankOf('serendipity')).toBe(0);
  });

  it('classifies against bands', () => {
    expect(index.isRarerThan('observe', '2k')).toBe(false); // rank 7 — within the 2k band
    expect(index.isRarerThan('study', '20k')).toBe(false); // rank 4 ≤ 20000
    expect(index.isRarerThan('serendipity', '2k')).toBe(true); // unknown → rare
    expect(index.isRarerThan('serendipity', '20k')).toBe(true);
  });
});

describe('frequency index over real bundled data', () => {
  it('resolves corpus ranks for study/beautiful and flags rare words', async () => {
    const { readFile } = await import('node:fs/promises');
    const words = JSON.parse(await readFile('public/data/frequency.json', 'utf8')) as string[];
    const index = createFrequencyIndex(words, (s) => createLemmatizer({ knownLemmas: new Set(words) }).lemma(s));
    expect(words.length).toBeGreaterThan(19_000);

    expect(index.rankOf('study')).toBeGreaterThan(0);
    expect(index.rankOf('the')).toBeLessThan(5);
    // Surface-first design: listed inflections keep their own corpus rank…
    expect(index.rankOf('studying')).toBeGreaterThan(0);
    // …while unlisted inflections fall back to their lemma's rank
    // ('observes' is not in the corpus list; 'observe' is rank 7565).
    expect(index.rankOf('observes')).toBe(index.rankOf('observe'));
    expect(index.isRarerThan('study', '2k')).toBe(false);
    expect(index.isRarerThan('serendipity', '20k')).toBe(true); // absent → rare
  });
});
