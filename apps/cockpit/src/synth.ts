// ─── Cockpit Synth Engine ────────────────────────────────────────────────────
//
// Browser-native additive synthesis engine with scientific tuning.
// No server dependency — runs entirely in Web Audio API.
//
// Features:
//   - 10 voice presets (6 piano + 4 synth/keys)
//   - 6 tuning systems (equal, just, Pythagorean, meantone, Werckmeister)
//   - Adjustable reference pitch (A4 = 415–466 Hz)
//   - Per-partial envelopes, inharmonicity stretching, hammer noise
//   - Velocity-sensitive brightness, stereo imaging, voice stealing
//   - Sustain levels (piano decay → organ sustain continuum)
// ─────────────────────────────────────────────────────────────────────────────

// ─── Tuning Systems ─────────────────────────────────────────────────────────

export type TuningId = "equal" | "just-major" | "just-minor" | "pythagorean" | "meantone" | "werckmeister";

export interface TuningSystem {
  id: TuningId;
  name: string;
  description: string;
  /** Cents offset for each pitch class (C=0 through B=11) relative to C. */
  cents: number[];
}

export const TUNINGS: Record<TuningId, TuningSystem> = {
  equal: {
    id: "equal", name: "Equal Temperament (12-TET)",
    description: "Modern standard. All semitones equal (100¢). Maximally versatile, slightly impure intervals.",
    cents: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100],
  },
  "just-major": {
    id: "just-major", name: "Just Intonation (Major)",
    description: "Pure major thirds (386¢) and fifths (702¢). Beautiful in one key, wolf intervals in distant keys.",
    cents: [0, 111.73, 203.91, 315.64, 386.31, 498.04, 590.22, 701.96, 813.69, 884.36, 1017.60, 1088.27],
  },
  "just-minor": {
    id: "just-minor", name: "Just Intonation (Minor)",
    description: "Pure minor thirds (316¢) and fifths. Optimized for minor keys.",
    cents: [0, 111.73, 203.91, 315.64, 386.31, 498.04, 590.22, 701.96, 813.69, 884.36, 996.09, 1088.27],
  },
  pythagorean: {
    id: "pythagorean", name: "Pythagorean",
    description: "Pure fifths (702¢) stacked. Sharp major thirds (408¢). Medieval character, strong melodic purity.",
    cents: [0, 90.22, 203.91, 294.13, 407.82, 498.04, 588.27, 701.96, 792.18, 905.87, 996.09, 1109.78],
  },
  meantone: {
    id: "meantone", name: "Quarter-Comma Meantone",
    description: "Pure major thirds (386¢), tempered fifths (697¢). Renaissance standard. Wolf fifth on G#–Eb.",
    cents: [0, 76.05, 193.16, 310.26, 386.31, 503.42, 579.47, 696.58, 772.63, 889.74, 1006.84, 1082.89],
  },
  werckmeister: {
    id: "werckmeister", name: "Werckmeister III",
    description: "Well temperament (1691). All keys playable, each with distinct color. Bach's likely tuning.",
    cents: [0, 90.22, 192.18, 294.13, 390.22, 498.04, 588.27, 696.09, 792.18, 888.27, 996.09, 1092.18],
  },
};

export const TUNING_IDS = Object.keys(TUNINGS) as TuningId[];

/**
 * MIDI note → frequency using a given tuning system.
 *
 * Math: the tuning defines 12 cent offsets within an octave (relative to C).
 * We compute the total cent distance from A4, then convert to Hz.
 *
 *   totalCents = tuning[pc] - tuning[A] + octaveDistance × 1200
 *   freq = refPitch × 2^(totalCents / 1200)
 */
export function midiToFreq(note: number, tuning: TuningSystem, refPitch: number): number {
  const pc = ((note % 12) + 12) % 12;
  const octaveDist = (note - pc - 60) / 12;
  const totalCents = tuning.cents[pc] - tuning.cents[9] + octaveDist * 1200;
  return refPitch * Math.pow(2, totalCents / 1200);
}

// ─── Voice Configuration ────────────────────────────────────────────────────

export interface VoiceConfig {
  id: string;
  name: string;
  description: string;
  category: "piano" | "keys" | "synth" | "bell";

