/**
 * ImmerseWord content script (ADR-0001, ADR-0004).
 *
 * Boot order: announce readiness → load settings + frequency data → build
 * vocabulary store, tagger, and popover → scan the page → watch DOM/settings
 * changes. Pass rendering (PR-5) layers on top of the tagger attributes.
 */

import { createTagger } from './tagger';
import { createPopover } from './popover';
import { createFrequencyIndex } from '../shared/frequency';
import { createLemmatizer } from '../shared/lemmatizer';
import { getSettings, type SyncStorageLike } from '../shared/settings';
import { createVocabStore, type VocabStore } from '../shared/vocab';
import { DEFAULT_SETTINGS, type IwMessage, type IwSettings, type WordStatus } from '../shared/types';

document.documentElement.dataset.iwReady = '1';

/* ── bootstrap ─────────────────────────────────────────────────────────── */

let tagger: ReturnType<typeof createTagger> | null = null;
let vocab: VocabStore | null = null;
let currentSettings: IwSettings = DEFAULT_SETTINGS;
let rescanTimer: ReturnType<typeof setTimeout> | null = null;

async function loadFrequencyWords(): Promise<string[]> {
  try {
    const res = await fetch(chrome.runtime.getURL('data/frequency.json'));
    if (!res.ok) return [];
    return (await res.json()) as string[];
  } catch (err) {
    console.error('[ImmerseWord] frequency data failed to load:', err);
    return [];
  }
}

async function lookupDefinition(
  lemma: string,
): Promise<{ entry: import('../shared/types').DictionaryEntry | null; source: string }> {
  const response = (await chrome.runtime.sendMessage({
    type: 'DICT_LOOKUP',
    lemma,
  })) as { type?: string; entry?: import('../shared/types').DictionaryEntry | null; source?: string };
  return { entry: response?.entry ?? null, source: response?.source ?? 'none' };
}

async function init(): Promise<void> {
  currentSettings = await getSettings(chrome.storage.sync as SyncStorageLike);
  const words = await loadFrequencyWords();
  if (words.length === 0) return; // degraded: no tagging, messaging still works

  vocab = createVocabStore(chrome.storage.local);
  // Sync snapshot for the tagger's synchronous classification; kept fresh
  // by the storage.onChanged listener below.
  const statusMap = new Map<string, WordStatus>();
  for (const [lemma, entry] of Object.entries(await vocab.all())) {
    statusMap.set(lemma, entry.status);
  }

  const known = new Set(words);
  const index = createFrequencyIndex(words, (s) => createLemmatizer({ knownLemmas: known }).lemma(s));
  tagger = createTagger({ frequency: index, settings: currentSettings });
  tagger.setVocab({ statusOf: (lemma) => statusMap.get(lemma) });

  const popover = createPopover({
    lookup: lookupDefinition,
    vocab,
    onStatusChange: (lemma, status) => {
      statusMap.set(lemma, status);
      tagger?.refreshStatus(lemma, status);
    },
  });

  // Click delegation: any tagged word opens the popover.
  document.addEventListener('click', (event) => {
    if (!currentSettings.taggingEnabled) return;
    const target = event.target as HTMLElement | null;
    const span = target?.closest<HTMLElement>('span.iw-word');
    if (span?.dataset.lemma) {
      event.preventDefault();
      event.stopPropagation();
      void popover.openFor(span, span.dataset.lemma);
    }
  }, true);

  if (currentSettings.taggingEnabled) {
    void tagger.scan(document.body);
  }

  watchMutations();
}

/* ── dynamic content (SPA) ─────────────────────────────────────────────── */

function watchMutations(): void {
  const observer = new MutationObserver((mutations) => {
    if (!tagger || !currentSettings.taggingEnabled) return;
    const relevant = mutations.some((m) => {
      if (m.type === 'characterData') return true;
      for (const node of m.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) return true;
        if (node.nodeType === Node.ELEMENT_NODE && !(node as Element).closest?.('.iw-ui')) {
          return true;
        }
      }
      return false;
    });
    if (!relevant) return;
    if (rescanTimer) clearTimeout(rescanTimer);
    rescanTimer = setTimeout(() => {
      rescanTimer = null;
      void tagger?.scan(document.body);
    }, 250);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

/* ── settings changes (from options page or side panel) ────────────────── */

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes['iw:settings'] || !tagger) return;
  const next = { ...DEFAULT_SETTINGS, ...(changes['iw:settings'].newValue as Partial<IwSettings>) };
  const levelChanged = next.level !== currentSettings.level;
  currentSettings = next;
  tagger.applySettings(next);
  if (levelChanged) {
    tagger.untag();
    if (next.taggingEnabled) void tagger.scan(document.body);
  }
});

/* ── vocabulary changes from other contexts (side panel) ───────────────── */

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes['iw:vocab'] || !tagger) return;
  const prev = (changes['iw:vocab'].oldValue ?? {}) as Record<string, { status: WordStatus }>;
  const next = (changes['iw:vocab'].newValue ?? {}) as Record<string, { status: WordStatus }>;
  for (const lemma of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if (prev[lemma]?.status !== next[lemma]?.status) {
      tagger.refreshStatus(lemma, next[lemma]?.status ?? 'candidate');
    }
  }
});

/* ── messaging ─────────────────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const msg = message as IwMessage;
  if (msg?.type === 'PING') {
    sendResponse({ type: 'PONG' });
    return false;
  }
  if (msg?.type === 'IW_SHOW_LOOKUP') {
    // Context-menu lookup: find the first tagged occurrence of the lemma.
    const span = document.querySelector<HTMLElement>(
      `span.iw-word[data-lemma="${CSS.escape(msg.lemma.toLowerCase())}"]`,
    );
    const lemma = msg.lemma.toLowerCase();
    if (span) {
      span.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    // Popover opens via the synthetic click path by re-dispatching on the span.
    if (span) span.click();
    sendResponse({ shown: !!span });
    return false;
  }
  return false;
});

void init();
