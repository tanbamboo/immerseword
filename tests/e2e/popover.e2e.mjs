/**
 * PR-3 E2E: clicking a tagged word opens the definition popover, statuses
 * classify the word, and the classification persists across reloads and
 * changes rendering. 'observe' (rank 7565, in WordNet) resolves from the
 * bundled core dictionary — no network needed for the deterministic path.
 */

import assert from 'node:assert/strict';
import { withHarness, watchPage } from './harness.mjs';

async function openArticle(browser, baseUrl) {
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/article.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('span.iw-word').length >= 7, {
    timeout: 10_000,
  });
  return page;
}

async function clickWord(page, lemma) {
  const clicked = await page.evaluate((word) => {
    const span = document.querySelector(`span.iw-word[data-lemma="${word}"]`);
    if (!span) return false;
    span.click();
    return true;
  }, lemma);
  assert.ok(clicked, `span for ${lemma} not found`);
}

function cardText(page) {
  return page.evaluate(() => {
    const host = document.getElementById('iw-popover-host');
    const card = host?.shadowRoot?.querySelector('.card');
    return card && card.style.display !== 'none' ? card.textContent : null;
  });
}

export const tests = [
  {
    name: 'context-menu path: IW_SHOW_LOOKUP opens the popover for the word',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await openArticle(browser, baseUrl);
        const extensionId = (await import('./harness.mjs')).getExtensionId(browser);
        const panel = await (await import('./harness.mjs')).openExtensionPage(
          browser,
          extensionId,
          'sidepanel/sidepanel.html',
        );
        // Opening the panel made IT the active tab — restore the fixture.
        await page.bringToFront();
        // Send from the extension context exactly like the SW menu handler:
        // tabs.sendMessage(tabId, { type: 'IW_SHOW_LOOKUP', lemma }).
        const response = await panel.evaluate(
          (lemma) =>
            new Promise((resolve) => {
              chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
                if (!tab?.id) return resolve({ error: 'no tab' });
                chrome.tabs.sendMessage(tab.id, { type: 'IW_SHOW_LOOKUP', lemma }, (resp) =>
                  resolve(resp ?? { error: chrome.runtime.lastError?.message }),
                );
              });
            }),
          'observe',
        );
        assert.equal(response?.shown, true, `content script should confirm: ${JSON.stringify(response)}`);
        await page.waitForFunction(
          () =>
            document
              .getElementById('iw-popover-host')
              ?.shadowRoot?.querySelector('.card .def') !== null,
          { timeout: 10_000 },
        );
        const text = await cardText(page);
        assert.ok(text && text.length > 20, 'popover should show a definition');
        await panel.close();
        await page.close();
      });
    },
  },
  {
    name: 'clicking a tagged word opens a popover with a monolingual definition',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await openArticle(browser, baseUrl);
        const watcher = watchPage(page, 'fixture');

        await clickWord(page, 'observe');
        await page.waitForFunction(
          () =>
            document
              .getElementById('iw-popover-host')
              ?.shadowRoot?.querySelector('.card .def') !== null,
          { timeout: 10_000 },
        );

        const text = await cardText(page);
        assert.ok(text.length > 20, 'popover should contain a definition');
        assert.ok(/discover|watch|notice|see/i.test(text), 'definition should be monolingual English');
        assert.ok(text.includes('Known'), 'status buttons should render');
        watcher.assertClean();
        await page.close();
      });
    },
  },
  {
    name: 'classifying a word as unknown updates the page rendering immediately',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await openArticle(browser, baseUrl);

        await clickWord(page, 'observe');
        await page.waitForFunction(
          () =>
            document
              .getElementById('iw-popover-host')
              ?.shadowRoot?.querySelector('.status-row button') !== null,
          { timeout: 10_000 },
        );

        // Click "Unknown" inside the shadow DOM.
        await page.evaluate(() => {
          const card = document.getElementById('iw-popover-host').shadowRoot.querySelector('.card');
          card.querySelector('button[data-status="unknown"]').click();
        });
        await page.waitForFunction(
          () =>
            document.querySelector('span.iw-word[data-lemma="observe"]')?.dataset.iwStatus ===
            'unknown',
          { timeout: 5_000 },
        );
        await page.close();
      });
    },
  },
  {
    name: 'vocabulary classifications persist across page reloads',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await openArticle(browser, baseUrl);

        // Classify observe → unknown, petrichor → known.
        for (const [lemma, status] of [
          ['observe', 'unknown'],
          ['petrichor', 'known'],
        ]) {
          await clickWord(page, lemma);
          // Wait until lookup settles: the status row renders in BOTH the
          // entry and the no-definition states (not during "Looking up…").
          await page.waitForFunction(
            () =>
              document
                .getElementById('iw-popover-host')
                ?.shadowRoot?.querySelector('.card .status-row button') !== null,
            { timeout: 15_000 },
          );
          await page.evaluate((s) => {
            const card = document
              .getElementById('iw-popover-host')
              .shadowRoot.querySelector('.card');
            card.querySelector(`button[data-status="${s}"]`).click();
          }, status);
        }
        await page.waitForFunction(
          () => document.querySelector('span.iw-word[data-lemma="observe"]')?.dataset.iwStatus === 'unknown',
          { timeout: 5_000 },
        );

        // Reload: statuses must survive (chrome.storage.local).
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(
          () => document.querySelectorAll('span.iw-word').length >= 6,
          { timeout: 10_000 },
        );
        const statuses = await page.evaluate(() => ({
          observe: document.querySelector('span.iw-word[data-lemma="observe"]')?.dataset.iwStatus,
          petrichorSpan: document.querySelector('span.iw-word[data-lemma="petrichor"]') !== null,
        }));
        assert.equal(statuses.observe, 'unknown', 'observe stays unknown after reload');
        // Known words are not tagged at all on fresh scans — the
        // personalization loop (PRD §7): every page you classify gets quieter.
        assert.equal(statuses.petrichorSpan, false, 'petrichor (known) is no longer tagged');
        await page.close();
      });
    },
  },
];
