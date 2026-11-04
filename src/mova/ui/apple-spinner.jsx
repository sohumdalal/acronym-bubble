// Mova AppleRadialSpinner (whimsical/AppleLoaders), from @mova-ui/react 0.4.6
// (MIT, see LICENSE.mova). Re-skinned for Acronym Bubble: the bars are the
// theme's ink (ab-spin-bar in mova.css) instead of Mova's two literals, so
// they follow the bubble's light and dark skins.
//
// What changed beyond the skin:
// - Its keyframes moved from an inline <style> into mova.css. The bubble
//   lives in a shadow root on other people's pages, where a strict
//   style-src policy would block an inline <style>; mova.css is adopted as
//   a constructed sheet, which such a policy does not reach.
// - `size` scales Mova's 32px drawing down to sit in a line of text. The
//   eight bars, their proportions, the 0.8s fade and the delays are Mova's.

const BOX = 32; // Mova's drawing size, w-8 h-8

export function AppleSpinner({ size = BOX, label = 'Loading' }) {
  const bars = Array.from({ length: 8 });
  return (
    <span role="status" aria-label={label} className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="absolute left-0 top-0 flex items-center justify-center w-8 h-8"
        style={{ transform: `scale(${size / BOX})`, transformOrigin: '0 0' }}
      >
        {bars.map((_, i) => (
          <span
            key={i}
            className="ab-spin-bar absolute top-0 left-1/2 w-[2.5px] h-[7px] rounded-full origin-[center_16px]"
            style={{
              transform: `translateX(-50%) rotate(${i * 45}deg)`,
              animationDelay: `${(i * 0.8) / 8 - 0.8}s`,
            }}
          />
        ))}
      </span>
    </span>
  );
}
