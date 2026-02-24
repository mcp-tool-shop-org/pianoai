// ─── ai-jam-sessions: Piano Voice Presets ────────────────────────────────────
//
// Different pianos for different songs.
//
// Each voice is a complete set of synthesis parameters that shapes the
// oscillator engine's timbre. The "grand" preset reproduces the original
// hardcoded sound. Other presets change harmonic content, decay, hammer
// noise, detuning, and brightness to create distinct piano characters.
//
// Usage:
//   import { getVoice, suggestVoice } from "./piano-voices.js";
//   const voice = getVoice("honkytonk");
//   const piano = createAudioEngine("honkytonk");
// ─────────────────────────────────────────────────────────────────────────────

// ─── Config Interface ────────────────────────────────────────────────────────

/**
 * Complete synthesis configuration for a piano voice.
 *
 * Every number here maps to a specific knob in the oscillator engine.
 * Changing these values produces a meaningfully different instrument.
 */
export interface PianoVoiceConfig {
  /** Unique ID (kebab-case). */
  id: string;

  /** Human-readable name. */
  name: string;

  /** One-line description of the character. */
  description: string;

  /** Genres this voice works well with. */
  suggestedFor: string[];

  // ── Harmonic Content ──

  /** Maximum sine partials per voice. More = richer tone. */
  maxPartials: number;

  /** Amplitude rolloff exponent: amplitude ∝ 1/n^X. Higher = darker. */
  partialRolloff: number;

  /** Exponential decay rate for partial amplitude: exp(-X*n). Higher = fewer upper harmonics. */
  partialDecayRate: number;

  /** Partials per register: [highTreble >90, upperReg >72, midReg >54, bass]. */
  partialsPerRegister: [number, number, number, number];

  // ── Inharmonicity ──

  /** Inharmonicity coefficient per octave (0-8). Higher = more stretched partials. */
  inharmonicity: number[];

  // ── Envelope ──

  /** Attack time range: [fortissimo, pianissimo] in seconds. */
  attackRange: [number, number];

  /** Base fundamental decay time at treble end (seconds). */
  decayBase: number;

  /** Additional decay time for bass register (seconds). Total bass decay = decayBase + decayRange. */
  decayRange: number;

  /** Higher partials decay exponent: decay ∝ 1/n^X. Higher = faster upper partial decay. */
  decayPartialExponent: number;

  /** Damper release time (seconds). How fast sound stops after key release. */
  releaseTime: number;

  // ── Hammer Noise ──

  /** Hammer noise burst duration (milliseconds). */
  hammerNoiseDuration: number;

  /** Hammer noise amplitude (0-1). 0 = no hammer attack, higher = more percussive. */
  hammerNoiseAmount: number;

  /** Bandpass filter Q range: [base, +velocityScaled]. Higher Q = more tonal attack. */
  hammerNoiseQRange: [number, number];

  // ── Character ──

  /** Random detuning spread in cents (±half). More = more "alive" / chorus effect. */
  detuneSpread: number;

  /** Stereo width multiplier (0-1). 0 = mono, 1 = full bass-left/treble-right spread. */
  stereoWidth: number;

  /** Per-voice gain multiplier. */
  voiceGain: number;

  /** Master output gain. */
  masterGain: number;

  // ── Brightness ──

  /** Velocity-brightness gate base exponent. Lower = brighter at soft velocities. */
  brightnessBase: number;

  /** Per-partial velocity gate slope. Lower = upper partials appear at softer velocities. */
  brightnessSlope: number;
}

// ─── Voice IDs ──────────────────────────────────────────────────────────────

export const VOICE_IDS = [
  "grand",
  "upright",
  "electric",
  "honkytonk",
  "musicbox",
  "bright",
] as const;

export type PianoVoiceId = (typeof VOICE_IDS)[number];

// ─── Presets ────────────────────────────────────────────────────────────────

