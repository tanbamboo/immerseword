/**
 * PR-1 E2E: the service worker's dictionary service answers DICT_LOOKUP
 * from the bundled offline core, and GET_SETTINGS returns stored defaults —
 * verified in a real Chrome with the unpacked extension loaded.
 */

import assert from 'node:assert/strict';
import { withHarness, openExtensionPage, getExtensionId, watchPage } from './harness.mjs';

function sendLookup(page, lemma) {
  return page.evaluate(
    (word) =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'DICT_LOOKUP', lemma: word }, (resp) => resolve(resp));
      }),
    lemma,
  );
}

export const tests = [
  {
    name: 'DICT_LOOKUP resolves a core word offline-first from dict-core.json',
    async run() {
      await withHarness(async ({ browser }) => {
        const extensionId = getExtensionId(browser);
        const panel = await openExtensionPage(browser, extensionId, 'sidepanel/sidepanel.html');
        const watcher = watchPage(panel, 'sidepanel');

        const result = await sendLookup(panel, 'beautiful');
        assert.equal(result?.type, 'DICT_RESULT');
        assert.equal(result.source, 'core', 'core word must resolve from the bundled dictionary');
        assert.equal(result.lemma, 'beautiful');
        assert.ok(result.entry?.senses?.length >= 1);
        assert.ok(result.entry.senses[0].definition.length > 10);
        assert.ok(['adjective', 'adverb', 'noun', 'verb'].includes(result.entry.senses[0].partOfSpeech));

        // Second lookup for the same word is still 'core' (no API dependency).
        const again = await sendLookup(panel, 'beautiful');
        assert.equal(again.source, 'core');

        watcher.assertClean();
        await panel.close();
      });
    },
  },
  {
    name: 'DICT_LOOKUP handles unknown words deterministically (none or api, never hangs)',
    async run() {
      await withHarness(async ({ browser }) => {
        const extensionId = getExtensionId(browser);
        const panel = await openExtensionPage(browser, extensionId, 'sidepanel/sidepanel.html');

        const result = await sendLookup(panel, 'zzzqqqxyzzy');
        assert.equal(result?.type, 'DICT_RESULT');
        // With network: API 404 → 'none'. Without network: error path → 'none'.
        // A definition with source 'api' would also be acceptable for a rare
        // real word, but for gibberish only 'none' is correct.
        assert.equal(result.source, 'none');
        assert.equal(result.entry, null);

        await panel.close();
      });
    },
  },
  {
    name: 'GET_SETTINGS returns product defaults',
    async run() {
      await withHarness(async ({ browser }) => {
        const extensionId = getExtensionId(browser);
        const panel = await openExtensionPage(browser, extensionId, 'sidepanel/sidepanel.html');

        const settings = await panel.evaluate(
          () =>
            new Promise((resolve) => {
              chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (resp) => resolve(resp));
            }),
        );
        assert.equal(settings?.level, '5k');
        assert.equal(settings?.taggingEnabled, true);
        assert.equal(settings?.onlineFallback, true);

        await panel.close();
      });
    },
  },
];
