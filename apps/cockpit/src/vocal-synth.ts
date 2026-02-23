// ─── Cockpit Vocal Synth ─────────────────────────────────────────────────────
//
// Browser-native formant vocal synthesizer — no server dependency.
// Pairs with synth.ts (instruments) to provide the vocal side of the cockpit.
//
// Architecture:
//   Glottal source (sawtooth + noise mix) → 5 parallel BiquadFilter (bandpass)
//   formant filters → mix → vibrato LFO → GainNode envelope → StereoPanner →
//   DynamicsCompressor → master
//
// Features:
//   - 20 voice presets modeled after Kokoro + tract voice characters
//   - 5 vowel shapes (/a/ /e/ /i/ /o/ /u/) with smooth morphing
//   - Per-voice vibrato (rate, depth, onset delay)
//   - Breathiness control (noise ↔ sawtooth blend)
//   - Velocity-sensitive dynamics + brightness
//   - 16-voice polyphony with LRU stealing
//   - Works with existing tuning system (midiToFreq)
// ─────────────────────────────────────────────────────────────────────────────

import { midiToFreq, type TuningSystem, type TuningId, TUNINGS } from "./synth.js";

// ─── Formant Data ───────────────────────────────────────────────────────────
//
// Each vowel defined by 5 formant frequencies (Hz), bandwidths (Hz), and
// relative amplitudes (dB). Based on Peterson & Barney (1952) and Fant (1960)
// acoustic phonetics measurements.

export type VowelId = "a" | "e" | "i" | "o" | "u";

export interface FormantSet {
  /** F1–F5 center frequencies in Hz */
  freq: [number, number, number, number, number];
  /** F1–F5 bandwidths in Hz */
  bw: [number, number, number, number, number];
  /** F1–F5 relative amplitudes (0–1) */
  amp: [number, number, number, number, number];
}

// ── Male formants (baseline) ──
const VOWELS_MALE: Record<VowelId, FormantSet> = {
  a: { freq: [800, 1150, 2800, 3500, 4950], bw: [80, 90, 120, 130, 140], amp: [1.0, 0.50, 0.10, 0.01, 0.001] },
  e: { freq: [400, 1600, 2700, 3300, 4950], bw: [60, 80, 120, 130, 140], amp: [1.0, 0.20, 0.10, 0.02, 0.001] },
  i: { freq: [270, 2300, 3000, 3500, 4950], bw: [60, 90, 100, 120, 140], amp: [1.0, 0.10, 0.05, 0.01, 0.001] },
  o: { freq: [500, 700, 2800, 3500, 4950],  bw: [70, 80, 100, 130, 140], amp: [1.0, 0.30, 0.05, 0.01, 0.001] },
  u: { freq: [300, 870, 2240, 3500, 4950],  bw: [50, 70, 100, 130, 140], amp: [1.0, 0.15, 0.04, 0.01, 0.001] },
};

function scaleFormants(base: Record<VowelId, FormantSet>, factor: number): Record<VowelId, FormantSet> {
  const out: Record<string, FormantSet> = {};
  for (const [v, fs] of Object.entries(base)) {
    out[v] = {
      freq: fs.freq.map(f => Math.round(f * factor)) as FormantSet["freq"],
      bw: fs.bw.map(b => Math.round(b * factor * 0.9)) as FormantSet["bw"],
      amp: [...fs.amp] as FormantSet["amp"],
    };
  }
  return out as Record<VowelId, FormantSet>;
}

// ─── Voice Configuration ────────────────────────────────────────────────────

