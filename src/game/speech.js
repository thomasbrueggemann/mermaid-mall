/**
 * Text-to-speech for the missions. A four-year-old can't read the HUD, so every
 * instruction is spoken; the emoji card is the visual reminder.
 */
import { i18n } from './i18n.js';

const STORE_KEY = 'mermaidmall.voice';

export function createSpeech() {
  const synth = window.speechSynthesis;
  let voices = [];
  let enabled = true;
  let primed = false;

  try {
    enabled = localStorage.getItem(STORE_KEY) !== 'off';
  } catch {
    /* ignore */
  }

  function refresh() {
    voices = synth?.getVoices?.() ?? [];
  }
  refresh();
  if (synth && 'onvoiceschanged' in synth) synth.addEventListener('voiceschanged', refresh);

  /** Prefers a local, higher-quality voice in the right language. */
  function pickVoice(langCode) {
    if (!voices.length) refresh();
    const prefix = langCode.slice(0, 2).toLowerCase();
    const matches = voices.filter((v) => v.lang?.toLowerCase().startsWith(prefix));
    if (!matches.length) return null;

    const score = (v) => {
      const name = v.name.toLowerCase();
      let s = 0;
      if (v.localService) s += 3;
      if (v.lang.toLowerCase() === langCode.toLowerCase()) s += 2;
      // Softer, friendlier voices where the platform offers a choice.
      if (/(samantha|karen|moira|anna|petra|marlene|google|zira|hazel|nicky|female)/.test(name)) s += 2;
      if (/(compact|eloquence|novelty|whisper|bells|bad news|good news)/.test(name)) s -= 4;
      return s;
    };
    return matches.sort((a, b) => score(b) - score(a))[0];
  }

  return {
    get enabled() {
      return enabled;
    },

    setEnabled(on) {
      enabled = on;
      try {
        localStorage.setItem(STORE_KEY, on ? 'on' : 'off');
      } catch {
        /* ignore */
      }
      if (!on) synth?.cancel?.();
      return enabled;
    },

    toggle() {
      return this.setEnabled(!enabled);
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

    say(text, { rate = 0.94, pitch = 1.2, interrupt = true } = {}) {
      if (!enabled || !synth || !text) return;
      try {
        if (interrupt) synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const langCode = i18n.t.code;
        u.lang = langCode;
        const v = pickVoice(langCode);
        if (v) u.voice = v;
        u.rate = rate;
        u.pitch = pitch;
        u.volume = 1;
        synth.speak(u);
      } catch {
        /* speech is a nice-to-have, never fatal */
      }
    },

    cancel() {
      synth?.cancel?.();
    },
  };
}
