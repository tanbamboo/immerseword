# Structured Improvement Proposal (SIP) Log

One proposal per analyzed feature request
([raw records](user_feedback/feats.md)). Write the proposal — and the PRD /
ADR updates it calls for — before implementing; append the outcome after the
PR merges. Append-only — never rewrite a merged proposal.

---

## SIP-001 — links untouched; configurable tag underline style

- **Requested:** 2026-11-11 (`feat-2026-11-11-001`)
- **Motivation:** words inside links are wrapped in tag spans, so tag
  underlines collide with link styling — "misleading to visualize links as
  a tagged word" — and clicking a tagged word inside a link hijacks
  navigation (the delegation preventDefaults). The reporter wants a
  subtler default option (first-character underline) and a settings
  choice.
- **Scope:**
  1. Links are never tagged: `a` joins the tagger's skip selector — no
     spans inside links, no visual change, no click hijack. Lookups on
     linked words remain available via selection + context menu.
  2. New setting `tagStyle: 'underline' | 'firstChar' | 'none'`
     (default `'underline'`, current behavior) in sync settings, exposed
     as a select on the options page, applied live via
     `<html data-iw-tag-style>` — no retag needed (pure CSS switch).
- **UX sketch:**
  - underline (default) — whole word underlined, as today
  - firstChar — only the first character carries the mark (the tagger
    wraps it in `<span class="iw-f">` at tag time; CSS moves the
    decoration); rest of the word renders untouched
  - none — no decoration at all; tags stay functional (click/popover)
- **Technical approach:**
  - Tag CSS refactor: per-status/pass rules now set decoration custom
    properties (`--iw-decor-*`) on `.iw-word`; placement rules apply
    them to the whole span (default) or to `.iw-f` only
    (`firstChar`/`none`). Kills the styles × statuses × passes rule
    explosion; custom properties inherit into `.iw-f` naturally.
    `::first-letter` was considered and rejected: unreliable on inline
    elements; the explicit inner span is deterministic.
  - `wrapNode` always wraps the first character (`serendipity` →
    `<span class=iw-word><span class=iw-f>s</span>erendipity</span>`), so
    switching styles is CSS-only. `untag()` already restores arbitrary
    children.
  - Reader: same styles re-declared in its shadow root via the existing
    `:host-context(html)` pattern.
- **Test plan:** unit — link subtree not tagged; `.iw-f` structure
  (first char only, span text unchanged); settings default. e2e —
  injected link paragraph has zero tag spans and intact text; switching
  `tagStyle` via storage flips `data-iw-tag-style` and computed
  decorations (span ↔ `.iw-f`) live on the page; existing gates green.
- **Risks:** one extra inline span per tagged word (DOM cost only);
  pages styling `a span` generically could restyle our mark — rare, and
  strictly better than today (we no longer touch links at all).
- **Docs:** PRD F1 rendering + settings rows; ADR-0004 amended (link
  skip + style modes).
- **Outcome:** implemented in PR-17 (`pr/17-link-untouched-tag-style`).
  Gates: typecheck, unit 105/105, e2e 31/31 (reader spec looped 6×
  stable). Two issues found and fixed during implementation: (1) the
  shadow-root pass/tag-style rules used `:host-context(html)[attr]`,
  which matches the host — never the page `<html>` — so reader pass
  styling had been silently dead (now `:host-context(html[attr])`);
  (2) Readability strips class attributes, so cloned tags reached the
  reader as classless spans and the new `.iw-f` split words into
  fragments re-tagged as broken lemmas ("erendipity") — extract() now
  unwraps our markup in the clone so the reader presents the pristine
  article.

## SIP-002 — Learning words capture the sentence where they were met

- **Requested:** 2026-11-12 (`feat-2026-11-12-001`)
- **Motivation:** the sentence a learner actually met a word in is the
  most personal example they can keep — it carries the context, the
  topic, and the memory of the encounter. Today `VocabEntry` keeps only
  counters/timestamps and that context is lost: "I want it to record
  the surrounding sentence around the word as an example in my personal
  language lifecycle".
- **Scope:**
  1. When the user classifies a word as **Learning** from the popover,
     the sentence containing the clicked occurrence is captured into
     the word's vocab entry (confirmation from the reporter: capture
     happens only at the Learning click itself, not on later lookups —
     re-clicking Learning on later encounters accumulates sentences).
  2. The popover gains a **"Recently met"** section listing the ≤3
     most recent captured sentences (newest first, source page +
     date), shown for both the definition and no-definition states.
  3. Captured examples survive export/import with the vocabulary.
- **UX sketch:**
  - click tagged word → popover → "Learning" → the sentence is saved
    and the "Recently met" section appears immediately in the open
    popover (no reopen needed)
  - section sits between the dictionary senses and the status buttons;
    each item is the sentence in quotes (dictionary-example styling)
    with a small `hostname · date` source line; hidden while empty
