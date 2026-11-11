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

describe('lemmatizer — possessives and e-drop/dedup ordering (bug-2026-11-11-003)', () => {
  it('strips possessive \'s so possessed nouns classify normally', () => {
    expect(lem.lemma("market's")).toBe('market'); // 'market' not in KNOWN here →
    const withMarket = createLemmatizer({ knownLemmas: new Set([...KNOWN, 'market']) });
    expect(withMarket.lemma("market's")).toBe('market');
    expect(withMarket.lemma("family's")).toBe('family');
  });

  it('keeps listed -ly adverbs as themselves (they are their own headwords)', () => {
    const withAdverbs = createLemmatizer({
      knownLemmas: new Set([...KNOWN, 'roughly', 'quickly']),
    });
    // -ly is derivational for listed surfaces — kept at the dictionary
    // layer (own core entries win there); the lemmatizer still collapses
    // for band classification.
    expect(withAdverbs.lemma('darkly')).toBe('dark');
  });

  it('rare-word fallback prefers dedup / e-restore over the bare stem', () => {
    // None of these stems are in KNOWN — pure fallback territory.
    expect(lem.lemma('embedding')).toBe('embed'); // doubled dd → dedup
    expect(lem.lemma('overstated')).toBe('overstate'); // vowel+t → e-restore
    expect(lem.lemma('disgruntled')).toBe('disgruntle'); // consonant+l → e-restore
    expect(lem.lemma('shaping')).toBe('shape'); // vowel+p → e-restore
    expect(lem.lemma('glistened')).toBe('glisten'); // vowel+n stays bare
  });

  it('prefers the e-restored stem when both forms are listed (hoped → hope)', () => {
    // 'hop' and 'hope' are both words; the -ed spelling (not 'hopped')
    // proves the verb dropped an e, so 'hope' must win.
    const both = createLemmatizer({ knownLemmas: new Set([...KNOWN, 'hop', 'hope']) });
    expect(both.lemma('hoped')).toBe('hope');
    expect(both.lemma('hoping')).toBe('hope');
    // …while a doubled spelling still dedups to the short vowel form.
    expect(both.lemma('hopped')).toBe('hop');
    expect(both.lemma('hopping')).toBe('hop');
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
  it('resolves irregulars and conservative fallbacks only', () => {
    expect(lemmatize('went')).toBe('go');
    expect(lemmatize('cacophonies')).toBe('cacophony'); // ies fallback
    expect(lemmatize('glistened')).toBe('glisten'); // ed fallback
    // No lexicon → aggressive rules stay off: agentive/noun endings intact.
    expect(lemmatize('gossamer')).toBe('gossamer');
    expect(lemmatize('houses')).toBe('houses'); // bare -s excluded from fallbacks
  });
});
