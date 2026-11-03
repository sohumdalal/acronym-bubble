// Mova QuestionTooltip (YuiUiKit2), from @mova-ui/react 0.4.6 (MIT, see
// LICENSE.mova). Re-skinned for Acronym Bubble: colour is the theme tokens
// (ab-tip-* in mova.css) and the corners are square.
//
// What changed beyond the skin:
// - Mova's demo opens over its own help button. Here the trigger is the
//   acronym on someone else's page, so the button is gone and the bubble is
//   placed over the word's rectangle, kept inside the window, and flipped
//   below the word near the top of the window (the motion mirrors with it).
// - Its fixed line of demo text is the acronym, what it stands for and a
//   More link, so it wraps at 280px instead of nowrap.
// - It takes the pointer, so the link can be clicked; Mova's is
//   pointer-events-none.
// Its padding, border, text size, shadow, arrow and spring are Mova's.

import { useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

const GUTTER = 8;
const LIFT = 6; // Mova's y travel; the bubble rests this far off the word.

export function QuestionTooltip({ hit, theme = 'light', onEnter, onLeave, onMore }) {
  return (
    <AnimatePresence>
      {hit && <Bubble key={hit.key} hit={hit} theme={theme} onEnter={onEnter} onLeave={onLeave} onMore={onMore} />}
    </AnimatePresence>
  );
}

function Bubble({ hit, theme, onEnter, onLeave, onMore }) {
  const box = useRef(null);
  const [place, setPlace] = useState(null);
  const { rect } = hit;
  const center = rect.left + rect.width / 2;

  useLayoutEffect(() => {
    const { width, height } = box.current.getBoundingClientRect();
    const below = rect.top - height - LIFT * 2 < GUTTER;
    const left = Math.max(GUTTER, Math.min(center - width / 2, innerWidth - width - GUTTER));
    setPlace({ below, left, top: below ? rect.bottom + 2 : rect.top - height - 2, arrow: center - left });
  }, [rect.top, rect.bottom, center]);

  const dir = place && place.below ? -1 : 1;
  const skin = theme === 'dark' ? 'ab-tip-dark' : 'ab-tip-light';
  const alts = hit.meanings.slice(1);

  return (
    <motion.div
      ref={box}
      role="tooltip"
      initial={{ opacity: 0, y: LIFT * dir, scale: 0.9 }}
      animate={{ opacity: 1, y: -LIFT * dir, scale: 1 }}
      exit={{ opacity: 0, y: 4 * dir, scale: 0.9 }}
      transition={{ type: 'spring', bounce: 0.3, duration: 0.35 }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        position: 'fixed',
        left: place ? place.left : 0,
        top: place ? place.top : 0,
        visibility: place ? 'visible' : 'hidden',
        transformOrigin: place ? `${place.arrow}px ${place.below ? 0 : '100%'}` : undefined,
      }}
      className={`max-w-[280px] w-max px-3 py-1.5 border text-[11px] shadow-xl z-20 ${skin}`}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="w-1.5 h-1.5 shrink-0 ab-mark" />
          <span className="font-semibold tracking-[1.1px]">{hit.term}</span>
          {hit.source === 'page' && <span className="ab-soft truncate">on this page</span>}
        </span>
        <a
          href={hit.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onMore}
          aria-label={`Search for ${hit.term}`}
          className="inline-flex items-center gap-0.5 shrink-0 ab-link"
        >
          More
          <ArrowUpRight className="w-3 h-3" strokeWidth={2} />
        </a>
      </div>
      <div className="mt-0.5 text-[13px] leading-snug">{hit.meanings[0]}</div>
      {alts.length > 0 && <div className="mt-0.5 leading-snug ab-soft">Also {alts.join(' · ')}</div>}
      <div
        style={place ? { left: place.arrow } : undefined}
        className={`absolute -translate-x-1/2 w-2 h-2 rotate-45 ${
          place && place.below ? '-top-1 border-l border-t' : '-bottom-1 border-r border-b'
        } ${skin}`}
      />
    </motion.div>
  );
}
