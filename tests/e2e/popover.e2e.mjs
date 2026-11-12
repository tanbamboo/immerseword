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
    name: 'context-menu lookup works for an untagged word (PRD U8)',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await openArticle(browser, baseUrl);
        // Select the common word "house" (rank 279 — never tagged at 5k).
        await page.evaluate(() => {
          const p = document.getElementById('para-common');
          const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
          let node = walker.nextNode();
          while (node && !node.nodeValue.includes('house')) node = walker.nextNode();
          const idx = node.nodeValue.indexOf('house');
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + 'house'.length);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        });
        const extensionId = (await import('./harness.mjs')).getExtensionId(browser);
        const panel = await (await import('./harness.mjs')).openExtensionPage(
          browser,
          extensionId,
          'sidepanel/sidepanel.html',
        );
        await page.bringToFront();
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
          'house',
        );
        assert.equal(response?.shown, true, `any word should be lookup-able: ${JSON.stringify(response)}`);
        // "house" is in the bundled core dictionary → full entry renders.
        await page.waitForFunction(
          () =>
            document
              .getElementById('iw-popover-host')
              ?.shadowRoot?.querySelector('.card .lemma')?.textContent === 'house',
          { timeout: 10_000 },
        );
        await panel.close();
        await page.close();
      });
    },
  },
  {
    name: 'double-clicking an untagged word opens the popover',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await openArticle(browser, baseUrl);
        // Headless CDP cannot synthesize a native double-click gesture (the
        // second click's detail stays 1, so Chrome fires no dblclick), so
        // reproduce exactly what a real double-click produces: the browser's
        // word selection plus a bubbling dblclick with detail 2. "evening" is
        // common (untagged) — only the dblclick path can open the popover.
        await page.evaluate(() => {
          const p = document.getElementById('para-common');
          const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
          let node = walker.nextNode();
          while (node && !node.nodeValue.includes('evening')) node = walker.nextNode();
          const idx = node.nodeValue.indexOf('evening');
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + 'evening'.length);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          p.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 }));
        });
        await page.waitForFunction(
          () =>
            document
              .getElementById('iw-popover-host')
              ?.shadowRoot?.querySelector('.card .lemma')?.textContent === 'evening',
          { timeout: 10_000 },
        );
        await page.close();
      });
    },
  },
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
  {
    name: 'marking a word Learning captures the sentence and remembers it across reloads (SIP-002)',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await openArticle(browser, baseUrl);
        const watcher = watchPage(page, 'fixture');

        // A paragraph no other test touches; the MutationObserver rescan tags it.
        // (The fixture article already mentions gossamer, so target OUR span.)
        const sentence = 'The gossamer threads glittered in the morning sun.';
        await page.evaluate((s) => {
          const p = document.createElement('p');
          p.id = 'iw-sip002-single';
          p.textContent = s;
          document.body.append(p);
        }, sentence);
        const clickInjected = () =>
          page.evaluate(() => {
            const span = document.querySelector('#iw-sip002-single span.iw-word');
            if (!span) return false;
            span.click();
            return true;
          });
        await page.waitForFunction(
          () => document.querySelector('#iw-sip002-single span.iw-word') !== null,
          { timeout: 10_000 },
        );

        assert.ok(await clickInjected(), 'injected gossamer span should be clickable');
        await page.waitForFunction(
          () =>
            document
              .getElementById('iw-popover-host')
              ?.shadowRoot?.querySelector('.card .status-row button') !== null,
          { timeout: 10_000 },
        );
        await page.evaluate(() => {
          const card = document.getElementById('iw-popover-host').shadowRoot.querySelector('.card');
          card.querySelector('button[data-status="learning"]').click();
        });
        // The capture lands storage-first, then re-renders the open card.
        await page.waitForFunction(
          () =>
            document.getElementById('iw-popover-host')?.shadowRoot?.querySelector('.card .met .ex') !==
            null,
          { timeout: 5_000 },
        );
        let text = await cardText(page);
        assert.ok(text.includes('Recently met'), 'Recently met section renders');
        assert.ok(text.includes(sentence), 'the met sentence renders');
        assert.ok(text.includes('127.0.0.1'), 'source host renders');

        // The example survives a reload (chrome.storage.local), proving the
        // personal language lifecycle across pages.
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(
          () => document.querySelectorAll('span.iw-word').length >= 6,
          { timeout: 10_000 },
        );
        await page.evaluate((s) => {
          const p = document.createElement('p');
          p.id = 'iw-sip002-single';
          p.textContent = s;
          document.body.append(p);
        }, sentence);
        await page.waitForFunction(
          () => document.querySelector('#iw-sip002-single span.iw-word') !== null,
          { timeout: 10_000 },
        );
        assert.ok(await clickInjected(), 'injected gossamer span should be clickable after reload');
        await page.waitForFunction(
          () =>
            document
              .getElementById('iw-popover-host')
              ?.shadowRoot?.querySelector('.card .met .ex') !== null,
          { timeout: 10_000 },
        );
        text = await cardText(page);
        assert.ok(text.includes('Recently met'), 'example persists across reload');
        watcher.assertClean();
        await page.close();
      });
    },
  },
  {
    name: 'a second Learning encounter adds another example, newest first (SIP-002)',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await openArticle(browser, baseUrl);

        const sentences = [
          'A first encounter with gossamer happened here.',
          'The second encounter mentioned gossamer again, later.',
        ];
        await page.evaluate((ss) => {
          ss.forEach((s, i) => {
            const p = document.createElement('p');
            p.id = `iw-sip002-multi-${i}`;
            p.textContent = s;
            document.body.append(p);
          });
        }, sentences);
        await page.waitForFunction(
          () => document.querySelectorAll('span.iw-word[data-lemma="gossamer"]').length >= 2,
          { timeout: 10_000 },
        );

        for (let i = 0; i < sentences.length; i++) {
          // Click the occurrence inside the i-th injected paragraph.
          await page.evaluate((needle) => {
            const span = [...document.querySelectorAll('span.iw-word[data-lemma="gossamer"]')].find(
              (s) => s.closest('p')?.textContent.includes(needle),
            );
            span?.click();
          }, sentences[i]);
          await page.waitForFunction(
            () =>
              document
                .getElementById('iw-popover-host')
                ?.shadowRoot?.querySelector('.card .status-row button') !== null,
            { timeout: 10_000 },
          );
          await page.evaluate(() => {
            const card = document.getElementById('iw-popover-host').shadowRoot.querySelector('.card');
            card.querySelector('button[data-status="learning"]').click();
          });
          // Wait for this click's async capture to settle before the next one.
          await page.waitForFunction(
            (expected) =>
              document
                .getElementById('iw-popover-host')
                ?.shadowRoot?.querySelectorAll('.card .met .ex').length === expected,
            { timeout: 5_000 },
            i + 1,
          );
        }

        const items = await page.evaluate(() =>
          [...document.getElementById('iw-popover-host').shadowRoot.querySelectorAll('.card .met .ex')].map(
            (e) => e.textContent,
          ),
        );
        assert.equal(items.length, 2, 'two examples captured');
        assert.ok(items[0].includes('second encounter'), 'newest example first');
        assert.ok(items[1].includes('first encounter'), 'older example second');
        await page.close();
      });
    },
  },
];
