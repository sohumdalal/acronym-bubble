// The toolbar popup: on and off, everywhere and for this site, and the two
// choices about how loud the extension is on a page.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { SegmentedTabs } from '../mova/ui/segmented-tabs.jsx';

const DEFAULTS = { enabled: true, disabledHosts: [], underline: 'every', trigger: 'hover', context: true };
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
const ON_OFF = [
  { value: true, label: 'On' },
  { value: false, label: 'Off' },
];

function Row({ title, note, children }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{title}</div>
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
    <div className="flex flex-col gap-4 p-4">
      <Row title={<span className="flex items-center gap-2 whitespace-nowrap"><span className="w-2 h-2 ab-mark" />Acronym Bubble</span>}>
        <SegmentedTabs id="enabled" label="Acronym Bubble" options={ON_OFF} value={settings.enabled} onChange={(v) => save({ enabled: v })} />
      </Row>
      <div className="h-px ab-rule" />
      <Row title="This site" note={site || 'Not available on this page'}>
        {site && <SegmentedTabs id="site" label="This site" options={ON_OFF} value={siteOn} onChange={setSiteOn} />}
      </Row>
      <div className="flex flex-col gap-2">
        <div className="text-[13px] font-medium">Underline</div>
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
      <div className="flex flex-col gap-2">
        <div className="text-[13px] font-medium">Open on</div>
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
      <Row title="Meaning from context" note={model && MODEL[model]}>
        <SegmentedTabs id="context" label="Meaning from context" options={ON_OFF} value={settings.context} onChange={setContext} />
      </Row>
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
