/**
 * Generates the PWA icon set as real PNGs, with no image dependencies.
 *
 * Everything is rasterised by hand at 4x and box-downsampled for antialiasing,
 * then encoded straight to PNG via zlib. Design: pink -> purple gradient with a
 * faceted gem, kept inside the maskable safe zone so one artwork serves both
 * "any" and "maskable" purposes.
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'icons');

/* ---------------------------------------------------------------- PNG ---- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------ drawing ---- */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;
const mixRGB = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i];
    const yi = poly[i + 1];
    const xj = poly[j];
    const yj = poly[j + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * A brilliant cut in normalised space: table on top, two crown facets sloping
 * out to the girdle at y = -0.12, three pavilion facets converging on the culet.
 * Listed brightest-first; the first polygon that contains the sample wins.
 */
const GEM = [
  { poly: [-0.30, -0.42, 0.30, -0.42, 0.18, -0.12, -0.18, -0.12], color: [236, 252, 255] },
  { poly: [-0.30, -0.42, -0.18, -0.12, -0.50, -0.12], color: [189, 240, 255] },
  { poly: [0.30, -0.42, 0.50, -0.12, 0.18, -0.12], color: [154, 224, 250] },
  { poly: [-0.18, -0.12, 0.18, -0.12, 0.0, 0.60], color: [127, 214, 247] },
  { poly: [-0.50, -0.12, -0.18, -0.12, 0.0, 0.60], color: [82, 186, 234] },
  { poly: [0.18, -0.12, 0.50, -0.12, 0.0, 0.60], color: [44, 148, 210] },
];

/** Shades one supersample. Returns [r,g,b,a] in 0..255. */
function shade(u, v) {
  // u, v are in -0.5..0.5 across the icon.
  const bgT = clamp01((u + v) * 0.9 + 0.5);
  let col = mixRGB([255, 106, 193], [104, 58, 224], bgT);

  // Soft radial sheen in the upper left.
  const sheen = clamp01(1 - Math.hypot(u + 0.22, v + 0.26) * 1.9);
  col = mixRGB(col, [255, 214, 245], sheen * 0.42);

  // Vignette.
  const vig = clamp01(Math.hypot(u, v) * 1.5 - 0.42);
  col = mixRGB(col, [58, 20, 96], vig * 0.5);

  // Glow halo behind the gem.
  const halo = clamp01(1 - Math.hypot(u, v - 0.02) * 2.5);
  col = mixRGB(col, [255, 255, 255], halo * halo * 0.28);

  // Gem, scaled to sit inside the maskable safe zone (~72% of the canvas).
  const s = 0.82;
  const gx = u / s;
  const gy = (v - 0.02) / s;

  const facet = GEM.find((f) => pointInPoly(gx, gy, f.poly));
  if (!facet) return [Math.round(col[0]), Math.round(col[1]), Math.round(col[2]), 255];
  col = facet.color.slice();

  // Girdle line, where every facet meets.
  if (Math.abs(gy + 0.12) < 0.011) col = mixRGB(col, [26, 96, 150], 0.5);

  // Sparkle streak across the crown.
  const streak = clamp01(1 - Math.abs(gx * 0.9 + gy * 1.7 + 0.5) * 8);
  col = mixRGB(col, [255, 255, 255], streak * 0.85);

  return [Math.round(col[0]), Math.round(col[1]), Math.round(col[2]), 255];
}

function render(size) {
  const SS = 4; // supersampling factor
  const out = new Uint8Array(size * size * 4);
  const inv = 1 / (size * SS);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x * SS + sx + 0.5) * inv - 0.5;
          const v = (y * SS + sy + 0.5) * inv - 0.5;
          const c = shade(u, v);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      out[i] = Math.round(r / n);
      out[i + 1] = Math.round(g / n);
      out[i + 2] = Math.round(b / n);
      out[i + 3] = 255;
    }
  }
  return out;
}

/* --------------------------------------------------------------- main ---- */

fs.mkdirSync(OUT, { recursive: true });

for (const size of [192, 512, 180, 32]) {
  const png = encodePNG(size, size, render(size));
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(`icons/${name}  ${(png.length / 1024).toFixed(1)} KB`);
}