  maxPartials: number;
  partialRolloff: number;
  partialDecayRate: number;
  partialsPerRegister: [number, number, number, number]; // [>90, >72, >54, bass]

  /** Inharmonicity coefficient per octave (0-8). B in f_n = n·f₀·√(1+B·n²). */
  inharmonicity: number[];

  attackRange: [number, number]; // [ff, pp] seconds
  decayBase: number;
  decayRange: number;
  decayPartialExponent: number;
  releaseTime: number;
  /** 0 = full decay (piano), 1 = full sustain (organ). */
  sustainLevel: number;

  hammerNoiseDuration: number;
  hammerNoiseAmount: number;
  hammerNoiseQRange: [number, number];

  detuneSpread: number;
  stereoWidth: number;
  voiceGain: number;
  masterGain: number;

  brightnessBase: number;
  brightnessSlope: number;
}

export const VOICE_IDS = [
  "grand", "upright", "electric", "honkytonk", "musicbox", "bright",
  "synth-pad", "organ", "bell", "strings",
] as const;

export type VoiceId = (typeof VOICE_IDS)[number];

// ── Piano Voices (ported from piano-voices.ts — scientifically modeled) ─────

const GRAND: VoiceConfig = {
  id: "grand", name: "Concert Grand", category: "piano",
  description: "9-foot concert grand. Deep sustain, complex overtones, wide dynamic range.",
  maxPartials: 12, partialRolloff: 0.9, partialDecayRate: 0.10,
  partialsPerRegister: [4, 6, 8, 10],
  inharmonicity: [0.00015, 0.00010, 0.00006, 0.000030, 0.000015, 0.000008, 0.000006, 0.000005, 0.000004],
  attackRange: [0.002, 0.010], decayBase: 6, decayRange: 18, decayPartialExponent: 0.55,
  releaseTime: 0.18, sustainLevel: 0,
  hammerNoiseDuration: 30, hammerNoiseAmount: 0.18, hammerNoiseQRange: [1.0, 3.5],
  detuneSpread: 3.0, stereoWidth: 1.0, voiceGain: 0.30, masterGain: 0.85,
  brightnessBase: 0.45, brightnessSlope: 0.18,
};

const UPRIGHT: VoiceConfig = {
  id: "upright", name: "Upright Piano", category: "piano",
  description: "Warm and intimate. Shorter sustain, more hammer. Folk and singer-songwriter.",
  maxPartials: 10, partialRolloff: 0.8, partialDecayRate: 0.10,
  partialsPerRegister: [4, 6, 8, 10],
  inharmonicity: [0.00018, 0.00012, 0.00006, 0.00003, 0.000015, 0.00001, 0.000007, 0.000005, 0.000003],
  attackRange: [0.001, 0.008], decayBase: 2, decayRange: 8, decayPartialExponent: 0.9,
  releaseTime: 0.08, sustainLevel: 0,
  hammerNoiseDuration: 35, hammerNoiseAmount: 0.35, hammerNoiseQRange: [0.8, 3.0],
  detuneSpread: 4.0, stereoWidth: 0.5, voiceGain: 0.25, masterGain: 0.85,
  brightnessBase: 0.35, brightnessSlope: 0.14,
};

const ELECTRIC: VoiceConfig = {
  id: "electric", name: "Electric Piano", category: "keys",
  description: "Rhodes/Wurlitzer feel. Bell-like, chorus shimmer. Jazz, R&B, soul.",
  maxPartials: 6, partialRolloff: 1.0, partialDecayRate: 0.15,
  partialsPerRegister: [3, 4, 5, 6],
  inharmonicity: [0.000005, 0.000004, 0.000003, 0.000002, 0.000001, 0.000001, 0.000001, 0.000001, 0.000001],
  attackRange: [0.001, 0.005], decayBase: 4, decayRange: 10, decayPartialExponent: 0.6,
  releaseTime: 0.15, sustainLevel: 0,
  hammerNoiseDuration: 0, hammerNoiseAmount: 0, hammerNoiseQRange: [0, 0],
  detuneSpread: 8.0, stereoWidth: 0.8, voiceGain: 0.30, masterGain: 0.85,
  brightnessBase: 0.1, brightnessSlope: 0.08,
};

