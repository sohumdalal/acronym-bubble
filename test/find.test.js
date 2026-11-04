// Detection rules, without a browser: node test/find.test.js
globalThis.self = globalThis;
require('../src/lib/find.js');
const fs = require('fs');
const path = require('path');
const { AB } = globalThis;

let failures = 0;
let checks = 0;
function eq(label, got, want) {
  checks += 1;
  if (JSON.stringify(got) === JSON.stringify(want)) return;
  failures += 1;
  console.log(`✗ ${label}\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`);
}

const tokens = (text) => text.match(AB.TOKEN) || [];
const dotted = (text) => text.match(AB.DOTTED) || [];

// ── Shapes ──
eq('plain capitals', tokens('Call the API over HTTP.'), ['API', 'HTTP']);
eq('mixed case', tokens('SaaS and gRPC and OAuth'), ['SaaS', 'gRPC', 'OAuth']);
eq('ampersand', tokens('AT&T runs R&D'), ['AT&T', 'R&D']);
eq('digits', tokens('IPv6 on EC2'), ['IPv6', 'EC2']);
eq('one capital is not a token', tokens('Hello World a'), []);
eq('dots and semicolons', dotted('TL;DR: e.g. this, a.k.a. that, a Ph.D. in the U.S.'), ['TL;DR', 'e.g.', 'a.k.a.', 'Ph.D.', 'U.S.']);
eq('file names are not dotted forms', dotted('Open index.js and README.md, then stop.'), []);
eq('sentence ends are not dotted forms', dotted('It works. So do we.'), []);

// ── tokenAt ──
eq('token at an offset', AB.tokenAt('use the REST API now', 14), { term: 'API', start: 13, end: 16 });
eq('dotted token at an offset', AB.tokenAt('TL;DR: it works', 3), { term: 'TL;DR', start: 0, end: 5 });
eq('no token on a space', AB.tokenAt('the API', 3), null);
eq('no token on a plain word', AB.tokenAt('the word', 5), null);

// ── askable ──
eq('capitals are askable', AB.askable('CDP'), true);
eq('dotted forms are askable', AB.askable('e.g.'), true);
eq('a lowercase word is not askable', AB.askable('imo'), false);
eq('shouting is not askable', AB.askable('THE', 'THE QUICK BROWN FOX JUMPS'), false);

// ── believable: the check on every model answer ──
eq('capitals spell', AB.believable('API', 'Application Programming Interface'), true);
eq('stop words are skipped', AB.believable('SaaS', 'Software as a Service'), true);
eq('semicolon form spells', AB.believable('TL;DR', "Too Long; Didn't Read"), true);
eq('Latin form spells', AB.believable('e.g.', 'exempli gratia'), true);
eq('lowercase form spells', AB.believable('imo', 'In My Opinion'), true);
eq('mixed case takes letters from inside words', AB.believable('IdP', 'Identity Provider'), true);
eq('a word can give its first letters', AB.believable('REST', 'Representational State Transfer'), true);
eq('a compound word can give two letters', AB.believable('HTTPS', 'Hypertext Transfer Protocol Secure'), true);
eq('one word is not enough', AB.believable('KB', 'Kilobyte'), false);
eq('a plural spells its singular', AB.believable('APIs', 'Application Programming Interface'), true);
eq('a trailing (API) is ignored', AB.believable('API', 'Application Programming Interface (API)'), true);
eq('a wrong answer does not spell', AB.believable('WSS', 'Webhook Secret Store Value'), false);
eq('an ordinary word does not spell', AB.believable('the', 'The'), false);
eq('an empty answer does not spell', AB.believable('API', ''), false);

// ── resolve ──
const found = { API: { standsFor: 'Application Programming Interface', gloss: '' }, 'e.g.': { standsFor: 'exempli gratia', gloss: 'for example' } };
eq('from the agent', AB.resolve('API', {}, found), { term: 'API', meanings: ['Application Programming Interface'], gloss: '', source: 'context' });
eq('with a gloss', AB.resolve('e.g.', {}, found).gloss, 'for example');
eq('plural falls back', AB.resolve('APIs', {}, found).term, 'API');
eq('a trailing colon is ignored', AB.resolve('API:', {}, found).term, 'API');
eq('the page wins', AB.resolve('API', { API: 'Acme Payments Index' }, found).source, 'page');
eq('unknown', AB.resolve('ZZQX', {}, found), null);

// ── termPattern ──
const p = AB.termPattern(['TL;DR', 'e.g.', 'imo', 'API']);
eq('finds every known term, plurals too', 'TL;DR: imo the APIs, e.g. this'.match(p), ['TL;DR', 'imo', 'APIs', 'e.g.']);
eq('not inside other words', 'apimo timothy'.match(p), null);
eq('nothing known, no pattern', AB.termPattern([]), null);

// ── Page definitions ──
const defs = (t) => AB.definitions(t);
eq('words then term', defs('Use Single Sign-On (SSO) for staff.'), { SSO: 'Single Sign-On' });
eq('term then words', defs('Turn on SSO (Single Sign-On) first.'), { SSO: 'Single Sign-On' });
eq('stop words', defs('Sold as Software as a Service (SaaS).'), { SaaS: 'Software as a Service' });
eq('capitals inside a word', defs('Data is JavaScript Object Notation (JSON).'), { JSON: 'JavaScript Object Notation' });
eq('lowercase words', defs('a customer data platform (CDP) holds it'), { CDP: 'customer data platform' });
eq('plural in parens', defs('Service Level Objectives (SLOs) are set'), { SLO: 'Service Level Objectives' });
eq('words that do not spell it', defs('See the docs (API) and more.'), {});
eq('a note in parens is not a definition', defs('Use the API (see below).'), {});

// ── Search ──
eq('search url', AB.searchUrl({ term: 'API', meanings: ['Application Programming Interface'] }), 'https://www.google.com/search?q=API%20Application%20Programming%20Interface');

// ── No word lists ──
// Meanings come from the page and the model only. A list of abbreviations,
// or of words that are not ones, does not belong in the extension.
const src = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(src, { recursive: true }).filter((f) => /\.(js|jsx)$/.test(f));
eq('no dictionary file', fs.existsSync(path.join(src, 'dict.js')), false);
const listy = files.filter((f) => /\bDICT\b|WORDLIKE|PLAIN_CAPS/.test(fs.readFileSync(path.join(src, f), 'utf8')));
eq('no word-list names in the source', listy, []);

console.log(`${checks - failures}/${checks} passed`);
process.exit(failures ? 1 : 0);
