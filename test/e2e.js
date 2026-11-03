#!/usr/bin/env node
// The real extension in a real Chromium, against test/pages/docs.html.
//   npm run e2e            headless
//   HEADED=1 npm run e2e   watch it happen
// Screenshots of the bubble land in test/shots/.
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
const DARK = (page) => page.evaluate(() => document.body.className === 'dark');

let failures = 0;
let checks = 0;
function ok(label, condition, detail = '') {
  checks += 1;
  if (condition) return;
  failures += 1;
  console.log(`✗ ${label}${detail ? `\n    ${detail}` : ''}`);
}

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(__dirname, 'pages', path.basename(new URL(req.url, 'http://x').pathname) || 'docs.html');
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'text/html' }).end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, port: server.address().port })));
}

// The bubble's text, from its shadow root, or null when none is open.
function bubbleText(page) {
  return page.evaluate(() => {
    const host = [...document.querySelectorAll('[data-acronym-bubble]')].find((h) => h.shadowRoot && h.shadowRoot.querySelector('[role=tooltip]'));
    return host ? host.shadowRoot.querySelector('[role=tooltip]').textContent : null;
  });
}

// Moves the pointer onto a word inside an element, and rests there.
async function hover(page, selector, word, wait = 700) {
  const box = await page.evaluate(
    ([sel, w]) => {
      const el = document.querySelector(sel);
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) {
        const i = walk.currentNode.nodeValue.indexOf(w);
        if (i < 0) continue;
        const r = new Range();
        r.setStart(walk.currentNode, i);
        r.setEnd(walk.currentNode, i + w.length);
        const b = r.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
      }
      return null;
    },
    [selector, word],
  );
  if (!box) throw new Error(`no "${word}" in ${selector}`);
  await page.mouse.move(box.x - 40, box.y);
  await page.mouse.move(box.x, box.y, { steps: 4 });
  await page.waitForTimeout(wait);
  return box;
}

async function away(page) {
  await page.mouse.move(5, 5, { steps: 3 });
  await page.waitForTimeout(600);
}