const HONKYTONK: VoiceConfig = {
  id: "honkytonk", name: "Honky-Tonk", category: "piano",
  description: "Jangly saloon piano. Heavy detuning, bright, punchy. Ragtime, blues, boogie.",
  maxPartials: 12, partialRolloff: 0.55, partialDecayRate: 0.06,
  partialsPerRegister: [5, 8, 10, 12],
  inharmonicity: [0.00015, 0.00010, 0.00005, 0.00003, 0.000015, 0.00001, 0.000006, 0.000004, 0.000003],
  attackRange: [0.001, 0.006], decayBase: 2.5, decayRange: 9, decayPartialExponent: 0.7,
  releaseTime: 0.10, sustainLevel: 0,
  hammerNoiseDuration: 45, hammerNoiseAmount: 0.30, hammerNoiseQRange: [0.3, 2.0],
  detuneSpread: 15.0, stereoWidth: 0.9, voiceGain: 0.25, masterGain: 0.88,
  brightnessBase: 0.15, brightnessSlope: 0.08,
};

const MUSICBOX: VoiceConfig = {
  id: "musicbox", name: "Music Box", category: "bell",
  description: "Crystal pure, delicate. Metal tines, near-ideal partials. Ethereal and fragile.",
  maxPartials: 4, partialRolloff: 1.2, partialDecayRate: 0.20,
  partialsPerRegister: [2, 3, 4, 4],
  inharmonicity: [0.000002, 0.000002, 0.000001, 0.000001, 0.000001, 0.000001, 0.000001, 0.000001, 0.000001],
  attackRange: [0.001, 0.003], decayBase: 8, decayRange: 20, decayPartialExponent: 0.5,
  releaseTime: 0.20, sustainLevel: 0,
  hammerNoiseDuration: 0, hammerNoiseAmount: 0, hammerNoiseQRange: [0, 0],
  detuneSpread: 0.5, stereoWidth: 0.6, voiceGain: 0.30, masterGain: 0.80,
  brightnessBase: 0.1, brightnessSlope: 0.05,
};

const BRIGHT: VoiceConfig = {
  id: "bright", name: "Bright Grand", category: "piano",
  description: "Lid wide open. Sparkly upper partials, cuts through a mix. Pop, rock, latin.",
  maxPartials: 12, partialRolloff: 0.5, partialDecayRate: 0.06,
  partialsPerRegister: [6, 9, 11, 12],
  inharmonicity: [0.00012, 0.00008, 0.00004, 0.00002, 0.00001, 0.000006, 0.000004, 0.000003, 0.000002],
  attackRange: [0.001, 0.008], decayBase: 3, decayRange: 12, decayPartialExponent: 0.7,
  releaseTime: 0.12, sustainLevel: 0,
  hammerNoiseDuration: 35, hammerNoiseAmount: 0.22, hammerNoiseQRange: [0.6, 3.0],
  detuneSpread: 2.5, stereoWidth: 1.0, voiceGain: 0.25, masterGain: 0.88,
  brightnessBase: 0.15, brightnessSlope: 0.08,
};

// ── New Synth/Keys Voices ───────────────────────────────────────────────────

const SYNTHPAD: VoiceConfig = {
  id: "synth-pad", name: "Synth Pad", category: "synth",
  description: "Warm, evolving pad. Slow attack, rich harmonics, wide chorus. Ambient, film, chill.",
  maxPartials: 8, partialRolloff: 0.6, partialDecayRate: 0.04,
  partialsPerRegister: [5, 6, 7, 8],
  inharmonicity: [0, 0, 0, 0, 0, 0, 0, 0, 0], // exact harmonics — clean synth
  attackRange: [0.20, 0.50], decayBase: 4, decayRange: 6, decayPartialExponent: 0.3,
  releaseTime: 1.5, sustainLevel: 0.85,
  hammerNoiseDuration: 0, hammerNoiseAmount: 0, hammerNoiseQRange: [0, 0],
  detuneSpread: 12.0, stereoWidth: 1.0, voiceGain: 0.22, masterGain: 0.80,
  brightnessBase: 0.08, brightnessSlope: 0.04,
};

