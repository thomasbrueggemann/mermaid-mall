# 🧜‍♀️ Mermaid Mall

An isometric shopping-mall adventure for a four-year-old. Play as a wobbling
mermaid or a trotting unicorn, collect pink and purple diamonds along the
walkways, and spend them on missions in the shops.

**▶ Play: https://thomasbrueggemann.github.io/mermaid-mall/**

Installable PWA, works fully offline, and builds to a single self-contained
HTML file.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/
npm run preview
```

`dist/index.html` is the entire game — all JavaScript and CSS inlined, no
external requests. Download that one file and it plays by double-clicking it,
with no web server involved. The `manifest.webmanifest`, `sw.js` and `icons/`
next to it are only needed for installing it as an app; `voice-*.js` and
`assets/ort-*.wasm` are only fetched if you turn the neural voice on.

## How you play

| | |
|---|---|
| **Tap the floor** | walk there (A* routes around the planters) |
| **Tap a shop** | walk to that shop's door |
| **Drag anywhere** | a thumb-stick appears for direct steering |
| **Pinch** | zoom |
| **WASD / arrows** | steer with a keyboard |
| **Tap the mission card** | hear the mission again |

There is no way to lose. No timer, no enemies, no fail state. Diamonds respawn
every 11 seconds, so a child can never get permanently stuck without enough to
buy the next thing.

## Design notes for a pre-reader

The player can't read, so nothing important is written down:

- **Missions are spoken**, never written. Two engines sit behind one `say()`:
  the browser's built-in `speechSynthesis`, and — behind the ✨ button — a real
  neural voice (see below).
- **The HUD is emoji and numbers only** — shop icon, item icon, price.
- **Every shop wears its emoji on the roof**, because from an isometric camera
  the roof is what you actually see. The wall sign alone is not enough.
- **The target shop pulses** on its rooftop badge, its doormat, a light beacon,
  the minimap, and a gold arrow floating over the character's head. Five
  redundant cues, because one is easy to miss.
- **A soft halo under the character** means a small child can always find
  themselves on screen.
- Storefronts that come between the camera and the character **fade to a
  ghost**, so the player is never hidden.

## The pretty voice

`speechSynthesis` is free and instant, and it sounds like a satnav. So the game
speaks with **Kokoro-82M** instead — an 82-million-parameter text-to-speech
model that runs *inside the browser* on WebGPU, or WASM where WebGPU isn't
available. No API key, no server, no per-character bill.

It is the default and it loads itself: the download starts as the page opens,
and the voice swaps in the moment it's ready. The ✨ button is an opt-*out*, and
it pulses while the model is on its way.

That default costs something, and it is worth being clear about it: **~92 MB of
weights on first run, plus a 21 MB ONNX runtime**, and on a WASM-only device
roughly a minute and a half before the good voice takes over. Nothing is silent
in the meantime — `speechSynthesis` covers the gap, and covers devices that
can't run the model at all.

None of that weight is in `index.html` or the service worker's precache.
`src/game/voice-neural.js` is reached through a dynamic `import()`, so Vite
splits it into its own chunk; it and the ONNX runtime are fetched on first use
and then held by the worker's stale-while-revalidate rule. Precaching them at
install would only move the cost earlier — without the 92 MB of weights, which
live in the Cache API and can't be precached, they buy nothing on their own.

After the first download Transformers.js keeps the weights in the Cache API, so
the neural voice works fully offline — verified by loading it, restarting the
browser, cutting the network, and watching it reach ready and speak with zero
requests.

Lines are generated on demand — the mission text is templated, so pre-rendering
would mean every shop × item × price combination. Instead each distinct sentence
is synthesised once and cached for the session, `preheat()` gets the next
mission started under cover of the chime, and the "you need more diamonds"
replies are warmed up front so the one line that answers an action directly is
never the one that lags.

## How it's built

No art assets, no audio files — everything is generated at runtime, which is
what keeps the base game a single self-contained offline bundle.

- **Textures** (`src/game/textures.js`) are drawn on canvases at boot: marble
  with domain-warped veining plus matching roughness and Sobel-derived normal
  maps, brushed facade panelling, backlit shop signage, and an equirectangular
  "mall interior" that feeds both the sky and — through PMREM — every
  reflection in the scene.
- **Audio** (`src/game/audio.js`) is synthesised with the Web Audio API: a calm
  four-bar chiptune loop (Cmaj7–Am7–Fmaj7–G7 at 92 BPM) with a triangle pad,
  square arpeggio and brushed hi-hat, driven by a lookahead scheduler so it
  stays in time regardless of frame rate. Pickups, fanfares and chimes are
  shaped oscillators.
- **The mall** (`src/game/mall.js`) is a lattice of two-tile walkways between
  shop blocks. Random corridor segments are then plugged with planters and
  fountains to give it a gentle maze feel — each plug is reverted unless a
  flood fill confirms every walkway tile is still reachable, so the mall is
  always fully solvable.
- **Icons** (`scripts/make-icons.mjs`) are rasterised and PNG-encoded in pure
  Node — a supersampled brilliant-cut gem, no image dependencies.

Rendering is three.js with an orthographic camera at a true isometric angle,
ACES tone mapping, a shadow frustum that follows the player, and a light bloom
pass. Scenery props go through `InstancedMesh` batches; the game holds ~300 draw
calls and ~75k triangles. A one-shot performance probe drops bloom and pixel
ratio on devices that can't hold 42fps.

## Deploying

Push to `main` — `.github/workflows/deploy.yml` builds and publishes to Pages
(enable Pages → Source → GitHub Actions once, in repo settings).

Nothing in the build hardcodes a deployment path, which is what makes the
project-subfolder URL work:

- `base: './'` — every reference in the HTML is relative.
- The manifest's `start_url` and `scope` are `.`, resolved against the
  manifest's own URL, so the app scope becomes `/mermaid-mall/` automatically.
- The service worker is registered relative to `document.baseURI` (not to the
  script), so it lands at the app root and takes that as its scope.
- Inside the worker every cache key is resolved against
  `self.registration.scope`.

The same `dist/` therefore runs unchanged from a project subfolder, a user
site, a plain static host, or `file://`.

On an iPad, open the page in Safari and use *Share → Add to Home Screen* to
install it. It then runs fullscreen, offline, with no browser chrome.

## Debug hook

`window.__game` exposes read-only stats (`fps`, `drawCalls`, `purse`,
`mission`, `voice`) plus `cheat(n)`, `walkToTarget()`, `teleportToTarget()` and
`enableNeuralVoice()` — handy for testing, and for a grown-up who wants to skip
ahead.
