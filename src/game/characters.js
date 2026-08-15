/**
 * The two playable characters, modelled from primitives.
 *
 * Both expose the same interface: a `group` to place in the scene and an
 * `update(dt, gait)` where `gait` is 0..1 normalised movement speed. The mermaid
 * wobbles and hops (she has no legs); the unicorn trots.
 */
import * as THREE from 'three';
import { scaleTexture, rainbowRamp, texture } from './textures.js';

const skinMat = () =>
  new THREE.MeshStandardMaterial({ color: 0xffd9c0, roughness: 0.62, metalness: 0.02 });

function eyes(parent, spread, y, z, size = 0.11) {
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x241832, roughness: 0.2 });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 12), white);
    e.position.set(sx * spread, y, z);
    e.scale.set(1, 1.15, 0.7);
    parent.add(e);

    const p = new THREE.Mesh(new THREE.SphereGeometry(size * 0.58, 12, 10), dark);
    p.position.set(sx * spread, y, z + size * 0.55);
    p.scale.set(1, 1.1, 0.7);
    parent.add(p);

    const g = new THREE.Mesh(new THREE.SphereGeometry(size * 0.2, 8, 6), shine);
    g.position.set(sx * spread + size * 0.2, y + size * 0.3, z + size * 0.8);
    parent.add(g);
  }
}

/* -------------------------------------------------------------- mermaid -- */

function buildMermaid() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const skin = skinMat();
  const scaleMap = texture(scaleTexture(), { repeat: [2, 2] });
  const tailMat = new THREE.MeshStandardMaterial({
    map: scaleMap,
    roughness: 0.22,
    metalness: 0.45,
    envMapIntensity: 1.8,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0xff58bb, roughness: 0.4, metalness: 0.15, envMapIntensity: 1.2,
  });
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xffa8dd, roughness: 0.3, metalness: 0.35, envMapIntensity: 1.6,
  });

  // --- tail: a chain so a wave can travel down it ---
  const segments = [];
  let parent = body;
  const HIP_Y = 1.02;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    seg.position.y = i === 0 ? HIP_Y : -0.26;
    parent.add(seg);

    const r = 0.34 - i * 0.062;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), tailMat);
    mesh.scale.set(r, 0.19, r * 0.86);
    mesh.position.y = -0.1;
    mesh.castShadow = true;
    seg.add(mesh);

    segments.push(seg);
    parent = seg;
  }

  // --- fluke ---
  const fluke = new THREE.Group();
  fluke.position.y = -0.2;
  parent.add(fluke);
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.62, 5), tailMat);
    f.scale.set(1, 1, 0.28);
    f.position.set(sx * 0.22, -0.18, 0);
    f.rotation.z = sx * 0.85;
    f.rotation.x = -0.25;
    f.castShadow = true;
    fluke.add(f);
  }

  // --- torso, arms, head ---
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.29, 0.42, 6, 16), skin);
  torso.position.y = HIP_Y + 0.33;
  torso.castShadow = true;
  body.add(torso);

  for (const sx of [-1, 1]) {
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), shellMat);
    shell.position.set(sx * 0.15, HIP_Y + 0.45, 0.2);
    shell.scale.set(1, 1, 0.65);
    body.add(shell);
  }

  const arms = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.31, HIP_Y + 0.55, 0);
    body.add(pivot);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.4, 4, 10), skin);
    arm.position.y = -0.24;
    arm.castShadow = true;
    pivot.add(arm);
    pivot.rotation.z = sx * 0.22;
    arms.push(pivot);
  }

  const head = new THREE.Group();
  head.position.y = HIP_Y + 0.86;
  body.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.31, 20, 16), skin);
  skull.scale.set(1, 1.06, 0.96);
  skull.castShadow = true;
  head.add(skull);
  eyes(head, 0.125, 0.03, 0.27, 0.085);

  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.017, 6, 12, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xd4457a, roughness: 0.4 }),
  );
  smile.position.set(0, -0.12, 0.27);
  smile.rotation.set(0.2, 0, Math.PI);
  head.add(smile);

  // Hair: a cap plus swaying strands.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.335, 20, 16, 0, Math.PI * 2, 0, 1.5), hairMat);
  cap.position.y = 0.02;
  cap.castShadow = true;
  head.add(cap);

  const strands = [];
  for (let i = 0; i < 7; i++) {
    const a = -0.35 + (i / 6) * (Math.PI * 1.7) + Math.PI * 0.65;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * 0.24, 0.08, Math.sin(a) * 0.24);
    head.add(pivot);
    const len = 0.5 + (i % 3) * 0.16;
    const strand = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, len, 4, 8), hairMat);
    strand.position.y = -len / 2;
    strand.castShadow = true;
    pivot.add(strand);
    strands.push({ pivot, phase: i * 0.8 });
  }

  const pearl = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 12, 10),
    new THREE.MeshStandardMaterial({
      color: 0xfff3ff, roughness: 0.06, metalness: 0.6, envMapIntensity: 2.4,
    }),
  );
  pearl.position.set(0.24, 0.14, 0.16);
  head.add(pearl);

  // Lifts the model so the fluke rests on the floor instead of sinking into it.
  const BASE_Y = 0.55;

  let t = 0;
  return {
    group,
    update(dt, gait) {
      t += dt * (1.4 + gait * 6.2);
      const amp = 0.06 + gait * 0.16;

      // Hop: the harder she swims, the higher the bounce.
      body.position.y = BASE_Y + Math.abs(Math.sin(t)) * (0.05 + gait * 0.2);
      body.rotation.z = Math.sin(t * 0.5) * (0.03 + gait * 0.07);

      // Wave travelling down the tail.
      segments.forEach((seg, i) => {
        seg.rotation.z = Math.sin(t - i * 0.75) * amp;
        seg.rotation.x = Math.cos(t * 0.6 - i * 0.5) * amp * 0.4;
      });
      fluke.rotation.x = Math.sin(t - 3) * (0.15 + gait * 0.3);

      arms.forEach((a, i) => {
        const s = i === 0 ? -1 : 1;
        a.rotation.z = s * (0.22 + Math.sin(t + i * Math.PI) * (0.05 + gait * 0.28));
        a.rotation.x = Math.sin(t * 0.8 + i) * 0.12;
      });

      head.rotation.z = Math.sin(t * 0.5 + 1) * 0.05;
      head.rotation.y = Math.sin(t * 0.33) * 0.12;

      for (const s of strands) {
        s.pivot.rotation.x = Math.sin(t * 0.9 + s.phase) * (0.1 + gait * 0.22);
        s.pivot.rotation.z = Math.cos(t * 0.7 + s.phase) * 0.1;
      }
    },
  };
}

