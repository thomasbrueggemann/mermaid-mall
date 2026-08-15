/**
 * Procedural mall layout.
 *
 * Blocks of shops sit on a lattice of two-tile-wide walkways. To get the
 * "almost a maze" feel we then plug random corridor *segments* with planters and
 * fountains, keeping junctions open and re-checking full connectivity after each
 * plug — so every walkway tile in the finished mall is always reachable.
 */
import {
  TILE, BLOCK, CORRIDOR, BLOCKS_X, BLOCKS_Z,
  GRID_W, GRID_H, WORLD_W, WORLD_H,
  FLOOR, SOLID, MAZE_DENSITY,
} from './config.js';
import { mulberry32, shuffle, pick } from './rng.js';
import { SHOP_CATALOG } from './shops.js';

export const idx = (x, z) => z * GRID_W + x;
export const inBounds = (x, z) => x >= 0 && z >= 0 && x < GRID_W && z < GRID_H;

export const tileToWorldX = (tx) => (tx + 0.5) * TILE - WORLD_W / 2;
export const tileToWorldZ = (tz) => (tz + 0.5) * TILE - WORLD_H / 2;
export const worldToTileX = (wx) => Math.floor((wx + WORLD_W / 2) / TILE);
export const worldToTileZ = (wz) => Math.floor((wz + WORLD_H / 2) / TILE);

const blockOriginX = (bx) => CORRIDOR + bx * (BLOCK + CORRIDOR);
const blockOriginZ = (bz) => CORRIDOR + bz * (BLOCK + CORRIDOR);
const colOriginX = (i) => i * (BLOCK + CORRIDOR);
const rowOriginZ = (j) => j * (BLOCK + CORRIDOR);

/**
 * Facing directions for a shop front, in tile deltas. `yaw` rotates a storefront
 * modelled with its front along +Z so that it faces this side.
 */
const SIDES = [
  { name: 'north', dx: 0, dz: -1, yaw: Math.PI },
  { name: 'south', dx: 0, dz: 1, yaw: 0 },
  { name: 'west', dx: -1, dz: 0, yaw: -Math.PI / 2 },
  { name: 'east', dx: 1, dz: 0, yaw: Math.PI / 2 },
];

function fill(grid, x0, z0, w, h, value) {
  for (let z = z0; z < z0 + h; z++) {
    for (let x = x0; x < x0 + w; x++) {
      if (inBounds(x, z)) grid[idx(x, z)] = value;
    }
  }
}

/** Flood fill over walkable tiles; true when every floor tile is reachable. */
function isConnected(grid) {
  let start = -1;
  let total = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === FLOOR) {
      total++;
      if (start < 0) start = i;
    }
  }
  if (start < 0) return false;

  const seen = new Uint8Array(grid.length);
  const queue = new Int32Array(grid.length);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  seen[start] = 1;
  let count = 0;

  while (head < tail) {
    const cur = queue[head++];
    count++;
    const x = cur % GRID_W;
    const z = (cur / GRID_W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (!inBounds(nx, nz)) continue;
      const ni = idx(nx, nz);
      if (seen[ni] || grid[ni] !== FLOOR) continue;
      seen[ni] = 1;
      queue[tail++] = ni;
    }
  }
  return count === total;
}

/** Every corridor stretch that runs alongside one block — the maze candidates. */
function buildSegments() {
  const segments = [];
  for (let i = 0; i <= BLOCKS_X; i++) {
    for (let bz = 0; bz < BLOCKS_Z; bz++) {
      segments.push({
        x: colOriginX(i), z: blockOriginZ(bz),
        w: CORRIDOR, h: BLOCK, vertical: true,
      });
    }
  }
  for (let j = 0; j <= BLOCKS_Z; j++) {
    for (let bx = 0; bx < BLOCKS_X; bx++) {
      segments.push({
        x: blockOriginX(bx), z: rowOriginZ(j),
        w: BLOCK, h: CORRIDOR, vertical: false,
      });
    }
  }
  return segments;
}

