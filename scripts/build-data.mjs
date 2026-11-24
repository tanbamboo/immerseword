/**
 * Data pipeline (ADR-0002, ADR-0008): regenerates the committed datasets in
 * public/data/ — run explicitly with `npm run build:data [-- --regen]`.
 *
 *  - frequency.json : ordered array of 20,000 surface forms by corpus
 *    frequency (Google Trillion Word Corpus list, MIT). Rank = index + 1.
 *  - dict-core.json : monolingual definitions for the top CORE_LIMIT
 *    frequency lemmas that exist in WordNet 3.1 (Princeton WordNet License).
 *    Value (SIP-005): lemma → { s: up to one sense per POS as
 *    [posCode, definition, example?], syn?: ≤8 same-synset words }.
 *  - ATTRIBUTION.md : licenses for everything bundled.
 *
 * The extension itself never runs this; outputs are committed so builds stay
 * offline and reproducible. Pass --regen to fetch/parse fresh sources.
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const DATA_DIR = resolve(process.cwd(), 'public', 'data');
const FREQ_URL =
  'https://raw.githubusercontent.com/first20hours/google-10000-english/master/20k.txt';
const CORE_LIMIT = 15_000;
const SENSES_PER_POS = 3; // synsets examined per POS; first (most common) sense wins
const SYN_CAP = 8; // max synonyms stored per lemma (SIP-005)

/**
 * SIP-005: single-word member lemmas of one synset head. `fields` is a
 * WordNet data-file record head split on whitespace
 * (`offset lex_filenum ss_type w_cnt word lex_id … p_cnt …`). w_cnt is
 * hex and every word is followed by exactly one HEX lex_id ("get c" =
 * lex_id c), so the lemma list is strictly alternating word/lex-id pairs;
 * parsing must stop after w_cnt words or it reads pointer symbols and
 * pointer-target POS letters ("n", "v") as lemmas. Multi-word lemmas
 * ("get_down") and marker-carrying forms fail the single-word filter.
 */
export function synsetLemmas(fields) {
  const count = parseInt(fields[3] ?? '0', 16);
  if (!Number.isFinite(count) || count <= 0) return [];
  const out = [];
  for (let k = 0; k < count; k++) {
    const word = fields[4 + k * 2];
    if (word === undefined) break;
    if (/^[a-z]{2,}$/.test(word)) out.push(word);
  }
  return out;
}

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

  /** offset → [ssType, gloss, memberLemmas] for one POS data file. */
  function parseData(file) {
    const map = new Map();
    for (const line of readFileSync(resolve(dictDir, file), 'utf8').split('\n')) {
      const bar = line.indexOf(' | ');
      if (bar < 0) continue;
      const head = line.slice(0, bar).split(/\s+/);
      map.set(head[0], [head[2], line.slice(bar + 3).trim(), synsetLemmas(head)]);
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
    const syns = []; // SIP-005: same-synset words, sense order, deduped below
    POS_FILES.forEach((pos, i) => {
      const offsets = indices[i].get(lemma);
      if (!offsets) return;
      for (const off of offsets.slice(0, SENSES_PER_POS)) {
        const entry = datas[i].get(off);
        if (!entry) continue;
        for (const mate of entry[2]) {
          if (mate !== lemma) syns.push(mate);
        }
        const raw = entry[1];
        const q = raw.indexOf('"');
        const definition = (q < 0 ? raw : raw.slice(0, q)).trim();
        if (!definition || senses.some((s) => s[0] === pos.code)) continue;
        const example = q >= 0 ? raw.slice(q + 1).split('"')[0]?.trim() : undefined;
        senses.push([pos.code, definition, ...(example ? [example] : [])]);
      }
    });
    if (senses.length > 0) {
      const syn = [...new Set(syns)].slice(0, SYN_CAP);
      core[lemma] = syn.length > 0 ? { s: senses, syn } : { s: senses };
      matched += 1;
    }
  }
  console.log(
    `dict-core.json: ${matched}/${coreLemmas.length} of top-${CORE_LIMIT} lemmas defined ` +
      `(${(JSON.stringify(core).length / 1024 / 1024).toFixed(2)} MB)`,
  );
  writeFileSync(dictPath, JSON.stringify(core));

  // ── 3. English lexicon (SBFP-011) ────────────────────────────────────────
  // Single-word lowercase lemmas across all four POS indexes: the offline
  // validator that separates "rare English" (taggable) from "not English"
  // (never tagged). Same /^[a-z]+$/ filter parseIndex applies.
  const english = new Set();
  for (const p of POS_FILES) {
    for (const lemma of parseIndex(p.index).keys()) english.add(lemma);
  }
  const englishPath = resolve(DATA_DIR, 'english.json');
  writeFileSync(englishPath, JSON.stringify([...english].sort()));
  console.log(
    `english.json: ${english.size} validated lemmas ` +
      `(${(JSON.stringify([...english]).length / 1024 / 1024).toFixed(2)} MB)`,
  );

  // ── 4. Attribution ─────────────────────────────────────────────────────
  writeFileSync(
    resolve(DATA_DIR, 'ATTRIBUTION.md'),
    `# Bundled data — licenses & sources

## frequency.json
Top 20,000 English words (Google Trillion Word Corpus) from
[first20hours/google-10000-english](https://github.com/first20hours/google-10000-english) — MIT License.

## dict-core.json / english.json
Monolingual definitions and the English-validation lexicon derived from
**WordNet 3.1**,
Copyright © 2013 Princeton University. Used under the
[WordNet License](https://wordnet.princeton.edu/license-and-commercial-use):
redistribution requires this notice and the license text.

WordNet® is a registered trademark of Princeton University.
`,
  );
  console.log('ATTRIBUTION.md written');
}

// Run as CLI unless imported (unit tests import synsetLemmas).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error('[build-data] failed:', err);
    process.exit(1);
  });
}
