/**
 * E2E runner: discovers tests/e2e/*.e2e.mjs (each exports `tests`), runs
 * them sequentially against real Chrome, and exits non-zero on any failure.
 * Run `npm run build` first (npm test:e2e does this for you).
 */

import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const dir = resolve(process.cwd(), 'tests', 'e2e');
const files = (await readdir(dir)).filter((f) => f.endsWith('.e2e.mjs')).sort();

let passed = 0;
const failures = [];

for (const file of files) {
  const mod = await import(`./${file}`);
  for (const t of mod.tests) {
    try {
      await t.run();
      passed += 1;
      console.log(`  ✓ ${t.name}`);
    } catch (err) {
      failures.push({ test: t.name, file, err });
      console.error(`  ✗ ${t.name}`);
      console.error(`    ${err?.stack ?? err}`);
    }
  }
}

console.log(`\nE2E: ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