export interface VocalVoiceConfig {
  id: string;
  name: string;
  description: string;
  category: "soprano" | "alto" | "tenor" | "baritone" | "bass";
  /** Formant scale relative to male baseline (1.0 = male, ~1.20 = female soprano) */
  formantScale: number;
  /** Fundamental frequency range [lo, hi] in MIDI */
  midiRange: [number, number];
  /** Default vowel */
  defaultVowel: VowelId;
  /** Vibrato rate in Hz */
  vibratoRate: number;
  /** Vibrato depth in cents */
  vibratoDepth: number;
  /** Vibrato onset delay in seconds */
  vibratoOnset: number;
  /** Breathiness 0–1 (0 = pure saw, 1 = pure noise) */
  breathiness: number;
  /** Glottal pulse shape: "sawtooth" | "triangle" */
  glottalShape: OscillatorType;
  /** Tenseness 0–1 (spectral tilt — 0 = relaxed/breathy, 1 = pressed/bright) */
  tenseness: number;
  /** Master gain multiplier */
  gain: number;
  /** Stereo width (0 = mono, 1 = full spread) */
  stereoWidth: number;
  /** Attack time in seconds */
  attack: number;
  /** Release time in seconds */
  release: number;
}

export const VOCAL_VOICE_IDS = [
  // ── Kokoro-mapped voices ──
  "kokoro-af-aoede", "kokoro-af-heart", "kokoro-af-jessica", "kokoro-af-sky",
  "kokoro-am-eric", "kokoro-am-fenrir", "kokoro-am-liam", "kokoro-am-onyx",
  "kokoro-bf-alice", "kokoro-bf-emma", "kokoro-bf-isabella",
  "kokoro-bm-george", "kokoro-bm-lewis",
  // ── Tract-mapped voices ──
  "tract-soprano", "tract-alto", "tract-tenor", "tract-bass",
  // ── Extended ──
  "choir-soprano", "choir-tenor", "synth-vox",
] as const;

export type VocalVoiceId = (typeof VOCAL_VOICE_IDS)[number];

// ── Helper for preset building ──
function v(
  id: string, name: string, desc: string,
  cat: VocalVoiceConfig["category"], scale: number, range: [number, number],
  opts: Partial<VocalVoiceConfig> = {},
): VocalVoiceConfig {
  return {
    id, name, description: desc, category: cat,
    formantScale: scale, midiRange: range, defaultVowel: "a",
    vibratoRate: 5.5, vibratoDepth: 25, vibratoOnset: 0.3,
    breathiness: 0.15, glottalShape: "sawtooth", tenseness: 0.6,
    gain: 0.25, stereoWidth: 0.6, attack: 0.02, release: 0.15,
    ...opts,
  };
}