- **Technical approach:**
  - `VocabEntry.examples?: VocabExample[]` (`{ text, url, capturedAt }`,
    `url` = origin + pathname, query/hash stripped for privacy);
    optional field → no migration, all readers tolerate `undefined`
  - new `VocabStore.addExample(lemma, { text, url })`: unshift newest,
    dedupe on exact text (re-encounter moves it to the front and
    refreshes `capturedAt`), cap at `MAX_WORD_EXAMPLES = 3` (write-time
    trim, same idea as the dictionary LRU cache); `setStatus`/
    `bumpLookup` rebuilt entries field-by-field and now preserve
    `examples`
  - new `src/content/sentence.ts` `extractSentence(anchor)`: resolve the
    popover anchor (tag span or selection Range) to a (node, offset),
    locate the enclosing block (`p, li, h1–h6, blockquote, td, …`,
    `div` fallback), compute the anchor's char offset in the block's
    textContent with a TreeWalker, then cut at the nearest sentence
    boundaries (`.!?…` + closing quotes/brackets + whitespace);
    whitespace-normalized, capped at 300 chars around the word
  - capture lives in `popover.onStatus` (the only place with both the
    lemma and the DOM anchor); side-panel classification has no page
    DOM and simply doesn't capture
  - export payload version bumps 1 → 2 (additive field, import accepts
    both; examples validated item-by-item like the other fields)
- **Test plan:** unit — sentence extraction (nested inline markup,
  multi-sentence blocks, Range anchors, truncation, detached anchor);
  `addExample` cap/dedupe/preserve; popover renders the section and
  captures on the Learning click; dataio round-trip preserves examples
  and v1 imports still work. e2e — Learning click on a fixture page
  captures the sentence into storage and shows it in the popover; a
  second Learning click on another occurrence adds a second item,
  newest first; existing gates green.
- **Risks:** naive segmentation splits on abbreviations ("Mr.", "e.g.")
  — acceptable v1; capture is best-effort (detached anchor → skipped);
  storage growth bounded (≤3 × ~300 chars per learning word); examples
  never leave the device (PRD §8 unchanged in substance).
- **Docs:** PRD F2 (popover section) + F5 (data model + capture rule) +
  §8 privacy note; ADR-0003 amended (personal examples in the vocab
  layer).
- **Outcome:** implemented in PR-18 (`pr/18-learning-example-sentences`).
  Gates: typecheck, unit 124/124, e2e 33/33. One e2e test needed a
  fix during development: the fixture article already mentions
  "gossamer", so the new spec clicks the span inside its own injected
  paragraph instead of the first page-wide match (the capture itself
  worked on the first run).

## SIP-003 — "+" records exposures on demand; wider popover; highlighted word in examples

- **Requested:** 2026-11-12 (`feat-2026-11-12-002`)
- **Motivation:** SIP-002 records a sentence only at the Learning click
  — and a word is marked Learning exactly once, so later encounters
  have no way to grow the list: "user can only click Learning button
  once". Sentences also render cramped at 320 px, and the met word
  doesn't stand out inside its own example.
- **Scope:**
  1. A **"+" button** after the word in the popover head records the
     current encounter (sentence + source) into the word's examples on
     demand — visible whenever the popover has a page anchor, in both
     the definition and no-definition states. It reuses SIP-002's
     capture path (dedupe, cap 3, newest first) and briefly shows "✓".
     The Learning click keeps recording the first exposure (unchanged).
  2. Popover card width **320 px → 380 px** (responsive `max-width`
     unchanged) so example sentences read comfortably.
  3. In "Recently met" sentences, every form of the word (inflections
     resolved by the shared lemmatizer) is **highlighted**.
- **UX sketch:**
  - `serendipity [+] /sɜːrəpənˈɪti/                ✕`
  - click `+` → sentence captured → "Recently met" section updates in
    place, `+` flashes `✓` (a duplicate just refreshes its recency)
- **Technical approach:**
  - `PopoverDeps` gains optional `isWordForm(lemma, token)`; the
    content script wires it to the existing `createLemmatizer` instance
    (hoisted out of the frequency-index callback), so `observed`/
    `observing` highlight for lemma `observe`. Without the dep the
    highlight falls back to exact case-insensitive matches.
  - `metSection` builds each sentence by tokenizing
    `/[A-Za-z][A-Za-z'’-]*/g` and wrapping hits in
    `<mark class="met-hit">` — text-node assembly, no innerHTML.
  - The `+` button shares `captureExample()` with the Learning path;
    no storage or schema change (SIP-002's `addExample` already
    creates a missing entry, so `+` on an unclassified word starts
    tracking it — "record the word and context exposure").
- **Test plan:** unit — `+` renders with an anchor, records on click
  (flash ✓), stays absent without an anchor; marks wrap matched forms
  via `isWordForm` and exact fallback. e2e — an already-learning word:
  `+` (not Learning again) records the new sentence with the word
  marked; card computes 380 px wide; existing gates green.
- **Risks:** lemmatizer false positives could highlight a look-alike
  token (e.g. "saw" for lemma "see") — acceptable, matching is exactly
  what tagging already relies on; wider card on small screens still
  clamps to `100vw - 24px`.
- **Docs:** PRD F2 (+ button, width, highlight); ADR-0003 amendment
  extended (exposure capture is on-demand via `+`, display-side lemma
  matching only).
- **Outcome:** implemented in PR-19 (`pr/19-example-plus-button`).
  Gates: typecheck, unit 128/128, e2e 34/34. Design note: the
  no-definition state gained the same head row (word + `+` + close)
  so the recorder lives in one predictable place; highlighting is
  display-side only, so examples recorded before this change highlight
  too.
