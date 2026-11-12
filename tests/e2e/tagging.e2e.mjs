/**
 * PR-2 E2E: the tagging engine marks words on a real page in real Chrome.
 *
 * Fixture vocabulary (verified against public/data/frequency.json with
 * lemma-first ranking): every word in #para-common resolves to a lemma
 * inside the default 5k band (stood→stand 1752, ate→eat 2702,
 * talked→talk 790, quiet 4179). #para-rare carries rare words (rank 0 or
 * beyond 5k): serendipity, petrichor, ephemeral, gossamer, tintinnabulation,
 * faint (15109), dissolve (0). #para-mixed: observe (7565) and
 * reveals→reveal (7098) are rare at 5k; studying→study (484) is NOT.
 */

import assert from 'node:assert/strict';
import { withHarness, watchPage, openExtensionPage, getExtensionId } from './harness.mjs';

async function waitFor(page, fn, timeout = 10_000) {
  await page.waitForFunction(fn, { timeout });
}

export const tests = [
  {
    name: 'rare words are wrapped as candidates; common words stay untouched',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await browser.newPage();
        const watcher = watchPage(page, 'fixture');
        await page.goto(`${baseUrl}/article.html`, { waitUntil: 'load' });

        await waitFor(page, () => document.querySelectorAll('span.iw-word').length >= 7);

        const state = await page.evaluate(() => {
          const spans = [...document.querySelectorAll('span.iw-word')];
          return {
            lemmas: spans.map((s) => s.dataset.lemma),
            statuses: [...new Set(spans.map((s) => s.dataset.iwStatus))],
            paraRareText: document.querySelector('#para-rare').textContent,
          };
        });

        // Every rare word in #para-rare is tagged as a candidate…
        for (const word of [
          'serendipity',
          'petrichor',
          'ephemeral',
          'gossamer',
          'tintinnabulation',
          'faint',
          'dissolve',
        ]) {
          assert.ok(state.lemmas.includes(word), `${word} should be tagged`);
        }
        assert.deepEqual(state.statuses, ['candidate']);

        // …mid-band rare-at-5k words are candidates too…
        for (const word of ['observe', 'reveal']) {
          assert.ok(state.lemmas.includes(word), `${word} should be tagged at the 5k level`);
        }

        // …while lemma-known inflections are NOT tagged (lemma-first ranking).
        for (const word of ['studying', 'slowly', 'stood', 'ate', 'talked']) {
          assert.ok(!state.lemmas.includes(word), `${word} should not be tagged`);
        }

        // The all-common paragraph has zero tags.
        const common = await page.evaluate(() => ({
          spans: document.querySelector('#para-common').querySelectorAll('span.iw-word').length,
          text: document.querySelector('#para-common').textContent,
        }));
        assert.equal(common.spans, 0, 'no common word may be tagged');
        assert.ok(common.text.includes('beautiful'));

        // Text content is preserved exactly.
        assert.ok(state.paraRareText.includes('serendipity in the air'));
        assert.ok(state.paraRareText.includes('tintinnabulation'));

        watcher.assertClean();
        await page.close();
      });
    },
  },
  {
    name: 'brands, acronym plurals, and hostnames are never tagged (bug-2026-11-11-004)',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await browser.newPage();
        const watcher = watchPage(page, 'fixture');
        await page.goto(`${baseUrl}/article.html`, { waitUntil: 'load' });
        await waitFor(page, () => document.querySelectorAll('span.iw-word').length >= 7);

        // The user's sentence, plus a sentinel rare word proving the rescan
        // reached this node before we assert absences.
        await page.evaluate(() => {
          const p = document.createElement('p');
          p.id = 'para-brands';
          p.textContent =
            'hashes, external IPs, domains and URLs (VirusTotal, abuse.ch, AbuseIPDB, ' +
            'GreyNoise, urlscan.io) and serendipity';
          document.querySelector('article').appendChild(p);
        });
        await waitFor(
          page,
          () => document.querySelector('#para-brands span.iw-word[data-lemma="serendipity"]') !== null,
        );

        const lemmas = await page.evaluate(() =>
          [...document.querySelector('#para-brands').querySelectorAll('span.iw-word')].map(
            (s) => s.dataset.lemma,
          ),
        );
        for (const bad of ['virustotal', 'abuseipdb', 'greynoise', 'urlscan', 'urls', 'ips', 'io']) {
          assert.ok(!lemmas.includes(bad), `${bad} must not be tagged, got: ${lemmas}`);
        }
        watcher.assertClean();
        await page.close();
      });
    },
  },
  {
    name: 'contractions are never tagged (bug-2026-11-11-005)',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await browser.newPage();
        const watcher = watchPage(page, 'fixture');
        await page.goto(`${baseUrl}/article.html`, { waitUntil: 'load' });
        await waitFor(page, () => document.querySelectorAll('span.iw-word').length >= 7);

        await page.evaluate(() => {
          const p = document.createElement('p');
          p.id = 'para-contractions';
          p.textContent =
            "You're reading and I'm listening; you'll see it, we can't stop and they won't " +
            'mind, by nine o’clock the ma’am sighed at the defenestration.';
          document.querySelector('article').appendChild(p);
        });
        await waitFor(
          page,
          () =>
            document.querySelector('#para-contractions span.iw-word[data-lemma="defenestration"]') !==
            null,
        );

        const lemmas = await page.evaluate(() =>
          [...document.querySelector('#para-contractions').querySelectorAll('span.iw-word')].map(
            (s) => s.dataset.lemma,
          ),
        );
        for (const bad of ["you're", "i'm", "you'll", "can't", "won't", 'o’clock', 'ma’am']) {
          assert.ok(!lemmas.includes(bad), `${bad} must not be tagged, got: ${lemmas}`);
        }
        watcher.assertClean();
        await page.close();
      });
    },
  },
  {
    name: 'links are never tagged (feat-2026-11-11-001)',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await browser.newPage();
        const watcher = watchPage(page, 'fixture');
        await page.goto(`${baseUrl}/article.html`, { waitUntil: 'load' });
        await waitFor(page, () => document.querySelectorAll('span.iw-word').length >= 7);

        await page.evaluate(() => {
          const p = document.createElement('p');
          p.id = 'para-links';
          const a = document.createElement('a');
          a.href = 'https://example.com/wonder';
          a.textContent = 'gossamer wings and petrichor';
          p.append('See ', a, ' plus serendipity.');
          document.querySelector('article').appendChild(p);
        });
        await waitFor(
          page,
          () => document.querySelector('#para-links span.iw-word[data-lemma="serendipity"]') !== null,
        );

        const linkState = await page.evaluate(() => {
          const a = document.querySelector('#para-links a');
          return {
            spans: a.querySelectorAll('span.iw-word').length,
            text: a.textContent,
            href: a.href,
          };
        });
        assert.equal(linkState.spans, 0, 'no tag span may exist inside a link');
        assert.equal(linkState.text, 'gossamer wings and petrichor');
        assert.equal(linkState.href, 'https://example.com/wonder');
        watcher.assertClean();
        await page.close();
      });
    },
  },
  {
    name: 'tag style setting restyles live: whole word / first char / none (feat-2026-11-11-001)',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await browser.newPage();
        await page.goto(`${baseUrl}/article.html`, { waitUntil: 'load' });
        await waitFor(page, () => document.querySelectorAll('span.iw-word').length >= 7);
        // chrome.storage lives in the isolated world — write it from an
        // extension page (side panel), exactly like a real settings change.
        const extensionId = getExtensionId(browser);
        const panel = await openExtensionPage(browser, extensionId, 'sidepanel/sidepanel.html');
        await page.bringToFront();

        const decor = () =>
          page.evaluate(() => {
            const span = document.querySelector('span.iw-word[data-lemma="serendipity"]');
            const f = span.querySelector('.iw-f');
            return {
              attr: document.documentElement.dataset.iwTagStyle ?? 'underline',
              word: getComputedStyle(span).textDecorationLine,
              firstChar: getComputedStyle(f).textDecorationLine,
            };
          });
        const setStyle = (tagStyle) =>
          panel.evaluate((style) => {
            chrome.storage.sync.set({
              'iw:settings': {
                level: '5k', taggingEnabled: true, pass1ShowMarks: false,
                onlineFallback: true, tagStyle: style, popoverWidth: 480,
              },
            });
          }, tagStyle);

        // Default: whole-word underline, no attribute on <html>.
        const base = await decor();
        assert.equal(base.attr, 'underline');
        assert.equal(base.word, 'underline');

        // firstChar: decoration moves to .iw-f only.
        await setStyle('firstChar');
        await waitFor(page, () => document.documentElement.dataset.iwTagStyle === 'firstChar');
        const firstChar = await decor();
        assert.equal(firstChar.word, 'none', 'whole word loses the underline');
        assert.equal(firstChar.firstChar, 'underline', 'first character keeps the mark');

        // none: no decoration anywhere.
        await setStyle('none');
        await waitFor(page, () => document.documentElement.dataset.iwTagStyle === 'none');
        const none = await decor();
        assert.equal(none.word, 'none');
        assert.equal(none.firstChar, 'none');
        await panel.close();
        await page.close();
      });
    },
  },
  {
    name: 'code, pre and textarea are never tagged',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await browser.newPage();
        await page.goto(`${baseUrl}/article.html`, { waitUntil: 'load' });
        await waitFor(page, () => document.querySelectorAll('span.iw-word').length >= 7);

        const fenced = await page.evaluate(() => ({
          pre: document.querySelector('#code-block').querySelectorAll('span.iw-word').length,
          textarea: document.querySelector('#notes').querySelectorAll('span.iw-word').length,
          preText: document.querySelector('#code-block').textContent,
        }));
        assert.equal(fenced.pre, 0);
        assert.equal(fenced.textarea, 0);
        assert.ok(fenced.preText.includes('serendipity'));
        await page.close();
      });
    },
  },
  {
    name: 'dynamically added paragraphs get tagged (SPA behavior)',
    async run() {
      await withHarness(async ({ browser, baseUrl }) => {
        const page = await browser.newPage();
        await page.goto(`${baseUrl}/article.html`, { waitUntil: 'load' });
        await waitFor(page, () => document.querySelectorAll('span.iw-word').length >= 7);

        await page.click('#append-more');
        // debounce (250 ms) + batched scan — generous window.
        await waitFor(
          page,
          () =>
            document.querySelector('#para-dynamic')?.querySelectorAll('span.iw-word').length >= 2,
          5_000,
        );
        const lemmas = await page.evaluate(() =>
          [...document.querySelector('#para-dynamic').querySelectorAll('span.iw-word')].map(
            (s) => s.dataset.lemma,
          ),
        );
        // The two unambiguous rare words (bring→rank 1399 is common; exact
        // set depends on 'paragraph' lemma rank, so assert inclusion).
        assert.ok(lemmas.includes('defenestration'), `got: ${lemmas}`);
        assert.ok(lemmas.includes('susurrus'), `got: ${lemmas}`);
        await page.close();
      });
    },
  },
];
