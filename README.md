# Acronym Bubble

A Chrome extension for reading docs, papers and chat threads that assume you
know every abbreviation.

Rest the pointer on an abbreviation and a small bubble says what it stands
for, in this text: `API · Application Programming Interface`, `TL;DR · Too
Long; Didn't Read`, `e.g. · exempli gratia, for example`. **More ↗** opens a
Google search for it in a new tab. Move away and it goes.

Abbreviations it has read carry a faint dotted underline, so you can see
which words have a bubble. Nothing else on the page changes.

## Install

Not on the Chrome Web Store.

```bash
cd acronym-bubble
bun install
bun run build
```

Open `chrome://extensions`, turn on **Developer mode**, choose **Load
unpacked**, and pick this folder. Run `bun run build` again after you change
anything under `src/mova/` or `src/popup/`, then press the reload button on
the extension's card.

## Settings

Click the toolbar icon.

| Setting | Default | |
| --- | --- | --- |
| Acronym Bubble | On | Off everywhere. `⌥⇧A` (Alt+Shift+A) does the same, and the icon shows `OFF`. |
| This site | On | Off for the current site only. |
| Underline | Every | Every use, the first use of each acronym, or none. Hover works either way. |
| Open on | Hover | `⌥ + Hover` opens a bubble only while you hold Option (Alt). |
| Model | On-device | Which model reads the page: Chrome's built-in model, or Claude with your own Anthropic API key. See below. |
| Open PDFs here | On | PDFs open in Acronym Bubble's own viewer, so they get bubbles too. Off leaves them to Chrome. |

## Where meanings come from

There is no dictionary and no word list in the extension. Meanings come from:

1. **The page itself.** A page that writes `Customer Data Platform (CDP)`,
   `CDP (Customer Data Platform)` or `<abbr title="…">CDP</abbr>` gets its own
   meaning at once, marked *on this page*. This needs no model.
2. **The agent** (`src/agent/agent.js`), which reads the page's text in
   pieces of about 3,000 characters when the page is idle, up to 30,000
   characters a page. It says which abbreviations are there and what each
   one stands for in this text, marked *in context*: `CI` is Continuous
   Integration in a build log and Confidence Interval in a statistics paper.
   It finds every kind: capitals (`API`, `SaaS`), dots and semicolons
   (`e.g.`, `TL;DR`, `Ph.D.`) and lowercase chat forms (`imo`, `lgtm`).
   Further down a long page, or for text added later, resting on a word
   shaped like an abbreviation opens a bubble with a spinner until the agent
   has read the text around it.

Every answer is checked before it is shown: the words it says the letters
stand for must spell them (`Representational State Transfer` spells REST),
be two words or more, and the term must really be in the text. That drops
made-up answers and ordinary words.

### The two models

