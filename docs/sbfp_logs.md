# Structured Bugfix Proposal (SBFP) Log

One proposal per analyzed bug report ([raw records](user_feedback/bugs.md)).
Write the proposal before implementing; append the outcome after the PR
merges. Append-only — never rewrite a merged proposal.

---

## SBFP-001 — reader e2e flake: shadow-root tagging stalls without frames

- **Reported:** 2026-11-11 (`bug-2026-11-11-001`)
- **Symptom:** `launcher opens the reader with the extracted, tagged article`
  fails intermittently (~1/12 runs) on `assert.ok(state.taggedLemmas.includes('serendipity'))`
  — the reader renders, but zero `span.iw-word` appear inside its shadow root.
- **Root cause (two layers):**
  1. `Tagger.scan()` advanced only via `requestAnimationFrame`. Chrome produces
     no frames for an idle page (headless steady-state, hidden/occluded tabs),
     so a scan scheduled after the page settled could stall forever with the
     article untagged.
  2. The test sampled `taggedLemmas` immediately after `.article h1` appeared;
     the first wrap batch is always ≥1 frame/timer away, so even a healthy
     scan can lose the sample race.
- **Evidence:** instrumented runs — a fresh rAF callback failed to fire within
  800ms on a `visibilityState: 'visible'` page in 3/10 headless runs; one run
  showed `sampled: [] → settled: []` (tags never appeared, 400ms+).
- **Fix:**
  - `src/content/tagger.ts`: each batch awaits `nextBatchSlot()` — a frame
    raced against a 150ms timer fallback. Frame-flowing pages pace unchanged;
    frame-starved scans still finish. (Also removes a real-browser hazard:
    background tabs previously got zero tagging progress.)
  - `tests/e2e/reader.e2e.mjs`: test 1 waits for the three expected lemmas
    before sampling (same pattern the exit/popover test already used).
  - `vitest.config.ts`: `name: 'unit'` so `npm run test:unit` (`--project
    unit`) resolves again (pre-existing breakage found during diagnosis).
- **Verification:** typecheck clean; unit 95/95; e2e 24/24; the failing test
  looped 20/20 pass (was ~1/12 failures).
- **Risks / edge cases:** with the budget hit repeatedly (true frame
  starvation), batches run at ≥150ms intervals — slower but still progressing;
  timer throttling in real hidden tabs bounds throughput, never correctness.
- **Outcome:** merged as PR-8 (`pr/08-reader-e2e-flake`, PR #1, commit `0f6dcc8`).

---

## SBFP-002 — context-menu lookup and double-click show no popover

- **Reported:** 2026-11-11 (`bug-2026-11-11-002`)
- **Symptom:** right-click a selected word → "Look up … with ImmerseWord" does
  nothing (no popover); double-clicking a word does nothing either.
- **Root cause:**
  1. The `IW_SHOW_LOOKUP` content-script handler only acted when a tagged
     `span.iw-word[data-lemma=…]` existed. Any word that is not tagged —
     common words inside the level band, known/ignored words, tagging still
     scanning, or tagging disabled — resolved to `shown: false` with no UI.
     This violates PRD U8 ("look up any word via right-click even when
     tagging is off").
  2. Double-click lookup was never implemented — no `dblclick` handler
     exists; it only worked incidentally on already-tagged words via the
     single-click delegation.
  3. (Minor) the SW menu handler took `selectionText.split(/\s+/)[0]`
     verbatim, keeping trailing punctuation ("word," → lookup misses).
- **Fix:**
  - `service-worker.ts`: extract the lemma with the shared tokenizer (first
    clean word token of the selection).
  - `content/index.ts`: `IW_SHOW_LOOKUP` opens the popover for ANY word —
    tagged span preferred as anchor (scroll + click, unchanged), otherwise
    anchored to the selection; no tagging gate (U8).
  - `content/index.ts`: new `dblclick` delegation — double-click selects the
    word natively; the handler looks it up, anchored to the selection rect,
    skipping editable/form surfaces and the popover's own UI; tagged words
    stay on the single-click path (no double lookup flicker).
  - `content/popover.ts`: `openFor`/`position` accept `HTMLElement | Range`
    so the popover anchors to the exact selection rect, not the paragraph.
  - `docs/PRD.md` F2: document double-click alongside click/right-click.
- **Verification plan:** new e2e cases — context-menu message for an
  untagged word ("house") shows the popover; real double-click on an
  untagged word ("evening") shows the popover; existing gates green.
- **Risks / edge cases:** empty/cleared selection → popover falls back to
  viewport-centered; acronyms skipped; dblclick inside inputs/textareas/
  contentable or on toolbar buttons ignored; popover-over-popover blocked.
- **Outcome:** fixed in PR-12 (`pr/12-lookup-any-word`). Verification: new
  e2e cases pass — context-menu lookup for untagged "house", double-click
  lookup for untagged "evening" (headless CDP cannot synthesize a native
  dblclick gesture, so the test reproduces the gesture's DOM effects:
  word selection + bubbling dblclick with detail 2); typecheck, unit 95/95,
  e2e 26/26.
