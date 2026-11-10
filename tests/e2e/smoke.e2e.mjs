/**
 * PR-0 smoke spec: the built extension loads in Chrome with a registered
 * service worker, the content script announces itself on a normal page, the
 * side panel page renders and detects the live content script, and no
 * console/page errors surface anywhere.
 */

import assert from 'node:assert/strict';
import {
  withHarness,
  openExtensionPage,
  getExtensionId,
  waitForServiceWorker,
  watchPage,
} from './harness.mjs';

export const tests = [
  {
    name: 'extension loads: content script announces, no console errors',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await browser.newPage();
        const watcher = watchPage(page, 'fixture');
        await page.goto(`${baseUrl}/blank.html`, { waitUntil: 'load' });

        // Content script announced itself (ADR-0004 handshake marker).
        await page.waitForFunction(() => document.documentElement.dataset.iwReady === '1', {
          timeout: 10_000,
        });

        watcher.assertClean();
        await page.close();
      });
    },
  },
  {
    name: 'side panel opens, shows version, detects live content script',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const extensionId = getExtensionId(browser);

        // Open the fixture page and make it the active tab.
        const page = await browser.newPage();
        await page.goto(`${baseUrl}/blank.html`, { waitUntil: 'load' });
        await page.waitForFunction(() => document.documentElement.dataset.iwReady === '1', {
          timeout: 10_000,
        });
        await page.bringToFront();

        const panel = await openExtensionPage(browser, extensionId, 'sidepanel/sidepanel.html');
        const panelWatcher = watchPage(panel, 'sidepanel');
        await panel.waitForFunction(
          () => document.querySelector('#iw-version')?.textContent?.startsWith('v'),
          { timeout: 5_000 },
        );
        // Make the fixture tab active again, then re-run detection in the
        // panel via its explicit hook (opening the panel made IT active).
        await page.bringToFront();
        await panel.evaluate(() => window.__iwRefresh());
        await panel.waitForFunction(
          () => document.querySelector('#iw-status')?.textContent?.includes('ready'),
          { timeout: 5_000 },
        );
        panelWatcher.assertClean();
        await panel.close();
        await page.close();
      });
    },
  },
  {
    name: 'service worker wakes, answers PING from an extension page, ID matches key',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const extensionId = getExtensionId(browser);

        // Opening the panel page PINGs the service worker, which wakes it.
        const panel = await openExtensionPage(browser, extensionId, 'sidepanel/sidepanel.html');
        const swTarget = await waitForServiceWorker(browser);

        // The computed (manifest-key-derived) ID must match what Chrome loaded.
        assert.equal(new URL(swTarget.url()).host, extensionId);

        // PING sent from the panel context is answered by the worker.
        const result = await panel.evaluate(
          () =>
            new Promise((resolve) => {
              chrome.runtime.sendMessage({ type: 'PING' }, (resp) => resolve(resp));
            }),
        );
        assert.equal(result?.type, 'PONG');
        await panel.close();
      });
    },
  },
];
