/**
 * Side panel — reading companion (PRD F5/F6).
 *
 * Sections: this-page stats + coverage bar (live from the content script),
 * the page's flagged word list with inline classification, the global
 * vocabulary browser (search/filter/edit), and quick settings that write
 * straight to chrome.storage.sync (the content script reacts via
 * storage.onChanged). Vocabulary edits propagate to the page through the
 * same channel — no direct tab coupling needed.
 */

import { getSettings, setSettings, type SyncStorageLike } from '../shared/settings';
import { createVocabStore, type VocabEntry } from '../shared/vocab';
import type { IwMessage, IwSettings, LevelBand, PageStats, PageWord, WordStatus } from '../shared/types';

const vocab = createVocabStore(chrome.storage.local);

let activeTabId: number | null = null;
let activeTabIsWeb = false;
let currentFilter: 'all' | WordStatus = 'all';
let searchTerm = '';
let lastSettings: IwSettings | null = null;

/* ── helpers ───────────────────────────────────────────────────────────── */

function el<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`missing element ${selector}`);
  return found;
}

async function sendToTab<T>(message: IwMessage): Promise<T | null> {
  if (activeTabId === null) return null;
  try {
    return (await chrome.tabs.sendMessage(activeTabId, message)) as T;
  } catch {
    return null;
  }
}

/* ── this page ─────────────────────────────────────────────────────────── */

interface PageDataResponse {
  type?: string;
  stats: PageStats;
  words: PageWord[];
  url: string;
}

async function refreshPageData(): Promise<void> {
  if (!activeTabIsWeb || activeTabId === null) {
    el('#iw-nopage-card').hidden = false;
    el('#iw-page-card').hidden = true;
    el('#iw-words-card').hidden = true;
    el('#iw-status').textContent = 'Open an English web page to start reading.';
    return;
  }
  const pong = await sendToTab<{ type?: string }>({ type: 'PING' });
  if (!pong) {
    el('#iw-nopage-card').hidden = false;
    el('#iw-page-card').hidden = true;
    el('#iw-words-card').hidden = true;
    el('#iw-status').textContent = 'This page has no content script (extension may not run here).';
    return;
  }
  const data = await sendToTab<PageDataResponse>({ type: 'GET_PAGE_DATA' });
  if (!data?.stats) return;

  el('#iw-nopage-card').hidden = true;
  el('#iw-page-card').hidden = false;
  el('#iw-words-card').hidden = false;

  el('#st-tokens').textContent = String(data.stats.tokensTotal);
  el('#st-candidates').textContent = String(data.stats.tagged.candidate);
  el('#st-unknown').textContent = String(data.stats.tagged.unknown);
  el('#st-learning').textContent = String(data.stats.tagged.learning);
  el('#coverage-fill')!.style.width = `${data.stats.coveragePct}%`;
  el('#coverage-label').textContent = `${data.stats.coveragePct}% comfortable`;

  renderPageWords(data.words);
}

function renderPageWords(words: PageWord[]): void {
  const list = el('#iw-word-list');
  list.innerHTML = '';
  el('#iw-words-empty').hidden = words.length > 0;
  for (const word of words) {
    const li = document.createElement('li');
    const lemma = document.createElement('span');
    lemma.className = 'iw-word-lemma';
    lemma.textContent = word.lemma;
    const count = document.createElement('span');
    count.className = 'iw-word-count';
    count.textContent = `×${word.count}`;
    const badge = document.createElement('span');
    badge.className = `iw-badge ${word.status}`;
    badge.textContent = word.status;
    li.append(lemma, count, badge, wordActions(word.lemma));
    list.append(li);
  }
}

function wordActions(lemma: string): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'iw-word-actions';
  const mk = (label: string, status: WordStatus, title: string) => {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.title = title;
    btn.addEventListener('click', () => void classify(lemma, status));
    return btn;
  };
  wrap.append(
    mk('✓', 'known', `Mark "${lemma}" as known`),
    mk('◑', 'learning', `Mark "${lemma}" as learning`),
    mk('?', 'unknown', `Mark "${lemma}" as unknown`),
    mk('✕', 'ignored', `Never show "${lemma}"`),
  );
  return wrap;
}

