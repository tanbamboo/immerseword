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
