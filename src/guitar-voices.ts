// ─── Guitar Voice Presets & Tuning Systems ──────────────────────────────────
//
// Scientific instrument-grade guitar synthesis parameters.
//
// Each GuitarVoiceConfig defines the complete physical model for a guitar type.
// Parameters map to measurable acoustic properties — string tension, body
// resonance, pluck position — not arbitrary DSP knobs.
//
// Tuning systems support standard, alternate, and micro-tuning with
// configurable A4 reference pitch (415–466 Hz) and per-string cent offsets.
//
// Usage:
//   import { getGuitarVoice, GUITAR_VOICE_IDS } from "./guitar-voices.js";
//   const voice = getGuitarVoice("classical-nylon");
//   const guitar = createGuitarEngine({ voice: "classical-nylon" });
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ─── Config Interface ────────────────────────────────────────────────────────

/**
 * Complete synthesis configuration for a guitar voice.
 *
 * Every parameter corresponds to a measurable physical property of a
 * real guitar. Changing these produces a meaningfully different instrument
 * that a trained ear can identify.
 */
export interface GuitarVoiceConfig {
  /** Unique ID (kebab-case). */
  id: string;

  /** Human-readable name. */
  name: string;

  /** One-line description of the character. */
  description: string;

  /** Genres this voice works well with. */
  suggestedFor: string[];

  // ── String Physics ──

  /**
   * Maximum sine partials per voice. Guitar strings produce fewer clean
   * upper partials than piano strings due to shorter scale length and
   * lighter mass. Nylon ≈ 8–12, steel ≈ 10–16, electric ≈ 6–10.
   */
  maxPartials: number;

  /**
   * Amplitude rolloff exponent: amplitude ∝ 1/n^X.
   * Guitar strings vibrate asymmetrically due to pluck excitation,
   * producing stronger odd harmonics than even. This is the base rolloff.
   * Nylon ≈ 0.7–1.0, steel ≈ 0.5–0.8, electric (clean) ≈ 0.4–0.6.
   */
  partialRolloff: number;

  /**
   * Exponential decay rate for partial amplitude.
   * Models the frequency-dependent string damping: higher partials
   * lose energy faster due to air resistance and internal friction.
   */
  partialDecayRate: number;

  /**
   * Partials per register: [highTreble >78, upperReg >66, midReg >54, bass].
   * Guitar has fewer partials in upper register than piano.
   */
  partialsPerRegister: [number, number, number, number];

  // ── Inharmonicity ──

  /**
   * Inharmonicity coefficient per octave (0–8).
   * Guitar strings are shorter and less stiff than piano strings,
   * so inharmonicity is generally lower. Wound bass strings on acoustic
   * guitars have moderate inharmonicity; unwound treble strings are
   * nearly ideal. Electric guitar strings are thinner/less stiff.
   *
   * Physical basis: B = π³·E·d⁴ / (64·T·L²)
   * where E=Young's modulus, d=diameter, T=tension, L=length
   *
   * Nylon treble: B ≈ 0.000001 (nearly ideal)
   * Nylon bass (wound): B ≈ 0.00005–0.0001
   * Steel acoustic: B ≈ 0.00003–0.0002
   * Electric: B ≈ 0.00002–0.00015
   */
  inharmonicity: number[];

  // ── Pluck Model ──

  /**
   * Pluck position as fraction of string length (0 = bridge, 1 = nut).
   *
   * This is the most critical parameter for guitar timbre. The harmonic
   * content is determined by sin(n·π·p) where n is the partial number
   * and p is the pluck position.
   *
   * Physical positions on a real guitar:
   *   0.08–0.12: near bridge (ponticello) — bright, twangy, thin
   *   0.13–0.18: normal position — balanced tone
   *   0.20–0.30: over sound hole — warm, round, classical
   *   0.35–0.50: near neck (tasto) — dark, muffled, mellow
   *
   * Plucking at position 1/n suppresses the nth harmonic completely.
   * At p=0.5 (middle), all even harmonics vanish → hollow, clarinet-like.
   */
  pluckPosition: number;

  /**
   * Pluck noise burst duration in milliseconds.
   * Models finger/pick contact noise. Fingerstyle ≈ 8–15ms,
   * flatpick ≈ 3–8ms, nails ≈ 5–12ms.
   */
  pluckNoiseDuration: number;

