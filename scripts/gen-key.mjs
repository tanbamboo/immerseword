/**
 * One-time: pins a stable development extension ID.
 *
 * An unpacked extension's ID is normally derived from its absolute path, so
 * it differs on every machine — which makes "wake the service worker by
 * extension ID" impossible in tests and breaks any ID-dependent setup.
 * Embedding a public `key` in the manifest fixes the ID across machines.
 *
 * Generates an RSA-2048 keypair, writes the base64 DER public key into
 * public/manifest.json ("key" field), prints the derived extension ID, and
 * saves the private key to immerseword-dev.pem (gitignored) in case a CRX
 * ever needs signing. Run again only if immerseword-dev.pem is lost.
 */

import { generateKeyPairSync, createHash } from 'node:crypto';
import { writeFileSync, readFileSync as rf, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const keyPath = resolve(root, 'immerseword-dev.pem');
const manifestPath = resolve(root, 'public', 'manifest.json');

if (existsSync(keyPath) && JSON.parse(rf(manifestPath, 'utf8')).key) {
  console.log('Key already present — extension ID is stable. Nothing to do.');
  process.exit(0);
}

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'der' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const keyB64 = Buffer.from(publicKey).toString('base64');
writeFileSync(keyPath, privateKey);

const manifest = JSON.parse(rf(manifestPath, 'utf8'));
manifest.key = keyB64;
// JSON.stringify with 2-space indent; keep trailing newline for git hygiene.
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

/** Chrome extension ID = first 128 bits of SHA-256 of the DER public key, hex nibbles mapped a-p. */
const id = createHash('sha256').update(publicKey).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, (h) => 'abcdefghijklmnop'[parseInt(h, 16)]);

console.log('Wrote manifest "key". Development extension ID:', id);
console.log('Private key saved to immerseword-dev.pem (gitignored).');
