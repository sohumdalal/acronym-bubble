# Privacy policy — Acronym Bubble

_Last updated: 4 November 2026_

Acronym Bubble shows what abbreviations stand for on the pages you read. It
has no accounts, no analytics, no telemetry and no servers of its own. We,
the developer, receive none of your data.

## What it reads

The extension reads the visible text of the pages, frames and PDFs you open,
in your browser, to find abbreviations and show their meaning. It skips form
fields, text you are typing, and code blocks.

## Who reads the text: your choice of model

You choose the model in the toolbar popup.

- **On-device (the default).** Chrome's built-in model reads the text on
  your computer. The text is not sent anywhere. If Chrome does not have the
  model yet, the popup offers to download it; Chrome downloads it from
  Google, as it does for any built-in feature.
- **Claude.** If you choose Claude and paste your own Anthropic API key, the
  extension sends the page text it reads to Anthropic's API, so Claude Haiku
  can say which abbreviations it holds. It sends up to about 30,000
  characters of each page, in pieces, plus the page title, and the text
  around a word you rest the pointer on. It does not send the page's
  address, your browsing history, or anything about you. Like any web
  request, each one also carries your IP address and the browser and system
  details that Anthropic's software library adds. Anthropic handles
  that text under its own terms and privacy policy
  (https://www.anthropic.com/legal/privacy), as for any use of your API key.
  Requests are billed to your Anthropic account.

## What it stores

On your own device only:

- **Your settings**: on or off, the sites you turned it off for, the
  underline style, how bubbles open, the model, and whether PDFs open in its
  viewer. These are in Chrome's `storage.sync`, so Chrome may sync them
  between your own signed-in browsers through your Google account. That is
  Chrome's sync; we never see it.
- **Your Anthropic API key**, if you add one, and whether Anthropic last
  accepted it. These are in `storage.local`, on this computer only, and are
  not synced. The key is sent only to Anthropic, to authenticate your
  requests.
- **Answers already given**, held in memory while the extension runs, so the
  same text is not read twice. They are gone when the browser closes.

## Other network requests

- **More ↗** in a bubble opens a Google search for the abbreviation and its
  meaning, in a new tab, only when you click it.
- **PDFs** open in the extension's own viewer, which loads the PDF again
  from the same address your tab was opening.

There are no other requests.

## What it never does

- Collect, sell or share your data, or send it to the developer
- Send page text anywhere when you use the on-device model
- Load or run code from the internet; all of its code ships in the package
- Show ads or change the content of the pages you read

## Permissions, and why

| Permission | Why |
| --- | --- |
| Access to all sites | Abbreviations are on any site you read, so the extension reads page text wherever you are. It also lets the PDF viewer load the PDF you opened, and lets Claude mode reach Anthropic's API. |
| `storage` | To keep your settings, and your API key if you add one. |
| `webRequest` | To see that a tab is loading a PDF, by its content type, so it can open in the extension's viewer. It only reads response headers; it blocks and changes nothing. |
| `webNavigation` | To move that tab to the PDF viewer once the PDF starts to load. |

## Removing it

Remove the extension from `chrome://extensions`. Chrome deletes its settings,
the stored key and everything else it kept. To stop Claude mode alone, choose
On-device in the popup, or clear the key field and save.

## Changes

If this policy changes, the new version is published at this address with a
new date, and the change is listed in the extension's release notes.

## Contact

Questions about privacy: dsohum@gmail.com, or an issue at
https://github.com/sohumdalal/acronym-bubble/issues.
