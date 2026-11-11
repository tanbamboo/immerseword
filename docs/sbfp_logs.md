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
