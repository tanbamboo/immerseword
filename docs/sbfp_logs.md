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

---

## SBFP-003 — wrong lemmas: possessives, ing/ed fallbacks, -ly adverbs

- **Reported:** 2026-11-11 (`bug-2026-11-11-003`)
- **Symptom (as reported):** "market's"/"vendor's" mishandled; `shaping`
  should resolve to `shape`; `roughly` must not collapse to `rough`;
  `embedding` → "no definition for embedd"; `overstated → overstat`,
  `disgruntled → disgruntl`, `shaping → shap`.
- **Root cause (verified against the shipped data):**
  1. Possessives: the tokenizer keeps `market's` as one token (correct for
     display), but the lemmatizer never strips `['’]s` — every possessive
     is unranked (rank 0), so common-word possessives get tagged as
     ultra-rare with the garbage lemma `market's`.
  2. Rare-word fallback (`FALLBACK_RULES`) returns the first candidate of
     length ≥ 3 with no validation and worst-first ordering: bare stem
     before e-restore/dedup → `embedding→embedd`, `overstated→overstat`,
     `disgruntled→disgruntl`. Pass-1 validated rules have the same ordering
     flaw when bare and e-restored stems are both listed (`hoped→hop`).
  3. `-ly` is treated as inflectional: listed adverbs with their own
     dictionary headwords (`roughly`, freq 8296, in dict-core) collapse to
     the adjective (`rough`) because `resolveForm` prefers the lower rank.
  4. The dictionary service never lemmatizes: raw tokens from the
     double-click/context-menu paths (`shaping`, `market's`) go straight to
     core/API and miss.
- **Fix:**
  - `lemmatizer.ts`: strip `['’]s$` on entry; shared `edIngCandidates()`
    ordering — doubled consonant → dedup (`embedd→embed`), vowel + e-drop
    consonant (p b t d c g v z m k f s) → e-restore first (`shap→shape`,
    `overstat→overstate`, `hop→hope`), consonant+l → e-restore first
    (`disgruntl→disgruntle`), otherwise bare first (`glisten`, `walk` stay)
    — applied in both validated Pass 1 and the rare-word fallback.
  - `dictionary.ts`: surface-first resolution — a surface with its own core
    entry keeps itself (`roughly`, `evening`, `slowly`, `shaping` are
    headwords); only a core miss resolves via a core-validated lemmatizer
    (`market's`→`market`, `hoped`→`hope`), and the resolved form must itself
    be a headword, else the surface stays as the cache/API key
    (`embedding` queries the API as itself).
  - Design pivot during implementation: the first cut collapsed `-ing`
    forms before checking the surface (and kept listed `-ly` surfaces in
    the tagger). Both broke in review: `evening`→`even` (wrong word's
    entry) and `slowly` (rank 5048) became a tagging candidate at the
    default level. Settled rule: headword surfaces are authoritative in the
    dictionary; the tagger's `-ly` band behavior is unchanged.
- **Verification plan:** unit — lemmatizer (all reported pairs, `hoped→hope`
  vs `hopped→hop`, `glistened→glisten` regression), dictionary service
  (surface-first + possessive + API-key behavior), tagger (possessives:
  `family's` untagged, `vendor's` tagged with lemma `vendor`); e2e —
  `DICT_LOOKUP` keeps `roughly`, resolves `market's`→`market` through the
  real worker + core data.
- **Risks / edge cases:** gerunds with own entries show their own
  definition (`shaping` shows the "process" noun, not `shape`'s entry) —
  a real, on-topic definition either way, never `shap`; fallback remains
  best-effort for words absent from every list; `ll` excluded from dedup
  (`polling→poll`, `controlling→control` via late dedup candidate).
- **Outcome:** fixed in PR-13 (`pr/13-lemma-quality`). Gates: typecheck,
  unit 101/101, e2e 27/27. Spot check on the shipped data: all six reported
  words produce sane tagger keys and popover lookups on every path.

---

## SBFP-004 — brands and domain names tagged as unknown words

- **Reported:** 2026-11-11 (`bug-2026-11-11-004`)
- **Symptom:** in "hashes, external IPs, domains and URLs (VirusTotal,
  abuse.ch, AbuseIPDB, GreyNoise, urlscan.io)" the tagger flags
  VirusTotal, AbuseIPDB, GreyNoise, urlscan — product names, brands, and
  domain components.
- **Root cause (verified on the shipped corpus):**
  1. Mixed-case compounds are one token with no interior boundaries;
     lowercased (`virustotal`) they are unlisted → rank 0 → "rarer than
     every band" → always tagged. `isAcronym` only catches pure ALL-CAPS.
  2. Acronym plurals (`URLs` rank 9196, `IPs` 9663) and TLD pieces (`io`
     8996) sit just beyond the 5k band → tagged as ordinary rare words.
  3. `urlscan` is all-lowercase — indistinguishable from a rare word at
     token level; only its raw-text context (`.io` immediately after, or a
     `.` immediately before for TLD pieces) identifies it as a hostname
     component.
