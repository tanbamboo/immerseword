# ADR-0002: Hybrid monolingual dictionary — bundled WordNet core + online API fallback

**Status:** Accepted · **Date:** 2026-11-10

## Context

The product promises English-only definitions for any word a learner taps, with offline
capability for common lookups (U9) and no API keys. Options: (a) fully offline dictionary
bundled in the package, (b) online API only, (c) hybrid. Constraints: CWS package size
(soft limit ~50 MB, hard 2 GB; want small), `chrome.storage.local` 10 MB quota,
dictionaryapi.dev is free/keyless but network-dependent and rate-limit-unspecified.

## Decision

**Hybrid, three tiers, resolved in the service worker:**

1. **`dict-core.json` (bundled, committed to repo)** — generated at build time from
   WordNet 3.x database files: for each of the top ~15k lemmas (by the frequency list),
   the **first-sense** gloss per major POS (WordNet orders senses by frequency of use, so
   sense 1 is the most common meaning), POS tag, and — where cheap — one WordNet example.
   ~1.5–3 MB JSON. Loaded by the SW on demand and kept in memory of the SW instance
   (reloadable; not persisted state). *(Amended 2026-11-10: originally "shortest gloss",
   which picked terse-but-rare senses like beautiful → "of weather"; first-sense ordering
   is the correct default.)*
2. **Free Dictionary API** (`https://api.dictionaryapi.dev/api/v2/entries/en/<word>`) for
   anything missing — full entries: phonetics, senses, examples. Normalized to our
   internal `DictionaryEntry` shape.
3. **LRU cache** in `chrome.storage.local` keyed `dc:<lemma>`, capped at 2,000 entries
   (~2 MB); evicted oldest-first; "no definition found" is also cached (negative caching,
   TTL 7 days) to avoid repeat network calls.

Settings toggle allows **offline-only mode** (skip tier 2). Bundled generation failure at
build time degrades gracefully: ship without `dict-core.json`; extension still works
online-only, flagged in the build output and README.

**Licensing** (recorded in `public/data/ATTRIBUTION.md`):
- WordNet 3.x — Princeton WordNet License (permissive, attribution required).
- dictionaryapi.dev — free public API, no key; only endpoint ever contacted.
- Attribution strings surface in the options page "About & licenses" section.

## Consequences

- First-time lookup of a rare word needs the network (~200–800 ms typical); everything in
  the core band is instant and offline.
- Data regeneration is a build-time concern (`scripts/build-data.mjs`), committed to the
  repo for reproducible builds; contributors don't need the pipeline to build/test.
- API shape changes break only tier 2 and are caught by a unit test hitting a recorded
  fixture, not the live API (no flaky network tests).

## Alternatives considered

- **Full offline dictionary (e.g., complete WordNet ~60 MB+)**: rejected — install size
  disproportionate; marginal benefit over 15k-lemma core.
- **Online-only**: rejected — breaks offline promise, adds latency to the most common case.
- **LLM-generated definitions (Chrome Prompt API)**: rejected for v1 — non-deterministic,
  heavyweight, unavailable on many machines; possible future enhancement.
