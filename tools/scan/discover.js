#!/usr/bin/env node
// Turns a short list of domains into a long list of article and doc URLs, by
// reading each site's sitemap. A homepage is mostly navigation; the prose
// where acronyms live is on the pages a sitemap lists.
//
//   node tools/scan/discover.js [--per 40] [--sites tools/scan/sites.txt]
//
// Writes tools/scan/urls.txt.
const fs = require('fs');
const path = require('path');

const args = require('./lib/args.js')();
const PER_SITE = Number(args.per || 40);
const SITES = args.sites || path.join(__dirname, 'sites.txt');
const OUT = args.out || path.join(__dirname, 'urls.txt');
const { pool, get, lines, UA } = require('./lib/fetch.js');

// Not prose: media, listings, feeds, and machine files.
const SKIP = /\.(png|jpe?g|gif|webp|svg|mp4|zip|gz|css|js)(\?|$)|\/(tag|tags|category|author|page|search|feed)\/|\?page=/i;

const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const isSitemap = (url) => /sitemap[^/?]*\.xml/i.test(url) || /\.xml(\?|$)/i.test(url);

async function discover(domain) {
  const found = new Set();
  const queue = [`https://${domain}/sitemap.xml`, `https://${domain}/sitemap_index.xml`, `https://${domain}/robots.txt`];
  const seen = new Set();
  while (queue.length && found.size < PER_SITE) {
    const url = queue.shift();
    if (seen.has(url) || seen.size > 20) continue;
    seen.add(url);
    const res = await get(url);
    if (!res.ok) continue;
    if (url.endsWith('robots.txt')) {
      for (const m of res.body.matchAll(/^\s*Sitemap:\s*(\S+)/gim)) queue.push(m[1]);
      continue;
    }
    // Take URLs from across the sitemap, not only its first section.
    const all = locs(res.body);
    const pages = all.filter((l) => !isSitemap(l) && !SKIP.test(l));
    for (const l of all.filter(isSitemap)) if (queue.length < 8) queue.push(l);
    const step = Math.max(1, Math.floor(pages.length / PER_SITE));
    for (let i = 0; i < pages.length && found.size < PER_SITE; i += step) found.add(pages[i].split('#')[0]);
  }
  return { domain, urls: [...found] };
}

async function main() {
  const domains = lines(SITES);
  console.log(`Reading sitemaps for ${domains.length} domains (up to ${PER_SITE} URLs each)\n`);
  const results = await pool(domains, 4, async (domain) => {
    try {
      const out = await discover(domain);
      console.log(`  ${out.urls.length ? '✓' : '·'} ${domain.padEnd(28)} ${out.urls.length} urls`);
      return out;
    } catch (err) {
      console.log(`  ✗ ${domain.padEnd(28)} ${err.message}`);
      return { domain, urls: [] };
    }
  });
  const all = results.flatMap((r) => r.urls);
  fs.writeFileSync(OUT, all.join('\n') + '\n');
  console.log(`\n${all.length} URLs from ${results.filter((r) => r.urls.length).length} domains → ${OUT}`);
  console.log(`User-Agent used: ${UA}`);
}

main();
