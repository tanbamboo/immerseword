/**
 * Node harness for fast-anything: exercises the extension's language-core
 * hot path (the per-token work the content-script tagger does on a page)
 * with the REAL bundled data — no Chrome APIs involved.
 *
 *   node bench/tagging-hotpath.mjs
 *   fast-anything scan -- node bench/tagging-hotpath.mjs
 *
 * Mirrors src/content/index.ts init + tagger.classify's per-token rule.
 */

import { readFile } from 'node:fs/promises';
import { createLemmatizer } from '../src/shared/lemmatizer.ts';
import { createFrequencyIndex } from '../src/shared/frequency.ts';
import { tokenize, isAcronym, isBrandLike } from '../src/shared/tokenizer.ts';

const words = JSON.parse(await readFile('public/data/frequency.json', 'utf8'));
const articleHtml = await readFile('tests/fixtures/article.html', 'utf8');
const corpus = articleHtml.replace(/<[^>]+>/g, ' ').repeat(400); // ≈ 200k tokens

// Exactly the production wiring.
const known = new Set(words);
const lemmatizer = createLemmatizer({ knownLemmas: known });
const index = createFrequencyIndex(words, (s) => lemmatizer.lemma(s));
const level = '5k';
const BAND_RANKS = { '2k': 2000, '5k': 5000, '10k': 10000, '20k': 20000 };

function classifyToken(text) {
  if (isAcronym(text)) return null;
  if (isBrandLike(text)) return null;
  const lemma = index.resolveForm(text);
  if (/['’]/.test(lemma) && index.rank(lemma) === 0) return null;
  const fullBand = true; // 'full' density: the broadest candidate rule
  if (fullBand ? !index.isRarerThan(text, level) : index.rankOf(text) !== 0) return null;
  return lemma;
}

const t0 = performance.now();
let tokens = 0;
let candidates = 0;
for (const chunk of corpus.split(/(?<=\.)\s/)) {
  for (const token of tokenize(chunk)) {
    tokens += 1;
    if (classifyToken(token.text) !== null) candidates += 1;
  }
}
const ms = performance.now() - t0;
console.log(
  `classified ${tokens.toLocaleString()} tokens → ${candidates.toLocaleString()} candidates ` +
    `in ${ms.toFixed(0)} ms (${(tokens / (ms / 1000) / 1000).toFixed(0)}k tokens/s)`,
);
