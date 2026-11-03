// Finds acronyms on the page, underlines them faintly, and shows a bubble
// with what one stands for when the pointer rests on it.
//
// The page's DOM is never changed. The underline is a CSS custom highlight
// over Ranges, and the hover reads the word under the pointer with
// caretPositionFromPoint, so a page's own scripts never see our nodes.
(() => {
  const AB = self.AB;
  const NAME = 'acronym-bubble';
  const DEFAULTS = { enabled: true, disabledHosts: [], underline: 'every', trigger: 'hover', context: true };
  const DELAY = 300; // pointer rest before a bubble opens
  const SWAP = 120; // ...or before it moves to another acronym once open
  const GRACE = 140; // time to cross from the word into the bubble
  const MAX_MARKS = 5000;
  const BLOCK = 'p,li,td,th,dd,dt,blockquote,figcaption,caption,h1,h2,h3,h4,h5,h6,section,article,main';
  const CONTEXT = 600; // characters of text around the acronym that the model reads
  const SKIP = 'script,style,noscript,template,textarea,input,select,code,pre,kbd,samp,var,svg,math,[contenteditable=""],[contenteditable="true"],[data-acronym-bubble]';

  const site = location.hostname.replace(/^www\./, '');
  let settings = { ...DEFAULTS };
  let on = false;

  const page = {}; // term -> meaning, from this page's own text
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
      acceptNode: (n) => (/[A-Z].*[A-Z]/s.test(n.nodeValue) && allowed(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    while (walk.nextNode()) out.push(walk.currentNode);
    return out;
  }

  // The page's own definitions: "Single Sign-On (SSO)" and <abbr title>.
  function learn(root, nodes) {
    const found = AB.definitions(nodes.map((n) => n.nodeValue).join(' '));
    if (root.querySelectorAll) {
      for (const abbr of root.querySelectorAll('abbr[title]')) {
        const term = abbr.textContent.trim();
        if (/^[A-Za-z][A-Za-z0-9&]*$/.test(term) && abbr.title.trim()) found[term] = abbr.title.trim();
      }
    }
    for (const [term, meaning] of Object.entries(found)) if (!page[term]) page[term] = meaning;
  }

  function mark(nodes) {
    if (settings.underline === 'none') return;
    for (const node of nodes) {
      const text = node.nodeValue;
      AB.TOKEN.lastIndex = 0;
      let m;
      while ((m = AB.TOKEN.exec(text))) {
        if (marks.size >= MAX_MARKS) return;
        const hit = AB.resolve(m[0], page, text);
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

  function scan(root) {
    const nodes = textNodes(root);
    learn(root, nodes);
    mark(nodes);
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

  // ── Hover ─────────────────────────────────────────────────────────────

  let pointer = null; // { x, y, alt }
  let frame = 0;
  let current = null; // the hit the bubble shows
  let openTimer = 0;
  let hideTimer = 0;
  let overBubble = false;

  // The acronym under a point, or null.
  function hitAt(x, y) {
    const pos = document.caretPositionFromPoint(x, y);
    if (!pos || !pos.offsetNode || pos.offsetNode.nodeType !== Node.TEXT_NODE) return null;
    const node = pos.offsetNode;
    if (!allowed(node)) return null;
    const text = node.nodeValue;
    // The caret can sit just after the last letter of the word.
    for (const i of [pos.offset, pos.offset - 1]) {
      const tok = AB.tokenAt(text, i);
      if (!tok) continue;
      const range = new Range();
      range.setStart(node, tok.start);
      range.setEnd(node, tok.end);
      const rect = [...range.getClientRects()].find((b) => x >= b.left - 1 && x <= b.right + 1 && y >= b.top - 1 && y <= b.bottom + 1);
      if (!rect) return null;
      const hit = AB.resolve(tok.term, page, text) || (settings.context && AB.askable(tok.term, text) && { term: tok.term, meanings: [], source: 'unknown' });
      return hit && { ...hit, node, start: tok.start, rect };
    }
    return null;
  }

  const same = (a, b) => a && b && a.node === b.node && a.start === b.start;

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
      import(chrome.runtime.getURL('dist/bubble.js'))
        .then((m) =>
          m.mount({
            cssUrl: chrome.runtime.getURL('dist/mova.css'),
            onEnter: () => {
              overBubble = true;
              clearTimeout(hideTimer);
            },
            onLeave: () => {
              overBubble = false;
              hideSoon();
            },
            onMore: () => setTimeout(hide, 0),
          }),
        )
        .catch((err) => {
          console.warn('[Acronym Bubble] the bubble did not load, using the plain one:', err);
          return plainBubble();
        });
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

  function show(hit) {
    clearTimeout(hideTimer);
    current = hit;
    if (hit.meanings.length) render(hit);
    const ambiguous = hit.source === 'dictionary' && hit.meanings.length > 1;
    if (!settings.context || !(ambiguous || hit.source === 'unknown')) return;
    // The dictionary's answer shows at once; the model's replaces it when it
    // comes. An unknown acronym shows only once the model has an answer.
    ask(hit).then((answer) => {
      if (current !== hit) return;
      const next = AB.inContext(hit, answer);
      if (!next || next === hit) return;
      current = next;
      render(next);
    });
  }

  function render(hit) {
    const theme = themeAt(hit.node.parentElement);
    const view = {
      key: `${hit.term}:${hit.start}:${Math.round(hit.rect.top)}:${Math.round(hit.rect.left)}`,
      term: hit.term,
      meanings: hit.meanings,
      source: hit.source,
      url: AB.searchUrl(hit),
      rect: { top: hit.rect.top, bottom: hit.rect.bottom, left: hit.rect.left, width: hit.rect.width },
    };
    loadBubble().then((b) => current === hit && b.show(view, theme));
  }

  // ── Context ───────────────────────────────────────────────────────────

  // About CONTEXT characters of the block the acronym sits in, centred on it.
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

  // The model's answer, from the background worker, once per acronym and
  // context. Null when the model is missing, busy or has no answer.
  const answers = new Map();
  function ask(hit) {
    const context = contextOf(hit);
    const key = `${hit.term}\n${context}`;
    if (!answers.has(key)) {
      const msg = { type: 'sense', term: hit.term, known: hit.meanings, context, title: document.title };
      answers.set(key, chrome.runtime.sendMessage(msg).catch(() => null));
    }
    return answers.get(key);
  }

  function hide() {
    clearTimeout(openTimer);
    clearTimeout(hideTimer);
    if (!current) return;
    current = null;
    overBubble = false;
    if (bubble) bubble.then((b) => b.hide());
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
        shadow.querySelector('span').textContent = view.meanings.join(' · ');
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

  function start() {
    on = true;
    CSS.highlights.set(NAME, marks);
    scan(document.body);
    observer = new MutationObserver(onMutate);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    addEventListener('mousemove', onMove, { passive: true });
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
    added = [];
    marks.clear();
    seen.clear();
    CSS.highlights.delete(NAME);
    removeEventListener('mousemove', onMove, { passive: true });
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
  chrome.storage.sync.get('settings').then(({ settings: s }) => apply(s));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) apply(changes.settings.newValue);
  });
})();
