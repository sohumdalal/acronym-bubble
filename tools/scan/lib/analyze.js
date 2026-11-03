// The extension's own rules, run over text without a browser: which tokens
// are acronyms, which the dictionary or the page explains, which have more
// than one meaning (the model's work), and which it does not know.
globalThis.self = globalThis;
require('../../../src/dict.js');
require('../../../src/lib/find.js');
const AB = globalThis.AB;

// Entities a browser resolves before the extension sees the text.
const ENTITIES = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…' };
const decode = (t) =>
  t
    .replace(/&([a-zA-Z]+);/g, (w, n) => (ENTITIES[n] !== undefined ? ENTITIES[n] : w))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

// The text nodes the content script would read: everything outside the
// elements it skips. A plain-text file is one node per line.
function textOf(body, type) {
  if (!/html|xml/.test(type)) return body.split('\n').filter((l) => /[A-Z].*[A-Z]/.test(l));
  return body
    .replace(/<(script|style|noscript|template|textarea|select|code|pre|kbd|samp|var|svg|math)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[a-z][^>]*\bcontenteditable(="(true)?")?[^>]*>[\s\S]*?<\/[a-z]+>/gi, ' ')
    .split(/<[^>]*>/)
    .map((t) => decode(t).replace(/\s+/g, ' ').trim())
    .filter((t) => /[A-Z].*[A-Z]/.test(t));
}

// A page definition that is probably not one: too long, or with digits.
const odd = (meaning) => meaning.split(/\s+/).length > 7 || /\d/.test(meaning);

function analyze(body, type) {
  const nodes = textOf(body, type);
  const page = AB.definitions(nodes.join(' '));
  const out = { nodes: nodes.length, tokens: 0, known: {}, page: {}, ambiguous: {}, unknown: {}, suspicious: [] };
  const bump = (map, k) => (map[k] = (map[k] || 0) + 1);
  for (const [term, meaning] of Object.entries(page)) if (odd(meaning)) out.suspicious.push({ why: 'odd page definition', text: `${term} = ${meaning}` });
  for (const text of nodes) {
    for (const m of text.match(AB.TOKEN) || []) {
      out.tokens += 1;
      const hit = AB.resolve(m, page, text);
      if (hit && hit.source === 'page') bump(out.page, hit.term);
      else if (hit) {
        bump(out.known, hit.term);
        if (hit.meanings.length > 1) bump(out.ambiguous, hit.term);
      } else if (AB.askable(m, text)) bump(out.unknown, m.replace(/s$/, ''));
    }
  }
  return out;
}

// Adds counts from b into a.
function merge(a, b) {
  for (const [k, n] of Object.entries(b)) a[k] = (a[k] || 0) + n;
  return a;
}

const top = (map, n = 30) =>
  Object.entries(map)
    .sort((x, y) => y[1] - x[1])
    .slice(0, n);

// What kind of file a response is, for the per-format counts.
function kind(type, url) {
  if (type === 'application/pdf' || /\.pdf$/i.test(url)) return 'pdf';
  if (/json/.test(type)) return 'json';
  if (/markdown/.test(type) || /\.md$/i.test(url)) return 'markdown';
  if (/^text\/plain/.test(type)) return 'text';
  if (/xml/.test(type) && !/html/.test(type)) return 'xml';
  return 'html';
}

module.exports = { AB, analyze, textOf, merge, top, kind };
