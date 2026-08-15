/**
 * All sound is synthesised with the Web Audio API — no audio files to download,
 * so the PWA stays offline-complete and tiny.
 *
 * The music is a calm four-bar chiptune loop (Cmaj7 - Am7 - Fmaj7 - G7) with a
 * triangle pad, square arpeggio, soft bass and a whisper of hi-hat: mall muzak
 * for eight-bit shoppers. A lookahead scheduler keeps it in time regardless of
 * frame rate.
 */

const BPM = 92;
const STEP = 60 / BPM / 4; // sixteenth note
const BARS = 4;
const STEPS = BARS * 16;

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// Cmaj7, Am7, Fmaj7, G7 — one per bar.
const CHORDS = [
  { root: 48, tones: [60, 64, 67, 71] },
  { root: 45, tones: [57, 60, 64, 67] },
  { root: 41, tones: [53, 57, 60, 64] },
  { root: 43, tones: [55, 59, 62, 65] },
];

const MUSIC_GAIN = 0.55;
const MUSIC_DUCKED = 0.16;

export function createAudio() {
  let ctx = null;
  let master;
  let musicBus;
  let sfxBus;
  let voiceBus;
  let noiseBuffer;
  let ducked = 0;
  let clipsPlayed = 0;
  let timer = null;
  let nextTime = 0;
  let step = 0;
  let enabled = true;
  let started = false;

  function buildGraph() {
    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);

    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_GAIN;

    // Gentle low-pass keeps the square waves from getting shrill for little ears.
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    tone.Q.value = 0.4;
    musicBus.connect(tone);
    tone.connect(master);

    // Quarter-note echo for a bit of atrium reverb.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.28;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    tone.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(master);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);

    // Deliberately hung off the destination rather than the master gain: the 🔔
    // button silences the music and effects, not the spoken instructions, which
    // have their own toggle.
    voiceBus = ctx.createGain();
    voiceBus.gain.value = 1;
    voiceBus.connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 0.4);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  /** One shaped oscillator note. */
  function blip(bus, freq, time, dur, {
    type = 'square', gain = 0.08, attack = 0.006, detune = 0, sweep = 0,
  } = {}) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * sweep), time + dur);
    osc.detune.value = detune;

    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(gain, time + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);

    osc.connect(env);
    env.connect(bus);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  function hat(time, gain = 0.03) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    src.connect(hp);
    hp.connect(env);
    env.connect(musicBus);
    src.start(time);
    src.stop(time + 0.08);
  }

  function scheduleStep(s, time) {
    const bar = Math.floor(s / 16) % BARS;
    const beat = s % 16;
    const chord = CHORDS[bar];

    // Pad: soft sustained chord at the top of each half-bar.
    if (beat === 0 || beat === 8) {
      chord.tones.forEach((n, i) => {
        blip(musicBus, midi(n), time, beat === 0 ? STEP * 7.4 : STEP * 7.4, {
          type: 'triangle',
          gain: 0.052 - i * 0.006,
          attack: 0.09,
          detune: (i - 1.5) * 4,
        });
      });
    }

    // Bass.
    if (beat === 0 || beat === 6 || beat === 10) {
      blip(musicBus, midi(chord.root), time, STEP * 2.6, {
        type: 'triangle', gain: 0.13, attack: 0.012,
      });
    }

    // Arpeggio: up-and-down through the chord, one note every eighth.
    if (beat % 2 === 0) {
      const seq = [0, 1, 2, 3, 2, 1, 3, 2];
      const n = chord.tones[seq[(beat / 2) % seq.length]] + (beat >= 8 ? 12 : 0);
      blip(musicBus, midi(n), time, STEP * 1.5, {
        type: 'square', gain: 0.036, attack: 0.004,
      });
    }

    // Sparkle counter-melody every other bar.
    if (bar % 2 === 1 && (beat === 4 || beat === 12)) {
      blip(musicBus, midi(chord.tones[3] + 12), time, STEP * 2, {
        type: 'triangle', gain: 0.03, attack: 0.02,
      });
    }

    if (beat % 4 === 2) hat(time, beat === 6 ? 0.026 : 0.018);
  }

  function tick() {
    if (!ctx) return;
    while (nextTime < ctx.currentTime + 0.15) {
      scheduleStep(step, nextTime);
      nextTime += STEP;
      step = (step + 1) % STEPS;
    }
  }

  const api = {
    get ready() {
      return started;
    },
    /** Neural clips handed to the graph so far — read by the test hook. */
    get clipsPlayed() {
      return clipsPlayed;
    },
    get enabled() {
      return enabled;
    },

    /** Must be called from a user gesture (autoplay policy). */
    async start() {
      if (started) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      buildGraph();
      await ctx.resume().catch(() => {});
      started = true;
      nextTime = ctx.currentTime + 0.08;
      step = 0;
      timer = setInterval(tick, 25);
      tick();
      api.setEnabled(enabled);
    },

    setEnabled(on) {
      enabled = on;
      if (master) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(on ? 0.85 : 0, ctx.currentTime, 0.08);
      }
      return enabled;
    },

    toggle() {
      return api.setEnabled(!enabled);
    },

    suspend() {
      ctx?.suspend?.().catch(() => {});
    },
    resume() {
      if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
    },

    /* ----------------------------------------------------------- voice */

    /**
     * Pulls the muzak down while someone is talking. Counted rather than
     * boolean, so overlapping lines can't leave the music stuck quiet.
     */
    duck(on) {
      ducked = Math.max(0, ducked + (on ? 1 : -1));
      if (!ctx || !musicBus) return;
      musicBus.gain.cancelScheduledValues(ctx.currentTime);
      musicBus.gain.setTargetAtTime(
        ducked > 0 ? MUSIC_DUCKED : MUSIC_GAIN,
        ctx.currentTime,
        0.12,
      );
    },

    /**
     * Plays a raw mono clip from the neural voice at `playbackRate`. Returns a
     * stop function.
     * Web Audio rather than an <audio> element on purpose: iOS refuses blob
     * playback that isn't tied to a gesture, but this context was unlocked back
     * on the character picker.
     */
    speak(samples, sampleRate, playbackRate = 1) {
      if (!ctx) return () => {};
      clipsPlayed++;
      const buffer = ctx.createBuffer(1, samples.length, sampleRate);
      buffer.copyToChannel(samples, 0);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      // Resampling: the caller uses this to lift the voice into a child's
      // register, so it is pitch as much as tempo.
      src.playbackRate.value = playbackRate;
      src.connect(voiceBus);

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        api.duck(false);
      };
      src.addEventListener('ended', finish);

      api.duck(true);
      src.start();

      return () => {
        finish();
        try {
          src.stop();
        } catch {
          /* already ended */
        }
      };
    },

    /* ------------------------------------------------------------- sfx */

    /** Diamond pickup; `streak` raises the pitch so runs feel rewarding. */
    coin(streak = 0, big = false) {
      if (!ctx || !enabled) return;
      const t = ctx.currentTime;
      const base = (big ? 784 : 659) * 2 ** (Math.min(streak, 8) / 12);
      blip(sfxBus, base, t, 0.07, { type: 'square', gain: 0.11 });
      blip(sfxBus, base * 1.5, t + 0.055, 0.11, { type: 'square', gain: 0.1 });
      if (big) blip(sfxBus, base * 2, t + 0.11, 0.14, { type: 'triangle', gain: 0.09 });
    },

    /** Mission complete fanfare. */
    fanfare() {
      if (!ctx || !enabled) return;
      const t = ctx.currentTime;
      [0, 4, 7, 12, 16, 19].forEach((semi, i) => {
        const f = midi(72 + semi);
        blip(sfxBus, f, t + i * 0.075, 0.24, { type: 'square', gain: 0.085 });
        blip(sfxBus, f * 0.5, t + i * 0.075, 0.28, { type: 'triangle', gain: 0.07 });
      });
      const shimmer = ctx.createBufferSource();
      shimmer.buffer = noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1800, t + 0.3);
      bp.frequency.exponentialRampToValueAtTime(9000, t + 0.85);
      bp.Q.value = 3;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.001, t + 0.3);
      env.gain.exponentialRampToValueAtTime(0.09, t + 0.42);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      shimmer.connect(bp);
      bp.connect(env);
      env.connect(sfxBus);
      shimmer.start(t + 0.3);
      shimmer.stop(t + 1);
    },

    /** Not enough diamonds yet — friendly, never harsh. */
    nope() {
      if (!ctx || !enabled) return;
      const t = ctx.currentTime;
      blip(sfxBus, 440, t, 0.12, { type: 'triangle', gain: 0.09 });
      blip(sfxBus, 330, t + 0.1, 0.18, { type: 'triangle', gain: 0.09 });
    },

    /** Little rising flourish when the game starts or a new mission arrives. */
    chime() {
      if (!ctx || !enabled) return;
      const t = ctx.currentTime;
      [0, 5, 9].forEach((semi, i) =>
        blip(sfxBus, midi(69 + semi), t + i * 0.09, 0.22, {
          type: 'triangle', gain: 0.08, attack: 0.01,
        }),
      );
    },

    dispose() {
      if (timer) clearInterval(timer);
      ctx?.close?.();
      ctx = null;
      started = false;
    },
  };

  return api;
}
