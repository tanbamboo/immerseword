# Chrome Web Store Listing — ImmerseWord

> Last Updated: 2026-11-19

## Published

**✅ v1.0.0 is live — published 2026-11-19.**

| | |
|---|---|
| **Item ID** | `ndfeogobbcfkmegldedocacdkkpoipgl` |
| **Listing** | https://chrome.google.com/webstore/detail/ndfeogobbcfkmegldedocacdkkpoipgl |
| **Item Name** | ImmerseWord |
| **Item Type** | extension |
| **Visibility** | Public |

The **store-assigned extension ID differs from the dev ID** (`dlolccjcdeapekdabdmjbonnmpninmoh`, derived from the pinned manifest key the e2e harness uses) — expected, since the uploaded package strips the dev `key` (SBFP-009). Nothing depends on the public ID; use the store link above for sharing.

**Known post-publish behavior:** users with Enhanced Safe Browsing see "This extension is not trusted by Enhanced Safe Browsing" on install — standard for every newly published extension whose developer has no store track record yet. It is not a policy flag; users can proceed via "Continue to install", and it fades as installs, ratings, and update history accumulate. No developer-side action exists (see [Google's help page](https://support.google.com/chrome_webstore/answer/2664769)).

**Publishing future versions:** the version bump is **maintainer-directed** (never bump automatically — AGENTS.md): on the maintainer's go, bump `version` in `public/manifest.json` + `package.json` → gates → `npm run package` → upload the new zip in the dashboard (new version row below) → submit. Never hand-zip `dist/` (SBFP-009). Interim test builds ship at the current version.

## Store Listing

**Extension Name** [REQUIRED]

ImmerseWord

**Short Description** [REQUIRED] (≤132 chars)

Read English pages in 3 passes: words beyond your level are tagged, tap them for English-only definitions, then reread for fluency.

**Detailed Description** [REQUIRED]

ImmerseWord turns any English web page into a structured reading lesson — without translations.

When you open an article, the page stays quiet: only words you're actively Learning and genuinely rare ones (beyond the top 20,000 words) are gently marked. Want to see every word beyond your chosen level (top 2,000 / 5,000 / 10,000 / 20,000)? Switch tag density to Full, or let the guided 3-pass method mark them for you during the Study pass. And any word at all is one double-click away from its definition. Tap a marked word and a popover shows an English-only definition — pronunciation, part of speech, up to three senses with examples, and synonyms from WordNet. Classify each word as Known, Learning, Unknown, or Ignore; the page updates instantly and every page you read afterwards gets quieter as your personal vocabulary grows.

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
| Store Icon [REQUIRED] | 128×128 PNG, 96×96 artwork + 16px transparent padding/side | ✅ Ready — regenerate with `npm run gen:icons` | `store/icons/store-icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 | ✅ Ready — BBC article, popover on "proliferation" from the offline dictionary, with definition + status buttons | `store/screenshots/screenshot-1-offline-1280x800.png` |
| Screenshot 2 [RECOMMENDED] | 1280×800 | ✅ Ready — 3-pass pass pill (Pass 1 Gist) + quieted page | `store/screenshots/screenshot-2-gist-1280x800.png` |
| Screenshot 3 [RECOMMENDED] | 1280×800 | ✅ Ready — immersive reader, sepia theme | `store/screenshots/screenshot-3-sepia-1280x800.png` |
| Screenshot 4 [RECOMMENDED] | 1280×800 | ⬜ Not created — side panel stats + vocabulary browser |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created |
| Marquee Promo Tile | 1400×560 | ⬜ Not created |

**Screenshot set** (dashboard allows up to 5; suggested upload order):

1. `screenshot-1-offline-1280x800.png` — popover, offline dictionary (REQUIRED slot 1)
2. `screenshot-2-study-1280x800.png` — Pass 2 pill, full tagging (most informative pass)
3. `screenshot-2-gist-1280x800.png` — Pass 1 pill, quieted page
4. `screenshot-3-sepia-1280x800.png` — immersive reader, sepia
5. `screenshot-3-dark-1280x800.png` — immersive reader, dark (theme range)

Alternates not in the top 5: `screenshot-1-online-1280x800.png` (popover sourced from the dictionaryapi.dev fallback), `screenshot-2-fluency-1280x800.png` (Pass 3 pill), `screenshot-3-light-1280x800.png`.

### Screenshot Notes

Screenshot 1 must show the popover with an English-only definition — it communicates the core function in one glance. No annotations needed; the UI is self-explanatory.

**Store icon ≠ manifest icons.** The dashboard upload follows the [store icon guidelines](https://developer.chrome.com/webstore/images#icons): 128×128 PNG whose square artwork occupies 96×96 with 16px of transparent padding per side (transparent padding keeps the store from auto-framing; artwork must read on light and dark backgrounds). Use `store/icons/store-icon-128.png`. The full-bleed `public/icons/icon-*.png` are *manifest* icons (inside the zip) — never upload those to the dashboard (uploading the old `icon-128.png` failed because it was actually 533×533, see `bug-2026-11-16-003`).

Screenshots live in `store/screenshots/` (NEVER in `public/` — `scripts/build.mjs` copies `public/` verbatim into `dist/` and store assets must not ship inside the extension package). Raw 2× captures (2560px wide, `*-@2x.png`) are retained alongside the exact-1280×800 uploads the dashboard requires; regenerate a final with `sips -z 800 1280 <raw> --out <final>`. All captures taken 2026-11-16 on BBC News with Chrome at a 1280×800 window (Retina 2×).

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
| Website content | No | Only the single word the user taps, when it is missing from the bundled offline dictionary and online fallback is enabled: it is sent to api.dictionaryapi.dev as part of the lookup URL; optionally, words both sources could not answer go to api.dictionaryapi.com (Merriam-Webster Learner's) — only when the user pasted their own API key in settings | Monolingual definition lookup | No (the dictionary APIs receive the word; nothing else) |

### Data Use Certification

- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]

`https://github.com/tanbamboo/immerseword/blob/main/docs/PRIVACY.md` — ✅ verified 2026-11-16: the repository is public and `docs/PRIVACY.md` is on `main`, so the URL renders for anyone.

Draft privacy-policy substance: ImmerseWord stores all learning data locally; makes requests only to api.dictionaryapi.dev for words the user explicitly looks up that are missing from the offline dictionary (disableable); contains no analytics, ads, or accounts.

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]

[Benjamin Tan]

**Contact Email** [REQUIRED]

[tanbamboo@gmail.com]

**Support URL / Email** [RECOMMENDED]

https://github.com/tanbamboo/immerseword/issues

**Homepage URL** [RECOMMENDED]

https://github.com/tanbamboo/immerseword

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-11-19 | First release. **Note:** the uploaded package was the build from just after the `key`-stripping fix (SBFP-009) — it predates the icon regeneration (SBFP-010), synonyms, definition links, stacked navigation, and quiet tagging. | **Published** |
| 1.0.3 | 2026-11-26 | Optional Merriam-Webster Learner's Dictionary: paste your free API key (dictionaryapi.com) in settings and a "Learner's dictionary" section shows alongside the offline definition — full-sentence, learner-friendly definitions displayed simultaneously, Apple-Dictionary-style. (1.0.4/1.0.5 were internal iterations of this feature, never uploaded.) | Pending upload |
| 1.0.2 | 2026-11-24 | Non-English words are never tagged: unlisted words now validate against the bundled WordNet lexicon (77,561 lemmas, offline). | Pending upload |
| 1.0.1 | 2026-11-23 | Quiet tagging default (Learning/Unknown + beyond-corpus words; Study pass elevates to the full band; "Tag density" setting keeps legacy marking). Synonyms row in the popover (WordNet synsets, offline). Tappable rare words inside definitions + double-click any word in the popover + stacked lookups with ‹ Back. Larger headword. Correct-size manifest icons (16/48/128 px). | Pending upload |

## Review Notes

### Known Issues / Limitations

- Tagging quality depends on the bundled corpus list; rare-but-known words may be flagged until the user classifies them (one click) — this is the intended learning loop.
- The bundled offline dictionary covers the ~10,000 most frequent lemmas; rarer words need the online fallback (clearly disclosed and disableable).
- Reader extraction follows Readability's heuristics; some heavily dynamic pages may not be extractable (the Immerse button simply doesn't appear).
- E2E tests run only against local fixture pages; store screenshots should be captured manually on real sites.

### Packaging Notes

- Build the submission artifact with **`npm run package`** (never zip `dist/` by
  hand): it stages `dist/`, strips the `key` member from the staged manifest —
  the dashboard rejects any upload containing `key` (`bug-2026-11-16-002`) —
  and writes `immerseword-<version>.zip` at the repo root. The zip contains
  only extension files (no `.git/`, `node_modules/`, `tests/`, `scripts/`,
  `docs/`, `store/`).
- `public/manifest.json` pins a dev `key` for a stable unpacked-load ID (the
  e2e harness depends on it); it must stay. Consequence: after publishing,
  the **store-assigned extension ID will differ from the dev ID** — nothing
  today depends on the public ID (no OAuth, no hardcoded extension URLs).

### Rejection History

| Date | Reason | Fix Applied | Resubmitted |
|------|--------|-------------|-------------|
