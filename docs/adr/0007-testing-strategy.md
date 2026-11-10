# ADR-0007: Testing — Vitest units + Puppeteer E2E against real Chrome

**Status:** Accepted · **Date:** 2026-11-10

## Context

The user requires every PR to be functional and tested **against Google Chrome** — not
merely type-checked. The product spans pure logic (lemmatizer, classification, stats) and
deeply browser-coupled behavior (DOM tagging, shadow DOM, storage, service worker,
side panel, reader). A regression in any PR must be caught before merge.

## Decision

**Two layers, both required green before every PR merge:**

1. **Unit tests — Vitest.** Pure modules in `src/shared/` and isolated context logic:
   tokenizer, lemmatizer (table-driven edge cases), frequency/rank classification,
   dictionary normalization + fallback chain (fetch mocked; API fixtures recorded as JSON),
   LRU cache, session reducer, stats calculators. DOM-coupled units (tagger core) run
   against `happy-dom`. No network in unit tests, ever.

2. **E2E tests — Puppeteer + real Chrome.** A harness (`tests/e2e/harness.mjs`) that:
   - launches Chrome for Testing (Puppeteer's managed download) with
     `--disable-extensions-except=<dist> --load-extension=<dist>`; new-headless mode
     (supports extensions), `IW_E2E_HEADFUL=1` env fallback for debugging;
   - starts a local static server for `tests/fixtures/` (deterministic articles with
     known-frequency words) on an ephemeral localhost port;
   - exposes helpers: `getExtensionPage(name)`, `openSidePanelViaAction()`,
     `clickWord(page, lemma)`, shadow-root piercing `$$shadow` predicates,
     console-error sink (fail on any extension-originated error);
   - one spec file per feature area, one **smoke spec** asserting load + zero console
     errors (runs in every PR).

   Per-PR E2E scope matches the PR's feature table in the plan; the final PR runs the full
   matrix as regression. Long-tail sites are not E2E'd; tagging robustness is covered by
   three fixture archetypes (static article, SPA-like dynamic append, shadow-hostile
   styles page).

3. **Type check** (`tsc --noEmit`) and **build** run as test prerequisites — a PR is green
   only if build + typecheck + unit + E2E all pass.

## Consequences

- Deterministic, offline-safe test suite; CI-able later (GitHub Actions) without changes.
- Chrome-for-Testing download (~150 MB, one-time, cached) on the dev machine.
- E2E speed (~10–40 s suite) is acceptable per-PR; specs are independent and
  order-randomized to prevent coupling.

## Alternatives considered

- **Playwright**: first-class extension support arrived later than Puppeteer's and the
  API for `--load-extension` + service-worker targets is less direct; Puppeteer keeps a
  single Google-controlled browser binary story. Rejected (may revisit if needs change).
- **WebdriverIO**: heavier scaffolding for the same guarantee. Rejected.
- **Manual test plan only**: violates the "tested against Chrome every PR" requirement.
