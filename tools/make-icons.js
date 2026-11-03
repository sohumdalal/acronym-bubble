// Writes icons/{16,32,48,128}.png: Unit Bubble's blue dot, with "ab" in
// white in the middle. The type is the extension's own stack (FerrariSans,
// then the system face), drawn by a headless Chromium canvas, because plain
// node cannot draw text. Each size is drawn at its own size, not scaled down,
// so the small ones stay crisp. No window opens.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const FONT = "'FerrariSans', -apple-system, system-ui, sans-serif";

// Runs in the page. Returns a PNG data URL.
function draw({ size, font }) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  // Unit Bubble's dot: #0a84ff at the top left easing into #007aff.
  const fill = ctx.createLinearGradient(0, 0, size * 0.4, size * 0.6);
  fill.addColorStop(0, '#0a84ff');
  fill.addColorStop(1, '#007aff');
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // "ab", its ink box centred in the dot and about 56% of its width.
  // Heavier at small sizes, where 600 breaks up.
  const weight = size <= 16 ? 700 : 600;
  ctx.letterSpacing = `${-0.01 * size}px`;
  ctx.font = `${weight} 100px ${font}`;
  const probe = ctx.measureText('ab');
  const px = (100 * size * 0.56) / (probe.actualBoundingBoxLeft + probe.actualBoundingBoxRight);
  ctx.font = `${weight} ${px}px ${font}`;
  const m = ctx.measureText('ab');
  const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('ab', (size - w) / 2 + m.actualBoundingBoxLeft, (size - h) / 2 + m.actualBoundingBoxAscent);
  return c.toDataURL('image/png');
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const dir = path.join(__dirname, '..', 'icons');
  for (const size of [16, 32, 48, 128]) {
    const url = await page.evaluate(draw, { size, font: FONT });
    fs.writeFileSync(path.join(dir, `${size}.png`), Buffer.from(url.split(',')[1], 'base64'));
  }
  await browser.close();
  console.log('icons written');
})();
