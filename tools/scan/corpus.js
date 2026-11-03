#!/usr/bin/env node
// Scans many real pages and files without a browser: fetch each one, take
// the text the content script would read, and run the extension's own rules
// over it. This is the mode that scales. It says how many acronyms the
// dictionary explains, which ones have more than one meaning (where the
// model decides), and which ones it does not know: the list to grow the
// dictionary from.
//
//   node tools/scan/corpus.js [--urls tools/scan/urls.txt] [--files tools/scan/files.txt]
//                             [--limit 1000] [--concurrency 4] [--out scan-report.json]
//
// HTML, plain text, Markdown and JSON are read. A PDF is counted but not
// read: its text needs a PDF reader, and in Chrome the extension does not
// run on PDFs anyway (see the e2e format matrix).
const fs = require('fs');
const path = require('path');
const args = require('./lib/args.js')();
const { get, pool, lines } = require('./lib/fetch.js');
const { analyze, merge, top, kind } = require('./lib/analyze.js');

const URLS = args.urls || path.join(__dirname, 'urls.txt');
const FILES = args.files || path.join(__dirname, 'files.txt');
const LIMIT = Number(args.limit || 1000);
const CONCURRENCY = Number(args.concurrency || 4);
const OUT = args.out || path.join(process.cwd(), 'scan-report.json');

async function main() {
  const urls = [...new Set([...lines(FILES), ...(fs.existsSync(URLS) ? lines(URLS) : [])])].slice(0, LIMIT);
  if (!fs.existsSync(URLS)) console.log(`No ${path.relative(process.cwd(), URLS)} yet, so only the fixed files. Run: npm run scan:discover\n`);
  console.log(`Scanning ${urls.length} pages and files\n`);
  const started = Date.now();
  let done = 0;

  const pages = await pool(urls, CONCURRENCY, async (url) => {
    const res = await get(url);
    done += 1;
    if (done % 25 === 0) process.stdout.write(`  ${done}/${urls.length}\r`);
    if (!res.ok) return { url, ok: false, error: res.error || `HTTP ${res.status}` };
    const format = kind(res.type, url);
    if (format === 'pdf') return { url, ok: true, format, skipped: 'pdf' };
    try {
      return { url, ok: true, format, ...analyze(res.body, res.type) };
    } catch (err) {
      return { url, ok: false, error: `scan failed: ${err.message}` };
    }
  });

  const good = pages.filter((p) => p.ok && !p.skipped);
  const failed = pages.filter((p) => !p.ok);
  const formats = {};
  for (const p of pages.filter((q) => q.ok)) {
    const f = (formats[p.format] = formats[p.format] || { pages: 0, tokens: 0, explained: 0 });
    f.pages += 1;
    if (p.skipped) continue;
    f.tokens += p.tokens;
    f.explained += Object.values(p.known).reduce((a, b) => a + b, 0) + Object.values(p.page).reduce((a, b) => a + b, 0);
  }
  const known = good.reduce((m, p) => merge(m, p.known), {});
  const ambiguous = good.reduce((m, p) => merge(m, p.ambiguous), {});
  const unknown = good.reduce((m, p) => merge(m, p.unknown), {});
  // How many pages each unknown acronym is on: one page repeating a product
  // name is not a dictionary gap.
  const spread = {};
  for (const p of good) for (const k of Object.keys(p.unknown)) spread[k] = (spread[k] || 0) + 1;
  const gaps = top(unknown, 400)
    .filter(([k]) => spread[k] >= 2)
    .slice(0, 60)
    .map(([term, uses]) => ({ term, uses, pages: spread[term] }));
  const suspicious = good.flatMap((p) => p.suspicious.map((s) => ({ ...s, url: p.url })));
  const sum = (m) => Object.values(m).reduce((a, b) => a + b, 0);

  const report = {
    ranAt: new Date().toISOString(),
    totals: {
      requested: urls.length,
      read: good.length,
      pdfs: pages.filter((p) => p.skipped === 'pdf').length,
      failed: failed.length,
      explained: sum(known) + good.reduce((n, p) => n + sum(p.page), 0),
      ambiguous: sum(ambiguous),
      unknown: sum(unknown),
      suspicious: suspicious.length,
    },
    formats,
    topKnown: top(known),
    topAmbiguous: top(ambiguous),
    gaps,
    suspicious: suspicious.slice(0, 120),
    failures: failed.slice(0, 60),
    pages: pages.map((p) => ({ url: p.url, format: p.format, ok: p.ok, tokens: p.tokens, known: p.known && sum(p.known), unknown: p.unknown && sum(p.unknown), error: p.error })),
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

  const t = report.totals;
  const cover = t.explained + t.unknown ? Math.round((t.explained / (t.explained + t.unknown)) * 100) : 0;
  console.log(`\nRead ${t.read}/${urls.length} in ${Math.round((Date.now() - started) / 1000)}s (${t.pdfs} PDFs counted, ${t.failed} failed)`);
  console.log(`  explained        ${t.explained} acronyms, ${cover}% of the ones that look like acronyms`);
  console.log(`  ambiguous        ${t.ambiguous} (the model picks the meaning)`);
  console.log(`  unknown          ${t.unknown}`);
  console.log(`  suspicious       ${t.suspicious}`);
  console.log('\nBy format');
  for (const [f, v] of Object.entries(formats)) console.log(`  ${f.padEnd(9)} ${String(v.pages).padStart(4)} pages  ${v.tokens} tokens  ${v.explained} explained`);
  if (gaps.length) console.log(`\nMost common unknown acronyms (on 2+ pages):\n  ${gaps.slice(0, 25).map((g) => `${g.term} ×${g.uses}`).join('  ')}`);
  if (suspicious.length) {
    console.log('\nSuspicious (first 10):');
    for (const s of suspicious.slice(0, 10)) console.log(`  · ${s.why.padEnd(22)} "${s.text}"  ${s.url}`);
  }
  console.log(`\nFull report → ${OUT}`);
  process.exitCode = suspicious.length ? 1 : 0;
}

main();
