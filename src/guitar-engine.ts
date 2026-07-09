// ─── ai-jam-sessions: Built-in Guitar Engine ─────────────────────────────────
//
// Physically-modeled guitar synthesis using additive partials with
// pluck-position harmonic shaping, body resonance, and
// frequency-dependent string damping via node-web-audio-api.
//
// No external software required — npm install gives you everything.
//
// Guitar model features:
//   - Additive synthesis with pluck-position harmonic suppression
//     (amplitude of partial n ∝ sin(n·π·p) where p = pluck position)
//   - Inharmonic frequency stretching per string register
//   - Velocity-dependent timbre (harder pluck = brighter, more partials)
//   - Pluck noise transient (bandpass noise burst shaped by pick/finger)
//   - Guitar body resonance (Helmholtz + top plate modes via BiquadFilters)
//   - Odd harmonic emphasis (asymmetric pluck excitation)
//   - Frequency-dependent damping (upper partials decay faster)
//   - Random micro-detuning per partial (string imperfections)
//   - Configurable tuning systems and A4 reference pitch (415–466 Hz)
//   - 12-voice polyphony with LRU voice stealing
//   - DynamicsCompressor for polyphony safety
//
// Guitar voices:
//   - classical-nylon   — Nylon strings, warm, fingerstyle. Segovia.
//   - steel-dreadnought — Phosphor bronze on dreadnought. Strumming.
//   - electric-clean    — Strat clean tone. Glass, sparkle.
//   - electric-jazz     — Gibson archtop, dark neck humbucker. Joe Pass.
//
// Usage:
//   const guitar = createGuitarEngine();                        // Steel Dreadnought
//   const guitar = createGuitarEngine({ voice: "electric-jazz" });
//   await guitar.connect();
//   guitar.noteOn(40, 100);   // low E, forte
//   guitar.noteOff(40);
//   await guitar.disconnect();
// ─────────────────────────────────────────────────────────────────────────────

import type { VmpkConnector, MidiStatus, MidiNote } from "./types.js";
import {
  getMergedGuitarVoice,
  type GuitarVoiceId,
  type GuitarVoiceConfig,
} from "./guitar-voices.js";
import { JamError } from "./errors.js";

// ─── Lazy Import ────────────────────────────────────────────────────────────

let _AudioContext: any = null;

async function loadAudioContext(): Promise<any> {
  if (!_AudioContext) {
    const mod = await import("node-web-audio-api");
    _AudioContext = mod.AudioContext;
  }
  return _AudioContext;
}

// ─── Guitar Physics ─────────────────────────────────────────────────────────

/**
 * Maximum simultaneous voices before stealing.
 * 12 voices covers 6 strings with retrigger overlap (old voice
 * fading while new one attacks). Sufficient for all guitar playing
 * styles including rapid arpeggios and chord strums.
 */
const MAX_POLYPHONY = 12;

/**
 * Maximum simultaneous voices for a single pitch — see audio-engine.ts's
 * identical constant for the full rationale (F-c1eab2d2). Bounded overlap
 * lets a same-pitch noteOn/noteOff pair overlap another same-pitch pair
 * (unison / fast retrigger) without an unbounded pileup on live mashing.
 */
const MAX_VOICES_PER_NOTE = 2;

/**
 * MIDI note → frequency using configurable A4 reference.
 * Default A4=440 Hz (ISO 16). Baroque pitch A4=415 Hz.
 * Modern bright pitch A4=444–446 Hz.
 */
function midiToFreq(note: number, a4: number = 440): number {
  return a4 * Math.pow(2, (note - 69) / 12);
}

/** MIDI note → octave (0–8). */
function midiToOctave(note: number): number {
  return Math.max(0, Math.min(8, Math.floor(note / 12) - 1));
}

/**
 * Stereo pan for guitar.
 * Unlike piano (bass-left, treble-right), guitar stereo is subtle
 * position offset. We use a gentle randomized spread centered on 0,
 * scaled by the voice's stereoWidth parameter.
 */
