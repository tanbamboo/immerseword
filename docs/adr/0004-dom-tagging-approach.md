# ADR-0004: DOM tagging — TreeWalker text-node wrapping in batched frames

**Status:** Accepted · **Date:** 2026-11-10

## Context

Tagging words requires (a) finding English word occurrences in arbitrary DOM, (b) marking
them visually, (c) making them clickable. Constraints: must not break host pages (event
listeners, React/Vue hydration, CSS), must not jank long articles, must survive SPA
mutations. Candidate techniques: CSS Custom Highlight API, regex over `innerHTML`,
TreeWalker + `Range.surroundContents`/node splitting, or canvas overlays.

## Decision

**TreeWalker + per-word span wrapping, executed in batched animation frames:**

1. `document.createTreeWalker(root, NodeFilter.SHOW_TEXT)` with a skip-filter (reject
   subtrees: `script/style/code/pre/textarea/input/select/[contenteditable]/[aria-hidden]`,
   whitespace-only nodes, and our own UI containers/shadow roots).
2. For each text node, a word regex locates candidate tokens; the node is split
   (`Text.splitText`) so each candidate occupies its own `#text` node, then wrapped in
   `<span class="iw-word iw-cand|iw-unknown|iw-learning" data-lemma="…">`.
   Non-candidate text nodes are left untouched. Idempotent: nodes inside `span.iw-word`
   are skipped on rescan.
3. **Scheduling**: batches of ≤20 nodes per `requestAnimationFrame`, `scheduler.yield()`
   between batches (chrome-extensions skill rule 6). A scan token invalidates in-flight
   work if a new scan starts.
4. **SPA/dynamic content**: one debounced (250 ms) MutationObserver for added subtrees;
   rescans process only the mutation roots. Character-data changes re-scan the parent
   block.
5. **Restyling vs rewrapping**: status changes and pass switches only flip CSS classes on
   existing spans (`data-status` attribute + attribute selectors) — never re-wrap.

CSS: all classes prefixed `iw-`; a single injected stylesheet uses only class selectors
and CSS custom properties (`--iw-*`) to minimize page-CSS collisions; styles opt out of
page inheritance where relevant (`all: unset`-free; targeted resets for line-height/
display on the spans).

## Consequences

- Spans alter the DOM (unlike Custom Highlights) — mitigated by: never removing original
  text nodes' content, wrapping only candidate words, and idempotent rescans. Risk of
  breaking brittle sites exists and is contained by the enable/disable toggle plus a
  per-site blocklist (settings).
- Click handling is trivial (real elements) — the whole popover UX (F2) depends on this.
- Memory: one span per candidate; a 2,000-word article at 5k level yields ~40–120 spans —
  negligible.

## Alternatives considered

- **CSS Custom Highlight API**: zero DOM mutation, but highlights are paint-only — no
  pointer events, so click-to-popover is impossible without a parallel hit-testing layer;
  also no per-word styling hooks we need. Rejected.
- **innerHTML regex replace**: destroys event listeners and framework state. Rejected
  absolutely.
- **Canvas/overlay markers**: coordinate math breaks on scroll/zoom/reflow; fragile.

## Amendments

**2026-11-11 (PR-17, feat-2026-11-11-001).** Two changes to §Decision:

1. **Links are skipped** (`a` joins the skip-filter). Tag decorations over link styling
   mislead ("is this a link or an unknown word?"), and the document-level click
   delegation `preventDefault()`s on tagged words — a tagged word inside a link would
   hijack navigation. Lookups on linked words remain available through selection +
   context menu.
2. **Decoration placement is configurable** (`settings.tagStyle`:
   `underline | firstChar | none`). Each tag wraps its first character in
   `<span class="iw-f">` at tag time; statuses and passes set `--iw-decor-*` custom
   properties on `.iw-word` and placement rules apply them either to the whole span or
   to `.iw-f` only — switching styles is pure CSS (`<html data-iw-tag-style>`), no
   rewrap. `untag()` unwraps both levels, restoring pristine text nodes. Inside the
   reader's shadow root, `<html>`-attribute rules use `:host-context(html[attr])`
   (this also fixed a latent bug where the shadow pass rules used
   `:host-context(html)[attr]`, which matched nothing).
