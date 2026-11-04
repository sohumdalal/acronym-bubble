# Chrome Web Store Listing — Acronym Bubble

> Last Updated: 2026-11-04

Everything to paste into the Chrome Developer Dashboard, in the order it asks.
Upload `acronym-bubble.zip`, built by `npm run zip` (and checked by
`npm run check:zip`, which runs the end-to-end suite against that package).

Publish as **Unlisted** first: anyone with the link can install it, it is
still reviewed, but it is not in search, so a rough edge is not a public first
impression. Switch to Public when it has had some real use.

## Store Listing

**Extension Name**

```
Acronym Bubble
```

**Short Description** (122 of 132 characters; the same text is the manifest's description)

```
Rest the pointer on any abbreviation to see what it stands for in that text: API, TL;DR, e.g., imo. On web pages and PDFs.
```

**Detailed Description** (plain text; the store shows no Markdown)

```
Acronym Bubble shows what abbreviations stand for, right where you read them.

Rest the pointer on an abbreviation and a small bubble says what it stands for in that text: API is Application Programming Interface, TL;DR is Too Long; Didn't Read, and e.g. is exempli gratia, "for example". Move away and it goes.

FEATURES
• Meaning that fits the text: CI is Continuous Integration in a code review and Confidence Interval in a statistics paper.
• Every kind of abbreviation: capitals (API, SaaS), forms with dots or semicolons (e.g., TL;DR, Ph.D.) and lowercase chat forms (imo, lgtm).
• Uses the page's own definitions, such as "Customer Data Platform (CDP)", at once.
• Works in PDFs: they open in Acronym Bubble's own viewer, with a link to open them in Chrome's viewer instead.
• Works on web pages, in frames, in plain text and Markdown files, and on pages that load more as you scroll.
• A faint dotted underline shows which words have a bubble. Nothing else on the page changes.
• Light and dark bubbles, to match the page.
• "More" opens a web search for the abbreviation.

HOW TO USE
1. Open any page, paper or PDF.
2. Rest the pointer on an underlined word. While the page is still being read, the bubble shows a spinner, then the meaning.
3. Click the toolbar icon to turn it off for a site, change the underline, choose the model, or open bubbles only while you hold Option (Alt).
4. Press Alt+Shift+A to turn it on or off everywhere.

CHOOSE WHO READS THE PAGE
• On this computer (the default): Chrome's built-in AI model reads the text. Nothing is sent anywhere. Your computer must be able to run Chrome's built-in model; the popup offers the download if Chrome does not have it yet.
• Claude: paste your own Anthropic API key and Claude Haiku reads the text instead. It works on any computer and gives the best answers. The page text it reads is sent to Anthropic, and Anthropic bills your account for it.
Without either, only abbreviations the page defines itself get a bubble.

PRIVACY
Acronym Bubble has no accounts, no analytics and no servers. The developer receives none of your data. With the built-in model, page text stays on your computer. With Claude, page text goes only to Anthropic, under your own API key. Your key stays in this browser and is not synced. It skips form fields and anything you type.

PERMISSIONS
• "Read and change all your data on all websites": abbreviations are on any site you read, so the extension reads page text wherever you are. It adds only a faint underline and the bubble; it does not change page content. This access also lets the PDF viewer load the PDF you opened, and lets Claude mode reach Anthropic.

SUPPORT
Found a bug or a wrong meaning? Email dsohum@gmail.com or open an issue at https://github.com/sohumdalal/acronym-bubble/issues
```

**Category**

`Productivity`. If the dashboard asks for a sub-category, choose `Tools`.

**Single Purpose**

```
Shows what an abbreviation on a web page or PDF stands for when the user rests the pointer on it.
```

**Primary Language**

English

## Graphics & Assets

Made by `npm run shots` (`tools/listing/screenshots.js`): the real extension,
headless, on fictional pages in `tools/listing/pages/`. Re-run it when the UI
changes.

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | `icons/128.png` |
| Screenshot 1 | 1280×800 | ✅ Ready | `store/screenshots/01-docs.png` |
| Screenshot 2 | 1280×800 | ✅ Ready | `store/screenshots/02-pdf.png` |
| Screenshot 3 | 1280×800 | ✅ Ready | `store/screenshots/03-review.png` |
| Screenshot 4 | 1280×800 | ✅ Ready | `store/screenshots/04-popup.png` |
| Screenshot 5 | 1280×800 | ⬜ Not created | |
| Small Promo Tile | 440×280 | ✅ Ready | `store/promo-440x280.png` |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | Only needed if the store features it. |

### Screenshot Notes

1. **01-docs**: API docs, light. JWT's bubble open, the other abbreviations underlined.
2. **02-pdf**: a statistics paper in the PDF viewer. CI reads "Confidence Interval", in context.
3. **03-review**: a code review, dark. TL;DR's bubble open; imo, lgtm, e.g. and CI (here a build) underlined.
4. **04-popup**: the popup over the docs page, with Claude chosen.

The pages and the product in them (Lumen Pay) are fictional, so no other
company's name or logo appears. The headless browser has no built-in model,
so the meanings in the shots come from the e2e suite's stand-in for Claude,
given what Claude says for those pages. The bubbles, the viewer and the popup
are the real ones.

## Permissions Justification

Paste each into its field in the dashboard's Privacy tab.

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Keeps the user's settings (on or off, sites they turned it off for, underline style, how bubbles open, which model reads the page, whether PDFs open in its viewer) and, only if the user adds one, their own Anthropic API key, which is kept in local storage and never synced. |
| `webRequest` | permissions | Chrome's PDF viewer does not run extensions, so to show bubbles in PDFs the extension opens them in its own viewer. It reads only the response headers of top-level page loads to see which ones are PDFs (many PDF addresses do not end in .pdf). It does not block, change or record any request. |
| `webNavigation` | permissions | Moves a tab that is loading a PDF to the extension's PDF viewer once Chrome has started that navigation, and opens local .pdf files there. It reads only the main frame's committed address in that moment. |
| `<all_urls>` | host_permissions | The extension's single purpose is to explain abbreviations on whatever page the user reads, so its content script must read page text on any site, including in frames. Host access also lets the PDF viewer load the PDF the user opened (from its own address), and lets the optional Claude mode send page text to api.anthropic.com with the user's own key. |
| Content script on `<all_urls>`, all frames | content_scripts | Reads visible page text to find abbreviations and draws a faint underline (a CSS highlight; no page content is changed) and a bubble on hover. It skips form fields, editable text and code. |

**Remote code**: No. All JavaScript is in the package. The Anthropic API is
called for data only.

## Privacy & Data Use

The dashboard's data disclosure must match the code and `PRIVACY.md`.

### Data Collection

**Does the extension collect user data?** Yes, but only in Claude mode, which
the user turns on and which sends data to Anthropic, not to the developer.
With the default model, page text never leaves the computer.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | No | | No |
| Health info | No | No | | No |
| Financial info | No | No | | No |
| Authentication info | Yes, only if the user adds an Anthropic API key | Only to Anthropic, to authenticate the user's own requests | Claude mode | Anthropic only, as the user's own API provider |
| Personal communications | No | No | | No |
| Location | No | No | | No |
| Web history | No | No (the list of sites the user turned it off for is in Chrome sync storage) | | No |
| User activity | No | No | | No |
| Website content | Yes, only in Claude mode | Only to Anthropic: up to about 30,000 characters per page, plus the page title | Finding the abbreviations in the page and what they stand for | Anthropic only, to provide the feature |

In the dashboard, tick **Authentication information** and **Website
content**, and nothing else.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL**

```
https://github.com/sohumdalal/acronym-bubble/blob/main/PRIVACY.md
```

## Distribution

**Visibility**: Unlisted first, then Public
**Regions**: All regions

## Developer Info

**Publisher Name**: Sohum Dalal (check that it matches your developer account)

**Contact Email**: dsohum@gmail.com

**Support URL**: https://github.com/sohumdalal/acronym-bubble/issues

**Homepage URL**: https://github.com/sohumdalal/acronym-bubble

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 0.1.0 | 2026-11-04 | First release: bubbles for abbreviations on pages, frames, text files and PDFs; meanings from the page and from Chrome's built-in model or Claude Haiku with the user's key; light and dark. | Draft |

## Review Notes

### Test instructions for the reviewer

The reviewer's computer may not have Chrome's built-in model. Without it,
only abbreviations that a page defines itself get a bubble, and the review
can look broken. Paste this into the dashboard's test instructions field:

```
Without a built-in model, bubbles appear for abbreviations a page defines itself. To see this, open https://en.wikipedia.org/wiki/Customer_data_platform and rest the pointer on "CDP".

For full behavior, either use a computer that can run Chrome's built-in AI model (the popup shows "Chrome's built-in model reads the page"), or open the toolbar popup, choose Claude, paste the Anthropic API key below, and press Save. Then open any documentation page, paper or PDF and rest the pointer on an underlined abbreviation.

Test API key: <add a key with a low spend limit before submitting>
```

Before you submit, make an Anthropic API key just for the review, with a
low spend limit, and paste it in. Delete it when the review is done.

### Known Issues / Limitations

- Without Chrome's built-in model or a Claude key, only abbreviations the
  page defines itself get a bubble.
- Text inside shadow roots (some web components) is not read.
- XML and SVG files get no bubble. PDFs from a form submission, or inside a
  frame, stay in Chrome's viewer.
- A scanned PDF has no text to read.
- The answers from the built-in model were not checked in an automated test,
  because the test browser has no model. Check them on a computer that has it.

### Rejection History

None yet.
