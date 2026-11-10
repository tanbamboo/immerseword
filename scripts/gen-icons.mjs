/**
 * Generates brand icons (16/48/128 px PNG) into public/icons/ from an SVG
 * definition, using sharp. Files are committed; rerun only on brand changes.
 * The manifest references these exact filenames — see ADR-0008 §3.
 */

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SIZES = [16, 48, 128];

// Rounded-square gradient tile with a lowercase "iw" wordmark and three
// "word dots" — the visual metaphor of tagged words under a line of text.
const svg = (size) => {
  const u = size / 128; // design unit
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f46e5"/>
      <stop offset="1" stop-color="#0d9488"/>
    </linearGradient>
  </defs>
  <rect x="${6 * u}" y="${6 * u}" width="${116 * u}" height="${116 * u}" rx="${30 * u}" fill="url(#g)"/>
  <text x="64" y="78" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
        font-weight="700" font-size="58" fill="#ffffff">iw</text>
  <circle cx="${34 * u}" cy="${100 * u}" r="${6 * u}" fill="#fbbf24"/>
  <circle cx="${56 * u}" cy="${100 * u}" r="${6 * u}" fill="#fbbf24"/>
  <circle cx="${78 * u}" cy="${100 * u}" r="${6 * u}" fill="#38bdf8"/>
</svg>`;
};

const outDir = resolve(process.cwd(), 'public', 'icons');
mkdirSync(outDir, { recursive: true });

for (const size of SIZES) {
  const png = sharp(Buffer.from(svg(size)), { density: 300 }).png();
  await png.toFile(resolve(outDir, `icon-${size}.png`));
  console.log(`created public/icons/icon-${size}.png (${size}x${size})`);
}
