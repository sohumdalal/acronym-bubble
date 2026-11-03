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

## Where meanings come from

In this order:

1. **The page itself.** A page that writes `Customer Data Platform (CDP)`,
   `CDP (Customer Data Platform)` or `<abbr title="…">CDP</abbr>` gets its own
   meaning, marked *on this page*. This is how in-house acronyms work.
2. **The bundled dictionary**, `src/dict.js`: about 800 acronyms from
   software, cloud, security, networking, data and AI, and the business terms
   that show up in tech docs. Where an acronym has more than one common
   meaning, the bubble lists the others under *Also*.

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
- **Skipped text:** `code`, `pre`, form fields, editable regions, SVG.
- **Late text:** a MutationObserver scans what a page adds after load.

## Design

The design system is [Mova](https://mova-ui.com), skinned with a little
Ferrari, as for every app in this folder (see `../AGENTS.md`).

- The bubble is Mova's `QuestionTooltip` and the popup's controls are Mova's
  `SegmentedABTabs`, both from `@mova-ui/react` 0.4.6 (MIT), vendored in
  `src/mova/ui/`. Each file's header says what changed: the skin, square
  corners, props for the demo data, and placement over a word on someone
  else's page.
- The tokens come from the shared Ferrari file, linked here as `DESIGN.md`,
  and live in one place, `src/mova/mova.css`: the palette, Inter, sharp
  corners and hairlines, and Rosso Corsa for the one small mark on the
  bubble.
- The bubble is dark on both light and dark pages, as Mova's tooltip is:
  near-black on a light page, lifted grey on a dark one. The extension reads
  the background behind the word to choose. The popup follows the system's
  light or dark setting.
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

## Known limits

- **Images and canvas** are not read. Text only.
- **Web components with closed shadow roots** hide their text from the hover.
- **One meaning first.** For an ambiguous acronym the bubble shows the tech
  meaning first and the others under *Also*; it does not guess from context
  unless the page defines the term.
- **Unknown acronyms** get no bubble and no underline, to keep pages quiet.
  Select the word and search, as before.
