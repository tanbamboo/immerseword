/**
 * Sentence extraction for personal examples (SIP-002). Given the popover's
 * anchor — the tag span that was clicked, or the selection Range from the
 * double-click lookup — return the sentence containing that occurrence plus
 * the page origin+path as provenance. Pure DOM walking; no dependencies.
 */

export interface EncounteredSentence {
  text: string;
  url: string;
}

/** Block-ish ancestors whose textContent is usually one paragraph run. */
const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, dd, dt, figcaption';

/** Sentence terminator(s), closed by quotes/brackets, then whitespace or end. */
const BOUNDARY = /[.!?…]+["'”’)\]]*(\s+|$)/g;

const MAX_LENGTH = 300;

export function extractSentence(anchor: HTMLElement | Range | null): EncounteredSentence | null {
  if (!anchor) return null;

  // Resolve the anchor to a (text node, offset) point: tag spans own their
  // first text node; Ranges carry theirs directly.
  const node = anchor instanceof Range ? anchor.startContainer : firstTextNode(anchor);
  if (!node) return null;
  const offset = anchor instanceof Range ? anchor.startOffset : 0;

  const block = blockAncestor(node);
  const text = block?.textContent ?? '';
  if (!block || text.length === 0) return null;

  const pos = charOffsetIn(block, node, offset);
  if (pos < 0) return null; // anchor moved or detached since the popover opened

  const start = sentenceStart(text, pos);
  const end = sentenceEnd(text, pos);
  const sentence =
    end - start > MAX_LENGTH ? truncateAround(text, start, end, pos) : normalize(text.slice(start, end));
  if (sentence.length < 2 || !/[a-z]/i.test(sentence)) return null;

  return { text: sentence, url: pageUrl() };
}

function firstTextNode(el: Element): Text | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  return (walker.nextNode() as Text | null) ?? null;
}

function blockAncestor(node: Node): Element | null {
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  // Closest paragraph-ish block, else the nearest div, else the parent. An
  // anchor with no ancestor at all (detached span) captures nothing.
  return el?.closest(BLOCK_SELECTOR) ?? el?.closest('div') ?? el?.parentElement ?? null;
}

/** Character offset of (node, offset) within block's concatenated text; -1 if absent. */
function charOffsetIn(block: Element, node: Node, offset: number): number {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let acc = 0;
  while (walker.nextNode()) {
    const current = walker.currentNode as Text;
    if (current === node) return acc + Math.min(offset, current.data.length);
    acc += current.data.length;
  }
  return -1;
}

/** End of the last boundary that closes at or before pos. */
function sentenceStart(text: string, pos: number): number {
  BOUNDARY.lastIndex = 0;
  let start = 0;
  for (let m = BOUNDARY.exec(text); m && m.index + m[0].length <= pos; m = BOUNDARY.exec(text)) {
    start = m.index + m[0].length;
  }
  return start;
}

/** End of the first boundary at or after pos (terminator included, trailing space trimmed later). */
function sentenceEnd(text: string, pos: number): number {
  BOUNDARY.lastIndex = pos;
  const m = BOUNDARY.exec(text);
  return m ? m.index + m[0].length : text.length;
}

/** Over-long sentences keep a word-boundary window centered on the occurrence. */
function truncateAround(text: string, start: number, end: number, pos: number): string {
  let s = Math.max(start, pos - 140);
  let e = Math.min(end, pos + 160);
  while (s > start && !/\s/.test(text[s - 1] ?? '')) s--;
  while (e < end && !/\s/.test(text[e] ?? '')) e++;
  return (s > start ? '…' : '') + normalize(text.slice(s, e)) + (e < end ? '…' : '');
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Provenance without query strings or fragments (PRD §8). */
function pageUrl(): string {
  try {
    return location.origin + location.pathname;
  } catch {
    return '';
  }
}