  /**
   * Pluck noise amplitude (0–1). Amount of broadband noise at attack.
   * Nylon fingertip ≈ 0.05–0.10, steel pick ≈ 0.15–0.30,
   * electric ≈ 0.08–0.15.
   */
  pluckNoiseAmount: number;

  /**
   * Pluck noise filter Q range: [base, +velocityScaled].
   * Lower Q = more broadband scratch; higher Q = more tonal ping.
   */
  pluckNoiseQRange: [number, number];

  // ── Envelope ──

  /**
   * Attack time range: [fortissimo, pianissimo] in seconds.
   * Guitar attacks are faster than piano (no hammer inertia).
   * Flatpick ≈ [0.0005, 0.003], fingerstyle ≈ [0.001, 0.005].
   */
  attackRange: [number, number];

  /**
   * Base fundamental decay time (treble end, seconds).
   * Nylon ≈ 2–4s, steel acoustic ≈ 3–5s, electric clean ≈ 4–8s.
   * Measured as time to -60dB (RT60).
   */
  decayBase: number;

  /**
   * Additional decay for bass strings (seconds).
   * Bass strings ring longer due to higher stored energy.
   * Total bass decay = decayBase + decayRange.
   */
  decayRange: number;

  /**
   * Higher partials decay exponent: decay ∝ 1/n^X.
   * Guitar strings exhibit strong frequency-dependent damping:
   * higher harmonics die much faster than the fundamental.
   * Typical range: 0.6–1.2 (higher = upper partials decay faster).
   */
  decayPartialExponent: number;

  /**
   * Release time (seconds). How fast sound stops after the string
   * is muted (palm mute, finger lift).
   * Shorter than piano — guitar players actively damp strings.
   */
  releaseTime: number;

  // ── Body Resonance ──

  /**
   * Body resonance frequency in Hz. The Helmholtz resonance of the
   * guitar body/sound hole. This defines the "voice" of the guitar.
   *
   * Classical guitar ≈ 90–110 Hz
   * Dreadnought ≈ 100–130 Hz
   * Jumbo ≈ 85–105 Hz
   * Electric (solid body): minimal, ≈ 200–400 Hz (pickup resonance)
   */
  bodyResonanceFreq: number;

  /**
   * Body resonance Q factor. How sharply the body resonance peaks.
   * Acoustic ≈ 3–8 (broad, warm), electric ≈ 1–3 (subtle).
   */
  bodyResonanceQ: number;

  /**
   * Body resonance gain (dB). How much the body amplifies at resonance.
   * Acoustic ≈ 4–10 dB, electric ≈ 0–3 dB.
   */
  bodyResonanceGain: number;

  /**
   * Secondary body resonance (top plate mode), Hz.
   * Adds warmth and complexity. Acoustic ≈ 180–280 Hz.
   * Set to 0 to disable (e.g. electric guitar).
   */
  bodySecondaryFreq: number;

  /** Secondary body resonance Q. */
  bodySecondaryQ: number;

  /** Secondary body resonance gain (dB). */
  bodySecondaryGain: number;

  // ── Character ──

  /**
   * Random detuning spread in cents (±half).
   * Models micro-imperfections in intonation. Guitar has more
   * than piano due to non-uniform string stretching over frets.
   * Classical ≈ 1–3 cents, steel ≈ 2–5 cents, old strings ≈ 5–10.
   */
  detuneSpread: number;

  /**
   * Stereo width (0–1). 0 = mono, 1 = full spread.
   * Mono guitar ≈ 0–0.3, stereo pair ≈ 0.6–1.0.
   * Note: guitar stereo is different from piano — it's not bass-left/treble-right.
   * Instead, it models slight position offset or double-tracking.
   */
  stereoWidth: number;

  /**
   * Odd harmonic emphasis factor (1.0 = neutral, >1.0 = boost odds).
   * Plucked strings produce stronger odd harmonics than even ones
   * due to the asymmetric initial displacement. This shapes the
   * "guitarness" of the tone. Nylon ≈ 1.2–1.5, steel ≈ 1.1–1.3.
   */
  oddHarmonicBoost: number;

  /** Per-voice gain multiplier. */
  voiceGain: number;

  /** Master output gain. */
  masterGain: number;

  // ── Brightness ──

  /** Velocity-brightness gate base exponent. */
  brightnessBase: number;

  /** Per-partial velocity gate slope. */
  brightnessSlope: number;
}

