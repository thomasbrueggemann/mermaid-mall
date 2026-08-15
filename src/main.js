/**
 * Mermaid Mall — an isometric shopping-mall adventure for very small people.
 *
 * Boot flow: pick a character (which also unlocks audio + speech, both of which
 * browsers gate behind a user gesture), build the mall, then run the loop.
 */
import './style.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { CAM_DIR, CAM_HEIGHT, CAM_LERP, CAM_DIST } from './game/config.js';
import { generateMall, worldToTileX, worldToTileZ } from './game/mall.js';
import { findPath, nearestWalkable } from './game/pathfinding.js';
import { buildWorld } from './game/world.js';
import { createPlayer } from './game/player.js';
import { createDiamonds } from './game/diamonds.js';
import { createEffects } from './game/effects.js';
import { createMinimap } from './game/minimap.js';
import { createMissions } from './game/missions.js';
import { createInput } from './game/input.js';
import { createAudio } from './game/audio.js';
import { createSpeech } from './game/speech.js';
import { createUI } from './game/ui.js';
import { i18n } from './game/i18n.js';

const ui = createUI();
const audio = createAudio();
const speech = createSpeech();

let game = null;

/* ------------------------------------------------------------ start screen */

for (const button of document.querySelectorAll('.pick')) {
  button.addEventListener('click', async () => {
    const type = button.dataset.character;
    speech.prime();
    audio.start().then(() => audio.chime());
    ui.hideStart();
    ui.setLoading(true);
    // Let the spinner paint before the (synchronous) world build blocks us.
    await new Promise((r) => setTimeout(r, 60));
    game = await startGame(type);
    ui.setLoading(false);
    ui.showHud();
  });
}

ui.el.btnStartLang.addEventListener('click', () => {
  i18n.toggle();
  ui.syncLanguage();
});

/* ------------------------------------------------------------------- game */

