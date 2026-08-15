/**
 * Player movement: follows an A* path when you tap the floor, or steers directly
 * from the keyboard / on-screen stick. Both modes share the same tilemap
 * collision resolve so the character can never slip inside a storefront.
 */
import * as THREE from 'three';
import {
  TILE, PLAYER_RADIUS, PLAYER_SPEED, TURN_SPEED, CAM_DIR, CHARACTER_SCALE,
} from './config.js';
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ } from './mall.js';
import { createCharacter } from './characters.js';
import { glowDisc, texture } from './textures.js';

// Screen-space basis flattened onto the ground, derived from the fixed camera.
const FWD = new THREE.Vector2(-CAM_DIR[0], -CAM_DIR[2]).normalize();
const RIGHT = new THREE.Vector2(-FWD.y, FWD.x);

export function createPlayer(scene, mall, type) {
  const character = createCharacter(type);
  character.group.scale.setScalar(CHARACTER_SCALE);
  // Measured rather than declared — hair and horns make the real silhouette
  // taller than the body, and the guide arrow has to clear it.
  character.group.updateMatrixWorld(true);
  const height = new THREE.Box3().setFromObject(character.group).max.y;

  const group = new THREE.Group();
  group.add(character.group);
  group.position.set(tileToWorldX(mall.spawn.x), 0, tileToWorldZ(mall.spawn.z));
  scene.add(group);

  // A soft pool of light under the character. Grounds her against the marble and,
  // more importantly, means a small child can always find themselves on screen.
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.4),
    new THREE.MeshBasicMaterial({
      map: texture(glowDisc()),
      color: type === 'unicorn' ? 0xfff0b8 : 0xffb6e8,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.04;
  halo.renderOrder = 2;
  group.add(halo);

  // Floating arrow that always points at the current mission shop.
  const guide = new THREE.Group();
  guide.position.y = height + 0.75;
  group.add(guide);
  const arrowMat = new THREE.MeshStandardMaterial({
    color: 0xffe066, emissive: 0xffc23c, emissiveIntensity: 1.6,
    roughness: 0.2, metalness: 0.6,
  });
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.85, 5), arrowMat);
  arrow.rotation.x = Math.PI / 2; // point along +Z, then yaw the group
  guide.add(arrow);
  guide.visible = false;

  const pos = new THREE.Vector2(group.position.x, group.position.z);
  const velocity = new THREE.Vector2();
  const desired = new THREE.Vector2();

  let path = [];
  let heading = 0;
  let gait = 0;
  let clock = 0;
  let guideTarget = null;

  function resolveCollisions() {
    const gx = worldToTileX(pos.x);
    const gz = worldToTileZ(pos.y);
    for (let z = gz - 1; z <= gz + 1; z++) {
      for (let x = gx - 1; x <= gx + 1; x++) {
        if (!mall.isSolid(x, z)) continue;
        const minX = tileToWorldX(x) - TILE / 2;
        const minZ = tileToWorldZ(z) - TILE / 2;
        const cx = Math.min(Math.max(pos.x, minX), minX + TILE);
        const cz = Math.min(Math.max(pos.y, minZ), minZ + TILE);
        let dx = pos.x - cx;
        let dz = pos.y - cz;
        let d = Math.hypot(dx, dz);

        if (d > PLAYER_RADIUS) continue;

        if (d < 1e-5) {
          // Dead centre inside a solid tile: push out along the shallowest axis.
          const toLeft = pos.x - minX;
          const toRight = minX + TILE - pos.x;
          const toTop = pos.y - minZ;
          const toBottom = minZ + TILE - pos.y;
          const m = Math.min(toLeft, toRight, toTop, toBottom);
          if (m === toLeft) pos.x = minX - PLAYER_RADIUS;
          else if (m === toRight) pos.x = minX + TILE + PLAYER_RADIUS;
          else if (m === toTop) pos.y = minZ - PLAYER_RADIUS;
          else pos.y = minZ + TILE + PLAYER_RADIUS;
          continue;
        }
        const push = (PLAYER_RADIUS - d) / d;
        pos.x += dx * push;
        pos.y += dz * push;
      }
    }
  }

  return {
    group,
    character,
    type,

    get position() {
      return { x: pos.x, z: pos.y };
    },
    get tile() {
      return { x: worldToTileX(pos.x), z: worldToTileZ(pos.y) };
    },
    get gait() {
      return gait;
    },
    get hasPath() {
      return path.length > 0;
    },

    setPath(points) {
      path = points ?? [];
    },
    stop() {
      path = [];
      velocity.set(0, 0);
    },

    /** Snaps the character to a world position without any pathing. */
    warpTo(x, z) {
      path = [];
      velocity.set(0, 0);
      pos.set(x, z);
      group.position.set(x, 0, z);
    },

    /** Shows the floating arrow and aims it at a world position (or hides it). */
    pointAt(worldPos) {
      guideTarget = worldPos;
      guide.visible = !!worldPos;
    },

    update(dt, input) {
      clock += dt;
      desired.set(0, 0);

      // Direct steering always wins over an active path.
      if (input.x || input.y) {
        path = [];
        desired
          .set(RIGHT.x * input.x + FWD.x * input.y, RIGHT.y * input.x + FWD.y * input.y)
          .clampLength(0, 1);
      } else if (path.length) {
        const wp = path[0];
        const dx = wp.x - pos.x;
        const dz = wp.z - pos.y;
        const dist = Math.hypot(dx, dz);
        const last = path.length === 1;
        if (dist < (last ? 0.35 : 0.7)) {
          path.shift();
        } else {
          desired.set(dx / dist, dz / dist);
          // Ease into the final step so she doesn't overshoot and jitter.
          if (last && dist < 1.6) desired.multiplyScalar(Math.max(0.28, dist / 1.6));
        }
      }

      const targetVel = desired.clone().multiplyScalar(PLAYER_SPEED);
      velocity.lerp(targetVel, Math.min(1, dt * 12));
      if (velocity.lengthSq() < 0.0004) velocity.set(0, 0);

      pos.x += velocity.x * dt;
      pos.y += velocity.y * dt;
      resolveCollisions();

      group.position.x = pos.x;
      group.position.z = pos.y;

      const speed = velocity.length();
      gait = Math.min(1, speed / PLAYER_SPEED);

      if (speed > 0.35) {
        const want = Math.atan2(velocity.x, velocity.y);
        let delta = want - heading;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        heading += delta * Math.min(1, dt * TURN_SPEED);
      }
      character.group.rotation.y = heading;

      if (guide.visible && guideTarget) {
        guide.rotation.y = Math.atan2(guideTarget.x - pos.x, guideTarget.z - pos.y);
        guide.position.y = height + 0.75 + Math.sin(clock * 3.4) * 0.14;
        arrow.rotation.z = Math.sin(clock * 2) * 0.12;
      }

      halo.material.opacity = 0.32 + Math.sin(clock * 2.6) * 0.08;
      character.update(dt, gait);
    },
  };
}
