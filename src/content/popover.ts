/**
 * Word-definition popover (ADR-0001 §3, F2). A single fixed-position host
 * element with an open Shadow DOM renders monolingual definitions and the
 * status buttons. Shadow isolation keeps host-page CSS out and our styles
 * in; the tagger's spans stay untouched light-DOM elements.
 */

import type { DictionaryEntry, WordStatus } from '../shared/types';
import type { VocabEntry, VocabExample, VocabStore } from '../shared/vocab';
import { extractSentence } from './sentence';

export interface PopoverDeps {
  lookup: (lemma: string) => Promise<{ entry: DictionaryEntry | null; source: string }>;
  vocab: VocabStore;
  onStatusChange?: (lemma: string, status: WordStatus) => void;
}

const STYLE = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .card {
    position: fixed; z-index: 2147483647;
    width: 320px; max-width: calc(100vw - 24px);
    background: #fffdf8; color: #1f2933;
    border: 1px solid #d9d4c8; border-radius: 12px;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
    font: 13px/1.5 system-ui, "Segoe UI", sans-serif;
    padding: 12px 14px;
  }
  .head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
  .lemma { font-size: 17px; font-weight: 700; }
  .phon { color: #616e7c; font-size: 12px; }
  .close {
    margin-left: auto; border: 0; background: transparent; cursor: pointer;
    font-size: 15px; color: #616e7c; padding: 2px 6px; border-radius: 6px;
  }
  .close:hover { background: #efece4; }
  .sense { margin: 8px 0; }
  .pos {
    display: inline-block; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em;
    color: #4f46e5; background: #eef2ff; border-radius: 4px; padding: 1px 5px; margin-right: 6px;
  }
  .def { margin: 3px 0 0; }
  .ex { margin: 2px 0 0; color: #616e7c; font-style: italic; }
  .status-row { display: flex; gap: 6px; margin-top: 10px; border-top: 1px solid #ece8df; padding-top: 10px; }
  .status-row button {
    flex: 1; border: 1px solid #d9d4c8; background: #fff; cursor: pointer;
    padding: 5px 0; border-radius: 8px; font-size: 12px; color: #333;
  }
  .status-row button:hover { background: #f4f1ea; }
  .status-row button.active { border-color: #4f46e5; background: #eef2ff; color: #4f46e5; font-weight: 600; }
  .status-row button[data-status="known"].active { border-color: #059669; background: #ecfdf5; color: #047857; }
  .status-row button[data-status="learning"].active { border-color: #0284c7; background: #f0f9ff; color: #0369a1; }
  .status-row button[data-status="unknown"].active { border-color: #d97706; background: #fffbeb; color: #b45309; }
  .status-row button[data-status="ignored"].active { border-color: #6b7280; background: #f3f4f6; color: #4b5563; }
  .state { color: #616e7c; padding: 8px 0; text-align: center; }
  .state.err { color: #b91c1c; }
  .src { font-size: 10.5px; color: #9aa5b1; margin-top: 8px; text-align: right; }
  .met { margin-top: 10px; border-top: 1px dashed #ece8df; padding-top: 8px; }
  .met-h {
    font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em;
    color: #9aa5b1;
  }
  .met .ex { margin: 5px 0 0; }
  .met-src { font-size: 10.5px; color: #9aa5b1; margin: 1px 0 0; }
`;

const STATUS_LABELS: Array<[WordStatus, string]> = [
  ['known', 'Known'],
  ['learning', 'Learning'],
  ['unknown', 'Unknown'],
  ['ignored', 'Ignore'],
];

export function createPopover(deps: PopoverDeps) {
  const host = document.createElement('div');
  host.className = 'iw-ui';
  host.id = 'iw-popover-host';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  const card = document.createElement('div');
  card.className = 'card';
  card.style.display = 'none';
  shadow.append(style, card);
  document.documentElement.append(host);

  let currentLemma: string | null = null;
  let currentAnchor: HTMLElement | Range | null = null;
  let lookupSeq = 0;

  function renderLoading(lemma: string): void {
    card.innerHTML = '';
    const state = document.createElement('p');
    state.className = 'state';
    state.textContent = `Looking up “${lemma}”…`;
    card.append(state);
    card.style.display = 'block';
  }

  /** Anchors: a tagged span (click path) or the selection rect (U8 lookup path). */
  function position(near: HTMLElement | Range | null): void {
    const rect = near?.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const box = card.getBoundingClientRect();
    let x: number;
    let y: number;
    if (rect) {
      x = Math.min(Math.max(12, rect.left + rect.width / 2 - box.width / 2), vw - box.width - 12);
      // Prefer above the word; flip below when there is no room.
      y = rect.top - box.height - 8 >= 8 ? rect.top - box.height - 8 : Math.min(rect.bottom + 8, vh - box.height - 12);
    } else {
      x = vw / 2 - box.width / 2;
      y = vh / 2 - box.height / 2;
    }
    card.style.left = `${Math.max(8, x)}px`;
    card.style.top = `${Math.max(8, y)}px`;
  }

  /** SIP-002: "Recently met" — the ≤3 sentences where the word was marked Learning. */
  function metSection(examples: VocabExample[]): HTMLElement {
    const section = document.createElement('div');
    section.className = 'met';
    const header = document.createElement('div');
    header.className = 'met-h';
    header.textContent = 'Recently met';
    section.append(header);
    for (const example of examples) {
      const ex = document.createElement('p');
      ex.className = 'ex';
      ex.textContent = `“${example.text}”`;
      section.append(ex);
      const src = document.createElement('div');
      src.className = 'met-src';
      src.textContent = sourceLabel(example);
      section.append(src);
    }
    return section;
  }

  function sourceLabel(example: VocabExample): string {
    let host = example.url;
    try {
      host = new URL(example.url).host;
    } catch {
      // Not a parseable URL — show it raw.
    }
    return `${host} · ${new Date(example.capturedAt).toISOString().slice(0, 10)}`;
  }

  function renderEntry(lemma: string, entry: DictionaryEntry, source: string, vocabEntry?: VocabEntry): void {
    const activeStatus = vocabEntry?.status;
    card.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'head';
    const lemmaEl = document.createElement('span');
    lemmaEl.className = 'lemma';
    lemmaEl.textContent = entry.lemma ?? lemma;
    head.append(lemmaEl);
    if (entry.phonetic) {
      const phon = document.createElement('span');
      phon.className = 'phon';
      phon.textContent = entry.phonetic;
      head.append(phon);
    }
    const close = document.createElement('button');
    close.className = 'close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '✕';
    close.addEventListener('click', () => closePopover());
    head.append(close);
    card.append(head);

    for (const sense of entry.senses.slice(0, 3)) {
      const wrap = document.createElement('div');
      wrap.className = 'sense';
      if (sense.partOfSpeech) {
        const pos = document.createElement('span');
        pos.className = 'pos';
        pos.textContent = sense.partOfSpeech;
        wrap.append(pos);
      }
      const def = document.createElement('p');
      def.className = 'def';
      def.textContent = sense.definition;
      wrap.append(def);
      if (sense.example) {
        const ex = document.createElement('p');
        ex.className = 'ex';
        ex.textContent = `“${sense.example}”`;
        wrap.append(ex);
      }
      card.append(wrap);
    }

    if (vocabEntry?.examples?.length) {
      card.append(metSection(vocabEntry.examples));
    }

    const row = document.createElement('div');
    row.className = 'status-row';
    for (const [status, label] of STATUS_LABELS) {
      const btn = document.createElement('button');
      btn.dataset.status = status;
      btn.textContent = label;
      if (status === activeStatus) btn.classList.add('active');
      btn.addEventListener('click', () => void onStatus(status));
      row.append(btn);
    }
    card.append(row);

    if (source === 'core' || source === 'api' || source === 'cache') {
      const src = document.createElement('div');
      src.className = 'src';
      src.textContent = source === 'core' ? 'offline dictionary' : 'dictionaryapi.dev';
      card.append(src);
    }

    card.style.display = 'block';
    position(currentAnchor);
  }

  function renderNoDefinition(lemma: string, vocabEntry?: VocabEntry): void {
    card.innerHTML = '';
    const state = document.createElement('p');
    state.className = 'state';
    state.textContent = `No monolingual definition found for “${lemma}”.`;
    card.append(state);
    if (vocabEntry?.examples?.length) {
      card.append(metSection(vocabEntry.examples));
    }
    const row = statusRow();
    card.append(row);
    card.style.display = 'block';
    position(currentAnchor);
  }

  function statusRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'status-row';
    for (const [status, label] of STATUS_LABELS) {
      const btn = document.createElement('button');
      btn.dataset.status = status;
      btn.textContent = label;
      btn.addEventListener('click', () => void onStatus(status));
      row.append(btn);
    }
    return row;
  }

  async function onStatus(status: WordStatus): Promise<void> {
    const lemma = currentLemma;
    if (!lemma) return;
    await deps.vocab.setStatus(lemma, status);
    deps.onStatusChange?.(lemma, status);
    if (status === 'learning') await captureExample(lemma);
    // Reflect the new active button without re-looking-up.
    card.querySelectorAll<HTMLButtonElement>('.status-row button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.status === status);
    });
  }

  /** SIP-002: the Learning click remembers the sentence it happened in. */
  async function captureExample(lemma: string): Promise<void> {
    const sentence = extractSentence(currentAnchor);
    if (!sentence) return;
    try {
      const entry = await deps.vocab.addExample(lemma, sentence);
      refreshMet(entry.examples);
    } catch {
      // Capture is best-effort; the classification itself already persisted.
    }
  }

  /** Re-render the met section in the open card (used after a live capture). */
  function refreshMet(examples: VocabExample[] | undefined): void {
    card.querySelector('.met')?.remove();
    if (!examples?.length) return;
    card.querySelector('.status-row')?.before(metSection(examples));
  }

  async function openFor(anchor: HTMLElement | Range | null, lemma: string): Promise<void> {
    currentAnchor = anchor;
    currentLemma = lemma;
    const seq = ++lookupSeq;
    renderLoading(lemma);
    position(anchor);

    const [result, entry] = await Promise.all([
      deps.lookup(lemma),
      deps.vocab.getEntry(lemma),
    ]);
    if (seq !== lookupSeq || currentLemma !== lemma) return; // superseded or closed

    if (result.entry) {
      renderEntry(lemma, result.entry, result.source, entry);
    } else {
      renderNoDefinition(lemma, entry);
    }
    void deps.vocab.bumpLookup(lemma).catch(() => undefined);
  }

  function closePopover(): void {
    currentLemma = null;
    currentAnchor = null;
    lookupSeq++;
    card.style.display = 'none';
    card.innerHTML = '';
  }

  const isOpen = (): boolean => card.style.display === 'block';

  function onDocClick(event: Event): void {
    if (!isOpen()) return;
    const path = event.composedPath();
    // A Range anchor never appears in a composed path — only elements do.
    if (!path.includes(host) && !(currentAnchor instanceof HTMLElement && path.includes(currentAnchor))) {
      closePopover();
    }
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') closePopover();
  }

  document.addEventListener('click', onDocClick, true);
  document.addEventListener('keydown', onKey, true);

  return {
    openFor,
    close: closePopover,
    isOpen,
    /** Test seam: the shadow card element. */
    _card: card,
  };
}
