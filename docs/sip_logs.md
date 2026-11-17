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

## SIP-004 — configurable popover width (320/480/640, default 480); "+" after the IPA

- **Requested:** 2026-11-12 (`feat-2026-11-12-003`)
- **Motivation:** SIP-003's 380 px card still feels "not wide enough"
  for example sentences, and different screens/reading habits want
  different sizes — the reporter suggests both a bigger default and a
  user choice. Also, the "+" recorder sits between the word and its
  IPA, splitting the headword pair; it should follow the IPA when one
  is shown.
- **Scope:**
  1. New setting `popoverWidth: 320 | 480 | 640` (default **480**,
     up from 380) as a select on the options page, applied live via
     `chrome.storage.onChanged` — same recipe as `tagStyle` (SIP-001).
  2. Head order: `word · IPA · [+] · ✕` (the `+` moves after the IPA
     when available; unchanged `word · [+] · ✕` otherwise).
- **UX sketch:**
  - options → Appearance: "Popover width — Compact 320 px /
    Default 480 px / Wide 640 px"
  - `serendipity /sɜːrəpənˈɪti/ [+]                     ✕`
- **Technical approach:**
  - `IwSettings.popoverWidth` in `src/shared/types.ts` with default
    480; select row in `public/options/options.html`; read/write in
    `src/options/main.ts` (`refresh`/`bindSettings`).
  - `createPopover` returns `setWidth(px)` setting an inline
    `card.style.width` (overrides the stylesheet default), so the
    content script applies the setting at init and on sync-storage
    changes; the responsive `max-width: calc(100vw - 24px)` clamp is
    untouched.
  - `headRow` appends the `+` button after the phonetic span.
- **Test plan:** unit — defaults carry 480; head child order is
  lemma → phon → add (and lemma → add without IPA); `setWidth`
  changes the card's inline width. e2e — default card computes
  480 px; switching the setting to 640 via storage updates the next
  popover without a reload; existing gates green.
- **Risks:** 640 px on small viewports still clamps (max-width);
  inline width survives popover re-renders because the card element
  itself is never replaced.
- **Docs:** PRD F2 width bullet (configurable, default 480) + F6
  settings row; ADR-0001 amendment (popover appearance configurable).
- **Outcome:** implemented in PR-20 (`pr/20-popover-width-setting`).
  Gates: typecheck, unit 131/131, e2e 35/35. The SIP-001 tag-style
  e2e's hand-built settings payload was extended with the new field so
  it keeps writing a complete settings object.

---

## SIP-005 — synonyms in the popover (offline WordNet synsets + API)

- **Requested:** 2026-11-16 (`feat-2026-11-16-001`)
- **Motivation:** after seeing a definition, the natural learner question is
  "what else could I say here?" — a thesaurus row turns each lookup into a
  small word-family exploration, still monolingual (English→English), still
  offline-first. WordNet is organized as synonym sets, so the data is
  already inside the pipeline; the API fallback also returns synonyms.
- **Scope:**
  1. `dict-core.json` gains a per-lemma synonym list: the union of the
     member lemmas of the same synsets the entry already shows (first
     sense per POS — same offsets the definitions come from), deduped,
     headword excluded, single-word lowercase lemmas only (no
     multi-word/proper), capped at 8.
  2. `DictionaryEntry.synonyms?: string[]` (≤8); API normalization
     collects `meanings[].synonyms` + per-definition synonyms the same
     way.
  3. Popover renders a "Synonyms" section between the senses and the
     status row — compact chips; clicking a chip looks that word up
     (popover re-opens for it) — lightweight thesaurus browsing.
- **UX sketch:**
  ```
  │ happy  /ˈhæpi/  +  ✕        │
  │ ADJ enjoying or showing joy  │
  │ Synonyms: [glad] [felicitous]│
  │ ──────────────────────────── │
  │ [Known][Learning][Unknown][Ignore] │
  ```
- **Technical approach:** `build-data.mjs` parses synset member lemmas from
  the WordNet data-file record head (fields after `w_cnt`; hex count,
  single-digit sense markers dropped); `dict-core.json` value shape becomes
  `{ s: <senses>, syn?: [words] }` (reader updated in the same PR — the
  file is regenerated and bundled atomically). `dictionary.ts` maps `syn`
  into `DictionaryEntry.synonyms` and extends API normalization with the
  same dedupe/cap rules. `popover.ts` renders chips that call the existing
  `openFor` lookup path; vocab keying for a clicked synonym defaults to the
  word itself (WordNet members are base forms).
