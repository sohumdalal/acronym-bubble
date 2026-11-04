#!/usr/bin/env node
// The Chrome Web Store images: four 1280×800 screenshots and the 440×280
// promo tile, written to store/. The real extension, headless, on the
// fictional pages in tools/listing/pages/.
//
//   npm run shots
//
// The test browser has no built-in model, so the agent reads through its
// Claude path against the stand-in server from the e2e suite, given the
// correct meanings for each page below. What the screenshots show is the
// real bubble, popup and PDF viewer, with the meanings Claude gives for
// these pages.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { launch, open, hover, answered } = require('../../test/e2e/lib/harness.js');
const { serve } = require('../../test/e2e/lib/server.js');
const { fakeClaude } = require('../../test/e2e/lib/fake-claude.js');

const OUT = path.join(__dirname, '..', '..', 'store');
const SHOTS = path.join(OUT, 'screenshots');
const ICON = path.join(__dirname, '..', '..', 'icons', '128.png');
const SIZE = { width: 1280, height: 800 };

// What each page's abbreviations stand for there. CI is a build check in
// the review thread and an interval in the paper.
const PAGES = {
  docs: {
    API: ['Application Programming Interface'],
    CDN: ['Content Delivery Network'],
    HTTPS: ['Hypertext Transfer Protocol Secure'],
    IdP: ['Identity Provider'],
    JWT: ['JSON Web Token'],
    REST: ['Representational State Transfer'],
    SLA: ['Service Level Agreement'],
    SSO: ['Single Sign-On'],
  },
  paper: {
    ANOVA: ['Analysis of Variance'],
    CI: ['Confidence Interval'],
    SD: ['Standard Deviation'],
  },
  thread: {
    CI: ['Continuous Integration'],
    'TL;DR': ["Too Long; Didn't Read"],
    'e.g.': ['exempli gratia', 'for example'],
    imo: ['In My Opinion'],
    lgtm: ['Looks Good To Me'],
  },
};

async function scene(ab, site, name, lexicon) {
  const claude = await fakeClaude({ delay: 200, lexicon });
  await ab.local({ claudeKey: 'listing', claudeBaseUrl: claude.url, agentError: '' });
  return claude;
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const site = await serve(path.join(__dirname, 'pages'));
  const ab = await launch();
  // CSS pixels: the store wants exactly 1280×800, and the harness draws at 2×.
  const shoot = (page, file) => page.screenshot({ path: path.join(SHOTS, file), scale: 'css' });

  // 1. API docs, light.
  let claude = await scene(ab, site, 'docs', PAGES.docs);
  let page = await open(ab, site.url('docs.html'), { settle: 2500 });
  await page.setViewportSize(SIZE);
  await hover(page, 'JWT', { selector: '#p1' });
  await answered(page);
  await shoot(page, '01-docs.png');
  const backdrop = await page.screenshot({ scale: 'css' });
  await page.close();
  claude.close();

  // 2. A statistics paper in the PDF viewer: CI in context.
  claude = await scene(ab, site, 'paper', PAGES.paper);
  page = await open(ab, site.url('paper.pdf'), { settle: 3500 });
  await page.setViewportSize(SIZE);
  await page.waitForTimeout(800);
  await hover(page, 'CI', { selector: '.textLayer' });
  await answered(page);
  await shoot(page, '02-pdf.png');
  await page.close();
  claude.close();

  // 3. A code review, dark: TL;DR, imo, lgtm, and CI as a build.
  claude = await scene(ab, site, 'thread', PAGES.thread);
  page = await open(ab, site.url('thread.html'), { settle: 2500 });
  await page.setViewportSize(SIZE);
  await hover(page, 'TL;DR', { selector: '#tldr' });
  await answered(page);
  await shoot(page, '03-review.png');
  await page.close();
  claude.close();

  // 4. The popup, over the docs page. Opened as a tab, the popup would not
  // know the page behind it, so the tab it asks about is the docs site.
  const popup = await ab.context.newPage();
  await popup.addInitScript(() => {
    const query = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = async (q) => ((await query(q)).length ? [{ url: 'https://docs.lumenpay.dev/authentication' }] : []);
  });
  await popup.setViewportSize({ width: 268, height: 600 });
  await popup.goto(`chrome-extension://${ab.id}/src/popup/popup.html`);
  await popup.waitForTimeout(800);
  const height = await popup.evaluate(() => document.body.scrollHeight);
  const card = await popup.screenshot({ clip: { x: 0, y: 0, width: 268, height } });
  await popup.close();

  const browser = await chromium.launch();
  const compose = await browser.newPage({ viewport: SIZE });
  const data = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
  await compose.setContent(`<body style="margin:0;width:1280px;height:800px;overflow:hidden;position:relative">
    <img src="${data(backdrop)}" style="position:absolute;inset:0;width:1280px;height:800px;filter:brightness(.92)">
    <img src="${data(card)}" style="position:absolute;top:24px;right:32px;width:268px;border-radius:10px;
      box-shadow:0 1px 2px rgba(0,0,0,.08),0 18px 48px -8px rgba(0,0,0,.35);border:1px solid rgba(0,0,0,.08)">
  </body>`);
  await compose.waitForTimeout(300);
  await compose.screenshot({ path: path.join(SHOTS, '04-popup.png') });

  // The small promo tile.
  const tile = await browser.newPage({ viewport: { width: 440, height: 280 } });
  await tile.setContent(`<body style="margin:0;width:440px;height:280px;display:flex;flex-direction:column;justify-content:center;
      padding:0 36px;box-sizing:border-box;background:linear-gradient(160deg,#ffffff 0%,#eef4ff 100%);
      font-family:-apple-system,system-ui,sans-serif;color:#0b0b0c;-webkit-font-smoothing:antialiased">
    <div style="display:flex;align-items:center;gap:14px">
      <img src="${data(fs.readFileSync(ICON))}" style="width:56px;height:56px">
      <div style="font-size:30px;font-weight:600;letter-spacing:-0.02em">Acronym Bubble</div>
    </div>
    <div style="margin-top:18px;font-size:19px;line-height:1.35;color:rgba(11,11,12,.62)">Rest on any abbreviation.<br>See what it stands for, here.</div>
    <div style="margin-top:20px;display:flex;gap:8px;font-size:13px;font-weight:500">
      ${['API', 'TL;DR', 'e.g.', 'imo'].map((t) => `<span style="background:#007aff;color:#fff;border-radius:999px;padding:3px 10px">${t}</span>`).join('')}
    </div>
  </body>`);
  await tile.screenshot({ path: path.join(OUT, 'promo-440x280.png') });

  await browser.close();
  await ab.close();
  site.close();
  console.log(`Written to ${path.relative(process.cwd(), OUT)}/`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
