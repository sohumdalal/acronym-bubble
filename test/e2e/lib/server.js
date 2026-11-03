// Serves test/e2e/sites with the content type each file format really has,
// on two ports: the second is another origin, for cross-origin frames.
// csp.html gets a strict Content-Security-Policy, as locked-down sites do.
const fs = require('fs');
const http = require('http');
const path = require('path');

const SITES = path.join(__dirname, '..', 'sites');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};
const HEADERS = {
  'csp.html': { 'content-security-policy': "default-src 'none'" },
};

function listen() {
  const server = http.createServer((req, res) => {
    const name = path.basename(new URL(req.url, 'http://x').pathname);
    // An app's pushState URL (/spa/next) reloads as the app itself.
    const file = path.join(SITES, req.url.startsWith('/spa/') ? 'spa.html' : name || 'docs.html');
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, ...(HEADERS[path.basename(file)] || {}) }).end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function serve() {
  const [a, b] = await Promise.all([listen(), listen()]);
  return {
    port: a.address().port,
    other: b.address().port,
    url: (p) => `http://127.0.0.1:${a.address().port}/${p}`,
    close: () => (a.close(), b.close()),
  };
}

module.exports = { serve, SITES };
