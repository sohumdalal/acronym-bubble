# Acronym Bubble

A Chrome extension for reading docs and tech sites that assume you know every
acronym.

Rest the pointer on an acronym and a small bubble says what it stands for:
`API · Application Programming Interface`. **More ↗** opens a Google search
for it in a new tab. Move away and it goes.

Known acronyms carry a faint dotted underline, so you can see which words
have a bubble. Nothing else on the page changes.

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
| Meaning from context | On | Chrome's on-device model picks the meaning that fits the text. Turning it on starts the model download if Chrome does not have it yet. |

## Where meanings come from

In this order:

1. **The page itself.** A page that writes `Customer Data Platform (CDP)`,
   `CDP (Customer Data Platform)` or `<abbr title="…">CDP</abbr>` gets its own
   meaning, marked *on this page*. This is how in-house acronyms work.
2. **The bundled dictionary**, `src/dict.js`: about 800 acronyms from
   software, cloud, security, networking, data and AI, and the business terms
   that show up in tech docs. Where an acronym has more than one common
   meaning, the bubble lists the others under *Also*.

3. **The text around it**, read by Chrome's on-device model (Gemini Nano,
   through the [Prompt API](https://developer.chrome.com/docs/ai/prompt-api)).
   For an acronym with more than one meaning, the bubble opens with the
   dictionary's first meaning and switches to the one that fits, marked
   *in context*: `CI` is Continuous Integration in a build log and Confidence
   Interval in a psychology paper. For an all-caps acronym the dictionary does
   not have, the bubble opens once the model answers, marked *best guess*. A
   new meaning is used only if its words spell the acronym. The model runs on
   the device, so this sends nothing anywhere either. Without the model, the
   dictionary order stands.

Plurals fall back to the singular (`APIs` is `API`). An acronym that is also
an English word (`IT`, `US`, `OR`) is skipped inside all-caps text, where it
is just a word.

Nothing leaves the browser. There are no network requests except the search
you click.

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
  *in context*, *best guess*) is a small blue pill.
- Light and dark are both designed. The bubble is white glass on a light
  page and graphite glass on a dark one; the extension reads the background
  behind the word to choose. The popup follows the system's light or dark
  setting.
- Spacing is in pixels, not rem, because a page's root font size is not
  ours to trust.

## Develop

```bash
bun run build      # dist/: the bubble, the popup, mova.css
npm test           # detection rules and dictionary shape, no browser
npm run e2e        # the real extension in Chromium; screenshots in test/shots/
npm run check      # all three
npm run icons      # rewrite icons/*.png
npm run zip        # a store-ready zip
```

## Testing

Three layers, as in Unit Bubble. All of them run headless; `HEADED=1` (e2e)
or `--headed` (scan) shows the browser.

1. **Rules, no browser.** `npm test` runs `test/find.test.js`: tokens,
   page definitions, plurals, shouting, the model's answer checks, and the
   dictionary's shape.
2. **End to end, local pages.** `npm run e2e` runs `test/e2e/run.js`: the
   real extension in Chromium against `test/e2e/sites/`, served with each
   file's real content type. Cases cover docs, settings, light and dark,
   the popup, rendered and raw Markdown, frames, shadow roots, a single-page
   app, editors, a strict CSP and a 3000-paragraph page. `npm run e2e --
   --only frames` runs the cases whose name contains "frames".
3. **Real sites.** The scanner in `tools/scan/`:
   - `npm run scan:discover` reads the sitemaps of the domains in
     `sites.txt` (docs, security, ML, science, medicine, business, news)
     and writes `urls.txt`.
   - `npm run scan` fetches every URL in `urls.txt` and `files.txt` without
     a browser and runs the extension's rules on the text. It reports how
     many acronyms are explained, which are ambiguous, and the most common
     unknown ones: the list to grow the dictionary from.
   - `npm run scan:browser -- --limit 25` loads the real extension on a
     sample and checks rules that must hold on any page: no element of ours
     in the page's text, no underline in code or a field, underlines where
     there are known acronyms, a bubble that opens on the first visible
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
| PDF | No | Chrome's PDF viewer runs no content scripts. |

## Known limits

- **Images and canvas** are not read. Text only.
- **Text inside shadow roots**, open or closed, is not read.
- **PDFs** get no bubble: Chrome's PDF viewer runs no content scripts.
  Supporting them means opening PDFs in a viewer of our own.
- **XML and SVG files** get no bubble.
- **Context needs the model.** Without Chrome's on-device model (it needs
  a capable device and about 22 GB of free disk), an ambiguous acronym
  shows the tech meaning first and the others under *Also*.
- **Unknown acronyms** get no underline, to keep pages quiet. With the model
  they get a bubble on hover; without it, none.