- **Fix:**
  - `tokenizer.ts` `isBrandLike()`: interior case boundary
    (`/[a-z][A-Z]/` — VirusTotal, AbuseIPDB, GreyNoise, iPhone, McDonald)
    or pluralized acronym (`/^[A-Z]{2,}s$/` — URLs, IPs, IDs); classify()
    skips them like acronyms.
  - `tagger.ts` `insideHostname()`: a token whose raw text is immediately
    followed by `.letters` (urlscan in urlscan.io, abuse in abuse.ch) or
    immediately preceded by `.` (io, ch, com pieces) is a hostname
    component — never tagged.
  - User-initiated lookups (double-click / context menu) still work on any
    string by design; only automatic tagging skips these shapes.
- **Verification plan:** unit — the reported sentence tags none of the
  brand/domain/acronym tokens while still tagging ordinary rare words;
  e2e — the sentence injected into the live page tags none of them (with a
  sentinel rare word proving the rescan ran).
- **Risks / edge cases:** CamelCase detection cannot distinguish a brand
  from a legitimately rare CamelCase neologism — both are proper nouns and
  skipping is correct; a rare word in typo'd no-space-after-period text
  ("word.Io") is skipped — acceptable collateral; hostname detection is
  single-text-node scoped (components split across nodes are not joined).
- **Outcome:** fixed in PR-14 (`pr/14-brand-domain-tagging`). Gates:
  typecheck, unit 102/102, e2e 28/28 — including the reported sentence
  asserted end-to-end on the live page.

---

## SBFP-005 — contractions tagged as unknown words

- **Reported:** 2026-11-11 (`bug-2026-11-11-005`)
- **Symptom:** "you're", "I'm", "you'll" tagged as unknown words; reporter
  notes the list is not exhaustive ("I can't recognize them all").
