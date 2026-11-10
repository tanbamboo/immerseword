# ADR-0006: Immersive reader — in-page Shadow-DOM overlay with Readability extraction

**Status:** Accepted · **Date:** 2026-11-10

## Context

"Immersive reading environment" means stripping nav/ads/chrome and controlling typography.
Options: (a) rewrite the page body in place, (b) open a new tab with a rendered article,
(c) full-viewport overlay in the same tab. Requirements: original page preserved (exit
reader = instant restore), tagging + popovers + passes must work inside the reader,
works on any site.

## Decision

**Same-tab overlay:**

1. **Extraction**: `@mozilla/readability` (Apache-2.0 — the engine of Firefox Reader
   Mode) runs against `document.cloneNode(true)` in the content script
   (`isProbablyReaderable` gates the affordance). Produces title/byline/DOM content.
   Extraction runs on demand (user clicks "Immerse"), never automatically.
2. **Overlay**: a single host element `<div id="iw-reader">` appended to
   `document.documentElement` with an open **Shadow DOM** containing the reader UI:
   article container, typography controls, theme switch, progress bar, close button.
   `position: fixed; inset: 0; z-index: 2147483646` (one below max), overscroll contained,
   page scroll locked (`document.documentElement` class toggling `overflow: hidden` via a
   wrapper rule scoped to the host's shadow style + `iw-noscroll` class on `<html>`).
3. **Tagging integration**: the tagger API is root-parameterized
   (`scan(root, opts)`) — the reader calls it with the article container inside the shadow
   root. Popover and pass pill mount into the shadow root too. All reader CSS lives inside
   the shadow root; zero leakage in either direction.
4. **Typography & themes**: CSS custom properties (`--iw-r-font`, `--iw-r-size`,
   `--iw-r-measure`, `--iw-r-leading`) driven by controls; themes (light/sepia/dark) are
   class flips with full palettes. Preferences persist to `chrome.storage.sync`.
5. **Exit**: Esc, ✕ button, or toolbar toggle removes the host node; the original DOM was
   never modified by the reader (tagging spans in the original are simply still there).

## Consequences

- Full shadow-root isolation makes reader styling immune to page CSS and vice versa.
- Readability occasionally mis-extracts (paywalls, JS-rendered feeds): the "Immerse"
  affordance hides when `isProbablyReaderable` is false, with a fallback "reader
  unavailable on this page" toast.
- Shadow DOM means E2E selectors must pierce shadow roots — Puppeteer custom predicates
  handle this (tested).

## Alternatives considered

- **Rewrite body in place**: destroying the original page breaks exit, site scripts, and
  is hostile to host pages. Rejected.
- **New tab with extension page**: loses URL context, breaks session binding per tab,
  complicates "read this exact page". Rejected.
- **Writing our own extractor**: Readability is battle-tested across millions of pages and
  Apache-2.0; not worth reimplementing.