/**
 * Concert Grand Piano — the default.
 *
 * Modeled after a 9-foot concert grand (Steinway D / Bösendorfer 290).
 *
 * What makes a grand piano sound "grand":
 *   1. RESONANCE — massive soundboard means notes sustain 15-20+ seconds
 *      in the bass. Even treble notes ring for 5-8 seconds. We achieve
 *      this with high decayBase + decayRange.
 *   2. HARMONIC RICHNESS — long strings produce clean upper harmonics
 *      that sustain alongside the fundamental, not just flash on attack.
 *      Low partialDecayRate + low decayPartialExponent = harmonics linger.
 *   3. DYNAMIC RANGE — pp should be warm and round, ff should bloom with
 *      overtones. The brightness curve controls this: moderate gating so
 *      harmonics are present at mf but really open up at f/ff.
 *   4. BODY — the felt hammer creates a warm "bloom" transient, not a
 *      percussive thump. Moderate hammer noise with tonal Q filtering.
 *   5. DEPTH — slight inharmonicity stretching in the treble creates the
 *      characteristic piano shimmer. 3-string unisons with tiny detuning
 *      add warmth and chorus-like life.
 */
const GRAND: PianoVoiceConfig = {
  id: "grand",
  name: "Concert Grand",
  description: "Rich and resonant. Deep sustain, wide dynamic range, complex overtones. The classic concert sound.",
  suggestedFor: ["classical", "jazz", "film", "ballads"],

  maxPartials: 12,
  partialRolloff: 0.9,          // aggressive rolloff — fundamental dominates, warm tone
  partialDecayRate: 0.10,       // upper partials die fast — only fundamental sustains
  partialsPerRegister: [4, 6, 8, 10],   // fewer partials everywhere — pure, warm sound

  inharmonicity: [
    0.00015,  // octave 0 (A0 area) — bass strings, moderate stiffness
    0.00010,  // octave 1
    0.00006,  // octave 2
    0.000030, // octave 3
    0.000015, // octave 4 (middle C) — cleanest register
    0.000008, // octave 5
    0.000006, // octave 6 — gives treble its shimmer
    0.000005, // octave 7
    0.000004, // octave 8
  ],

  attackRange: [0.002, 0.010],  // wide range: ff snappy, pp soft bloom
  decayBase: 6,                 // long treble sustain (real grand = 5-8s in treble)
  decayRange: 18,               // bass rings very long (real grand = 15-20s+ in bass)
  decayPartialExponent: 0.55,   // upper partials sustain nearly as long as fundamental (rich tail)
  releaseTime: 0.18,            // slow felt dampers — notes don't choke off instantly

  hammerNoiseDuration: 30,      // short, refined bloom
  hammerNoiseAmount: 0.18,      // present but warm — felt on steel, not a thump
  hammerNoiseQRange: [1.0, 3.5], // tonal hammer — more pitch-centered, less white noise

  detuneSpread: 3.0,            // 3-string unison with slight detuning = warmth + life
  stereoWidth: 1.0,             // full bass-left / treble-right spread
  voiceGain: 0.30,              // strong presence
  masterGain: 0.85,

  brightnessBase: 0.45,         // very heavy gating — almost no upper partials unless ff
  brightnessSlope: 0.18,        // only the hardest hits bring out any brightness
};

/**
 * Upright Piano.
 *
 * Warmer and more intimate than a grand. Shorter sustain due to
 * smaller soundboard. More prominent hammer attack (the mechanism
 * is closer to the strings). Narrower stereo — uprights are compact.
 * Perfect for folk, singer-songwriter, and practice.
 */
const UPRIGHT: PianoVoiceConfig = {
  id: "upright",
  name: "Upright Piano",
  description: "Warm and intimate. Shorter sustain, more hammer character. Cozy and honest.",
  suggestedFor: ["folk", "pop", "singer-songwriter"],

  maxPartials: 10,
  partialRolloff: 0.8,
  partialDecayRate: 0.10,
  partialsPerRegister: [4, 6, 8, 10],

  inharmonicity: [
    0.00018,  // uprights have more inharmonicity (stiffer, shorter strings)
    0.00012,
    0.00006,
    0.00003,
    0.000015,
    0.00001,
    0.000007,
    0.000005,
    0.000003,
  ],

  attackRange: [0.001, 0.008],
  decayBase: 2,
  decayRange: 8,
  decayPartialExponent: 0.9,
  releaseTime: 0.08,

  hammerNoiseDuration: 35,
  hammerNoiseAmount: 0.35,
  hammerNoiseQRange: [0.8, 3.0],

  detuneSpread: 4.0,
  stereoWidth: 0.5,
  voiceGain: 0.25,
  masterGain: 0.85,

  brightnessBase: 0.35,
  brightnessSlope: 0.14,
};

