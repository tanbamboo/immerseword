import { describe, expect, it } from 'vitest';
import { createLemmatizer, lemmatize } from '../../src/shared/lemmatizer';

// A known-lemma set exercising every suffix rule path.
const KNOWN = new Set([
  'run', 'study', 'stop', 'make', 'believe', 'walk', 'quick', 'happy',
  'dark', 'big', 'small', 'city', 'box', 'church', 'dish', 'glass', 'bus',
  'cat', 'house', 'write', 'good', 'bad', 'child', 'person', 'foot',
  'set', 'read', 'put', 'cut', 'spread',
]);

const lem = createLemmatizer({ knownLemmas: KNOWN });

describe('lemmatizer — irregular table', () => {
  it.each([
    ['went', 'go'], ['ran', 'run'], ['geese', 'goose'], ['children', 'child'],
    ['better', 'good'], ['were', 'be'], ['bought', 'buy'], ['eaten', 'eat'],
    ['mice', 'mouse'], ['worst', 'bad'],
  ])('%s → %s', (surface, lemma) => {
    expect(lem.lemma(surface)).toBe(lemma);
  });
});

describe('lemmatizer — suffix rules with validation', () => {
  it.each([
    ['studies', 'study'],      // ies → y
    ['studied', 'study'],      // ied → y
    ['studying', 'study'],     // ing + validation via 'study'
    ['stopped', 'stop'],       // ed + consonant dedup
    ['running', 'run'],        // ing + dedup
    ['making', 'make'],        // ing + e
    ['believed', 'believe'],   // ed + e
    ['walked', 'walk'],        // ed
    ['boxes', 'box'],          // xes
    ['churches', 'church'],    // ches
    ['glasses', 'glass'],      // sses
    ['houses', 'house'],       // s + e (validated)
    ['cats', 'cat'],           // s
    ['quickly', 'quick'],      // ly
    ['happiness', 'happy'],    // iness → y
    ['darkness', 'dark'],      // ness
    ['bigger', 'big'],         // er + dedup
    ['happier', 'happy'],      // ier → y
    ['smallest', 'small'],     // est
  ])('%s → %s', (surface, lemma) => {
    expect(lem.lemma(surface)).toBe(lemma);
  });
});

describe('lemmatizer — validation prevents bad stems', () => {
  it('keeps unknown-inflated forms as themselves when no stem validates', () => {
    // 'bing' is not a known lemma; 'b' + dedup paths invalid → falls to 'bing'
    const noRun = createLemmatizer({ knownLemmas: new Set(['string']) });
    expect(noRun.lemma('strings')).toBe('string'); // s rule validates
    expect(noRun.lemma('borogove')).toBe('borogove'); // nothing validates
  });

  it('prefers a validated lemma over a listed surface form', () => {
    // 'studies' is itself "known" (imagine a corpus listing), but 'study'
    // also validates — the lemma unifies inflections.
    const both = new Set([...KNOWN, 'studies']);
    expect(createLemmatizer({ knownLemmas: both }).lemma('studies')).toBe('study');
  });
});

describe('lemmatizer — case handling', () => {
  it('lowercases before processing', () => {
    expect(lem.lemma('Went')).toBe('go');
    expect(lem.lemma('STUDIES')).toBe('study');
  });
});

describe('lemmatizer — without validation set (stateless)', () => {
  it('still resolves irregulars and simple plurals', () => {
    expect(lemmatize('went')).toBe('go');
    expect(lemmatize('houses')).toBe('house'); // s + e, unvalidated first wins
  });
});
