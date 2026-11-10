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
import type {
  IwMessage,
  IwSession,
  IwSettings,
  LevelBand,
  PageStats,
  PageWord,
  WordStatus,
} from '../shared/types';

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

/* ── 3-pass session card (ADR-0005) ────────────────────────────────────── */

const PASS_HINTS: Record<string, string> = {
  '1': 'Read for the overall meaning. Don’t stop for words.',
  '2': 'Tap words you don’t know and classify them honestly.',
  '3': 'Reread at full speed — enjoy how much clearer it feels.',
};

async function sessionApi<T>(message: IwMessage): Promise<T | null> {
  try {
    return (await chrome.runtime.sendMessage(message)) as T;
  } catch {
    return null;
  }
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

function renderSession(session: IwSession | null): void {
  const idle = el('#iw-session-idle');
  const active = el('#iw-session-active');
  if (!session) {
    idle.hidden = false;
    active.hidden = true;
    return;
  }
  idle.hidden = true;
  active.hidden = false;

  const passNum = session.pass === 'done' ? 4 : Number(session.pass);
  document.querySelectorAll('#iw-session-active .iw-step').forEach((step) => {
    const n = Number((step as HTMLElement).dataset.step);
    step.classList.toggle('done', n < passNum);
    step.classList.toggle('now', n === passNum);
  });
  el('#iw-session-hint').textContent =
    session.pass === 'done' ? 'Session complete — well read.' : (PASS_HINTS[String(session.pass)] ?? '');

  const nextBtn = el('#iw-session-next') as HTMLButtonElement;
  nextBtn.textContent = session.pass === 3 ? 'Finish session ✓' : 'Next pass →';
  nextBtn.disabled = session.pass === 'done';

  const summary = el('#iw-session-summary');
  if (session.pass === 'done') {
    summary.hidden = false;
    summary.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'iw-summary-table';
    const totalMs = Date.now() - session.startedAt;
    const rows: Array<[string, string]> = [
      ['Total time', fmtDuration(totalMs)],
      ['Lookups', String(session.stats.lookups)],
      ['Known', String(session.stats.classified.known)],
      ['Learning', String(session.stats.classified.learning)],
      ['Unknown', String(session.stats.classified.unknown)],
    ];
    for (const [label, value] of rows) {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.textContent = label;
      const td2 = document.createElement('td');
      td2.className = 'num';
      td2.textContent = value;
      tr.append(td1, td2);
      table.append(tr);
    }
    summary.append(table);
  } else {
    summary.hidden = true;
  }
}

async function refreshSession(): Promise<void> {
  const tabId = activeTabId;
  if (tabId === null) {
    renderSession(null);
    return;
  }
  const session = await sessionApi<IwSession | null>({ type: 'SESSION_GET', tabId });
  renderSession(session);
}

function bindSession(): void {
  el('#iw-session-start').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    // Start on the active tab; content script reacts to SESSION_UPDATED.
    await sessionApi({ type: 'SESSION_START', url: tab.url ?? '', tabId: tab.id });
    await refreshSession();
  });
  el('#iw-session-next').addEventListener('click', async () => {
    if (activeTabId === null) return;
    await sessionApi({ type: 'SESSION_TRANSITION', action: 'next', tabId: activeTabId });
    await refreshSession();
  });
  el('#iw-session-reset').addEventListener('click', async () => {
    if (activeTabId === null) return;
    await sessionApi({ type: 'SESSION_TRANSITION', action: 'reset', tabId: activeTabId });
    await refreshSession();
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

  el('#iw-reader-btn').addEventListener('click', async () => {
    if (activeTabId === null) return;
    try {
      await chrome.tabs.sendMessage(activeTabId, { type: 'READER_TOGGLE' } satisfies IwMessage);
    } catch {
      // Reader unavailable on this page (no content script / not readable).
    }
  });

  bindSettings();
  bindSession();
  await refreshSettings();
  await refreshTab();
  await refreshVocab();
  await refreshSession();

  void chrome.runtime.sendMessage({ type: 'PING' }).catch(() => undefined); // wake the SW

  chrome.tabs.onActivated.addListener(() => {
    void refreshTab();
    void refreshSession();
  });

  // Exposed for E2E tests: deterministic full re-detection.
  (window as unknown as { __iwRefresh: () => Promise<void> }).__iwRefresh = async () => {
    await refreshTab();
    await refreshSession();
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes['iw:vocab']) {
      void refreshVocab();
      void refreshPageData();
    }
    if (area === 'sync' && changes['iw:settings']) void refreshSettings();
    if (area === 'session') void refreshSession(); // session transitions update the card
  });
}

void init();
