/** Tailwind for the vendored Mova sources and the popup; see mova.css. */

// The bubble lives on other people's pages, where 1rem can be anything
// (62.5% roots are common), so the spacing ladder is in pixels.
const spacing = Object.fromEntries(
  [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 9, 10, 12].map((n) => [n, `${n * 4}px`]),
);
spacing.px = '1px';

module.exports = {
  content: [`${__dirname}/**/*.{js,jsx}`, `${__dirname}/../popup/**/*.{js,jsx,html}`],
  corePlugins: { preflight: false },
  // Utilities apply only inside a Mova root, so a page class can never
  // collide with one.
  important: '.mova',
  theme: {
    spacing,
    extend: {
      fontFamily: { sans: ['Inter', '-apple-system', 'system-ui', 'sans-serif'] },
    },
  },
};
