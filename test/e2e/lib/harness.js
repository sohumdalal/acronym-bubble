// The real extension in a real Chromium, and the few moves every case makes:
// rest the pointer on a word (in any frame), read the bubble, move away.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

// AB_ROOT=dir runs the suite against another copy, such as the unzipped
// store package (npm run check:zip).
const ROOT = process.env.AB_ROOT ? path.resolve(process.env.AB_ROOT) : path.join(__dirname, '..', '..', '..');
const SHOTS = path.join(__dirname, '..', '..', 'shots');
// The test browser has no built-in model, so the suite reads pages with the
// Claude path, pointed at the stand-in server in fake-claude.js.
const DEFAULTS = { enabled: true, disabledHosts: [], underline: 'every', trigger: 'hover', agent: 'claude', pdf: true };

async function launch({ headed = !!process.env.HEADED, claude } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-e2e-'));
  const context = await chromium.launchPersistentContext(profile, {
    headless: !headed,
    channel: 'chromium',
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
    viewport: { width: 1100, height: 700 },
    deviceScaleFactor: 2,
    acceptDownloads: false,
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
  // A just-installed worker's webRequest listeners reach the browser a
  // moment after the worker starts; a PDF loaded before then is missed.
  await new Promise((r) => setTimeout(r, 1000));
  fs.mkdirSync(SHOTS, { recursive: true });
  const local = (v) => worker.evaluate((x) => chrome.storage.local.set(x), v);
  await worker.evaluate((v) => chrome.storage.sync.set({ settings: v }), DEFAULTS);
  if (claude) await local({ claudeKey: 'test', claudeBaseUrl: claude.url });
  return {
    local,
    context,
    worker,
    id: new URL(worker.url()).host,
    settings: (patch = {}) => worker.evaluate((v) => chrome.storage.sync.set({ settings: v }), { ...DEFAULTS, ...patch }),
    close: () => context.close(),
  };
}

// A fresh tab that records page errors and the extension's own warnings.
async function open(ab, url, { settle = 900 } = {}) {
  const page = await ab.context.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(e.message));
  page.on('console', (m) => m.type() === 'warning' && m.text().includes('Acronym Bubble') && page.__errors.push(m.text()));
  let failed = null;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 15000 });
  } catch (err) {
    // A PDF can download instead of opening; that is an outcome, not a crash.
    failed = err.message.split('\n')[0];
  }
  page.__failed = failed;
  await page.waitForTimeout(settle);
  return page;
}

// The frame whose element matches selector in the top page, or the page's
// main frame.
async function frameOf(page, frameSelector) {
  if (!frameSelector) return page.mainFrame();
  const handle = await page.$(frameSelector);
  return handle && handle.contentFrame();
}

// The centre of the first `word` inside `selector`, in page coordinates.
async function find(page, word, { selector = 'body', frame } = {}) {
  const f = await frameOf(page, frame);
  if (!f) return null;
  const box = await f
    .evaluate(
      ([sel, w]) => {
        const el = document.querySelector(sel);
        if (!el) return null;
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
    )
    .catch(() => null);
  if (!box || !frame) return box;
  const at = await (await page.$(frame)).boundingBox();
  return { x: box.x + at.x + 1, y: box.y + at.y + 1 };
}

// Moves the pointer onto a word and rests there. Returns the point, or null
// when the word is not in the DOM at all (a PDF, an image).
async function hover(page, word, opts = {}) {
  const box = await find(page, word, opts);
  if (!box) return null;
  await page.mouse.move(box.x - 40, box.y);
  await page.mouse.move(box.x, box.y, { steps: 4 });
  await page.waitForTimeout(opts.wait || 700);
  return box;
}

async function away(page) {
  await page.mouse.move(2, 2, { steps: 3 });
  await page.waitForTimeout(500);
}

// The open bubble's text from any frame, or null.
async function bubble(page) {
  for (const f of page.frames()) {
    const text = await f
      .evaluate(() => {
        const host = [...document.querySelectorAll('[data-acronym-bubble]')].find((h) => h.shadowRoot && h.shadowRoot.querySelector('[role=tooltip]'));
        return host ? host.shadowRoot.querySelector('[role=tooltip]').textContent : null;
      })
      .catch(() => null);
    if (text) return text;
  }
  return null;
}

// The open bubble's box in the top page, or null.
function bubbleBox(page) {
  return page.evaluate(() => {
    const host = document.querySelector('[data-acronym-bubble]');
    const tip = host && host.shadowRoot && host.shadowRoot.querySelector('[role=tooltip]');
    if (!tip) return null;
    const b = tip.getBoundingClientRect();
    return { top: b.top, left: b.left, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
  });
}

// The bubble's text once it has stopped loading, or null. Waits up to
// `wait` ms for the agent's answer.
async function answered(page, wait = 4000) {
  const until = Date.now() + wait;
  let text = await bubble(page);
  while (text && text.includes('Reading the page') && Date.now() < until) {
    await page.waitForTimeout(150);
    text = await bubble(page);
  }
  return text;
}

// Rests on a word and reports whether a bubble opened with `expect` in it,
// after any loading.
async function opens(page, word, expect, opts) {
  const at = await hover(page, word, opts);
  const text = at ? await answered(page) : null;
  await away(page);
  return { found: !!at, text, ok: !!text && (!expect || text.includes(expect)) };
}

function shot(page, name, clip) {
  return page.screenshot({ path: path.join(SHOTS, `${name}.png`), ...(clip ? { clip } : {}) });
}

module.exports = { launch, open, hover, away, bubble, answered, bubbleBox, opens, find, shot, DEFAULTS };
