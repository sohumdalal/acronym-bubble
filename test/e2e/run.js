#!/usr/bin/env node
// End-to-end suite: the real extension, in a real Chromium, against local
// pages and files built from what breaks extensions on real sites: other
// file formats, frames, shadow roots, single-page apps, editors, strict CSP
// and very long pages.
//
//   npm run e2e                  all cases
//   npm run e2e -- --only format cases whose name contains "format"
//   HEADED=1 npm run e2e         watch it happen
//
// Format cases say what they expect, 'works' or 'none', and the run ends
// with a support matrix. A format that starts or stops working fails its
// case until the expectation (and the README) says so.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { launch, open, hover, away, bubble, bubbleBox, opens, shot } = require('./lib/harness.js');
const { serve, SITES } = require('./lib/server.js');
const args = require('../../tools/scan/lib/args.js')();

let failures = 0;
let checks = 0;
const matrix = [];

function reporter() {
  const lines = [];
  const t = {
    ok(label, condition, detail = '') {
      checks += 1;
      if (condition) return;
      failures += 1;
      lines.push(`    ✗ ${label}${detail ? `\n        ${detail}` : ''}`);
    },
    clean(page) {
      t.ok('no page errors', page.__errors.length === 0, page.__errors.slice(0, 2).join('\n        '));
    },
    lines,
  };
  return t;
}

// One file format: does a bubble open on `word` when Chrome shows the file?
function format(name, file, { word = 'API', expect, note, url }) {
  return {
    name: `format · ${name}`,
    async run(t, { ab, site }) {
      const page = await open(ab, url ? url(site) : site.url(file));
      const r = await opens(page, word, null);
      const got = r.ok ? 'works' : 'none';
      matrix.push({ format: name, got, expect, why: r.ok ? '' : page.__failed || (r.found ? 'text is there, no bubble' : 'no text in the DOM'), note });
      t.ok(`${name}: ${expect}`, got === expect, `got ${got}${page.__failed ? ` (${page.__failed})` : ''}`);
      if (expect === 'works') t.clean(page);
      await page.close();
    },
  };
}

