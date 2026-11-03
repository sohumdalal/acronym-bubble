// What counts as an acronym, what it stands for, and where a page defines one.
// No DOM here, so node can test it: test/find.test.js.
(function (AB) {
  // A token with at least two capitals, such as API, SaaS, gRPC or AT&T.
  // Lookarounds rather than \b, because & is not a word character.
  const TOKEN = /(?<![A-Za-z0-9&])(?=[A-Za-z0-9&]*[A-Z][A-Za-z0-9&]*[A-Z])[A-Za-z][A-Za-z0-9&]*(?![A-Za-z0-9&])/g;
  const TOKEN_CHAR = /[A-Za-z0-9&]/;

  // Words a definition may skip: "Software as a Service" is SaaS.
  const STOP = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'over', 'the', 'to', 'via', 'with', '&']);

  const list = (v) => (Array.isArray(v) ? v : [v]);

  // Text written mostly in capitals, where IT and US are just words.
  function shouty(text) {
    const letters = text.replace(/[^A-Za-z]/g, '');
    if (letters.length < 8) return false;
    return letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6;
  }

  // The acronym's letters, lowercased: AT&T is "att", IPv6 is "ip".
  function letters(term) {
    return term.replace(/[^A-Za-z]/g, '').replace(/[a-z]+$/, (tail) => (term === term.toUpperCase() ? tail : '')).toLowerCase();
  }

  // Each word offers the letters it can stand for: its first letter, or its
  // own capitals ("JavaScript" gives "js"). Hyphens split words.
  function offers(word) {
    const out = [word[0].toLowerCase()];
    const caps = word.replace(/[^A-Z]/g, '');
    if (caps.length > 1) out.push(caps.toLowerCase());
    return out;
  }

  // True when the words spell the letters exactly, skipping stop words that
  // do not help. The first word must count.
  function spells(words, want) {
    const go = (wi, li) => {
      if (wi === words.length) return li === want.length;
      const w = words[wi];
      for (const o of offers(w)) {
        if (want.startsWith(o, li) && go(wi + 1, li + o.length)) return true;
      }
      return wi > 0 && STOP.has(w.toLowerCase()) && go(wi + 1, li);
    };
    return want.length > 1 && words.length > 0 && go(0, 0);
  }

  const split = (text) => text.split(/[\s-]+/).filter((w) => /^[A-Za-z&]/.test(w));

  // "Single Sign-On (SSO)" and "SSO (Single Sign-On)", as {term: meaning}.
  function definitions(text) {
    const found = {};
    // The words before "(TERM)" or "(TERMs)".
    const before = /\(\s*([A-Za-z][A-Za-z0-9&]*?)s?\s*\)/g;
    let m;
    while ((m = before.exec(text))) {
      const term = m[1];
      if (!/[A-Z].*[A-Z]/.test(term) || found[term]) continue;
      const want = letters(term);
      const lead = text.slice(Math.max(0, m.index - 160), m.index);
      const words = lead.split(/\s+/).filter(Boolean);
      // The shortest run of trailing words that spells the term.
      for (let n = 1; n <= Math.min(words.length, want.length + 4); n++) {
        const run = words.slice(-n);
        const clean = run.map((w) => w.replace(/^[^A-Za-z&]+|[^A-Za-z]+$/g, '')).filter(Boolean);
        if (clean.length !== run.length || STOP.has(clean[0].toLowerCase())) continue;
        if (spells(split(clean.join(' ')), want)) {
          found[term] = clean.join(' ');
          break;
        }
      }
    }
    // "TERM (Words That Spell It)".
    const after = /(?<![A-Za-z0-9&])([A-Za-z][A-Za-z0-9&]*?)s?\s+\(([^()]{3,120})\)/g;
    while ((m = after.exec(text))) {
      const term = m[1];
      if (!/[A-Z].*[A-Z]/.test(term) || found[term]) continue;
      const inner = m[2].trim();
      if (spells(split(inner), letters(term))) found[term] = inner;
    }
    return found;
  }

  // The token around offset i in text, or null.
  function tokenAt(text, i) {
    if (!TOKEN_CHAR.test(text[i] || '')) return null;
    let start = i;
    let end = i;
    while (start > 0 && TOKEN_CHAR.test(text[start - 1])) start--;
    while (end < text.length && TOKEN_CHAR.test(text[end])) end++;
    const term = text.slice(start, end);
    TOKEN.lastIndex = 0;
    const m = TOKEN.exec(term);
    return m && m[0] === term ? { term, start, end } : null;
  }

  // What a term stands for: { term, meanings, source } or null. A page's own
  // definition wins over the dictionary, and a plural falls back to its
  // singular. Word-like terms in shouting text are left alone.
  function resolve(term, page, context = '') {
    const tries = term.endsWith('s') && term.length > 2 ? [term, term.slice(0, -1)] : [term];
    for (const t of tries) {
      if (page && page[t]) return { term: t, meanings: list(page[t]), source: 'page' };
    }
    for (const t of tries) {
      if (!AB.DICT[t]) continue;
      if (AB.WORDLIKE.has(t) && shouty(context)) return null;
      return { term: t, meanings: list(AB.DICT[t]), source: 'dictionary' };
    }
    return null;
  }

  // Words written in capitals that are not acronyms: RFC 2119 keywords, HTTP
  // methods and labels. Found by the corpus scan (npm run scan), where specs
  // and API docs use them hundreds of times a page.
  const PLAIN_CAPS = new Set(
    'MUST SHOULD SHALL MAY NOT REQUIRED OPTIONAL GET PUT POST HEAD DELETE PATCH TRACE OPTIONS CONNECT OK NOTE TODO FIXME WARNING AND OR THE YES NO NEW'.split(' '),
  );

  // An all-caps token the dictionary does not know, such as CDP or B2B: worth
  // asking the model about. Mixed case (GitHub, iPhone) is a name, not an
  // acronym, and in shouting text every word is in capitals.
  function askable(term, context = '') {
    return /^[A-Z][A-Z0-9&]{1,5}s?$/.test(term) && !PLAIN_CAPS.has(term) && !shouty(context);
  }

  // The hit with the model's answer first. A known meaning it names moves to
  // the front ('context'). A new meaning goes first only if its words spell
  // the acronym, which keeps out most made-up answers ('guess'). Otherwise
  // the hit is unchanged, or null when there was nothing to show.
  function inContext(hit, answer) {
    const a = String(answer || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const meanings = hit.meanings || [];
    const i = a ? meanings.findIndex((m) => norm(m) === norm(a)) : -1;
    if (i >= 0) return { ...hit, meanings: [meanings[i], ...meanings.filter((_, j) => j !== i)], source: 'context' };
    if (a && spells(split(a), letters(hit.term))) return { ...hit, meanings: [a, ...meanings], source: 'guess' };
    return meanings.length ? hit : null;
  }

  function searchUrl(hit) {
    const q = hit.meanings.length ? `${hit.term} ${hit.meanings[0]}` : `${hit.term} meaning`;
    return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }

  Object.assign(AB, { TOKEN, definitions, tokenAt, resolve, askable, inContext, searchUrl, shouty });
})((self.AB = self.AB || {}));
