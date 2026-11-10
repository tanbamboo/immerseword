/**
 * PR-4 E2E: the side panel reads live page data from the content script,
 * edits vocabulary that reflects onto the page, and quick settings retag
 * the page when the level changes. The panel is opened as an extension
 * page (the action-click opens the same document in the real panel UI).
 */

import assert from 'node:assert/strict';
import { withHarness, openExtensionPage, getExtensionId, watchPage } from './harness.mjs';

async function openPair(browser, baseUrl) {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/article.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('span.iw-word').length >= 7, {
    timeout: 10_000,
  });
  const extensionId = getExtensionId(browser);
  const panel = await openExtensionPage(browser, extensionId, 'sidepanel/sidepanel.html');
  await page.bringToFront(); // panel's tabs.query must find the article
  await panel.waitForFunction(() => typeof window.__iwRefresh === 'function', { timeout: 5_000 });
  await panel.evaluate(() => window.__iwRefresh());
  await panel.waitForFunction(
    () => document.querySelector('#iw-page-card') && !document.querySelector('#iw-page-card').hidden,
    { timeout: 10_000 },
  );
  return { page, panel };
}

export const tests = [
  {
    name: 'panel shows page stats: word count, candidates, coverage',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const { page, panel } = await openPair(browser, baseUrl);
        const watcher = watchPage(panel, 'panel');

        await panel.waitForFunction(
          () => Number(document.querySelector('#st-candidates').textContent) >= 7,
          { timeout: 10_000 },
        );
        const stats = await panel.evaluate(() => ({
          tokens: Number(document.querySelector('#st-tokens').textContent),
          candidates: Number(document.querySelector('#st-candidates').textContent),
          unknown: Number(document.querySelector('#st-unknown').textContent),
          coverage: document.querySelector('#coverage-label').textContent,
        }));
        assert.ok(stats.tokens > 60, `expected a real word count, got ${stats.tokens}`);
        assert.ok(stats.candidates >= 7);
        assert.equal(stats.unknown, 0, 'fresh page has no unknown words yet');
        assert.match(stats.coverage, /^\d+% comfortable$/);
        assert.ok(stats.coverage !== '100% comfortable', 'rare words exist, coverage < 100%');

        watcher.assertClean();
        await panel.close();
        await page.close();
      });
    },
  },
  {
    name: 'panel word list classifies words and the page reflects it instantly',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const { page, panel } = await openPair(browser, baseUrl);

        // The page word list contains serendipity as a candidate…
        await panel.waitForFunction(
          () => !!document.querySelector('#iw-word-list .iw-word-lemma'),
          { timeout: 10_000 },
        );
        // …classify it as learning from the panel.
        await panel.evaluate(() => {
          const items = [...document.querySelectorAll('#iw-word-list li')];
          const row = items.find((li) => li.querySelector('.iw-word-lemma').textContent === 'serendipity');
          row.querySelector('button[title^="Mark"][title*="learning"]').click();
        });

        // Page span flips to learning status (via storage.onChanged → refreshStatus).
        await page.waitForFunction(
          () =>
            document.querySelector('span.iw-word[data-lemma="serendipity"]')?.dataset.iwStatus ===
            'learning',
          { timeout: 5_000 },
        );

        // Panel badge and vocabulary browser reflect the change too.
        await panel.waitForFunction(
          () =>
            document.querySelector('#iw-vocab-list .iw-badge.learning') !== null &&
            document.querySelector('#iw-vocab-list .iw-word-lemma')?.textContent === 'serendipity',
          { timeout: 5_000 },
        );
        await panel.close();
        await page.close();
      });
    },
  },
  {
    name: 'changing the level in quick settings retags the page',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const { page, panel } = await openPair(browser, baseUrl);

        // At 5k there are ≥7 candidates (incl. observe 7565, reveal 7098)…
        await panel.waitForFunction(
          () => Number(document.querySelector('#st-candidates').textContent) >= 7,
          { timeout: 10_000 },
        );

        // …switch to 20k: observe/reveal drop out (within 20k).
        await panel.evaluate(() => {
          const select = document.querySelector('#iw-level');
          select.value = '20k';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await page.waitForFunction(
          () =>
            document.querySelector('span.iw-word[data-lemma="observe"]') === null &&
            document.querySelector('span.iw-word[data-lemma="serendipity"]') !== null,
          { timeout: 10_000 },
        );
        const lemmas = await page.evaluate(() =>
          [...document.querySelectorAll('span.iw-word')].map((s) => s.dataset.lemma),
        );
        for (const gone of ['observe', 'reveal', 'studying']) {
          assert.ok(!lemmas.includes(gone), `${gone} should not be tagged at 20k`);
        }
        assert.ok(lemmas.includes('serendipity'), 'absent-from-corpus words stay tagged');

        // Restore default level for other tests in this browser (fresh browser per spec anyway).
        await panel.close();
        await page.close();
      });
    },
  },
];
