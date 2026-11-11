/**
 * Word-tag styles shared by the light DOM (content.css, manifest-injected —
 * keep the two copies in sync) and the reader's Shadow DOM. Statuses and
 * passes set decoration custom properties on the tag span; the placement
 * rules (tagStyleCss) decide where the decoration lands according to
 * settings.tagStyle → <html data-iw-tag-style>: the whole word (default),
 * only the first character (.iw-f, wrapped at tag time), or nowhere.
 */

/** Base span resets + per-status decoration variables. */
export const TAG_CSS = `
span.iw-word {
  cursor: pointer;
  display: inline;
  margin: 0; padding: 0; border: 0;
  font: inherit; line-height: inherit; letter-spacing: inherit;
  text-shadow: none; background: transparent;
  transition: none;
  -webkit-user-select: text; user-select: text;
}
span.iw-word[data-iw-status="candidate"] {
  --iw-decor-style: dotted;
  --iw-decor-color: var(--iw-cand-color, #b45309);
  --iw-decor-thickness: 1.5px;
  --iw-decor-offset: 3px;
}
span.iw-word[data-iw-status="unknown"] {
  --iw-decor-style: solid;
  --iw-decor-color: var(--iw-unknown-color, #d97706);
  --iw-decor-thickness: 2px;
  --iw-decor-offset: 3px;
  --iw-decor-position: under;
}
span.iw-word[data-iw-status="learning"] {
  --iw-decor-style: solid;
  --iw-decor-color: var(--iw-learning-color, #0284c7);
  --iw-decor-thickness: 2px;
  --iw-decor-offset: 3px;
  --iw-decor-position: under;
}
/* Known/ignored: no visual mark at all. */
span.iw-word[data-iw-status="known"],
span.iw-word[data-iw-status="ignored"] {
  --iw-decor-line: none;
}
`;

/**
 * Rules that depend on <html> attributes (pass, tag style). In the light
 * DOM they read `html[attr]`; inside the reader's shadow root they must
 * use `:host-context(html[attr])` — the attribute lives on the HOST PAGE's
 * <html>, not on the shadow host.
 */
export type CssScope = 'light' | 'shadow';

function scoped(scope: CssScope): { bare: string; attr: (a: string) => string } {
  return scope === 'shadow'
    ? { bare: ':host-context(html)', attr: (a) => `:host-context(html[${a}])` }
    : { bare: 'html', attr: (a) => `html[${a}]` };
}

/** Applies the decoration variables, placed per settings.tagStyle. */
export function tagStyleCss(scope: CssScope): string {
  const { bare, attr } = scoped(scope);
  return `
${bare} span.iw-word {
  text-decoration-line: var(--iw-decor-line, underline);
  text-decoration-style: var(--iw-decor-style, solid);
  text-decoration-color: var(--iw-decor-color, currentcolor);
  text-decoration-thickness: var(--iw-decor-thickness, 1.5px);
  text-underline-offset: var(--iw-decor-offset, 3px);
  text-underline-position: var(--iw-decor-position, auto);
}
/* firstChar: the mark moves to the wrapped first character only. */
${attr('data-iw-tag-style="firstChar"')} span.iw-word { text-decoration-line: none; }
${attr('data-iw-tag-style="firstChar"')} span.iw-word .iw-f {
  text-decoration-line: var(--iw-decor-line, underline);
  text-decoration-style: var(--iw-decor-style, solid);
  text-decoration-color: var(--iw-decor-color, currentcolor);
  text-decoration-thickness: var(--iw-decor-thickness, 1.5px);
  text-underline-offset: var(--iw-decor-offset, 3px);
  text-underline-position: var(--iw-decor-position, auto);
}
/* none: no decoration anywhere — tags stay functional (click/popover). */
${attr('data-iw-tag-style="none"')} span.iw-word,
${attr('data-iw-tag-style="none"')} span.iw-word .iw-f { text-decoration-line: none; }
`;
}

/** Pass-specific overrides of the decoration variables. */
export function passCss(scope: CssScope): string {
  const { attr } = scoped(scope);
  return `
${attr('data-iw-pass="1"')} span.iw-word[data-iw-status="candidate"],
${attr('data-iw-pass="3"')} span.iw-word[data-iw-status="candidate"],
${attr('data-iw-pass="done"')} span.iw-word[data-iw-status="candidate"] {
  --iw-decor-line: none;
}
${attr('data-iw-pass="1"')} span.iw-word[data-iw-status="unknown"],
${attr('data-iw-pass="1"')} span.iw-word[data-iw-status="learning"],
${attr('data-iw-pass="3"')} span.iw-word[data-iw-status="unknown"],
${attr('data-iw-pass="3"')} span.iw-word[data-iw-status="learning"] {
  --iw-decor-style: dotted;
  --iw-decor-color: rgb(120 113 108 / 0.45);
  --iw-decor-thickness: 1.5px;
  --iw-decor-offset: 3px;
  --iw-decor-position: auto;
}
${attr('data-iw-pass="1"][data-iw-p1-marks]')} span.iw-word[data-iw-status="candidate"] {
  --iw-decor-line: underline;
  --iw-decor-style: dotted;
  --iw-decor-color: rgb(120 113 108 / 0.3);
  --iw-decor-thickness: 1.5px;
  --iw-decor-offset: 3px;
}
`;
}
