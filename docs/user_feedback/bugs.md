# User-Reported Bugs — Raw Records

Immutable, append-only log of bug reports exactly as received, with a
timestamp and a stable ID (`bug-YYYY-MM-DD-NNN`). Never edit past entries.
Analysis and fixes live in [../sbfp_logs.md](../sbfp_logs.md).

---

## bug-2026-11-11-001 — e2e failure: reader article not tagged

**Recorded:** 2026-11-11 09:26 +0800
**Source:** user report (ZCode session)
**Status:** fixed — PR-8 (`pr/08-reader-e2e-flake`, PR #1)

**Raw report:**

> some e2e test failed when run `npm run test:e2e`, the logs:
>   ✗ launcher opens the reader with the extracted, tagged article
>     AssertionError [ERR_ASSERTION]: serendipity should be tagged in the reader
>     at file:///D:/Coding/immerseword/tests/e2e/reader.e2e.mjs:47:18
>     at async withHarness (file:///D:/Coding/immerseword/tests/e2e/harness.mjs:155:12)
>     at async Object.run (file:///D:/Coding/immerseword/tests/e2e/reader.e2e.mjs:19:7)

*(Entry recorded retroactively when this log was created; timestamp is the
report's arrival time in session.)*

---

## bug-2026-11-11-002 — context-menu lookup and double-click show no popover

**Recorded:** 2026-11-11 13:46 +0800
**Source:** user report (ZCode session)
**Status:** fixed — PR-12 (`pr/12-lookup-any-word`); see SBFP-002

**Raw report:**

> when I use the extension, it doesn't work when right click the selected
> word and select "Look up xxxx from ImmerseWord" from the right menu, there
> aren't any popup window displayed; and double clicking the word also
> doesn't work.

---

## bug-2026-11-11-003 — wrong lemmas: possessives, ing/ed forms, -ly adverbs

**Recorded:** 2026-11-11 14:10 +0800
**Source:** user report (ZCode session)
**Status:** fixed — PR-13 (`pr/13-lemma-quality`); see SBFP-003

**Raw report:**

> when I use the extension, I found it doesn't work correctly when there are
> something like "market's", "vendor's", and not work properly for
> "shaping"(should show the definition of shape, as it's the ing form of
> shape), "roughly"(should not show the definition of rough), "embedding"
> (should show definition of embedding or embed, but show it can't find the
> definition of embedd), and some mistakes likes:
> overstated -> overstat
> disgruntled -> disgruntl
> shaping -> shap