// ─── Voice IDs ──────────────────────────────────────────────────────────────

export const GUITAR_VOICE_IDS = [
  "classical-nylon",
  "steel-dreadnought",
  "electric-clean",
  "electric-jazz",
] as const;

export type GuitarVoiceId = (typeof GUITAR_VOICE_IDS)[number];

// ─── Guitar Tuning Systems ──────────────────────────────────────────────────

/**
 * A guitar tuning definition.
 *
 * Each entry specifies the open string MIDI note numbers (low to high,
 * string 6 → string 1). The standard concert A4=440 Hz reference
 * is configurable via GuitarEngineOptions.
 */
export interface GuitarTuning {
  /** Tuning ID (kebab-case). */
  id: string;

  /** Human-readable name. */
  name: string;

  /** Description of the tuning and its uses. */
  description: string;

  /**
   * MIDI note numbers for each open string, low to high [6, 5, 4, 3, 2, 1].
   * Standard tuning: [40, 45, 50, 55, 59, 64] = E2 A2 D3 G3 B3 E4
   */
  openStrings: [number, number, number, number, number, number];
}

export const GUITAR_TUNINGS: Record<string, GuitarTuning> = {
  standard: {
    id: "standard",
    name: "Standard (EADGBE)",
    description: "Standard guitar tuning. The universal default.",
    openStrings: [40, 45, 50, 55, 59, 64],
  },
  "drop-d": {
    id: "drop-d",
    name: "Drop D (DADGBE)",
    description: "Low E dropped to D. Heavy riffs, power chords with one finger. Rock, metal, folk.",
    openStrings: [38, 45, 50, 55, 59, 64],
  },
  "open-g": {
    id: "open-g",
    name: "Open G (DGDGBD)",
    description: "Strumming open strings plays a G major chord. Blues slide guitar, Keith Richards, Robert Johnson.",
    openStrings: [38, 43, 50, 55, 59, 62],
  },
  "open-d": {
    id: "open-d",
    name: "Open D (DADF#AD)",
    description: "Open strings play D major. Slide guitar, fingerpicking. Joni Mitchell, Elmore James.",
    openStrings: [38, 45, 50, 54, 57, 62],
  },
  dadgad: {
    id: "dadgad",
    name: "DADGAD",
    description: "Celtic/modal tuning. Neither major nor minor — suspended, ambiguous. Pierre Bensusan, Jimmy Page.",
    openStrings: [38, 45, 50, 55, 57, 62],
  },
  "open-e": {
    id: "open-e",
    name: "Open E (EBEG#BE)",
    description: "Open strings play E major. Delta blues, slide guitar. Duane Allman, Derek Trucks.",
    openStrings: [40, 47, 52, 56, 59, 64],
  },
  "half-step-down": {
    id: "half-step-down",
    name: "Half Step Down (Eb)",
    description: "Every string down one semitone. Easier bends, darker tone. Hendrix, Stevie Ray Vaughan, Alice in Chains.",
    openStrings: [39, 44, 49, 54, 58, 63],
  },
  "full-step-down": {
    id: "full-step-down",
    name: "Full Step Down (D Standard)",
    description: "Every string down one whole step. Heavy, sludgy tone. Dream Theater, Nirvana (some tracks).",
    openStrings: [38, 43, 48, 53, 57, 62],
  },
};

export const GUITAR_TUNING_IDS = Object.keys(GUITAR_TUNINGS);

// ─── Presets ────────────────────────────────────────────────────────────────

/**
 * Classical Nylon-String Guitar.
 *
 * Modeled after a concert-grade classical guitar (e.g. Torres, Hauser,
 * Ramirez). Nylon strings produce warm, round tones with low
 * inharmonicity and moderate sustain. The wide fingerboard and
 * fingerstyle technique produce a softer attack than steel strings.
 *
 * Physical basis:
 *   - Nylon treble strings: monofilament nylon, d ≈ 0.7–1.1mm
 *   - Wound bass strings: nylon core, silver-plated copper winding
 *   - Scale length: 650mm (25.6")
 *   - Body: cedar or spruce top, rosewood back/sides
 *   - String tension: 70–80 N total (low tension vs. steel ~700 N)
 *   - Helmholtz body resonance: ~95 Hz (G#2)
 *   - Top plate resonance: ~200 Hz
 */