async function classify(lemma: string, status: WordStatus): Promise<void> {
  await vocab.setStatus(lemma, status);
  await refreshPageData();
  await refreshVocab();
}

/* ── vocabulary browser ────────────────────────────────────────────────── */

async function refreshVocab(): Promise<void> {
  const all = await vocab.all();
  const entries = Object.entries(all)
    .filter(([lemma]) => lemma.includes(searchTerm))
    .filter(([, entry]) => currentFilter === 'all' || entry.status === currentFilter)
    .sort((a, b) => b[1].lastSeen - a[1].lastSeen)
    .slice(0, 200);

  const list = el('#iw-vocab-list');
  list.innerHTML = '';
  el('#iw-vocab-empty').hidden = entries.length > 0;
  el('#iw-vocab-empty').textContent =
    Object.keys(all).length === 0
      ? 'Your vocabulary grows as you classify words while reading.'
      : 'No words match this filter.';

  for (const [lemma, entry] of entries as Array<[string, VocabEntry]>) {
    const li = document.createElement('li');
    const lemmaEl = document.createElement('span');
    lemmaEl.className = 'iw-word-lemma';
    lemmaEl.textContent = lemma;
    const badge = document.createElement('span');
    badge.className = `iw-badge ${entry.status}`;
    badge.textContent = entry.status;
    li.append(lemmaEl, badge, wordActions(lemma));
    list.append(li);
  }
}

/* ── quick settings ────────────────────────────────────────────────────── */

async function refreshSettings(): Promise<void> {
  const settings = await getSettings(chrome.storage.sync as SyncStorageLike);
  lastSettings = settings;
  (el('#iw-level') as HTMLSelectElement).value = settings.level;
  (el('#iw-tagging') as HTMLInputElement).checked = settings.taggingEnabled;
}

function bindSettings(): void {
  el('#iw-level').addEventListener('change', async (event) => {
    const level = (event.target as HTMLSelectElement).value as LevelBand;
    await setSettings(chrome.storage.sync as SyncStorageLike, { level });
    // The content script retags on level change; give it a beat, then refresh.
    setTimeout(() => void refreshPageData(), 800);
  });
  el('#iw-tagging').addEventListener('change', async (event) => {
    const taggingEnabled = (event.target as HTMLInputElement).checked;
    await setSettings(chrome.storage.sync as SyncStorageLike, { taggingEnabled });
    setTimeout(() => void refreshPageData(), 500);
  });
}

/* ── lifecycle ─────────────────────────────────────────────────────────── */

async function refreshTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;
  activeTabIsWeb = !!tab?.url?.startsWith('http');
  await refreshPageData();
}

async function init(): Promise<void> {
  // Test/lifecycle hook first, before any await: E2E must be able to call
  // it as soon as the page is interactive.
  (window as unknown as { __iwRefresh: () => Promise<void> }).__iwRefresh = refreshTab;

  const manifest = chrome.runtime.getManifest();
  el('#iw-version').textContent = `v${manifest.version}`;

  el('#iw-refresh').addEventListener('click', () => void refreshPageData());
  el('#iw-vocab-search').addEventListener('input', (event) => {
    searchTerm = (event.target as HTMLInputElement).value.trim().toLowerCase();
    void refreshVocab();
  });
  document.querySelectorAll('#iw-vocab-filters .iw-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#iw-vocab-filters .iw-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      currentFilter = (chip as HTMLElement).dataset.filter as 'all' | WordStatus;
      void refreshVocab();
    });
  });

  bindSettings();
  await refreshSettings();
  await refreshTab();
  await refreshVocab();

  void chrome.runtime.sendMessage({ type: 'PING' }).catch(() => undefined); // wake the SW

  chrome.tabs.onActivated.addListener(() => void refreshTab());
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes['iw:vocab']) {
      void refreshVocab();
      void refreshPageData();
    }
    if (area === 'sync' && changes['iw:settings']) void refreshSettings();
  });
}

void init();
