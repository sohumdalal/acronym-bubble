// Finds abbreviations on the page, underlines them faintly, and shows a
// bubble with what one stands for when the pointer rests on it.
//
// Meanings come from two places, and nothing in the extension lists them:
// - the page itself: "Single Sign-On (SSO)" and <abbr title>, at once;
// - the agent (src/agent/, run by the background worker), which reads the
//   page's text in pieces when the page is idle and says which
//   abbreviations it holds and what they stand for here. Its answers are
//   underlined as they arrive.
// Resting on something shaped like an abbreviation that the agent has not
// read yet opens a bubble with a spinner, which fills in when it answers.
//
// The page's DOM is never changed. The underline is a CSS custom highlight
// over Ranges, and the hover reads the word under the pointer with
// caretPositionFromPoint, so a page's own scripts never see our nodes.
(() => {
  const AB = self.AB;
  const NAME = 'acronym-bubble';
  const DEFAULTS = { enabled: true, disabledHosts: [], underline: 'every', trigger: 'hover', agent: 'device', pdf: true };
  const DELAY = 300; // pointer rest before a bubble opens
  const SWAP = 120; // ...or before it moves to another word once open
  const GRACE = 140; // time to cross from the word into the bubble
  const MAX_MARKS = 5000;
  const CHUNK = 3000; // characters the agent reads at a time
  const READ_MAX = 30000; // characters it reads from one page, at most
  const CONTEXT = 600; // characters around a word it reads on its own
  const BLOCK = 'p,li,td,th,dd,dt,blockquote,figcaption,caption,h1,h2,h3,h4,h5,h6,section,article,main';
  // Chrome shows a plain-text file (.txt, a raw .md, JSON) as one <pre> in a
  // page it builds. That <pre> is the document, not a code block.
  const TEXT_FILE = !/html|xml|svg/.test(document.contentType);
  const SKIP = `script,style,noscript,template,textarea,input,select,code,${TEXT_FILE ? '' : 'pre,'}kbd,samp,var,svg,math,[contenteditable=""],[contenteditable="true"],[data-acronym-bubble]`;

  // In the PDF viewer the site is the PDF's, not the extension's.
  const pdfFile = location.protocol === 'chrome-extension:' && new URLSearchParams(location.search).get('file');
  const site = (pdfFile ? new URL(pdfFile, location.href).hostname : location.hostname).replace(/^www\./, '');
  let settings = { ...DEFAULTS };
  let on = false;
  let agent = { ready: false }; // from the background worker: { agent, ready, reason }

  let page = {}; // term -> meaning, from this page's own text
  let found = {}; // term -> { standsFor, gloss }, from the agent
  let pattern = null; // finds every term in page and found
  const seen = new Set(); // terms underlined, for underline: 'first'
  const marks = new Highlight();
  let observer = null;

  // ── Scan ──────────────────────────────────────────────────────────────

  function allowed(node) {
    const el = node.parentElement;
    return !!el && !el.closest(SKIP) && !el.isContentEditable;
  }

  function textNodes(root) {
    if (root.nodeType === Node.TEXT_NODE) return allowed(root) ? [root] : [];
    const out = [];
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (/[A-Za-z]{2}/.test(n.nodeValue) && allowed(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    while (walk.nextNode()) out.push(walk.currentNode);
    return out;
  }

  // The page's own definitions: "Single Sign-On (SSO)" and <abbr title>.
  function learn(root, nodes) {
    const defs = AB.definitions(nodes.map((n) => n.nodeValue).join(' '));
    if (root.querySelectorAll) {
      for (const abbr of root.querySelectorAll('abbr[title]')) {
        const term = abbr.textContent.trim();
        if (/^[A-Za-z][A-Za-z0-9&.;]*$/.test(term) && abbr.title.trim()) defs[term] = abbr.title.trim();
      }
    }
    let changed = false;
    for (const [term, meaning] of Object.entries(defs)) {
      if (page[term]) continue;
      page[term] = meaning;
      changed = true;
    }
    if (changed) known();
  }

  function known() {
    pattern = AB.termPattern([...Object.keys(page), ...Object.keys(found)]);
  }

  function mark(nodes) {
    if (settings.underline === 'none' || !pattern) return;
    for (const node of nodes) {
      const text = node.nodeValue;
      if (AB.shouty(text)) continue;
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(text))) {
        if (marks.size >= MAX_MARKS) return;
        const hit = AB.resolve(m[0], page, found);
        if (!hit) continue;
        if (settings.underline === 'first') {
          if (seen.has(hit.term)) continue;
          seen.add(hit.term);
        }
        const range = new Range();
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        marks.add(range);
      }
    }
  }

  function remark() {
    marks.clear();
    seen.clear();
    mark(textNodes(document.body));
  }

  function scan(root) {
    const nodes = textNodes(root);
    learn(root, nodes);
    mark(nodes);
    queue(nodes);
  }

  // Pages that load more as you read: scan what was added, in one go.
  let added = [];
  let flushTimer = 0;
  function onMutate(records) {
    for (const r of records) {
      if (r.type === 'characterData') added.push(r.target);
      else for (const n of r.addedNodes) added.push(n);
    }
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      const roots = added.filter((n) => n.isConnected);
      added = [];
      for (const r of marks) if (r.collapsed) marks.delete(r);
      for (const root of roots) scan(root);
    }, 400);
  }

  // ── The agent reads the page ──────────────────────────────────────────

  let waiting = []; // text nodes not yet sent
  let budget = READ_MAX;
  let sending = Promise.resolve();
  let readOf = new WeakMap(); // text node -> the read that covers it
  let finished = new WeakSet(); // text nodes the agent has read
  let idle = 0;

  function queue(nodes) {
    if (!agent.ready || budget <= 0) return;
    waiting.push(...nodes);
    if (!idle) idle = requestIdleCallback(sendWaiting, { timeout: 1500 });
  }

  // Groups waiting text into pieces of about CHUNK characters and sends them
  // one after another. Each node knows which piece covers it, so a hover can
  // wait for that answer.
  function sendWaiting() {
    idle = 0;
    while (waiting.length && budget > 0) {
      const group = [];
      let size = 0;
      while (waiting.length && size < CHUNK) {
        const node = waiting.shift();
        if (!node.isConnected || readOf.has(node)) continue;
        group.push(node);
        size += node.nodeValue.length + 1;
      }
      if (!group.length) break;
      budget -= size;
      const text = group.map((n) => n.nodeValue.replace(/\s+/g, ' ').trim()).join('\n');
      const read = (sending = sending.then(() => ask(text)));
      for (const n of group) readOf.set(n, read);
      (async () => {
        await read;
        for (const n of group) finished.add(n);
      })();
    }
    waiting = [];
  }

  // The agent's answer for a piece of text. Every term it gives is checked:
  // its words must spell its letters. New terms are underlined at once.
  async function ask(text) {
    let items = null;
    try {
      ({ items } = await chrome.runtime.sendMessage({ type: 'read', text, title: document.title }));
    } catch {}
    if (!on || !items) return;
    let changed = false;
    for (const { term, standsFor, gloss } of items) {
      if (found[term] || page[term] || !AB.believable(term, standsFor)) continue;
      found[term] = { standsFor, gloss };
      changed = true;
    }
    if (changed) {
      known();
      remark();
    }
  }

  // About CONTEXT characters of the block a word sits in, centred on it.
  function contextOf(hit) {
    const block = hit.node.parentElement.closest(BLOCK) || hit.node.parentElement;
    const before = new Range();
    before.setStart(block, 0);
    before.setEnd(hit.node, hit.start);
    const at = before.toString().length;
    const text = block.textContent;
    const from = Math.max(0, Math.min(at - CONTEXT / 2, text.length - CONTEXT));
    return text.slice(from, from + CONTEXT).replace(/\s+/g, ' ').trim();
  }

  // The read that covers a hovered word: the piece its text was sent in, or,
  // past the page's budget, the text around it on its own.
  const alone = new Map();
  function readFor(hit) {
    if (readOf.has(hit.node)) return readOf.get(hit.node);
    const text = contextOf(hit);
    // Not behind the page's queue: the pointer is waiting on this one.
    if (!alone.has(text)) alone.set(text, ask(text));
    return alone.get(text);
  }

  // ── Hover ─────────────────────────────────────────────────────────────

  let pointer = null; // { x, y, alt }
  let frame = 0;
  let current = null; // the hit the bubble shows
  let openTimer = 0;
  let hideTimer = 0;
  let overBubble = false;

  // The term under offset i: a known one first, then anything shaped like
  // an abbreviation.
  function termAt(text, i) {
    if (pattern && !AB.shouty(text)) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(text))) {
        if (m.index > i) break;
        if (i < m.index + m[0].length) return { term: m[0], start: m.index, end: m.index + m[0].length };
      }
    }
    return AB.tokenAt(text, i);
  }

  // The abbreviation under a point, or null. One the agent has not read yet
  // comes back with source 'loading'.
  function hitAt(x, y) {
    const pos = document.caretPositionFromPoint(x, y);
    if (!pos || !pos.offsetNode || pos.offsetNode.nodeType !== Node.TEXT_NODE) return null;
    const node = pos.offsetNode;
    if (!allowed(node)) return null;
    const text = node.nodeValue;
    // The caret can sit just after the last letter of the word.
    for (const i of [pos.offset, pos.offset - 1]) {
      const tok = termAt(text, i);
      if (!tok) continue;
      const range = new Range();
      range.setStart(node, tok.start);
      range.setEnd(node, tok.end);
      const rect = [...range.getClientRects()].find((b) => x >= b.left - 1 && x <= b.right + 1 && y >= b.top - 1 && y <= b.bottom + 1);
      if (!rect) return null;
      const at = { node, start: tok.start, rect };
      const hit = !AB.shouty(text) && AB.resolve(tok.term, page, found);
      if (hit) return { ...hit, ...at };
      // Read already, and not an abbreviation there.
      if (!agent.ready || !AB.askable(tok.term, text) || finished.has(node) || settled(node, tok.term)) return null;
      return { term: tok.term, meanings: [], gloss: '', source: 'loading', ...at };
    }
    return null;
  }

  // Words the agent read on their own and found nothing in, per text node.
  let nothing = new WeakMap();
  const settled = (node, term) => !!nothing.get(node)?.has(term);

  const same = (a, b) => a && b && a.node === b.node && a.start === b.start;

  // The pointer is still on the word the bubble shows.
  const onWord = () => {
    const r = current && current.rect;
    return !!(r && pointer && pointer.x >= r.left - 1 && pointer.x <= r.right + 1 && pointer.y >= r.top - 1 && pointer.y <= r.bottom + 1);
  };

  function check() {
    frame = 0;
    if (!on || !pointer) return;
    let hit = hitAt(pointer.x, pointer.y);
    if (hit && settings.trigger === 'alt' && !pointer.alt && !same(hit, current)) hit = null;
    if (same(hit, current)) {
      clearTimeout(hideTimer);
      return;
    }
    clearTimeout(openTimer);
    if (!hit) {
      if (current && !overBubble) hideSoon();
      return;
    }
    openTimer = setTimeout(() => show(hit), current ? SWAP : DELAY);
  }

  function onMove(e) {
    // A held button is a text selection or a drag.
    if (e.buttons) return;
    // On the bubble itself, which mouseenter can miss while it springs in.
    if (e.target instanceof Element && e.target.hasAttribute('data-acronym-bubble')) {
      overBubble = true;
      clearTimeout(hideTimer);
      return;
    }
    pointer = { x: e.clientX, y: e.clientY, alt: e.altKey };
    if (!frame) frame = requestAnimationFrame(check);
  }

  // The pointer left this document: out of the window, or out of this frame
  // into its parent. No more mousemoves come here, so close now.
  function onOut(e) {
    if (e.relatedTarget || overBubble) return;
    pointer = null;
    clearTimeout(openTimer);
    if (current) hideSoon();
  }

  function onKey(e) {
    if (e.key === 'Escape') hide();
    if (e.key === 'Alt' && settings.trigger === 'alt' && pointer) {
      pointer.alt = e.type === 'keydown';
      if (pointer.alt && !frame) frame = requestAnimationFrame(check);
    }
  }

  function hideSoon() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, GRACE);
  }

  // ── Bubble ────────────────────────────────────────────────────────────

  let bubble = null;
  function loadBubble() {
    bubble =
      bubble ||
      (async () => {
        try {
          const m = await import(chrome.runtime.getURL('dist/bubble.js'));
          return await m.mount({
            cssUrl: chrome.runtime.getURL('dist/mova.css'),
            onEnter: () => {
              overBubble = true;
              clearTimeout(hideTimer);
            },
            // The bubble can spring under a pointer that rests on the word
            // and away again; that is not the pointer leaving.
            onLeave: () => {
              overBubble = false;
              if (!onWord()) hideSoon();
            },
            onMore: () => setTimeout(hide, 0),
          });
        } catch (err) {
          console.warn('[Acronym Bubble] the bubble did not load, using the plain one:', err);
          return plainBubble();
        }
      })();
    return bubble;
  }

  // Light or dark, from the background the word is drawn on.
  function themeAt(el) {
    for (; el; el = el.parentElement) {
      const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
      if (!m || (m.length > 3 && +m[3] < 0.5)) continue;
      const [r, g, b] = m.map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128 ? 'dark' : 'light';
    }
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // Opens the bubble. A word still loading shows a spinner until the agent
  // has read it; then it shows the meaning, or closes if there is none.
  function show(hit) {
    clearTimeout(hideTimer);
    current = hit;
    render(hit);
    if (hit.source !== 'loading') return;
    (async () => {
      await readFor(hit);
      const next = AB.resolve(hit.term, page, found);
      if (!next) nothing.set(hit.node, (nothing.get(hit.node) || new Set()).add(hit.term));
      if (current !== hit) return;
      if (!next) return hide();
      current = { ...hit, ...next };
      render(current);
    })();
  }

  function render(hit) {
    const theme = themeAt(hit.node.parentElement);
    const view = {
      key: `${hit.term}:${hit.start}:${Math.round(hit.rect.top)}:${Math.round(hit.rect.left)}`,
      term: hit.term,
      meanings: hit.meanings,
      gloss: hit.gloss,
      source: hit.source,
      url: AB.searchUrl(hit),
      rect: { top: hit.rect.top, bottom: hit.rect.bottom, left: hit.rect.left, width: hit.rect.width },
    };
    (async () => {
      const b = await loadBubble();
      if (current === hit) b.show(view, theme);
    })();
  }

  function hide() {
    clearTimeout(openTimer);
    clearTimeout(hideTimer);
    if (!current) return;
    current = null;
    overBubble = false;
    if (bubble) (async () => (await bubble).hide())();
  }

  // Used only if dist/bubble.js fails to load: the same words, no motion.
  function plainBubble() {
    const host = document.createElement('div');
    host.setAttribute('data-acronym-bubble', '');
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;display:none;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      div{max-width:280px;padding:7px 10px 8px;border-radius:10px;background:rgba(255,255,255,.88);color:#0b0b0c;
        border:1px solid rgba(0,0,0,.08);box-shadow:0 1px 2px rgba(0,0,0,.06),0 8px 24px -6px rgba(0,0,0,.22);
        -webkit-backdrop-filter:saturate(180%) blur(14px);backdrop-filter:saturate(180%) blur(14px);
        font:400 15px/1.4 FerrariSans,-apple-system,system-ui,sans-serif}
      b{font-size:11.5px;font-weight:600;opacity:.55} a{color:#007aff;font-size:11.5px;margin-left:12px;text-decoration:none}
      .dark{background:rgba(28,28,30,.86);color:#f5f5f7;border-color:rgba(255,255,255,.1)} .dark a{color:#0a84ff}
    </style><div><b></b><a target="_blank" rel="noopener noreferrer">More ↗</a><br><span></span></div>`;
    host.addEventListener('mouseenter', () => ((overBubble = true), clearTimeout(hideTimer)));
    host.addEventListener('mouseleave', () => ((overBubble = false), hideSoon()));
    document.documentElement.append(host);
    return {
      show(view, theme) {
        shadow.querySelector('div').className = theme;
        shadow.querySelector('b').textContent = view.term;
        shadow.querySelector('span').textContent = view.source === 'loading' ? '…' : [view.meanings[0], view.gloss].filter(Boolean).join(' · ');
        shadow.querySelector('a').href = view.url;
        host.style.display = 'block';
        host.style.left = `${Math.max(8, view.rect.left)}px`;
        host.style.top = `${view.rect.bottom + 8}px`;
      },
      hide() {
        host.style.display = 'none';
      },
    };
  }

  // ── On and off ────────────────────────────────────────────────────────

  async function start() {
    on = true;
    try {
      agent = await chrome.runtime.sendMessage({ type: 'agent-status' });
    } catch {
      agent = { ready: false };
    }
    if (!on) return;
    CSS.highlights.set(NAME, marks);
    scan(document.body);
    observer = new MutationObserver(onMutate);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseout', onOut, { passive: true });
    addEventListener('keydown', onKey, true);
    addEventListener('keyup', onKey, true);
    addEventListener('scroll', hide, { passive: true, capture: true });
    addEventListener('blur', hide);
  }

  function stop() {
    on = false;
    hide();
    if (observer) observer.disconnect();
    clearTimeout(flushTimer);
    if (idle) cancelIdleCallback(idle);
    idle = 0;
    added = [];
    waiting = [];
    budget = READ_MAX;
    readOf = new WeakMap();
    finished = new WeakSet();
    nothing = new WeakMap();
    alone.clear();
    page = {};
    found = {};
    pattern = null;
    marks.clear();
    seen.clear();
    CSS.highlights.delete(NAME);
    removeEventListener('mousemove', onMove, { passive: true });
    document.removeEventListener('mouseout', onOut, { passive: true });
    removeEventListener('keydown', onKey, true);
    removeEventListener('keyup', onKey, true);
    removeEventListener('scroll', hide, { capture: true });
    removeEventListener('blur', hide);
  }

  function apply(next) {
    settings = { ...DEFAULTS, ...(next || {}) };
    const want = settings.enabled && !settings.disabledHosts.includes(site);
    if (on) stop();
    if (want) start();
  }

  if (!document.body || !CSS.highlights || !document.caretPositionFromPoint) return;
  (async () => apply((await chrome.storage.sync.get('settings')).settings))();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) apply(changes.settings.newValue);
    // A new Claude key, or the agent's state after a rejected one.
    if (area === 'local' && (changes.claudeKey || changes.claudeBaseUrl)) apply(settings);
  });
})();
