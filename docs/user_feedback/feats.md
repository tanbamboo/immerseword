# User-Requested Features — Raw Records

Immutable, append-only log of feature requests exactly as received, with a
timestamp and a stable ID (`feat-YYYY-MM-DD-NNN`). Never edit past entries.
Analysis and implementation live in [../sip_logs.md](../sip_logs.md).

---

## feat-2026-11-11-001 — don't tag inside links; configurable tag underline style

**Recorded:** 2026-11-11 15:36 +0800
**Source:** user request (ZCode session)
**Status:** implemented — PR-17 (`pr/17-link-untouched-tag-style`); see SIP-001

**Raw request:**

> when I use the extension, I found it doesn't work correctly when it
> process links, it shouldn't change anything for the links. It's
> misleading to visualize links as a tagged word. Maybe only underlining
> the first charactor of the tagged word is better. please give user a
> choice in extension settings.

## feat-2026-11-12-001 — record the sentence where a Learning word was met; show recent ones

**Recorded:** 2026-11-12 15:07 +0800
**Source:** user request (ZCode session)
**Status:** implemented — PR-18 (`pr/18-learning-example-sentences`); see SIP-002

**Raw request:**

> when I use the extension, after I exposed to a new word(Learning
> status), I want it to record the surrounding sentence around the word
> as an example in my personal language lifecycle. And I also want to
> show the sentences one by one(maybe limit to 3 recently) which I met
> before.

## feat-2026-11-12-002 — "+" button to record exposures; wider popover; highlighted word in examples

**Recorded:** 2026-11-12 15:42 +0800
**Source:** user request (ZCode session)
**Status:** implemented — PR-19 (`pr/19-example-plus-button`); see SIP-003

**Raw request:**

> as user can only click "Learning" button once, please add another "+"
> button after the word in the popover window to record the word and
> context exposure. and the width of the popover window should be
> increased to display example sentences. and in the example sentences,
> the word should be highlighted.

## feat-2026-11-12-003 — popover width: 480 px default and a settings choice; "+" after the IPA

**Recorded:** 2026-11-12 16:14 +0800
**Source:** user request (ZCode session)
**Status:** implemented — PR-20 (`pr/20-popover-width-setting`); see SIP-004

**Raw request:**

> popover window is still not wide enough, maybe increase to 480 px? or we
> can let user make the choice in settings, such as 3 options(320px, 480px,
> 640px)? and the "+" button should after the IPA when it's availble.

---

## feat-2026-11-16-001 — show synonyms in the popover, like an English thesaurus

**Recorded:** 2026-11-16 14:51 +0800
**Source:** user request (ZCode session)
**Status:** implemented — PR-28 (`pr/28-synonyms`); see SIP-005

**Raw request:**

> when I use the extension, can it also display the synonyms of the word?
> like 'English Thesaurus' dictionary


---

## feat-2026-11-16-002 — synonyms as plain words, not tag-style chips

**Recorded:** 2026-11-16 16:05 +0800
**Source:** user request (ZCode session)
**Status:** implemented — PR-29 (`pr/29-synonym-style`); see SIP-006

**Raw request:**

> the display of synonyms is bad, maybe bold or underline when hover
> over, just not display them as tags.

---

## feat-2026-11-17-001 — tap words inside definitions to chain lookups

**Recorded:** 2026-11-17 09:37 +0800
**Source:** user request (ZCode session)
**Status:** implemented — PR-30 (`pr/30-definition-links`); see SIP-007

**Raw request:**

> when I lookup the word "copiously", I got "adverb, In a copious
> manner", but I still can't comprehend the meaning. maybe should let me
> click on the "copious" to lookup the definition of it.

---

## feat-2026-11-17-002 — restrictive link rules; dblclick any popover word; stacked popover with Back

**Recorded:** 2026-11-17 10:38 +0800
**Source:** user request (ZCode session)
**Status:** implemented — PR-31 (`pr/31-link-rules-popover-stack`); see SIP-008

**Raw request:**

> never create links for "A" or "O", it's silly. there should be
> restrictive rules to recommend a candidate. and user can always double
> click a word to lookup the definition. and when click a candidate word
> or double click any word on the popover window, the new popover window
> should float over the original, and there should be a "back" button,
> click it can "back" to the original one.

---

## feat-2026-11-18-001 — larger lookup word in the popover

**Recorded:** 2026-11-18 08:59 +0800
**Source:** user request (ZCode session)
**Status:** implemented — PR-32 (`pr/32-lemma-size`); see SIP-009

**Raw request:**

> in the popover window, please increase the font size of the lookup
> word.
