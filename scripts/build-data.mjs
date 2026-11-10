/**
 * Data pipeline (ADR-0002, ADR-0008): regenerates the committed datasets in
 * public/data/ — run explicitly with `npm run build:data [-- --regen]`.
 *
 *  - frequency.json : ordered array of 20,000 surface forms by corpus
 *    frequency (Google Trillion Word Corpus list, MIT). Rank = index + 1.
 *  - dict-core.json : monolingual definitions for the top CORE_LIMIT
 *    frequency lemmas that exist in WordNet 3.1 (Princeton WordNet License).
 *    Value: lemma → up to one sense per POS as [posCode, definition, example?].
 *  - ATTRIBUTION.md : licenses for everything bundled.
 *
 * The extension itself never runs this; outputs are committed so builds stay
 * offline and reproducible. Pass --regen to fetch/parse fresh sources.
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const DATA_DIR = resolve(process.cwd(), 'public', 'data');
const FREQ_URL =
  'https://raw.githubusercontent.com/first20hours/google-10000-english/master/20k.txt';
const CORE_LIMIT = 15_000;
const SENSES_PER_POS = 3; // synsets examined per POS; shortest gloss wins

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  const regen = process.argv.includes('--regen');
  const freqPath = resolve(DATA_DIR, 'frequency.json');
  const dictPath = resolve(DATA_DIR, 'dict-core.json');

  // ── 1. Frequency list ──────────────────────────────────────────────────
  let words;
  const freqExists = existsSync(freqPath);
  if (!regen && freqExists) {
    words = JSON.parse(readFileSync(freqPath, 'utf8'));
    console.log(`frequency.json: kept committed copy (${words.length} lemmas)`);
  } else {
    console.log(`frequency.json: fetching ${FREQ_URL} …`);
    const res = await fetch(FREQ_URL, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
    words = (await res.text())
      .split(/\r?\n/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => /^[a-z]+$/.test(w) && w.length > 1);
    console.log(`frequency.json: fetched ${words.length} lemmas`);
  }
  writeFileSync(freqPath, JSON.stringify(words));

  // ── 2. WordNet core dictionary ────────────────────────────────────────
  const wn = require('wordnet-db');
  const dictDir = require.resolve('wordnet-db') ? wn.path : null;
  const POS_FILES = [
    { code: 'n', label: 'noun', index: 'index.noun', data: 'data.noun' },
    { code: 'v', label: 'verb', index: 'index.verb', data: 'data.verb' },
    { code: 'a', label: 'adjective', index: 'index.adj', data: 'data.adj' },
    { code: 'r', label: 'adverb', index: 'index.adv', data: 'data.adv' },
  ];

  /** lemma → [synset offsets] for one POS, lowercase common lemmas only. */
  function parseIndex(file) {
    const map = new Map();
    for (const line of readFileSync(resolve(dictDir, file), 'utf8').split('\n')) {
      if (!line || line.startsWith('  ') || /\bLICENSE|Princeton|copyright/i.test(line)) continue;
      const f = line.split(/\s+/);
      const lemma = f[0];
      if (!/^[a-z]+$/.test(lemma)) continue; // skip multiword (underscore) + proper nouns
      const synsetCnt = Number(f[2]);
      const pCnt = Number(f[3]);
      const offsetsStart = 4 + pCnt + 2;
      const offsets = f.slice(offsetsStart, offsetsStart + synsetCnt).filter(Boolean);
      if (offsets.length > 0) map.set(lemma, offsets);
    }
    return map;
  }

  /** offset → [ssType, gloss] for one POS data file. */
  function parseData(file) {
    const map = new Map();
    for (const line of readFileSync(resolve(dictDir, file), 'utf8').split('\n')) {
      const bar = line.indexOf(' | ');
      if (bar < 0) continue;
      const head = line.slice(0, bar).split(/\s+/);
      map.set(head[0], [head[2], line.slice(bar + 3).trim()]);
    }
    return map;
  }

  const core = {};
  let matched = 0;
  const indices = POS_FILES.map((p) => parseIndex(p.index));
  const datas = POS_FILES.map((p) => parseData(p.data));

  const coreLemmas = words.slice(0, CORE_LIMIT);
  for (const lemma of coreLemmas) {
    const senses = [];
    POS_FILES.forEach((pos, i) => {
      const offsets = indices[i].get(lemma);
      if (!offsets) return;
      let best = null;
      for (const off of offsets.slice(0, SENSES_PER_POS)) {
        const entry = datas[i].get(off);
        if (!entry) continue;
        const raw = entry[1];
        const q = raw.indexOf('"');
        const definition = (q < 0 ? raw : raw.slice(0, q)).trim();
        if (!definition) continue;
        const example = q >= 0 ? raw.slice(q + 1).split('"')[0]?.trim() : undefined;
        const candidate = [pos.code, definition, ...(example ? [example] : [])];
        // WordNet index offsets are ordered by sense frequency: the first
        // synset is the most common sense, so we keep it — not the shortest.
        if (!best) best = candidate;
      }
      if (best) senses.push(best);
    });
    if (senses.length > 0) {
      core[lemma] = senses;
      matched += 1;
    }
  }
  console.log(
    `dict-core.json: ${matched}/${coreLemmas.length} of top-${CORE_LIMIT} lemmas defined ` +
      `(${(JSON.stringify(core).length / 1024 / 1024).toFixed(2)} MB)`,
  );
  writeFileSync(dictPath, JSON.stringify(core));

  // ── 3. Attribution ─────────────────────────────────────────────────────
  writeFileSync(
    resolve(DATA_DIR, 'ATTRIBUTION.md'),
    `# Bundled data — licenses & sources

## frequency.json
Top 20,000 English words (Google Trillion Word Corpus) from
[first20hours/google-10000-english](https://github.com/first20hours/google-10000-english) — MIT License.

## dict-core.json
Monolingual definitions derived from **WordNet 3.1**,
Copyright © 2013 Princeton University. Used under the
[WordNet License](https://wordnet.princeton.edu/license-and-commercial-use):
redistribution requires this notice and the license text.

WordNet® is a registered trademark of Princeton University.
`,
  );
  console.log('ATTRIBUTION.md written');
}

main().catch((err) => {
  console.error('[build-data] failed:', err);
  process.exit(1);
});
