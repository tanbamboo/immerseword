import { beforeEach, describe, expect, it } from 'vitest';
import { extractSentence } from '../../src/content/sentence';

function tagWord(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.querySelector('span.iw-word') as HTMLElement;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('extractSentence (SIP-002)', () => {
  it('picks the sentence containing the tagged word', () => {
    const span = tagWord(
      '<p>He was tired. The <span class="iw-word" data-lemma="serendipity">serendipity</span> appeared. Nobody spoke.</p>',
    );
    expect(extractSentence(span)?.text).toBe('The serendipity appeared.');
  });

  it('reconstructs text across nested inline markup', () => {
    const span = tagWord(
      '<p>First sentence ends. A <b>bold</b> <span class="iw-word">gossamer</span> thread shone.</p>',
    );
    expect(extractSentence(span)?.text).toBe('A bold gossamer thread shone.');
  });

  it('treats terminator + closing quote as a boundary', () => {
    const span = tagWord(
      '<p>“Impossible!” she cried. The <span class="iw-word">gossamer</span> veil remained.</p>',
    );
    expect(extractSentence(span)?.text).toBe('The gossamer veil remained.');
  });

  it('captures the first sentence when the word leads the block', () => {
    const span = tagWord('<p><span class="iw-word">Serendipity</span> is a lovely word. Really.</p>');
    expect(extractSentence(span)?.text).toBe('Serendipity is a lovely word.');
  });

  it('captures a sentence without a trailing terminator', () => {
    const span = tagWord('<p>Life is full of <span class="iw-word">serendipity</span></p>');
    expect(extractSentence(span)?.text).toBe('Life is full of serendipity');
  });

  it('works from a Range anchor (double-click lookup path)', () => {
    document.body.innerHTML = '<p>One sentence here. Another one follows.</p>';
    const text = document.querySelector('p')!.firstChild as Text;
    const idx = text.data.indexOf('Another');
    const range = document.createRange();
    range.setStart(text, idx);
    range.setEnd(text, idx + 'Another'.length);
    expect(extractSentence(range)?.text).toBe('Another one follows.');
  });

  it('collapses source formatting whitespace', () => {
    const span = tagWord(
      '<p>Intro ends. The\n  <span class="iw-word">gossamer</span>\n  web held.</p>',
    );
    expect(extractSentence(span)?.text).toBe('The gossamer web held.');
  });

  it('truncates over-long sentences around the word, on word boundaries', () => {
    const filler = 'word '.repeat(120); // one sentence, no terminators
    const span = tagWord(`<p>${filler}<span class="iw-word">serendipity</span> ${filler}</p>`);
    const got = extractSentence(span);
    expect(got).not.toBeNull();
    expect(got!.text.startsWith('…')).toBe(true);
    expect(got!.text.endsWith('…')).toBe(true);
    expect(got!.text).toContain('serendipity');
    expect(got!.text.length).toBeLessThan(320);
    expect(got!.text.split('…')[1]?.startsWith(' ')).toBe(false); // snapped to a word start
  });

  it('returns null for null or detached anchors, and letter-free sentences', () => {
    expect(extractSentence(null)).toBeNull();
    const orphan = document.createElement('span');
    orphan.textContent = 'word';
    expect(extractSentence(orphan)).toBeNull();
    document.body.innerHTML = '<p>3.5 42 7.</p>';
    const text = document.querySelector('p')!.firstChild as Text;
    const idx = text.data.indexOf('42');
    const range = document.createRange();
    range.setStart(text, idx);
    range.setEnd(text, idx + 2);
    expect(extractSentence(range)).toBeNull();
  });

  it('records provenance as origin + pathname only', () => {
    const span = tagWord('<p>A <span class="iw-word">gossamer</span> thread.</p>');
    expect(extractSentence(span)?.url).toBe(location.origin + location.pathname);
  });
});
