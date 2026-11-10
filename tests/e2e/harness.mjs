/**
 * Puppeteer E2E harness (ADR-0007).
 *
 * Launches real Chrome with the built unpacked extension from dist/, serves
 * tests/fixtures on an ephemeral localhost port, and exposes helpers used by
 * *.e2e.mjs specs. Set IW_E2E_HEADFUL=1 to watch the browser run.
 */

import puppeteer from 'puppeteer';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const DIST = join(ROOT, 'dist');
const FIXTURES = join(ROOT, 'tests', 'fixtures');

/**
 * Deterministic extension ID: public/manifest.json pins a "key", so the ID
 * is the first 128 bits of SHA-256 over the DER public key (nibbles → a-p).
 * This lets tests open extension pages without first racing to spot the
 * lazily-starting service worker target.
 */
export function computeExtensionId() {
  const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));
  if (!manifest.key) throw new Error('manifest.json has no "key" — run node scripts/gen-key.mjs');
  const der = Buffer.from(manifest.key, 'base64');
  return createHash('sha256').update(der).digest('hex').slice(0, 32)
    .replace(/[0-9a-f]/g, (h) => 'abcdefghijklmnop'[parseInt(h, 16)]);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/** Serves tests/fixtures statically. Returns a base URL; call server.close() when done. */
async function startFixtureServer() {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      // Chrome always requests /favicon.ico on http pages; a 404 here would
      // surface as a console error and fail error-cleanliness assertions.
      if (urlPath === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      const filePath = normalize(join(FIXTURES, urlPath));
      if (!filePath.startsWith(FIXTURES) || !existsSync(filePath)) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }
      const body = await readFile(filePath);
      res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' });
      res.end(body);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(err));
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

/** Asserts dist/ is fresh enough to test (manifest + built entry exist). */
export function assertBuilt() {
  const manifestPath = join(DIST, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error('dist/ is missing — run `npm run build` before E2E tests');
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const sw = manifest.background?.service_worker;
  if (!sw || !existsSync(join(DIST, sw))) {
    throw new Error('dist/ manifest references a missing service worker — rebuild first');
  }
}

export async function launchExtension() {
  const headless = process.env.IW_E2E_HEADFUL ? false : true;
  const browser = await puppeteer.launch({
    headless,
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--lang=en-US',
      '--no-first-run',
      '--disable-features=Translate',
    ],
  });
  return browser;
}

/**
 * Resolves once the extension's service worker is up; returns its target.
 * MV3 workers start lazily and may blink before a listener attaches, so
 * tests that need the worker should first open an extension page whose
 * runtime traffic wakes it (see openExtensionPage + sidepanel init PING).
 */
export async function waitForServiceWorker(browser, timeoutMs = 20_000) {
  const swTarget = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().includes('service-worker.js'),
    { timeout: timeoutMs },
  );
  return swTarget;
}

export function getExtensionId(_browser) {
  return computeExtensionId();
}

/** Opens an extension page (e.g. sidepanel/sidepanel.html) as a normal tab. */
export async function openExtensionPage(browser, extensionId, path) {
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extensionId}/${path}`, { waitUntil: 'load' });
  return page;
}

/**
 * Collects console errors and page errors from a page. Call `assertClean()`
 * before the test ends; `ignore` filters page-origin errors (fixtures are
 * trusted, extension-origin errors always fail).
 */
export function watchPage(page, label) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[${label}] console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`[${label}] pageerror: ${err.message}`));
  return {
    assertClean() {
      if (errors.length > 0) {
        throw new Error(`Page reported errors:\n${errors.join('\n')}`);
      }
    },
    errors,
  };
}

/** Standard lifecycle for a spec: extension browser + fixture server. */
export async function withHarness(fn) {
  assertBuilt();
  const browser = await launchExtension();
  const { server, baseUrl } = await startFixtureServer();
  try {
    await waitForServiceWorker(browser);
    return await fn({ browser, baseUrl });
  } finally {
    await browser.close();
    server.close();
  }
}

/** Deep/shadow-piercing querySelector for pages containing shadow roots. */
export async function $(page, selector) {
  return page.evaluateHandle((sel) => {
    const visit = (node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      if (node.matches(sel)) return node;
      if (node.shadowRoot) {
        const hit = node.shadowRoot.querySelector(sel);
        if (hit) return hit;
      }
      for (const child of node.children ?? []) {
        const hit = visit(child);
        if (hit) return hit;
      }
      return null;
    };
    return visit(document.documentElement);
  }, selector);
}
