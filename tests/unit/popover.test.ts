import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPopover } from '../../src/content/popover';
import { createVocabStore, type VocabStorageLike } from '../../src/shared/vocab';
import type { DictionaryEntry } from '../../src/shared/types';

function fakeStorage(): VocabStorageLike {
  const data = new Map<string, unknown>();
  return {
    async get(keys) {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (data.has(k)) out[k] = data.get(k);
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    },
  };
}

const ENTRY: DictionaryEntry = {
  lemma: 'observe',
  phonetic: '/əbˈzɜːrv/',
  senses: [
    { partOfSpeech: 'verb', definition: 'discover or determine the existence of something', example: 'she observed a change' },
    { partOfSpeech: 'verb', definition: 'watch carefully' },
  ],
};

function makePopover(overrides: { entry?: DictionaryEntry | null } = {}) {
  const vocab = createVocabStore(fakeStorage());
  const onStatusChange = vi.fn();
  const entry = overrides.entry === undefined ? ENTRY : overrides.entry;
  const popover = createPopover({
    lookup: async () => ({ entry, source: 'core' }),
    vocab,
    onStatusChange,
  });
  return { popover, vocab, onStatusChange };
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.getElementById('iw-popover-host')?.remove();
});

describe('popover', () => {
  it('renders a monolingual entry with senses, phonetics and status buttons', async () => {
    const { popover } = makePopover();
    await popover.openFor(null, 'observe');
    const card = popover._card;

    expect(card.querySelector('.lemma')?.textContent).toBe('observe');
    expect(card.querySelector('.phon')?.textContent).toBe('/əbˈzɜːrv/');
    const defs = [...card.querySelectorAll('.def')].map((d) => d.textContent);
    expect(defs).toHaveLength(2);
    expect(defs[0]).toContain('discover or determine');
    expect(card.querySelector('.ex')?.textContent).toContain('observed a change');
    const buttons = [...card.querySelectorAll<HTMLButtonElement>('.status-row button')];
    expect(buttons.map((b) => b.dataset.status)).toEqual(['known', 'learning', 'unknown', 'ignored']);
    expect(card.textContent).toContain('offline dictionary');
    popover.close();
  });

  it('caps rendered senses at three', async () => {
    const entry: DictionaryEntry = {
      lemma: 'word',
      senses: [1, 2, 3, 4, 5].map((i) => ({ definition: `sense ${i}` })),
    };
    const { popover } = makePopover({ entry });
    await popover.openFor(null, 'word');
    expect(popover._card.querySelectorAll('.def')).toHaveLength(3);
    popover.close();
  });

  it('shows a no-definition state that still allows classification', async () => {
    const { popover, onStatusChange } = makePopover({ entry: null });
    await popover.openFor(null, 'zzzqqq');
    expect(popover._card.textContent).toContain('No monolingual definition found');

    const unknownBtn = popover._card.querySelector<HTMLButtonElement>(
      'button[data-status="unknown"]',
    )!;
    unknownBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(onStatusChange).toHaveBeenCalledWith('zzzqqq', 'unknown');
    popover.close();
  });

  it('status clicks persist to the vocabulary and mark the active button', async () => {
    const { popover, vocab } = makePopover();
    await popover.openFor(null, 'observe');

    const learningBtn = popover._card.querySelector<HTMLButtonElement>(
      'button[data-status="learning"]',
    )!;
    learningBtn.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(learningBtn.classList.contains('active')).toBe(true);
    expect(await vocab.statusOf('observe')).toBe('learning');
    popover.close();
  });

  it('highlights the pre-existing status when reopened', async () => {
    const { popover, vocab } = makePopover();
    await vocab.setStatus('observe', 'unknown');
    await popover.openFor(null, 'observe');
    const active = popover._card.querySelector('.status-row button.active') as HTMLButtonElement;
    expect(active?.dataset.status).toBe('unknown');
    popover.close();
  });

  it('close hides the card and Escape closes it', async () => {
    const { popover } = makePopover();
    await popover.openFor(null, 'observe');
    expect(popover.isOpen()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(popover.isOpen()).toBe(false);
  });

  it('renders saved examples in a Recently met section (SIP-002)', async () => {
    const { popover, vocab } = makePopover();
    await vocab.setStatus('observe', 'learning');
    await vocab.addExample('observe', {
      text: 'We observed the eclipse together.',
      url: 'https://example.com/post',
    });
    await popover.openFor(null, 'observe');
    const text = popover._card.textContent ?? '';
    expect(text).toContain('Recently met');
    expect(text).toContain('We observed the eclipse together.');
    expect(text).toContain('example.com');
    popover.close();
  });

  it('clicking Learning captures the sentence around the clicked word (SIP-002)', async () => {
    document.body.innerHTML =
      '<p>He was tired. The <span class="iw-word" data-lemma="gossamer">gossamer</span> veil shone.</p>';
    const span = document.querySelector('span.iw-word') as HTMLElement;
    const vocab = createVocabStore(fakeStorage());
    const popover = createPopover({
      lookup: async () => ({ entry: ENTRY, source: 'core' }),
      vocab,
      onStatusChange: vi.fn(),
    });

    await popover.openFor(span, 'gossamer');
    const learningBtn = popover._card.querySelector<HTMLButtonElement>(
      'button[data-status="learning"]',
    )!;
    expect(popover._card.textContent).not.toContain('Recently met'); // nothing captured yet

    learningBtn.click();
    await new Promise((r) => setTimeout(r, 0));

    const entry = await vocab.getEntry('gossamer');
    expect(entry?.status).toBe('learning');
    expect(entry?.examples?.[0]?.text).toBe('The gossamer veil shone.');
    // The open card shows the capture without a reopen.
    expect(popover._card.textContent).toContain('Recently met');
    expect(popover._card.textContent).toContain('The gossamer veil shone.');
    popover.close();
  });

  it('does not capture anything when the anchor is gone (SIP-002)', async () => {
    const { popover, vocab } = makePopover();
    await popover.openFor(null, 'observe'); // no anchor at all
    const learningBtn = popover._card.querySelector<HTMLButtonElement>(
      'button[data-status="learning"]',
    )!;
    learningBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    const entry = await vocab.getEntry('observe');
    expect(entry?.status).toBe('learning');
    expect(entry?.examples).toBeUndefined();
    popover.close();
  });
});
