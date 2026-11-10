/**
 * ImmerseWord content script (ADR-0001, ADR-0004).
 *
 * Boot order: announce readiness → load settings + frequency data → build
 * the tagger → scan the page → watch for DOM changes (SPA) and settings
 * changes. Pass rendering (PR-5) and the popover (PR-3) layer on top of the
 * tagger's data attributes.
 */

import { createTagger } from './tagger';
import { createFrequencyIndex } from '../shared/frequency';
import { createLemmatizer } from '../shared/lemmatizer';
import { getSettings, type SyncStorageLike } from '../shared/settings';
import { DEFAULT_SETTINGS, type IwMessage, type IwSettings } from '../shared/types';

document.documentElement.dataset.iwReady = '1';

/* ── bootstrap ─────────────────────────────────────────────────────────── */

let tagger: ReturnType<typeof createTagger> | null = null;
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

async function init(): Promise<void> {
  currentSettings = await getSettings(chrome.storage.sync as SyncStorageLike);
  const words = await loadFrequencyWords();
  if (words.length === 0) return; // degraded: no tagging, messaging still works

  const known = new Set(words);
  const index = createFrequencyIndex(words, (s) => createLemmatizer({ knownLemmas: known }).lemma(s));
  tagger = createTagger({
    frequency: index,
    settings: currentSettings,
  });

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

/* ── messaging ─────────────────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const msg = message as IwMessage;
  if (msg?.type === 'PING') {
    sendResponse({ type: 'PONG' });
    return false;
  }
  return false;
});

void init();
