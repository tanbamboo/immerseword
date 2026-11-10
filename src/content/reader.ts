/**
 * Immersive reader (ADR-0006): a full-viewport Shadow-DOM overlay in the
 * same tab. Article extraction runs on demand via @mozilla/readability
 * against a cloned document; the original page is never modified. The
 * tagger re-scans the extracted article inside the shadow root, so
 * tagging, popovers, and pass rendering all follow the reader in.
 */

import { Readability, isProbablyReaderable } from '@mozilla/readability';
import { TAG_CSS, passCss } from './tag-css';

export interface ReaderPrefs {
  theme: 'light' | 'sepia' | 'dark';
  fontFamily: 'serif' | 'sans';
  fontSize: number; // px, 16–24
  width: 'narrow' | 'medium' | 'wide';
}

export const DEFAULT_READER_PREFS: ReaderPrefs = {
  theme: 'sepia',
  fontFamily: 'serif',
  fontSize: 19,
  width: 'medium',
};

const THEME_BG: Record<ReaderPrefs['theme'], string> = {
  light: '#fdfdfc',
  sepia: '#f4ecd8',
  dark: '#1c2128',
};
const THEME_INK: Record<ReaderPrefs['theme'], string> = {
  light: '#1f2933',
  sepia: '#43351f',
  dark: '#d7dce3',
};

const WIDTH_PX: Record<ReaderPrefs['width'], string> = {
  narrow: '560px',
  medium: '680px',
  wide: '820px',
};

export interface ReaderDeps {
  prefs: ReaderPrefs;
  onPrefsChange?: (prefs: ReaderPrefs) => void;
  /** Called with the article container inside the shadow root after render. */
  onArticleReady?: (article: HTMLElement) => void;
}

export function canRead(documentRef: Document): boolean {
  try {
    return isProbablyReaderable(documentRef);
  } catch {
    return false;
  }
}

