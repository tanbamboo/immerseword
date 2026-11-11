/**
 * Word tagging engine (ADR-0004). A TreeWalker finds text nodes, tokensizes
 * them, classifies tokens (frequency band + personal vocabulary), and wraps
 * taggable words in spans — in batches of a few nodes per animation frame so
 * the host page never janks. Scans are idempotent and resumable; a scan
 * started later invalidates work still queued by an earlier one.
 */

import { tokenize, isAcronym, isBrandLike, type Token } from '../shared/tokenizer';
import type { FrequencyIndex } from '../shared/frequency';
import type { IwSettings, PageStats, PageWord, WordStatus } from '../shared/types';

/** Visual state of a tagged word (candidate = frequency-flagged, not yet classified). */
export type TagStatus = 'candidate' | Exclude<WordStatus, 'known' | 'ignored'>;

/**
 * On-demand page snapshot for the side panel: walks tagged spans plus the
 * remaining text nodes, returning per-lemma counts and coverage. Pure
 * function of the DOM — no state kept between calls.
 */
export function collectPageData(root: ParentNode): { stats: PageStats; words: PageWord[] } {
  const byLemma = new Map<string, { status: PageWord['status']; count: number }>();
  let taggedTokens = 0;

  root.querySelectorAll<HTMLElement>('span.iw-word').forEach((span) => {
    const lemma = span.dataset.lemma;
    const status = span.dataset.iwStatus as PageWord['status'];
    if (!lemma || !status) return;
    const entry = byLemma.get(lemma);
    if (entry) {
      entry.count += 1;
    } else {
      byLemma.set(lemma, { status, count: 1 });
    }
    taggedTokens += 1;
  });

  // Untagged tokens: every word outside skip containers and tag spans.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node): number {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
      return /[A-Za-z]{2}/.test(node.nodeValue ?? '')
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  let commonTokens = 0;
  let node = walker.nextNode();
  while (node) {
    commonTokens += tokenize(node.nodeValue ?? '').filter((t) => !isAcronym(t.text) && t.text.length > 1).length;
    node = walker.nextNode();
  }

  const tagged = { candidate: 0, unknown: 0, learning: 0 } as PageStats['tagged'];
  for (const { status, count } of byLemma.values()) tagged[status] += count;

  const tokensTotal = commonTokens + taggedTokens;
  const flagged = tagged.candidate + tagged.unknown + tagged.learning;
  const coveragePct = tokensTotal === 0 ? 100 : Math.round(((tokensTotal - flagged) / tokensTotal) * 100);

  return {
    stats: { tokensTotal, tagged, coveragePct },
    words: [...byLemma.entries()]
      .map(([lemma, { status, count }]) => ({ lemma, status, count }))
      .sort((a, b) => b.count - a.count || a.lemma.localeCompare(b.lemma)),
  };
}

/** Subtrees never tagged: code, editing surfaces, media, our own UI. */
const SKIP_SELECTOR =
  [
    'script', 'style', 'code', 'pre', 'kbd', 'samp', 'textarea', 'input',
    'select', 'option', 'button', 'noscript', 'iframe', 'svg', 'canvas',
    'template', 'object', 'embed', 'audio', 'video', 'map',
    '[contenteditable]', '[aria-hidden="true"]', '[role="textbox"]',
    '.iw-word', '.iw-ui',
  ].join(',');

/**
 * Frame alignment is pacing, not correctness: no frames are produced in
 * hidden/occluded tabs (or idling headless Chrome), and a scan started
 * there must still finish instead of stalling on a rAF that never fires.
 * Each batch waits for a frame but falls back to a timer once this budget
 * passes — frame-flowing pages pace exactly as before.
 */
const FRAME_BUDGET_MS = 150;

function nextBatchSlot(): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(fallback);
      resolve();
    };
    const fallback = setTimeout(done, FRAME_BUDGET_MS);
    requestAnimationFrame(done);
  });
}

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
  /**
   * Scan invalidation is PER ROOT: a rescan of the page body must not abort
   * an in-flight scan of the reader's shadow-root article (they coexist).
   */
  const scanTokens = new WeakMap<ParentNode, number>();
  /**
   * Text nodes already examined. A clearable Set (not WeakSet): untag()
   * merges text nodes back together via normalize(), and the merged node
   * must become scannable again — impossible to arrange with a WeakSet.
   * Pruned opportunistically so SPA churn cannot grow it without bound.
   */
  const processed = new Set<Text>();

  function classify(text: string): { lemma: string; status: TagStatus } | null {
    if (isAcronym(text)) return null;
    if (isBrandLike(text)) return null; // brands/products ("VirusTotal"), acronym plurals ("URLs")
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
    // Opportunistic pruning: drop entries for nodes the page has removed so
    // SPA churn cannot grow the set without bound.
    if (processed.size > 2_000) {
      for (const node of processed) {
        if (!node.isConnected) processed.delete(node);
      }
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node: Node): number {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
        if (processed.has(node as Text)) return NodeFilter.FILTER_REJECT;
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
   * True when the token is part of a hostname in the raw text: immediately
   * followed by ".letters" ("urlscan" in urlscan.io, "abuse" in abuse.ch)
   * or immediately preceded by a dot (the "io"/"ch" pieces) — components,
   * not words.
   */
  function insideHostname(raw: string, token: Token): boolean {
    if (token.start > 0 && raw[token.start - 1] === '.') return true;
    return /^\.[A-Za-z]{2,}/.test(raw.slice(token.end));
  }

  /**
   * Wraps taggable tokens of one text node. Splits happen from the end of
   * the string backwards so earlier offsets stay valid. Returns the number
   * of spans created (0 = untouched node).
   */
  function wrapNode(node: Text): number {
    const raw = node.nodeValue ?? '';
    const tokens = tokenize(raw);
    let wrapped = 0;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const token = tokens[i]!;
      if (insideHostname(raw, token)) continue;
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
    const token = (scanTokens.get(root) ?? 0) + 1;
    scanTokens.set(root, token);
    const currentToken = () => scanTokens.get(root);
    const nodes = collectTextNodes(root);
    let total = 0;

    for (let i = 0; i < nodes.length; i += batchSize) {
      if (token !== currentToken()) return total; // superseded by a newer scan of THIS root
      const batch = nodes.slice(i, i + batchSize);
      await nextBatchSlot();
      for (const node of batch) {
        if (token !== currentToken()) return total;
        total += wrapNode(node);
      }
      if (globalThis.scheduler) await scheduler.yield();
    }
    return total;
  }

  /** Removes every tag span under `root`, restoring pristine text nodes. */
  function untag(root: ParentNode = document.body): void {
    scanTokens.set(root, (scanTokens.get(root) ?? 0) + 1); // cancel in-flight batches
    root.querySelectorAll('span.iw-word').forEach((span) => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      span.remove();
      parent.normalize();
    });
    // normalize() merged the restored fragments into nodes the scan has
    // already seen — clear tracking so a rescan can re-classify them.
    processed.clear();
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
