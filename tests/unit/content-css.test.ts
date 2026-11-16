/**
 * Light-DOM stylesheet parity (bug-2026-11-16-001).
 *
 * public/content/content.css is a hand-maintained copy of the CSS generated
 * from src/content/tag-css.ts — its header says "keep the two in sync". A
 * stray bracket in one copied selector silently dropped the whole rule in
 * real browsers while every gate stayed green. This test makes the sync
 * invariant machine-checked: the file must contain the generated light-scope
 * tag CSS (whitespace-normalized, so only formatting drift is tolerated).
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TAG_CSS, tagStyleCss, passCss } from '../../src/content/tag-css';

const canonical = (css: string): string => css.replace(/\s+/g, ' ').trim();

describe('content.css parity with tag-css.ts (bug-2026-11-16-001)', () => {
  it('contains the generated light-scope tag CSS', () => {
    const file = readFileSync('public/content/content.css', 'utf8');
    const generated = TAG_CSS + tagStyleCss('light') + passCss('light');
    expect(canonical(file)).toContain(canonical(generated));
  });

  it('emits the p1-marks selector with a single closing bracket in both scopes', () => {
    expect(passCss('light')).toContain(
      'html[data-iw-pass="1"][data-iw-p1-marks] span.iw-word[data-iw-status="candidate"]',
    );
    expect(passCss('shadow')).toContain(
      ':host-context(html[data-iw-pass="1"][data-iw-p1-marks]) span.iw-word[data-iw-status="candidate"]',
    );
  });
});
