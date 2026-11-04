// Small fetch helpers: a concurrency pool, a timeout, and one honest
// User-Agent. Concurrency is low on purpose: this reads other people's
// sites, and a scan is not an excuse to hammer them.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/131.0 Safari/537.36 AcronymBubbleScan/1.0 (+https://github.com/sohumdalal/acronym-bubble)';

async function get(url, { timeout = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      // Chrome's own Accept header. Asking for text/markdown gets some sites
      // (Cloudflare's, AWS docs) to send Markdown a browser never sees.
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    });
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    // A PDF's text needs a PDF reader; the scan only notes that it is one.
    const body = res.ok && type !== 'application/pdf' ? await res.text() : '';
    return { ok: res.ok, status: res.status, type, body, url: res.url };
  } catch (err) {
    return { ok: false, status: 0, type: '', body: '', url, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function pool(items, size, worker) {
  const out = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

// Non-empty, non-comment lines of a list file, without trailing comments.
function lines(file) {
  return require('fs')
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((l) => l.replace(/\s+#.*$/, '').trim())
    .filter((l) => l && !l.startsWith('#'));
}

module.exports = { get, pool, lines, UA };