export const VOCAL_VOICES: Record<VocalVoiceId, VocalVoiceConfig> = {
  // ── American Female ──
  "kokoro-af-aoede": v("kokoro-af-aoede", "Aoede", "Bright American soprano. Airy, clear projection.", "soprano", 1.22, [60, 84],
    { breathiness: 0.20, tenseness: 0.75, vibratoRate: 5.8, vibratoDepth: 30 }),
  "kokoro-af-heart": v("kokoro-af-heart", "Heart", "Warm American mezzo. Full, round tone.", "alto", 1.15, [55, 79],
    { breathiness: 0.12, tenseness: 0.55, vibratoRate: 5.2, defaultVowel: "o" }),
  "kokoro-af-jessica": v("kokoro-af-jessica", "Jessica", "Smooth American alto. Jazz/R&B character.", "alto", 1.12, [53, 77],
    { breathiness: 0.18, tenseness: 0.50, vibratoRate: 5.0, vibratoDepth: 20 }),
  "kokoro-af-sky": v("kokoro-af-sky", "Sky", "Light American soprano. Ethereal, breathy.", "soprano", 1.25, [62, 86],
    { breathiness: 0.35, tenseness: 0.45, vibratoRate: 6.0, vibratoDepth: 35, glottalShape: "triangle" }),

  // ── American Male ──
  "kokoro-am-eric": v("kokoro-am-eric", "Eric", "Clear American tenor. Musical theater projection.", "tenor", 1.02, [48, 72],
    { breathiness: 0.10, tenseness: 0.70, vibratoRate: 5.5, vibratoDepth: 25 }),
  "kokoro-am-fenrir": v("kokoro-am-fenrir", "Fenrir", "Deep American baritone. Dark, powerful.", "baritone", 0.95, [43, 67],
    { breathiness: 0.08, tenseness: 0.80, vibratoRate: 4.8, vibratoDepth: 20, gain: 0.28 }),
  "kokoro-am-liam": v("kokoro-am-liam", "Liam", "Warm American tenor. Pop/folk warmth.", "tenor", 1.0, [48, 72],
    { breathiness: 0.15, tenseness: 0.55, vibratoRate: 5.0, vibratoDepth: 22 }),
  "kokoro-am-onyx": v("kokoro-am-onyx", "Onyx", "Rich American bass. Resonant, authoritative.", "bass", 0.88, [36, 60],
    { breathiness: 0.05, tenseness: 0.65, vibratoRate: 4.5, vibratoDepth: 15, gain: 0.30 }),

  // ── British Female ──
  "kokoro-bf-alice": v("kokoro-bf-alice", "Alice", "Precise British soprano. Classical diction.", "soprano", 1.20, [60, 84],
    { breathiness: 0.10, tenseness: 0.70, vibratoRate: 5.5, vibratoDepth: 28 }),
  "kokoro-bf-emma": v("kokoro-bf-emma", "Emma", "Sultry British alto. Warm, intimate.", "alto", 1.10, [53, 77],
    { breathiness: 0.22, tenseness: 0.48, vibratoRate: 5.0, vibratoDepth: 18 }),
  "kokoro-bf-isabella": v("kokoro-bf-isabella", "Isabella", "Rich British mezzo. West End power.", "alto", 1.14, [55, 79],
    { breathiness: 0.12, tenseness: 0.65, vibratoRate: 5.3, vibratoDepth: 25 }),

  // ── British Male ──
  "kokoro-bm-george": v("kokoro-bm-george", "George", "Resonant British baritone. Shakespeare stage.", "baritone", 0.96, [43, 67],
    { breathiness: 0.08, tenseness: 0.72, vibratoRate: 4.8, vibratoDepth: 20, gain: 0.28 }),
  "kokoro-bm-lewis": v("kokoro-bm-lewis", "Lewis", "Bright British tenor. Clear, lyrical.", "tenor", 1.04, [48, 72],
    { breathiness: 0.12, tenseness: 0.62, vibratoRate: 5.5, vibratoDepth: 24 }),

  // ── Tract-style physical model voices ──
  "tract-soprano": v("tract-soprano", "Tract Soprano", "Physical model soprano. Bright, precise formants.", "soprano", 1.25, [60, 84],
    { breathiness: 0.08, tenseness: 0.78, vibratoRate: 5.8, vibratoDepth: 30, attack: 0.03 }),
  "tract-alto": v("tract-alto", "Tract Alto", "Physical model alto. Warm, rounded.", "alto", 1.12, [53, 77],
    { breathiness: 0.12, tenseness: 0.55, vibratoRate: 5.5, vibratoDepth: 22, attack: 0.03 }),
  "tract-tenor": v("tract-tenor", "Tract Tenor", "Physical model tenor. Clear, projecting.", "tenor", 1.0, [48, 72],
    { breathiness: 0.10, tenseness: 0.60, vibratoRate: 5.0, vibratoDepth: 20, attack: 0.04 }),
  "tract-bass": v("tract-bass", "Tract Bass", "Physical model bass. Deep, resonant.", "bass", 0.85, [36, 60],
    { breathiness: 0.05, tenseness: 0.60, vibratoRate: 4.5, vibratoDepth: 15, attack: 0.05, gain: 0.32 }),

  // ── Extended presets ──
  "choir-soprano": v("choir-soprano", "Choir Soprano", "Section soprano. Wide detuning, ensemble shimmer.", "soprano", 1.22, [60, 84],
    { breathiness: 0.18, tenseness: 0.55, vibratoRate: 5.5, vibratoDepth: 40, stereoWidth: 1.0, gain: 0.20 }),
  "choir-tenor": v("choir-tenor", "Choir Tenor", "Section tenor. Warm, blended ensemble.", "tenor", 1.0, [48, 72],
    { breathiness: 0.15, tenseness: 0.50, vibratoRate: 5.0, vibratoDepth: 35, stereoWidth: 1.0, gain: 0.20 }),
  "synth-vox": v("synth-vox", "Synth Vox", "Electronic vocal pad. Slow attack, heavy vibrato.", "alto", 1.10, [48, 84],
    { breathiness: 0.30, tenseness: 0.40, vibratoRate: 4.0, vibratoDepth: 50, vibratoOnset: 0.8,
      attack: 0.25, release: 1.2, stereoWidth: 1.0, gain: 0.18, glottalShape: "triangle" }),
};