const ORGAN: VoiceConfig = {
  id: "organ", name: "Pipe Organ", category: "keys",
  description: "Full sustained harmonics. Drawbar-like spectrum, no decay. Classical, gospel, prog.",
  maxPartials: 10, partialRolloff: 0.35, partialDecayRate: 0.02,
  partialsPerRegister: [6, 8, 9, 10],
  inharmonicity: [0, 0, 0, 0, 0, 0, 0, 0, 0], // pipes are nearly ideal
  attackRange: [0.008, 0.015], decayBase: 1, decayRange: 1, decayPartialExponent: 0.3,
  releaseTime: 0.06, sustainLevel: 1.0,
  hammerNoiseDuration: 12, hammerNoiseAmount: 0.06, hammerNoiseQRange: [0.3, 1.0],
  detuneSpread: 1.5, stereoWidth: 0.7, voiceGain: 0.18, masterGain: 0.82,
  brightnessBase: 0.05, brightnessSlope: 0.03,
};

const BELL: VoiceConfig = {
  id: "bell", name: "Tubular Bell", category: "bell",
  description: "Metallic, inharmonic partials. Very long ring. Orchestral chimes, ambient.",
  maxPartials: 8, partialRolloff: 0.4, partialDecayRate: 0.08,
  partialsPerRegister: [4, 5, 6, 8],
  inharmonicity: [0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12], // highly inharmonic — metallic
  attackRange: [0.001, 0.003], decayBase: 12, decayRange: 18, decayPartialExponent: 0.4,
  releaseTime: 0.30, sustainLevel: 0,
  hammerNoiseDuration: 20, hammerNoiseAmount: 0.15, hammerNoiseQRange: [0.5, 2.0],
  detuneSpread: 1.0, stereoWidth: 0.8, voiceGain: 0.28, masterGain: 0.82,
  brightnessBase: 0.08, brightnessSlope: 0.05,
};

const STRINGS: VoiceConfig = {
  id: "strings", name: "String Ensemble", category: "synth",
  description: "Lush bowed strings. Slow attack, sustained, detuned for ensemble warmth.",
  maxPartials: 10, partialRolloff: 0.7, partialDecayRate: 0.05,
  partialsPerRegister: [5, 7, 8, 10],
  inharmonicity: [0.000001, 0.000001, 0.000001, 0.000001, 0.000001, 0.000001, 0.000001, 0.000001, 0.000001],
  attackRange: [0.10, 0.25], decayBase: 3, decayRange: 5, decayPartialExponent: 0.4,
  releaseTime: 0.8, sustainLevel: 0.90,
  hammerNoiseDuration: 0, hammerNoiseAmount: 0, hammerNoiseQRange: [0, 0],
  detuneSpread: 10.0, stereoWidth: 1.0, voiceGain: 0.20, masterGain: 0.80,
  brightnessBase: 0.10, brightnessSlope: 0.06,
};

export const VOICES: Record<VoiceId, VoiceConfig> = {
  grand: GRAND, upright: UPRIGHT, electric: ELECTRIC, honkytonk: HONKYTONK,
  musicbox: MUSICBOX, bright: BRIGHT, "synth-pad": SYNTHPAD, organ: ORGAN,
  bell: BELL, strings: STRINGS,
};

// ─── Synthesis Helpers ──────────────────────────────────────────────────────

const MAX_POLYPHONY = 32;

function midiToOctave(note: number): number {
  return Math.max(0, Math.min(8, Math.floor(note / 12) - 1));
}

function noteToPan(note: number, width: number): number {
  const raw = ((note - 21) / 87) * 1.4 - 0.7;
  return Math.max(-0.7, Math.min(0.7, raw * width));
}

function partialFreq(fundamental: number, n: number, B: number): number {
  return n * fundamental * Math.sqrt(1 + B * n * n);
}

function partialsForNote(midi: number, v: VoiceConfig): number {
  const [ht, ur, mr, bs] = v.partialsPerRegister;
  if (midi > 90) return ht;
  if (midi > 72) return ur;
  if (midi > 54) return mr;
  return bs;
}

function partialAmp(n: number, vel01: number, v: VoiceConfig): number {
  const base = Math.pow(n, -v.partialRolloff) * Math.exp(-v.partialDecayRate * n);
  if (n <= 3) return base;
  return base * Math.pow(vel01, v.brightnessBase + (n - 3) * v.brightnessSlope);
}

