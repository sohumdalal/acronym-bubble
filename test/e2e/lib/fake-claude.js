// A stand-in for the Anthropic Messages API, so the e2e suite runs the
// extension's real Claude path (src/agent/agent.js, through the SDK) with no
// key, no network and no cost. It answers like Claude Haiku would, from a
// small test lexicon: the abbreviations in the fixture pages and what they
// stand for. Test data only; the extension itself lists none.
//
//   const claude = await fakeClaude({ delay: 600 });
//   claude.url       // set as claudeBaseUrl in the extension's storage.local
//   claude.requests  // the request bodies it got
//   claude.delay(ms) // answer more slowly from now on
const http = require('http');

const LEXICON = {
  API: ['Application Programming Interface'],
  CDN: ['Content Delivery Network'],
  CI: ['Continuous Integration'],
  HTTPS: ['Hypertext Transfer Protocol Secure'],
  IdP: ['Identity Provider'],
  IT: ['Information Technology'],
  JSON: ['JavaScript Object Notation'],
  JWT: ['JSON Web Token'],
  PR: ['Pull Request'],
  REST: ['Representational State Transfer'],
  SDK: ['Software Development Kit'],
  SLA: ['Service Level Agreement'],
  SRE: ['Site Reliability Engineering'],
  SSO: ['Single Sign-On'],
  TLS: ['Transport Layer Security'],
  DNS: ['Domain Name System'],
  gRPC: ['gRPC Remote Procedure Call'],
  'TL;DR': ["Too Long; Didn't Read"],
  'e.g.': ['exempli gratia', 'for example'],
  imo: ['In My Opinion'],
  lgtm: ['Looks Good To Me'],
  // A wrong answer, to check the extension drops what does not spell.
  WSS: ['Webhook Secret Store Value'],
};

function find(text) {
  const out = [];
  for (const [term, [stands_for, gloss = '']] of Object.entries(LEXICON)) {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?<![A-Za-z0-9&])${esc}s?(?![A-Za-z0-9&])`).test(text)) out.push({ term, stands_for, gloss });
  }
  return out;
}

function fakeClaude({ delay = 300 } = {}) {
  const requests = [];
  let wait = delay;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) return res.writeHead(404).end();
      const json = JSON.parse(body);
      // SDK 1.x sends the key as a bearer token; older ones as x-api-key.
      const key = req.headers['x-api-key'] || String(req.headers.authorization || '').replace(/^Bearer /, '');
      requests.push({ ...json, key });
      if (key === 'bad') {
        return res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
      }
      const text = json.messages[0].content.split('\nText:\n').pop();
      const message = {
        id: `msg_test_${requests.length}`,
        type: 'message',
        role: 'assistant',
        model: json.model,
        content: [{ type: 'text', text: JSON.stringify({ abbreviations: find(text) }) }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      };
      setTimeout(() => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(message)), wait);
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ url: `http://127.0.0.1:${server.address().port}`, requests, delay: (ms) => (wait = ms), close: () => server.close() }),
    ),
  );
}

module.exports = { fakeClaude, LEXICON };