function noteToPan(note: number, stereoWidth: number): number {
  // Use note as pseudo-random seed for consistent per-note position
  const hash = Math.sin(note * 1237.17) * 0.5;
  return Math.max(-0.5, Math.min(0.5, hash * stereoWidth));
}

/**
 * Compute stretched partial frequency with inharmonicity.
 *
 * f_n = n × f_0 × √(1 + B × n²)
 *
 * where B is the inharmonicity coefficient derived from string stiffness:
 *   B = π³ · E · d⁴ / (64 · T · L²)
 *   E = Young's modulus, d = diameter, T = tension, L = vibrating length
 */
function partialFreq(fundamental: number, n: number, B: number): number {
  return n * fundamental * Math.sqrt(1 + B * n * n);
}

/**
 * How many partials to use for this note.
 * Higher notes need fewer partials (Nyquist limit + thinning treble).
 */
function partialsForNote(midiNote: number, voice: GuitarVoiceConfig): number {
  const [highTreble, upperReg, midReg, bass] = voice.partialsPerRegister;
  if (midiNote > 78) return highTreble;
  if (midiNote > 66) return upperReg;
  if (midiNote > 54) return midReg;
  return bass;
}

/**
 * Amplitude for the nth partial of a plucked string.
 *
 * The physics of plucked strings produces a characteristic harmonic
 * spectrum that depends on the pluck position:
 *
 *   A(n) ∝ sin(n·π·p) / n^rolloff × exp(-decayRate·n)
 *
 * where p is the fractional pluck position along the string.
 * Plucking at position p=1/k completely suppresses the kth harmonic.
 *
 * Additionally, odd harmonics are boosted relative to even ones
 * because pluck excitation is inherently asymmetric (the string
 * is displaced in one direction only).
 *
 * Velocity controls brightness: soft play rolls off high partials.
 */
function partialAmplitude(
  n: number,
  velocity01: number,
  voice: GuitarVoiceConfig,
): number {
  // Pluck position harmonic shaping — the core of guitar timbre
  const pluckFactor = Math.abs(Math.sin(n * Math.PI * voice.pluckPosition));

  // Base rolloff: 1/n^rolloff with exponential taper
  const base =
    Math.pow(n, -voice.partialRolloff) * Math.exp(-voice.partialDecayRate * n);

  // Odd harmonic emphasis from asymmetric pluck excitation
  const oddBoost = n % 2 === 1 ? voice.oddHarmonicBoost : 1.0;

  // Combined amplitude before velocity gating
  const raw = base * pluckFactor * oddBoost;

  // Velocity-dependent brightness: high partials only appear at higher velocity
  if (n <= 2) return raw;
  const brightnessGate = Math.pow(
    velocity01,
    voice.brightnessBase + (n - 2) * voice.brightnessSlope,
  );
  return raw * brightnessGate;
}

/**
 * Decay time constant (seconds) for the nth partial at a given MIDI note.
 *
 * Guitar strings exhibit strong frequency-dependent damping.
 * Upper partials lose energy much faster than the fundamental due to:
 *   - Air resistance (proportional to velocity ∝ frequency)
 *   - Internal friction (material hysteresis)
 *   - Bridge coupling losses (frequency-dependent)
 *
 * Lower notes ring longer than higher notes due to higher stored energy.
 */
function partialDecayTime(
  n: number,
  midiNote: number,
  voice: GuitarVoiceConfig,
): number {
  // Base decay for fundamental: decayBase (treble) to decayBase+decayRange (bass)
  // Guitar range: E2 (40) to E6 (88)
  const registerFactor = Math.max(0, 1.0 - (midiNote - 40) / 48);
  const baseFundamental = voice.decayBase + registerFactor * voice.decayRange;
  // Higher partials: decay ∝ 1/n^exponent
  return baseFundamental * Math.pow(n, -voice.decayPartialExponent);
}

