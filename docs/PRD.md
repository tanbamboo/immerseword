# ImmerseWord — Product Requirements Document

| | |
|---|---|
| **Product** | ImmerseWord — Chrome extension for immersive English reading |
| **Version** | 1.0.0 (PRD v1) |
| **Date** | 2026-11-10 |
| **Status** | Approved |

---

## 1. Vision

**ImmerseWord turns any English web page into a structured language-learning session.**

Intermediate English learners stall between textbook exercises and real reading: real pages
are full of unknown words, bilingual translation becomes a crutch, and "look everything up"
destroys the flow that builds fluency. ImmerseWord packages three proven practices into one
distraction-free environment:

1. **Unknown-word tagging** — the page itself shows which words you probably don't know.
2. **Monolingual dictionary** — English definitions only, so meaning is acquired in English.
3. **The 3-pass reading method** — read for gist, study the vocabulary, then reread for fluency.

> One-sentence pitch: *Read the web in English three times — first for flow, then for words,
> then for fluency — with the page itself as your tutor.*

## 2. Personas

### P1 — "Mei", intermediate learner (B1–B2)
Reads English news/blogs for work. Knows roughly the most common 5,000 words. Wants to
graduate from translating every unknown word to tolerating ambiguity and acquiring vocabulary
in context. Primary user of all features.

### P2 — "Arjun", advanced learner (C1)
Reads long-form articles comfortably but wants to systematically close gaps at the 10k–20k
frequency band and keep a personal vocabulary notebook. Uses higher frequency bands, the
vocabulary browser, and export.

### P3 — "Sofia", tutor
Recommends tools to students. Evaluates whether ImmerseWord enforces good reading habits
(3-pass) rather than a translate-everything crutch. Cares about default settings being
pedagogically sound.

## 3. User stories

| # | Story | Priority |
|---|-------|----------|
| U1 | As a learner, I open any English page and words beyond my level are visually tagged, so I instantly see my vocabulary gaps. | P0 |
| U2 | As a learner, I click a tagged word and get an **English-only** definition with pronunciation and an example sentence. | P0 |
| U3 | As a learner, I classify each lookup (known / learning / ignored) and the page updates instantly, building my personal known-words list. | P0 |
| U4 | As a learner, I follow a guided **3-pass flow**: gist read → study pass → fluent reread, with per-pass behavior changes and completion stats. | P0 |
| U5 | As a learner, I switch the page into an **immersive reader view** (clean typography, themes, width/size controls, progress) and the tagging and passes follow me there. | P0 |
| U6 | As a learner, I review/manage my vocabulary in a side panel (per-page words + global search, filter by status) and export it as JSON. | P1 |
| U7 | As a learner, I set my level (2k/5k/10k/20k) and highlight styles once; the extension remembers and syncs my settings. | P1 |
| U8 | As a learner, I can look up any word via right-click even when tagging is off. | P2 |
| U9 | As a learner, everything works offline for the most frequent words; rare-word lookups use the network only when needed. | P1 |

## 4. Feature specifications

### F1 — Unknown-word tagging (U1)

- On page load (and on DOM changes), the content script walks text nodes, tokenizes words,
  lemmatizes them, and classifies each against:
  1. the user's **frequency level** (words rarer than the band are *potentially unknown*), and
  2. the **personal vocabulary list** (explicit statuses override frequency).
- Rendering (defaults, user-configurable style/ intensity):
  | Status | Meaning | Visual (Pass 2 default) |
  |---|---|---|
  | *potentially unknown* (not in vocab list, rarer than band) | candidate | soft amber dotted underline |
  | `unknown` | user marked it unknown | amber underline |
  | `learning` | user is acquiring it | blue underline |
  | `known` / common word | no highlight | — |
  | `ignored` | never show (names, brand terms…) | — |
- Skipped entirely: `script`, `style`, `code`, `pre`, `textarea`, `input`, `contenteditable`,
  ARIA-hidden subtrees, already-tagged nodes.
- Performance budget: scanning and wrapping are batched (rAF + scheduler.yield), pages with
  >5,000 candidate words are processed in chunks; no long tasks >50 ms attributable to the
  extension during steady-state reading.
- SPA-safe: MutationObserver rescans only added/changed subtrees, debounced 250 ms.

### F2 — Monolingual dictionary (U2, U8, U9)

- Click (or select + right-click → "Look up with ImmerseWord") opens a popover:
  - headword, phonetic IPA (when available), part of speech
  - numbered monolingual senses (up to 3), each with one example sentence when available
  - status buttons: **Known / Learning / Unknown / Ignore**
- Lookup chain: **bundled offline core** (top-frequency lemmas with WordNet glosses) →
  **Free Dictionary API** (dictionaryapi.dev) → graceful "no definition found" state.
- API responses are cached in `chrome.storage.local` (LRU, capped ≈ 2 MB / 2,000 entries).
- No translations are ever shown. This is a product principle, not a limitation.

### F3 — 3-pass reading mode (U4)

Per-page/tab session state machine. A floating **pass pill** (bottom-right, dismissible)
shows progress and triggers transitions; the side panel mirrors the same controls.

