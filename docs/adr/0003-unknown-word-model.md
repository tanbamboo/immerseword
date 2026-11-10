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