/* -------------------------------------------------------------- unicorn -- */

function buildUnicorn() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  // Lavender rather than white: a white coat vanishes against the marble floor.
  const coat = new THREE.MeshStandardMaterial({
    color: 0xf0dcff, roughness: 0.5, metalness: 0.04, envMapIntensity: 1.1,
  });
  const hoof = new THREE.MeshStandardMaterial({
    color: 0xffcf5e, roughness: 0.28, metalness: 0.8, envMapIntensity: 2 ,
  });
  const maneMap = texture(rainbowRamp(), { repeat: [1, 1] });
  const maneMat = new THREE.MeshStandardMaterial({
    map: maneMap, roughness: 0.35, metalness: 0.2, envMapIntensity: 1.4,
  });
  const hornMat = new THREE.MeshStandardMaterial({
    color: 0xffd45e, emissive: 0xffb63c, emissiveIntensity: 0.55,
    roughness: 0.18, metalness: 0.9, envMapIntensity: 2.4,
  });

  const BACK_Y = 1.02;

  // Capsules run along Y, so tip it onto Z — the axis the unicorn faces along.
  const barrel = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.66, 8, 18), coat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.y = BACK_Y;
  barrel.castShadow = true;
  body.add(barrel);

  // Saddle blanket: a solid block of colour so the unicorn reads at a glance.
  const blanket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.44, 0.44, 0.66, 20, 1, true, Math.PI * 0.1, Math.PI * 0.8),
    new THREE.MeshStandardMaterial({
      map: maneMap, roughness: 0.55, metalness: 0.15,
      side: THREE.DoubleSide, envMapIntensity: 1.2,
    }),
  );
  blanket.rotation.x = Math.PI / 2;
  blanket.position.set(0, BACK_Y, -0.02);
  blanket.castShadow = true;
  body.add(blanket);

  // --- legs ---
  const legs = [];
  for (const [sx, sz, phase] of [
    [-1, 1, 0], [1, 1, Math.PI], [-1, -1, Math.PI], [1, -1, 0],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.27, BACK_Y - 0.22, sz * 0.42);
    body.add(pivot);

    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 4, 10), coat);
    leg.position.y = -0.3;
    leg.castShadow = true;
    pivot.add(leg);

    const shoe = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.16, 10), hoof);
    shoe.position.y = -0.6;
    pivot.add(shoe);

    legs.push({ pivot, phase });
  }

  // --- neck + head ---
  const neck = new THREE.Group();
  neck.position.set(0, BACK_Y + 0.16, 0.42);
  body.add(neck);

  const column = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.42, 6, 14), coat);
  column.position.set(0, 0.24, 0.1);
  column.rotation.x = 0.42;
  column.castShadow = true;
  neck.add(column);

  const head = new THREE.Group();
  head.position.set(0, 0.52, 0.28);
  neck.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), coat);
  skull.scale.set(1, 1, 1.1);
  skull.castShadow = true;
  head.add(skull);

  const muzzle = new THREE.Mesh(new THREE.CapsuleGeometry(0.135, 0.2, 5, 12), coat);
  muzzle.rotation.x = Math.PI / 2;
  muzzle.position.set(0, -0.08, 0.28);
  head.add(muzzle);

  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xffb2d6, roughness: 0.5 }),
  );
  nose.position.set(0, -0.08, 0.42);
  head.add(nose);

  eyes(head, 0.14, 0.05, 0.19, 0.075);

  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 8), coat);
    ear.position.set(sx * 0.15, 0.24, -0.02);
    ear.rotation.z = sx * 0.3;
    head.add(ear);
  }

  // Spiral horn.
  const horn = new THREE.Group();
  horn.position.set(0, 0.24, 0.13);
  horn.rotation.x = -0.34;
  head.add(horn);
  for (let i = 0; i < 5; i++) {
    const r = 0.075 - i * 0.013;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022, 6, 12), hornMat);
    ring.position.y = 0.05 + i * 0.075;
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = i * 0.8;
    horn.add(ring);
  }
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.42, 10), hornMat);
  tip.position.y = 0.22;
  tip.castShadow = true;
  horn.add(tip);

  // --- mane + tail ---
  const maneStrands = [];
  for (let i = 0; i < 6; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.12 + i * 0.12, 0.24 - i * 0.055);
    neck.add(pivot);
    const len = 0.42 - i * 0.03;
    const strand = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, len, 4, 8), maneMat);
    strand.position.set(0, -len * 0.35, -0.16);
    strand.rotation.x = -0.5;
    strand.castShadow = true;
    pivot.add(strand);
    maneStrands.push({ pivot, phase: i * 0.6 });
  }

  const tail = new THREE.Group();
  tail.position.set(0, BACK_Y + 0.18, -0.6);
  body.add(tail);
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 0.9;
    const strand = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.7, 4, 8), maneMat);
    strand.position.set(Math.sin(a) * 0.12, -0.3, -0.16 - Math.abs(a) * 0.05);
    strand.rotation.set(-0.35, 0, a * 0.5);
    strand.castShadow = true;
    tail.add(strand);
  }

  // Drops the model so the hooves meet the floor.
  const BASE_Y = -0.12;

  let t = 0;
  return {
    group,
    update(dt, gait) {
      t += dt * (2 + gait * 8);
      body.position.y = BASE_Y + Math.abs(Math.sin(t)) * (0.02 + gait * 0.11);
      body.rotation.x = Math.sin(t * 2) * gait * 0.05;

      for (const l of legs) {
        // Trotting when moving, gentle weight-shift when idle.
        l.pivot.rotation.x = Math.sin(t + l.phase) * (0.06 + gait * 0.72);
      }
      neck.rotation.x = -Math.sin(t) * (0.02 + gait * 0.09);
      head.rotation.z = Math.sin(t * 0.6) * 0.05;
      head.rotation.x = Math.sin(t * 0.45 + 1) * 0.06;

      for (const s of maneStrands) {
        s.pivot.rotation.x = Math.sin(t + s.phase) * (0.08 + gait * 0.4);
      }
      tail.rotation.z = Math.sin(t * 0.8) * (0.08 + gait * 0.22);
      tail.rotation.x = Math.sin(t * 1.1) * gait * 0.2;
    },
  };
}

export function createCharacter(type) {
  return type === 'unicorn' ? buildUnicorn() : buildMermaid();
}
