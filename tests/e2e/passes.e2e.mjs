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
import { withHarness, openExtensionPage, getExtensionId, watchPage, setSyncSettings } from './harness.mjs';

async function openArticle(browser, baseUrl) {
  // SIP-010: this spec asserts band-level decorations ("observe", rank
  // 7565) across all passes — run under full density so the tag set is
  // stable through the study-mode flips.
  await setSyncSettings(browser, { tagDensity: 'full' });
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
  {
    name: 'pass 1 shows faint candidate marks when the setting is on (bug-2026-11-16-001)',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const { page, watcher } = await openArticle(browser, baseUrl);
        const panel = await openPanel(browser, page);

        // Opt into faint marks (F6: Pass 1 behavior), as the options page does.
        await panel.evaluate(
          () =>
            new Promise((resolve) => {
              chrome.storage.sync.get(['iw:settings'], (found) => {
                chrome.storage.sync.set(
                  { 'iw:settings': { ...found['iw:settings'], pass1ShowMarks: true } },
                  () => resolve(),
                );
              });
            }),
        );
        // The content script applies the attribute on the settings change.
        await page.waitForFunction(() => document.documentElement.dataset.iwP1Marks === '1', {
          timeout: 5_000,
        });

        const session = await startSession(panel);
        assert.equal(session?.pass, 1);
        await page.waitForFunction(() => document.documentElement.dataset.iwPass === '1', {
          timeout: 5_000,
        });

        // Candidates render faint dots in pass 1 — the stray-bracket selector
        // dropped this rule in the light DOM before.
        assert.equal(await decorationOf(page, 'observe'), 'underline|dotted');

        // Restore the stock configuration for later specs.
        await panel.evaluate(
          () =>
            new Promise((resolve) => {
              chrome.storage.sync.get(['iw:settings'], (found) => {
                chrome.storage.sync.set(
                  { 'iw:settings': { ...found['iw:settings'], pass1ShowMarks: false } },
                  () => resolve(),
                );
              });
            }),
        );

        watcher.assertClean();
        await panel.close();
        await page.close();
      });
    },
  },
  {
    name: 'quiet density: only the Study pass elevates band words (SIP-010)',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        // Product defaults (quiet) — set AFTER the full-density specs above.
        await setSyncSettings(browser, { tagDensity: 'quiet' });
        const page = await browser.newPage();
        const watcher = watchPage(page, 'fixture');
        await page.goto(`${baseUrl}/article.html`, { waitUntil: 'load' });
        await page.waitForFunction(
          () => document.querySelectorAll('span.iw-word[data-iw-status="candidate"]').length >= 6,
          { timeout: 10_000 },
        );
        await page.bringToFront();
        const panel = await openPanel(browser, page);

        // Steady state: observe (rank 7565) stays calm in quiet mode.
        assert.equal(
          await page.evaluate(
            () => document.querySelector('span.iw-word[data-lemma="observe"]') !== null,
          ),
          false,
          'band word untagged in quiet mode',
        );

        // Pass 1 (quiet rule): still calm.
        await startSession(panel);
        await page.waitForFunction(() => document.documentElement.dataset.iwPass === '1', {
          timeout: 5_000,
        });
        assert.equal(
          await page.evaluate(
            () => document.querySelector('span.iw-word[data-lemma="observe"]') !== null,
          ),
          false,
          'Pass 1 keeps the quiet rule',
        );

        // Pass 2 (Study): candidates elevate to the full band.
        await clickPillNext(page);
        await page.waitForFunction(
          () =>
            document.documentElement.dataset.iwPass === '2' &&
            document.querySelector('span.iw-word[data-lemma="observe"]') !== null,
          { timeout: 15_000 },
        );

        // Pass 3: quiet again — observe unwraps.
        await clickPillNext(page);
        await page.waitForFunction(
          () =>
            document.documentElement.dataset.iwPass === '3' &&
            document.querySelector('span.iw-word[data-lemma="observe"]') === null,
          { timeout: 15_000 },
        );
        // Beyond-corpus words stay tagged throughout (the pass-3 retag
        // re-wraps them in batches — wait for one rather than asserting
        // synchronously).
        await page.waitForFunction(
          () => document.querySelector('span.iw-word[data-lemma="serendipity"]') !== null,
          { timeout: 10_000, polling: 500 },
        );

        watcher.assertClean();
        await panel.close();
        await page.close();
        await setSyncSettings(browser, { tagDensity: 'quiet' });
      });
    },
  },
];
