/**
 * Text-to-speech for the missions. A four-year-old can't read the HUD, so every
 * instruction is spoken; the emoji card is the visual reminder.
 *
 * Two engines sit behind one `say()`:
 *
 *  - Kokoro-82M running locally in WebGPU/WASM (see voice-neural.js), which
 *    sounds like a person. This is the default, and it starts downloading as
 *    soon as the page opens.
 *  - the browser's built-in speechSynthesis, which is instant, free and offline
 *    but sounds like a satnav.
 *
 * The system voice is the floor, not the default: it covers the minute or so
 * before the model is ready, devices that can't run it, and outright failure.
 * Nobody ever waits in silence, and nobody has to press anything to get the
 * good voice.
 */
import { LANG } from './i18n.js';
import { neuralSupported, createNeuralVoice } from './voice-neural.js';

const STORE_KEY = 'mermaidmall.voice';
const NEURAL_KEY = 'mermaidmall.voice.neural';

// Unhurried and pitched up into a child's register, to land in roughly the same
// place as the neural voice — see the PITCH note in voice-neural.js.
const RATE = 0.9;
const PITCH = 1.3;

const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback; // private mode
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

export function createSpeech(audio) {
  const synth = window.speechSynthesis;
  let voices = [];
  let enabled = read(STORE_KEY, 'on') !== 'off';
  let primed = false;

  /** off | loading | ready | failed | unsupported */
  let neuralState = neuralSupported() ? 'off' : 'unsupported';
  let neural = null;
  let progress = 0;
  const watchers = new Set();

  function setNeuralState(state) {
    neuralState = state;
    for (const fn of watchers) fn(state, progress);
  }

  /* ------------------------------------------------------- system voice -- */

  function refresh() {
    voices = synth?.getVoices?.() ?? [];
  }
  refresh();
  if (synth && 'onvoiceschanged' in synth) synth.addEventListener('voiceschanged', refresh);

  /**
   * Picks the least robotic English voice on offer.
   *
   * Note the absence of a `localService` bonus: on Chrome and Android the good
   * neural voices are the *network* ones, so preferring local voices actively
   * selects the worst thing installed.
   */
  function pickVoice() {
    if (!voices.length) refresh();
    const matches = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
    if (!matches.length) return null;

    const score = (v) => {
      const name = v.name.toLowerCase();
      let s = 0;
      if (/(natural|neural|premium|enhanced)/.test(name)) s += 6;
      if (/(google|siri)/.test(name)) s += 4;
      if (v.lang.toLowerCase() === LANG.toLowerCase()) s += 2;
      // Softer, friendlier voices where the platform offers a choice.
      if (/(samantha|karen|moira|zira|hazel|nicky|aria|jenny|female)/.test(name)) s += 2;
      if (/(compact|eloquence|novelty|whisper|bells|bad news|good news)/.test(name)) s -= 8;
      return s;
    };
    return matches.sort((a, b) => score(b) - score(a))[0];
  }

  function sysSay(text, { rate, pitch }) {
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = LANG;
      const v = pickVoice();
      if (v) u.voice = v;
      u.rate = rate;
      u.pitch = pitch;
      u.volume = 1;
      // speechSynthesis lives outside the audio graph, so the music has to be
      // pulled down by hand for it the same way the neural path does it.
      u.addEventListener('start', () => audio?.duck(true));
      const undo = () => audio?.duck(false);
      u.addEventListener('end', undo);
      u.addEventListener('error', undo);
      synth.speak(u);
    } catch {
      /* speech is a nice-to-have, never fatal */
    }
  }

  /* ------------------------------------------------------------------ api */

  const api = {
    get enabled() {
      return enabled;
    },

    get neuralState() {
      return neuralState;
    },

    get neuralProgress() {
      return progress;
    },

    /** Fires on every state change; also called immediately with the current one. */
    onNeuralChange(fn) {
      watchers.add(fn);
      fn(neuralState, progress);
      return () => watchers.delete(fn);
    },

    setEnabled(on) {
      enabled = on;
      write(STORE_KEY, on ? 'on' : 'off');
      if (!on) api.cancel();
      return enabled;
    },

    toggle() {
      return api.setEnabled(!enabled);
    },

    /**
     * iOS only allows speech after a real user gesture; call this from the first
     * tap so later mission announcements are not silently dropped.
     */
    prime() {
      if (primed || !synth) return;
      primed = true;
      try {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        synth.speak(u);
      } catch {
        /* ignore */
      }
    },

    /**
     * Downloads the neural model and switches to it. Safe to call twice; resolves
     * once the voice is live (or has given up).
     */
    async enableNeural() {
      if (neuralState === 'loading' || neuralState === 'ready') return;
      if (neuralState === 'unsupported') return;

      // Toggled off and on again: the engine is still in memory, so this is just
      // an unmute — no download, no ONNX re-init.
      if (neural) {
        write(NEURAL_KEY, 'on');
        setNeuralState('ready');
        return;
      }

      progress = 0;
      setNeuralState('loading');
      try {
        neural = await createNeuralVoice({
          onProgress: (p) => {
            progress = p;
            for (const fn of watchers) fn(neuralState, progress);
          },
          play: (samples, rate) => audio.speak(samples, rate),
        });
        write(NEURAL_KEY, 'on');
        setNeuralState('ready');
      } catch (err) {
        neural = null;
        console.warn('neural voice unavailable', err);
        setNeuralState('failed');
      }
    },

    /**
     * Synthesises lines the game is about to need so they play instantly. A
     * no-op on the system voice, which has no generation step to get ahead of.
     */
    preheat(texts) {
      if (neuralState === 'ready') neural?.preheat(texts);
    },

    /** Keeps the downloaded model in memory — this is a mute, not an unload. */
    disableNeural() {
      if (neuralState !== 'ready') return;
      neural?.cancel();
      write(NEURAL_KEY, 'off');
      setNeuralState('off');
    },

    toggleNeural() {
      if (neuralState === 'ready') return api.disableNeural();
      return api.enableNeural();
    },

    /**
     * The neural voice is the default, so this is false only if someone has
     * explicitly switched it off — hence the 'on' fallback rather than 'off'.
     */
    get neuralPreferred() {
      return read(NEURAL_KEY, 'on') === 'on';
    },

    say(text, { rate = RATE, pitch = PITCH } = {}) {
      if (!enabled || !text) return;

      if (neuralState === 'ready' && neural) {
        synth?.cancel?.();
        // Falls back mid-flight if a generation throws — a missed line is worse
        // than a robotic one.
        neural.say(text).then((ok) => {
          if (!ok && enabled) sysSay(text, { rate, pitch });
        });
        return;
      }

      if (synth) sysSay(text, { rate, pitch });
    },

    cancel() {
      synth?.cancel?.();
      neural?.cancel();
    },
  };

  return api;
}
