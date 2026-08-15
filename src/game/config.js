/** Tuning knobs for the whole game. */

// --- world grid -----------------------------------------------------------
export const TILE = 3; // world units per grid tile
export const BLOCK = 4; // tiles per shop block side
export const CORRIDOR = 2; // tiles of walkway between blocks
export const BLOCKS_X = 5;
export const BLOCKS_Z = 4;

export const GRID_W = CORRIDOR + BLOCKS_X * (BLOCK + CORRIDOR);
export const GRID_H = CORRIDOR + BLOCKS_Z * (BLOCK + CORRIDOR);
export const WORLD_W = GRID_W * TILE;
export const WORLD_H = GRID_H * TILE;

export const SHOP_H = 3.4; // shop block height

// Fraction of corridor segments turned into planters/fountains, which is what
// gives the mall its gentle maze feel. Connectivity is always re-verified.
export const MAZE_DENSITY = 0.34;

// --- tiles ----------------------------------------------------------------
export const FLOOR = 0;
export const SOLID = 1;

// --- player ---------------------------------------------------------------
export const PLAYER_RADIUS = 0.85;
export const PLAYER_SPEED = 10.5; // world units / second
export const TURN_SPEED = 9;

// --- diamonds -------------------------------------------------------------
export const DIAMOND_MIN_GAP = 1; // tiles between spawn points
export const DIAMOND_PICK_RADIUS = 1.35;
export const DIAMOND_RESPAWN = 11; // seconds
export const DIAMOND_VALUE = { pink: 1, purple: 3 };
export const PURPLE_CHANCE = 0.22;

// --- missions -------------------------------------------------------------
export const MISSION_COST = [3, 4, 5, 5, 6, 7, 8, 8, 9, 10];
export const MISSION_COST_MAX = 12;

// --- camera ---------------------------------------------------------------
export const CAM_HEIGHT = 28; // ortho frustum height in world units
export const CAM_ZOOM_RANGE = [0.6, 1.6];
export const CAM_DIR = [1, 1.35, 1]; // isometric view direction (~44° elevation)
export const CAM_LERP = 5.5;
export const CAM_DIST = 90; // how far back the ortho camera sits (clipping only)
export const CHARACTER_SCALE = 1.65; // big enough to spot instantly on a tablet