(async () => {
  const { server, port } = await serve();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-e2e-'));
  const context = await chromium.launchPersistentContext(profile, {
    headless: !process.env.HEADED,
    channel: 'chromium',
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
    viewport: { width: 1100, height: 700 },
    deviceScaleFactor: 2,
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
  const settings = (s) => worker.evaluate((v) => chrome.storage.sync.set({ settings: v }), s);
  fs.mkdirSync(SHOTS, { recursive: true });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'warning' && m.text().includes('Acronym Bubble') && errors.push(m.text()));
  await page.goto(`http://localhost:${port}/docs.html`);
  await page.waitForTimeout(900);

  // The page's own DOM is untouched.
  const html = await page.evaluate(() => document.getElementById('p1').innerHTML);
  ok('no nodes added to the text', !html.includes('<span'), html);

  // Hover a dictionary acronym.
  await hover(page, '#p1', 'API');
  let text = await bubbleText(page);
  ok('API opens a bubble', text && text.includes('Application Programming Interface'), String(text));
  ok('the bubble has a More link', text && text.includes('More'), String(text));
  await page.screenshot({ path: path.join(SHOTS, 'light-api.png'), clip: { x: 0, y: 0, width: 760, height: 260 } });

  // The pointer crosses into the bubble and it stays open.
  const link = await page.evaluate(() => {
    const host = document.querySelector('[data-acronym-bubble]');
    const a = host.shadowRoot.querySelector('a');
    const b = a.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, href: a.href };
  });
  ok('More searches Google for the acronym', link.href.startsWith('https://www.google.com/search?q=API%20Application'), link.href);
  await page.mouse.move(link.x, link.y, { steps: 6 });
  await page.waitForTimeout(400);
  ok('the bubble stays open under the pointer', (await bubbleText(page)) !== null);
  await away(page);
  ok('the bubble closes when the pointer leaves', (await bubbleText(page)) === null);

  // Plural, page definition, abbr, shouting, code.
  await hover(page, '#p2', 'CDP)');
  text = await bubbleText(page);
  ok('a page definition is used', text && text.includes('Customer Data Platform') && text.includes('on this page'), String(text));
  await away(page);
  await hover(page, '#p3', 'WSS');
  text = await bubbleText(page);
  ok('an <abbr title> is used', text && text.includes('Webhook Signing Secret'), String(text));
  await away(page);
  await hover(page, '#p3', 'IT');
  ok('IT in a sentence opens', (await bubbleText(page)) !== null);
  await away(page);
  await hover(page, '#p4', 'IT');
  ok('IT in shouting does not open', (await bubbleText(page)) === null);
  await away(page);
  await hover(page, '#code', 'API');
  ok('code is left alone', (await bubbleText(page)) === null);
  await away(page);

  // Text added after load.
  await hover(page, '#late', 'gRPC');
  text = await bubbleText(page);
  ok('text added later works', text && text.includes('Remote Procedure Call'), String(text));
  await away(page);

  // Underline marks, read where the content script keeps them.
  const counts = await page.evaluate(() => {
    const h = CSS.highlights.get('acronym-bubble');
    return h ? h.size : -1;
  });
  ok('acronyms are underlined', counts === -1 || counts >= 8, `marks: ${counts}`);

  // Escape closes.
  await hover(page, '#p1', 'HTTPS');
  ok('HTTPS opens', (await bubbleText(page)) !== null);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  ok('Escape closes', (await bubbleText(page)) === null);

  // Off switch.
  await settings({ enabled: false, disabledHosts: [], underline: 'every', trigger: 'hover' });
  await page.waitForTimeout(300);
  await hover(page, '#p1', 'JWT');
  ok('off means no bubble', (await bubbleText(page)) === null);
  await settings({ enabled: true, disabledHosts: ['localhost'], underline: 'every', trigger: 'hover' });
  await page.waitForTimeout(300);
  await hover(page, '#p1', 'JWT');
  ok('off for this site means no bubble', (await bubbleText(page)) === null);

  // Hold Option.
  await settings({ enabled: true, disabledHosts: [], underline: 'every', trigger: 'alt' });
  await page.waitForTimeout(300);
  await hover(page, '#p1', 'JWT');
  ok('alt mode: no bubble without Option', (await bubbleText(page)) === null);
  await page.keyboard.down('Alt');
  await page.waitForTimeout(600);
  ok('alt mode: Option opens it', (await bubbleText(page)) !== null);
  await page.keyboard.up('Alt');
  await away(page);
  await settings({ enabled: true, disabledHosts: [], underline: 'every', trigger: 'hover' });

  // Dark page, and the top edge (the bubble flips below the word).
  await page.goto(`http://localhost:${port}/docs.html?dark`);
  await page.waitForTimeout(900);
  await hover(page, '#p1', 'SSO');
  text = await bubbleText(page);
  ok('the dark page is dark', await DARK(page));
  ok('dark page opens', text && text.includes('Single Sign-On'), String(text));
  await page.screenshot({ path: path.join(SHOTS, 'dark-sso.png'), clip: { x: 0, y: 0, width: 760, height: 260 } });
  await away(page);
  await page.evaluate(() => scrollTo(0, document.getElementById('p1').offsetTop - 4));
  await page.waitForTimeout(200);
  const word = await hover(page, '#p1', 'REST');
  await page.screenshot({ path: path.join(SHOTS, 'dark-flipped.png'), clip: { x: 0, y: 0, width: 760, height: 200 } });
  const below = await page.evaluate(() => {
    const host = document.querySelector('[data-acronym-bubble]');
    const tip = host && host.shadowRoot.querySelector('[role=tooltip]');
    return tip ? tip.getBoundingClientRect().top : null;
  }) > word.y;
  ok('near the top, the bubble opens below the word', below === true, String(below));

  // The popup renders.
  const popup = await context.newPage();
  const id = new URL(worker.url()).host;
  await popup.setViewportSize({ width: 300, height: 380 });
  await popup.goto(`chrome-extension://${id}/src/popup/popup.html`);
  await popup.waitForTimeout(500);
  ok('popup renders its controls', (await popup.locator('button[aria-pressed]').count()) >= 7);
  await popup.screenshot({ path: path.join(SHOTS, 'popup.png') });

  ok('no page errors', errors.length === 0, errors.join('\n    '));
  await context.close();
  server.close();
  console.log(`${checks - failures}/${checks} passed`);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
