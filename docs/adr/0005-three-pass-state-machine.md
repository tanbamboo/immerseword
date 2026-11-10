# ADR-0005: 3-pass reading mode — per-tab session state machine

**Status:** Accepted · **Date:** 2026-11-10

## Context

The 3-pass method (gist → study → fluency) is the product's pedagogical spine. It needs a
session concept: which pass am I in on *this* article, what changed between passes, and
what did I learn? Sessions must survive service-worker restarts (MV3 SWs die after ~30 s
idle) but not outlive the browser.

## Decision

**One session per tab, stored in `chrome.storage.session`, keyed by tab id:**

```
Session {
  tabId, url, startedAt,
  pass: 1 | 2 | 3 | 'done',
  history: [{ pass, enteredAt, exitedAt? }],
  stats: { lookups, byStatus: { known, learning, unknown, ignored } }
}
```

- **Owner**: the service worker (single writer); content script and side panel receive
  state and state-change broadcasts (`SESSION_UPDATED` to the tab + panel refresh via
  `storage.onChanged`).
- **Transitions** (strictly linear): 1→2→3→done, plus `reset` (any → none). The side
  panel and pass pill both call `POST transition`; the SW validates, writes, broadcasts.
- **Rendering contract** — the content script derives styling purely from
  `(pass, per-word status)`:

  | Word state | Pass 1 | Pass 2 | Pass 3 |
  |---|---|---|---|
  | candidate | hidden* | dotted amber | hidden |
  | unknown | faint dot | amber underline | faint dot |
  | learning | faint dot | blue underline | faint dot |
  | known/ignored | none | none | none |

  \* "hidden" = `iw-p1-hide` class (no visual); tap-any-word still works and flags the
  tapped word `unknown` (Pass 1's only vocabulary action — "flag blockers").
  Configurable: Pass 1 can show faint marks instead of hiding.
- **Completion**: entering `done` freezes stats and shows the session summary (side panel
  card + popover-sized toast on page). Tab close or navigation → session discarded
  (`chrome.tabs.onRemoved`, URL change detected by content script init handshake).
- **No session?** Tagging still works (drive-by mode, PRD §5.3) with Pass 2-equivalent
  rendering. Sessions are an enhancement, not a prerequisite.

## Consequences

- `chrome.storage.session` is cleared on browser close and survives SW restarts — exactly
  the session semantics we want; no cleanup jobs.
- Same article in two tabs = two independent sessions (intended: parallel reading).
- Back-navigation re-sessions per URL via the init handshake — sessions don't resurrect.

## Alternatives considered

- **State in content-script memory**: dies on SPA soft-navs and reloads; two UIs (pill +
  panel) would need syncing. Rejected.
- **State in `storage.local`**: sessions would persist across browser restarts, turning
  ephemeral reading state into durable data requiring GC. Rejected.
- **Non-linear pass order** (free jumping): pedagogically counterproductive — the method
  is a progression. Rejected.
