// Detection rules, without a browser: node test/find.test.js
globalThis.self = globalThis;
require('../src/dict.js');
require('../src/lib/find.js');
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

// ── Tokens ──
eq('plain capitals', tokens('Call the API over HTTP.'), ['API', 'HTTP']);
eq('mixed case', tokens('SaaS and gRPC and OAuth'), ['SaaS', 'gRPC', 'OAuth']);
eq('ampersand', tokens('AT&T runs R&D'), ['AT&T', 'R&D']);
eq('digits', tokens('IPv6 on EC2'), ['IPv6', 'EC2']);
eq('one capital is not a token', tokens('Hello World a'), []);
eq('camelCase is one token', tokens('fooAPIbar'), ['fooAPIbar']);

// ── tokenAt ──
eq('token at an offset', AB.tokenAt('use the REST API now', 14), { term: 'API', start: 13, end: 16 });
eq('no token on a space', AB.tokenAt('the API', 3), null);
eq('no token on a plain word', AB.tokenAt('the word', 5), null);

// ── resolve ──
eq('dictionary', AB.resolve('API', {}).meanings[0], 'Application Programming Interface');
eq('plural falls back', AB.resolve('APIs', {}).term, 'API');
eq('page wins', AB.resolve('API', { API: 'Acme Payments Index' }), { term: 'API', meanings: ['Acme Payments Index'], source: 'page' });
eq('unknown', AB.resolve('ZZQX', {}), null);
eq('word-like in a sentence', AB.resolve('IT', {}, 'Ask the IT team for access.') !== null, true);
eq('word-like in shouting', AB.resolve('IT', {}, 'IT IS VERY IMPORTANT THAT YOU READ THIS'), null);
eq('acronym in shouting', AB.resolve('API', {}, 'API REFERENCE AND GUIDES') !== null, true);

// ── Page definitions ──
const defs = (t) => AB.definitions(t);
eq('words then term', defs('Use Single Sign-On (SSO) for staff.'), { SSO: 'Single Sign-On' });
eq('term then words', defs('Turn on SSO (Single Sign-On) first.'), { SSO: 'Single Sign-On' });
eq('stop words', defs('Sold as Software as a Service (SaaS).'), { SaaS: 'Software as a Service' });
eq('capitals inside a word', defs('Data is JavaScript Object Notation (JSON).'), { JSON: 'JavaScript Object Notation' });
eq('lowercase words', defs('a customer data platform (CDP) holds it'), { CDP: 'customer data platform' });
eq('plural in parens', defs('Service Level Objectives (SLOs) are set'), { SLO: 'Service Level Objectives' });
eq('shortest run that spells it', defs('We built the Payment Gateway (PG).'), { PG: 'Payment Gateway' });
eq('words that do not spell it', defs('See the docs (API) and more.'), {});
eq('a note in parens is not a definition', defs('Use the API (see below).'), {});

// ── Meaning in context ──
const CI = AB.resolve('CI', {});
eq('the model picks a known meaning', AB.inContext(CI, 'Confidence Interval').meanings, ['Confidence Interval', 'Continuous Integration']);
eq('a pick is marked in context', AB.inContext(CI, 'Confidence Interval').source, 'context');
eq('a pick ignores case and a trailing (CI)', AB.inContext(CI, 'confidence interval (CI)').meanings[0], 'Confidence Interval');
eq('a new meaning that spells it goes first', AB.inContext(CI, 'Configuration Item').meanings, ['Configuration Item', 'Continuous Integration', 'Confidence Interval']);
eq('a new meaning is a guess', AB.inContext(CI, 'Configuration Item').source, 'guess');
eq('an answer that does not spell it is dropped', AB.inContext(CI, 'Build Server'), CI);
eq('no answer keeps the dictionary', AB.inContext(CI, ''), CI);
const unknown = { term: 'CDP', meanings: [], source: 'unknown' };
eq('an unknown acronym gets the model meaning', AB.inContext(unknown, 'Customer Data Platform').meanings, ['Customer Data Platform']);
eq('an unknown acronym with no answer shows nothing', AB.inContext(unknown, ''), null);
eq('all caps is askable', AB.askable('CDP'), true);
eq('a plural is askable', AB.askable('CDPs'), true);
eq('a name is not askable', AB.askable('GitHub'), false);
eq('shouting is not askable', AB.askable('THE', 'THE QUICK BROWN FOX JUMPS'), false);

// ── Search ──
eq('search url', AB.searchUrl({ term: 'API', meanings: ['Application Programming Interface'] }), 'https://www.google.com/search?q=API%20Application%20Programming%20Interface');

// ── Dictionary shape ──
const keys = Object.keys(AB.DICT);
eq('every key is a token', keys.filter((k) => tokens(k)[0] !== k), []);
eq('every word-like key is in the dictionary', [...AB.WORDLIKE].filter((k) => !AB.DICT[k]), []);

console.log(`${checks - failures}/${checks} passed, ${keys.length} acronyms`);
process.exit(failures ? 1 : 0);
