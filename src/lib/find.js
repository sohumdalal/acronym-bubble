// What looks like an abbreviation, where a page defines one, and whether a
// model's answer is believable. There are no word lists here: the page and
// the model (src/agent/) say what each abbreviation means. No DOM here, so
// node can test it: test/find.test.js.
(function (AB) {
  // A token with at least two capitals, such as API, SaaS, gRPC or AT&T.
  // Lookarounds rather than \b, because & is not a word character.
  const TOKEN = /(?<![A-Za-z0-9&])(?=[A-Za-z0-9&]*[A-Z][A-Za-z0-9&]*[A-Z])[A-Za-z][A-Za-z0-9&]*(?![A-Za-z0-9&])/g;
  // Short letter groups joined by dots or semicolons: TL;DR, e.g., a.k.a.,
  // Ph.D., U.S. Groups of one or two letters, so file names such as
  // index.js and words at the end of a sentence do not match.
  const DOTTED = /(?<![A-Za-z0-9&.;])(?:[A-Za-z]{1,2}[.;]){1,4}[A-Za-z]{1,2}\.?(?![A-Za-z0-9&])/g;

  // Words a definition may skip: "Software as a Service" is SaaS.
  const STOP = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'over', 'the', 'to', 'via', 'with', '&']);

  // Text written mostly in capitals. Every word there is in capitals, so a
  // capital word says nothing about being an abbreviation.
  function shouty(text) {
    const letters = text.replace(/[^A-Za-z]/g, '');
    if (letters.length < 8) return false;
    return letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6;
  }

  // The abbreviation's letters, lowercased: AT&T is "att", TL;DR is "tldr",
  // imo is "imo". A lowercase tail after capitals is a suffix, not letters
  // to spell: IPv6 is "ip".
  function letters(term) {
    const plain = term.replace(/[^A-Za-z]/g, '');
    if (!/[A-Z]/.test(plain) || plain === plain.toUpperCase() || /[.;]/.test(term)) return plain.toLowerCase();
    return plain.replace(/(?<=[A-Z])[a-z]+$/, '').toLowerCase();
  }

  // Each word offers the letters it can stand for: its first letter, or its
  // own capitals ("JavaScript" gives "js"). Hyphens split words. `loose`
  // also lets it give its first letter and one later letter, as real
  // expansions do: REST is "Representational State Transfer", HTTPS is
  // "Hypertext Transfer Protocol Secure", IdP is "Identity Provider".
  function offers(word, loose) {
    const out = [word[0].toLowerCase()];
    const caps = word.replace(/[^A-Z]/g, '');
    if (caps.length > 1) out.push(caps.toLowerCase());
    if (loose) for (const c of word.slice(1).toLowerCase()) out.push(word[0].toLowerCase() + c);
    return out;
  }

  // True when the words spell the letters exactly, skipping stop words that
  // do not help. The first word must count.
  function spells(words, want, loose = false) {
    const go = (wi, li) => {
      if (wi === words.length) return li === want.length;
      const w = words[wi];
      for (const o of offers(w, loose)) {
        if (want.startsWith(o, li) && go(wi + 1, li + o.length)) return true;
      }
      return wi > 0 && STOP.has(w.toLowerCase()) && go(wi + 1, li);
    };
    return want.length > 1 && words.length > 0 && go(0, 0);
  }

  const split = (text) =>
    text
      .split(/[\s-]+/)
      .map((w) => w.replace(/^[^A-Za-z&]+/, ''))
      .filter((w) => /^[A-Za-z&]/.test(w));

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

  // The abbreviation-shaped token around offset i in text, or null.
  function tokenAt(text, i) {
    for (const re of [DOTTED, TOKEN]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        if (m.index > i) break;
        if (i < m.index + m[0].length) return { term: m[0], start: m.index, end: m.index + m[0].length };
      }
    }
    return null;
  }

  // Worth asking the model about: shaped like an abbreviation, and not in
  // text where every word is in capitals.
  function askable(term, context = '') {
    DOTTED.lastIndex = 0;
    const dotted = DOTTED.exec(term);
    if (dotted && dotted[0] === term) return true;
    TOKEN.lastIndex = 0;
    const token = TOKEN.exec(term);
    return !!token && token[0] === term && !shouty(context);
  }

  // A model's answer is kept only if what it says the letters stand for
  // spells them: "Too Long; Didn't Read" for TL;DR, "In My Opinion" for imo.
  // It must be two words or more, and not the term again. This drops most
  // made-up answers and every ordinary word.
  function believable(term, standsFor) {
    const said = String(standsFor || '').replace(/\s*\([^)]*\)\s*$/, '');
    const words = split(said);
    if (words.length < 2 || said.toLowerCase() === term.toLowerCase()) return false;
    const want = letters(term);
    return spells(words, want, true) || (/s$/.test(want) && spells(words, want.slice(0, -1), true));
  }

  const plain = (term) => term.replace(/[:]+$/, '');

  // What a term stands for: { term, meanings, gloss, source } or null. The
  // page's own definition wins over the model's, and a plural falls back to
  // its singular. `found` holds the model's answers for this page.
  function resolve(term, page = {}, found = {}) {
    const t0 = plain(term);
    const tries = t0.endsWith('s') && t0.length > 2 ? [t0, t0.slice(0, -1)] : [t0];
    for (const t of tries) if (page[t]) return { term: t, meanings: [page[t]], gloss: '', source: 'page' };
    for (const t of tries) {
      const f = found[t];
      if (f) return { term: t, meanings: [f.standsFor], gloss: f.gloss || '', source: 'context' };
    }
    return null;
  }

  // A pattern that finds every known term in text, longest first, with an
  // optional plural s. Null when there is nothing to find.
  function termPattern(terms) {
    const list = [...new Set(terms)].filter(Boolean).sort((a, b) => b.length - a.length);
    if (!list.length) return null;
    const esc = list.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`(?<![A-Za-z0-9&])(?:${esc.join('|')})s?(?![A-Za-z0-9&])`, 'g');
  }

  function searchUrl(hit) {
    const q = hit.meanings.length ? `${hit.term} ${hit.meanings[0]}` : `${hit.term} meaning`;
    return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }

  Object.assign(AB, { TOKEN, DOTTED, definitions, tokenAt, askable, believable, resolve, termPattern, searchUrl, shouty, letters });
})((self.AB = self.AB || {}));
