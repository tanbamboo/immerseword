# ADR-0008: Build — Vite programmatic multi-build (IIFE per context) + committed data

**Status:** Accepted · **Date:** 2026-11-10

## Context

MV3 packaging constraints: the service worker and content scripts must each be **single
files** with no runtime `import` (content scripts aren't modules; the SW could be
`type: "module"` but a single-file IIFE is the most compatible). Extension pages (side
panel, options) are plain HTML. We chose TypeScript + Vite (user decision), but Vite's
default multi-entry app build emits shared chunks in ES-module format — unusable for
content scripts. The crxjs plugin solves this but adds a third-party dependency with its
own release churn. Bundled datasets (frequency list, dictionary core) must be reproducible
without contributors re-running scrapers.

## Decision

1. **`scripts/build.mjs`** — a Node script using Vite **programmatically**
   (`import { build } from 'vite'`): one **lib-mode build per JS entry**
   (`service-worker`, `content/index`, `sidepanel/main`, `options/main`), each emitting a
   single self-executing IIFE to `dist/`. Shared `src/shared/` code is simply inlined per
   entry (small duplication, zero runtime coupling).
   - HTML pages (side panel, options) and `manifest.json`, `icons/`, `data/` live in
     `public/` and are copied verbatim; their `<script src>` points at the built bundles.
   - No code splitting, no dynamic imports anywhere (`inlineDynamicImports` semantics by
     construction of single-entry lib builds).
   - `npm run build` = typecheck → data check → 4 vite builds → copy → validate manifest
     paths exist (fail the build on any missing referenced file, per skill rule 1).
2. **`scripts/build-data.mjs`** — regenerates `public/data/frequency.json` (from the MIT
   google-10000-english `20k.txt` raw URL) and `public/data/dict-core.json` (from WordNet
   DB files, see ADR-0002). **Outputs are committed**; the build script only warns when
   missing and `--regen` is opt-in. Extension builds never touch the network.
3. **Icons** — `scripts/gen-icons.mjs` renders brand PNGs (16/48/128) from an inline SVG
   definition with `sharp`; committed. No manifest icon reference without a matching file.

## Consequences

- Zero bundler plugins beyond Vite itself; `dist/` is a complete, loadable unpacked
  extension — exactly what Puppeteer E2E loads.
- Re-running a data regen is an explicit maintainer action; PR diffs show data changes.
- `sharp` + `@mozilla/readability` are the only runtime dependencies; Vite, Vitest,
  Puppeteer, TypeScript are dev dependencies.

## Alternatives considered

- **crxjs plugin**: convenient HMR, but plugin churn + MV3 edge cases (SW bundling) make
  extension builds brittle across Vite majors. Rejected for a product of this size.
- **esbuild directly**: would work (it powers Vite anyway), but then "Vite" is untrue and
  we lose its lib-mode/config ergonomics. Rejected per user stack choice.
- **webpack**: heavier config, slower; no benefit. Rejected.
- **tsc only (no bundler)**: no single-file output, no asset pipeline. Rejected.