// ─── Active Voice ───────────────────────────────────────────────────────────

interface ActiveVocalVoice {
  note: number;
  source: OscillatorNode;
  noiseSource: AudioBufferSourceNode;
  noiseMix: GainNode;
  sourceMix: GainNode;
  formantFilters: BiquadFilterNode[];
  formantGains: GainNode[];
  mixBus: GainNode;
  master: GainNode;
  panner: StereoPannerNode;
  vibratoLfo: OscillatorNode;
  vibratoGain: GainNode;
  released: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

// ─── Public Interface ───────────────────────────────────────────────────────

export interface VocalSynth {
  connect(): Promise<void>;
  disconnect(): void;
  noteOn(note: number, velocity: number, time?: number): void;
  noteOff(note: number, time?: number): void;
  allNotesOff(): void;
  setVoice(id: VocalVoiceId): void;
  setVowel(id: VowelId): void;
  setBreathiness(val: number): void;
  setVibratoDepth(cents: number): void;
  setVibratoRate(hz: number): void;
  setMasterVolume(vol01: number): void;
  getVoice(): VocalVoiceConfig;
  getVowel(): VowelId;
  getActiveCount(): number;
  getContext(): AudioContext | null;
  // Tuning integration
  setTuning(id: TuningId): void;
  setRefPitch(hz: number): void;
  getTuning(): TuningSystem;
  getRefPitch(): number;
}

const MAX_VOCAL_POLYPHONY = 16;
const VOWEL_IDS: VowelId[] = ["a", "e", "i", "o", "u"];
export { VOWEL_IDS };

export function createVocalSynth(options?: {
  voice?: VocalVoiceId;
  vowel?: VowelId;
  tuning?: TuningId;
  refPitch?: number;
}): VocalSynth {
  let voice = VOCAL_VOICES[options?.voice ?? "kokoro-af-heart"];
  let vowel: VowelId = options?.vowel ?? voice.defaultVowel;
  let breathiness = voice.breathiness;
  let vibratoDepthCents = voice.vibratoDepth;
  let vibratoRateHz = voice.vibratoRate;
  let tuning = TUNINGS[options?.tuning ?? "equal"];
  let refPitch = options?.refPitch ?? 440;

  let ctx: AudioContext | null = null;
  let compressor: DynamicsCompressorNode | null = null;
  let master: GainNode | null = null;
  let noiseBuf: AudioBuffer | null = null;

  const activeVoices = new Map<number, ActiveVocalVoice>();
  const voiceOrder: number[] = [];

  function ensureCtx() {
    if (!ctx) throw new Error("VocalSynth not connected");
    return ctx;
  }

  function buildNoise() {
    if (!ctx) return;
    const len = ctx.sampleRate * 2; // 2 seconds of noise
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  function getFormants(): Record<VowelId, FormantSet> {
    return scaleFormants(VOWELS_MALE, voice.formantScale);
  }

  function killVoice(v: ActiveVocalVoice) {
    if (v.timer) { clearTimeout(v.timer); v.timer = null; }
    try { v.source.stop(); v.source.disconnect(); } catch {}
    try { v.noiseSource.stop(); v.noiseSource.disconnect(); } catch {}
    try { v.vibratoLfo.stop(); v.vibratoLfo.disconnect(); } catch {}
    for (const f of v.formantFilters) try { f.disconnect(); } catch {}
    for (const g of v.formantGains) try { g.disconnect(); } catch {}
    try { v.noiseMix.disconnect(); } catch {}
    try { v.sourceMix.disconnect(); } catch {}
    try { v.mixBus.disconnect(); } catch {}
    try { v.master.disconnect(); } catch {}
    try { v.panner.disconnect(); } catch {}
  }

  function releaseVoice(v: ActiveVocalVoice, time?: number) {
    if (v.released) return;
    v.released = true;
    const c = ensureCtx();
    const now = time ?? c.currentTime;
    const rel = voice.release;
    v.master.gain.cancelScheduledValues(now);
    v.master.gain.setValueAtTime(v.master.gain.value, now);
    v.master.gain.linearRampToValueAtTime(0, now + rel);
    v.timer = setTimeout(() => killVoice(v), (rel + 0.05) * 1000);
  }

  function stealOldest() {
    if (voiceOrder.length === 0) return;
    const oldest = voiceOrder.shift()!;
    const av = activeVoices.get(oldest);
    if (av) { killVoice(av); activeVoices.delete(oldest); }
  }

  function removeOrder(note: number) {
    const i = voiceOrder.indexOf(note);
    if (i >= 0) voiceOrder.splice(i, 1);
  }

  function noteToPan(note: number): number {
    const raw = ((note - 36) / 60) * 1.0 - 0.5;
    return Math.max(-0.7, Math.min(0.7, raw * voice.stereoWidth));
  }

  const synth: VocalSynth = {
    async connect() {
      ctx = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -12;
      compressor.knee.value = 10;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.15;
      master = ctx.createGain();
      master.gain.value = 0.8;
      compressor.connect(master);
      master.connect(ctx.destination);
      buildNoise();
    },

    disconnect() {
      synth.allNotesOff();
      if (ctx) { ctx.close(); ctx = null; compressor = null; master = null; noiseBuf = null; }
    },

    noteOn(note: number, velocity: number, time?: number) {
      const c = ensureCtx();
      const vv = voice;
      const vel01 = Math.max(0.01, Math.min(1, velocity / 127));
      const freq = midiToFreq(note, tuning, refPitch);
      const now = time ?? c.currentTime;
      const formants = getFormants();
      const fs = formants[vowel];

      // Kill existing same-note
      const existing = activeVoices.get(note);
      if (existing) { killVoice(existing); activeVoices.delete(note); removeOrder(note); }
      while (activeVoices.size >= MAX_VOCAL_POLYPHONY) stealOldest();

      // ── Glottal source ──
      const source = c.createOscillator();
      source.type = vv.glottalShape;
      source.frequency.value = freq;

      // ── Noise source (breathiness) ──
      const noiseSource = c.createBufferSource();
      noiseSource.buffer = noiseBuf;
      noiseSource.loop = true;

      // ── Source/noise mix bus ──
      const sourceMix = c.createGain();
      sourceMix.gain.value = 1 - breathiness;
      const noiseMix = c.createGain();
      noiseMix.gain.value = breathiness * 0.5;
      source.connect(sourceMix);
      noiseSource.connect(noiseMix);

      // ── Formant filter bank (5 parallel bandpass filters) ──
      const mixBus = c.createGain();
      mixBus.gain.value = 1;

      const formantFilters: BiquadFilterNode[] = [];
      const formantGains: GainNode[] = [];

      for (let i = 0; i < 5; i++) {
        const bp = c.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = fs.freq[i];
        bp.Q.value = fs.freq[i] / fs.bw[i]; // Q = f/bw

        const fg = c.createGain();
        // Brightness depends on tenseness and velocity
        const brightMul = i <= 1 ? 1.0 : (vv.tenseness * 0.6 + vel01 * 0.4);
        fg.gain.value = fs.amp[i] * brightMul;

        // Both source and noise feed each filter
        sourceMix.connect(bp);
        noiseMix.connect(bp);
        bp.connect(fg);
        fg.connect(mixBus);
        formantFilters.push(bp);
        formantGains.push(fg);
      }

      // ── Vibrato LFO ──
      const vibratoLfo = c.createOscillator();
      vibratoLfo.type = "sine";
      vibratoLfo.frequency.value = vibratoRateHz;
      const vibratoGain = c.createGain();
      // Depth in cents → frequency deviation: freq * (2^(cents/1200) - 1)
      const vibratoFreqDev = freq * (Math.pow(2, vibratoDepthCents / 1200) - 1);
      vibratoGain.gain.setValueAtTime(0, now);
      // Onset delay for vibrato
      vibratoGain.gain.linearRampToValueAtTime(0, now + vv.vibratoOnset);
      vibratoGain.gain.linearRampToValueAtTime(vibratoFreqDev, now + vv.vibratoOnset + 0.15);
      vibratoLfo.connect(vibratoGain);
      vibratoGain.connect(source.frequency);

      // ── Voice master + envelope ──
      const voiceMaster = c.createGain();
      voiceMaster.gain.setValueAtTime(0, now);
      voiceMaster.gain.linearRampToValueAtTime(vel01 * vv.gain, now + vv.attack);

      // ── Stereo pan ──
      const panner = c.createStereoPanner();
      panner.pan.value = noteToPan(note);

      mixBus.connect(voiceMaster);
      voiceMaster.connect(panner);
      panner.connect(compressor!);

      source.start(now);
      noiseSource.start(now);
      vibratoLfo.start(now);

      const av: ActiveVocalVoice = {
        note, source, noiseSource, noiseMix, sourceMix,
        formantFilters, formantGains, mixBus,
        master: voiceMaster, panner, vibratoLfo, vibratoGain,
        released: false, timer: null,
      };
      activeVoices.set(note, av);
      voiceOrder.push(note);
    },

    noteOff(note: number, time?: number) {
      const av = activeVoices.get(note);
      if (av) { releaseVoice(av, time); activeVoices.delete(note); removeOrder(note); }
    },

    allNotesOff() {
      for (const [, av] of activeVoices) killVoice(av);
      activeVoices.clear();
      voiceOrder.length = 0;
    },

    setVoice(id: VocalVoiceId) {
      voice = VOCAL_VOICES[id] ?? VOCAL_VOICES["kokoro-af-heart"];
      breathiness = voice.breathiness;
      vibratoDepthCents = voice.vibratoDepth;
      vibratoRateHz = voice.vibratoRate;
    },

    setVowel(id: VowelId) { vowel = id; },
    setBreathiness(val: number) { breathiness = Math.max(0, Math.min(1, val)); },
    setVibratoDepth(cents: number) { vibratoDepthCents = Math.max(0, Math.min(100, cents)); },
    setVibratoRate(hz: number) { vibratoRateHz = Math.max(1, Math.min(12, hz)); },
    setMasterVolume(vol01: number) { if (master) master.gain.value = Math.max(0, Math.min(1, vol01)); },
    getVoice() { return voice; },
    getVowel() { return vowel; },
    getActiveCount() { return activeVoices.size; },
    getContext() { return ctx; },
    setTuning(id: TuningId) { tuning = TUNINGS[id] ?? TUNINGS.equal; },
    setRefPitch(hz: number) { refPitch = Math.max(392, Math.min(494, hz)); },
    getTuning() { return tuning; },
    getRefPitch() { return refPitch; },
  };

  return synth;
}