const CLASSICAL_NYLON: GuitarVoiceConfig = {
  id: "classical-nylon",
  name: "Classical Nylon",
  description: "Warm, round, intimate. Fingerstyle nylon with rich body resonance. Segovia, Barrios, Villa-Lobos.",
  suggestedFor: ["classical", "folk", "latin", "new-age"],

  maxPartials: 10,
  partialRolloff: 0.85,
  partialDecayRate: 0.12,
  partialsPerRegister: [3, 5, 7, 9],

  // Nylon strings — very low inharmonicity, especially trebles
  inharmonicity: [
    0.00008,   // octave 0 — wound bass, moderate stiffness
    0.00005,   // octave 1
    0.00003,   // octave 2 — wound strings
    0.000010,  // octave 3 — transition wound → plain nylon
    0.000003,  // octave 4 — plain nylon, nearly ideal
    0.000001,  // octave 5
    0.000001,  // octave 6
    0.000001,  // octave 7
    0.000001,  // octave 8
  ],

  pluckPosition: 0.22,         // over sound hole — warm, classical
  pluckNoiseDuration: 12,      // fingertip on nylon — soft onset
  pluckNoiseAmount: 0.07,      // very little scratch
  pluckNoiseQRange: [1.5, 3.0],

  attackRange: [0.001, 0.005], // moderate — fingertip contact
  decayBase: 2.8,              // nylon decays faster than steel
  decayRange: 4.0,             // bass strings ring ~7s total
  decayPartialExponent: 0.9,   // upper partials die fast — nylon absorbs energy
  releaseTime: 0.06,           // quick finger damp

  bodyResonanceFreq: 95,       // Helmholtz resonance ~G#2
  bodyResonanceQ: 5.0,
  bodyResonanceGain: 8,
  bodySecondaryFreq: 200,      // top plate mode
  bodySecondaryQ: 3.5,
  bodySecondaryGain: 5,

  detuneSpread: 1.5,           // nylon — fairly stable intonation
  stereoWidth: 0.2,            // intimate, centered performance
  oddHarmonicBoost: 1.35,      // plucked nylon — strong odd harmonics
  voiceGain: 0.28,
  masterGain: 0.85,

  brightnessBase: 0.35,
  brightnessSlope: 0.14,
};

/**
 * Steel-String Dreadnought Acoustic Guitar.
 *
 * Modeled after a Martin D-28 / Gibson J-45 type dreadnought.
 * Bright, loud, projecting. Phosphor bronze strings on a large body
 * produce a powerful strumming tone with strong overtones.
 *
 * Physical basis:
 *   - Plain steel trebles: high-carbon steel, d ≈ 0.25–0.42mm
 *   - Wound bass: steel core, phosphor bronze winding, d ≈ 0.81–1.32mm
 *   - Scale length: 645mm (25.4") — Martin standard
 *   - Body: Sitka spruce top, Indian rosewood back/sides
 *   - String tension: ~700 N total (much higher than nylon)
 *   - Helmholtz: ~110 Hz (A2)
 *   - Top plate: ~220 Hz
 */
const STEEL_DREADNOUGHT: GuitarVoiceConfig = {
  id: "steel-dreadnought",
  name: "Steel Dreadnought",
  description: "Bright, loud, projecting. Phosphor bronze on a big body. Strumming powerhouse.",
  suggestedFor: ["folk", "rock", "pop", "blues", "soul"],

  maxPartials: 14,
  partialRolloff: 0.60,         // less rolloff — steel rings bright
  partialDecayRate: 0.08,
  partialsPerRegister: [4, 7, 10, 13],

  // Steel strings — more inharmonicity than nylon, especially wound bass
  inharmonicity: [
    0.00018,   // octave 0 — thick wound bass
    0.00012,   // octave 1
    0.00007,   // octave 2
    0.00004,   // octave 3
    0.00002,   // octave 4 — plain steel
    0.000010,  // octave 5
    0.000006,  // octave 6
    0.000004,  // octave 7
    0.000003,  // octave 8
  ],

  pluckPosition: 0.15,         // between bridge and sound hole — balanced
  pluckNoiseDuration: 6,       // pick on steel — sharp crack
  pluckNoiseAmount: 0.22,      // noticeable pick attack
  pluckNoiseQRange: [0.5, 2.5],

  attackRange: [0.0005, 0.003], // very fast — pick on steel wire
  decayBase: 3.5,               // steel sustains longer than nylon
  decayRange: 6.0,              // bass strings ring ~10s
  decayPartialExponent: 0.75,   // moderate — steel retains upper harmonics
  releaseTime: 0.05,            // quick palm damp

  bodyResonanceFreq: 110,       // Helmholtz ~A2 (larger body)
  bodyResonanceQ: 4.5,
  bodyResonanceGain: 7,
  bodySecondaryFreq: 220,       // top plate
  bodySecondaryQ: 3.0,
  bodySecondaryGain: 4,

  detuneSpread: 3.0,            // steel — moderate detuning
  stereoWidth: 0.35,            // slightly wider than classical
  oddHarmonicBoost: 1.15,       // steel pick — less odd emphasis than nylon
  voiceGain: 0.25,
  masterGain: 0.88,

  brightnessBase: 0.20,         // brighter than nylon at moderate velocity
  brightnessSlope: 0.10,
};