export function generateMall(seed = Date.now()) {
  const rng = mulberry32(seed);
  const grid = new Uint8Array(GRID_W * GRID_H).fill(FLOOR);

  // 1. Shop blocks.
  const blocks = [];
  for (let bz = 0; bz < BLOCKS_Z; bz++) {
    for (let bx = 0; bx < BLOCKS_X; bx++) {
      const x = blockOriginX(bx);
      const z = blockOriginZ(bz);
      fill(grid, x, z, BLOCK, BLOCK, SOLID);
      blocks.push({ bx, bz, x, z });
    }
  }

  // 2. Plug corridor segments while the mall stays fully connected.
  const segments = shuffle(buildSegments(), rng);
  const target = Math.floor(segments.length * MAZE_DENSITY);
  const plugged = [];
  for (const seg of segments) {
    if (plugged.length >= target) break;
    fill(grid, seg.x, seg.z, seg.w, seg.h, SOLID);
    if (isConnected(grid)) plugged.push(seg);
    else fill(grid, seg.x, seg.z, seg.w, seg.h, FLOOR);
  }

  // 3. One shop per block, its door on a side that still faces open walkway.
  const catalog = shuffle([...SHOP_CATALOG], rng);
  const shops = [];

  blocks.forEach((block, n) => {
    const def = catalog[n % catalog.length];
    let placed = null;

    for (const side of shuffle([...SIDES], rng)) {
      const door = doorTileFor(block, side);
      if (inBounds(door.x, door.z) && grid[idx(door.x, door.z)] === FLOOR) {
        placed = { side, door };
        break;
      }
    }

    // Boxed in by planters on all four sides: reopen the segment in front of a
    // random side. Re-opening tiles can never disconnect the graph.
    if (!placed) {
      const side = pick(SIDES, rng);
      const seg = segmentInFront(block, side);
      if (seg) {
        fill(grid, seg.x, seg.z, seg.w, seg.h, FLOOR);
        const at = plugged.findIndex((s) => s.x === seg.x && s.z === seg.z);
        if (at >= 0) plugged.splice(at, 1);
      }
      placed = { side, door: doorTileFor(block, side) };
    }

    const { side, door } = placed;
    shops.push({
      id: n,
      ...def,
      block,
      side: side.name,
      yaw: side.yaw,
      doorTile: door,
      doorWorld: { x: tileToWorldX(door.x), z: tileToWorldZ(door.z) },
      centerWorld: {
        x: tileToWorldX(block.x) + ((BLOCK - 1) * TILE) / 2,
        z: tileToWorldZ(block.z) + ((BLOCK - 1) * TILE) / 2,
      },
      color: hueToColor(def.hue),
    });
  });

  const doorLookup = new Map();
  for (const shop of shops) doorLookup.set(idx(shop.doorTile.x, shop.doorTile.z), shop);

  return {
    seed, grid, shops, plugged, doorLookup, rng,
    isSolid: (x, z) => !inBounds(x, z) || grid[idx(x, z)] === SOLID,
    shopAtTile: (x, z) => (inBounds(x, z) ? doorLookup.get(idx(x, z)) : undefined),
    spawn: findSpawn(grid),
  };
}

function doorTileFor(block, side) {
  const mid = Math.floor(BLOCK / 2);
  if (side.dz === -1) return { x: block.x + mid, z: block.z - 1 };
  if (side.dz === 1) return { x: block.x + mid, z: block.z + BLOCK };
  if (side.dx === -1) return { x: block.x - 1, z: block.z + mid };
  return { x: block.x + BLOCK, z: block.z + mid };
}

function segmentInFront(block, side) {
  if (side.dz === -1) return { x: block.x, z: block.z - CORRIDOR, w: BLOCK, h: CORRIDOR };
  if (side.dz === 1) return { x: block.x, z: block.z + BLOCK, w: BLOCK, h: CORRIDOR };
  if (side.dx === -1) return { x: block.x - CORRIDOR, z: block.z, w: CORRIDOR, h: BLOCK };
  return { x: block.x + BLOCK, z: block.z, w: CORRIDOR, h: BLOCK };
}

/** Start the player near the middle of the mall, on the closest open tile. */
function findSpawn(grid) {
  const cx = Math.floor(GRID_W / 2);
  const cz = Math.floor(GRID_H / 2);
  let best = { x: 1, z: 1 };
  let bestD = Infinity;
  for (let z = 0; z < GRID_H; z++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid[idx(x, z)] !== FLOOR) continue;
      const d = (x - cx) ** 2 + (z - cz) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { x, z };
      }
    }
  }
  return best;
}

/** Cheerful, well-separated hues for the storefronts. */
function hueToColor(h) {
  const s = 0.62;
  const l = 0.6;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (h * 6) % 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  return { r: r + m, g: g + m, b: b + m };
}