const CASES = [
  {
    name: 'docs · dictionary, page definitions, abbr, shouting, code, late text',
    async run(t, { ab, site }) {
      const page = await open(ab, site.url('docs.html'));
      const html = await page.evaluate(() => document.getElementById('p1').innerHTML);
      t.ok('no nodes added to the text', !html.includes('<span'), html);

      await hover(page, 'API', { selector: '#p1' });
      let text = await bubble(page);
      t.ok('API opens a bubble', text && text.includes('Application Programming Interface'), String(text));
      t.ok('the bubble has a More link', text && text.includes('More'), String(text));
      await shot(page, 'light-api', { x: 0, y: 0, width: 760, height: 260 });

      // The pointer crosses into the bubble and it stays open.
      const link = await page.evaluate(() => {
        const a = document.querySelector('[data-acronym-bubble]').shadowRoot.querySelector('a');
        const b = a.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2, href: a.href };
      });
      t.ok('More searches Google for the acronym', link.href.startsWith('https://www.google.com/search?q=API%20Application'), link.href);
      await page.mouse.move(link.x, link.y, { steps: 6 });
      await page.waitForTimeout(400);
      t.ok('the bubble stays open under the pointer', (await bubble(page)) !== null);
      await away(page);
      t.ok('the bubble closes when the pointer leaves', (await bubble(page)) === null);

      const def = await opens(page, 'CDP)', 'Customer Data Platform', { selector: '#p2' });
      t.ok('a page definition is used', def.ok && def.text.includes('on this page'), String(def.text));
      t.ok('an <abbr title> is used', (await opens(page, 'WSS', 'Webhook Signing Secret', { selector: '#p3' })).ok);
      t.ok('IT in a sentence opens', (await opens(page, 'IT', null, { selector: '#p3' })).ok);
      t.ok('IT in shouting does not open', !(await opens(page, 'IT', null, { selector: '#p4' })).ok);
      t.ok('code is left alone', !(await opens(page, 'API', null, { selector: '#code' })).ok);
      t.ok('text added later works', (await opens(page, 'gRPC', 'Remote Procedure Call', { selector: '#late' })).ok);

      await hover(page, 'HTTPS', { selector: '#p1' });
      t.ok('HTTPS opens', (await bubble(page)) !== null);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      t.ok('Escape closes', (await bubble(page)) === null);
      t.clean(page);
      await page.close();
    },
  },
  {
    name: 'settings · off, off for this site, hold Option',
    async run(t, { ab, site }) {
      const page = await open(ab, site.url('docs.html'));
      await ab.settings({ enabled: false });
      await page.waitForTimeout(300);
      t.ok('off means no bubble', !(await opens(page, 'JWT', null, { selector: '#p1' })).ok);
      await ab.settings({ disabledHosts: ['127.0.0.1'] });
      await page.waitForTimeout(300);
      t.ok('off for this site means no bubble', !(await opens(page, 'JWT', null, { selector: '#p1' })).ok);
      await ab.settings({ trigger: 'alt' });
      await page.waitForTimeout(300);
      await hover(page, 'JWT', { selector: '#p1' });
      t.ok('alt mode: no bubble without Option', (await bubble(page)) === null);
      await page.keyboard.down('Alt');
      await page.waitForTimeout(600);
      t.ok('alt mode: Option opens it', (await bubble(page)) !== null);
      await page.keyboard.up('Alt');
      await away(page);
      await ab.settings();
      await page.close();
    },
  },
  {
    name: 'theme · dark page, flipped near the top',
    async run(t, { ab, site }) {
      const page = await open(ab, site.url('docs.html?dark'));
      await hover(page, 'SSO', { selector: '#p1' });
      const text = await bubble(page);
      t.ok('the dark page is dark', await page.evaluate(() => document.body.className === 'dark'));
      t.ok('dark page opens', text && text.includes('Single Sign-On'), String(text));
      await shot(page, 'dark-sso', { x: 0, y: 0, width: 760, height: 260 });
      await away(page);
      await page.evaluate(() => scrollTo(0, document.getElementById('p1').offsetTop - 4));
      await page.waitForTimeout(200);
      const word = await hover(page, 'REST', { selector: '#p1' });
      await shot(page, 'dark-flipped', { x: 0, y: 0, width: 760, height: 200 });
      const box = await bubbleBox(page);
      t.ok('near the top, the bubble opens below the word', box && box.top > word.y, JSON.stringify(box));
      await page.close();
    },
  },
  {
    name: 'popup · switches and choices, light and dark',
    async run(t, { ab }) {
      const popup = await ab.context.newPage();
      await popup.setViewportSize({ width: 268, height: 400 });
      await popup.goto(`chrome-extension://${ab.id}/src/popup/popup.html`);
      await popup.waitForTimeout(500);
      t.ok('popup renders its choices', (await popup.locator('button[aria-pressed]').count()) === 5);
      // On, and Meaning from context; This site hides on an extension page.
      t.ok('popup renders its switches', (await popup.locator('.ab-switch input[type=checkbox]').count()) === 2);
      await shot(popup, 'popup');
      await popup.emulateMedia({ colorScheme: 'dark' });
      const bg = await popup.evaluate(() => getComputedStyle(document.body).backgroundColor);
      t.ok('the popup is dark in dark mode', bg === 'rgb(28, 28, 30)', bg);
      await shot(popup, 'popup-dark');
      await popup.close();
    },
  },

  // ── File formats ──
  format('HTML page', 'docs.html', { expect: 'works' }),
  format('rendered Markdown (GitHub-style)', 'rendered-md.html', { expect: 'works' }),
  format('raw Markdown (.md)', 'readme.md', { expect: 'works', note: 'Chrome shows it as plain text' }),
  format('plain text (.txt)', 'notes.txt', { expect: 'works' }),
  format('JSON', 'data.json', { expect: 'works' }),
  format('XML', 'feed.xml', { word: 'REST', expect: 'none', note: "Chrome's XML tree viewer has no page body" }),
  format('SVG', 'logo.svg', { word: 'REST', expect: 'none', note: 'drawn text, not page text' }),
  format('PDF', 'doc.pdf', { word: 'REST', expect: 'none', note: "Chrome's PDF viewer does not run content scripts" }),
  format('local file (file://)', null, {
    expect: 'works',
    note: 'unpacked; a store install needs "Allow access to file URLs"',
    url: () => pathToFileURL(path.join(SITES, 'docs.html')).href,
  }),

  // ── Page types ──
  {
    name: 'markdown · rendered README: headings, lists, tables, inline and fenced code',
    async run(t, { ab, site }) {
      const page = await open(ab, site.url('rendered-md.html'));
      t.ok('a list item opens', (await opens(page, 'JWT', 'JSON Web Token', { selector: '#li' })).ok);
      t.ok('a table cell opens', (await opens(page, 'SRE', 'Site Reliability', { selector: 'table' })).ok);
      t.ok('inline code is left alone', !(await opens(page, 'API_URL', null, { selector: '#inline' })).ok);
      t.ok('a fenced block is left alone', !(await opens(page, 'API', null, { selector: '#fence' })).ok);
      t.clean(page);
      await page.close();
    },
  },
  {
    name: 'markdown · raw file: prose opens, fenced code is still prose',
    async run(t, { ab, site }) {
      const page = await open(ab, site.url('readme.md'));
      t.ok('JWT in a raw .md opens', (await opens(page, 'JWT', 'JSON Web Token')).ok);
      await page.close();
    },
  },
  {
    name: 'frames · same-origin, srcdoc and cross-origin',
    async run(t, { ab, site }) {
      const page = await open(ab, `${site.url('frames.html')}?x=${site.other}`, { settle: 1500 });
      t.ok('the parent page opens', (await opens(page, 'REST', 'Representational', { selector: '#top' })).ok);
      t.ok('a same-origin frame opens', (await opens(page, 'gRPC', 'Remote Procedure Call', { frame: '#same' })).ok);
      t.ok('a srcdoc frame opens', (await opens(page, 'CDN', 'Content Delivery Network', { frame: '#srcdoc' })).ok);
      t.ok('a cross-origin frame opens', (await opens(page, 'gRPC', 'Remote Procedure Call', { frame: '#cross' })).ok);
      t.clean(page);
      await page.close();
    },
  },
  {
    name: 'shadow · light DOM works; text in shadow roots is a known limit',
    async run(t, { ab, site }) {
      const page = await open(ab, site.url('shadow.html'));
      t.ok('light DOM opens', (await opens(page, 'REST', 'Representational', { selector: '#light' })).ok);
      // Both report as limits in the README. Flip these when they change.
      const inOpen = await page.evaluate(() => document.getElementById('open').shadowRoot.textContent.includes('CDN'));
      t.ok('the open shadow root has its text', inOpen);
      t.clean(page);
      await page.close();
    },
  },
  {
    name: 'spa · a view replaced in place, with pushState',
    async run(t, { ab, site }) {
      const page = await open(ab, site.url('spa.html'));
      t.ok('the first view opens', (await opens(page, 'SDK', 'Software Development Kit', { selector: '#first' })).ok);
      await page.click('#go');
      await page.waitForTimeout(900);
      t.ok('the URL changed', page.url().endsWith('/spa/next'), page.url());
      t.ok('the new view opens', (await opens(page, 'PR', 'Pull Request', { selector: '#second' })).ok);
      t.clean(page);
      await page.close();
    },
  },
  {
    name: 'editor · contenteditable, textarea and input are left alone',
    async run(t, { ab, site }) {
      const page = await open(ab, site.url('editor.html'));
      t.ok('read-only text opens', (await opens(page, 'REST', null, { selector: '#read' })).ok);
      t.ok('contenteditable is left alone', !(await opens(page, 'REST', null, { selector: '#ce' })).ok);
      // Form fields keep their text out of the DOM tree, so there is no word
      // to rest on; a click into one must not open a bubble either.
      await page.click('#ta');
      await page.waitForTimeout(500);
      t.ok('a textarea is left alone', (await bubble(page)) === null);
      t.clean(page);
      await page.close();
    },
  },
  {
    name: "csp · default-src 'none' still gets a styled bubble",
    async run(t, { ab, site }) {
      const page = await open(ab, site.url('csp.html'));
      await hover(page, 'REST', { selector: '#p' });
      const text = await bubble(page);
      t.ok('the bubble opens', text && text.includes('Representational'), String(text));
      const box = await bubbleBox(page);
      t.ok('the bubble has its styles (it is a card, not bare text)', box && box.width <= 290 && box.height > 30, JSON.stringify(box));
      await away(page);
      t.clean(page);
      await page.close();
    },
  },
  {
    name: 'big · 3000 paragraphs scan fast and hover still opens',
    async run(t, { ab, site }) {
      const started = Date.now();
      const page = await open(ab, site.url('big.html'), { settle: 300 });
      await page.evaluate(() => document.querySelectorAll('p')[2990].scrollIntoView());
      await page.waitForTimeout(400);
      const r = await opens(page, 'Row 2990', null);
      // "Row 2990" is not an acronym: hover the first acronym in that row.
      const word = await page.evaluate(() => document.querySelectorAll('p')[2990].textContent.match(/\b[A-Z]{2,}\b/)[0]);
      const p = await opens(page, word, null, { selector: 'p:nth-of-type(2991)' });
      t.ok('an acronym near the end opens', p.ok, String(p.text));
      t.ok('the page loaded and settled in under 5s', Date.now() - started < 5000, `${Date.now() - started}ms`);
      t.ok('a plain word does not open', !r.ok);
      t.clean(page);
      await page.close();
    },
  },
];

(async () => {
  const only = typeof args.only === 'string' ? args.only : null;
  const cases = CASES.filter((c) => !only || c.name.includes(only));
  const site = await serve();
  const ab = await launch();
  for (const c of cases) {
    const t = reporter();
    try {
      await c.run(t, { ab, site });
    } catch (err) {
      t.ok('case ran', false, err.message.split('\n')[0]);
    }
    console.log(`${t.lines.length ? '✗' : '✓'} ${c.name}`);
    for (const l of t.lines) console.log(l);
  }
  await ab.close();
  site.close();

  if (matrix.length) {
    console.log('\nFormat support');
    for (const m of matrix) {
      const mark = m.got === m.expect ? ' ' : '!';
      console.log(`  ${mark} ${m.format.padEnd(34)} ${m.got.padEnd(6)}${m.why ? ` ${m.why}` : ''}${m.note ? ` · ${m.note}` : ''}`);
    }
  }
  console.log(`\n${checks - failures}/${checks} passed`);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