/**
 * Electric Piano (Rhodes / Wurlitzer feel).
 *
 * Clean, bell-like tone with very few partials. No hammer noise —
 * the "attack" comes from the sharp onset of the sine tones.
 * Chorus-like detuning gives it shimmer. Very low inharmonicity
 * (tines are nearly ideal). Think Miles Davis ballads, Herbie Hancock.
 */
const ELECTRIC: PianoVoiceConfig = {
  id: "electric",
  name: "Electric Piano",
  description: "Clean and bell-like. Rhodes/Wurlitzer feel with chorus shimmer. Smooth and warm.",
  suggestedFor: ["jazz", "rnb", "new-age", "soul"],

  maxPartials: 6,
  partialRolloff: 1.0,
  partialDecayRate: 0.15,
  partialsPerRegister: [3, 4, 5, 6],

  inharmonicity: [
    0.000005, // nearly ideal — tines, not strings
    0.000004,
    0.000003,
    0.000002,
    0.000001,
    0.000001,
    0.000001,
    0.000001,
    0.000001,
  ],

  attackRange: [0.001, 0.005],
  decayBase: 4,
  decayRange: 10,
  decayPartialExponent: 0.6,
  releaseTime: 0.15,

  hammerNoiseDuration: 0,
  hammerNoiseAmount: 0,
  hammerNoiseQRange: [0, 0],

  detuneSpread: 8.0,
  stereoWidth: 0.8,
  voiceGain: 0.30,
  masterGain: 0.85,

  brightnessBase: 0.1,
  brightnessSlope: 0.08,
};

/**
 * Honky-Tonk Piano.
 *
 * The saloon piano. Heavy detuning between the three strings per note
 * creates the characteristic "jangly" sound. Bright and punchy with
 * prominent hammer attack. Short-ish decay. Think ragtime, barrelhouse
 * blues, early rock and roll.
 */
const HONKYTONK: PianoVoiceConfig = {
  id: "honkytonk",
  name: "Honky-Tonk",
  description: "Jangly and bright. Heavy detuning, punchy attack. The saloon piano.",
  suggestedFor: ["ragtime", "blues", "rock", "boogie"],

  maxPartials: 12,
  partialRolloff: 0.55,
  partialDecayRate: 0.06,
  partialsPerRegister: [5, 8, 10, 12],

  inharmonicity: [
    0.00015,
    0.00010,
    0.00005,
    0.00003,
    0.000015,
    0.00001,
    0.000006,
    0.000004,
    0.000003,
  ],

  attackRange: [0.001, 0.006],
  decayBase: 2.5,
  decayRange: 9,
  decayPartialExponent: 0.7,
  releaseTime: 0.10,

  hammerNoiseDuration: 45,
  hammerNoiseAmount: 0.30,
  hammerNoiseQRange: [0.3, 2.0],

  detuneSpread: 15.0,
  stereoWidth: 0.9,
  voiceGain: 0.25,
  masterGain: 0.88,

  brightnessBase: 0.15,
  brightnessSlope: 0.08,
};

/**
 * Music Box.
 *
 * Crystal-clear, delicate sound. Very few partials (the metal tines
 * produce nearly pure tones). No hammer noise. Extremely long sustain
 * (tines ring freely). Minimal detuning. Ethereal and fragile.
 */
