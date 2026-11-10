/**
 * PR-5 E2E: a full 3-pass walkthrough on the fixture article.
 *
 * Rendering contract (ADR-0005): Pass 1 hides candidate marks and quiets
 * unknown/learning to faint dots; Pass 2 shows full marks; Pass 3 hides
 * candidates again; done renders the session summary. The pill drives
 * transitions; sessions start from an extension context (panel page),
 * exactly like the side panel does.
 */

import assert from 'node:assert/strict';
import { withHarness, openExtensionPage, getExtensionId, watchPage } from './harness.mjs';

async function openArticle(browser, baseUrl) {
  const page = await browser.newPage();
  const watcher = watchPage(page, 'fixture');
  await page.goto(`${baseUrl}/article.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('span.iw-word').length >= 7, {
    timeout: 10_000,
  });
  await page.bringToFront();
  return { page, watcher };
}

/** Opens the panel as an extension page (the same document the side panel shows). */
async function openPanel(browser, page) {
  const extensionId = getExtensionId(browser);
  const panel = await openExtensionPage(browser, extensionId, 'sidepanel/sidepanel.html');
  await page.bringToFront(); // panel queries must find the article tab
  await panel.waitForFunction(() => typeof window.__iwRefresh === 'function', { timeout: 5_000 });
  return panel;
}

async function startSession(panel) {
  return panel.evaluate(
    () =>
      new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          chrome.runtime.sendMessage(
            { type: 'SESSION_START', url: tab.url, tabId: tab.id },
            (session) => resolve(session),
          );
        });
      }),
  );
}

/** Computed decoration of a lemma's span — the pass-rendering truth. */
function decorationOf(page, lemma) {
  return page.evaluate((word) => {
    const span = document.querySelector(`span.iw-word[data-lemma="${word}"]`);
    if (!span) return null;
    const style = getComputedStyle(span);
    return `${style.textDecorationLine}|${style.textDecorationStyle}`;
  }, lemma);
}

async function clickPillNext(page) {
  const handle = await page.evaluateHandle(() => {
    const shadow = document.getElementById('iw-pass-pill')?.shadowRoot;
    const pill = shadow?.querySelector('.pill');
    return pill && pill.style.display !== 'none'
      ? [...pill.querySelectorAll('button')].find((b) => !b.classList.contains('ghost'))
      : null;
  });
  const button = handle.asElement();
  assert.ok(button, 'pass pill next button should exist');
  await button.click();
}

export const tests = [
  {
    name: 'pass 1 starts from the panel and quiets the page',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const { page, watcher } = await openArticle(browser, baseUrl);
        const panel = await openPanel(browser, page);

        const session = await startSession(panel);
        assert.equal(session?.pass, 1);

        // Pill appears in pass 1 and <html> carries the pass.
        await page.waitForFunction(() => document.documentElement.dataset.iwPass === '1', {
          timeout: 5_000,
        });
        const label = await page.evaluate(
          () =>
            document
              .getElementById('iw-pass-pill')
              ?.shadowRoot?.querySelector('.pill .pass-label')?.textContent,
        );
        assert.ok(label?.includes('Pass 1'), `pill shows pass 1, got: ${label}`);

        // Candidates render with NO decoration in pass 1 (line: none; the
        // reported style half is default noise when line is none)…
        assert.ok((await decorationOf(page, 'serendipity'))?.startsWith('none|'));
        // …and words remain present for tap-to-flag.
        assert.ok(await page.$('span.iw-word[data-lemma="serendipity"]'));

        watcher.assertClean();
        await panel.close();
        await page.close();
      });
    },
  },
  {
    name: 'full walkthrough: pass 2 full marks, pass 3 quiet, done summary',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const { page, watcher } = await openArticle(browser, baseUrl);
        const panel = await openPanel(browser, page);
        const session = await startSession(panel);
        assert.equal(session?.pass, 1);

        // Classify one word as unknown during pass 1 (tap-to-flag path).
        await page.evaluate(() => {
          document.querySelector('span.iw-word[data-lemma="serendipity"]').click();
        });
        await page.waitForFunction(
          () =>
            document
              .getElementById('iw-popover-host')
              ?.shadowRoot?.querySelector('.card .status-row button') !== null,
          { timeout: 15_000 },
        );
        await page.evaluate(() => {
          const card = document
            .getElementById('iw-popover-host')
            .shadowRoot.querySelector('.card');
          card.querySelector('button[data-status="unknown"]').click();
        });

        // Deterministic: wait for the status to actually land on the span.
        await page.waitForFunction(
          () =>
            document.querySelector('span.iw-word[data-lemma="serendipity"]')?.dataset.iwStatus ===
            'unknown',
          { timeout: 10_000 },
        );
        // In pass 1 the unknown word quiets to a faint dotted mark.
        assert.match(await decorationOf(page, 'serendipity'), /^underline\|dotted/);

        // → Pass 2: full marks return.
        await clickPillNext(page);
        await page.waitForFunction(() => document.documentElement.dataset.iwPass === '2', {
          timeout: 5_000,
        });
        const pass2 = await decorationOf(page, 'serendipity');
        assert.equal(pass2, 'underline|solid', `pass 2 shows a solid underline, got ${pass2}`);
        // Candidates keep their dotted amber mark in pass 2 (base style).
        assert.equal(await decorationOf(page, 'observe'), 'underline|dotted');

        // → Pass 3: candidates hidden again, unknown faint.
        await clickPillNext(page);
        await page.waitForFunction(() => document.documentElement.dataset.iwPass === '3', {
          timeout: 5_000,
        });
        assert.ok((await decorationOf(page, 'observe'))?.startsWith('none|'));
        assert.match(await decorationOf(page, 'serendipity'), /^underline\|dotted/);

        // → Done: summary card with stats.
        await clickPillNext(page);
        await page.waitForFunction(
          () =>
            document
              .getElementById('iw-pass-pill')
              ?.shadowRoot?.querySelector('.summary h3') !== null,
          { timeout: 5_000 },
        );
        const summary = await page.evaluate(
          () =>
            document
              .getElementById('iw-pass-pill')
              .shadowRoot.querySelector('.summary').textContent,
        );
        assert.ok(summary.includes('Session complete'), summary);
        assert.ok(summary.includes('Marked unknown'), 'summary lists classification counts');
        assert.ok(/Lookups\s*\n?\s*[1-9]/.test(summary), `lookups recorded: ${summary}`);
        assert.equal(
          await page.evaluate(() => document.documentElement.dataset.iwPass),
          'done',
        );

        // Panel mirrors completion.
        await panel.evaluate(() => window.__iwRefresh());
        await panel.waitForFunction(
          () => !document.querySelector('#iw-session-summary').hidden,
          { timeout: 5_000 },
        );

        watcher.assertClean();
        await panel.close();
        await page.close();
      });
    },
  },
];
