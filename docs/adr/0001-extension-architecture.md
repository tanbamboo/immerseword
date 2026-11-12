# ADR-0001: Extension architecture — contexts, vanilla TS UI, side panel as home

**Status:** Accepted · **Date:** 2026-11-10

## Context

ImmerseWord needs DOM-level word tagging on arbitrary pages, a definition lookup pipeline
(bundled data + network + cache), a persistent reading-companion UI (stats, vocabulary,
3-pass controls), and settings. Chrome MV3 offers content scripts, a service worker,
popups, side panels, and options pages. UI could be built with React/Preact/Svelte or
vanilla TypeScript.

## Decision

1. **Contexts:**
   - **Content script** (statically registered, `document_idle`): tokenizer, lemmatizer,
     tagger, popover, pass pill, reader overlay. Owns all page DOM interaction.
   - **Service worker**: dictionary service (bundled → API → cache), message router,
     context menus, badge, side-panel behavior, per-tab session state. No global mutable
     state (MV3 SWs are ephemeral) — everything durable goes to `chrome.storage`.
   - **Side panel** (opened by clicking the action icon): reading companion — pass
     stepper, page stats, page word list, vocabulary browser, quick settings.
   - **Options page**: full settings + data import/export.
2. **No `default_popup`.** The action icon opens the side panel via
   `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`. Rationale: the
   product is a reading companion (stays open while reading, resizable, per-window);
   popups close on click-away and are too small for stats/vocabulary.
3. **UI framework: none — vanilla TypeScript + CSS custom properties.** All UI is modest
   (popover, pill, panel, options, reader) and long-lived. No framework keeps the bundle
   tiny, avoids version churn inside a shipped extension, and removes an entire dependency
   class from security review.
4. **Messaging**: typed message envelopes (`{ type, payload }`) via
   `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`; async listeners use the
   IIFE + `return true` pattern. Shared types live in `src/shared/`.
5. **Permissions**: `storage`, `tabs` (tab.url for per-page sessions + panel→tab
   messaging), `sidePanel`, `contextMenus`; `host_permissions: <all_urls>` — inherent to
   "tag words on any page you read", justified per-permission in `CHROMEWEBSTORE.md`.
   No `activeTab`-dependent flows (side-panel buttons don't grant activeTab).

## Consequences

- Side panel can't be tested with popup assumptions; E2E opens it via the action click
  path (Puppeteer clicks the extension target).
- Vanilla TS means hand-rolled DOM helpers (~100 lines) instead of a framework; acceptable
  at this UI scale and keeps every context a single-file IIFE bundle.
- `tabs` + `<all_urls>` raises store-review scrutiny; mitigated with specific justifications.

## Alternatives considered

- **Popup + content-script-only UI**: rejected — companion UX (persistent panel beside the
  article) is core to the 3-pass flow.
- **React/Preact**: rejected — bundle size and churn not justified by UI complexity.
- **All logic in content script**: rejected — dictionary fetch/cache and session state
  belong in one place (SW), shared across tabs and panel.

## Amendments

**2026-11-12 (PR-20, feat-2026-11-12-003).** The popover card's width is a
synced setting (`popoverWidth: 320 | 480 | 640`, default 480) chosen on the
options page; the content script applies it live (storage.onChanged) via an
inline `card.style.width` that overrides the 480 px stylesheet default — the
responsive `max-width: calc(100vw - 24px)` clamp still guards narrow
viewports. Popover head order is settled as word · IPA · "+" recorder · close
(the SIP-003 "+" sits after the IPA when one is shown).