function partialDecay(n: number, midi: number, v: VoiceConfig): number {
  const regFactor = 1.0 - (midi - 21) / 87;
  const baseFundamental = v.decayBase + regFactor * v.decayRange;
  return baseFundamental * Math.pow(n, -v.decayPartialExponent);
}

function attackTime(vel01: number, v: VoiceConfig): number {
  const [ff, pp] = v.attackRange;
  return ff + (1 - vel01) * (pp - ff);
}

// ─── Active Voice ───────────────────────────────────────────────────────────

interface ActiveVoice {
  note: number;
  oscillators: OscillatorNode[];
  gains: GainNode[];
  master: GainNode;
  panner: StereoPannerNode;
  noiseSource: AudioBufferSourceNode | null;
  released: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

// ─── Public Synth Interface ─────────────────────────────────────────────────

export interface Synth {
  connect(): Promise<void>;
  disconnect(): void;
  noteOn(note: number, velocity: number, time?: number): void;
  noteOff(note: number, time?: number): void;
  allNotesOff(): void;
  setVoice(id: VoiceId): void;
  setTuning(id: TuningId): void;
  setRefPitch(hz: number): void;
  getVoice(): VoiceConfig;
  getTuning(): TuningSystem;
  getRefPitch(): number;
  getActiveCount(): number;
  getContext(): AudioContext | null;
}

export function createSynth(options?: {
  voice?: VoiceId;
  tuning?: TuningId;
  refPitch?: number;
}): Synth {
  let voice = VOICES[options?.voice ?? "grand"];
  let tuning = TUNINGS[options?.tuning ?? "equal"];
  let refPitch = options?.refPitch ?? 440;

  let ctx: AudioContext | null = null;
  let compressor: DynamicsCompressorNode | null = null;
  let master: GainNode | null = null;
  let hammerBuf: AudioBuffer | null = null;

  const activeVoices = new Map<number, ActiveVoice>();
  const voiceOrder: number[] = [];

  function ensureCtx() {
    if (!ctx) throw new Error("Synth not connected");
    return ctx;
  }

  function buildHammerNoise() {
    if (!ctx || voice.hammerNoiseAmount <= 0) return;
    const len = Math.ceil((voice.hammerNoiseDuration / 1000) * ctx.sampleRate);
    hammerBuf = ctx.createBuffer(1, Math.max(1, len), ctx.sampleRate);
    const d = hammerBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function killVoice(v: ActiveVoice) {
    if (v.timer) { clearTimeout(v.timer); v.timer = null; }
    for (const o of v.oscillators) { try { o.stop(); o.disconnect(); } catch {} }
    for (const g of v.gains) { try { g.disconnect(); } catch {} }
    if (v.noiseSource) { try { v.noiseSource.stop(); v.noiseSource.disconnect(); } catch {} }
    try { v.master.disconnect(); } catch {}
    try { v.panner.disconnect(); } catch {}
  }

  function releaseVoice(v: ActiveVoice, time?: number) {
    if (v.released) return;
    v.released = true;
    const c = ensureCtx();
    const now = time ?? c.currentTime;
    const rel = voice.releaseTime;
    for (const g of v.gains) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + rel);
    }
    v.timer = setTimeout(() => killVoice(v), (rel + 0.05) * 1000);
  }

  function stealOldest() {
    if (voiceOrder.length === 0) return;
    const oldest = voiceOrder.shift()!;
    const v = activeVoices.get(oldest);
    if (v) { killVoice(v); activeVoices.delete(oldest); }
  }

  function removeOrder(note: number) {
    const i = voiceOrder.indexOf(note);
    if (i >= 0) voiceOrder.splice(i, 1);
  }

