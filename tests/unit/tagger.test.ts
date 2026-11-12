import { beforeEach, describe, expect, it } from 'vitest';
import { createTagger, type VocabLike } from '../../src/content/tagger';
import { createFrequencyIndex } from '../../src/shared/frequency';
import { createLemmatizer } from '../../src/shared/lemmatizer';
import { DEFAULT_SETTINGS, type IwSettings, type WordStatus } from '../../src/shared/types';

/**
 * Synthetic corpus with REALISTIC rank positions (padded with placeholders
 * so ranks match the real 20k list): house(3), beautiful(1397),
 * studying(6255), observe(7565); sentence filler sits in the top ~150;
 * every other word (serendipity, petrichor …) is unlisted → rare.
 */
const RANKS: Record<string, number> = {
  house: 3,
  beautiful: 1_397,
  studying: 6_255,
  observe: 7_565,
};
const FILLER = [
  'the', 'of', 'a', 'and', 'to', 'in', 'was', 'but', 'for', 'she', 'her', 'it',
  'that', 'as', 'if', 'might', 'into', 'after', 'is', 'at', 'every', 'about',
  'how', 'by', 'here', 'there', 'near', 'made', 'seem', 'almost', 'word',
  'day', 'end', 'old', 'new', 'full', 'air', 'felt', 'quiet', 'kept',
  'evening', 'birds', 'exam', 'because', 'wanted', 'language', 'slowly',
  'reveals', 'itself', 'moment', 'whole', 'street', 'pure', 'simple',
  'together', 'talked', 'family', 'ate', 'dinner', 'stood', 'road', 'calm',
  'rain', 'sun', 'market', 'announced', 'rose', 'one', 'all', 'be', 'they',
  'with', 'or', 'on', 'an',
];

const CORPUS_SIZE = 8_000;
const WORDS: string[] = Array.from({ length: CORPUS_SIZE }, (_, i) => `__placeholder${i}`);
FILLER.forEach((w, i) => {
  WORDS[i] = w;
});
for (const [word, rank] of Object.entries(RANKS)) {
  WORDS[rank - 1] = word;
}
const KNOWN = new Set(WORDS);

function makeIndex() {
  return createFrequencyIndex(WORDS, (s) => createLemmatizer({ knownLemmas: KNOWN }).lemma(s));
}

function makeTagger(overrides: { settings?: Partial<IwSettings>; vocab?: VocabLike } = {}) {
  return createTagger({
    frequency: makeIndex(),
    settings: { ...DEFAULT_SETTINGS, ...overrides.settings },
    vocab: overrides.vocab,
  });
}

