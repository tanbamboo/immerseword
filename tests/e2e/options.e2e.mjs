/**
 * PR-7 E2E: the options page persists settings, and the data export/import
 * round-trip works against real chrome.storage.
 */

import assert from 'node:assert/strict';
import { withHarness, openExtensionPage, getExtensionId, watchPage } from './harness.mjs';

async function openOptions(browser) {
  const extensionId = getExtensionId(browser);
  const page = await openExtensionPage(browser, extensionId, 'options/options.html');
  await page.waitForFunction(() => document.querySelector('#opt-version')?.textContent?.length > 0, {
    timeout: 10_000,
  });
  return page;
}

export const tests = [
  {
    name: 'options page loads with version and defaults',
    async run() {
      await withHarness(async ({ browser }) => {
        const page = await openOptions(browser);
        const watcher = watchPage(page, 'options');

        const state = await page.evaluate(() => ({
          version: document.querySelector('#opt-version').textContent,
          level: document.querySelector('#opt-level').value,
          tagging: document.querySelector('#opt-tagging').checked,
          theme: document.querySelector('#opt-theme').value,
        }));
        assert.ok(state.version.includes('1.0.0'), state.version);
        assert.ok(state.version.includes('this device'));
        assert.equal(state.level, '5k');
        assert.equal(state.tagging, true);
        assert.equal(state.theme, 'sepia');

        watcher.assertClean();
        await page.close();
      });
    },
  },
  {
    name: 'changing settings persists to storage and reaches the worker',
    async run() {
      await withHarness(async ({ browser }) => {
        const page = await openOptions(browser);

        await page.evaluate(() => {
          const select = document.querySelector('#opt-level');
          select.value = '10k';
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.waitForFunction(
          () => document.querySelector('#opt-status').textContent.includes('Level saved'),
          { timeout: 5_000 },
        );

        // Persistence is checked in the service worker's own storage view —
        // a context's runtime.sendMessage never fires its own listener.
        const swTarget = await browser.waitForTarget(
          (t) => t.type() === 'service_worker' && t.url().includes('service-worker.js'),
        );
        const worker = await swTarget.worker();
        const storedLevel = await worker.evaluate(async () => {
          const found = await chrome.storage.sync.get('iw:settings');
          return found['iw:settings']?.level;
        });
        assert.equal(storedLevel, '10k');

        await page.close();
      });
    },
  },
  {
    name: 'export → import round-trips the vocabulary through storage',
    async run() {
      await withHarness(async ({ browser }) => {
        // Seed a vocabulary entry via the extension's storage.
        const page = await openOptions(browser);
        await page.evaluate(() => {
          const entry = { status: 'learning', firstSeen: 1, lastSeen: 2, timesSeen: 3, lookupCount: 4 };
          return chrome.storage.local.set({ 'iw:vocab': { serendipity: entry } });
        });

        // Export fills the textarea with the seeded word.
        await page.click('#opt-export');
        await page.waitForFunction(
          () => document.querySelector('#opt-io').value.includes('serendipity'),
          { timeout: 5_000 },
        );

        // Reset, then import the same payload back.
        await page.evaluate(() => chrome.storage.local.remove('iw:vocab'));
        await page.click('#opt-import');
        await page.waitForFunction(
          () => document.querySelector('#opt-status').textContent.includes('Imported 1 words'),
          { timeout: 5_000 },
        );
        const restored = await page.evaluate(() => chrome.storage.local.get('iw:vocab'));
        assert.equal(restored['iw:vocab']?.serendipity?.status, 'learning');
        assert.equal(restored['iw:vocab']?.serendipity?.timesSeen, 3);

        // Malformed input is rejected with a clear message.
        await page.evaluate(() => {
          document.querySelector('#opt-io').value = '{"app":"something-else"}';
        });
        await page.click('#opt-import');
        await page.waitForFunction(
          () => document.querySelector('#opt-status').classList.contains('err'),
          { timeout: 5_000 },
        );

        await page.close();
      });
    },
  },
];
