#!/usr/bin/env node
// Loads the real extension into a real Chromium and checks what it did on
// real pages and files. Slower than the corpus scan, so it runs on a sample:
// the fixed files first (every format), then sitemap pages.
//
//   node tools/scan/browser.js [--limit 25] [--urls tools/scan/urls.txt]
//                              [--files tools/scan/files.txt] [--headed] [--shots]
//                              [--out browser-report.json]
//
// There is no ground truth for what every acronym on a stranger's page
// means, so this checks rules that must hold whatever the page contains:
//
//   1. no element of ours inside the page's text: only the bubble's host,
//      as a child of <html>
//   2. no underline inside code, pre (outside a text file), a form field,
//      an editable region or SVG
//   3. where the corpus rules find an acronym the dictionary explains, the
//      page has underlines
//   4. resting on the first underlined acronym in view opens a bubble that
//      names it, inside the window
//   5. the extension logged no errors
//
// A PDF goes to the extension's own viewer, so the same rules hold there,
// on its text layer.
const fs = require('fs');
const os = require('os');
const path = require('path');
const args = require('./lib/args.js')();
const { lines } = require('./lib/fetch.js');
const { analyze, kind } = require('./lib/analyze.js');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is not installed. Run:\n  bun install\n  npx playwright install chromium');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..', '..');
const URLS = args.urls || path.join(__dirname, 'urls.txt');
const FILES = args.files || path.join(__dirname, 'files.txt');
const LIMIT = Number(args.limit || 25);
const OUT = args.out || path.join(process.cwd(), 'browser-report.json');
const SETTLE = Number(args.settle || 2500);
const SHOTS = path.join(process.cwd(), 'scan-shots');
const OURS = /chrome-extension:\/\/|Acronym Bubble|\b(content|find|dict|bubble)\.js/i;

// Runs in the page: what the extension left behind.
function harvest() {
  const SKIP = 'code,pre,textarea,input,select,svg,math,[contenteditable=""],[contenteditable="true"]';
  const textFile = !/html|xml|svg/.test(document.contentType);
  const h = CSS.highlights.get('acronym-bubble');
  const ranges = h ? [...h] : [];
  const bad = ranges.filter((r) => {
    const el = r.startContainer.parentElement;
    const skip = el && el.closest(SKIP);
    return skip && !(textFile && skip.tagName === 'PRE');
  });
  // The first underline fully inside the window and really on top, to rest
  // on. Closed menus keep their text with visibility: hidden, under whatever
  // is drawn there; the pointer cannot reach that text, so it is no target.
  let target = null;
  for (const r of ranges) {
    const b = r.getBoundingClientRect();
    if (!(b.width && b.top > 60 && b.bottom < innerHeight - 60 && b.left > 0 && b.right < innerWidth)) continue;
    const x = b.left + b.width / 2;
    const y = b.top + b.height / 2;
    const el = r.startContainer.parentElement;
    const top = document.elementFromPoint(x, y);
    if (top && (top === el || el.contains(top) || top.contains(el))) {
      target = { term: r.toString(), x, y };
      break;
    }
  }
  const hosts = [...document.querySelectorAll('[data-acronym-bubble]')];
  return {
    marks: ranges.length,
    bad: bad.slice(0, 5).map((r) => r.toString()),
    target,
    strayHosts: hosts.filter((x) => x.parentElement !== document.documentElement).length,
    title: document.title.slice(0, 80),
    type: document.contentType,
  };
}

function bubbleState() {
  const host = [...document.querySelectorAll('[data-acronym-bubble]')].find((x) => x.shadowRoot && x.shadowRoot.querySelector('[role=tooltip]'));
  const tip = host && host.shadowRoot.querySelector('[role=tooltip]');
  if (!tip) return null;
  const b = tip.getBoundingClientRect();
  return { text: tip.textContent, inside: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight };
}

async function main() {
  const urls = [...new Set([...lines(FILES), ...(fs.existsSync(URLS) ? lines(URLS) : [])])].slice(0, LIMIT);
  if (args.shots) fs.mkdirSync(SHOTS, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-scan-'));
  const context = await chromium.launchPersistentContext(profile, {
    headless: !args.headed,
    channel: 'chromium',
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
    viewport: { width: 1280, height: 860 },
    acceptDownloads: false,
  });
  console.log(`Checking ${urls.length} pages with the real extension\n`);

  const results = [];
  for (const [i, url] of urls.entries()) {
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && OURS.test(m.text()) && errors.push(m.text().slice(0, 300)));
    page.on('pageerror', (e) => OURS.test(String(e.stack || e)) && errors.push(String(e.stack || e).slice(0, 300)));
    const problems = [];
    let state = null;
    let format = kind('', url);
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const type = ((res && res.headers()['content-type']) || '').split(';')[0];
      format = kind(type, url);
      // A PDF moves to the viewer, which then draws its pages.
      await page.waitForTimeout(format === 'pdf' ? SETTLE + 3000 : SETTLE);
      state = await page.evaluate(harvest);

      if (state.strayHosts) problems.push({ why: 'an element of ours sits inside the page', text: `${state.strayHosts}` });
      for (const b of state.bad) problems.push({ why: 'underline inside code, a field or SVG', text: b });

      // What the extension should find, from the page's own text by the same
      // rules, read from the live DOM so client-rendered pages count.
      const text = await page.evaluate(() => (document.body ? document.body.innerText : ''));
      const expected = analyze(text, 'text/plain');
      const explainable = Object.keys(expected.known).length;
      if (explainable && !state.marks) problems.push({ why: 'known acronyms on the page, no underlines', text: Object.keys(expected.known).slice(0, 5).join(' ') });

      if (state.target) {
        await page.mouse.move(state.target.x - 40, state.target.y);
        await page.mouse.move(state.target.x, state.target.y, { steps: 4 });
        await page.waitForTimeout(800);
        const b = await page.evaluate(bubbleState);
        if (!b) problems.push({ why: 'resting on an underline opened no bubble', text: state.target.term });
        else {
          if (!b.text.includes(state.target.term.replace(/s$/, ''))) problems.push({ why: 'the bubble names another word', text: `${state.target.term} → ${b.text.slice(0, 60)}` });
          if (!b.inside) problems.push({ why: 'the bubble is outside the window', text: state.target.term });
        }
        if (args.shots) await page.screenshot({ path: path.join(SHOTS, `${String(i).padStart(3, '0')}.png`) });
      }
    } catch (err) {
      problems.push({ why: 'page did not load', text: err.message.split('\n')[0] });
    }
    for (const e of errors) problems.push({ why: 'extension logged an error', text: e });
    if (format === 'pdf' && !page.url().includes('/src/pdf/viewer.html')) problems.push({ why: 'a PDF stayed in Chrome\'s viewer', text: page.url() });

    results.push({ url, format, marks: state ? state.marks : 0, opened: state && state.target ? state.target.term : null, problems });
    console.log(`  ${problems.length ? '✗' : '✓'} ${format.padEnd(8)} ${String(state ? state.marks : 0).padStart(5)} marks  ${url.slice(0, 90)}`);
    for (const p of problems) console.log(`      · ${p.why}: ${p.text}`);
    await page.close();
  }
  await context.close();

  const failing = results.filter((r) => r.problems.length);
  fs.writeFileSync(OUT, JSON.stringify({ ranAt: new Date().toISOString(), pages: results }, null, 2));
  console.log(`\n${results.length - failing.length}/${results.length} pages clean. Full report → ${OUT}`);
  process.exitCode = failing.length ? 1 : 0;
}

main();