function article(html: string): HTMLElement {
  document.body.innerHTML = '';
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

function lemmasIn(root: ParentNode): string[] {
  return [...root.querySelectorAll<HTMLElement>('span.iw-word')].map((s) => s.dataset.lemma!);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('tagger — wrapping', () => {
  it('never tags inside links and wraps the first char in .iw-f (feat-2026-11-11-001)', async () => {
    const root = article(
      '<p>See <a href="https://example.com/wonder">gossamer wings</a> and serendipity.</p>',
    );
    const tagger = makeTagger();
    await tagger.scan(root);

    // Links are untouched: no spans, text and href intact.
    const link = root.querySelector('a')!;
    expect(link.querySelectorAll('span.iw-word')).toHaveLength(0);
    expect(link.textContent).toBe('gossamer wings');

    // Words outside the link tag; the first character sits in .iw-f so the
    // tag-style preference can move the decoration (CSS-only switching).
    const span = root.querySelector<HTMLElement>('span.iw-word[data-lemma="serendipity"]')!;
    expect(span).not.toBeNull();
    expect(span.textContent).toBe('serendipity'); // text preserved exactly
    const f = span.querySelector<HTMLElement>('.iw-f')!;
    expect(f.textContent).toBe('s');
    expect(f.parentElement).toBe(span);
  });

  it('wraps words rarer than the level band, leaves common words untouched', async () => {
    const root = article('<p>The house was quiet, but the air felt full of serendipity.</p>');
    const tagger = makeTagger(); // level 5k — every corpus word ranks well within band
    const wrapped = await tagger.scan(root);

    // 'serendipity' is not in the corpus → the only candidate.
    expect(wrapped).toBe(1);
    const spans = root.querySelectorAll<HTMLElement>('span.iw-word');
    expect(spans).toHaveLength(1);
    expect(spans[0]!.dataset.lemma).toBe('serendipity');
    expect(spans[0]!.dataset.iwStatus).toBe('candidate');
    expect(spans[0]!.textContent).toBe('serendipity');
  });

  it('respects the level band (2k/5k mark mid-frequency words, 20k does not)', async () => {
    const sentence = '<p>She kept studying every evening to observe the birds.</p>';

    // studying(6255) and observe(7565) are rare beyond 2k and 5k…
    for (const band of ['2k', '5k'] as const) {
      const tagger = makeTagger({ settings: { level: band } });
      const root = article(sentence);
      expect(await tagger.scan(root)).toBe(2);
      expect(lemmasIn(root).sort()).toEqual(['observe', 'studying']);
    }

    // …but comfortably inside the 20k band.
    const at20k = makeTagger({ settings: { level: '20k' } });
    const root20k = article(sentence);
    expect(await at20k.scan(root20k)).toBe(0);
  });

  it('tags all occurrences and preserves the surrounding text exactly', async () => {
    const original = 'The petrichor rose; petrichor after rain is petrichor pure and simple.';
    const root = article(`<p>${original}</p>`);
    const tagger = makeTagger();
    await tagger.scan(root);
    const p = root.querySelector('p')!;
    expect(p.textContent).toBe(original);
    expect(root.querySelectorAll('span.iw-word')).toHaveLength(3);
  });

  it('lemmatizes tagged forms to shared data-lemma values', async () => {
    // Rare lemmas are absent from the frequency corpus; the lemmatizer's
    // rare-word fallback still reduces inflections to a shared lemma.
    const root = article('<p>The cacophonies of the market glistened in the sun.</p>');
    const tagger = makeTagger();
    await tagger.scan(root);
    expect(lemmasIn(root).sort()).toEqual(['cacophony', 'glisten']);
  });

  it('skips acronyms like NASA', async () => {
    const root = article('<p>NASA announced serendipity.</p>');
    const tagger = makeTagger();
    expect(await tagger.scan(root)).toBe(1); // only serendipity
  });

  it('treats possessives as their base noun (bug-2026-11-11-003)', async () => {
    // "family's" — 'family' is corpus-listed → common → not tagged at all
    // (previously every possessive was rank-0 "ultra-rare" garbage).
    // "vendor's" — 'vendor' is unlisted → tagged with the clean lemma.
    const root = article("<p>The family's car and the vendor's stall.</p>");
    const tagger = makeTagger();
    await tagger.scan(root);
    const lemmas = lemmasIn(root);
    expect(lemmas).not.toContain("family's");
    expect(lemmas).not.toContain("vendor's");
    expect(lemmas).toContain('vendor');
  });

  it('never tags contractions or fixed apostrophe forms (bug-2026-11-11-005)', async () => {
    const root = article(
      "<p>You're reading and I'm listening; you'll see it, we can't stop, they won't mind, " +
        "he don't know, by nine o'clock the ma'am sighed, the vendor's serendipity.</p>",
    );
    const tagger = makeTagger();
    await tagger.scan(root);
    const lemmas = lemmasIn(root);
    for (const form of ["you're", 'i\'m', "you'll", "can't", "won't", "don't", "o'clock", "ma'am"]) {
      expect(lemmas).not.toContain(form);
    }
    // Possessives still reduce and tag: vendor's → vendor (unlisted here).
    expect(lemmas).toContain('vendor');
    // Ordinary rare words in the same sentence still tag.
    expect(lemmas).toContain('serendipity');
  });

  it('never tags brands, acronym plurals, or hostname components (bug-2026-11-11-004)', async () => {
    const root = article(
      '<p id="brands">hashes, external IPs, domains and URLs (VirusTotal, abuse.ch, ' +
        'AbuseIPDB, GreyNoise, urlscan.io) and serendipity</p>',
    );
    const tagger = makeTagger();
    await tagger.scan(root);
    const lemmas = lemmasIn(root);
    // Brands and product names (CamelCase).
    for (const brand of ['virustotal', 'abuseipdb', 'greynoise']) {
      expect(lemmas).not.toContain(brand);
    }
    // Acronym plurals.
    expect(lemmas).not.toContain('urls');
    expect(lemmas).not.toContain('ips');
    // Hostname components (both sides of the dot).
    expect(lemmas).not.toContain('urlscan');
    expect(lemmas).not.toContain('io');
    // Ordinary words in the same sentence still tag normally.
    expect(lemmas).toContain('hashes');
    expect(lemmas).toContain('serendipity');
  });
});

describe('tagger — skip rules', () => {
  it('never touches code, pre, textarea, inputs, or contenteditable', async () => {
    const root = article(`
      <p id="ok">serendipity here</p>
      <pre>serendipity</pre>
      <code>serendipity</code>
      <textarea>serendipity</textarea>
      <div contenteditable="true">serendipity</div>
      <div aria-hidden="true">serendipity</div>
    `);
    const tagger = makeTagger();
    const wrapped = await tagger.scan(root);
    expect(wrapped).toBe(1);
    expect(root.querySelector('#ok span.iw-word')).not.toBeNull();
  });

  it('is idempotent — rescans add nothing and duplicate nothing', async () => {
    const root = article('<p>serendipity and petrichor and defenestration</p>');
    const tagger = makeTagger();
    await tagger.scan(root);
    const afterFirst = root.querySelectorAll('span.iw-word').length;
    expect(await tagger.scan(root)).toBe(0);
    expect(root.querySelectorAll('span.iw-word').length).toBe(afterFirst);
    expect(root.querySelectorAll('span.iw-word span.iw-word').length).toBe(0);
  });
});

describe('tagger — vocabulary overlay', () => {
  const vocab = (statuses: Record<string, WordStatus>): VocabLike => ({
    statusOf: (lemma) => statuses[lemma],
  });

  it('never tags words marked known or ignored', async () => {
    const root = article('<p>serendipity, petrichor, and defenestration together.</p>');
    const tagger = makeTagger({
      vocab: vocab({ serendipity: 'known', petrichor: 'ignored' }),
    });
    await tagger.scan(root);
    expect(lemmasIn(root)).toEqual(['defenestration']);
  });

  it('renders learner statuses instead of candidate', async () => {
    const root = article('<p>serendipity and petrichor</p>');
    const tagger = makeTagger({
      vocab: vocab({ serendipity: 'unknown', petrichor: 'learning' }),
    });
    await tagger.scan(root);
    const byLemma = new Map(
      [...root.querySelectorAll<HTMLElement>('span.iw-word')].map((s) => [
        s.dataset.lemma!,
        s.dataset.iwStatus,
      ]),
    );
    expect(byLemma.get('serendipity')).toBe('unknown');
    expect(byLemma.get('petrichor')).toBe('learning');
  });

  it('refreshStatus flips statuses in place without rewrapping', async () => {
    const root = article('<p>serendipity here and serendipity there</p>');
    const tagger = makeTagger();
    await tagger.scan(root);
    const spans = [...root.querySelectorAll<HTMLElement>('span.iw-word')];
    expect(spans.every((s) => s.dataset.iwStatus === 'candidate')).toBe(true);

    tagger.refreshStatus('serendipity', 'known');
    expect(spans.map((s) => s.dataset.iwStatus)).toEqual(['known', 'known']);
    // Same nodes (no rewrap): identity preserved.
    expect([...root.querySelectorAll('span.iw-word')]).toEqual(spans);
  });
});

describe('tagger — untag', () => {
  it('restores the original DOM text', async () => {
    const original = 'A moment of serendipity near the old house.';
    const root = article(`<p>${original}</p>`);
    const tagger = makeTagger();
    await tagger.scan(root);
    expect(root.querySelectorAll('span.iw-word').length).toBe(1);
    tagger.untag(root);
    expect(root.querySelectorAll('span.iw-word').length).toBe(0);
    expect(root.querySelector('p')?.textContent).toBe(original);
    expect(root.querySelector('p')?.childNodes.length).toBe(1); // single clean text node
  });
});

describe('tagger — personal vocabulary overrides the band (bug-2026-11-12-001)', () => {
  it('classify returns the vocab status for a within-band word', () => {
    const tagger = makeTagger({
      vocab: { statusOf: (lemma) => (lemma === 'house' ? 'learning' : undefined) },
    });
    expect(tagger.classify('house')).toEqual({ lemma: 'house', status: 'learning' });
    // Inflected surfaces share the lemma.
    expect(tagger.classify('houses')).toEqual({ lemma: 'house', status: 'learning' });
  });

  it('known and ignored never tag, rare or common', () => {
    const known = makeTagger({ vocab: { statusOf: () => 'known' } });
    expect(known.classify('house')).toBeNull(); // common
    expect(known.classify('serendipity')).toBeNull(); // rare
    const ignored = makeTagger({ vocab: { statusOf: () => 'ignored' } });
    expect(ignored.classify('observe')).toBeNull();
  });

  it('scan wraps a within-band word as soon as its vocab status says so', async () => {
    const root = article('<p>The house stood near the road.</p>');
    const tagger = makeTagger({
      vocab: { statusOf: (lemma) => (lemma === 'house' ? 'learning' : undefined) },
    });
    expect(await tagger.scan(root)).toBe(1);
    const span = root.querySelector<HTMLElement>('span.iw-word[data-lemma="house"]');
    expect(span?.dataset.iwStatus).toBe('learning');
    expect(span?.textContent).toBe('house');
  });

  it('rescan re-examines processed nodes once a classification lands', async () => {
    const root = article('<p>The house stood near the road.</p>');
    const statuses = new Map<string, WordStatus>();
    const tagger = makeTagger({ vocab: { statusOf: (lemma) => statuses.get(lemma) } });

    expect(await tagger.scan(root)).toBe(0); // common → untouched, node processed
    expect(lemmasIn(root)).toEqual([]);

    statuses.set('house', 'unknown'); // classified later (popover dblclick path)
    expect(await tagger.rescan(root)).toBe(1);
    expect(lemmasIn(root)).toEqual(['house']); // exactly one span — nothing double-wrapped
    expect(root.querySelector<HTMLElement>('span.iw-word')?.dataset.iwStatus).toBe('unknown');
  });
});
