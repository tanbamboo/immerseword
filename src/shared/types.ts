/**
 * Shared types used across extension contexts (content script, service
 * worker, side panel). Message envelopes keep runtime.sendMessage chatter
 * typed end-to-end. See ADR-0001 §4.
 */

/** Per-lemma learner classification. See ADR-0003 §2. */
export type WordStatus = 'known' | 'learning' | 'unknown' | 'ignored';

/** Frequency level: a word rarer than the band is a tagging candidate. */
export type LevelBand = '2k' | '5k' | '10k' | '20k';

/** All runtime messages flow through this discriminated union. */
export type IwMessage =
  | { type: 'PING' }
  | { type: 'PONG' }
  | { type: 'GET_SETTINGS' }
  | { type: 'DICT_LOOKUP'; lemma: string }
  | {
      type: 'DICT_RESULT';
      lemma: string;
      entry: DictionaryEntry | null;
      source: 'core' | 'api' | 'cache' | 'none';
    }
  | { type: 'IW_SHOW_LOOKUP'; lemma: string }
  | { type: 'GET_PAGE_DATA' }
  | {
      type: 'PAGE_DATA';
      stats: PageStats;
      words: PageWord[];
      url: string;
    }
  /* ── 3-pass sessions (ADR-0005) ── */
  | { type: 'SESSION_START'; url: string; tabId?: number }
  | { type: 'SESSION_GET'; tabId?: number }
  | { type: 'SESSION_TRANSITION'; action: 'next' | 'reset'; tabId?: number }
  | { type: 'SESSION_WORD_CLASSIFIED'; lemma: string; status: WordStatus }
  | { type: 'SESSION_UPDATED'; session: IwSession | null }
  | { type: 'READER_TOGGLE' };

/** Reading pass within a session (ADR-0005). Strictly linear: 1 → 2 → 3 → done. */
export type IwPass = 1 | 2 | 3 | 'done';

export interface IwPassInterval {
  pass: IwPass;
  enteredAt: number;
  exitedAt?: number;
}

export interface IwSession {
  tabId: number;
  url: string;
  startedAt: number;
  pass: IwPass;
  history: IwPassInterval[];
  stats: {
    lookups: number;
    classified: Record<WordStatus, number>;
  };
}

/** Snapshot of tagging state on the current page (GET_PAGE_DATA response). */
export interface PageStats {
  /** All English word tokens on the page (tagged + untagged). */
  tokensTotal: number;
  /** Tagged words, by visual status. */
  tagged: { candidate: number; unknown: number; learning: number };
  /** Share of tokens not flagged as unknown/candidate, 0–100. */
  coveragePct: number;
}

/** One lemma as it appears on the page (for the panel's word list). */
export interface PageWord {
  lemma: string;
  status: 'candidate' | 'unknown' | 'learning';
  count: number;
}

/** Normalized monolingual dictionary entry (bundled core and API both map to this). */
export interface DictionaryEntry {
  lemma: string;
  phonetic?: string;
  senses: DictionarySense[];
}

export interface DictionarySense {
  partOfSpeech?: string;
  definition: string;
  example?: string;
}

/** Extension settings, stored in chrome.storage.sync. */
export interface IwSettings {
  /** Frequency level band. Default '5k'. */
  level: LevelBand;
  /** Master switch for page tagging. */
  taggingEnabled: boolean;
  /** Pass 1 shows faint marks for unknown/learning instead of hiding all tags. */
  pass1ShowMarks: boolean;
  /** Allow online Free Dictionary API lookups (offline-only mode when false). */
  onlineFallback: boolean;
}

export const DEFAULT_SETTINGS: IwSettings = {
  level: '5k',
  taggingEnabled: true,
  pass1ShowMarks: false,
  onlineFallback: true,
};
