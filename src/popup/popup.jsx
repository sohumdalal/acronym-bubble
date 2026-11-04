// The toolbar popup: on and off, everywhere and for this site, which model
// reads the page, PDFs, and the two choices about how loud the extension is
// on a page. It is drawn like Unit Bubble's popup: its switches for on and
// off, Mova's segmented control for the choices, and Mova's password field
// for the Claude key.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { SegmentedTabs } from '../mova/ui/segmented-tabs.jsx';
import { SecretInput } from '../mova/ui/secret-input.jsx';

const DEFAULTS = { enabled: true, disabledHosts: [], underline: 'every', trigger: 'hover', agent: 'device', pdf: true };
const LM = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };

// What the background worker's status means, in words.
function statusNote(s) {
  if (!s) return '';
  if (s.agent === 'claude') {
    if (s.reason === 'nokey') return 'Paste your Anthropic API key. Page text is sent to Anthropic.';
    if (s.reason === 'key') return 'Anthropic rejected this key.';
    if (s.reason === 'limit') return 'Rate limited by Anthropic. Try again soon.';
    return 'Claude Haiku reads the page. Its text is sent to Anthropic.';
  }
  return {
    available: 'Chrome’s built-in model reads the page, on this computer.',
    downloadable: 'Chrome’s built-in model is not downloaded yet.',
    downloading: 'Chrome is downloading its built-in model.',
    unavailable: 'This computer has no built-in model. Choose Claude.',
  }[s.reason];
}

// Unit Bubble's iOS switch (../unit-bubble/src/ui.css), as ab-switch.
function Switch({ label, checked, onChange }) {
  return (
    <label className="ab-switch">
      <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="ab-switch-track" />
    </label>
  );
}

function Row({ title, note, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px] font-medium tracking-[-0.01em]">{title}</div>
        {note && <div className="text-[11px] ab-soft truncate">{note}</div>}
      </div>
      {children}
    </div>
  );
}

function Popup() {
  const [settings, setSettings] = useState(null);
  const [site, setSite] = useState(null);
  const [status, setStatus] = useState(null);
  const [key, setKey] = useState('');
  const [savedKey, setSavedKey] = useState('');

  const refresh = async () => setStatus(await chrome.runtime.sendMessage({ type: 'agent-status' }));

  useEffect(() => {
    (async () => {
      const { settings: s } = await chrome.storage.sync.get('settings');
      setSettings({ ...DEFAULTS, ...(s || {}) });
    })();
    (async () => {
      const { claudeKey = '' } = await chrome.storage.local.get('claudeKey');
      setKey(claudeKey);
      setSavedKey(claudeKey);
    })();
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      try {
        const url = new URL(tab.url);
        if (/^https?:$/.test(url.protocol)) setSite(url.hostname.replace(/^www\./, ''));
      } catch {}
    })();
    refresh();
  }, []);

  if (!settings) return null;

  const save = async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await chrome.storage.sync.set({ settings: next });
    if ('agent' in patch) refresh();
  };
  const siteOn = !site || !settings.disabledHosts.includes(site);
  const setSiteOn = (value) => {
    const hosts = new Set(settings.disabledHosts);
    value ? hosts.delete(site) : hosts.add(site);
    save({ disabledHosts: [...hosts] });
  };
  const saveKey = async () => {
    const claudeKey = key.trim();
    await chrome.storage.local.set({ claudeKey, agentError: '' });
    setSavedKey(claudeKey);
    refresh();
  };
  // The click is the user gesture Chrome needs to start the download.
  const download = async () => {
    setStatus({ agent: 'device', ready: false, reason: 'downloading' });
    try {
      (await LanguageModel.create(LM)).destroy();
    } catch {}
    refresh();
  };

  return (
    <div className="flex flex-col gap-3 p-3.5">
      <Row title={<span className="flex items-center gap-2.5 whitespace-nowrap"><span aria-hidden="true" className="flex items-center justify-center w-[18px] h-[18px] text-[8.5px] font-bold leading-none tracking-[-0.01em] text-white ab-mark">ab</span>Acronym Bubble</span>}>
        <Switch label="Acronym Bubble" checked={settings.enabled} onChange={(v) => save({ enabled: v })} />
      </Row>
      <div className="h-px ab-rule" />
      <Row title="This site" note={site || 'Not available on this page'}>
        {site && <Switch label="This site" checked={siteOn} onChange={setSiteOn} />}
      </Row>
      <Row title="Open PDFs here" note="Bubbles in PDFs too">
        <Switch label="Open PDFs here" checked={settings.pdf} onChange={(v) => save({ pdf: v })} />
      </Row>
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] ab-soft">Model</div>
        <SegmentedTabs
          id="agent"
          label="Model"
          options={[
            { value: 'device', label: 'On-device' },
            { value: 'claude', label: 'Claude' },
          ]}
          value={settings.agent}
          onChange={(v) => save({ agent: v })}
        />
        {settings.agent === 'claude' && (
          <div className="flex items-center gap-2">
            <SecretInput value={key} onChange={setKey} label="Anthropic API key" placeholder="sk-ant-…" />
            <button type="button" onClick={saveKey} disabled={key.trim() === savedKey} className="shrink-0 px-2.5 py-1.5 text-[12px] font-medium border-0 cursor-pointer ab-button">
              Save
            </button>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 text-[11px] ab-soft" id="agent-note">
          <span>{statusNote(status)}</span>
          {status && status.agent === 'device' && status.reason === 'downloadable' && (
            <button type="button" onClick={download} className="shrink-0 px-2.5 py-1 text-[11px] font-medium border-0 cursor-pointer ab-button">
              Download
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] ab-soft">Underline</div>
        <SegmentedTabs
          id="underline"
          label="Underline"
          options={[
            { value: 'every', label: 'Every' },
            { value: 'first', label: 'First' },
            { value: 'none', label: 'None' },
          ]}
          value={settings.underline}
          onChange={(v) => save({ underline: v })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] ab-soft">Open on</div>
        <SegmentedTabs
          id="trigger"
          label="Open on"
          options={[
            { value: 'hover', label: 'Hover' },
            { value: 'alt', label: '⌥ + Hover' },
          ]}
          value={settings.trigger}
          onChange={(v) => save({ trigger: v })}
        />
      </div>
      <div className="h-px ab-rule" />
      <div className="text-[11px] ab-soft">⌥⇧A turns it on or off. Hover an underlined word to see it.</div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <MotionConfig reducedMotion="user">
    <Popup />
  </MotionConfig>,
);