async function startGame(type) {
  const canvas = document.getElementById('scene');

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  // Manual reset so renderer.info totals every composer pass in a frame rather
  // than only the last one.
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);

  const mall = generateMall(Date.now());
  const world = buildWorld(scene, renderer, mall);
  const player = createPlayer(scene, mall, type);
  const diamonds = createDiamonds(scene, mall);
  const effects = createEffects(scene);
  const minimap = createMinimap(ui.el.minimap, mall);
  const missions = createMissions(mall);

  const shopPickables = world.shopGroups.map((s) => s.body);

  /* ------------------------------------------------------------ camera -- */

  const camDir = new THREE.Vector3(...CAM_DIR).normalize();
  const camFocus = new THREE.Vector3(player.position.x, 0, player.position.z);
  let zoom = 1;

  function applyFrustum() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const half = CAM_HEIGHT / 2 / zoom;
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
  }
  applyFrustum();

  /* ------------------------------------------------------ post-processing */

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.34, // strength — enough to make the diamonds and signage glow
    0.6, // radius
    0.95, // threshold: only genuinely bright things bloom, not the marble
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
    applyFrustum();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));

  /* -------------------------------------------------------------- input -- */

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function walkTo(clientX, clientY) {
    ndc.x = (clientX / window.innerWidth) * 2 - 1;
    ndc.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);

    // Tapping a storefront means "take me to its door".
    const shopHit = raycaster.intersectObjects(shopPickables, false)[0];
    let goal;
    if (shopHit) {
      const sg = world.shopGroups.find((s) => s.body === shopHit.object);
      goal = sg ? { ...sg.shop.doorTile } : null;
    } else {
      const hit = raycaster.intersectObject(world.floor, false)[0];
      if (!hit) return;
      goal = nearestWalkable(mall, worldToTileX(hit.point.x), worldToTileZ(hit.point.z));
    }
    if (!goal) return;

    const start = nearestWalkable(mall, player.tile.x, player.tile.z);
    if (!start) return;

    const path = findPath(mall, start, goal);
    if (!path) return;

    player.setPath(path);
    const last = path[path.length - 1];
    if (last) effects.mark(last.x, last.z);
  }

  const input = createInput(canvas, {
    onTap: (x, y) => {
      speech.prime();
      audio.resume();
      walkTo(x, y);
    },
    onZoom: (z) => {
      zoom = z;
      applyFrustum();
    },
  });

  /* ------------------------------------------------------------ gameplay -- */

  let purse = 0;
  let streak = 0;
  let streakTimer = 0;
  let nagCooldown = 0;
  let idleTimer = 0;
  let buying = false;

  function refreshPurse() {
    ui.setPurse(purse, missions.current && purse >= missions.current.cost);
  }

  function speakMission(short = false) {
    const m = missions.current;
    if (!m) return;
    const shopName = i18n.shopName(m.shop);
    speech.say(
      short
        ? i18n.t.missionShort(shopName)
        : i18n.t.mission(shopName, i18n.itemName(m.item), m.cost),
    );
  }

  function nextMission() {
    const m = missions.next();
    world.setTarget(m.shop);
    player.pointAt({ x: m.shop.doorWorld.x, z: m.shop.doorWorld.z });
    ui.setMission(m);
    refreshPurse();
    audio.chime();
    idleTimer = 0;
    setTimeout(() => speakMission(), 420);
  }

  function screenPositionOf(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  function buy() {
    const m = missions.current;
    if (!m || buying) return;
    buying = true;
    purse -= m.cost;
    refreshPurse();
    player.stop();

    const door = m.shop.doorWorld;
    effects.confetti(door.x, 1.5, door.z, 110);
    audio.fanfare();

    const screen = screenPositionOf(door.x, 2.2, door.z);
    ui.flyToSatchel(m.item, screen.x, screen.y);

    const praise = i18n.praise();
    ui.toast(`${praise} ${m.item}`);
    speech.say(i18n.t.bought(i18n.itemName(m.item), praise));

    world.setTarget(null);
    player.pointAt(null);

    // Every fifth purchase gets a bigger party.
    if (missions.completed % 5 === 0) {
      setTimeout(() => effects.confetti(player.position.x, 2, player.position.z, 140), 500);
    }

    setTimeout(() => {
      buying = false;
      nextMission();
    }, 2100);
  }

  function onCollect(point, value) {
    purse += value;
    streak++;
    streakTimer = 2.4;
    refreshPurse();
    idleTimer = 0;
    effects.burst(
      point.x, 1.0, point.z,
      point.kind === 'purple' ? 0xa46bff : 0xff5fc4,
      point.kind === 'purple' ? 26 : 15,
      point.kind === 'purple' ? 4.4 : 3.2,
    );
    audio.coin(streak, point.kind === 'purple');
  }

  /* ---------------------------------------------------------- HUD buttons */

  ui.el.mission.addEventListener('click', () => {
    speech.prime();
    speakMission();
  });

  ui.el.btnSound.addEventListener('click', () => {
    ui.setToggleState(ui.el.btnSound, audio.toggle());
  });

  ui.el.btnVoice.addEventListener('click', () => {
    const on = speech.toggle();
    ui.setToggleState(ui.el.btnVoice, on);
    if (on) speakMission();
  });

  ui.el.btnLang.addEventListener('click', () => {
    i18n.toggle();
    ui.syncLanguage();
    speakMission();
  });

  ui.el.btnFull.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      /* iOS Safari has no fullscreen API outside of standalone mode */
    }
  });

  ui.setToggleState(ui.el.btnVoice, speech.enabled);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      audio.suspend();
      speech.cancel();
    } else {
      audio.resume();
    }
  });

  /* -------------------------------------------------------- adaptive perf */

  let frames = 0;
  let perfClock = 0;
  let perfChecked = false;
  let fps = 0;
  let fpsFrames = 0;
  let fpsClock = 0;

  /* ------------------------------------------------------------ debug hook */

  // Read-only stats plus a couple of shortcuts. Handy for automated testing and
  // for a grown-up who wants to skip ahead; invisible during normal play.
  window.__game = {
    get fps() { return Math.round(fps); },
    get purse() { return purse; },
    get mission() { return missions.current; },
    get playerTile() { return player.tile; },
    get hasPath() { return player.hasPath; },
    get diamondCount() { return diamonds.points.length; },
    get available() { return diamonds.available; },
    get shopCount() { return mall.shops.length; },
    get drawCalls() { return renderer.info.render.calls; },
    get triangles() { return renderer.info.render.triangles; },
    cheat(n = 10) {
      purse += n;
      refreshPurse();
    },
    debugScene() {
      const p = player.position;
      const box = new THREE.Box3().setFromObject(player.character.group);
      return {
        world: p,
        tile: player.tile,
        solidHere: mall.isSolid(player.tile.x, player.tile.z),
        camFocus: { x: camFocus.x, z: camFocus.z },
        screen: screenPositionOf(p.x, 1, p.z),
        bounds: { min: box.min.toArray(), max: box.max.toArray() },
        visible: player.group.visible && player.character.group.visible,
      };
    },
    teleportToTarget() {
      const shop = missions.current?.shop;
      if (!shop) return;
      player.warpTo(shop.doorWorld.x, shop.doorWorld.z);
    },
    /** Routes to the mission shop through the real pathfinder. */
    walkToTarget() {
      const shop = missions.current?.shop;
      if (!shop) return null;
      const start = nearestWalkable(mall, player.tile.x, player.tile.z);
      const path = findPath(mall, start, shop.doorTile);
      player.setPath(path);
      return path && path.length;
    },
    get audioReady() {
      return audio.ready;
    },
    get satchel() {
      return ui.el.satchel.textContent;
    },
  };

  /* ------------------------------------------------------------ the loop */

  const clock = new THREE.Clock();
  let running = true;

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    renderer.info.reset();

    // Camera follow.
    camFocus.lerp(
      new THREE.Vector3(player.position.x, 0, player.position.z),
      1 - Math.exp(-CAM_LERP * dt),
    );
    camera.position.copy(camFocus).addScaledVector(camDir, CAM_DIST);
    camera.lookAt(camFocus);

    player.update(dt, input.vector);
    diamonds.update(dt, player.position, onCollect);
    effects.update(dt);
    world.update(dt, player.position, camera);

    // Are we standing on the mission doormat?
    const m = missions.current;
    if (m && !buying) {
      const d = Math.hypot(
        player.position.x - m.shop.doorWorld.x,
        player.position.z - m.shop.doorWorld.z,
      );
      if (d < 1.8) {
        if (purse >= m.cost) {
          buy();
        } else if (nagCooldown <= 0) {
          nagCooldown = 4.5;
          audio.nope();
          const missing = m.cost - purse;
          ui.toast(`◆ ${missing}`);
          speech.say(i18n.t.needMore(missing));
        }
      }
    }

    if (nagCooldown > 0) nagCooldown -= dt;
    if (streakTimer > 0 && (streakTimer -= dt) <= 0) streak = 0;

    // Gentle reminder if nothing has happened for a while.
    idleTimer += dt;
    if (idleTimer > 26 && !buying) {
      idleTimer = 0;
      speakMission(true);
    }

    minimap.draw(dt, player, diamonds, missions.current?.shop);
    composer.render();

    fpsFrames++;
    fpsClock += dt;
    if (fpsClock >= 0.5) {
      fps = fpsFrames / fpsClock;
      fpsFrames = 0;
      fpsClock = 0;
    }

    // One-shot quality probe: drop bloom on devices that can't keep up.
    if (!perfChecked) {
      frames++;
      perfClock += dt;
      if (perfClock > 2.5) {
        perfChecked = true;
        if (frames / perfClock < 42) {
          bloom.enabled = false;
          renderer.setPixelRatio(1);
          composer.setPixelRatio(1);
          resize();
        }
      }
    }
  }

  nextMission();
  refreshPurse();
  frame();

  setTimeout(() => {
    speech.say(i18n.t.hello(type === 'unicorn' ? i18n.t.unicorn : i18n.t.mermaid));
  }, 200);

  return {
    stop() {
      running = false;
      input.dispose();
      effects.dispose();
      diamonds.dispose();
      world.dispose();
      renderer.dispose();
    },
  };
}

/* ------------------------------------------------------------------- PWA */

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', async () => {
    if (import.meta.env.PROD) {
      // Resolve against the document, not the bundle: on GitHub Pages the script
      // lives in /assets/ but the worker must sit at — and be scoped to — the
      // app root so it can serve the whole PWA offline.
      navigator.serviceWorker.register(new URL('sw.js', document.baseURI).href).catch(() => {});
    } else {
      // A worker left over from a production build would shadow HMR in dev.
      for (const reg of await navigator.serviceWorker.getRegistrations()) reg.unregister();
    }
  });
}

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  ui.showInstall(async () => {
    ui.hideInstall();
    installPrompt?.prompt();
    installPrompt = null;
  });
});
window.addEventListener('appinstalled', () => ui.hideInstall());
