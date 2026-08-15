/**
 * Every texture in the game is generated on a canvas at boot.
 *
 * That keeps the PWA a single self-contained bundle (no image requests to fail
 * offline) while still giving the mall polished marble, brushed-metal facades,
 * lightbox signage and a believable interior environment map for reflections.
 */
import * as THREE from 'three';

/* ------------------------------------------------------------- helpers --- */

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function texture(c, { srgb = true, repeat = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (Array.isArray(repeat)) t.repeat.set(repeat[0], repeat[1]);
  else t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Integer hash -> 0..1. */
function hash2(ix, iy, seed) {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1013904223);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Tileable value noise. `period` is how many cells fit in one texture repeat. */
function vnoise(x, y, period, seed) {
  const fx = x * period;
  const fy = y * period;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smooth(fx - ix);
  const ty = smooth(fy - iy);
  const wrap = (v) => ((v % period) + period) % period;
  const x0 = wrap(ix);
  const x1 = wrap(ix + 1);
  const y0 = wrap(iy);
  const y1 = wrap(iy + 1);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

function fbm(x, y, basePeriod, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += vnoise(x, y, basePeriod * 2 ** o, seed + o * 71) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Sobel a greyscale height canvas into a tangent-space normal map. */
function heightToNormal(src, strength = 2.2) {
  const w = src.width;
  const h = src.height;
  const sctx = src.getContext('2d', { willReadFrequently: true });
  const hd = sctx.getImageData(0, 0, w, h).data;
  const out = canvas(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const at = (x, y) => hd[((((y + h) % h) * w + ((x + w) % w)) << 2)] / 255;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      const nx = dx * strength;
      const ny = dy * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * w + x) << 2;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* --------------------------------------------------------------- floor --- */

/**
 * Polished marble slabs with veining, grout grooves and matching roughness /
 * normal maps. One texture spans 4x4 game tiles.
 */
export function marbleFloor(size = 1024, slabs = 4) {
  const colorC = canvas(size);
  const heightC = canvas(size);
  const roughC = canvas(size);
  const cctx = colorC.getContext('2d');
  const hctx = heightC.getContext('2d');
  const rctx = roughC.getContext('2d');

  const cimg = cctx.createImageData(size, size);
  const himg = hctx.createImageData(size, size);
  const rimg = rctx.createImageData(size, size);
  const slabPx = size / slabs;
  const grout = Math.max(3, size / 220);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;

      // Domain-warped turbulence, then a sine fold -> marble veins. The warp is
      // kept mild and the fold sharpened, so veins read as thin seams rather
      // than the swirling static you get from a strong warp.
      const warp = fbm(u, v, 3, 5, 11) - 0.5;
      const vein = Math.abs(Math.sin((u * 2 + v * 0.6 + warp * 1.5) * Math.PI * 2));
      const seam = (1 - vein) ** 5;
      const grain = fbm(u, v, 32, 3, 77);

      // Per-slab tint so the floor never looks like one flat sheet.
      const sx = Math.floor(x / slabPx);
      const sy = Math.floor(y / slabPx);
      const tint = hash2(sx, sy, 5) * 0.05 - 0.025;

      const lum = 0.74 + grain * 0.05 - seam * 0.13 + tint;

      let r = lum * 250;
      let g = lum * 244;
      let b = lum * 249;
      // Veins pull slightly violet, which sits nicely under the pink lighting.
      r -= seam * 20;
      g -= seam * 28;
      b -= seam * 6;

      // Grout groove between slabs.
      const ex = Math.min(x % slabPx, slabPx - (x % slabPx));
      const ey = Math.min(y % slabPx, slabPx - (y % slabPx));
      const edge = Math.min(ex, ey);
      const groove = edge < grout ? 1 - edge / grout : 0;

      r = r * (1 - groove * 0.55) + 44 * groove * 0.55;
      g = g * (1 - groove * 0.55) + 38 * groove * 0.55;
      b = b * (1 - groove * 0.55) + 52 * groove * 0.55;

      const i = (y * size + x) << 2;
      cimg.data[i] = r;
      cimg.data[i + 1] = g;
      cimg.data[i + 2] = b;
      cimg.data[i + 3] = 255;

      const height = (1 - groove) * 255 * (0.85 + grain * 0.15);
      himg.data[i] = himg.data[i + 1] = himg.data[i + 2] = height;
      himg.data[i + 3] = 255;

      // Polished slabs, rough grout.
      const rough = (0.09 + grain * 0.12) * (1 - groove) + 0.8 * groove;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = rough * 255;
      rimg.data[i + 3] = 255;
    }
  }

  cctx.putImageData(cimg, 0, 0);
  hctx.putImageData(himg, 0, 0);
  rctx.putImageData(rimg, 0, 0);

  return {
    map: colorC,
    roughnessMap: roughC,
    normalMap: heightToNormal(heightC, 1.6),
  };
}

/* -------------------------------------------------------------- facade --- */

/** Near-white brushed panelling, tinted per shop through instanceColor. */
export function facadePanels(size = 512) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2f0f6';
  ctx.fillRect(0, 0, size, size);

  // Fine vertical brushing.
  for (let x = 0; x < size; x++) {
    const n = hash2(x, 0, 3);
    ctx.fillStyle = `rgba(${n > 0.5 ? 255 : 190},${n > 0.5 ? 255 : 190},255,${0.06 + n * 0.06})`;
    ctx.fillRect(x, 0, 1, size);
  }

  // Horizontal panel seams with a highlight above each groove.
  const seam = size / 4;
  for (let y = seam; y < size; y += seam) {
    ctx.fillStyle = 'rgba(74,62,100,0.5)';
    ctx.fillRect(0, y, size, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(0, y + 4, size, 3);
  }

  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (hash2(i, 1, 9) - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ---------------------------------------------------------------- sign --- */

/** A backlit shop sign: coloured lightbox with the shop emoji. */
export function signTexture(emoji, color, w = 512, h = 256) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const hex = `rgb(${(color.r * 255) | 0},${(color.g * 255) | 0},${(color.b * 255) | 0})`;

  ctx.clearRect(0, 0, w, h);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.45, hex);
  grad.addColorStop(1, '#ffffff');
  ctx.fillStyle = grad;
  roundRect(ctx, 8, 8, w - 16, h - 16, 44);
  ctx.fill();

  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.stroke();

  // Inner plate so the emoji reads against any hue.
  ctx.fillStyle = 'rgba(252,248,255,0.94)';
  roundRect(ctx, 34, 32, w - 68, h - 64, 30);
  ctx.fill();

  ctx.font = `${Math.round(h * 0.68)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, w / 2, h / 2 + h * 0.03);

  return c;
}

/**
 * Round rooftop badge. The camera looks down at the mall, so this is how a
 * child actually identifies a shop — the wall sign is barely visible from here.
 */
export function roofBadge(emoji, color, size = 256) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const hex = `rgb(${(color.r * 255) | 0},${(color.g * 255) | 0},${(color.b * 255) | 0})`;
  const r = size / 2;

  ctx.clearRect(0, 0, size, size);

  ctx.fillStyle = hex;
  ctx.beginPath();
  ctx.arc(r, r, r - 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 12;
  ctx.stroke();

  ctx.fillStyle = 'rgba(253,250,255,0.96)';
  ctx.beginPath();
  ctx.arc(r, r, r * 0.74, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = `${Math.round(size * 0.56)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, r, r + size * 0.03);

  return c;
}

/* --------------------------------------------------------- environment --- */

/**
 * Equirectangular map of an imaginary mall interior: bright skylit ceiling,
 * warm signage glow at the horizon, dark polished floor below. Used for both
 * the sky backdrop and (via PMREM) every reflection in the scene.
 */
export function environmentEquirect(w = 1024, h = 512) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, '#fffaf2');
  grad.addColorStop(0.28, '#f3e6ff');
  grad.addColorStop(0.5, '#dfc9f5');
  grad.addColorStop(0.62, '#a684d6');
  grad.addColorStop(1.0, '#3b1f5e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Skylight strips overhead — these are what glint off the marble.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const y = h * (0.03 + i * 0.045);
    const g = ctx.createLinearGradient(0, y - 12, 0, y + 12);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 12, w, 24);
  }

  // Warm shopfront glow smeared around the horizon.
  for (let i = 0; i < 26; i++) {
    const x = (i / 26) * w + hash2(i, 2, 4) * 30;
    const y = h * (0.55 + hash2(i, 3, 5) * 0.06);
    const r = 40 + hash2(i, 4, 6) * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const warm = i % 3 === 0 ? '255,180,235' : i % 3 === 1 ? '255,225,170' : '180,220,255';
    g.addColorStop(0, `rgba(${warm},0.5)`);
    g.addColorStop(1, `rgba(${warm},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';

  return c;
}

/* --------------------------------------------------------------- props --- */

/** Painted concrete for planters and fountain rims. */
export function stoneTexture(size = 256) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x / size, y / size, 8, 4, 21);
      const speck = hash2(x, y, 31) > 0.985 ? 0.14 : 0;
      const l = 0.72 + n * 0.2 + speck;
      const i = (y * size + x) << 2;
      img.data[i] = l * 240;
      img.data[i + 1] = l * 236;
      img.data[i + 2] = l * 244;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Rainbow ramp used for manes, hair and tail flukes. */
export function rainbowRamp(w = 128, h = 8) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0.0, '#ff7ccd');
  g.addColorStop(0.25, '#ffd36e');
  g.addColorStop(0.5, '#8ef0c4');
  g.addColorStop(0.75, '#7cc8ff');
  g.addColorStop(1.0, '#c08bff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}

/** Iridescent scales for the mermaid tail. */
export function scaleTexture(size = 256) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#38d0c8';
  ctx.fillRect(0, 0, size, size);

  const cols = 8;
  const r = size / cols / 2;
  for (let row = 0; row < cols * 2; row++) {
    for (let col = 0; col <= cols; col++) {
      const x = col * r * 2 + (row % 2 ? r : 0);
      const y = row * r * 1.05;
      const g = ctx.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
      const t = (row * 3 + col * 5) % 11 / 11;
      g.addColorStop(0, `hsl(${170 + t * 90}, 90%, 78%)`);
      g.addColorStop(0.7, `hsl(${165 + t * 90}, 78%, 56%)`);
      g.addColorStop(1, `hsl(${180 + t * 70}, 70%, 38%)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.02, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return c;
}

/** Soft glowing disc, used for the shop doormats and ground markers. */
export function glowDisc(size = 256) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.18)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Two concentric rings so the mat reads as a target from above.
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = size * 0.022;
  for (const rr of [0.34, 0.46]) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  return c;
}

/** Round sparkle sprite for pickup bursts and confetti. */
export function sparkleSprite(size = 128) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,240,255,0.85)');
  g.addColorStop(0.6, 'rgba(255,170,240,0.25)');
  g.addColorStop(1, 'rgba(255,120,220,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

export { texture, canvas as makeCanvas };