| | Pass 1 — Gist | Pass 2 — Study | Pass 3 — Fluency |
|---|---|---|---|
| Goal | Overall meaning; tolerate ambiguity | Vocabulary acquisition | Flow, consolidation, enjoyment |
| Tagging | Hidden (or faint dots for *unknown*, configurable) | Full tagging (F1 defaults) | Only `unknown`/`learning` faintly marked |
| Lookups | Allowed (tap a word that blocks understanding → flagged `unknown`) | Central: popover + classification | Discouraged but available |
| UI hints | "Read for the gist. Don't stop for words." | "Tap words you don't know. Classify honestly." | "Reread at full speed. Enjoy it." |
| Exit | "Start Pass 2 →" | "Start Pass 3 →" (nags if zero lookups: gentle) | "Finish" → session summary |

- Session summary (also mirrored in side panel): time per pass, unique words seen, lookups,
  words classified `known`/`learning` during the session, estimated coverage
  (known + within-level tokens ÷ total tokens).
- Sessions are per tab + URL; closing the tab or explicit "Reset session" ends them. State
  lives in `chrome.storage.session` (survives service-worker restarts, cleared on browser close).

### F4 — Immersive reader mode (U5)

- Toolbar action "Immerse" (content-script pill + side panel button + context menu) replaces
  the page with a full-viewport reading overlay:
  - article extracted with Readability (title, byline, content only)
  - typography: font family (serif/sans), size, line height, measure (line width)
  - themes: light / sepia / dark
  - reading progress bar; Esc or ✕ returns to the original page (original DOM untouched)
- Word tagging, popovers, pass mode, and the pass pill all work inside the reader.
- Reader preferences persist (synced) and pre-seed from options.

### F5 — Vocabulary manager (U3, U6)

- Data model: `lemma → { status, firstSeen, lastSeen, timesSeen, lookupCount, definition? }`.
- Surfaces:
  - popover status buttons (per word, instantly re-renders all occurrences on the page)
  - side panel "This page" list (grouped by status) and global "Vocabulary" browser
    (search, filter by status, edit status, delete)
- Import/export the full vocabulary + settings as a single JSON file (options page).

### F6 — Settings (U7)

Options page + side panel quick settings:

- Level band: 2k / 5k / 10k / 20k (default **5k**)
- Tagging: on/off; highlight intensity (subtle/normal/vivid); show candidates on/off
- Pass 1 behavior: hide tags entirely vs. faint marks
- Reader defaults: theme, font, size, width, line height
- Dictionary: online fallback on/off (offline-only mode)
- Data: import/export, clear dictionary cache, reset vocabulary

## 5. UX flows

### 5.1 First run
1. Install → side panel opens automatically once (onboarding card): pick level, see the
   3-pass concept in three sentences, "Try it on this page".
2. Defaults apply (level 5k, subtle highlights, Pass 1 hint pill after first navigation).

### 5.2 Core loop (the 3-pass session)
1. Learner opens an article. Tagging appears (or is deferred if session starts in Pass 1).
2. Learner clicks the extension icon → side panel → "Start 3-pass session".
3. **Pass 1** — clean page, gentle timer-free reading; tapping a blocking word flags it.
4. **→ Pass 2** — tags appear; learner works through popovers, classifying words.
5. **→ Pass 3** — page quiets down; learner rereads at speed.
6. **Finish** — session summary card; vocabulary persists for the next page.

### 5.3 Drive-by lookup (no session)
Tagging on, click any rare word → popover → classify or dismiss. Vocabulary accrues across
pages; frequency + personal list make every next page smarter.

## 6. Non-goals (v1)

- ❌ Translation / bilingual dictionaries (product principle).
- ❌ Languages other than English.
- ❌ Spaced-repetition review games, flashcards.
- ❌ Accounts, cloud sync of vocabulary (settings sync only), analytics telemetry.
- ❌ PDF / EPUB rendering inside the reader.
- ❌ Automated "known-words" assessment tests.

## 7. Success metrics (product-level, measured locally only)

- A session completes all 3 passes with ≥5 words classified in Pass 2 (qualitative goal:
  encourages honest study pass).
- Time-to-first-definition < 100 ms for bundled words, < 1.5 s p95 for API lookups.
- Zero perceptible page-jank attributable to tagging on a 2,000-word article.
- Vocabulary list grows across sessions and subsequent pages show fewer candidate tags
  on previously-read topics (personalization loop working).

## 8. Privacy

- All learning data (vocabulary, sessions, cache) stays in `chrome.storage.local`/`session`
  on the device. Settings sync via the user's own Chrome sync.
- The only network request the extension ever makes is to `api.dictionaryapi.dev` for words
  missing from the bundled dictionary (can be disabled in settings).
- No analytics, no accounts, no page-content transmission anywhere else.

## 9. Release

- Manifest V3, Chrome stable ≥ 120 (verified against current stable in E2E).
- Distributed via Chrome Web Store (see `CHROMEWEBSTORE.md`); unpacked load supported for
  development.
