/**
 * Builds the mall: marble concourse, storefronts, planted maze islands, lamps
 * and the lighting rig.
 *
 * Storefronts are individual groups (only 20 of them) so each can be highlighted
 * or faded when it stands between the camera and the player. The scenery props
 * are numerous and identical, so those go through InstancedMesh batches.
 */
import * as THREE from 'three';
import { TILE, BLOCK, SHOP_H, WORLD_W, WORLD_H, CAM_DIST } from './config.js';
import { tileToWorldX, tileToWorldZ } from './mall.js';
import {
  marbleFloor, facadePanels, signTexture, roofBadge, environmentEquirect,
  stoneTexture, glowDisc, texture,
} from './textures.js';
import { pick } from './rng.js';

const BW = BLOCK * TILE - 0.5; // storefront footprint

/** Collects transforms for one geometry+material pair, then bakes an InstancedMesh. */
class Batch {
  constructor(geometry, material, { shadow = true, receive = false } = {}) {
    this.geometry = geometry;
    this.material = material;
    this.shadow = shadow;
    this.receive = receive;
    this.matrices = [];
    this.colors = [];
  }
  add(matrix, color) {
    this.matrices.push(matrix.clone());
    this.colors.push(color || null);
  }
  build(parent) {
    if (!this.matrices.length) return null;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, this.matrices.length);
    mesh.castShadow = this.shadow;
    mesh.receiveShadow = this.receive;
    let tinted = false;
    this.matrices.forEach((m, i) => {
      mesh.setMatrixAt(i, m);
      if (this.colors[i]) {
        mesh.setColorAt(i, this.colors[i]);
        tinted = true;
      }
    });
    if (tinted && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    parent.add(mesh);
    return mesh;
  }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Convenience: build a transform matrix from loose parts. */
function trs(x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0) {
  _e.set(rx, ry, 0);
  _q.setFromEuler(_e);
  _v.set(x, y, z);
  _s.set(sx, sy, sz);
  return _m.compose(_v, _q, _s);
}

export function buildWorld(scene, renderer, mall) {
  const root = new THREE.Group();
  scene.add(root);

  /* ------------------------------------------------------- environment -- */

  const envTex = texture(environmentEquirect(), { srgb: true });
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.wrapS = envTex.wrapT = THREE.ClampToEdgeWrapping;
  envTex.repeat.set(1, 1);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromEquirectangular(envTex).texture;
  scene.environment = envMap;
  scene.background = envTex;
  scene.backgroundBlurriness = 0.6;
  scene.backgroundIntensity = 0.55;
  // The ortho camera sits CAM_DIST back, so fog has to start well beyond that
  // or it washes out the entire scene rather than just the far edge.
  scene.fog = new THREE.Fog(0xcdb6ec, CAM_DIST + 18, CAM_DIST + 95);
  pmrem.dispose();

  /* ------------------------------------------------------------ lights -- */

  scene.add(new THREE.HemisphereLight(0xffeaff, 0x5c3f82, 0.5));

  const sun = new THREE.DirectionalLight(0xfff4e6, 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  /* ------------------------------------------------------------- floor -- */

  // Overscan so the player never walks far enough to see the floor end.
  const FLOOR_W = WORLD_W + 26;
  const FLOOR_H = WORLD_H + 26;
  const marble = marbleFloor(1024, 4);
  const floorRepeat = [FLOOR_W / (4 * TILE), FLOOR_H / (4 * TILE)];
  const floorMat = new THREE.MeshStandardMaterial({
    map: texture(marble.map, { repeat: floorRepeat, aniso: 16 }),
    roughnessMap: texture(marble.roughnessMap, { srgb: false, repeat: floorRepeat }),
    normalMap: texture(marble.normalMap, { srgb: false, repeat: floorRepeat }),
    normalScale: new THREE.Vector2(0.5, 0.5),
    metalness: 0.06,
    roughness: 1,
    envMapIntensity: 0.4,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_W, FLOOR_H), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  // Invisible plane used for tap-to-walk raycasts (bigger than the floor so
  // taps just outside the mall still resolve to a point).
  const pickPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W * 3, WORLD_H * 3),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  pickPlane.rotation.x = -Math.PI / 2;
  root.add(pickPlane);

  /* --------------------------------------------------------- materials -- */

  const facadeMap = texture(facadePanels(), { repeat: [3, 1] });
  const stoneMap = texture(stoneTexture(), { repeat: [2, 1] });
  const discMap = texture(glowDisc());

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xbfe4ff,
    metalness: 0.32,
    roughness: 0.06,
    transparent: true,
    opacity: 0.42,
    envMapIntensity: 2.4,
    side: THREE.DoubleSide,
  });

  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xf6f2ff, metalness: 0.85, roughness: 0.24, envMapIntensity: 1.5,
  });

  // Darker than the trim so lamp posts read as posts rather than white slivers.
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x6b5c86, metalness: 0.7, roughness: 0.35, envMapIntensity: 1.2,
  });

  const stoneMat = new THREE.MeshStandardMaterial({
    map: stoneMap, color: 0xece7f5, roughness: 0.75, metalness: 0.02,
  });

  // Perimeter wall — turns the mall from a floating island into an atrium.
  const wallMat = new THREE.MeshStandardMaterial({
    map: facadeMap, color: 0xe6dcf4, roughness: 0.6, metalness: 0.1,
  });
  const WALL_H = 5.5;
  const WALL_T = 3;
  for (const [w, d, x, z] of [
    [WORLD_W + WALL_T * 2, WALL_T, 0, -WORLD_H / 2 - WALL_T / 2],
    [WORLD_W + WALL_T * 2, WALL_T, 0, WORLD_H / 2 + WALL_T / 2],
    [WALL_T, WORLD_H, -WORLD_W / 2 - WALL_T / 2, 0],
    [WALL_T, WORLD_H, WORLD_W / 2 + WALL_T / 2, 0],
  ]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), wallMat);
    wall.position.set(x, WALL_H / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    root.add(wall);
  }

  const soilMat = new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x54b25a, roughness: 0.82, flatShading: true });
  const leafDarkMat = new THREE.MeshStandardMaterial({ color: 0x3d8f4d, roughness: 0.85, flatShading: true });
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x7a5638, roughness: 0.9 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xc08b52, roughness: 0.55 });
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x6fd0ff, metalness: 0.4, roughness: 0.05,
    transparent: true, opacity: 0.72, envMapIntensity: 2.2,
  });
  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xfff0d2, emissive: 0xffdd9a, emissiveIntensity: 0.8, roughness: 0.35,
  });

  /* ---------------------------------------------------------- shops ----- */

  const shopGroups = [];
  const shopMeshes = []; // raycast targets for occlusion fading

  for (const shop of mall.shops) {
    const group = new THREE.Group();
    group.position.set(shop.centerWorld.x, 0, shop.centerWorld.z);
    group.rotation.y = shop.yaw;
    root.add(group);

    const tint = new THREE.Color(shop.color.r, shop.color.g, shop.color.b);

    const bodyMat = new THREE.MeshStandardMaterial({
      map: facadeMap,
      color: tint.clone().lerp(new THREE.Color(1, 1, 1), 0.18),
      roughness: 0.48,
      metalness: 0.18,
      envMapIntensity: 0.7,
      transparent: true, // pre-declared so occlusion fading needs no recompile
      opacity: 1,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(BW, SHOP_H, BW), bodyMat);
    body.position.y = SHOP_H / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    shopMeshes.push(body);

    const corniceMat = new THREE.MeshStandardMaterial({
      color: tint.clone().multiplyScalar(0.85),
      roughness: 0.35, metalness: 0.4, envMapIntensity: 1.3,
      transparent: true, opacity: 1,
    });
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(BW + 0.7, 0.42, BW + 0.7), corniceMat);
    cornice.position.y = SHOP_H + 0.21;
    cornice.castShadow = true;
    group.add(cornice);
    shopMeshes.push(cornice);

    // Shared looks, cloned per shop so the whole storefront can fade as a unit
    // when it stands between the camera and the player.
    const shopGlass = glassMat.clone();
    const shopTrim = trimMat.clone();
    shopTrim.transparent = true;

    // Storefront glass either side of the entrance.
    for (const sx of [-1, 1]) {
      const pane = new THREE.Mesh(new THREE.BoxGeometry(BW * 0.3, 2.05, 0.14), shopGlass);
      pane.position.set(sx * BW * 0.24, 1.15, BW / 2 + 0.07);
      group.add(pane);
    }

    // Entrance frame.
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.3, 0.55), shopTrim);
      post.position.set(sx * 1.5, 1.15, BW / 2 + 0.12);
      post.castShadow = true;
      group.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.32, 0.34, 0.55), shopTrim);
    lintel.position.set(0, 2.47, BW / 2 + 0.12);
    group.add(lintel);

    // A dark recess so the doorway reads as an opening.
    const recessMat = new THREE.MeshStandardMaterial({
      color: 0x2b1740, roughness: 0.9, transparent: true,
    });
    const recess = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.25), recessMat);
    recess.position.set(0, 1.13, BW / 2 + 0.02);
    group.add(recess);

    // Awning above the entrance.
    const awningMat = new THREE.MeshStandardMaterial({
      color: tint, roughness: 0.6, metalness: 0.05,
      side: THREE.DoubleSide, transparent: true,
    });
    const awning = new THREE.Mesh(new THREE.BoxGeometry(BW * 0.66, 0.14, 1.7), awningMat);
    awning.position.set(0, 2.86, BW / 2 + 0.72);
    awning.rotation.x = -0.34;
    awning.castShadow = true;
    group.add(awning);

    // Backlit sign. Same canvas drives colour and emission so it reads as a
    // lightbox, but gently — cranked emissive plus bloom just blows out to white.
    const signCanvas = signTexture(shop.sign, shop.color);
    const signMat = new THREE.MeshStandardMaterial({
      map: texture(signCanvas),
      emissive: 0xffffff,
      emissiveMap: texture(signCanvas),
      emissiveIntensity: 0.4,
      roughness: 0.4,
      transparent: true,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), signMat);
    sign.position.set(0, SHOP_H + 1.0, BW / 2 - 0.4);
    group.add(sign);

    const signBack = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.2, 0.3), shopTrim);
    signBack.position.set(0, SHOP_H + 1.0, BW / 2 - 0.58);
    signBack.castShadow = true;
    group.add(signBack);

    // Rooftop badge. Parented to `root`, not the shop group, and given a fixed
    // world rotation so every badge reads upright from the isometric camera
    // regardless of which way the storefront faces.
    const badgeMat = new THREE.MeshBasicMaterial({
      map: texture(roofBadge(shop.sign, shop.color)),
      transparent: true,
      depthWrite: false,
    });
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), badgeMat);
    badge.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
    badge.position.set(shop.centerWorld.x, SHOP_H + 0.44, shop.centerWorld.z);
    badge.renderOrder = 1;
    root.add(badge);

    // Doormat on the walkway tile in front — also the mission target marker.
    const matMat = new THREE.MeshBasicMaterial({
      map: discMap,
      color: tint,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 1.5, TILE * 1.5), matMat);
    mat.rotation.x = -Math.PI / 2;
    mat.position.set(shop.doorWorld.x, 0.03, shop.doorWorld.z);
    mat.renderOrder = 2;
    root.add(mat);

    // Beacon column, shown only while this shop is the mission target.
    const beaconMat = new THREE.MeshBasicMaterial({
      color: tint.clone().lerp(new THREE.Color(1, 1, 1), 0.4),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.4, 22, 18, 1, true), beaconMat);
    beacon.position.set(shop.doorWorld.x, 11, shop.doorWorld.z);
    beacon.visible = false;
    root.add(beacon);

    shopGroups.push({
      shop, group, body, sign, mat, beacon, badge,
      // Base opacity is remembered so the glass keeps being glass while fading.
      fadeMats: [bodyMat, corniceMat, shopGlass, shopTrim, recessMat, awningMat, signMat]
        .map((m) => ({ m, base: m.opacity })),
      fade: 1,
      targetFade: 1,
    });
    shop.view = shopGroups[shopGroups.length - 1];
  }

  /* ------------------------------------------------------------ props --- */

  const bushGeo = new THREE.IcosahedronGeometry(1, 1);
  const batches = {
    bed: new Batch(new THREE.BoxGeometry(1, 1, 1), stoneMat, { receive: true }),
    soil: new Batch(new THREE.BoxGeometry(1, 1, 1), soilMat, { shadow: false, receive: true }),
    bush: new Batch(bushGeo, leafMat),
    bushDark: new Batch(bushGeo, leafDarkMat),
    trunk: new Batch(new THREE.CylinderGeometry(0.16, 0.22, 1, 8), barkMat),
    crown: new Batch(new THREE.IcosahedronGeometry(1, 1), leafDarkMat),
    pole: new Batch(new THREE.CylinderGeometry(0.09, 0.14, 1, 10), postMat),
    bulb: new Batch(new THREE.SphereGeometry(0.27, 14, 12), bulbMat, { shadow: false }),
    plank: new Batch(new THREE.BoxGeometry(1, 1, 1), woodMat),
    basin: new Batch(new THREE.CylinderGeometry(1, 1, 1, 24), stoneMat, { receive: true }),
    water: new Batch(new THREE.CylinderGeometry(1, 1, 1, 24), waterMat, { shadow: false }),
    flower: new Batch(new THREE.SphereGeometry(0.16, 8, 6), null),
  };
  batches.flower.material = new THREE.MeshStandardMaterial({ roughness: 0.6, vertexColors: false });

  const rng = mall.rng;
  const FLOWER_COLORS = [0xff77c8, 0xffd166, 0xff5f6d, 0xffffff, 0xb08bff];

  /** A planted island filling one plugged corridor segment. */
  function plantSegment(seg) {
    const x0 = tileToWorldX(seg.x) - TILE / 2;
    const z0 = tileToWorldZ(seg.z) - TILE / 2;
    const w = seg.w * TILE - 0.5;
    const d = seg.h * TILE - 0.5;
    const cx = x0 + (seg.w * TILE) / 2;
    const cz = z0 + (seg.h * TILE) / 2;

    batches.bed.add(trs(cx, 0.28, cz, 0, w, 0.56, d));
    batches.soil.add(trs(cx, 0.58, cz, 0, w - 0.5, 0.06, d - 0.5));

    const fountain = rng() < 0.18 && Math.min(w, d) > 4.5;
    if (fountain) {
      batches.basin.add(trs(cx, 0.75, cz, 0, 2.1, 1.5, 2.1));
      batches.water.add(trs(cx, 1.42, cz, 0, 1.85, 0.12, 1.85));
      batches.basin.add(trs(cx, 1.8, cz, 0, 0.5, 1.1, 0.5));
      batches.water.add(trs(cx, 2.4, cz, 0, 0.75, 0.1, 0.75));
      return;
    }

    // Trees and shrubs scattered along the bed.
    const along = Math.max(w, d);
    const horizontal = w > d;
    const count = Math.max(2, Math.round(along / 2.6));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count - 0.5;
      const jitter = (rng() - 0.5) * 0.7;
      const px = cx + (horizontal ? t * (w - 1.4) : jitter);
      const pz = cz + (horizontal ? jitter : t * (d - 1.4));

      if (rng() < 0.34) {
        const th = 1.5 + rng() * 0.7;
        batches.trunk.add(trs(px, 0.56 + th / 2, pz, 0, 1, th, 1));
        const cr = 0.9 + rng() * 0.45;
        batches.crown.add(trs(px, 0.56 + th + cr * 0.5, pz, rng() * 3, cr, cr * 1.1, cr));
      } else {
        const r = 0.5 + rng() * 0.4;
        const b = rng() < 0.5 ? batches.bush : batches.bushDark;
        b.add(trs(px, 0.6 + r * 0.55, pz, rng() * 3, r, r * 0.85, r));
        for (let f = 0; f < 3; f++) {
          const fa = rng() * Math.PI * 2;
          const fr = r * (0.5 + rng() * 0.6);
          batches.flower.add(
            trs(px + Math.cos(fa) * fr, 0.62 + r * 0.9, pz + Math.sin(fa) * fr, 0, 1),
            new THREE.Color(pick(FLOWER_COLORS, rng)),
          );
        }
      }
    }

    // A bench facing the walkway on the long side.
    if (rng() < 0.55) {
      const off = (horizontal ? d : w) / 2 + 0.85;
      const bx = cx + (horizontal ? (rng() - 0.5) * (w - 3) : (rng() < 0.5 ? -off : off));
      const bz = cz + (horizontal ? (rng() < 0.5 ? -off : off) : (rng() - 0.5) * (d - 3));
      const ry = horizontal ? 0 : Math.PI / 2;
      batches.plank.add(trs(bx, 0.52, bz, ry, 2.4, 0.14, 0.72));
      batches.plank.add(trs(bx, 0.86, bz - 0.3 * Math.cos(ry), ry, 2.4, 0.55, 0.12));
      for (const sx of [-0.95, 0.95]) {
        batches.plank.add(
          trs(bx + Math.cos(ry) * sx, 0.24, bz - Math.sin(ry) * sx, ry, 0.16, 0.5, 0.6),
        );
      }
    }
  }

  for (const seg of mall.plugged) plantSegment(seg);

  // Lamp posts on the outer corners of every block, deduplicated.
  const lampSeen = new Set();
  for (const shop of mall.shops) {
    const b = shop.block;
    for (const [ox, oz] of [[-1, -1], [BLOCK, -1], [-1, BLOCK], [BLOCK, BLOCK]]) {
      const tx = b.x + ox;
      const tz = b.z + oz;
      const key = `${tx},${tz}`;
      if (lampSeen.has(key) || mall.isSolid(tx, tz)) continue;
      lampSeen.add(key);
      const x = tileToWorldX(tx);
      const z = tileToWorldZ(tz);
      batches.pole.add(trs(x, 1.7, z, 0, 1, 3.4, 1));
      batches.bulb.add(trs(x, 3.6, z, 0, 1));
      batches.plank.add(trs(x, 0.08, z, 0, 0.9, 0.16, 0.9));
    }
  }

  const propMeshes = Object.values(batches)
    .map((b) => b.build(root))
    .filter(Boolean);

  /* -------------------------------------------------------- occlusion --- */

  const ray = new THREE.Raycaster();
  const camToPlayer = new THREE.Vector3();
  let target = null;
  let clock = 0;

  return {
    root,
    floor: pickPlane,
    sun,
    shopGroups,
    envMap,

    setTarget(shop) {
      target = shop;
      for (const sg of shopGroups) {
        const on = sg.shop === shop;
        sg.beacon.visible = on;
        sg.mat.material.opacity = on ? 0.9 : 0.42;
        if (!on) sg.badge.scale.setScalar(1);
      }
    },

    /** Keeps the shadow frustum tight around the player. */
    update(dt, playerPos, camera) {
      clock += dt;

      sun.position.set(playerPos.x + 26, 46, playerPos.z + 16);
      sun.target.position.set(playerPos.x, 0, playerPos.z);
      sun.target.updateMatrixWorld();

      // Pulse the mission markers.
      if (target?.view) {
        const p = 0.55 + Math.sin(clock * 3.1) * 0.3;
        target.view.beacon.material.opacity = 0.1 + p * 0.13;
        target.view.mat.material.opacity = 0.55 + p * 0.45;
        target.view.mat.scale.setScalar(1 + Math.sin(clock * 3.1) * 0.06);
        target.view.badge.scale.setScalar(1.12 + Math.sin(clock * 3.1) * 0.1);
      }

      // Fade any storefront standing between the camera and the player. Probing
      // both head and feet catches storefronts that hide only half of her.
      const blocking = new Set();
      for (const probeY of [0.4, 2.4]) {
        camToPlayer.set(playerPos.x, probeY, playerPos.z).sub(camera.position);
        const dist = camToPlayer.length();
        ray.set(camera.position, camToPlayer.normalize());
        ray.far = dist;
        for (const hit of ray.intersectObjects(shopMeshes, false)) blocking.add(hit.object);
      }

      for (const sg of shopGroups) {
        sg.targetFade = blocking.has(sg.body) ? 0.22 : 1;
        if (sg.fade !== sg.targetFade) {
          sg.fade += (sg.targetFade - sg.fade) * Math.min(1, dt * 9);
          if (Math.abs(sg.fade - sg.targetFade) < 0.01) sg.fade = sg.targetFade;
          for (const { m, base } of sg.fadeMats) {
            m.opacity = base * sg.fade;
            m.depthWrite = sg.fade > 0.96 && base > 0.96;
          }
          sg.sign.visible = sg.fade > 0.5;
          // The badge stays half-lit: a see-through shop must still be
          // identifiable, since that badge is how a child finds it.
          sg.badge.material.opacity = 0.45 + sg.fade * 0.55;
        }
      }
    },

    dispose() {
      root.traverse((o) => {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) {
          for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) m[k]?.dispose?.();
          m.dispose();
        }
      });
      scene.remove(root);
      envTex.dispose();
      envMap.dispose();
      propMeshes.length = 0;
    },
  };
}
