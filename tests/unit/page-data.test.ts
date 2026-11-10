import { beforeEach, describe, expect, it } from 'vitest';
import { collectPageData } from '../../src/content/tagger';

/**
 * collectPageData is exercised against synthetic DOM: spans built exactly
 * as the tagger builds them (data-lemma / data-iw-status), plus plain text.
 */

beforeEach(() => {
  document.body.innerHTML = '';
});

function tag(lemma: string, status: string, text?: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'iw-word';
  span.dataset.lemma = lemma;
  span.dataset.iwStatus = status;
  span.textContent = text ?? lemma;
  return span;
}

describe('collectPageData', () => {
  it('counts tagged spans per lemma and status', () => {
    const p = document.createElement('p');
    p.append('The ', tag('serendipity', 'candidate'), ' and more ', tag('serendipity', 'candidate'), ' appear twice.');
    document.body.append(p);

    const { stats, words } = collectPageData(document.body);
    const serendipity = words.find((w) => w.lemma === 'serendipity');
    expect(serendipity?.count).toBe(2);
    expect(serendipity?.status).toBe('candidate');
    expect(stats.tagged.candidate).toBe(2);
  });

  it('counts untagged tokens so coverage reflects the whole page', () => {
    const p = document.createElement('p');
    p.append('One two three four ', tag('petrichor', 'unknown'), ' six seven eight.');
    document.body.append(p);

    const { stats } = collectPageData(document.body);
    // 8 tokens total: 7 common + 1 tagged.
    expect(stats.tokensTotal).toBe(8);
    expect(stats.tagged.unknown).toBe(1);
    expect(stats.coveragePct).toBe(88); // 7/8 = 87.5 → 88
  });

  it('sorts words by frequency then alphabetically', () => {
    const p = document.createElement('p');
    p.append(tag('alpha', 'candidate'));
    p.append(tag('beta', 'unknown'), tag('beta', 'unknown'), tag('beta', 'unknown'));
    p.append(tag('gamma', 'learning'));
    document.body.append(p);

    const { words } = collectPageData(document.body);
    expect(words.map((w) => w.lemma)).toEqual(['beta', 'alpha', 'gamma']);
  });

  it('handles an empty page', () => {
    document.body.append(document.createElement('p'));
    const { stats, words } = collectPageData(document.body);
    expect(words).toEqual([]);
    expect(stats.tokensTotal).toBe(0);
    expect(stats.coveragePct).toBe(100);
  });
});