export function createReader(deps: ReaderDeps) {
  let host: HTMLElement | null = null;

  function isOpen(): boolean {
    return host !== null && host.isConnected;
  }

  /** Static sheet: all pref-driven values ride on custom properties. */
  function buildStyle(): string {
    return `
      :host { all: initial; }
      * { box-sizing: border-box; }
      .root {
        position: fixed; inset: 0; z-index: 2147483645;
        background: var(--iw-r-bg);
        color: var(--iw-r-ink);
        font-family: var(--iw-r-font);
        font-size: var(--iw-r-size);
        overflow-y: auto; overscroll-behavior: contain;
      }
      .progress {
        position: sticky; top: 0; z-index: 2; height: 3px;
        background: transparent; width: 100%;
      }
      .progress-fill { height: 100%; width: 0; background: #4f46e5; border-radius: 0 2px 2px 0; }
      .toolbar {
        position: sticky; top: 3px; z-index: 2;
        display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
        padding: 10px 16px;
        font: 13px/1 system-ui, "Segoe UI", sans-serif;
      }
      .toolbar .spacer { flex: 1; }
      .toolbar button, .toolbar select {
        border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
        background: color-mix(in srgb, currentColor 6%, transparent);
        color: inherit; border-radius: 8px; padding: 6px 10px;
        font: 12.5px/1 system-ui, "Segoe UI", sans-serif; cursor: pointer;
      }
      .toolbar button:hover { background: color-mix(in srgb, currentColor 14%, transparent); }
      .article {
        max-width: var(--iw-r-width);
        margin: 0 auto; padding: 12px 20px 120px;
      }
      .article h1 { font-size: 1.9em; line-height: 1.25; margin: 0.4em 0 0.2em; }
      .byline { opacity: 0.7; font-size: 0.85em; margin: 0 0 1.6em; }
      .article p { line-height: 1.75; margin: 0 0 1.1em; }
      ${TAG_CSS}
      ${passCss(':host-context(html)')}
    `;
  }

  /** Pushes pref values onto the root element as custom properties. */
  function applyPrefs(root: HTMLElement, prefs: ReaderPrefs): void {
    root.style.setProperty('--iw-r-bg', THEME_BG[prefs.theme]);
    root.style.setProperty('--iw-r-ink', THEME_INK[prefs.theme]);
    root.style.setProperty(
      '--iw-r-font',
      prefs.fontFamily === 'serif' ? 'Georgia, "Times New Roman", serif' : 'system-ui, "Segoe UI", sans-serif',
    );
    root.style.setProperty('--iw-r-size', `${prefs.fontSize}px`);
    root.style.setProperty('--iw-r-width', WIDTH_PX[prefs.width]);
  }

  function extract(): { title: string; byline: string; content: string } | null {
    try {
      const docClone = document.cloneNode(true) as Document;
      // Readability mutates its input; the clone keeps the live page safe.
      const parsed = new Readability(docClone).parse();
      if (!parsed?.content) return null;
      return { title: parsed.title ?? '', byline: parsed.byline ?? '', content: parsed.content };
    } catch (err) {
      console.error('[ImmerseWord] reader extraction failed:', err);
      return null;
    }
  }

  function open(): boolean {
    if (isOpen()) return true;
    const article = extract();
    if (!article) return false;

    host = document.createElement('div');
    host.id = 'iw-reader';
    host.className = 'iw-ui';
    const shadow = host.attachShadow({ mode: 'open' });

    let prefs: ReaderPrefs = { ...deps.prefs };

    const style = document.createElement('style');
    style.textContent = buildStyle();

    const root = document.createElement('div');
    root.className = 'root';
    applyPrefs(root, prefs);

    const progress = document.createElement('div');
    progress.className = 'progress';
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-fill';
    progress.append(progressFill);

    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';

    const mkBtn = (label: string, title: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', onClick);
      return b;
    };

    const rerender = () => {
      applyPrefs(root, prefs);
      deps.onPrefsChange?.(prefs);
    };

    const themeSelect = document.createElement('select');
    themeSelect.title = 'Theme';
    for (const theme of ['light', 'sepia', 'dark'] as const) {
      const opt = document.createElement('option');
      opt.value = theme;
      opt.textContent = theme[0]!.toUpperCase() + theme.slice(1);
      themeSelect.append(opt);
    }
    themeSelect.value = prefs.theme;
    themeSelect.addEventListener('change', () => {
      prefs = { ...prefs, theme: themeSelect.value as ReaderPrefs['theme'] };
      rerender();
    });

    toolbar.append(
      mkBtn('A−', 'Smaller text', () => {
        prefs = { ...prefs, fontSize: Math.max(16, prefs.fontSize - 1) };
        rerender();
      }),
      mkBtn('A+', 'Larger text', () => {
        prefs = { ...prefs, fontSize: Math.min(24, prefs.fontSize + 1) };
        rerender();
      }),
      mkBtn(prefs.fontFamily === 'serif' ? 'Serif' : 'Sans', 'Toggle font family', () => {
        prefs = { ...prefs, fontFamily: prefs.fontFamily === 'serif' ? 'sans' : 'serif' };
        rerender();
        fontBtn.textContent = prefs.fontFamily === 'serif' ? 'Serif' : 'Sans';
      }),
      themeSelect,
      mkBtn('Width', 'Cycle line width', () => {
        const order: ReaderPrefs['width'][] = ['narrow', 'medium', 'wide'];
        prefs = { ...prefs, width: order[(order.indexOf(prefs.width) + 1) % order.length]! };
        rerender();
      }),
    );
    const fontBtn = toolbar.children[2] as HTMLButtonElement;

    const spacer = document.createElement('span');
    spacer.className = 'spacer';
    const closeBtn = mkBtn('✕ Exit reader (Esc)', 'Exit reader mode', () => close());
    toolbar.append(spacer, closeBtn);

    const articleEl = document.createElement('article');
    articleEl.className = 'article';
    const h1 = document.createElement('h1');
    h1.textContent = article.title;
    articleEl.append(h1);
    if (article.byline) {
      const byline = document.createElement('p');
      byline.className = 'byline';
      byline.textContent = article.byline;
      articleEl.append(byline);
    }
    const contentHost = document.createElement('div');
    contentHost.innerHTML = article.content; // Readability-sanitized HTML
    articleEl.append(contentHost);

    root.append(progress, toolbar, articleEl);
    shadow.append(style, root);
    document.documentElement.append(host);

    // Reading progress: fraction of the scrollable article consumed.
    root.addEventListener('scroll', () => {
      const max = root.scrollHeight - root.clientHeight;
      const pct = max <= 0 ? 100 : Math.min(100, Math.round((root.scrollTop / max) * 100));
      progressFill.style.width = `${pct}%`;
    });

    document.documentElement.classList.add('iw-noscroll');
    deps.onArticleReady?.(articleEl);
    return true;
  }

  function close(): void {
    if (host) {
      host.remove();
      host = null;
    }
    document.documentElement.classList.remove('iw-noscroll');
  }

  function toggle(): void {
    if (isOpen()) close();
    else open();
  }

  return { open, close, toggle, isOpen };
}
