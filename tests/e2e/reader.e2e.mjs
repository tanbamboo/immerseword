/**
 * PR-6 E2E: the immersive reader overlay extracts the fixture article,
 * re-tags it inside its Shadow DOM, applies themes/typography, tracks
 * progress, and restores the page untouched on exit. Pass rendering rides
 * along via :host-context rules.
 */

import assert from 'node:assert/strict';
import { withHarness, watchPage } from './harness.mjs';

function readerShadow(page) {
  return page.evaluate(() => document.getElementById('iw-reader')?.shadowRoot ?? null);
}

export const tests = [
  {
    name: 'launcher opens the reader with the extracted, tagged article',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await browser.newPage();
        const watcher = watchPage(page, 'fixture');
        await page.goto(`${baseUrl}/article.html`, { waitUntil: 'load' });

        // Launcher appears only on readable pages.
        await page.waitForSelector('#iw-reader-launch', { timeout: 10_000 });
        await page.click('#iw-reader-launch');

        // Overlay renders the extracted article inside its shadow root.
        await page.waitForFunction(
          () => document.getElementById('iw-reader')?.shadowRoot?.querySelector('.article h1') !== null,
          { timeout: 10_000 },
        );
        // The shadow-root scan wraps words asynchronously — wait for the
        // expected lemmas before sampling (same pattern as the test below).
        await page.waitForFunction(
          () => {
            const shadow = document.getElementById('iw-reader')?.shadowRoot;
            if (!shadow) return false;
            const lemmas = new Set(
              [...shadow.querySelectorAll('span.iw-word')].map((s) => s.dataset.lemma),
            );
            return ['serendipity', 'petrichor', 'observe'].every((w) => lemmas.has(w));
          },
          { timeout: 10_000 },
        );
        const state = await page.evaluate(() => {
          const shadow = document.getElementById('iw-reader').shadowRoot;
          const root = shadow.querySelector('.root');
          return {
            title: shadow.querySelector('.article h1')?.textContent,
            taggedLemmas: [...shadow.querySelectorAll('span.iw-word')].map((s) => s.dataset.lemma),
            computedBg: getComputedStyle(root).backgroundColor,
            noscroll: document.documentElement.classList.contains('iw-noscroll'),
          };
        });
        assert.ok(state.title.includes('The Quiet Hour'), `title extracted, got ${state.title}`);
        // Tagging re-scanned inside the shadow root: rare words present,
        // common words absent.
        for (const word of ['serendipity', 'petrichor', 'observe']) {
          assert.ok(state.taggedLemmas.includes(word), `${word} should be tagged in the reader`);
        }
        for (const word of ['house', 'family']) {
          assert.ok(!state.taggedLemmas.includes(word), `${word} should not be tagged`);
        }
        assert.ok(state.noscroll, 'page scroll locked while reading');
        // Default prefs: sepia theme.
        assert.ok(state.computedBg.startsWith('rgb(244, 236, 216)'), `sepia bg, got ${state.computedBg}`);

        watcher.assertClean();
        await page.close();
      });
    },
  },
  {
    name: 'theme and typography controls restyle the reader live',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await browser.newPage();
        await page.goto(`${baseUrl}/article.html`, { waitUntil: 'load' });
        await page.waitForSelector('#iw-reader-launch', { timeout: 10_000 });
        await page.click('#iw-reader-launch');
        await page.waitForFunction(
          () => document.getElementById('iw-reader')?.shadowRoot?.querySelector('.article h1') !== null,
          { timeout: 10_000 },
        );

        // Switch theme to Dark via the toolbar select.
        await page.evaluate(() => {
          const shadow = document.getElementById('iw-reader').shadowRoot;
          const select = shadow.querySelector('.toolbar select');
          select.value = 'dark';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        const darkBg = await page.evaluate(() => {
          const root = document.getElementById('iw-reader').shadowRoot.querySelector('.root');
          return getComputedStyle(root).backgroundColor;
        });
        assert.match(darkBg, /rgb\(28, 33, 40\)/, `dark theme applied, got ${darkBg}`);

        // Larger text bumps the article font size.
        const before = await page.evaluate(() => {
          const root = document.getElementById('iw-reader').shadowRoot.querySelector('.root');
          return parseFloat(getComputedStyle(root).fontSize);
        });
        await page.evaluate(() => {
          const shadow = document.getElementById('iw-reader').shadowRoot;
          [...shadow.querySelectorAll('.toolbar button')].find((b) => b.textContent === 'A+').click();
        });
        const after = await page.evaluate(() => {
          const root = document.getElementById('iw-reader').shadowRoot.querySelector('.root');
          return parseFloat(getComputedStyle(root).fontSize);
        });
        assert.equal(after, before + 1, 'A+ increases reader font size');

        // Progress bar reacts to scrolling.
        await page.evaluate(() => {
          document.getElementById('iw-reader').shadowRoot.querySelector('.root').scrollTop = 5000;
        });
        await page.waitForFunction(
          () =>
            parseFloat(
              document
                .getElementById('iw-reader')
                .shadowRoot.querySelector('.progress-fill').style.width,
            ) > 0,
          { timeout: 5_000 },
        );
        await page.close();
      });
    },
  },
  {
    name: 'exit restores the page exactly; popover works inside the reader',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await browser.newPage();
        await page.goto(`${baseUrl}/article.html`, { waitUntil: 'load' });
        await page.waitForFunction(() => document.querySelectorAll('span.iw-word').length >= 7, {
          timeout: 10_000,
        });
        const spansBefore = await page.evaluate(() => document.querySelectorAll('span.iw-word').length);

        await page.waitForSelector('#iw-reader-launch', { timeout: 10_000 });
        await page.click('#iw-reader-launch');
        await page.waitForFunction(
          () => document.getElementById('iw-reader')?.shadowRoot?.querySelector('.article h1') !== null,
          { timeout: 10_000 },
        );

        // Clicking a tagged word inside the shadow root opens the popover
        // (composed click events reach the document-level delegation). Wait
        // for the async shadow-root scan to wrap the word first.
        await page.waitForFunction(
          () =>
            document
              .getElementById('iw-reader')
              ?.shadowRoot?.querySelector('span.iw-word[data-lemma="observe"]') !== null,
          { timeout: 10_000 },
        );
        await page.evaluate(() => {
          const span = document
            .getElementById('iw-reader')
            .shadowRoot.querySelector('span.iw-word[data-lemma="observe"]');
          span.click();
        });
        await page.waitForFunction(
          () =>
            document
              .getElementById('iw-popover-host')
              ?.shadowRoot?.querySelector('.card .def') !== null,
          { timeout: 15_000 },
        );

        // Exit via the toolbar — original DOM intact.
        await page.evaluate(() => {
          const shadow = document.getElementById('iw-reader').shadowRoot;
          [...shadow.querySelectorAll('.toolbar button')].find((b) => b.textContent.includes('Exit')).click();
        });
        await page.waitForFunction(() => document.getElementById('iw-reader') === null, {
          timeout: 5_000,
        });
        const after = await page.evaluate(() => ({
          spans: document.querySelectorAll('span.iw-word').length,
          noscroll: document.documentElement.classList.contains('iw-noscroll'),
        }));
        assert.equal(after.spans, spansBefore, 'original page spans unchanged');
        assert.equal(after.noscroll, false, 'scroll lock released');

        await page.close();
      });
    },
  },
];
