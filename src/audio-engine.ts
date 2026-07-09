// ─── ai-jam-sessions: Built-in Piano Engine ─────────────────────────────────
//
// Quality multi-harmonic piano synthesis using node-web-audio-api.
// No external software required — npm install gives you everything.
//
// Piano model features:
//   - Configurable sine partials per voice with inharmonic frequency stretching
//   - Per-partial amplitude envelopes (higher harmonics decay faster)
//   - Velocity-dependent timbre (harder = brighter, more harmonics)
//   - Hammer noise transient (bandpass-filtered noise burst on attack)
//   - Duplex stringing simulation (subtle random detuning per partial)
//   - Stereo imaging (low notes left, high notes right)
//   - DynamicsCompressor for polyphony safety
//   - 48-voice polyphony with LRU voice stealing
//
// Keyboard voices:
//   - grand      — Concert Grand (default). Rich, full, wide stereo.
//   - upright    — Upright Piano. Warm, short sustain, more hammer.
//   - electric   — Electric Piano. Clean, bell-like, chorus shimmer.
//   - honkytonk  — Honky-Tonk. Jangly detuning, bright, punchy.
//   - musicbox   — Music Box. Crystal pure, long sustain, delicate.
//   - bright     — Bright Grand. Sparkly, present, cuts through.
//
// Usage:
//   const piano = createAudioEngine();             // Concert Grand (default)
//   const piano = createAudioEngine("honkytonk");  // Honky-Tonk
//   await piano.connect();
//   piano.noteOn(60, 100);   // middle C, forte
//   piano.noteOff(60);
//   await piano.disconnect();
// ─────────────────────────────────────────────────────────────────────────────

import type { VmpkConnector, MidiStatus, MidiNote } from "./types.js";
import { getMergedVoice, type PianoVoiceId, type PianoVoiceConfig } from "./piano-voices.js";
import { JamError } from "./errors.js";

// ─── Lazy Import ────────────────────────────────────────────────────────────
// Don't load the native binary until the engine is actually used.

let _AudioContext: any = null;

async function loadAudioContext(): Promise<any> {
  if (!_AudioContext) {
    const mod = await import("node-web-audio-api");
    _AudioContext = mod.AudioContext;
  }
  return _AudioContext;
}

// ─── Piano Physics ──────────────────────────────────────────────────────────

/** Maximum simultaneous voices before stealing. */
const MAX_POLYPHONY = 48;

/**
 * Maximum simultaneous voices for a single pitch. A queue (not a single
 * slot) so a same-pitch noteOn/noteOff pair can overlap another same-pitch
 * pair — realistic for two-hand unison notes or a fast retrigger/trill
 * where the next attack starts before the previous release timer fires
 * (F-c1eab2d2). Bounded at 2 (not unbounded) so live key-mashing on one
 * note still feels like a retrigger rather than an unbounded pileup — a
 * full per-instance-token model (threading an id through the VmpkConnector
 * interface) would remove this cap entirely but was judged too invasive
 * for this fix; see noteOn/noteOff below for the documented tradeoff.
 */
const MAX_VOICES_PER_NOTE = 2;

/** MIDI note → frequency (A4 = 440 Hz). */
function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/** MIDI note → octave (0–8). */
function midiToOctave(note: number): number {
  return Math.max(0, Math.min(8, Math.floor(note / 12) - 1));
}

/**
 * Stereo pan: low notes left, high notes right.
 * Mimics sitting at a piano — bass on the left, treble on the right.
 * Width parameter scales the range (0 = mono, 1 = full spread).
 */
function noteToPan(note: number, stereoWidth: number): number {
  const raw = ((note - 21) / 87) * 1.4 - 0.7;
  const scaled = raw * stereoWidth;
  return Math.max(-0.7, Math.min(0.7, scaled));
}

/** Compute stretched partial frequency with inharmonicity. */
function partialFreq(fundamental: number, n: number, B: number): number {
  return n * fundamental * Math.sqrt(1 + B * n * n);
}

/**
 * How many partials to use for this note.
 * Bass notes have richer harmonic content; treble is simpler.
 */
function partialsForNote(midiNote: number, voice: PianoVoiceConfig): number {
  const [highTreble, upperReg, midReg, bass] = voice.partialsPerRegister;
  if (midiNote > 90) return highTreble;
  if (midiNote > 72) return upperReg;
  if (midiNote > 54) return midReg;
  return bass;
}

/**
 * Amplitude for the nth partial (1-based).
 *
 * Base amplitude follows ~1/n^rolloff with exponential rolloff.
 * Velocity controls brightness: soft = warm, hard = bright.
 */
function partialAmplitude(n: number, velocity01: number, voice: PianoVoiceConfig): number {
  const base = Math.pow(n, -voice.partialRolloff) * Math.exp(-voice.partialDecayRate * n);

  // Velocity-dependent brightness: high partials only appear at higher velocity
  if (n <= 3) return base;
  const brightnessGate = Math.pow(
    velocity01,
    voice.brightnessBase + (n - 3) * voice.brightnessSlope
  );
  return base * brightnessGate;
}

