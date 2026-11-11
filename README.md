# ImmerseWord

A Chrome extension (Manifest V3) that turns any English web page into a structured
language-learning session:

- **Unknown-word tagging** — words beyond your frequency level (2k/5k/10k/20k) are
  marked on the page; lemma-aware, so "stood" counts as "stand".
- **Monolingual dictionary** — English-only definitions in a click popover
  (bundled WordNet-derived offline core + optional free online fallback).
- **Personal vocabulary** — classify words Known / Learning / Unknown / Ignore;
  known words never get tagged again, so every page you read gets quieter.
- **3-pass reading method** — Gist → Study → Fluency: per-pass page rendering,
  pass pill, session summaries with time and mastery stats.
- **Immersive reader** — distraction-free article view with themes, typography
  controls, and a reading progress bar; tagging and passes follow you in.
- **Side-panel reading companion** — page stats, coverage, word lists, and a
  searchable vocabulary browser.

## Status — v1.0.0

| PR | Scope | State |
|----|-------|-------|
| Phase A | PRD + ADRs | ✅ merged |
| PR-0 | Scaffold, toolchain, smoke E2E | ✅ merged |
| PR-1 | Language core & hybrid dictionary | ✅ merged |
| PR-2 | Word tagging engine | ✅ merged |
| PR-3 | Definition popover & vocabulary | ✅ merged |
| PR-4 | Side panel reading companion | ✅ merged |
| PR-5 | 3-pass reading mode | ✅ merged |
| PR-6 | Immersive reader | ✅ merged |
| PR-7 | Options, data portability, store readiness | ✅ merged |

## Develop

```bash
npm install            # once
npm run build          # typecheck → bundles → dist/ (loadable unpacked extension)
npm test               # unit tests (Vitest)
npm run test:e2e       # build + real-Chrome E2E (Puppeteer)
npm run build:data     # regenerate public/data (maintainers; outputs are committed)
```

Load in Chrome: `chrome://extensions` → Developer mode → *Load unpacked* → `dist/`.
Click the toolbar icon to open the reading companion (side panel).

`IW_E2E_HEADFUL=1 npm run test:e2e` runs E2E in a visible browser window.

## How to use

1. Pick your level in the side panel (default: top 5,000 words).
2. Read any English page — words beyond your level get dotted marks.
3. Click a word for its English definition; classify it honestly.
4. Want structure? **Start 3-pass session**: quiet gist read → study pass with
   the dictionary → fluent reread → summary.
5. Hit **❋ Immerse** for the distraction-free reader.
6. Export/import your vocabulary from the options page any time.

## Docs

- Product spec: [`docs/PRD.md`](docs/PRD.md)
- Architecture decisions: [`docs/adr/`](docs/adr/)
- Privacy policy: [`docs/PRIVACY.md`](docs/PRIVACY.md)
- Store listing readiness: [`CHROMEWEBSTORE.md`](CHROMEWEBSTORE.md)

## Privacy

All learning data stays on your device. The only network request the extension
can make is a single-word lookup to `api.dictionaryapi.dev` when a rare word is
missing from the bundled offline dictionary — disable it in settings for a
fully offline experience. No analytics, no accounts, no tracking.

## License & data

MIT for code. Bundled word data licenses recorded in
[`public/data/ATTRIBUTION.md`](public/data/ATTRIBUTION.md)
(WordNet — Princeton WordNet License; frequency list — MIT).
