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
