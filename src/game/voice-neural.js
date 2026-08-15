/**
 * The pretty voice: Kokoro-82M, an 82-million-parameter text-to-speech model,
 * running entirely inside the browser via ONNX Runtime (WebGPU where available,
 * WASM everywhere else). No API key, no server, no per-character bill.
 *
 * The cost is the download: ~90 MB of weights on first use. So this is strictly
 * an opt-in upgrade — the game boots and plays on the built-in speechSynthesis
 * voice, and only swaps engines once the model is actually in hand. After that
 * first fetch, Transformers.js keeps the weights in the Cache API, so the voice
 * works offline like the rest of the PWA.
 *
 * Everything is generated on demand rather than pre-rendered because the mission
 * lines are templated (shop x item x price); the phrase cache below means each
 * distinct sentence is only ever synthesised once per session.
 */

// v1.0 is the current release; the ONNX export is maintained by onnx-community.
const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

// Grade-A voice, and the warmest of the set. `af_nicole` is calmer still but
// breathy enough to disappear under the music; `af_bella` is the same grade but
// far too excitable for a bedtime-adjacent game.
const VOICE = 'af_heart';

/*
 * Kokoro has no pitch control — only `speed`. So the young, light voice is made
 * in two steps: generate deliberately slow, then play the buffer back fast.
 * Resampling raises pitch and tempo together, and the slow generation is what
 * gives the tempo back.
 *
 *   0.84 slow → 1.15 playback  ≈  +2.4 semitones, and 3% under natural pace.
 *
 * Net effect: it sounds like a older child, unhurried. Push PITCH past ~1.25 and
 * it starts to sound like a chipmunk instead.
 */
const SPEED = 0.84;
const PITCH = 1.15;

// Comfortably more than the number of distinct lines the game can produce in a
// sitting, so repeat missions replay instantly instead of re-synthesising.
const CACHE_MAX = 256;

/**
 * WebGPU gets full precision because it has the bandwidth for it; the WASM
 * fallback uses the 8-bit quantisation, which is a quarter of the download and,
 * for a model this small, indistinguishable by ear.
 */
async function pickBackend() {
  try {
    const adapter = await navigator.gpu?.requestAdapter?.();
    if (adapter) return { device: 'webgpu', dtype: 'fp32' };
  } catch {
    /* no WebGPU — fall through */
  }
  return { device: 'wasm', dtype: 'q8' };
}

/** Rough guard: without WebAssembly there is no ONNX runtime at all. */
export function neuralSupported() {
  return typeof WebAssembly === 'object' && typeof caches !== 'undefined';
}

/**
 * Downloads and warms up the model.
 *
 * @param {(fraction: number) => void} onProgress 0..1 across every file
 * @param {(samples: Float32Array, sampleRate: number) => () => void} play
 *        Hands raw audio to the game's already-unlocked AudioContext and returns
 *        a stop function. Going through Web Audio rather than an <audio> element
 *        matters on iOS, where a blob URL played long after the opening tap is
 *        silently refused.
 */
export async function createNeuralVoice({ onProgress, play }) {
  const { KokoroTTS } = await import('kokoro-js');
  const { device, dtype } = await pickBackend();

  // Transformers.js reports per-file byte counts; total download size is only
  // known once every file has announced itself, so the bar is a running sum
  // rather than a true percentage. It is honest enough for a spinner.
  const bytes = new Map();
  const report = () => {
    let loaded = 0;
    let total = 0;
    for (const f of bytes.values()) {
      loaded += f.loaded;
      total += f.total;
    }
    if (total > 0) onProgress?.(Math.min(1, loaded / total));
  };

  const tts = await KokoroTTS.from_pretrained(MODEL_ID, {
    device,
    dtype,
    progress_callback: (p) => {
      if (p.status === 'progress' && p.total) {
        bytes.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
        report();
      } else if (p.status === 'done' && bytes.has(p.file)) {
        const f = bytes.get(p.file);
        f.loaded = f.total;
        report();
      }
    },
  });

  const cache = new Map();
  let queue = Promise.resolve();
  let stopCurrent = null;
  // Bumped by cancel(): anything generated under an older token is discarded
  // instead of talking over whatever replaced it.
  let token = 0;
  // Lines the player is actually waiting to hear, as opposed to speculative
  // preheat work. Keeps the two from competing for the one ONNX session.
  let pending = 0;

  /** Serialised: one ONNX session, and the lines are meant to be sequential. */
  function synth(text) {
    const hit = cache.get(text);
    if (hit) return Promise.resolve(hit);

    const run = queue.then(async () => {
      // A concurrent call may have generated this while we sat in the queue.
      if (cache.has(text)) return cache.get(text);
      const audio = await tts.generate(text, { voice: VOICE, speed: SPEED });
      const clip = { samples: audio.audio, rate: audio.sampling_rate };
      cache.set(text, clip);
      // Plain FIFO eviction; the working set is small enough that cleverness
      // would cost more than it saves.
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      return clip;
    });

    // The tail the *next* call chains onto is a swallowed copy. Chaining onto
    // `run` itself would mean one failed generation rejects every line after
    // it, silencing the voice permanently instead of for one sentence.
    queue = run.catch(() => {});
    return run;
  }

  // One throwaway generation so the first real line doesn't pay for ONNX graph
  // warm-up. Short, because on the WASM backend this is a second or two.
  await synth('Hello!').catch(() => {});

  return {
    device,

    async say(text) {
      const mine = ++token;
      let clip;
      pending++;
      try {
        clip = await synth(text);
      } catch {
        return false; // caller falls back to the system voice
      } finally {
        pending--;
      }
      if (mine !== token) return true; // superseded while we were generating
      stopCurrent?.();
      stopCurrent = play(clip.samples, clip.rate, PITCH);
      return true;
    },

    /**
     * Synthesises lines the game is about to need, so they play the instant they
     * are asked for. Yields to anything the player is actually waiting on — a
     * speculative clip must never make a real one queue behind it.
     */
    async preheat(texts) {
      for (const text of texts) {
        if (!text || cache.has(text)) continue;
        while (pending > 0) await new Promise((r) => setTimeout(r, 120));
        await synth(text).catch(() => {});
      }
    },

    cancel() {
      token++;
      stopCurrent?.();
      stopCurrent = null;
    },
  };
}
