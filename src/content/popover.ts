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
  /** Resolves whether a sentence token is a form of the lemma (SIP-003 highlight). */
  isWordForm?: (lemma: string, token: string) => boolean;
  /**
   * SIP-007: whether a definition/example token is worth a chained lookup —
   * the content script answers via the frequency index (rarer than the
   * user's level, minus known/ignored vocabulary).
   */
  isLinkable?: (token: string) => boolean;
  /**
   * SIP-013: on-demand Merriam-Webster Learner's lookup for the popover's
   * "still don't understand" action. Absent ⇒ the button never renders.
   */
  lookupLearners?: (
    lemma: string,
  ) => Promise<{ entry: DictionaryEntry | null; reason?: 'notfound' | 'rejected' | 'nokey' | 'network' }>;
  /** SIP-013: whether a Learner's key is stored — false hides the button. */
  hasLearnersKey?: () => boolean;
}

const STYLE = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .card {
    position: fixed; z-index: 2147483647;
    width: 480px; max-width: calc(100vw - 24px);
    background: #fffdf8; color: #1f2933;
    border: 1px solid #d9d4c8; border-radius: 12px;
    box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
    font: 13px/1.5 system-ui, "Segoe UI", sans-serif;
    padding: 12px 14px;
  }
  .head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
  .lemma { font-size: 20px; font-weight: 700; }
  .phon { color: #616e7c; font-size: 12px; }
  .add {
    margin-left: 4px; flex: none; align-self: center;
    width: 20px; height: 20px; padding: 0; line-height: 1; font-size: 14px;
    display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid #d9d4c8; background: #fff; color: #4f46e5;
    border-radius: 50%; cursor: pointer;
  }
  .add:hover { background: #eef2ff; border-color: #4f46e5; }
  .add.done { color: #059669; border-color: #059669; background: #ecfdf5; }
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
  .met .ex mark { background: #fde68a; color: inherit; font-style: italic; border-radius: 2px; padding: 0 1px; }
  .met-src { font-size: 10.5px; color: #9aa5b1; margin: 1px 0 0; }
  .syn { margin-top: 10px; }
  .syn-h { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: #9aa5b1; }
  /* SIP-006: plain inline words — no tag chrome; hover underlines (layout-stable). */
  .syn-w {
    display: inline; margin: 0; padding: 0;
    border: 0; background: none; border-radius: 0;
    font: inherit; font-size: 12.5px; color: #4338ca; cursor: pointer;
  }
  .syn-w::after { content: ", "; color: #616e7c; }
  .syn-w:last-child::after { content: ""; }
  .syn-w:hover { text-decoration: underline; color: #4f46e5; }
  /* SIP-007: tappable definition words — dotted like page candidate marks. */
  .def-w {
    display: inline; margin: 0; padding: 0;
    border: 0; background: none; font: inherit; color: inherit;
    cursor: pointer; text-decoration: underline dotted #b45309;
    text-decoration-thickness: 1px; text-underline-offset: 2px;
  }
  .def-w:hover { text-decoration-style: solid; color: #4f46e5; }
  /* SIP-008: stacked navigation — Back returns to the entry underneath. */
  .back {
    flex: none; align-self: center; margin-right: 2px;
    border: 0; background: transparent; cursor: pointer;
    font-size: 12px; color: #616e7c; padding: 2px 6px; border-radius: 6px;
  }
  .back:hover { background: #efece4; color: #1f2933; }
  .learners { margin-top: 10px; border-top: 1px dashed #ece8df; padding-top: 8px; }
  .learners-h {
    font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em;
    color: #9aa5b1;
  }
  .learners-head { margin: 4px 0 0; font-weight: 700; font-size: 14px; }
  .learners-head .phon { color: #616e7c; font-size: 12px; font-weight: 400; margin-left: 6px; }
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
  /** Vocabulary key (canonical lemma — may differ from the display word). */
  let currentVocabKey: string | null = null;
  let currentAnchor: HTMLElement | Range | null = null;
  let lookupSeq = 0;

  /** SIP-008: a rendered popover state, restorable via Back. */
  interface NavState {
    lemma: string;
    vocabKey: string;
    entry: DictionaryEntry | null;
    source: string;
    vocabEntry?: VocabEntry;
  }
  /** Entries underneath the current one; Back pops and re-renders. */
  const navStack: NavState[] = [];
  let currentNav: NavState | null = null;

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

  /** Head row: optional Back (SIP-008), lemma, phonetic, the SIP-003 "+" recorder, close. */
  function headRow(displayLemma: string, phonetic?: string): HTMLElement {
    const head = document.createElement('div');
    head.className = 'head';
    if (navStack.length > 0) {
      const back = document.createElement('button');
      back.className = 'back';
      back.type = 'button';
      back.textContent = '‹ Back';
      back.title = 'Back to the previous word';
      back.addEventListener('click', () => goBack());
      head.append(back);
    }
    const lemmaEl = document.createElement('span');
    lemmaEl.className = 'lemma';
    lemmaEl.textContent = displayLemma;
    head.append(lemmaEl);
    if (phonetic) {
      const phon = document.createElement('span');
      phon.className = 'phon';
      phon.textContent = phonetic;
      head.append(phon);
    }
    if (currentAnchor) head.append(addButton()); // after the IPA when shown (SIP-004)
    const close = document.createElement('button');
    close.className = 'close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '✕';
    close.addEventListener('click', () => closePopover());
    head.append(close);
    return head;
  }

  /** SIP-003: records the current encounter as a personal example. */
  function addButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'add';
    btn.type = 'button';
    btn.textContent = '+';
    btn.title = 'Record this sentence as an example';
    btn.setAttribute('aria-label', 'Record this sentence as an example');
    btn.addEventListener('click', () => void onAddExample(btn));
    return btn;
  }

  async function onAddExample(btn: HTMLButtonElement): Promise<void> {
    const lemma = currentVocabKey ?? currentLemma;
    if (!lemma) return;
    if (await captureExample(lemma)) flashDone(btn);
  }

  function flashDone(btn: HTMLButtonElement): void {
    btn.textContent = '✓';
    btn.classList.add('done');
    setTimeout(() => {
      if (!btn.isConnected) return; // popover re-rendered meanwhile
      btn.textContent = '+';
      btn.classList.remove('done');
    }, 1000);
  }

  /** SIP-002: "Recently met" — the ≤3 most recent personal example sentences. */
  function metSection(lemma: string, examples: VocabExample[]): HTMLElement {
    const section = document.createElement('div');
    section.className = 'met';
    const header = document.createElement('div');
    header.className = 'met-h';
    header.textContent = 'Recently met';
    section.append(header);
    for (const example of examples) {
      const ex = document.createElement('p');
      ex.className = 'ex';
      ex.append('“');
      appendHighlighted(ex, example.text, lemma);
      ex.append('”');
      section.append(ex);
      const src = document.createElement('div');
      src.className = 'met-src';
      src.textContent = sourceLabel(example);
      section.append(src);
    }
    return section;
  }

  /** Appends text with every form of the lemma wrapped in a <mark> (SIP-003). */
  function appendHighlighted(target: HTMLElement, text: string, lemma: string): void {
    const isHit = deps.isWordForm
      ? (token: string) => deps.isWordForm?.(lemma, token) === true
      : (token: string) => token.toLowerCase() === lemma;
    let last = 0;
    for (const m of text.matchAll(/[A-Za-z][A-Za-z'’-]*/g)) {
      const token = m[0];
      if (!isHit(token)) continue;
      const at = m.index ?? 0;
      if (at > last) target.append(text.slice(last, at));
      const mark = document.createElement('mark');
      mark.textContent = token;
      target.append(mark);
      last = at + token.length;
    }
    if (last < text.length) target.append(text.slice(last));
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

  /** SIP-005: thesaurus row — tapping a chip looks that word up. */
  function synonymsSection(words: string[]): HTMLElement {
    const section = document.createElement('div');
    section.className = 'syn';
    const header = document.createElement('div');
    header.className = 'syn-h';
    header.textContent = 'Synonyms';
    section.append(header);
    for (const word of words) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'syn-w';
      chip.textContent = word;
      chip.title = `Look up “${word}”`;
      chip.addEventListener('click', () => void navigate(word));
      section.append(chip);
    }
    return section;
  }

  /** SIP-007: appends text with tappable unknown-word tokens as buttons. */
  function appendWithDefinitionLinks(target: HTMLElement, text: string, headword: string): void {
    let last = 0;
    for (const m of text.matchAll(/[A-Za-z][A-Za-z'’-]*/g)) {
      const token = m[0];
      // SIP-008 restrictive guard: only pure lowercase words of ≥3 letters
      // can be recommended — never "A"/"O", capitalized words, acronyms,
      // brand-like CamelCase, or apostrophe forms. (Single letters aren't
      // in the frequency list, so the rarity predicate alone would rank
      // them "rarer than every band".) Explicit dblclick remains ungated.
      const linkable =
        /^[a-z]{3,}$/.test(token) &&
        !!deps.isLinkable &&
        deps.isLinkable(token) === true &&
        !isFormOfHeadword(headword, token);
      if (!linkable) continue;
      const at = m.index ?? 0;
      if (at > last) target.append(text.slice(last, at));
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'def-w';
      btn.textContent = token;
      btn.title = `Look up “${token}”`;
      btn.addEventListener('click', () => void navigate(token));
      target.append(btn);
      last = at + token.length;
    }
    if (last < text.length) target.append(text.slice(last));
  }

  function isFormOfHeadword(headword: string, token: string): boolean {
    return deps.isWordForm
      ? deps.isWordForm(headword, token) === true
      : token.toLowerCase() === headword;
  }

  /**
   * SIP-015: Apple-Dictionary-style simultaneous sources — when a key is
   * configured, the Learner's section mounts directly below the
   * definitions in a "Looking up…" state and fills when the (cached)
   * lookup resolves. Misses/network errors remove it again; a rejected
   * key stays visible because it is actionable.
   */
  async function attachLearners(lemma: string): Promise<void> {
    if (!deps.lookupLearners) return;
    const seq = lookupSeq;
    const section = document.createElement('div');
    section.className = 'learners';
    const header = document.createElement('div');
    header.className = 'learners-h';
    header.textContent = "Learner's dictionary · Merriam-Webster";
    section.append(header);
    const state = document.createElement('p');
    state.className = 'state';
    state.textContent = 'Looking up…';
    section.append(state);
    // Mount in natural DOM order: right after the last rendered sense —
    // no post-hoc insertion (the `.before() ?? append` bug class, SBFP'd
    // in SIP-015, cannot recur).
    const senses = card.querySelectorAll('.sense');
    const lastSense = senses.length > 0 ? senses[senses.length - 1] : null;
    if (lastSense) {
      lastSense.after(section);
    } else {
      card.append(section);
    }

    let result: Awaited<ReturnType<NonNullable<typeof deps.lookupLearners>>>;
    try {
      result = await deps.lookupLearners(lemma);
    } catch {
      result = { entry: null, reason: 'network' };
    }
    if (seq !== lookupSeq || !section.isConnected) return; // superseded or closed

    if (result.entry) {
      section.innerHTML = '';
      section.append(header);
      const head = document.createElement('p');
      head.className = 'learners-head';
      head.append(result.entry.lemma);
      if (result.entry.phonetic) {
        const phon = document.createElement('span');
        phon.className = 'phon';
        phon.textContent = result.entry.phonetic;
        head.append(phon);
      }
      section.append(head);
      for (const sense of result.entry.senses.slice(0, 3)) {
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
        section.append(wrap);
      }
    } else if (result.reason === 'rejected') {
      state.textContent =
        "The Merriam-Webster key was rejected — check the Learner's dictionary section on the options page.";
    } else {
      section.remove(); // miss or network hiccup: Apple-style, absent sources are hidden
    }
  }

  function renderEntry(lemma: string, entry: DictionaryEntry, source: string, vocabEntry?: VocabEntry): void {
    const activeStatus = vocabEntry?.status;
    card.innerHTML = '';

    currentNav = {
      lemma: entry.lemma ?? lemma,
      vocabKey: currentVocabKey ?? lemma,
      entry,
      source,
      vocabEntry,
    };
    card.append(headRow(entry.lemma ?? lemma, entry.phonetic));

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
      appendWithDefinitionLinks(def, sense.definition, entry.lemma ?? lemma);
      wrap.append(def);
      if (sense.example) {
        const ex = document.createElement('p');
        ex.className = 'ex';
        ex.append('“');
        appendWithDefinitionLinks(ex, sense.example, entry.lemma ?? lemma);
        ex.append('”');
        wrap.append(ex);
      }
      card.append(wrap);
    }

    // SIP-015: simultaneous sources — the Learner's section mounts below
    // the definitions when a key is configured and this entry is not
    // already the learner's answer.
    if (deps.lookupLearners && (deps.hasLearnersKey?.() ?? true) && source !== 'mw') {
      void attachLearners(entry.lemma ?? lemma);
    }

    if (entry.synonyms?.length) {
      card.append(synonymsSection(entry.synonyms));
    }

    if (vocabEntry?.examples?.length) {
      card.append(metSection(currentVocabKey ?? lemma, vocabEntry.examples));
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

    if (source === 'core' || source === 'api' || source === 'mw' || source === 'cache') {
      const src = document.createElement('div');
      src.className = 'src';
      src.textContent =
        source === 'core'
          ? 'offline dictionary'
          : source === 'mw'
            ? "Merriam-Webster Learner's"
            : 'dictionaryapi.dev';
      card.append(src);
    }

    card.style.display = 'block';
    position(currentAnchor);
  }

  function renderNoDefinition(lemma: string, vocabEntry?: VocabEntry): void {
    card.innerHTML = '';
    currentNav = {
      lemma,
      vocabKey: currentVocabKey ?? lemma,
      entry: null,
      source: 'none',
      vocabEntry,
    };
    card.append(headRow(lemma));
    const state = document.createElement('p');
    state.className = 'state';
    state.textContent = `No monolingual definition found for “${lemma}”.`;
    card.append(state);
    if (vocabEntry?.examples?.length) {
      card.append(metSection(currentVocabKey ?? lemma, vocabEntry.examples));
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
    const lemma = currentVocabKey ?? currentLemma;
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
  async function captureExample(lemma: string): Promise<boolean> {
    const sentence = extractSentence(currentAnchor);
    if (!sentence) return false;
    try {
      const entry = await deps.vocab.addExample(lemma, sentence);
      refreshMet(lemma, entry.examples);
      return true;
    } catch {
      // Capture is best-effort; the classification itself already persisted.
      return false;
    }
  }

  /** Re-render the met section in the open card (used after a live capture). */
  function refreshMet(lemma: string, examples: VocabExample[] | undefined): void {
    card.querySelector('.met')?.remove();
    if (!examples?.length) return;
    card.querySelector('.status-row')?.before(metSection(lemma, examples));
  }

  /** Loads and renders one entry (used by root opens and stacked navigation). */
  async function loadEntry(lemma: string, vocabKey: string): Promise<void> {
    currentLemma = lemma;
    currentVocabKey = vocabKey;
    const seq = ++lookupSeq;
    renderLoading(lemma);
    position(currentAnchor);

    const [result, entry] = await Promise.all([
      deps.lookup(lemma),
      deps.vocab.getEntry(vocabKey),
    ]);
    if (seq !== lookupSeq || currentLemma !== lemma) return; // superseded or closed

    if (result.entry) {
      renderEntry(lemma, result.entry, result.source, entry);
    } else {
      renderNoDefinition(lemma, entry);
    }
    void deps.vocab.bumpLookup(vocabKey).catch(() => undefined);
  }

  /**
   * `lemma` is the display word (drives the dictionary lookup);
   * `vocabKey` is the canonical form all vocabulary state keys — the
   * dblclick/context-menu paths resolve it via the frequency index, because
   * the tagger tags e.g. "evening" under lemma "even" (bug-2026-11-12-001).
   */
  async function openFor(
    anchor: HTMLElement | Range | null,
    lemma: string,
    vocabKey?: string,
  ): Promise<void> {
    currentAnchor = anchor;
    navStack.length = 0; // a root open starts a fresh stack (SIP-008)
    await loadEntry(lemma, vocabKey ?? lemma);
  }

  /** SIP-008: stacked in-popover navigation — the current entry stays underneath. */
  async function navigate(word: string): Promise<void> {
    if (!currentNav) return;
    navStack.push(currentNav);
    await loadEntry(word, word);
  }

  /** SIP-008: re-render the entry underneath — instant, no re-lookup. */
  function goBack(): void {
    const prev = navStack.pop();
    if (!prev) return;
    lookupSeq++; // cancel any pending load for a superseded navigation
    currentLemma = prev.lemma;
    currentVocabKey = prev.vocabKey;
    if (prev.entry) {
      renderEntry(prev.lemma, prev.entry, prev.source, prev.vocabEntry);
    } else {
      renderNoDefinition(prev.lemma, prev.vocabEntry);
    }
  }

  /** SIP-008: dblclick selects a word natively — look it up, whatever it is. */
  function onCardDblClick(event: Event): void {
    if ((event.target as Element | null)?.closest?.('button')) return; // buttons aren't word lookups
    const selection = window.getSelection()?.toString() ?? '';
    const word = (selection.match(/[A-Za-z][A-Za-z'’-]*/) ?? [])[0];
    if (!word) return;
    const key = currentLemma;
    if (key && isFormOfHeadword(key, word)) return; // same word — nothing to learn
    void navigate(word);
  }

  function closePopover(): void {
    currentLemma = null;
    currentVocabKey = null;
    currentAnchor = null;
    currentNav = null;
    navStack.length = 0;
    lookupSeq++;
    card.style.display = 'none';
    card.innerHTML = '';
  }

  const isOpen = (): boolean => card.style.display === 'block';

  /** SIP-004: inline width overrides the stylesheet default (setting-driven). */
  function setWidth(px: number): void {
    card.style.width = `${px}px`;
  }

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
  card.addEventListener('dblclick', onCardDblClick);

  return {
    openFor,
    close: closePopover,
    isOpen,
    setWidth,
    /** Test seam: the shadow card element. */
    _card: card,
  };
}
