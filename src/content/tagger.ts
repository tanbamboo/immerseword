/**
 * Word tagging engine (ADR-0004). A TreeWalker finds text nodes, tokensizes
 * them, classifies tokens (frequency band + personal vocabulary), and wraps
 * taggable words in spans — in batches of a few nodes per animation frame so
 * the host page never janks. Scans are idempotent and resumable; a scan
 * started later invalidates work still queued by an earlier one.
 */

import { tokenize, isAcronym } from '../shared/tokenizer';
import type { FrequencyIndex } from '../shared/frequency';
import type { IwSettings, WordStatus } from '../shared/types';

/** Visual state of a tagged word (candidate = frequency-flagged, not yet classified). */
export type TagStatus = 'candidate' | Exclude<WordStatus, 'known' | 'ignored'>;

/** Subtrees never tagged: code, editing surfaces, media, our own UI. */
const SKIP_SELECTOR =
  [
    'script', 'style', 'code', 'pre', 'kbd', 'samp', 'textarea', 'input',
    'select', 'option', 'button', 'noscript', 'iframe', 'svg', 'canvas',
    'template', 'object', 'embed', 'audio', 'video', 'map',
    '[contenteditable]', '[aria-hidden="true"]', '[role="textbox"]',
    '.iw-word', '.iw-ui',
  ].join(',');

export interface VocabLike {
  statusOf(lemma: string): WordStatus | undefined;
}

export interface TaggerOptions {
  frequency: FrequencyIndex;
  settings: IwSettings;
  vocab?: VocabLike;
  batchSize?: number;
}

export function createTagger(options: TaggerOptions) {
  const { batchSize = 20 } = options;
  let settings = options.settings;
  let vocab = options.vocab;
  let scanToken = 0;
  const processed = new WeakSet<Node>();

  function classify(text: string): { lemma: string; status: TagStatus } | null {
    if (isAcronym(text)) return null;
    if (!options.frequency.isRarerThan(text, settings.level)) return null; // within band → common
    // The vocabulary key is whichever form the rank resolver settled on:
    // a common surface beats a bogus rare lemma ("family" ≠ "fam").
    const lemma = options.frequency.resolveForm(text);
    const status = vocab?.statusOf(lemma);
    if (status === 'known' || status === 'ignored') return null;
    return { lemma, status: status ?? 'candidate' };
  }

  /** Text nodes under `root`, skipping banned subtrees and processed nodes. */
  function collectTextNodes(root: ParentNode): Text[] {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node: Node): number {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
        if (processed.has(node)) return NodeFilter.FILTER_REJECT;
        const value = node.nodeValue ?? '';
        if (!/[A-Za-z]{2}/.test(value)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes: Text[] = [];
    let current = walker.nextNode();
    while (current) {
      nodes.push(current as Text);
      current = walker.nextNode();
    }
    return nodes;
  }

  /**
   * Wraps taggable tokens of one text node. Splits happen from the end of
   * the string backwards so earlier offsets stay valid. Returns the number
   * of spans created (0 = untouched node).
   */
  function wrapNode(node: Text): number {
    const tokens = tokenize(node.nodeValue ?? '');
    let wrapped = 0;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i]!;
      const result = classify(token.text);
      if (!result) continue;
      try {
        const after = node.splitText(token.end);
        const middle = node.splitText(token.start); // node=prefix, middle=word, after=suffix
        const span = document.createElement('span');
        span.className = 'iw-word';
        span.dataset.lemma = result.lemma;
        span.dataset.iwStatus = result.status;
        span.textContent = middle.nodeValue;
        middle.replaceWith(span);
        processed.add(span.firstChild as Text); // the new text node inside the span
        wrapped += 1;
        void after; // after-fragment stays a sibling; later (earlier) tokens still target `node`
      } catch {
        break; // hostile DOM (detached mid-run) — abandon this node
      }
    }
    processed.add(node);
    return wrapped;
  }

  async function scan(root: ParentNode): Promise<number> {
    const token = ++scanToken;
    const nodes = collectTextNodes(root);
    let total = 0;

    for (let i = 0; i < nodes.length; i += batchSize) {
      if (token !== scanToken) return total; // superseded by a newer scan
      const batch = nodes.slice(i, i + batchSize);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          for (const node of batch) {
            if (token !== scanToken) return resolve();
            total += wrapNode(node);
          }
          resolve();
        });
      });
      if (globalThis.scheduler) await scheduler.yield();
    }
    return total;
  }

  /** Removes every tag span under `root`, restoring pristine text nodes. */
  function untag(root: ParentNode = document.body): void {
    scanToken++; // cancel in-flight batches
    root.querySelectorAll('span.iw-word').forEach((span) => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      span.remove();
      parent.normalize();
    });
  }

  /** Applies new settings; re-classification requires unwrap + rescan. */
  function applySettings(next: IwSettings): void {
    settings = next;
  }

  function setVocab(next: VocabLike): void {
    vocab = next;
  }

  /** Re-marks status classes on existing spans (no DOM rewrapping). */
  function refreshStatus(lemma: string, status: WordStatus | 'candidate'): void {
    document
      .querySelectorAll<HTMLElement>(`span.iw-word[data-lemma="${CSS.escape(lemma)}"]`)
      .forEach((span) => {
        span.dataset.iwStatus = status; // CSS hides known/ignored entirely
      });
  }

  return { scan, untag, applySettings, setVocab, refreshStatus, classify };
}
