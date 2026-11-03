/**
 * The bubble, loaded by the content script on the first hover:
 * `import(chrome.runtime.getURL('dist/bubble.js'))`. Pages that never show
 * an acronym never load React.
 *
 * It draws inside a shadow root on its own host element, so the page's CSS
 * cannot reach it and its CSS cannot reach the page. The content script
 * owns all the state and calls show() and hide().
 */

import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { QuestionTooltip } from './ui/question-tooltip.jsx';

export async function mount({ cssUrl, onEnter, onLeave, onMore }) {
  const host = document.createElement('div');
  host.setAttribute('data-acronym-bubble', '');
  host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });

  // A constructed sheet, so a page's style-src policy does not apply.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(await (await fetch(cssUrl)).text());
  shadow.adoptedStyleSheets = [sheet];

  const el = document.createElement('div');
  el.className = 'mova';
  shadow.append(el);
  document.documentElement.append(host);

  const root = createRoot(el);
  const render = (hit, theme) =>
    root.render(
      <MotionConfig reducedMotion="user">
        <QuestionTooltip hit={hit} theme={theme} onEnter={onEnter} onLeave={onLeave} onMore={onMore} />
      </MotionConfig>,
    );

  return {
    show: (hit, theme) => {
      // A page that rebuilds <html>'s children can drop the host.
      if (!host.isConnected) document.documentElement.append(host);
      render(hit, theme);
    },
    hide: () => render(null),
  };
}
