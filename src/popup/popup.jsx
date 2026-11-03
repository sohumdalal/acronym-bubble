// The toolbar popup: on and off, everywhere and for this site, and the two
// choices about how loud the extension is on a page. It is drawn like Unit
// Bubble's popup: its switches for on and off, Mova's segmented control for
// the choices.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { SegmentedTabs } from '../mova/ui/segmented-tabs.jsx';

const DEFAULTS = { enabled: true, disabledHosts: [], underline: 'every', trigger: 'hover', context: true, pdf: true };
const LM = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
const MODEL = {
  available: 'On-device model ready',
  downloadable: 'Turn on to download the model',
  downloading: 'Downloading the model',
  unavailable: 'No on-device model here',
};

// Chrome's on-device model: 'available', 'downloadable', 'downloading' or
// 'unavailable'.
const modelStatus = () => (typeof LanguageModel === 'undefined' ? Promise.resolve('unavailable') : LanguageModel.availability(LM).catch(() => 'unavailable'));

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
  const [model, setModel] = useState(null);

  useEffect(() => {
    modelStatus().then(setModel);
    chrome.storage.sync.get('settings').then(({ settings: s }) => setSettings({ ...DEFAULTS, ...(s || {}) }));
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      try {
        const url = new URL(tab.url);
        if (/^https?:$/.test(url.protocol)) setSite(url.hostname.replace(/^www\./, ''));
      } catch {}
    });
  }, []);

  if (!settings) return null;

  const save = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    chrome.storage.sync.set({ settings: next });
  };
  const siteOn = !site || !settings.disabledHosts.includes(site);
  const setSiteOn = (value) => {
    const hosts = new Set(settings.disabledHosts);
    value ? hosts.delete(site) : hosts.add(site);
    save({ disabledHosts: [...hosts] });
  };
  // Turning it on is the user gesture Chrome needs to start the download.
  const setContext = (value) => {
    save({ context: value });
    if (value && model === 'downloadable') {
      setModel('downloading');
      LanguageModel.create(LM).then((s) => (s.destroy(), setModel('available')), () => modelStatus().then(setModel));
    }
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
      <Row title="Meaning from context" note={model && MODEL[model]}>
        <Switch label="Meaning from context" checked={settings.context} onChange={setContext} />
      </Row>
      <Row title="Open PDFs here" note="Bubbles in PDFs too">
        <Switch label="Open PDFs here" checked={settings.pdf} onChange={(v) => save({ pdf: v })} />
      </Row>
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