const MUSICBOX: PianoVoiceConfig = {
  id: "musicbox",
  name: "Music Box",
  description: "Crystal clear and delicate. Pure tones, long sustain. Ethereal and fragile.",
  suggestedFor: ["new-age", "film", "lullaby", "gentle"],

  maxPartials: 4,
  partialRolloff: 1.2,
  partialDecayRate: 0.20,
  partialsPerRegister: [2, 3, 4, 4],

  inharmonicity: [
    0.000002, // nearly zero — metal tines are very close to ideal
    0.000002,
    0.000001,
    0.000001,
    0.000001,
    0.000001,
    0.000001,
    0.000001,
    0.000001,
  ],

  attackRange: [0.001, 0.003],
  decayBase: 8,
  decayRange: 20,
  decayPartialExponent: 0.5,
  releaseTime: 0.20,

  hammerNoiseDuration: 0,
  hammerNoiseAmount: 0,
  hammerNoiseQRange: [0, 0],

  detuneSpread: 0.5,
  stereoWidth: 0.6,
  voiceGain: 0.30,
  masterGain: 0.80,

  brightnessBase: 0.1,
  brightnessSlope: 0.05,
};

/**
 * Bright Grand.
 *
 * A concert grand with the lid fully open. More upper partials come
 * through, making it sparkle. The brightness curve lets harmonics
 * sing even at moderate velocities. Think Yamaha CFIII vs. Steinway D.
 * Great for pop, rock, and anything that needs to cut through.
 */
const BRIGHT: PianoVoiceConfig = {
  id: "bright",
  name: "Bright Grand",
  description: "Sparkling and present. Like a grand with the lid wide open. Cuts through.",
  suggestedFor: ["pop", "rock", "latin", "energetic"],

  maxPartials: 12,
  partialRolloff: 0.5,
  partialDecayRate: 0.06,
  partialsPerRegister: [6, 9, 11, 12],

  inharmonicity: [
    0.00012,
    0.00008,
    0.00004,
    0.00002,
    0.00001,
    0.000006,
    0.000004,
    0.000003,
    0.000002,
  ],

  attackRange: [0.001, 0.008],
  decayBase: 3,
  decayRange: 12,
  decayPartialExponent: 0.7,
  releaseTime: 0.12,

  hammerNoiseDuration: 35,
  hammerNoiseAmount: 0.22,
  hammerNoiseQRange: [0.6, 3.0],

  detuneSpread: 2.5,
  stereoWidth: 1.0,
  voiceGain: 0.25,
  masterGain: 0.88,

  brightnessBase: 0.15,
  brightnessSlope: 0.08,
};

// ─── Registry ───────────────────────────────────────────────────────────────

export const PIANO_VOICES: Record<PianoVoiceId, PianoVoiceConfig> = {
  grand: GRAND,
  upright: UPRIGHT,
  electric: ELECTRIC,
  honkytonk: HONKYTONK,
  musicbox: MUSICBOX,
  bright: BRIGHT,
};

// ─── Tuning Parameter Definitions ───────────────────────────────────────────

/**
 * User-facing tuning parameters with friendly names, ranges, and
 * mapping to PianoVoiceConfig keys. Used by MCP tools and CLI.
 */
export interface TuningParam {
  key: string;               // friendly name (CLI flag / MCP param)
  configKey: string;         // PianoVoiceConfig property
  min: number;
  max: number;
  description: string;
  isArrayIndex?: number;     // for attackRange[0] / attackRange[1]
}

export const TUNING_PARAMS: TuningParam[] = [
  { key: "brightness",      configKey: "brightnessBase",    min: 0.05, max: 0.5,  description: "How bright at moderate velocity (lower = brighter)" },
  { key: "brightness-slope", configKey: "brightnessSlope",  min: 0.03, max: 0.2,  description: "Velocity sensitivity for upper partials" },
  { key: "decay",           configKey: "decayBase",         min: 1,    max: 10,   description: "Sustain length (treble end, seconds)" },
  { key: "bass-decay",      configKey: "decayRange",        min: 4,    max: 25,   description: "Additional sustain for bass (seconds)" },
  { key: "hammer",          configKey: "hammerNoiseAmount",  min: 0,    max: 0.5,  description: "Hammer attack intensity (0 = none)" },
  { key: "detune",          configKey: "detuneSpread",      min: 0,    max: 20,   description: "Random detuning in cents (chorus effect)" },
  { key: "stereo",          configKey: "stereoWidth",       min: 0,    max: 1,    description: "Stereo spread (0 = mono, 1 = full)" },
  { key: "volume",          configKey: "voiceGain",         min: 0.1,  max: 0.5,  description: "Per-voice volume" },
  { key: "release",         configKey: "releaseTime",       min: 0.03, max: 0.3,  description: "Damper speed (seconds)" },
  { key: "rolloff",         configKey: "partialRolloff",    min: 0.3,  max: 1.5,  description: "Harmonic darkness (higher = darker)" },
  { key: "attack-fast",     configKey: "attackRange",       min: 0.001, max: 0.01, description: "Fastest attack time (ff, seconds)", isArrayIndex: 0 },
  { key: "attack-slow",     configKey: "attackRange",       min: 0.003, max: 0.02, description: "Slowest attack time (pp, seconds)", isArrayIndex: 1 },
];

