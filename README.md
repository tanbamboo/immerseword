# ImmerseWord

A Chrome extension (Manifest V3) that turns any English web page into a structured
language-learning session:

- **Unknown-word tagging** — words beyond your frequency level are marked on the page.
- **Monolingual dictionary** — English-only definitions in a click popover
  (bundled offline core + free online fallback).
- **3-pass reading method** — gist → study → fluency, with per-pass behavior and
  session stats.
- **Immersive reader** — distraction-free article view with typography controls.

## Status

| PR | Scope | State |
|----|-------|-------|
| Phase A | PRD + ADRs | ✅ merged |
| PR-0 | Scaffold, toolchain, smoke E2E | ✅ merged |
| PR-1 | Language core & dictionary data | ✅ merged |
| PR-2 | Word tagging engine | ✅ merged |
| PR-3 | Popover & vocabulary | ⬜ |
| PR-4 | Side panel reading companion | ⬜ |
| PR-5 | 3-pass mode | ⬜ |
| PR-6 | Immersive reader | ⬜ |
| PR-7 | Options & release readiness | ⬜ |

## Develop

```bash
npm install          # once
npm run build        # typecheck → bundles → dist/ (loadable unpacked extension)
npm test             # unit tests (Vitest)
npm run test:e2e     # build + real-Chrome E2E (Puppeteer)
```

Load in Chrome: `chrome://extensions` → Developer mode → *Load unpacked* → `dist/`.
Click the toolbar icon to open the reading companion (side panel).

`IW_E2E_HEADFUL=1 npm run test:e2e` runs E2E in a visible browser window.

## Docs

- Product spec: [`docs/PRD.md`](docs/PRD.md)
- Architecture decisions: [`docs/adr/`](docs/adr/)

## License & data

MIT for code. Bundled word data licenses recorded in `public/data/ATTRIBUTION.md`
(WordNet — Princeton WordNet License; frequency list — MIT).
