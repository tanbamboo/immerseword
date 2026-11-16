/**
 * Synset-lemma extraction for the bundled dictionary (SIP-005).
 *
 * The fixtures below are real WordNet 3.1 data-file record heads — the
 * first one contains the "get c" hex lex_id and the pointer region that
 * the first parsing attempt misread as lemmas ("n", "v", "c" junk).
 */

import { describe, expect, it } from 'vitest';
import { synsetLemmas } from '../../scripts/build-data.mjs';

describe('synsetLemmas (SIP-005)', () => {
  it('reads the begin synset: hex lex-ids and multiword lemmas filtered', () => {
    const head =
      '00346415 30 v 08 get_down 0 begin 0 get c start_out 0 start 0 set_about 0 set_out 0 commence 0 021 + 00236302 n 0803'
        .split(/\s+/);
    expect(synsetLemmas(head)).toEqual(['begin', 'get', 'start', 'commence']);
  });

  it('handles hex w_cnt and sense-numbered lemmas', () => {
    const head =
      '00349400 30 v 04 begin 1 lead_off 0 start 1 commence 1 014 > 02614382 v 0000'.split(/\s+/);
    // multiword "lead_off" is filtered; single-word members survive
    expect(synsetLemmas(head)).toEqual(['begin', 'start', 'commence']);
  });

  it('returns [] for malformed heads', () => {
    expect(synsetLemmas([])).toEqual([]);
    expect(synsetLemmas(['1', '2', 'v', 'xx'])).toEqual([]);
  });
});
