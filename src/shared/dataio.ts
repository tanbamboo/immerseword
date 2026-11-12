/**
 * Data import/export (PRD F6): one JSON document carrying settings, reader
 * preferences, and the full personal vocabulary. Pure functions — the
 * options page supplies storage.
 */

import type { IwSettings } from './types';
import { MAX_WORD_EXAMPLES, type VocabEntry, type VocabExample } from './vocab';

export interface ReaderPrefsShape {
  theme: string;
  fontFamily: string;
  fontSize: number;
  width: string;
}

export interface ExportPayload {
  app: 'immerseword';
  version: 2;
  exportedAt: string; // ISO date
  settings: IwSettings;
  readerPrefs: ReaderPrefsShape;
  vocabulary: Record<string, VocabEntry>;
}

export function buildExportPayload(input: {
  settings: IwSettings;
  readerPrefs: ReaderPrefsShape;
  vocabulary: Record<string, VocabEntry>;
}): ExportPayload {
  return {
    app: 'immerseword',
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: { ...input.settings },
    readerPrefs: { ...input.readerPrefs },
    vocabulary: JSON.parse(JSON.stringify(input.vocabulary)) as Record<string, VocabEntry>,
  };
}

export type ImportResult =
  | {
      ok: true;
      vocabulary: Record<string, VocabEntry>;
      settings?: Partial<IwSettings>;
      imported: number;
    }
  | { ok: false; error: string };

const STATUSES = new Set(['known', 'learning', 'unknown', 'ignored']);

/** Validates an entry's optional example sentences; malformed items are dropped. */
function parseExamples(raw: unknown): VocabExample[] {
  if (!Array.isArray(raw)) return [];
  const out: VocabExample[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const x = item as Partial<VocabExample>;
    if (typeof x.text !== 'string' || x.text.trim().length === 0) continue;
    out.push({
      text: x.text,
      url: typeof x.url === 'string' ? x.url : '',
      capturedAt: typeof x.capturedAt === 'number' ? x.capturedAt : Date.now(),
    });
    if (out.length >= MAX_WORD_EXAMPLES) break;
  }
  return out;
}

/** Validates and extracts an import payload; unknown shapes are rejected. */
export function parseImportPayload(raw: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Not valid JSON.' };
  }
  const data = parsed as Partial<ExportPayload> | null;
  if (!data || typeof data !== 'object' || data.app !== 'immerseword') {
    return { ok: false, error: 'Not an ImmerseWord export file.' };
  }
  if (!data.vocabulary || typeof data.vocabulary !== 'object') {
    return { ok: false, error: 'Export file has no vocabulary section.' };
  }

  const vocabulary: Record<string, VocabEntry> = {};
  let imported = 0;
  for (const [lemma, entry] of Object.entries(data.vocabulary as Record<string, unknown>)) {
    if (!/^[a-z][a-z'’-]*$/i.test(lemma)) continue;
    const e = entry as Partial<VocabEntry> | null;
    if (!e || typeof e !== 'object' || !e.status || !STATUSES.has(e.status)) continue;
    const out: VocabEntry = {
      status: e.status as VocabEntry['status'],
      firstSeen: typeof e.firstSeen === 'number' ? e.firstSeen : Date.now(),
      lastSeen: typeof e.lastSeen === 'number' ? e.lastSeen : Date.now(),
      timesSeen: typeof e.timesSeen === 'number' ? e.timesSeen : 1,
      lookupCount: typeof e.lookupCount === 'number' ? e.lookupCount : 0,
    };
    const examples = parseExamples(e.examples);
    if (examples.length > 0) out.examples = examples;
    vocabulary[lemma.toLowerCase()] = out;
    imported += 1;
  }

  let settings: Partial<IwSettings> | undefined;
  if (data.settings && typeof data.settings === 'object') {
    const s = data.settings as Partial<IwSettings>;
    settings = {};
    if (s.level && ['2k', '5k', '10k', '20k'].includes(s.level)) settings.level = s.level;
    if (typeof s.taggingEnabled === 'boolean') settings.taggingEnabled = s.taggingEnabled;
    if (typeof s.pass1ShowMarks === 'boolean') settings.pass1ShowMarks = s.pass1ShowMarks;
    if (typeof s.onlineFallback === 'boolean') settings.onlineFallback = s.onlineFallback;
  }

  return { ok: true, vocabulary, settings, imported };
}