- **Root cause (verified on the shipped corpus):** the tokenizer keeps
  apostrophe forms as single tokens (right for display), but the corpus has
  no rank for them and the lemmatizer only reduces possessive `'s`. Every
  clitic contraction (`you're`, `I'm`, `you'll`, `can't`, `won't`,
  `don't` …) and fixed apostrophe form (`o'clock`, `ma'am`) resolves to
  itself at rank 0 → "rarer than every band" → tagged at every level.
  (`it's`, `John's` are fine since PR-13's possessive strip.)
- **Fix (class-wide, not a suffix list):** in `classify()`, after
  `resolveForm`, a lemma that STILL contains an apostrophe and ranks 0 is
  not vocabulary — no analysis could make sense of it — skip it like
  acronyms/brands. Possessives keep working because `resolveForm` strips
  `'s` first ("vendor's" → "vendor" ranks-or-not without an apostrophe and
  stays taggable).
- **Verification plan:** unit — the reported contractions plus `can't`,
  `won't`, `o'clock`, `ma'am` untagged while `vendor's`→vendor and
  ordinary rare words still tag; e2e — contraction sentence on the live
  page (sentinel-proven rescan) tags none of them.
- **Risks / edge cases:** a rare word that happens to contain an apostrophe
  and is absent from all lists is skipped — English has no such learnable
  vocabulary (contractions/possessives/fixed forms only); user-initiated
  lookups still accept any string.
- **Outcome:** fixed in PR-15 (`pr/15-contractions`). Gates: typecheck,
  unit 103/103, e2e 29/29 — contraction sentence (straight and curly
  apostrophes) asserted end-to-end on the live page.

---

## SBFP-006 — transient core-dictionary load failure is cached forever

- **Reported:** 2026-11-11 (`bug-2026-11-11-006`)
- **Symptom:** after reloading the unpacked extension, chrome://extensions
  shows: "[ImmerseWord] core dictionary failed to load: TypeError: Failed
  to fetch" in `background/service-worker.js`.
- **Root cause:** `corePromise ??= loadCore().catch(...)` caches the
  rejection's null result for the worker's whole lifetime. A single
  transient fetch failure — classically the old worker being torn down
  mid-load when the extension is reloaded, exactly the reported scenario —
  permanently degrades every later lookup to API-only (or "no definition"
  when offline). The `console.error` also surfaces in the extension Errors
  dialog, which is how the user noticed.
- **Fix:** on load failure, clear `corePromise` so the next lookup retries,
  and log at `console.warn` ("unavailable, will retry") — transient
  teardown noise no longer lights up the Errors badge; a genuinely missing
  file retries cheaply per lookup.
- **Verification plan:** unit — `loadCore` failing once then succeeding:
  first lookup degrades (no core), second lookup resolves from core without
  a worker restart; existing gates green.
- **Risks / edge cases:** a permanently missing core file now logs a warn
  per lookup and retries the fetch each time — a packaged-resource fetch,
  negligible cost.
- **Outcome:** fixed in PR-16 (`pr/16-core-load-retry`). Gates: typecheck,
  unit 104/104, e2e 29/29.

---

## SBFP-007 — classifying a double-clicked common word never tags it

- **Reported:** 2026-11-12 (`bug-2026-11-12-001`)
- **Symptom:** double-click a word that is *not* a candidate (common, inside
  the level band — never wrapped by the tagger), classify it **Learning** or
  **Unknown** in the popover → nothing happens on the page. The word is never
  tagged or underlined, contradicting PRD F1 and ADR-0003 ("learning/unknown —
  always shown"). Tagged (candidate) words classify fine.
- **Root cause (three layers):**
  1. `Tagger.classify` checks the frequency band **before** the personal
     vocabulary: a within-band token returns `null` early, so a `learning`/
     `unknown` status can never produce a tag — the personal layer was meant
     to *override* the band (ADR-0003 layer 2), but only did so for words
     that were already rare.
  2. Even with (1) fixed, the word's text node was consumed by the initial
     scan (`processed` set), and `refreshStatus` only mutates existing
     `span.iw-word` elements — nothing re-examines already-processed nodes,
     so the new status never materializes as a span.
  3. The dblclick/context-menu lookup paths classify under the **raw
     surface** ("evening"), while the tagger's vocab key is the canonical
     resolved form — `resolveForm("evening")` = "even" (rank 2352 vs 253:
     the lemma outranks the surface, so it wins per `frequency.ts`). The
     keys never meet, so even (1)+(2) left the word untagged. Tagged-span
     popovers never hit this — their `data-lemma` is already canonical.
- **Evidence:** `src/content/tagger.ts` `classify` (band check at the
  `isRarerThan` guard precedes `vocab.statusOf`); `refreshStatus` queries
  existing spans only; `collectTextNodes` rejects `processed` nodes;
  `public/data/frequency.json` ranks evening=2352, even=253 →
  `resolveForm` returns the lemma. Repro in e2e conditions: dblclick
  "evening" → Learning → zero matching spans on the page.
- **Fix:**
  - `classify` reordered to honor ADR-0003's layering: acronym/brand/
    contraction guards first, resolve the lemma, then **vocab status before
    the band check** — `known`/`ignored` → null, `learning`/`unknown` → tag
    with that status regardless of band; only then the candidate band check.
  - New `Tagger.rescan(root)`: same batched loop as `scan`, but
    re-examines already-processed nodes too (wrapping is idempotent —
    wrapped tokens were split off the node, so no double-wrapping).
  - `content/index.ts`: on any classification to `learning`/`unknown`
    (popover path and side-panel `storage.onChanged` path), `rescan` the
    page body and the reader's live article so all occurrences — including
    previously untagged common ones — get wrapped; per-root scan
    invalidation makes overlapping calls safe.
  - `content/popover.ts`: `openFor` gains an optional `vocabKey` — the
    display word still drives the dictionary lookup ("evening" keeps its
    own definition), while every vocabulary interaction (status, examples,
    `onStatusChange`) keys the canonical form. The content script resolves
    it via the frequency index for the dblclick and context-menu paths.
- **Verification plan:** unit — classify returns `learning`/`unknown` for a
  within-band word with a vocab status; scan initially skips it, `rescan`
  after the status lands wraps it (and inflected surfaces share the lemma);
  known/ignored still never tag; popover classifies under `vocabKey` while
  looking up the display word. e2e — dblclick "evening" → Learning → a
  `span.iw-word` with the canonical lemma `even` and status `learning`
  appears wrapping exactly the word "evening"; existing gates green.
- **Risks / edge cases:** `classify` now resolves a lemma for every token
  (previously only rare ones) — one extra Map lookup per token inside
  already batched scans, negligible; contractions stay untaggable (the
  apostrophe guard runs before the vocab check, preserving bug-2026-11-11-005);
  classifying from the side panel now also triggers a rescan (cheap, and
  correct — same requirement); words inside links/code stay untouchable
  (skip filter unchanged); the `vocabKey` split means a dblclicked word
  whose canonical lemma differs ("evening" → "even") classifies under the
  canonical lemma — exactly how the tagger already treats those tokens.
- **Outcome:** fixed in PR-22 (`pr/22-tag-classified-common-words`). Gates:
  typecheck, unit 136/136, e2e 36/36. Layer 3 (the lemma-key mismatch) only
  surfaced when the first e2e run of the repro stayed red after layers 1–2 —
  the fix was extended with the popover `vocabKey` and verified with the
  real-corpus ranks (evening 2352 / even 253).