/**
 * Electric Guitar — Clean Tone.
 *
 * Modeled after a Fender Stratocaster in the neck+middle pickup position,
 * through a clean tube amp (Fender Twin Reverb style). Glassy, bell-like
 * clean tone with single-coil sparkle.
 *
 * Physical basis:
 *   - Nickel-plated steel strings, d ≈ 0.25–1.17mm (10-46 gauge)
 *   - Scale length: 648mm (25.5") — Fender standard
 *   - Solid body — negligible acoustic body resonance
 *   - Magnetic pickup resonance replaces body resonance: ~3–6 kHz
 *   - Lower string tension than acoustic due to lighter gauge
 *   - Single-coil pickup: bright, articulate, some 60Hz hum
 */
const ELECTRIC_CLEAN: GuitarVoiceConfig = {
  id: "electric-clean",
  name: "Electric Clean",
  description: "Glassy Stratocaster clean. Bell-like sparkle, single-coil clarity. Mark Knopfler, John Mayer.",
  suggestedFor: ["pop", "rnb", "jazz", "blues", "soul"],

  maxPartials: 8,
  partialRolloff: 0.50,         // bright — magnetic pickup emphasizes harmonics
  partialDecayRate: 0.10,
  partialsPerRegister: [3, 5, 7, 8],

  // Electric — thinner strings, lower tension, less inharmonicity
  inharmonicity: [
    0.00012,   // octave 0
    0.00008,   // octave 1
    0.00005,   // octave 2
    0.00003,   // octave 3
    0.000015,  // octave 4
    0.000008,  // octave 5
    0.000005,  // octave 6
    0.000003,  // octave 7
    0.000002,  // octave 8
  ],

  pluckPosition: 0.16,         // between pickups — Strat position 4
  pluckNoiseDuration: 5,       // pick on light gauge — crisp
  pluckNoiseAmount: 0.12,
  pluckNoiseQRange: [0.8, 2.0],

  attackRange: [0.0005, 0.002], // very fast — electric strings
  decayBase: 5.0,               // electric sustains longer (no body loss)
  decayRange: 8.0,              // solid body retains energy
  decayPartialExponent: 0.65,   // moderate — pickup captures all harmonics
  releaseTime: 0.04,            // fast mute

  bodyResonanceFreq: 3500,      // pickup resonance, not body
  bodyResonanceQ: 2.0,          // broad, subtle
  bodyResonanceGain: 2,         // mild — solid body
  bodySecondaryFreq: 0,         // no secondary (solid body)
  bodySecondaryQ: 0,
  bodySecondaryGain: 0,

  detuneSpread: 2.0,
  stereoWidth: 0.45,            // moderate stereo image
  oddHarmonicBoost: 1.10,
  voiceGain: 0.28,
  masterGain: 0.85,

  brightnessBase: 0.12,         // bright at all velocities
  brightnessSlope: 0.06,
};

/**
 * Electric Guitar — Jazz Tone.
 *
 * Modeled after a Gibson ES-175 / L-5 with humbucker in neck position,
 * through a warm tube amp (Polytone Mini-Brute style). Dark, round,
 * fundamentals-heavy tone with rolled-off treble.
 *
 * Physical basis:
 *   - Flatwound strings: less harmonic content, smoother feel
 *   - Scale length: 629mm (24.75") — Gibson standard
 *   - Semi-hollow or hollow body — mild acoustic resonance
 *   - Humbucker pickup: warmer, less treble than single-coil
 *   - Higher action + heavier gauge = more sustain
 */