/**
 * Attack time based on velocity.
 * Guitar attacks are extremely fast — flatpick on steel can be < 0.5ms.
 * Fingerstyle on nylon is slightly slower at ~1–5ms.
 */
function attackTime(velocity01: number, voice: GuitarVoiceConfig): number {
  const [ff, pp] = voice.attackRange;
  return ff + (1 - velocity01) * (pp - ff);
}

// ─── Voice ──────────────────────────────────────────────────────────────────

interface GuitarVoice {
  note: number;
  oscillators: any[];
  partialGains: any[];
  masterGain: any;
  panner: any;
  noiseSource: any | null;
  startTime: number;
  released: boolean;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

// ─── Engine Options ─────────────────────────────────────────────────────────

export interface GuitarEngineOptions {
  /** Guitar voice preset ID. Default: "steel-dreadnought". */
  voice?: GuitarVoiceId;

  /**
   * A4 reference frequency in Hz. Default: 440 (ISO 16 concert pitch).
   * Configurable for historical tuning (A4=415 baroque) or
   * modern bright tuning (A4=444).
   * Valid range: 415–466 Hz.
   */
  a4?: number;
}

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Create the built-in guitar engine.
 *
 * Implements VmpkConnector so it's a drop-in replacement anywhere
 * the codebase uses a connector (sessions, CLI, MCP server).
 *
 * @param options — Guitar voice preset and tuning. Default: steel dreadnought, A4=440.
 */
export function createGuitarEngine(options: GuitarEngineOptions = {}): VmpkConnector {
  const voiceId = options.voice ?? "steel-dreadnought";
  const a4 = Math.max(415, Math.min(466, options.a4 ?? 440));
  const voice =
    getMergedGuitarVoice(voiceId) ?? getMergedGuitarVoice("steel-dreadnought")!;

  let ctx: any = null;
  let currentStatus: MidiStatus = "disconnected";
  let compressor: any = null;
  let master: any = null;
  let bodyFilter1: any = null;
  let bodyFilter2: any = null;
  // FIFO queue per note (not a single Voice) — see MAX_VOICES_PER_NOTE.
  const activeVoices = new Map<number, GuitarVoice[]>();
  const voiceOrder: GuitarVoice[] = []; // Global LRU across all voice instances, oldest first

  // ── Noise buffer (shared across all voices) ──
  let pluckNoiseBuffer: any = null;

  function ensureConnected(): void {
    if (!ctx || currentStatus !== "connected") {
      throw new Error("Guitar engine not connected");
    }
  }

  /** Create a reusable noise buffer for pluck transients. */
  function createPluckNoiseBuffer(): void {
    if (voice.pluckNoiseAmount <= 0 || voice.pluckNoiseDuration <= 0) return;

    const length = Math.ceil((voice.pluckNoiseDuration / 1000) * ctx.sampleRate);
    pluckNoiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = new Float32Array(length);

    // Shaped noise: exponentially decaying random samples
    // Models finger/pick sliding across the string surface
    for (let i = 0; i < length; i++) {
      const envelope = Math.exp((-3 * i) / length);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
    pluckNoiseBuffer.copyToChannel(data, 0);
  }

  /** Synthesize a single guitar voice. */
  function createVoice(note: number, velocity: number): GuitarVoice {
    const velocity01 = Math.max(0.01, Math.min(1.0, velocity / 127));
    const freq = midiToFreq(note, a4);
    const octave = midiToOctave(note);
    const B = voice.inharmonicity[octave] ?? 0.000003;
    const now = ctx.currentTime;
    const attack = attackTime(velocity01, voice);
    const numPartials = partialsForNote(note, voice);

    // ── Master gain: velocity-scaled per-voice volume ──
    const voiceMaster = ctx.createGain();
    voiceMaster.gain.value = velocity01 * voice.voiceGain;

    // ── Stereo panner ──
    const panner = ctx.createStereoPanner();
    panner.pan.value = noteToPan(note, voice.stereoWidth);
    voiceMaster.connect(panner);
    panner.connect(compressor);

    // ── Sine partials with pluck-position shaping and per-partial envelopes ──
    const oscillators: any[] = [];
    const partialGains: any[] = [];

    for (let n = 1; n <= numPartials; n++) {
      const pFreq = partialFreq(freq, n, B);
      if (pFreq > 18000) break; // Near hearing limit

      const amp = partialAmplitude(n, velocity01, voice);
      // Skip inaudible partials (pluck position suppression can zero out)
      if (amp < 0.0001) continue;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = pFreq;

      // String imperfection: random micro-detuning per partial
      // Models non-uniform string mass, tension irregularities, wear
      osc.detune.value = (Math.random() - 0.5) * voice.detuneSpread;

      const gain = ctx.createGain();
      const decay = partialDecayTime(n, note, voice);

      // Envelope: silence → fast attack → exponential decay
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(amp, now + attack);
      // Exponential decay toward near-zero (natural string damping)
      gain.gain.setTargetAtTime(0.0001, now + attack, decay);

      osc.connect(gain);
      gain.connect(voiceMaster);
      osc.start(now);

      oscillators.push(osc);
      partialGains.push(gain);
    }

    // ── Pluck noise transient ──
    // Models finger/pick contact: broadband noise burst filtered near
    // the string's fundamental frequency region. This is what gives
    // the "pluck" its percussive character.
    let noiseSource: any = null;
    if (pluckNoiseBuffer && voice.pluckNoiseAmount > 0) {
      noiseSource = ctx.createBufferSource();
      noiseSource.buffer = pluckNoiseBuffer;

      // Bandpass filter centred near the string frequency
      // Pick on steel → wider bandwidth (lower Q)
      // Fingertip on nylon → narrower, more tonal (higher Q)
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = Math.min(freq * 2.0, 10000);
      const [baseQ, velQ] = voice.pluckNoiseQRange;
      noiseFilter.Q.value = baseQ + velocity01 * velQ;

      // Quick envelope: burst then silence
      const noiseGain = ctx.createGain();
      const noiseAmp = velocity01 * voice.pluckNoiseAmount;
      noiseGain.gain.setValueAtTime(noiseAmp, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(voiceMaster);
      noiseSource.start(now);
    }

    return {
      note,
      oscillators,
      partialGains,
      masterGain: voiceMaster,
      panner,
      noiseSource,
      startTime: now,
      released: false,
      cleanupTimer: null,
    };
  }

  /** Release a voice (string muted — fast fade out). */
  function releaseVoice(v: GuitarVoice): void {
    if (v.released) return;
    v.released = true;

    const now = ctx.currentTime;
    const releaseTime = voice.releaseTime;

    // Cancel ongoing decay and fade to silence
    for (const g of v.partialGains) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + releaseTime);
    }

    // Schedule full cleanup after release completes
    v.cleanupTimer = setTimeout(
      () => killVoice(v),
      (releaseTime + 0.05) * 1000,
    );
  }

  /**
   * Stop a voice for an involuntary reason (voice stealing at max
   * polyphony, or per-note overlap eviction) with a very short gain ramp
   * instead of killVoice's instant full-amplitude stop — avoids an
   * audible click/pop (F-637edb02).
   */
  function fadeAndKillVoice(v: GuitarVoice, fadeSeconds = 0.008): void {
    if (v.cleanupTimer) {
      clearTimeout(v.cleanupTimer);
      v.cleanupTimer = null;
    }
    try {
      const now = ctx.currentTime;
      for (const g of v.partialGains) {
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(g.gain.value, now);
        g.gain.linearRampToValueAtTime(0, now + fadeSeconds);
      }
      v.cleanupTimer = setTimeout(() => killVoice(v), (fadeSeconds + 0.02) * 1000);
    } catch {
      killVoice(v);
    }
  }

  /** Immediately destroy a voice and free resources. */
  function killVoice(v: GuitarVoice): void {
    if (v.cleanupTimer) {
      clearTimeout(v.cleanupTimer);
      v.cleanupTimer = null;
    }
    for (const osc of v.oscillators) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        /* already stopped */
      }
    }
    for (const g of v.partialGains) {
      try {
        g.disconnect();
      } catch {
        /* ok */
      }
    }
    if (v.noiseSource) {
      try {
        v.noiseSource.stop();
        v.noiseSource.disconnect();
      } catch {
        /* ok */
      }
    }
    try {
      v.masterGain.disconnect();
    } catch {
      /* ok */
    }
    try {
      v.panner.disconnect();
    } catch {
      /* ok */
    }
  }

  /** Remove a specific voice instance from its note's queue. */
  function removeFromNoteQueue(v: GuitarVoice): void {
    const queue = activeVoices.get(v.note);
    if (!queue) return;
    const idx = queue.indexOf(v);
    if (idx >= 0) queue.splice(idx, 1);
    if (queue.length === 0) activeVoices.delete(v.note);
  }

  /** Remove a specific voice instance from the global LRU order. */
  function removeFromOrder(v: GuitarVoice): void {
    const idx = voiceOrder.indexOf(v);
    if (idx >= 0) voiceOrder.splice(idx, 1);
  }

  /** Steal the oldest voice (across all notes) when at max polyphony. */
  function stealOldest(): void {
    const oldest = voiceOrder.shift();
    if (oldest) {
      fadeAndKillVoice(oldest);
      removeFromNoteQueue(oldest);
    }
  }

  // ── VmpkConnector Implementation ──

  return {
    async connect(): Promise<void> {
      if (currentStatus === "connected") return;
      currentStatus = "connecting";

      try {
        const AC = await loadAudioContext();
        ctx = new AC({ latencyHint: "playback" });

        // ── Audio signal chain ──
        // Guitar voice → compressor → body resonance → master → output
        //
        // Body resonance modeling:
        //   Filter 1 (peaking): Helmholtz resonance of the air cavity/sound hole
        //   Filter 2 (peaking): Top plate (soundboard) primary mode
        // These two resonances define the acoustic character of the guitar body.
        // Electric guitars have minimal body resonance (solid body) — the filters
        // are configured with low gain in those presets.

        compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 10;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.002;
        compressor.release.value = 0.15;

        // Body resonance filter 1: Helmholtz cavity mode
        bodyFilter1 = ctx.createBiquadFilter();
        bodyFilter1.type = "peaking";
        bodyFilter1.frequency.value = voice.bodyResonanceFreq;
        bodyFilter1.Q.value = voice.bodyResonanceQ;
        bodyFilter1.gain.value = voice.bodyResonanceGain;

        // Body resonance filter 2: top plate mode (if enabled)
        if (voice.bodySecondaryFreq > 0) {
          bodyFilter2 = ctx.createBiquadFilter();
          bodyFilter2.type = "peaking";
          bodyFilter2.frequency.value = voice.bodySecondaryFreq;
          bodyFilter2.Q.value = voice.bodySecondaryQ;
          bodyFilter2.gain.value = voice.bodySecondaryGain;
        }

        master = ctx.createGain();
        master.gain.value = voice.masterGain;

        // Wire the chain: compressor → body1 → [body2] → master → output
        if (bodyFilter2) {
          compressor.connect(bodyFilter1);
          bodyFilter1.connect(bodyFilter2);
          bodyFilter2.connect(master);
        } else {
          compressor.connect(bodyFilter1);
          bodyFilter1.connect(master);
        }
        master.connect(ctx.destination);

        // Pre-generate shared noise buffer for pluck transients
        createPluckNoiseBuffer();

        currentStatus = "connected";
        console.error(
          `Guitar engine connected (${voice.name}, A4=${a4} Hz)`,
        );
      } catch (err) {
        // Clean up partial resources so connect() can be retried
        try { if (ctx) ctx.close(); } catch { /* ok */ }
        ctx = null as any;
        compressor = null as any;
        master = null as any;
        currentStatus = "disconnected";
        throw new JamError({
          code: 'RUNTIME_ENGINE',
          message: `Failed to start guitar engine: ${err instanceof Error ? err.message : String(err)}`,
          hint: 'Check that node-web-audio-api is installed and your audio device is not in use by another application',
          cause: err instanceof Error ? err : undefined,
        });
      }
    },

    async disconnect(): Promise<void> {
      // Kill all active voices
      for (const v of voiceOrder) {
        try {
          killVoice(v);
        } catch {
          /* ok */
        }
      }
      activeVoices.clear();
      voiceOrder.length = 0;

      if (ctx) {
        try {
          await ctx.close();
        } catch {
          /* ok */
        }
        ctx = null;
        compressor = null;
        bodyFilter1 = null;
        bodyFilter2 = null;
        master = null;
        pluckNoiseBuffer = null;
      }
      currentStatus = "disconnected";
    },

    status(): MidiStatus {
      return currentStatus;
    },

    listPorts(): string[] {
      return [`Built-in Guitar (${voice.name}, A4=${a4} Hz)`];
    },

    noteOn(note: number, velocity: number, _channel?: number): void {
      ensureConnected();

      // Reject non-finite input before anything else — feeds straight into
      // midiToFreq/partialFreq/noteToPan otherwise, setting native
      // AudioNode params to NaN/Infinity (F-e1e48adf / F-af5c8733).
      if (!Number.isFinite(note) || !Number.isFinite(velocity)) return;
      note = Math.max(0, Math.min(127, Math.round(note)));
      velocity = Math.max(1, Math.min(127, Math.round(velocity)));

      // Bounded overlap instead of an unconditional kill — see
      // MAX_VOICES_PER_NOTE / F-c1eab2d2.
      let queue = activeVoices.get(note);
      if (queue && queue.length >= MAX_VOICES_PER_NOTE) {
        const oldest = queue.shift()!;
        fadeAndKillVoice(oldest);
        removeFromOrder(oldest);
        if (queue.length === 0) activeVoices.delete(note);
      }

      // Voice stealing if at global polyphony capacity
      while (voiceOrder.length >= MAX_POLYPHONY) {
        stealOldest();
      }

      const v = createVoice(note, velocity);
      queue = activeVoices.get(note);
      if (!queue) {
        queue = [];
        activeVoices.set(note, queue);
      }
      queue.push(v);
      voiceOrder.push(v);
    },

    noteOff(note: number, _channel?: number): void {
      if (!ctx || currentStatus !== "connected") return;
      if (!Number.isFinite(note)) return;
      // Match noteOn's clamp/round exactly so an out-of-range or
      // fractional note resolves to the same map key noteOn stored it
      // under — otherwise the voice never receives its noteOff.
      note = Math.max(0, Math.min(127, Math.round(note)));

      // FIFO pairing — release the OLDEST still-active voice for this
      // pitch, not "whatever's in a single slot" (F-c1eab2d2).
      const queue = activeVoices.get(note);
      if (queue && queue.length > 0) {
        const v = queue.shift()!;
        if (queue.length === 0) activeVoices.delete(note);
        releaseVoice(v);
        removeFromOrder(v);
      }
    },

    allNotesOff(_channel?: number): void {
      if (!ctx) return;
      for (const v of voiceOrder) {
        killVoice(v);
      }
      activeVoices.clear();
      voiceOrder.length = 0;
    },

    async playNote(midiNote: MidiNote): Promise<void> {
      if (midiNote.note < 0) {
        // Rest — just wait
        await sleep(midiNote.durationMs);
        return;
      }
      this.noteOn(midiNote.note, midiNote.velocity, midiNote.channel);
      await sleep(midiNote.durationMs);
      this.noteOff(midiNote.note, midiNote.channel);
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
