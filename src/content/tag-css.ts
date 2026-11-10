/**
 * Word-tag styles shared by the light DOM (content.css, manifest-injected)
 * and the reader's Shadow DOM. The reader re-declares these inside its
 * shadow root because page stylesheets do not apply there; inside the
 * shadow root the pass rules ride on :host-context so the <html> pass
 * attribute still drives them.
 */

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
  text-decoration: underline dotted;
  text-decoration-color: var(--iw-cand-color, #b45309);
  text-decoration-thickness: 1.5px;
  text-underline-offset: 3px;
}
span.iw-word[data-iw-status="unknown"] {
  text-decoration: underline;
  text-decoration-color: var(--iw-unknown-color, #d97706);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
  text-underline-position: under;
}
span.iw-word[data-iw-status="learning"] {
  text-decoration: underline;
  text-decoration-color: var(--iw-learning-color, #0284c7);
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
  text-underline-position: under;
}
span.iw-word[data-iw-status="known"],
span.iw-word[data-iw-status="ignored"] {
  text-decoration: none;
}
`;

/** Pass-specific overrides; `scope` prefixes each selector chain. */
export function passCss(scope: ':host-context(html)' | 'html'): string {
  const s = scope;
  return `
${s}[data-iw-pass="1"] span.iw-word[data-iw-status="candidate"],
${s}[data-iw-pass="3"] span.iw-word[data-iw-status="candidate"],
${s}[data-iw-pass="done"] span.iw-word[data-iw-status="candidate"] {
  text-decoration: none;
}
${s}[data-iw-pass="1"] span.iw-word[data-iw-status="unknown"],
${s}[data-iw-pass="1"] span.iw-word[data-iw-status="learning"],
${s}[data-iw-pass="3"] span.iw-word[data-iw-status="unknown"],
${s}[data-iw-pass="3"] span.iw-word[data-iw-status="learning"] {
  text-decoration: underline dotted;
  text-decoration-color: rgb(120 113 108 / 0.45);
  text-decoration-thickness: 1.5px;
  text-underline-offset: 3px;
}
${s}[data-iw-pass="1"][data-iw-p1-marks] span.iw-word[data-iw-status="candidate"] {
  text-decoration: underline dotted;
  text-decoration-color: rgb(120 113 108 / 0.3);
  text-decoration-thickness: 1.5px;
  text-underline-offset: 3px;
}
`;
}
