// Writes icons/{16,32,48,128}.png: a white square speech bubble with its
// arrow, on a near-black tile, with a Rosso Corsa mark. Plain node, no deps.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SS = 4; // supersample factor
const CANVAS = [24, 24, 24];
const INK = [255, 255, 255];
const RED = [218, 41, 28];

function crc(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// The colour at (u, v) in a unit square.
function paint(u, v) {
  const bubble = u >= 0.16 && u <= 0.84 && v >= 0.18 && v <= 0.66;
  // The arrow under the bubble, a right-angled notch on the left third.
  const arrow = v > 0.66 && v <= 0.84 && u >= 0.3 && u <= 0.3 + (0.84 - v);
  const mark = u >= 0.28 && u <= 0.42 && v >= 0.35 && v <= 0.49;
  if (mark) return RED;
  if (bubble || arrow) return INK;
  return CANVAS;
}

function render(size) {
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0];
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const c = paint((x + (dx + 0.5) / SS) / size, (y + (dy + 0.5) / SS) / size);
          for (let k = 0; k < 3; k++) sum[k] += c[k];
        }
      }
      const i = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) out[i + k] = Math.round(sum[k] / (SS * SS));
      out[i + 3] = 255;
    }
  }
  return png(size, size, out);
}

const dir = path.join(__dirname, '..', 'icons');
for (const s of [16, 32, 48, 128]) fs.writeFileSync(path.join(dir, `${s}.png`), render(s));
console.log('icons written');
