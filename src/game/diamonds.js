/**
 * The collectable diamonds scattered along the walkways.
 *
 * Two InstancedMeshes (pink and purple) cover every spawn point, so the whole
 * field costs two draw calls. Picked-up diamonds shrink away and come back after
 * DIAMOND_RESPAWN seconds — the player can never run permanently dry.
 */
import * as THREE from 'three';
import {
  GRID_W, GRID_H, DIAMOND_MIN_GAP, DIAMOND_PICK_RADIUS,
  DIAMOND_RESPAWN, DIAMOND_VALUE, PURPLE_CHANCE,
} from './config.js';
import { tileToWorldX, tileToWorldZ } from './mall.js';

const COLORS = {
  pink: { base: 0xff5fc4, emissive: 0xff2fa8 },
  purple: { base: 0xa46bff, emissive: 0x7a2bff },
};

export function createDiamonds(scene, mall) {
  /* -------------------------------------------------- spawn point layout */

  const points = [];
  const taken = new Set();
  const rng = mall.rng;

  for (let z = 1; z < GRID_H - 1; z++) {
    for (let x = 1; x < GRID_W - 1; x++) {
      if (mall.isSolid(x, z)) continue;
      if (mall.shopAtTile(x, z)) continue; // keep the doormats clear
      if (x === mall.spawn.x && z === mall.spawn.z) continue;

      let tooClose = false;
      for (let dz = -DIAMOND_MIN_GAP; dz <= DIAMOND_MIN_GAP && !tooClose; dz++) {
        for (let dx = -DIAMOND_MIN_GAP; dx <= DIAMOND_MIN_GAP; dx++) {
          if (taken.has(`${x + dx},${z + dz}`)) {
            tooClose = true;
            break;
          }
        }
      }
      if (tooClose) continue;

      taken.add(`${x},${z}`);
      points.push({
        tile: { x, z },
        x: tileToWorldX(x),
        z: tileToWorldZ(z),
        kind: rng() < PURPLE_CHANCE ? 'purple' : 'pink',
        active: true,
        respawnAt: 0,
        scale: 1,
        phase: rng() * Math.PI * 2,
      });
    }
  }

  /* ----------------------------------------------------------- rendering */

  const geometry = new THREE.OctahedronGeometry(0.55, 0);
  geometry.scale(1, 1.45, 1);
  geometry.computeVertexNormals();

  const meshes = {};
  const buckets = { pink: [], purple: [] };
  for (const p of points) buckets[p.kind].push(p);

  for (const kind of ['pink', 'purple']) {
    const list = buckets[kind];
    if (!list.length) continue;
    const material = new THREE.MeshStandardMaterial({
      color: COLORS[kind].base,
      emissive: COLORS[kind].emissive,
      // Emissive is deliberately low: crank it and the facets stop catching the
      // light, leaving the gems looking like flat paper cut-outs.
      emissiveIntensity: 0.28,
      metalness: 0.25,
      roughness: 0.08,
      envMapIntensity: 2.2,
      flatShading: true,
      transparent: true,
      opacity: 0.94,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    meshes[kind] = mesh;
    list.forEach((p, i) => {
      p.mesh = mesh;
      p.index = i;
    });
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  let clock = 0;

  return {
    points,

    /** How many diamonds are currently on the floor. */
    get available() {
      return points.reduce((n, p) => n + (p.active ? 1 : 0), 0);
    },

    /**
     * Advances spin/bob, handles respawns and reports pickups.
     * `onCollect(point, value)` fires once per diamond.
     */
    update(dt, player, onCollect) {
      clock += dt;
      const r2 = DIAMOND_PICK_RADIUS * DIAMOND_PICK_RADIUS;

      for (const p of points) {
        if (!p.active && clock >= p.respawnAt) {
          p.active = true;
          p.scale = 0;
        }

        if (p.active) {
          const dx = p.x - player.x;
          const dz = p.z - player.z;
          if (p.scale > 0.7 && dx * dx + dz * dz < r2) {
            p.active = false;
            p.respawnAt = clock + DIAMOND_RESPAWN;
            onCollect?.(p, DIAMOND_VALUE[p.kind]);
          } else if (p.scale < 1) {
            p.scale = Math.min(1, p.scale + dt * 3.4);
          }
        } else if (p.scale > 0) {
          p.scale = Math.max(0, p.scale - dt * 7);
        }

        if (!p.mesh) continue;
        const bob = Math.sin(clock * 2 + p.phase) * 0.12;
        euler.set(0, clock * 1.6 + p.phase, Math.sin(clock * 1.2 + p.phase) * 0.16);
        q.setFromEuler(euler);
        pos.set(p.x, 0.95 + bob, p.z);
        const s = p.scale * (p.scale * (3 - 2 * p.scale)); // ease the pop-in
        scl.setScalar(s);
        m4.compose(pos, q, scl);
        p.mesh.setMatrixAt(p.index, m4);
      }

      for (const mesh of Object.values(meshes)) mesh.instanceMatrix.needsUpdate = true;
    },

    dispose() {
      for (const mesh of Object.values(meshes)) {
        scene.remove(mesh);
        mesh.material.dispose();
      }
      geometry.dispose();
    },
  };
}