/**
 * Decay time constant (seconds) for the nth partial at a given MIDI note.
 *
 * Higher partials decay much faster than the fundamental.
 * Lower notes ring longer than higher notes.
 */
function partialDecayTime(n: number, midiNote: number, voice: PianoVoiceConfig): number {
  // Base decay for fundamental: decayBase (treble) to decayBase+decayRange (bass)
  const registerFactor = 1.0 - (midiNote - 21) / 87;
  const baseFundamental = voice.decayBase + registerFactor * voice.decayRange;
  // Higher partials: decay ∝ 1/n^exponent
  return baseFundamental * Math.pow(n, -voice.decayPartialExponent);
}

/**
 * Attack time based on velocity.
 * Harder strikes = shorter hammer pulse = sharper attack.
 */
function attackTime(velocity01: number, voice: PianoVoiceConfig): number {
  const [ff, pp] = voice.attackRange;
  return ff + (1 - velocity01) * (pp - ff);
}

// ─── Voice ──────────────────────────────────────────────────────────────────

interface Voice {
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

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Create the built-in piano engine.
 *
 * Implements VmpkConnector so it's a drop-in replacement anywhere
 * the codebase uses a connector (sessions, CLI, MCP server).
 *
 * @param voiceId — Piano voice preset. Default: "grand" (Concert Grand).
 */
export function createAudioEngine(voiceId?: PianoVoiceId): VmpkConnector {
  const voice = getMergedVoice(voiceId ?? "grand") ?? getMergedVoice("grand")!;

  let ctx: any = null;
  let currentStatus: MidiStatus = "disconnected";
  let compressor: any = null;
  let master: any = null;
  // FIFO queue per note (not a single Voice) — see MAX_VOICES_PER_NOTE.
  const activeVoices = new Map<number, Voice[]>();
  const voiceOrder: Voice[] = []; // Global LRU across all voice instances, oldest first

  // ── Noise buffer (shared across all voices) ──
  let hammerNoiseBuffer: any = null;

  function ensureConnected(): void {
    if (!ctx || currentStatus !== "connected") {
      throw new Error("Piano engine not connected");
    }
  }

  /** Create a reusable noise buffer for hammer transients. */
  function createHammerNoiseBuffer(): void {
    if (voice.hammerNoiseAmount <= 0 || voice.hammerNoiseDuration <= 0) return;

    const durationMs = voice.hammerNoiseDuration;
    const length = Math.ceil((durationMs / 1000) * ctx.sampleRate);
    hammerNoiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    hammerNoiseBuffer.copyToChannel(data, 0);
  }

  /** Synthesize a single piano voice. */
  function createVoice(note: number, velocity: number): Voice {
    const velocity01 = Math.max(0.01, Math.min(1.0, velocity / 127));
    const freq = midiToFreq(note);
    const octave = midiToOctave(note);
    const B = voice.inharmonicity[octave] ?? 0.000003;
    const now = ctx.currentTime;
    const attack = attackTime(velocity01, voice);
    const numPartials = partialsForNote(note, voice);

    // ── Master gain: constant volume (per-partial gains shape the envelope) ──
    const voiceMaster = ctx.createGain();
    voiceMaster.gain.value = velocity01 * voice.voiceGain;

    // ── Stereo panner ──
    const panner = ctx.createStereoPanner();
    panner.pan.value = noteToPan(note, voice.stereoWidth);
    voiceMaster.connect(panner);
    panner.connect(compressor);

    // ── Sine partials with per-partial envelopes ──
    const oscillators: any[] = [];
    const partialGains: any[] = [];

    for (let n = 1; n <= numPartials; n++) {
      const pFreq = partialFreq(freq, n, B);
      if (pFreq > 18000) break; // Near hearing limit

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = pFreq;

      // Duplex stringing: random detuning for warmth (spread/2 = ± cents)
      osc.detune.value = (Math.random() - 0.5) * voice.detuneSpread;

      const gain = ctx.createGain();
      const amp = partialAmplitude(n, velocity01, voice);
      const decay = partialDecayTime(n, note, voice);

      // Envelope: silence → attack → exponential decay
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(amp, now + attack);
      // Exponential decay toward near-zero
      gain.gain.setTargetAtTime(0.0001, now + attack, decay);

      osc.connect(gain);
      gain.connect(voiceMaster);
      osc.start(now);

      oscillators.push(osc);
      partialGains.push(gain);
    }

    // ── Hammer noise transient ──
    let noiseSource: any = null;
    if (hammerNoiseBuffer && voice.hammerNoiseAmount > 0) {
      noiseSource = ctx.createBufferSource();
      noiseSource.buffer = hammerNoiseBuffer;

      // Bandpass near note frequency — gives the attack a tonal character
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = Math.min(freq * 2.5, 10000);
      const [baseQ, velQ] = voice.hammerNoiseQRange;
      noiseFilter.Q.value = baseQ + velocity01 * velQ;

      // Quick envelope: burst then silence
      const noiseGain = ctx.createGain();
      const noiseAmp = velocity01 * voice.hammerNoiseAmount;
      noiseGain.gain.setValueAtTime(noiseAmp, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

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

  /** Release a voice (damper engages — fast fade out). */
  function releaseVoice(v: Voice): void {
    if (v.released) return;
    v.released = true;

    const now = ctx.currentTime;
    const releaseTime = voice.releaseTime;

    // Cancel ongoing scheduled values and fade to silence
    for (const g of v.partialGains) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + releaseTime);
    }

    // Schedule full cleanup after release completes
    v.cleanupTimer = setTimeout(() => killVoice(v), (releaseTime + 0.05) * 1000);
  }

  /**
   * Stop a voice for an involuntary reason (voice stealing at max
   * polyphony, or per-note overlap eviction) with a very short gain ramp
   * instead of killVoice's instant full-amplitude stop — avoids an
   * audible click/pop (F-637edb02).
   */
  function fadeAndKillVoice(v: Voice, fadeSeconds = 0.008): void {
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
      // ctx unavailable or node already stopped — fall back to an
      // immediate stop rather than leaking the voice.
      killVoice(v);
    }
  }

  /** Immediately destroy a voice and free resources. */
  function killVoice(v: Voice): void {
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
  function removeFromNoteQueue(v: Voice): void {
    const queue = activeVoices.get(v.note);
    if (!queue) return;
    const idx = queue.indexOf(v);
    if (idx >= 0) queue.splice(idx, 1);
    if (queue.length === 0) activeVoices.delete(v.note);
  }

  /** Remove a specific voice instance from the global LRU order. */
  function removeFromOrder(v: Voice): void {
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

        // Master chain: compressor → gain → speakers
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

        // Pre-generate shared noise buffer
        createHammerNoiseBuffer();

        currentStatus = "connected";
        console.error(`Piano engine connected (${voice.name})`);
      } catch (err) {
        // Clean up partial resources so connect() can be retried
        try { if (ctx) ctx.close(); } catch { /* ok */ }
        ctx = null as any;
        compressor = null as any;
        master = null as any;
        currentStatus = "disconnected";
        throw new JamError({
          code: 'RUNTIME_ENGINE',
          message: `Failed to start piano engine: ${err instanceof Error ? err.message : String(err)}`,
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
        master = null;
        hammerNoiseBuffer = null;
      }
      currentStatus = "disconnected";
    },

    status(): MidiStatus {
      return currentStatus;
    },

    listPorts(): string[] {
      return [`Built-in Piano (${voice.name})`];
    },

    noteOn(note: number, velocity: number, channel?: number): void {
      ensureConnected();

      // Reject non-finite input before anything else — unlike
      // guitar/sample/vocal engines, this engine previously had no range
      // check at all, so an out-of-range or non-finite note/velocity fed
      // straight into midiToFreq/partialFreq/noteToPan, setting native
      // AudioNode params to NaN/Infinity (F-e1e48adf). Math.max/min alone
      // would not have been sufficient — NaN in produces NaN out — hence
      // the explicit Number.isFinite guard before clamping (F-af5c8733).
      if (!Number.isFinite(note) || !Number.isFinite(velocity)) return;
      note = Math.max(0, Math.min(127, Math.round(note)));
      velocity = Math.max(1, Math.min(127, Math.round(velocity)));

      // Bounded overlap instead of an unconditional kill: a same-pitch
      // noteOn/noteOff pair can legitimately overlap another same-pitch
      // pair (unison / fast retrigger / trill), and hard-killing on every
      // retrigger broke that pairing (F-c1eab2d2 — see noteOff below).
      // Only once a pitch already has MAX_VOICES_PER_NOTE voices ringing
      // do we hard-kill the oldest, so rapid live key-mashing still feels
      // bounded rather than piling up indefinitely.
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

    noteOff(note: number, channel?: number): void {
      if (!ctx || currentStatus !== "connected") return;
      if (!Number.isFinite(note)) return;
      // Match noteOn's clamp/round exactly — activeVoices is keyed by the
      // clamped value noteOn actually stored, so an out-of-range or
      // fractional note here must resolve to the same key or the voice
      // would never receive its noteOff (a stuck note).
      note = Math.max(0, Math.min(127, Math.round(note)));

      // FIFO pairing: release the OLDEST still-active voice for this
      // pitch, not "whatever's in a single slot." Matches the
      // noteOn/noteOff stack pairing already used in
      // songs/midi/ingest.ts and midi/parser.ts for the same reason — a
      // single-slot map let a noteOff meant for an already-superseded
      // voice wrongly cut off a newer, unrelated voice at the same pitch.
      const queue = activeVoices.get(note);
      if (queue && queue.length > 0) {
        const v = queue.shift()!;
        if (queue.length === 0) activeVoices.delete(note);
        releaseVoice(v);
        removeFromOrder(v);
      }
    },

    allNotesOff(channel?: number): void {
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
