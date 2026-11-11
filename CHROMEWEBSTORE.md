# Chrome Web Store Listing — ImmerseWord

> Last Updated: 2026-11-10

## Store Listing

**Extension Name** [REQUIRED]

ImmerseWord

**Short Description** [REQUIRED] (≤132 chars)

Read English pages in 3 passes: words beyond your level are tagged, tap them for English-only definitions, then reread for fluency.

**Detailed Description** [REQUIRED]

ImmerseWord turns any English web page into a structured reading lesson — without translations.

When you open an article, words rarer than your chosen level (top 2,000 / 5,000 / 10,000 / 20,000) are gently marked. Tap any marked word and a popover shows an English-only definition — pronunciation, part of speech, up to three senses with examples. Classify each word as Known, Learning, Unknown, or Ignore; the page updates instantly and every page you read afterwards gets quieter as your personal vocabulary grows.

The heart of the extension is the guided 3-pass reading method. Pass 1 (Gist): the page goes quiet so you read for overall meaning without stopping — tap only the words that truly block you. Pass 2 (Study): all your unknown words are marked; work through them with the dictionary popover. Pass 3 (Fluency): the page quiets down again — reread at full speed and see your session summary: time per pass, words looked up, and how many words you mastered.

Prefer a distraction-free view? One click opens the immersive reader: the clean article with adjustable type size, serif or sans-serif text, line width, and light, sepia, or dark themes. Your word tags, popovers, and reading passes follow you into the reader.

Your vocabulary and settings live on your device. The extension works offline for the most frequent words; for rare words it can query a free English dictionary service (api.dictionaryapi.dev), and you can switch that off for a fully offline experience. No accounts, no tracking, no page content leaves your browser.

How to use it:
1. After installing, click the ImmerseWord icon and choose your level.
2. Open any English article — rare words appear dotted.
3. Click a word for its English definition and classify it.
4. Start a 3-pass session from the side panel when you want structured reading.
5. Export your vocabulary any time from the settings page.

**Category** [REQUIRED]

Productivity

**Single Purpose** [REQUIRED]

Helps English learners read web pages by marking words beyond their vocabulary level and providing monolingual definitions and guided 3-pass reading sessions.

**Primary Language** [REQUIRED]

English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready (reuse) | `public/icons/icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 | ⬜ Not created — article with tagged words + popover open |
| Screenshot 2 [RECOMMENDED] | 1280×800 | ⬜ Not created — 3-pass pass pill + quieted page |
| Screenshot 3 [RECOMMENDED] | 1280×800 | ⬜ Not created — immersive reader, sepia theme |
| Screenshot 4 [RECOMMENDED] | 1280×800 | ⬜ Not created — side panel stats + vocabulary browser |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created |
| Marquee Promo Tile | 1400×560 | ⬜ Not created |

### Screenshot Notes

Capture on a real news/blog article (not the test fixture) with the extension loaded unpacked. Screenshot 1 must show the popover with an English-only definition — it communicates the core function in one glance. No annotations needed; the UI is self-explanatory.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Stores the user's personal vocabulary (words they marked known/learning/unknown), their settings, and dictionary lookups they already made — entirely on the device so tagging improves as they read. |
| `tabs` | permissions | The reading companion panel and the 3-pass session need to know which tab the user is reading (its URL, to bind the session, and its id, to exchange page statistics with that tab's content script). No browsing history is recorded or transmitted. |
| `sidePanel` | permissions | The reading companion (page statistics, word list, 3-pass session controls) is displayed in Chrome's side panel so it stays open while the user reads. |
| `contextMenus` | permissions | Adds "Look up '<selection>' with ImmerseWord" so users can look up any selected word without leaving the page, and "Immerse this page" to open the reader view. |
| `http://*/*`, `https://*/*` (host permissions) | host_permissions | The product's core function is marking unknown words directly on the web pages the user chooses to read, which requires running on arbitrary sites. The extension reads page text locally to find the words; page content is never sent anywhere. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No — nothing is collected. All user data (vocabulary, settings, lookup cache) stays in local browser storage on the device. Vocabulary/settings sync only through the user's own Chrome sync if they have it enabled.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | No | — | No |
| Health info | No | No | — | No |
| Financial info | No | No | — | No |
| Authentication info | No | No | — | No |
| Personal communications | No | No | — | No |
| Location | No | No | — | No |
| Web history | No | No | — | No |
| User activity | No | No | — | No |
| Website content | No | Only the single word the user taps, when it is missing from the bundled offline dictionary and online fallback is enabled: it is sent to api.dictionaryapi.dev as part of the lookup URL | Monolingual definition lookup | No (the dictionary API receives the word; nothing else) |

### Data Use Certification

- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]

`https://github.com/tanbamboo/immerseword/blob/main/docs/PRIVACY.md` — TODO before submission: publish `docs/PRIVACY.md` from this repository (draft content below) and verify the URL renders publicly.

Draft privacy-policy substance: ImmerseWord stores all learning data locally; makes requests only to api.dictionaryapi.dev for words the user explicitly looks up that are missing from the offline dictionary (disableable); contains no analytics, ads, or accounts.

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]

[tanbamboo — confirm display name before submission]

**Contact Email** [REQUIRED]

[TODO: publisher email]

**Support URL / Email** [RECOMMENDED]

https://github.com/tanbamboo/immerseword/issues

**Homepage URL** [RECOMMENDED]

https://github.com/tanbamboo/immerseword

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-11-10 | First release: unknown-word tagging with 5 frequency levels, monolingual dictionary (offline core + optional online fallback), personal vocabulary, guided 3-pass reading sessions with summaries, immersive reader with themes/typography, side-panel reading companion, data export/import. | Draft |

## Review Notes

### Known Issues / Limitations

- Tagging quality depends on the bundled corpus list; rare-but-known words may be flagged until the user classifies them (one click) — this is the intended learning loop.
- The bundled offline dictionary covers the ~10,000 most frequent lemmas; rarer words need the online fallback (clearly disclosed and disableable).
- Reader extraction follows Readability's heuristics; some heavily dynamic pages may not be extractable (the Immerse button simply doesn't appear).
- E2E tests run only against local fixture pages; store screenshots should be captured manually on real sites.

### Packaging Notes

- ZIP for submission must exclude `.git/`, `node_modules/`, `tests/`, `scripts/`, `docs/`, `CHROMEWEBSTORE.md`, and dev files — only the contents of `dist/` belong in the package.
- `manifest.json` contains a `key` pinning the development extension ID; keep it for stable dev IDs. After publishing, replace OAuth- or ID-dependent setup if any is added later (none today).

### Rejection History

| Date | Reason | Fix Applied | Resubmitted |
|------|--------|-------------|-------------|
