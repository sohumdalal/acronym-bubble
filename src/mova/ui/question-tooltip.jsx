// Mova QuestionTooltip (YuiUiKit2), from @mova-ui/react 0.4.6 (MIT, see
// LICENSE.mova). Re-skinned for Acronym Bubble in Unit Bubble's look:
// colour is the theme tokens (ab-tip-* in mova.css), a frosted card with
// 10px corners, light on a light page and dark on a dark one.
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
// - No arrow. On frosted glass it doubles the blur where it overlaps the
//   card, and Unit Bubble's card has none.
// - Where the meaning came from is a small blue pill.
// - Its text can change while it is open, when the model's answer replaces
//   the dictionary's, so it measures itself again then.
// Its spring and its placement over the word are Mova's.

import { useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

const GUTTER = 8;
const LIFT = 6; // Mova's y travel as the card springs in
const SOURCE = { page: 'on this page', context: 'in context', guess: 'best guess' };
const GAP = 8; // Unit Bubble's gap between the word and the card

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
    const below = rect.top - height - GAP < GUTTER;
    const left = Math.max(GUTTER, Math.min(center - width / 2, innerWidth - width - GUTTER));
    setPlace({ below, left, top: below ? rect.bottom + GAP - LIFT : rect.top - height - GAP + LIFT, origin: center - left });
  }, [rect.top, rect.bottom, center, hit.meanings.join('|')]);

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
        transformOrigin: place ? `${place.origin}px ${place.below ? 0 : '100%'}` : undefined,
      }}
      className={`max-w-[280px] w-max px-2.5 pt-[7px] pb-2 border text-[11.5px] z-20 ${skin}`}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="w-1.5 h-1.5 shrink-0 ab-mark" />
          <span className="font-semibold tracking-[0.4px] ab-soft">{hit.term}</span>
          {SOURCE[hit.source] && <span className="px-1.5 text-[10px] font-medium leading-[16px] truncate ab-pill">{SOURCE[hit.source]}</span>}
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
      <div className="mt-1 text-[15px] font-medium leading-snug tracking-[-0.01em]">{hit.meanings[0]}</div>
      {alts.length > 0 && <div className="mt-0.5 leading-snug ab-soft">Also {alts.join(' · ')}</div>}
    </motion.div>
  );
}
