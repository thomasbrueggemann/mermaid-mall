/**
 * Sparkle bursts, confetti and the tap-to-walk marker.
 *
 * All particles live in one pooled Points cloud with additive blending, so the
 * whole effects layer is a single draw call no matter how much is going on.
 */
import * as THREE from 'three';
import { sparkleSprite, texture } from './textures.js';

const MAX_PARTICLES = 400;

export function createEffects(scene) {
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.55,
    map: texture(sparkleSprite()),
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 3;
  scene.add(points);

  // Pool: `life <= 0` means the slot is free and parked far below the floor.
  const pool = Array.from({ length: MAX_PARTICLES }, () => ({
    x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0,
    life: 0, maxLife: 1, gravity: -9, r: 1, g: 1, b: 1,
  }));
  let cursor = 0;

  function spawn(cfg) {
    const p = pool[cursor];
    cursor = (cursor + 1) % MAX_PARTICLES;
    Object.assign(p, cfg);
    p.maxLife = cfg.life;
    return p;
  }

  /* ------------------------------------------------------- tap marker -- */

  const markerMat = new THREE.MeshBasicMaterial({
    color: 0xfff0ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.85, 28), markerMat);
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.06;
  marker.renderOrder = 2;
  scene.add(marker);
  let markerLife = 0;

  const tmp = new THREE.Color();

  return {
    /** A pop of sparks in `color` — used for diamond pickups. */
    burst(x, y, z, color, count = 16, power = 3.4) {
      tmp.set(color);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const up = 0.35 + Math.random() * 0.9;
        const s = power * (0.45 + Math.random() * 0.75);
        spawn({
          x, y, z,
          vx: Math.cos(a) * s * 0.6,
          vy: up * s,
          vz: Math.sin(a) * s * 0.6,
          gravity: -9,
          life: 0.5 + Math.random() * 0.45,
          r: tmp.r, g: tmp.g, b: tmp.b,
        });
      }
    },

    /** Big celebratory shower for a completed mission. */
    confetti(x, y, z, count = 90) {
      const palette = [0xff5fc4, 0xa46bff, 0xffd166, 0x6fe3c4, 0xffffff, 0x7cc8ff];
      for (let i = 0; i < count; i++) {
        tmp.set(palette[(Math.random() * palette.length) | 0]);
        const a = Math.random() * Math.PI * 2;
        const s = 2 + Math.random() * 5;
        spawn({
          x: x + (Math.random() - 0.5) * 1.5,
          y: y + Math.random() * 1.2,
          z: z + (Math.random() - 0.5) * 1.5,
          vx: Math.cos(a) * s * 0.7,
          vy: 4.5 + Math.random() * 5,
          vz: Math.sin(a) * s * 0.7,
          gravity: -7.5,
          life: 1.1 + Math.random() * 0.9,
          r: tmp.r, g: tmp.g, b: tmp.b,
        });
      }
    },

    /** Ring pulse where the player tapped. */
    mark(x, z) {
      marker.position.set(x, 0.06, z);
      markerLife = 0.85;
    },

    update(dt) {
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = pool[i];
        const o = i * 3;
        if (p.life <= 0) {
          positions[o + 1] = -999;
          continue;
        }
        p.life -= dt;
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;

        // Bounce once off the floor so confetti settles instead of sinking.
        if (p.y < 0.08 && p.vy < 0) {
          p.y = 0.08;
          p.vy *= -0.35;
          p.vx *= 0.6;
          p.vz *= 0.6;
        }

        const fade = Math.max(0, p.life / p.maxLife);
        positions[o] = p.x;
        positions[o + 1] = p.y;
        positions[o + 2] = p.z;
        colors[o] = p.r * fade;
        colors[o + 1] = p.g * fade;
        colors[o + 2] = p.b * fade;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;

      if (markerLife > 0) {
        markerLife -= dt;
        const t = 1 - markerLife / 0.85;
        marker.scale.setScalar(0.6 + t * 1.5);
        markerMat.opacity = Math.max(0, 1 - t) * 0.9;
      } else {
        markerMat.opacity = 0;
      }
    },

    dispose() {
      scene.remove(points);
      scene.remove(marker);
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
      marker.geometry.dispose();
      markerMat.dispose();
    },
  };
}
