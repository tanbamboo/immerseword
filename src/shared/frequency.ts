/**
 * Frequency index (ADR-0003): rank lookup over the bundled 20k list with
 * surface-form-first, lemma-fallback resolution, plus band classification.
 */

import type { LevelBand } from './types';

export const BAND_RANKS: Record<LevelBand, number> = {
  '2k': 2_000,
  '5k': 5_000,
  '10k': 10_000,
  '20k': 20_000,
};

export const BANDS: LevelBand[] = ['2k', '5k', '10k', '20k'];

export interface FrequencyIndex {
  /** Rank of the best-known form (surface first, lemma fallback); 0 = unknown/rare. */
  rankOf(surface: string): number;
  /** True when neither the surface nor its lemma sits within the band. */
  isRarerThan(surface: string, band: LevelBand): boolean;
  /** Number of distinct lemmas in the index (for diagnostics). */
  readonly size: number;
}

export function createFrequencyIndex(
  orderedWords: readonly string[],
  lemmaOf: (surface: string) => string,
): FrequencyIndex {
  const rank = new Map<string, number>();
  orderedWords.forEach((w, i) => {
    const key = w.toLowerCase();
    if (!rank.has(key)) rank.set(key, i + 1); // first occurrence wins
  });

  return {
    size: rank.size,
    rankOf(surface: string): number {
      const s = surface.toLowerCase();
      const surfaceRank = rank.get(s);
      if (surfaceRank !== undefined) return surfaceRank;
      const lemma = lemmaOf(s);
      return rank.get(lemma) ?? 0;
    },
    isRarerThan(surface: string, band: LevelBand): boolean {
      const rank = this.rankOf(surface);
      // Rank 0 = not in the 20k list at all: rarer than every band.
      return rank === 0 || rank > BAND_RANKS[band];
    },
  };
}
