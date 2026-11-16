/**
 * Store packaging guards (bug-2026-11-16-002 / SBFP-009).
 *
 * The dashboard rejects manifests containing "key"; the dev manifest must
 * keep it (e2e stable-ID contract, harness.mjs). These tests pin both
 * sides so neither regresses silently.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stripManifestKey } from '../../scripts/package.mjs';

describe('store package manifest (bug-2026-11-16-002)', () => {
  it('stripManifestKey removes only the key member', () => {
    const manifest = {
      manifest_version: 3,
      name: 'ImmerseWord',
      version: '1.0.0',
      key: 'MIIBIjANBgkq…',
      permissions: ['storage', 'tabs'],
    };
    expect(stripManifestKey(manifest)).toEqual({
      manifest_version: 3,
      name: 'ImmerseWord',
      version: '1.0.0',
      permissions: ['storage', 'tabs'],
    });
    // Input object is not mutated; stripping is idempotent on keyless input.
    expect(manifest.key).toBe('MIIBIjANBgkq…');
    expect(stripManifestKey({ version: '1.0.0' })).toEqual({ version: '1.0.0' });
  });

  it('dev manifest keeps the pinned key (e2e stable-ID contract)', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
    expect(typeof manifest.key).toBe('string');
    expect(manifest.key.length).toBeGreaterThan(100); // DER public key, base64
  });
});
