'use strict';
/* Generates the PWA icons as real PNGs — no external assets, no dependencies.
   Draws a gradient shield with a padlock, supersampled 3x for clean edges.
   Run:  node tools/make-icons.js                                             */

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

/* ---------- PNG encoder ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
const crc32 = buf => {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td  = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;                                   // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- drawing (operates in a 0..1 space, supersampled) ---------- */
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Shield outline: rounded top, tapering to a point at the bottom.
function inShield(x, y) {
  if (y < 0.06 || y > 0.95) return 0;
  const top = 0.06, waist = 0.46, bottom = 0.95;
  let half;
  if (y < waist) half = 0.265 + 0.035 * smooth(top, waist, y);     // gentle bulge
  else           half = 0.30 * (1 - smooth(waist, bottom, y)) ** 1.05; // long taper to point
  const dx = Math.abs(x - 0.5);
  if (dx > half) return 0;
  // rounded corners: soften near the silhouette edge
  const edge = half - dx;
  const nearTop = smooth(top, top + 0.07, y);
  return Math.min(1, edge / 0.012) * nearTop;
}
// Padlock: shackle arc + body
function inLock(x, y) {
  const cx = 0.5, bodyTop = 0.50, bodyBot = 0.70, halfW = 0.115;
  // body
  if (y >= bodyTop && y <= bodyBot && Math.abs(x - cx) <= halfW) {
    const e = Math.min(halfW - Math.abs(x - cx), y - bodyTop, bodyBot - y);
    return smooth(0, 0.012, e);
  }
  // shackle: annulus above the body, only upper half
  const sx = (x - cx) / 0.082, sy = (y - 0.50) / 0.10;
  const r = Math.hypot(sx, sy);
  if (y < 0.51 && r > 0.62 && r < 1.0) {
    const e = Math.min(r - 0.62, 1.0 - r);
    return smooth(0, 0.10, e);
  }
  return 0;
}

function render(size) {
  const SS = 3;                                   // supersample factor
  const W = size * SS;
  const acc = new Float32Array(size * size);      // accumulated alpha-weighted colour
  const accA = new Float32Array(size * size);
  const accR = new Float32Array(size * size);
  const accG = new Float32Array(size * size);
  const accB = new Float32Array(size * size);

  for (let sy = 0; sy < W; sy++) {
    for (let sx = 0; sx < W; sx++) {
      const x = sx / W, y = sy / W;

      // background: diagonal indigo -> violet gradient, rounded square mask
      const g = Math.min(1, Math.max(0, (x + y) / 2));
      let r0 = 24 + 40 * g, g0 = 34 + 24 * g, b0 = 92 + 96 * g;
      const corner = 0.20;
      const mx = Math.min(x, 1 - x), my = Math.min(y, 1 - y);
      const rad = Math.hypot(Math.max(0, corner - mx), Math.max(0, corner - my));
      let bgA = smooth(0, 0.008, corner - rad);
      if (bgA <= 0) continue;

      // shield fill (deep blue), with a subtle inner sheen near the top-left
      const sh = inShield(x, y);
      const sheen = smooth(0.55, 0.10, Math.hypot(x - 0.34, y - 0.22));
      let sr = 30 + 70 * sheen, sg = 64 + 100 * sheen, sb = 150 + 80 * sheen, sa = sh * 0.98;

      // padlock in near-white
      const lk = inLock(x, y);
      const lr = 245, lg = 248, lb = 255, la = lk;

      // composite: background -> shield -> lock
      let R = r0, G = g0, B = b0, A = bgA;
      const mix = (nr, ng, nb, na) => {
        const a = na * (1 - A) + A;              // premultiplied-safe blend
        if (a <= 0) return;
        R = (nr * na + R * A * (1 - na)) / a;
        G = (ng * na + G * A * (1 - na)) / a;
        B = (nb * na + B * A * (1 - na)) / a;
        A = a;
      };
      mix(sr, sg, sb, sa);
      mix(lr, lg, lb, la);

      // downsample into the target pixel
      const px = (sx / SS) | 0, py = (sy / SS) | 0, i = py * size + px;
      accR[i] += R * A; accG[i] += G * A; accB[i] += B * A; accA[i] += A;
    }
  }

  const out = Buffer.alloc(size * size * 4);
  const n = SS * SS;
  for (let i = 0; i < size * size; i++) {
    const a = accA[i] / n;
    out[i * 4]     = a > 0 ? Math.round(accR[i] / accA[i]) : 0;
    out[i * 4 + 1] = a > 0 ? Math.round(accG[i] / accA[i]) : 0;
    out[i * 4 + 2] = a > 0 ? Math.round(accB[i] / accA[i]) : 0;
    out[i * 4 + 3] = Math.round(Math.min(1, a) * 255);
  }
  return encodePNG(size, size, out);
}

/* ---------- write the sizes PWA install needs ---------- */
const dir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(dir, { recursive: true });
for (const s of [192, 512]) {
  const f = path.join(dir, `icon-${s}.png`);
  fs.writeFileSync(f, render(s));
  console.log('wrote', path.basename(f), fs.statSync(f).size, 'bytes');
}
const apple = path.join(dir, 'apple-touch-icon.png');
fs.writeFileSync(apple, render(180));
console.log('wrote apple-touch-icon.png');