  const synth: Synth = {
    async connect() {
      ctx = new AudioContext({ sampleRate: 48000, latencyHint: "interactive" });
      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -15;
      compressor.knee.value = 12;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.2;
      master = ctx.createGain();
      master.gain.value = voice.masterGain;
      compressor.connect(master);
      master.connect(ctx.destination);
      buildHammerNoise();
    },

    disconnect() {
      synth.allNotesOff();
      if (ctx) { ctx.close(); ctx = null; compressor = null; master = null; hammerBuf = null; }
    },

    noteOn(note: number, velocity: number, time?: number) {
      const c = ensureCtx();
      const v = voice;
      const vel01 = Math.max(0.01, Math.min(1, velocity / 127));
      const freq = midiToFreq(note, tuning, refPitch);
      const octave = midiToOctave(note);
      const B = v.inharmonicity[octave] ?? 0;
      const now = time ?? c.currentTime;
      const atk = attackTime(vel01, v);
      const numP = partialsForNote(note, v);

      // Kill existing same-note
      const existing = activeVoices.get(note);
      if (existing) { killVoice(existing); activeVoices.delete(note); removeOrder(note); }
      while (activeVoices.size >= MAX_POLYPHONY) stealOldest();

      // Voice master gain
      const voiceMaster = c.createGain();
      voiceMaster.gain.value = vel01 * v.voiceGain;

      // Stereo
      const panner = c.createStereoPanner();
      panner.pan.value = noteToPan(note, v.stereoWidth);
      voiceMaster.connect(panner);
      panner.connect(compressor!);

      const oscillators: OscillatorNode[] = [];
      const gains: GainNode[] = [];

      for (let n = 1; n <= numP; n++) {
        const pFreq = partialFreq(freq, n, B);
        if (pFreq > 18000) break;

        const osc = c.createOscillator();
        osc.type = "sine";
        osc.frequency.value = pFreq;
        osc.detune.value = (Math.random() - 0.5) * v.detuneSpread;

        const gain = c.createGain();
        const amp = partialAmp(n, vel01, v);
        const decay = partialDecay(n, note, v);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(amp, now + atk);

        // Sustain behavior
        if (v.sustainLevel >= 0.99) {
          // Organ: hold at full amplitude
        } else if (v.sustainLevel > 0.01) {
          // Partial sustain: decay to sustain level
          gain.gain.setTargetAtTime(amp * v.sustainLevel, now + atk, decay);
        } else {
          // Piano: full decay to silence
          gain.gain.setTargetAtTime(0.0001, now + atk, decay);
        }

        osc.connect(gain);
        gain.connect(voiceMaster);
        osc.start(now);
        oscillators.push(osc);
        gains.push(gain);
      }

      // Hammer noise
      let noiseSource: AudioBufferSourceNode | null = null;
      if (hammerBuf && v.hammerNoiseAmount > 0) {
        noiseSource = c.createBufferSource();
        noiseSource.buffer = hammerBuf;

        const filter = c.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = Math.min(freq * 2.5, 10000);
        const [bq, vq] = v.hammerNoiseQRange;
        filter.Q.value = bq + vel01 * vq;

        const ng = c.createGain();
        ng.gain.setValueAtTime(vel01 * v.hammerNoiseAmount, now);
        ng.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

        noiseSource.connect(filter);
        filter.connect(ng);
        ng.connect(voiceMaster);
        noiseSource.start(now);
      }

      const av: ActiveVoice = {
        note, oscillators, gains, master: voiceMaster, panner,
        noiseSource, released: false, timer: null,
      };
      activeVoices.set(note, av);
      voiceOrder.push(note);
    },

    noteOff(note: number, time?: number) {
      const v = activeVoices.get(note);
      if (v) { releaseVoice(v, time); activeVoices.delete(note); removeOrder(note); }
    },

    allNotesOff() {
      for (const [, v] of activeVoices) killVoice(v);
      activeVoices.clear();
      voiceOrder.length = 0;
    },

    setVoice(id: VoiceId) {
      voice = VOICES[id] ?? VOICES.grand;
      if (master) master.gain.value = voice.masterGain;
      buildHammerNoise();
    },

    setTuning(id: TuningId) { tuning = TUNINGS[id] ?? TUNINGS.equal; },
    setRefPitch(hz: number) { refPitch = Math.max(392, Math.min(494, hz)); },
    getVoice() { return voice; },
    getTuning() { return tuning; },
    getRefPitch() { return refPitch; },
    getActiveCount() { return activeVoices.size; },
    getContext() { return ctx; },
  };

  return synth;
}
