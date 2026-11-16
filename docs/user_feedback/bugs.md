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

---

## bug-2026-11-11-004 — brands and domain names tagged as unknown words

**Recorded:** 2026-11-11 14:43 +0800
**Source:** user report (ZCode session)
**Status:** fixed — PR-14 (`pr/14-brand-domain-tagging`); see SBFP-004

**Raw report:**

> when I use the extension, I found it doesn't work correctly when process
> sentence like " hashes, external IPs, domains and URLs (VirusTotal,
> abuse.ch, AbuseIPDB, GreyNoise, urlscan.io)", it shouldn't tag
> VirusTotal, AbuseIPDB, GreyNoise, urlscan(contain in urlscan.io) as
> word, these are some product names, brands or domain names.

---

## bug-2026-11-11-005 — contractions tagged as unknown words

**Recorded:** 2026-11-11 15:04 +0800
**Source:** user report (ZCode session)
**Status:** fixed — PR-15 (`pr/15-contractions`); see SBFP-005

**Raw report:**

> and it still doesn't work correctly for "you're", "I'm", "you'll", I
> can't recognize them all

---

## bug-2026-11-11-006 — "core dictionary failed to load: Failed to fetch" on reload

**Recorded:** 2026-11-11 15:15 +0800
**Source:** user report (ZCode session, screenshot transcribed)
**Status:** fixed — PR-16 (`pr/16-core-load-retry`); see SBFP-006

**Raw report:**

> when I reload the extension, Google Chrome tell some errors, after click
> I got this, get a snapshot for the errors

**Error dialog (transcribed from the user's screenshot):**

> [ImmerseWord] core dictionary failed to load: TypeError: Failed to fetch
> `background/service-worker.js` (anonymous function) — 1 error

## bug-2026-11-12-001 — classifying a double-clicked common word never tags it

**Recorded:** 2026-11-12 17:06 +0800
**Source:** user report (ZCode session)
**Status:** fixed — PR-22 (`pr/22-tag-classified-common-words`); see SBFP-007

**Raw report:**

> after I double click to query the definition of a word which is not a
> candidate, the word is not been tagged, no matter I choose "Learning" or
> "Unknown". it should be tagged and underlined.

---

## bug-2026-11-16-001 — Pass 1 "faint candidate marks" setting never renders

**Recorded:** 2026-11-16 08:51 +0800
**Source:** code analysis finding (ZCode session); user approved filing it
**Status:** fixed — PR-23 (`pr/23-pass1-marks-selector`); see SBFP-008

**Raw report:**

> Project analysis found a stray bracket in the Pass 1 selector of
> `public/content/content.css`: `html[data-iw-pass="1"][data-iw-p1-marks]]`
> (extra `]` before ` span.iw-word`). The invalid selector is silently
> dropped by the browser, so the optional "faint candidate marks in Pass 1"
> setting (F6: Pass 1 behavior — hide tags vs. faint marks) never renders.
> *(Verification during fix traced the stray bracket to the generator
> itself — see SBFP-008: both the light DOM and the reader's shadow DOM
> were affected.)*