// ─── User Tuning Persistence ────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** Partial overrides the user has saved for a voice. Keyed by friendly param name. */
export type UserTuning = Record<string, number>;

function tuningDir(): string {
  const dir = join(homedir(), ".ai-jam-sessions", "voices");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function tuningPath(voiceId: string): string {
  return join(tuningDir(), `${voiceId}.json`);
}

/** Load user tuning overrides for a voice. Returns empty object if none saved. */
export function loadUserTuning(voiceId: string): UserTuning {
  const p = tuningPath(voiceId);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

/** Save user tuning overrides. Merges with existing overrides. */
export function saveUserTuning(voiceId: string, overrides: UserTuning): void {
  const existing = loadUserTuning(voiceId);
  const merged = { ...existing, ...overrides };
  writeFileSync(tuningPath(voiceId), JSON.stringify(merged, null, 2), "utf-8");
}

/** Clear all user tuning overrides for a voice (reset to factory). */
export function resetUserTuning(voiceId: string): void {
  const p = tuningPath(voiceId);
  if (existsSync(p)) unlinkSync(p);
}

/**
 * Apply user tuning overrides to a base voice config.
 * Friendly param names are mapped back to PianoVoiceConfig properties.
 */
function applyTuning(base: PianoVoiceConfig, tuning: UserTuning): PianoVoiceConfig {
  const config = { ...base, attackRange: [...base.attackRange] as [number, number] };

  for (const [key, value] of Object.entries(tuning)) {
    const param = TUNING_PARAMS.find(p => p.key === key);
    if (!param) continue;

    // Clamp to valid range
    const clamped = Math.max(param.min, Math.min(param.max, value));

    if (param.isArrayIndex !== undefined) {
      // Handle array properties (attackRange)
      (config as any)[param.configKey][param.isArrayIndex] = clamped;
    } else {
      (config as any)[param.configKey] = clamped;
    }
  }

  return config;
}

/**
 * Get a voice config with user tuning applied.
 * This is the main entry point for the audio engine.
 */
export function getMergedVoice(id: string): PianoVoiceConfig | undefined {
  const base = PIANO_VOICES[id as PianoVoiceId];
  if (!base) return undefined;

  const tuning = loadUserTuning(id);
  if (Object.keys(tuning).length === 0) return base;
  return applyTuning(base, tuning);
}

// ─── Lookup Functions ───────────────────────────────────────────────────────

/** Get a base voice config by ID (no user tuning). Returns undefined if not found. */
export function getVoice(id: string): PianoVoiceConfig | undefined {
  return PIANO_VOICES[id as PianoVoiceId];
}

/** List all available voice configs (base, no user tuning). */
export function listVoices(): PianoVoiceConfig[] {
  return Object.values(PIANO_VOICES);
}

/** Suggest a piano voice for a genre. */
export function suggestVoice(genre: string): PianoVoiceId {
  const map: Record<string, PianoVoiceId> = {
    classical: "grand",
    jazz: "electric",
    pop: "bright",
    blues: "honkytonk",
    rock: "bright",
    rnb: "electric",
    latin: "bright",
    film: "grand",
    ragtime: "honkytonk",
    "new-age": "musicbox",
    folk: "upright",
  };
  return map[genre] ?? "grand";
}