const ELECTRIC_JAZZ: GuitarVoiceConfig = {
  id: "electric-jazz",
  name: "Electric Jazz",
  description: "Dark, round, mellow. Gibson archtop + humbucker in neck position. Joe Pass, Wes Montgomery, Jim Hall.",
  suggestedFor: ["jazz", "soul", "film", "new-age"],

  maxPartials: 6,
  partialRolloff: 1.1,          // dark — heavy rolloff, fundamental dominates
  partialDecayRate: 0.18,       // upper partials suppressed
  partialsPerRegister: [2, 4, 5, 6],

  // Flatwound on hollow body — moderate inharmonicity
  inharmonicity: [
    0.00010,
    0.00007,
    0.00004,
    0.00002,
    0.000012,
    0.000006,
    0.000004,
    0.000002,
    0.000001,
  ],

  pluckPosition: 0.25,         // near neck pickup — dark, warm
  pluckNoiseDuration: 8,       // thumb or flatwound pick — soft
  pluckNoiseAmount: 0.06,      // very little attack noise
  pluckNoiseQRange: [2.0, 3.5],

  attackRange: [0.001, 0.004],  // slightly slower — flatwound feel
  decayBase: 5.5,               // flatwound sustains well
  decayRange: 7.0,
  decayPartialExponent: 1.1,    // upper partials decay very fast — dark, pure tone
  releaseTime: 0.06,

  bodyResonanceFreq: 250,       // hollow body resonance
  bodyResonanceQ: 3.5,
  bodyResonanceGain: 5,
  bodySecondaryFreq: 180,       // archtop body mode
  bodySecondaryQ: 2.5,
  bodySecondaryGain: 3,

  detuneSpread: 1.0,            // flatwound — very stable intonation
  stereoWidth: 0.15,            // jazz = mono, intimate
  oddHarmonicBoost: 1.05,       // minimal — flatwound reduces odd harmonics
  voiceGain: 0.30,
  masterGain: 0.82,

  brightnessBase: 0.50,         // very dark at all velocities (tone rolled off)
  brightnessSlope: 0.20,
};

// ─── Registry ───────────────────────────────────────────────────────────────

export const GUITAR_VOICES: Record<GuitarVoiceId, GuitarVoiceConfig> = {
  "classical-nylon": CLASSICAL_NYLON,
  "steel-dreadnought": STEEL_DREADNOUGHT,
  "electric-clean": ELECTRIC_CLEAN,
  "electric-jazz": ELECTRIC_JAZZ,
};

// ─── Tuning Parameter Definitions ───────────────────────────────────────────

export interface GuitarTuningParam {
  key: string;
  configKey: string;
  min: number;
  max: number;
  description: string;
  isArrayIndex?: number;
}

export const GUITAR_TUNING_PARAMS: GuitarTuningParam[] = [
  { key: "pluck-position",    configKey: "pluckPosition",       min: 0.05, max: 0.50, description: "Pluck position (0=bridge, 0.5=middle). Affects harmonic content." },
  { key: "pluck-noise",       configKey: "pluckNoiseAmount",    min: 0,    max: 0.5,  description: "Pluck attack noise intensity (0=none)" },
  { key: "brightness",        configKey: "brightnessBase",      min: 0.05, max: 0.5,  description: "Brightness at moderate velocity (lower=brighter)" },
  { key: "brightness-slope",  configKey: "brightnessSlope",     min: 0.03, max: 0.2,  description: "Velocity sensitivity for upper partials" },
  { key: "decay",             configKey: "decayBase",           min: 0.5,  max: 10,   description: "Sustain length (treble end, seconds)" },
  { key: "bass-decay",        configKey: "decayRange",          min: 1,    max: 15,   description: "Additional sustain for bass strings (seconds)" },
  { key: "body-freq",         configKey: "bodyResonanceFreq",   min: 60,   max: 8000, description: "Body resonance frequency (Hz)" },
  { key: "body-q",            configKey: "bodyResonanceQ",      min: 0.5,  max: 12,   description: "Body resonance Q factor" },
  { key: "body-gain",         configKey: "bodyResonanceGain",   min: 0,    max: 15,   description: "Body resonance boost (dB)" },
  { key: "odd-boost",         configKey: "oddHarmonicBoost",    min: 1.0,  max: 2.0,  description: "Odd harmonic emphasis (1.0=neutral)" },
  { key: "detune",            configKey: "detuneSpread",        min: 0,    max: 15,   description: "Intonation spread in cents" },
  { key: "stereo",            configKey: "stereoWidth",         min: 0,    max: 1,    description: "Stereo width (0=mono, 1=full)" },
  { key: "volume",            configKey: "voiceGain",           min: 0.05, max: 0.5,  description: "Per-voice volume" },
  { key: "release",           configKey: "releaseTime",         min: 0.01, max: 0.3,  description: "Mute speed (seconds)" },
  { key: "rolloff",           configKey: "partialRolloff",      min: 0.3,  max: 1.5,  description: "Harmonic darkness (higher=darker)" },
  { key: "attack-fast",       configKey: "attackRange",         min: 0.0002, max: 0.005, description: "Fastest attack (ff, seconds)", isArrayIndex: 0 },
  { key: "attack-slow",       configKey: "attackRange",         min: 0.001,  max: 0.01,  description: "Slowest attack (pp, seconds)", isArrayIndex: 1 },
];

