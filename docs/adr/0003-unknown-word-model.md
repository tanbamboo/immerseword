# ADR-0003: Unknown-word detection — frequency bands + personal vocabulary statuses

**Status:** Accepted · **Date:** 2026-11-10

## Context

"Tag unknown words" requires deciding, per word, whether *this learner* likely doesn't
know it. Options: pure frequency thresholding, a maintained known-words allowlist, an
imported vocabulary size assessment, or a combination. Detection quality is the product's
first impression — false tags on every common word would kill trust; missing rare words
undersells the tool.

## Decision

**Two-layer model, both layers explicit and inspectable:**

1. **Frequency band (coarse, default layer).** Bundle `frequency.json` built from the
   Google Trillion Word Corpus top-20k list (MIT): ordered list → lemma rank. User picks a
   level L ∈ {2k, 5k, 10k, 20k} (default 5k). A token whose lemma has rank > L (or is
   absent from the list) is a **candidate**: *potentially unknown*.
2. **Personal vocabulary (fine, overrides layer).** Per-lemma status persisted in
   `chrome.storage.local`:
   - `known` — never tagged again (shrinks tags over time: the personalization loop)
   - `learning` — always shown (blue), until promoted to `known`
   - `unknown` — always shown (amber), default when a candidate is first classified
   - `ignored` — never shown (proper nouns, brands, jargon the reader doesn't care about)
   Unclassified candidates render as *potentially unknown* (lighter amber, dotted).

**Lemmatization** (`src/shared/lemmatizer.ts`): lookup-driven, no NLP dependency —
- committed irregular-form map (≈300 verb/noun/adjective forms: *ran→run, geese→goose,
  better→good/well*) covering suppletive & high irregularity forms;
- ordered suffix rules (s/es/ies, ed/d, ing doubling & e-drop, ly, ness, ment, tion/sion,
  er/est …) with validation against the frequency list when available (rule fires only if
  the stem exists in the list, else original form kept);
- numbers, single letters, ALL-CAPS (acronyms) skipped as tokens.

Classification runs per **lemma**; all inflected occurrences of a lemma share one status.

## Consequences

- Deterministic, offline, unit-testable detection; no page content leaves the browser.
- The 20k ceiling means C1 learners' "rare but known" words generate candidates until
  classified — acceptable: `ignored`/`known` are one click, and the vocabulary compounds.
- Lemmatizer will have edge cases (*flies* noun vs verb); frequency-list validation keeps
  error rate low; corrections are one popover click away, which is itself the product loop.

## Alternatives considered

- **Pure frequency**: noisy, ignores learner reality — rejected as sole layer.
- **Known-words allowlist only** (start empty, tag nothing until told): cold-start page is
  silent; poor first impression — rejected.
- **CEFR-graded wordlists** (e.g., EVP): licensing constraints and coarser coverage than
  rank bands — future option per-level if licensed data arrives.

## Amendments

**2026-11-12 (PR-18, feat-2026-11-12-001).** Layer 2 entries gain an optional
`examples?: VocabExample[]` — the sentence the learner was reading when they
classified the word as **Learning**, captured by the content-script popover at the
moment of that click (the only context holding the DOM anchor; side-panel
classification captures nothing). Each item is `{ text, url, capturedAt }` with
`url` = page origin + pathname (query/hash stripped). The list is capped at 3,
newest first, deduped on exact text; `setStatus`/`bumpLookup` preserve it, and it
round-trips through vocabulary export/import (payload version 2). The popover
shows it back as a "Recently met" section. Rationale: the sentence a learner
actually met a word in is the most personal example possible — and it stays in
`chrome.storage.local` like the rest of the vocabulary (PRD §8).

**2026-11-12 (PR-19, feat-2026-11-12-002).** Extends the amendment above:
exposure capture is also **on demand** — a "+" button in the popover head
records the current sentence through the same `addExample` path (a word is
marked Learning only once, so later encounters need their own affordance).
Example rendering highlights every form of the word by resolving sentence
tokens through the shared lemmatizer at display time; no schema change.

**2026-11-17 (PR-30, feat-2026-11-17-001).** The layer-1 rarity rule gains a
second consumer: inside dictionary-popover definitions and sense examples,
words whose resolved form is rarer than the user's level (and not
known/ignored in the personal vocabulary, and not forms of the headword
itself) render as tappable — dotted underline, tap re-opens the popover for
that word (SIP-007). This addresses circular WordNet glosses for derived
forms ("copiously — in a copious manner"): the unknown word inside a
definition is one tap away, using exactly the same unknown-word model that
tags pages, so link density automatically follows the learner's level.

**2026-11-18 (PR-33, feat-2026-11-18-002 / SIP-010) — the candidate rule becomes two-tier.**
Days of real use showed layer 1 (rarer-than-band ⇒ candidate) over-tags: band-edge
words are usually guessable in context, the user's professional vocabulary ranks rare
in a general corpus, and dozens of marks per page desensitize and exhaust
classification. Since dblclick reaches any word (SIP-008), tagging is a recommendation,
not the only entry — so marks are now spent conservatively:

- **Quiet (default)**: candidates are only words **absent from the 20k corpus**
  (rank 0 — the "really complex" tier), plus the personal statuses (learning/unknown
  always shown, known/ignored never — unchanged).
- **Full** (legacy): the original rarer-than-level rule, opt-in via the
  `tagDensity` setting.
- **Study-pass elevation**: while a 3-pass session is in Pass 2, candidates use the
  user's full level band — study time is when marks help; Passes 1/3 and non-session
  reading stay quiet.

The level setting keeps its non-page roles: popover definition-links (SIP-007),
coverage stats, and side-panel analysis all still use the band. Untagged words are
one dblclick away.

**2026-11-24 (PR-37, bug-2026-11-24-001 / SBFP-011) — rank 0 gains English validation.**
A frequency list proves membership of its 20k entries and nothing about the rest: the
rank-0 tier conflated *rare English* with *not English at all*, so transliterations,
foreign vocabulary, and name-like strings all tagged as "really complex" candidates.
Unlisted tokens must now also validate against the bundled **WordNet 3.1 lemma lexicon**
(`public/data/english.json`, 77,561 single-word lowercase lemmas generated by the data
pipeline — same source and license as the dictionary core; OED was surveyed and is
unusable: proprietary, no offline redistribution). Unlisted + validated → candidate as
before; unlisted + not in the lexicon → never tagged (dblclick still reaches them).
Applies in both densities and to the popover's definition-link predicate; personal
statuses still override everything. Consequence: rare English missing from WordNet
(e.g. "petrichor", which postdates the 3.1 corpus) goes untagged — accepted trade-off,
recorded in the fixture vocabulary.
