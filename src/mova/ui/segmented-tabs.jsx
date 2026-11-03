// Mova SegmentedABTabs (YuiUiKit2), from @mova-ui/react 0.4.6 (MIT, see
// LICENSE.mova). Re-skinned for Acronym Bubble in Unit Bubble's look:
// colour is the theme tokens (ab-seg-* in mova.css), with 8px corners on
// the track and 6px on the pill, and the segments share the width. Mova's demo has two
// fixed tabs, A and B, and its own state; here the options, the value and
// the change handler are props, and each instance names its own layoutId so
// several can share a page. The buttons say which one is pressed.

import { motion } from 'framer-motion';

export function SegmentedTabs({ id, options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="relative flex items-center p-0.5 border ab-seg">
      {options.map((item) => {
        const isSelected = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(item.value)}
            className="relative flex-1 px-3 py-1.5 text-xs font-medium cursor-pointer border-0 bg-transparent"
          >
            {isSelected && (
              <motion.div
                layoutId={`${id}-pill`}
                transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                className="absolute inset-0 shadow-sm ab-seg-pill"
              />
            )}
            <span className={`relative z-10 ${isSelected ? 'ab-seg-on' : 'ab-seg-off'}`}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