- **Test plan:** unit — data builder extracts lemmas from a synset head
  line (markers/multiword filtered, cap applied); dictionary service maps
  core `syn` and API synonyms; popover renders the section, hides it when
  empty, and a chip click re-opens with the clicked word. e2e — popover
  for a bundled word shows its synonym chips and clicking one shows the
  synonym's own definition.
- **Risks / edge cases:** synset-mate synonyms are sense-scoped (first
  senses only) — polysemous words show synonyms of the common senses,
  which matches the definitions shown right above; data size grows
  (measured before/after in the PR); antonyms exist in WordNet pointers
  but are out of scope (candidate future SIP); shape change of
  dict-core.json is internal to the bundle (single reader, regenerated in
  the same PR).
- **Docs:** PRD F2 synonyms bullet; ADR-0002 amendment (synonyms sourced
  from the same synsets).
- **Outcome:** implemented in PR-28 (`pr/28-synonyms`). Gates: typecheck,
  unit 149/149, e2e 38/38 (new case: observe's chips render and tapping
  "discover" re-opens its entry, asserted in real Chrome). Data:
  dict-core.json 1.20 → 1.54 MB, 6,797/10,090 entries carry synonyms;
  full-set junk scan clean. The first synset parse attempt misread hex
  lex_ids ("get c") and pointer POS letters ("n", "v") as lemmas — the
  real data-file dump (begin's synsets) grounded the fix: word/lex-id
  pairs strictly alternate, and the regression fixture is the actual
  WordNet line.

---

## SIP-006 — synonyms restyled: inline words, underline on hover (SIP-005 follow-up)

- **Requested:** 2026-11-16 (`feat-2026-11-16-002`)
- **Motivation:** SIP-005 shipped synonyms as pill-shaped chips; the
  reporter finds the tag look visually loud ("the display of synonyms is
  bad") and asks for plain words with a hover affordance instead.
- **Scope:** presentation-only change in `popover.ts` — same data, same
  `.syn-w` click-to-look-up behavior and class contract (tests keep
  working). No PRD/ADR impact (F2's "shown as chips" wording is updated
  to "inline words").
- **UX sketch:**
  ```
  Synonyms
  detect, find, discover, notice — each word plain indigo text;
  hover underlines it; a tap looks it up.
  ```
- **Technical approach:** reset the chip style (no border/background/
  radius/padding), inline flow, comma separators via `::after` on all
  but the last word; hover = underline (not bold — bold reflows text
  width mid-hover, underline is layout-stable). Buttons remain buttons
  (keyboard focus + click) with `cursor: pointer` and the existing
  indigo accent signaling interactivity.
- **Test plan:** existing SIP-005 unit/e2e tests already assert class,
  contents, and click behavior — they must stay green unchanged; no new
  assertions beyond style intent (house rule: don't unit-test CSS).
- **Risks / edge cases:** none functional — pure stylesheet change;
  `::after` separators are not part of `textContent`, so lookup-by-text
  in e2e is unaffected.
- **Outcome:** implemented in PR-29 (`pr/29-synonym-style`). Gates:
  typecheck, unit 149/149, e2e 38/38 — the SIP-005 assertions passed
  unchanged, as expected for a stylesheet-only change.

---

## SIP-007 — tappable words inside definitions (chain lookups)

- **Requested:** 2026-11-17 (`feat-2026-11-17-001`)
- **Motivation:** WordNet glosses are sometimes circular for derived
  forms — the reporter looked up "copiously" and got "in a copious
  manner", which only helps if "copious" is itself one tap away. Word
  chaining turns each lookup into a guided walk from unknown to known.
- **Scope:** in the popover's sense definitions and sense examples,
  words that are **rarer than the user's level** (the same unknown-word
  model the tagger uses, ADR-0003) render as tappable: dotted underline,
  hover solid; a tap re-opens the popover for that word. Words inside
  your level, marked known/ignored, or forms of the headword itself stay
  plain. Synonym words (SIP-006) and "Recently met" sentences unchanged.
- **UX sketch:**
  ```
  copiously  /ˈkoʊpiəsli/  ✕
  adverb  In a ·copious· manner      ← dotted = tappable
  ```
- **Technical approach:** new optional popover dep
  `isLinkable?: (token) => boolean`, wired in `content/index.ts` from the
  frequency index (`resolveForm` + `isRarerThan(level)`) minus vocab
  known/ignored statuses; the popover itself excludes headword forms via
  the existing `isWordForm` dep and tokenizes with the shared word regex.
  Click reuses `openFor(currentAnchor, word)` — identical to synonym
  chips. Pure presentation + one predicate; no data or service changes.
- **Test plan:** unit — popover links tokens only when the predicate
  says so (the exact "copiously → copious" repro with a stubbed
  predicate); headword forms never link; taps trigger lookup; unlinked
  text renders verbatim. e2e — set level 2k via sync storage (existing
  pattern), open "observe", its definition's "existence" (rank ~2.4k)
  must be tappable and its tap must swap the popover to that word;
  restore the level afterwards.
- **Risks / edge cases:** link density depends on the user's level — at
  20k almost no definition word qualifies (calm), at 2k many do
  (guided); rank-0 unlisted words in glosses count as rarer than every
  band (consistent with the tagger); definitions come from our own data
  (WordNet glosses / API), so token quality is controlled; multiword
  phrases link per-word, acceptable for v1.
- **Docs:** PRD F2 bullet; ADR-0003 amendment (the rarity model now also
  drives in-popover linkable words).
- **Outcome:** implemented in PR-30 (`pr/30-definition-links`). Gates:
  typecheck, unit 152/152, e2e 39/39 (new case: at level 2k observe's
  gloss links discover/existence; tapping existence swaps the popover —
  asserted in real Chrome). Two e2e lessons folded into the spec: the
  level-change retag races the click (barrier: 2k-only stable-lemma words
  quiet/moment must be wrapped first — evening/even is NOT a valid
  sentinel because resolveForm keys it under lemma "even", rank 253), and
  waitForFunction's default rAF polling starves on the backgrounded tab
  behind the panel page — interval polling (500 ms) instead.

---

## SIP-008 — restrictive definition-link rules; popover word dblclick; stacked navigation with Back

- **Requested:** 2026-11-17 (`feat-2026-11-17-002`)
- **Motivation:** SIP-007 linked "A"/"O" inside definitions — silly. Root
  cause: the frequency list excludes single-letter words, so a/o resolve
  to rank 0 = "rarer than every band". The reporter wants (1) a
  restrictive candidate rule, (2) dblclick-any-word on the popover as the
  always-available escape hatch, (3) chained lookups to open a NEW
  popover floating over the original with a Back button.
- **Scope:**
  1. Lexical guard in the popover before the rarity predicate: a
     definition word links only if it is ≥3 chars, pure lowercase a–z.
     This never links "A"/"O", acronyms/ALL-CAPS, brand-like CamelCase,
     apostrophe forms, or capitalized words — restrictive by design.
  2. `dblclick` on the popover card looks up the selected word (the
     browser selects the word under the cursor on dblclick) — any word,
     no guards beyond tokenization, because it is explicit user intent.
  3. Stacked navigation: in-popover lookups (definition links, synonym
     words, dblclick) push the current entry onto a stack and render the
     new one in place, with a "‹ Back" head button while the stack is
     non-empty; Back re-renders the previous entry from the stack
     (instant, no re-lookup). Root lookups (page clicks) reset the stack.
- **UX sketch:**
  ```
  ‹ Back   copious  ✕          ← deep entry, floats over…
  adjective  large in quantity  │ …the original (observe) behind
  ```
- **Technical approach:** `popover.ts` gains a `NavState` stack
  (`{lemma, vocabKey, entry, source, vocabEntry}`); `openFor` resets it,
  in-popover navigation pushes, `back()` pops and re-renders from the
  stored state (lookup sequence guard cancels superseded loads).
  dblclick handler reads the native selection (empty on button dblclicks
  → no-op). Lexical guard lives in `appendWithDefinitionLinks` before
  `deps.isLinkable`, so every consumer inherits it.
- **Test plan:** unit — "A"/"O"/"don't"/capitalized/CamelCase never link
  even when the predicate accepts everything; dblclick dispatch with a
  set selection navigates; Back appears after deep navigation, restores
  the previous lemma without a second lookup, hides at root; synonyms
  still navigate (now stacked). e2e — extend the SIP-007 case: after
  tapping "existence", Back is visible and returns to "observe"; a
  simulated dblclick over a common word in the definition opens its
  entry stacked, Back returns.
- **Risks / edge cases:** Back re-renders a snapshot — if the user
  classified the deep word, the parent's status display could be stale;
  acceptable (statuses render per word; the parent snapshot is refreshed
  on its next open). Dblclick on buttons is ignored (no selection).
  Escape/outside-click closes the whole stack (one popover, per ADR-0001).
- **Docs:** PRD F2 — restrictive link rule + stacked navigation bullets.
- **Outcome:** implemented in PR-31 (`pr/31-link-rules-popover-stack`).
  Gates: typecheck, unit 155/155, e2e 39/39 (extended SIP-007 case:
  tapping "existence" stacks over "observe", Back returns instantly and
  hides at root; a simulated in-card dblclick on "determine" — rank 1888,
  never a recommended link — opens it stacked). Root cause of the "A"/"O"
  links recorded in the proposal: the frequency list excludes
  single-letter words, so they rank 0 = rarer-than-every-band.
