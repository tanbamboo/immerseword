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

  it('prefers the lemma rank (learner knowledge attaches to lemmas)', () => {
    expect(index.rankOf('study')).toBe(4);
    expect(index.rankOf('studies')).toBe(4); // lemma 'study' outranks any surface listing
  });

  it('falls back to the surface rank when the lemma is unlisted', () => {
    expect(index.rankOf('running')).toBe(6); // 'run' not in list → surface rank
    expect(index.rankOf('houses')).toBe(5); // 'house' listed → lemma rank
  });

  it('never lets a bogus rare "lemma" outrank a common surface', () => {
    // Regression: the real corpus contains the rare word "fam" (~19k), so
    // suffix rules "validated" family→fam and every "family" got flagged.
    const corpus = [...Array(400).keys()].map((i) => `zz${i}`);
    corpus[3] = 'family'; // rank 4
    corpus[399] = 'fam'; // rank 400 — the trap
    const index = createFrequencyIndex(corpus, (s) =>
      createLemmatizer({ knownLemmas: new Set(corpus) }).lemma(s),
    );
    expect(index.rank('fam')).toBe(400); // junk lemma exists in corpus…
    expect(index.rankOf('family')).toBe(4); // …but never wins over the surface
    expect(index.resolveForm('family')).toBe('family');
    expect(index.isRarerThan('family', '5k')).toBe(false);
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
    // Lemma-first: 'studying' (surface 6255) counts as its lemma 'study'
    // (rank 484) — a learner who knows "study" knows "studying".
    expect(index.rankOf('studying')).toBe(index.rankOf('study'));
    // Inflections of unlisted lemmas fall back to their surface rank.
    expect(index.rankOf('observes')).toBe(index.rankOf('observe'));
    expect(index.isRarerThan('study', '2k')).toBe(false);
    expect(index.isRarerThan('serendipity', '20k')).toBe(true); // absent → rare
  });
});
