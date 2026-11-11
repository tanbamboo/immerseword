/**
 * ImmerseWord build script — Vite programmatic multi-build (ADR-0008).
 *
 * MV3 requires the service worker and content script to each be a single
 * self-contained file, so every JS entry gets its own lib-mode IIFE build.
 * public/ (manifest, icons, HTML pages, data) is copied verbatim into dist/.
 * The script validates that every file referenced by manifest.json exists —
 * a referenced-but-missing icon or script fails the build.
 */

import { build } from 'vite';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const dist = resolve(root, 'dist');

const ENTRIES = [
  { entry: 'src/background/service-worker.ts', outFile: 'background/service-worker.js' },
  { entry: 'src/content/index.ts', outFile: 'content/content.js' },
  { entry: 'src/sidepanel/main.ts', outFile: 'sidepanel/main.js' },
  { entry: 'src/options/main.ts', outFile: 'options/main.js' },
];

async function main() {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });

  for (const { entry, outFile } of ENTRIES) {
    await build({
      configFile: false,
      root,
      publicDir: false,
      logLevel: 'warn',
      build: {
        outDir: dist,
        emptyOutDir: false,
        target: 'chrome120',
        minify: false,
        lib: {
          entry: resolve(root, entry),
          name: 'immerseword',
          formats: ['iife'],
          fileName: () => outFile,
        },
      },
    });
    const out = resolve(dist, outFile);
    if (!existsSync(out)) throw new Error(`Build did not produce ${outFile}`);
    console.log(`built  ${outFile}`);
  }

  cpSync(resolve(root, 'public'), dist, { recursive: true });
  console.log('copied public/ → dist/');

  validateManifest(resolve(dist, 'manifest.json'));
  console.log('manifest OK — dist/ is a loadable unpacked extension');
}

/** Fail the build if the manifest references any missing file. */
function validateManifest(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const refs = [];
  refs.push(...Object.values(manifest.icons ?? {}));
  refs.push(...Object.values(manifest.action?.default_icon ?? {}));
  if (manifest.background?.service_worker) refs.push(manifest.background.service_worker);
  if (manifest.side_panel?.default_path) refs.push(manifest.side_panel.default_path);
  if (manifest.options_ui?.page) refs.push(manifest.options_ui.page);
  for (const cs of manifest.content_scripts ?? []) {
    refs.push(...(cs.js ?? []), ...(cs.css ?? []));
  }
  const missing = refs.filter((ref) => !existsSync(resolve(dist, ref)));
  if (missing.length > 0) {
    throw new Error(`Manifest references missing files: ${missing.join(', ')}`);
  }
}

main().catch((err) => {
  console.error('[build] failed:', err);
  process.exit(1);
});
