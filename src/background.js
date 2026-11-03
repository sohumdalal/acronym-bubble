// The keyboard shortcut, an OFF badge on the toolbar icon while the
// extension is turned off, and the on-device model that reads an acronym's
// context.
const DEFAULTS = { enabled: true, disabledHosts: [], underline: 'every', trigger: 'hover', context: true };

async function current() {
  const { settings } = await chrome.storage.sync.get('settings');
  return { ...DEFAULTS, ...(settings || {}) };
}

function badge(settings) {
  chrome.action.setBadgeBackgroundColor({ color: '#181818' });
  chrome.action.setBadgeText({ text: settings.enabled ? '' : 'OFF' });
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

// ── Meaning in context ──────────────────────────────────────────────────
// Chrome's on-device model (the Prompt API, Gemini Nano) reads the text
// around an acronym and says which meaning fits: CI is Continuous
// Integration in a build log and Confidence Interval in a psychology paper.
// It runs on this device, so the text never leaves it. It runs here rather
// than in the page, so one session serves every tab and a page's
// permissions policy cannot turn it off. Without the model, the content
// script keeps the dictionary's order.

const LM = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
const SYSTEM = [
  'You expand acronyms. You get an acronym, the text it appears in, the page title, and sometimes the meanings it is known to have.',
  'Answer with what the acronym stands for in that text, as a short phrase in title case, with no explanation.',
  'If one of the known meanings fits, answer with it exactly as written.',
  'If the word is not an acronym here, or you do not know, answer with an empty string.',
].join(' ');
const ANSWER = {
  type: 'object',
  properties: { meaning: { type: 'string', maxLength: 120 } },
  required: ['meaning'],
  additionalProperties: false,
};

let base = null; // a session with the system prompt, cloned for each question

async function ready() {
  return typeof LanguageModel !== 'undefined' && (await LanguageModel.availability(LM)) === 'available';
}

function session() {
  base =
    base ||
    LanguageModel.create({ ...LM, initialPrompts: [{ role: 'system', content: SYSTEM }] }).catch((err) => {
      base = null;
      throw err;
    });
  return base;
}

async function sense({ term, known, context, title }) {
  if (!(await ready())) return null;
  const question = [
    `Acronym: ${term}`,
    title && `Page title: ${title}`,
    `Text: ${context}`,
    known.length && `Known meanings: ${known.join('; ')}`,
  ]
    .filter(Boolean)
    .join('\n');
  const s = await (await session()).clone();
  try {
    return JSON.parse(await s.prompt(question, { responseConstraint: ANSWER })).meaning;
  } finally {
    s.destroy();
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'sense') return false;
  sense(msg)
    .then(reply)
    .catch((err) => {
      console.warn('[Acronym Bubble] the model did not answer:', err);
      reply(null);
    });
  return true;
});
