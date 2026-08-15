/**
 * A* over the tile grid plus a string-pulling pass, so tap-to-walk produces
 * natural diagonal routes instead of staircase zig-zags.
 */
import { GRID_W, GRID_H, TILE, PLAYER_RADIUS } from './config.js';
import { idx, inBounds, tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ } from './mall.js';

const NEIGHBOURS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** Binary min-heap keyed by f-score; plenty fast for a 32x26 grid. */
class Heap {
  constructor() {
    this.items = [];
    this.score = [];
  }
  get size() {
    return this.items.length;
  }
  push(item, score) {
    this.items.push(item);
    this.score.push(score);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.score[p] <= this.score[i]) break;
      this.swap(p, i);
      i = p;
    }
  }
  pop() {
    const top = this.items[0];
    const lastItem = this.items.pop();
    const lastScore = this.score.pop();
    if (this.items.length) {
      this.items[0] = lastItem;
      this.score[0] = lastScore;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let s = i;
        if (l < this.items.length && this.score[l] < this.score[s]) s = l;
        if (r < this.items.length && this.score[r] < this.score[s]) s = r;
        if (s === i) break;
        this.swap(s, i);
        i = s;
      }
    }
    return top;
  }
  swap(a, b) {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.score[a], this.score[b]] = [this.score[b], this.score[a]];
  }
}

/** Nearest walkable tile to (x,z), searched in rings. Never returns null. */
export function nearestWalkable(mall, x, z, maxRing = 8) {
  if (inBounds(x, z) && !mall.isSolid(x, z)) return { x, z };
  for (let r = 1; r <= maxRing; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const nx = x + dx;
        const nz = z + dz;
        if (inBounds(nx, nz) && !mall.isSolid(nx, nz)) return { x: nx, z: nz };
      }
    }
  }
  return null;
}

export function findPath(mall, from, to) {
  const start = idx(from.x, from.z);
  const goal = idx(to.x, to.z);
  if (start === goal) return [];
  if (mall.isSolid(to.x, to.z)) return null;

  const g = new Float32Array(GRID_W * GRID_H).fill(Infinity);
  const cameFrom = new Int32Array(GRID_W * GRID_H).fill(-1);
  const closed = new Uint8Array(GRID_W * GRID_H);
  const open = new Heap();

  const h = (i) => {
    const dx = Math.abs((i % GRID_W) - to.x);
    const dz = Math.abs(((i / GRID_W) | 0) - to.z);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };

  g[start] = 0;
  open.push(start, h(start));

  while (open.size) {
    const cur = open.pop();
    if (cur === goal) return reconstruct(cameFrom, cur, mall);
    if (closed[cur]) continue;
    closed[cur] = 1;

    const x = cur % GRID_W;
    const z = (cur / GRID_W) | 0;

    for (const [dx, dz, cost] of NEIGHBOURS) {
      const nx = x + dx;
      const nz = z + dz;
      if (!inBounds(nx, nz) || mall.isSolid(nx, nz)) continue;
      // No squeezing through a diagonal gap between two corners.
      if (dx && dz && (mall.isSolid(x + dx, z) || mall.isSolid(x, z + dz))) continue;

      const ni = idx(nx, nz);
      if (closed[ni]) continue;
      const tentative = g[cur] + cost;
      if (tentative < g[ni]) {
        g[ni] = tentative;
        cameFrom[ni] = cur;
        open.push(ni, tentative + h(ni));
      }
    }
  }
  return null;
}

function reconstruct(cameFrom, end, mall) {
  const tiles = [];
  for (let i = end; i !== -1; i = cameFrom[i]) {
    tiles.push({ x: i % GRID_W, z: (i / GRID_W) | 0 });
  }
  tiles.reverse();
  const points = tiles.map((t) => ({ x: tileToWorldX(t.x), z: tileToWorldZ(t.z) }));
  return smooth(points, mall);
}

/**
 * Drops waypoints the character can simply walk past in a straight line.
 * Runs greedily from the start, which is enough for corridor-shaped maps.
 */
function smooth(points, mall) {
  if (points.length < 3) return points;
  const out = [points[0]];
  let anchor = 0;
  for (let i = 1; i < points.length; i++) {
    if (!clearLine(mall, points[anchor], points[i])) {
      out.push(points[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(points[points.length - 1]);
  return out.slice(1); // the anchor is where we already stand
}

/** Sampled circle-sweep test: can a body of PLAYER_RADIUS travel a to b? */
export function clearLine(mall, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(2, Math.ceil(dist / (TILE * 0.3)));
  const r = PLAYER_RADIUS * 0.95;

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    // Four probes around the body silhouette.
    for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      if (mall.isSolid(worldToTileX(px + ox), worldToTileZ(pz + oz))) return false;
    }
  }
  return true;
}
