// The keyboard shortcut, and an OFF badge on the toolbar icon while the
// extension is turned off. Nothing else lives here.
const DEFAULTS = { enabled: true, disabledHosts: [], underline: 'every', trigger: 'hover' };

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
