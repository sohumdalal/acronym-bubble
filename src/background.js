// The keyboard shortcut, an OFF badge on the toolbar icon while the
// extension is turned off, the abbreviation agent that reads pages for the
// content script, and sending PDFs to the extension's own viewer.
//
// An ES module: `bun run build` bundles it, with the Anthropic SDK, to
// dist/background.js.
import { read, deviceStatus } from './agent/agent.js';

const DEFAULTS = { enabled: true, disabledHosts: [], underline: 'every', trigger: 'hover', agent: 'device', pdf: true };

async function current() {
  const { settings } = await chrome.storage.sync.get('settings');
  return { ...DEFAULTS, ...(settings || {}) };
}

async function badge(settings) {
  await chrome.action.setBadgeBackgroundColor({ color: '#181818' });
  await chrome.action.setBadgeText({ text: settings.enabled ? '' : 'OFF' });
}

chrome.runtime.onInstalled.addListener(async () => badge(await current()));
chrome.runtime.onStartup.addListener(async () => badge(await current()));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) badge({ ...DEFAULTS, ...changes.settings.newValue });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle') return;
  const settings = await current();
  await chrome.storage.sync.set({ settings: { ...settings, enabled: !settings.enabled } });
});

// ── The agent ───────────────────────────────────────────────────────────
// The content script sends pieces of the page here; one agent serves every
// tab. The Claude key lives in storage.local, never storage.sync, so it is
// not copied to other browsers through Chrome sync.

async function agentConfig() {
  const { agent } = await current();
  const { claudeKey = '', claudeBaseUrl = '' } = await chrome.storage.local.get(['claudeKey', 'claudeBaseUrl']);
  return { agent, apiKey: claudeKey, baseURL: claudeBaseUrl };
}

// Whether the chosen model can answer now, for the content script and the
// popup: { agent, ready, reason }.
async function status() {
  const config = await agentConfig();
  const { agentError = '' } = await chrome.storage.local.get('agentError');
  if (config.agent === 'claude') return { agent: 'claude', ready: !!config.apiKey && agentError !== 'key', reason: config.apiKey ? agentError : 'nokey' };
  const device = await deviceStatus();
  return { agent: 'device', ready: device === 'available', reason: device };
}

// Answers already given, so the same text is not read twice. Only a cache:
// a worker that stops loses it.
const answers = new Map();
const MAX_ANSWERS = 300;

async function answer({ text, title }) {
  const config = await agentConfig();
  const key = `${config.agent}\n${title}\n${text}`;
  if (answers.has(key)) return answers.get(key);
  try {
    const items = await read({ text, title }, config);
    await chrome.storage.local.set({ agentError: '' });
    if (items) {
      answers.set(key, items);
      if (answers.size > MAX_ANSWERS) answers.delete(answers.keys().next().value);
    }
    return items;
  } catch (err) {
    console.warn('[Acronym Bubble] the agent did not answer:', err);
    await chrome.storage.local.set({ agentError: err.reason || 'error' });
    return null;
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'read') {
    (async () => reply({ items: await answer(msg) }))();
    return true;
  }
  if (msg?.type === 'agent-status') {
    (async () => reply(await status()))();
    return true;
  }
  return false;
});

// ── PDFs ────────────────────────────────────────────────────────────────
// Chrome's PDF viewer runs no content scripts, so a PDF opened in a tab
// goes to src/pdf/viewer.html instead, which draws it with PDF.js and runs
// the extension's own scripts over its text. The response's content type
// decides, because many PDF URLs do not end in .pdf. Downloads, POST
// results and PDFs inside frames are left to Chrome. "Open in Chrome's
// viewer" lets the next load of that one URL through.
//
// The headers only mark the tab. It moves once Chrome has committed the
// PDF's navigation: a tab moved before that is moved back by the navigation
// still in flight.

const VIEWER = chrome.runtime.getURL('src/pdf/viewer.html');
const viewerFor = (url) => `${VIEWER}?file=${encodeURIComponent(url)}`;

async function takesPdfs() {
  const s = await current();
  return s.enabled && s.pdf;
}

// URLs to let through once, kept in session storage because the worker can
// stop between the click and the load.
async function passOnce(url) {
  const { pdfBypass = [] } = await chrome.storage.session.get('pdfBypass');
  if (!pdfBypass.includes(url)) return false;
  await chrome.storage.session.set({ pdfBypass: pdfBypass.filter((u) => u !== url) });
  return true;
}

// Tabs loading a PDF, as tab id -> URL, in session storage so a worker that
// stops between the headers and the commit still knows. The map in memory
// answers when the commit comes before the storage write has finished.
const pending = new Map();
const key = (tabId) => `pdfPending:${tabId}`;

async function takePending(tabId) {
  const k = key(tabId);
  const { [k]: stored } = await chrome.storage.session.get(k);
  const url = pending.get(tabId) || stored;
  pending.delete(tabId);
  if (stored) await chrome.storage.session.remove(k);
  return url;
}

chrome.webRequest.onHeadersReceived.addListener(
  (d) => {
    if (d.tabId < 0 || d.method !== 'GET') return;
    const header = (name) => (d.responseHeaders.find((h) => h.name.toLowerCase() === name) || {}).value || '';
    if (!/^application\/(x-)?pdf\b/i.test(header('content-type'))) return;
    if (/^\s*attachment/i.test(header('content-disposition'))) return;
    pending.set(d.tabId, d.url);
    chrome.storage.session.set({ [key(d.tabId)]: d.url });
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
  ['responseHeaders'],
);

// Local files have no HTTP headers, so the name decides. Needs "Allow access
// to file URLs" on the extension's card.
chrome.webNavigation.onCommitted.addListener(async ({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  const pdf = (await takePending(tabId)) === url || /^file:.*\.pdf$/i.test(url);
  if (!pdf || !(await takesPdfs()) || (await passOnce(url))) return;
  await chrome.tabs.update(tabId, { url: viewerFor(url) });
});
chrome.tabs.onRemoved.addListener((tabId) => takePending(tabId));

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'pdf-bypass') return false;
  (async () => {
    const { pdfBypass = [] } = await chrome.storage.session.get('pdfBypass');
    await chrome.storage.session.set({ pdfBypass: [...pdfBypass, msg.url] });
    reply(true);
  })();
  return true;
});