// ─── User Tuning Persistence ────────────────────────────────────────────────

export type GuitarUserTuning = Record<string, number>;

function guitarTuningDir(): string {
  const dir = join(homedir(), ".ai-jam-sessions", "guitars");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function guitarTuningPath(voiceId: string): string {
  return join(guitarTuningDir(), `${voiceId}.json`);
}

export function loadGuitarUserTuning(voiceId: string): GuitarUserTuning {
  const p = guitarTuningPath(voiceId);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

export function saveGuitarUserTuning(voiceId: string, overrides: GuitarUserTuning): void {
  const existing = loadGuitarUserTuning(voiceId);
  const merged = { ...existing, ...overrides };
  writeFileSync(guitarTuningPath(voiceId), JSON.stringify(merged, null, 2), "utf-8");
}

export function resetGuitarUserTuning(voiceId: string): void {
  const p = guitarTuningPath(voiceId);
  if (existsSync(p)) unlinkSync(p);
}

function applyGuitarTuning(base: GuitarVoiceConfig, tuning: GuitarUserTuning): GuitarVoiceConfig {
  const config = {
    ...base,
    attackRange: [...base.attackRange] as [number, number],
    pluckNoiseQRange: [...base.pluckNoiseQRange] as [number, number],
  };

  for (const [key, value] of Object.entries(tuning)) {
    const param = GUITAR_TUNING_PARAMS.find(p => p.key === key);
    if (!param) continue;
    const clamped = Math.max(param.min, Math.min(param.max, value));
    if (param.isArrayIndex !== undefined) {
      (config as unknown as Record<string, unknown>)[param.configKey] =
        (config as unknown as Record<string, number[]>)[param.configKey].slice();
      ((config as unknown as Record<string, number[]>)[param.configKey])[param.isArrayIndex] = clamped;
    } else {
      (config as unknown as Record<string, number>)[param.configKey] = clamped;
    }
  }

  return config;
}

export function getMergedGuitarVoice(id: string): GuitarVoiceConfig | undefined {
  const base = GUITAR_VOICES[id as GuitarVoiceId];
  if (!base) return undefined;
  const tuning = loadGuitarUserTuning(id);
  if (Object.keys(tuning).length === 0) return base;
  return applyGuitarTuning(base, tuning);
}

// ─── Lookup Functions ───────────────────────────────────────────────────────

export function getGuitarVoice(id: string): GuitarVoiceConfig | undefined {
  return GUITAR_VOICES[id as GuitarVoiceId];
}

export function listGuitarVoices(): GuitarVoiceConfig[] {
  return Object.values(GUITAR_VOICES);
}

export function suggestGuitarVoice(genre: string): GuitarVoiceId {
  const map: Record<string, GuitarVoiceId> = {
    classical: "classical-nylon",
    jazz: "electric-jazz",
    pop: "electric-clean",
    blues: "electric-clean",
    rock: "steel-dreadnought",
    rnb: "electric-clean",
    latin: "classical-nylon",
    film: "classical-nylon",
    ragtime: "steel-dreadnought",
    "new-age": "classical-nylon",
    folk: "steel-dreadnought",
    soul: "electric-jazz",
  };
  return map[genre] ?? "steel-dreadnought";
}
