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
  /** Raw rank of an exact form (0 = not in the list). */
  rank(form: string): number;
  /**
   * Best rank of a token: the better (lower) of its surface rank and its
   * lemma's rank. Lemma knowledge dominates ("stood"→"stand" 1752), but a
   * bogus rare "lemma" never outranks a common surface ("family" must not
   * resolve to the rare corpus word "fam").
   */
  rankOf(surface: string): number;
  /** The form (surface or lemma) that rankOf resolved to. */
  resolveForm(surface: string): string;
  /** True when the token is rarer than the band (rank 0 = rare beyond 20k). */
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

  const raw = (form: string): number => rank.get(form) ?? 0;

  function best(surface: string): { surfaceRank: number; lemmaRank: number; lemma: string } {
    const s = surface.toLowerCase();
    const lemma = lemmaOf(s);
    return { surfaceRank: raw(s), lemmaRank: lemma === s ? 0 : raw(lemma), lemma };
  }

  return {
    size: rank.size,
    rank: raw,
    rankOf(surface: string): number {
      const { surfaceRank, lemmaRank } = best(surface);
      if (surfaceRank === 0) return lemmaRank; // unlisted surface → lemma (or 0)
      if (lemmaRank === 0) return surfaceRank; // bogus/unlisted lemma → surface
      return Math.min(surfaceRank, lemmaRank);
    },
    resolveForm(surface: string): string {
      const { surfaceRank, lemmaRank, lemma } = best(surface);
      if (surfaceRank > 0 && (lemmaRank === 0 || surfaceRank <= lemmaRank)) {
        return surface.toLowerCase();
      }
      return lemma;
    },
    isRarerThan(surface: string, band: LevelBand): boolean {
      const r = this.rankOf(surface);
      // Rank 0 = not in the 20k list at all: rarer than every band.
      return r === 0 || r > BAND_RANKS[band];
    },
  };
}
