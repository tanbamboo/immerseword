/**
 * Store packaging (ADR-0008, SBFP-009 / bug-2026-11-16-002).
 *
 * The Chrome Web Store dashboard rejects any uploaded manifest that still
 * contains a "key" member (the store assigns its own key — and therefore
 * its own extension ID — at upload). Our dev manifest pins a key so the
 * unpacked extension and the e2e harness have a deterministic ID, so the
 * submission zip must be produced here, never by zipping dist/ by hand:
 *
 *   1. stage dist/ into a temp dir
 *   2. strip "key" from the staged manifest (dev dist/ keeps it)
 *   3. sanity-check: staged manifest still parses and matches dist/ on
 *      every other top-level member, version included
 *   4. zip the staging dir → immerseword-<version>.zip at the repo root
 *
 * Run via `npm run package` (builds first).
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** Removes the store-forbidden "key" member; returns a new object. */
export function stripManifestKey(manifest) {
  const { key: _devKey, ...rest } = manifest;
  return rest;
}

function stageStorePackage(distDir, stagingDir) {
  cpSync(distDir, stagingDir, { recursive: true });
  const manifestPath = join(stagingDir, 'manifest.json');
  const distManifest = JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf8'));
  const staged = stripManifestKey(distManifest);

  // Sanity: only "key" differs, everything else is byte-identical JSON.
  for (const [name, value] of Object.entries(distManifest)) {
    if (name === 'key') continue;
    if (JSON.stringify(staged[name]) !== JSON.stringify(value)) {
      throw new Error(`packaging altered manifest member "${name}" — refusing to zip`);
    }
  }
  if (!staged.version) throw new Error('staged manifest lost its version — refusing to zip');

  writeFileSync(manifestPath, `${JSON.stringify(staged, null, 2)}\n`);
  return staged;
}

function main() {
  const distDir = join(root, 'dist');
  if (!existsSync(join(distDir, 'manifest.json'))) {
    throw new Error('dist/manifest.json not found — run `npm run build` first');
  }

  const staging = mkdtempSync(join(tmpdir(), 'iw-store-package-'));
  try {
    const staged = stageStorePackage(distDir, staging);
    const outZip = join(root, `immerseword-${staged.version}.zip`);
    rmSync(outZip, { force: true });
    execFileSync('zip', ['-qr', outZip, '.', '-x', '.*'], { cwd: staging, stdio: 'inherit' });
    const bytes = readFileSync(outZip).length;
    console.log(`packaged store zip → ${outZip} (${(bytes / 1024).toFixed(0)} KB, key stripped)`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

// Run as CLI unless imported (unit tests import stripManifestKey).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