| Model | Where the text goes | Needs |
| --- | --- | --- |
| **On-device** (default) | Nowhere. Chrome's built-in model (Gemini Nano, through the [Prompt API](https://developer.chrome.com/docs/ai/prompt-api)) runs on this computer. | A computer that can run it. The popup offers the download if Chrome does not have it yet. |
| **Claude** | To Anthropic. Claude Haiku 5.5 (`claude-haiku-5-5`) reads the text through the Anthropic API. | Your own [Anthropic API key](https://platform.claude.com/), pasted in the popup. It stays in this browser's local storage and is not synced. You pay Anthropic for what it reads, at Haiku's rates. |

Without either, abbreviations the page does not define get no bubble.

Plurals fall back to the singular (`APIs` is `API`). Text written mostly in
capitals is skipped, since every word there is in capitals.

With the on-device model, nothing leaves the browser except the search you
click and, for a PDF, the viewer loading that same PDF again. With Claude,
the page text the agent reads also goes to Anthropic.

## How it works

See the code comments in `src/content.js` for the detail. In short:

- **No DOM changes.** The underline is a
  [CSS custom highlight](https://developer.mozilla.org/docs/Web/API/CSS_Custom_Highlight_API)
  over Ranges, and the hover reads the word under the pointer with
  `caretPositionFromPoint`. A page's own scripts never see a node of ours in
  its text. Needs Chrome 128 or later.
- **Lazy bubble.** The content script is plain JS and small. React and the
  bubble load from `dist/bubble.js` the first time a bubble opens, inside a
  shadow root, so the page's CSS and the bubble's CSS never meet. If that
  bundle fails to load, a plain bubble with the same words shows instead.
- **Skipped text:** `code`, `pre`, form fields, editable regions, SVG. A
  plain-text file (.txt, a raw .md, JSON) is one `pre` in the page Chrome
  builds for it, so there the `pre` is read.
- **PDFs:** Chrome's PDF viewer runs no content scripts, so the background
  worker watches for a tab whose response is a PDF (by its content type,
  because many PDF URLs do not end in `.pdf`) and moves it to
  `src/pdf/viewer.html`. There [PDF.js](https://mozilla.github.io/pdf.js/)
  (`pdfjs-dist` 4.10.38, Apache-2.0) draws each page and lays its text over
  it as real text, and the extension's own scripts read that text as on any
  page. Downloads, POST results and PDFs inside frames stay with Chrome.
  **Open in Chrome's viewer** in the viewer's bar opens that one load in
  Chrome's viewer instead.
- **Frames:** it runs in every frame, same-origin, cross-origin and
  `srcdoc`, and a bubble closes when the pointer leaves its frame.
- **Late text:** a MutationObserver scans what a page adds after load.

## Design

The components are [Mova](https://mova-ui.com)'s, as for every app in this
folder (see `../AGENTS.md`). The skin is not the shared Ferrari one: it is
[Unit Bubble](../unit-bubble)'s, so the two extensions look like a pair.

- The bubble is Mova's `QuestionTooltip` and the popup's choices are Mova's
  `SegmentedABTabs`, both from `@mova-ui/react` 0.4.6 (MIT), vendored in
  `src/mova/ui/`. Each file's header says what changed: the skin, props for
  the demo data, and placement over a word on someone else's page. The
  popup's on and off switches are Unit Bubble's iOS switch.
- The tokens are Unit Bubble's (`../unit-bubble/src/ui.css`) and live in one
  place, `src/mova/mova.css`: the system type stack, Apple's blue, 10px
  corners and a frosted card. Where a meaning came from (*on this page*,
  *in context*) is a small blue pill.
- While the agent reads, the bubble shows Mova's `AppleRadialSpinner`, and
  the popup's Claude key field is Mova's password-toggle field, both
  vendored in `src/mova/ui/` the same way.
- Light and dark are both designed. The bubble is white glass on a light
  page and graphite glass on a dark one; the extension reads the background
  behind the word to choose. The popup follows the system's light or dark
  setting.
- Spacing is in pixels, not rem, because a page's root font size is not
  ours to trust.

## Develop

```bash
bun run build      # dist/: the bubble, the popup, mova.css
npm test           # detection rules and answer checks, no browser
npm run e2e        # the real extension in Chromium; screenshots in test/shots/
npm run check      # all three
npm run check:zip  # the e2e suite against the unzipped store package
npm run icons      # rewrite icons/*.png
npm run zip        # a store-ready zip
```

## Testing

Three layers, as in Unit Bubble. All of them run headless; `HEADED=1` (e2e)
or `--headed` (scan) shows the browser.

1. **Rules, no browser.** `npm test` runs `test/find.test.js`: shapes,
   page definitions, plurals, shouting, the checks on every model answer,
   and that the source holds no word lists.
2. **End to end, local pages.** `npm run e2e` runs `test/e2e/run.js`: the
   real extension in Chromium against `test/e2e/sites/`, served with each
   file's real content type. The test browser has no built-in model, so the
   agent reads through its Claude path, pointed at a stand-in for the
   Anthropic API (`test/e2e/lib/fake-claude.js`) that answers from a small
   test lexicon: the real SDK calls run, with no key and no cost. Cases
   cover the agent (spinner, chat forms, wrong answers dropped, no model, a
   rejected key), docs, settings, light and dark, the popup, rendered and
   raw Markdown, frames, shadow roots, a single-page app, editors, a strict
   CSP and a 3000-paragraph page. `npm run e2e -- --only agent` runs the
   cases whose name contains "agent".
3. **Real sites.** The scanner in `tools/scan/`:
   - `npm run scan:discover` reads the sitemaps of the domains in
     `sites.txt` (docs, security, ML, science, medicine, business, news)
     and writes `urls.txt`.
   - `npm run scan` fetches every URL in `urls.txt` and `files.txt` without
     a browser and runs the extension's rules on the text. It reports how
     many words are shaped like abbreviations, how many the pages define
     themselves, and the most common ones left for the agent. It does not
     run the agent.
   - `npm run scan:browser -- --limit 25` loads the real extension on a
     sample and checks rules that must hold on any page: no element of ours
     in the page's text, no underline in code or a field, underlines where
     the page defines abbreviations, a bubble that opens on the first visible
     underline and stays in the window, and no errors of ours.

`files.txt` holds one fixed URL for each format and field: ambiguous
acronyms on Wikipedia, HTML specs, rendered and raw Markdown, an RFC as
plain text, JSON and a PDF.

### Format support

The e2e run ends with this matrix, and a format that starts or stops
working fails until its expectation changes.

| Format | Bubble | |
| --- | --- | --- |
| HTML page | Yes | |
| Rendered Markdown (GitHub, docs sites) | Yes | Code spans and fenced code are skipped. |
| Raw Markdown, plain text, JSON | Yes | |
| Local file (`file://`) | Yes | Unpacked. A store install needs **Allow access to file URLs** on the extension's card. |
| XML | No | Chrome's XML tree viewer has no page body. |
| SVG | No | Drawn text, not page text. |
| PDF | Yes | In Acronym Bubble's own viewer (PDF.js). |

## Known limits

- **Images and canvas** are not read. Text only.
- **Text inside shadow roots**, open or closed, is not read.
- **PDFs** open in Acronym Bubble's viewer, not Chrome's: no form filling,
  annotations or printing from the bar. Use **Open in Chrome's viewer** for
  those. A PDF behind a POST, or one inside a frame, stays in Chrome's
  viewer with no bubbles. A scanned PDF has no text to read.
- **XML and SVG files** get no bubble.
- **Context needs the model.** Without Chrome's on-device model (it needs
  a capable device and about 22 GB of free disk), an ambiguous acronym
  shows the tech meaning first and the others under *Also*.
- **Unknown acronyms** get no underline, to keep pages quiet. With the model
  they get a bubble on hover; without it, none.
