/**
 * Generates brand icons from SVG definitions using sharp. Files are
 * committed; rerun only on brand changes. The manifest references the
 * public/icons filenames — see ADR-0008 §3.
 *
 * Outputs:
 *   public/icons/icon-{16,48,128}.png — full-bleed manifest icons
 *   store/icons/store-icon-128.png    — dashboard upload (guidelines:
 *     128×128 PNG, square artwork 96×96, 16px transparent padding per
 *     side — https://developer.chrome.com/webstore/images#icons)
 *
 * Renders at density 300 for crisp text, then resizes to the exact
 * target: sharp/librsvg treats SVG user units as 72 dpi, so the raw
 * density-300 render of a 128px SVG is 533×533 (bug-2026-11-16-003).
 * Every output's pixel size is asserted before the script exits 0.
 */

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const GRADIENT = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f46e5"/>
      <stop offset="1" stop-color="#0d9488"/>
    </linearGradient>
  </defs>`;

// Rounded-square gradient tile with a lowercase "iw" wordmark and three
// "word dots" — the visual metaphor of tagged words under a line of text.
const tileSvg = ({ x, y, w, rx, fontSize, textY, dotR, dotCy, dotXs }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  ${GRADIENT}
  <rect x="${x}" y="${y}" width="${w}" height="${w}" rx="${rx}" fill="url(#g)"/>
  <text x="64" y="${textY}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
        font-weight="700" font-size="${fontSize}" fill="#ffffff">iw</text>
  ${dotXs.map((cx) => `<circle cx="${cx}" cy="${dotCy}" r="${dotR}" fill="${cx === dotXs[2] ? '#38bdf8' : '#fbbf24'}"/>`).join('\n  ')}
</svg>`;

/** Full-bleed 116×116 tile (manifest icons — Chrome scales as needed). */
const manifestSvg = () =>
  tileSvg({ x: 6, y: 6, w: 116, rx: 30, fontSize: 58, textY: 78, dotR: 6, dotCy: 100, dotXs: [34, 56, 78] });

/** Store icon: 96×96 artwork centered, 16px transparent padding per side. */
const storeSvg = () =>
  tileSvg({ x: 16, y: 16, w: 96, rx: 24, fontSize: 44, textY: 72, dotR: 4.5, dotCy: 90, dotXs: [40, 58, 76] });

async function renderPng(svg, size, outFile) {
  const buf = Buffer.from(svg);
  await sharp(buf, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(outFile);
  // Guard the density/resize contract: the file must be exactly size×size.
  const { width, height } = await sharp(outFile).metadata();
  if (width !== size || height !== size) {
    throw new Error(`${outFile}: expected ${size}x${size}, got ${width}x${height}`);
  }
  console.log(`created ${outFile} (${size}x${size})`);
}

for (const size of [16, 48, 128]) {
  mkdirSync(resolve(process.cwd(), 'public', 'icons'), { recursive: true });
  await renderPng(manifestSvg(), size, resolve(process.cwd(), 'public', 'icons', `icon-${size}.png`));
}

mkdirSync(resolve(process.cwd(), 'store', 'icons'), { recursive: true });
await renderPng(storeSvg(), 128, resolve(process.cwd(), 'store', 'icons', 'store-icon-128.png'));
