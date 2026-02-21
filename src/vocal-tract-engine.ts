// ─── pianoai: Vocal Tract Engine ──────────────────────────────────────────────
//
// Real-time vocal tract synthesis using Pink Trombone (chdh/pink-trombone-mod).
// Unlike vocal-engine.ts (sample playback), this is a physical model:
//   - LF (Liljencrants-Fant) glottal waveform as excitation source
//   - 1D digital waveguide vocal tract (44 cells + 28 nose cells)
//   - Tongue/diameter parameters shape vowels
//
// Monophonic by nature (one vocal tract = one voice). Melody priority:
// tracks all held notes, always sounds the highest one (soprano line).
// Pitch changes via glottis.targetFrequency with built-in smoothing (legato).
//
// Audio path:
//   Pink Trombone DSP (48kHz) → ScriptProcessorNode → compressor → master → speakers
//
// Usage:
//   const voice = createTractEngine();
//   await voice.connect();
//   voice.noteOn(60, 100);     // middle C — sung "aah"
//   voice.noteOff(60);         // fade out
//   await voice.disconnect();
// ─────────────────────────────────────────────────────────────────────────────

import type { VmpkConnector, MidiStatus, MidiNote } from "./types.js";
import { Synthesizer } from "./vendor/pink-trombone.js";

// ─── Voice Presets ────────────────────────────────────────────────────────

/** Voice character preset ID. */
export type TractVoiceId = "soprano" | "alto" | "tenor" | "bass";

export const TRACT_VOICE_IDS: TractVoiceId[] = ["soprano", "alto", "tenor", "bass"];

interface VoicePreset {
  tractLength: number;   // waveguide cells (44=female ~14cm, 54=male ~17cm)
  transpose: number;     // semitones to shift into natural vocal range
  tenseness: number;     // glottal tenseness (0=breathy, 1=pressed)
  tongueIndex: number;   // tract position (lower=back, higher=front)
  tongueDiameter: number; // tract openness (higher=more open)
  vibratoAmount: number; // pitch vibrato depth
  vibratoFrequency: number; // vibrato rate in Hz
  velumTarget: number;   // nasal coupling (0.01=closed, 0.4=nasal)
  masterGain: number;    // output level compensation
}

/**
 * Voice presets shaped by tenseness, tract geometry, and vibrato.
 *
 * Pink Trombone doesn't have a "gender" knob — the actual pitch comes
 * from MIDI. These presets shape the *timbre*: how open/breathy/nasal
 * the tract sounds, independent of pitch.
 *
 * Tongue index: 12 = back vowel (ɑ), 20 = mid (ə), 30 = front (i)
 * Tongue diameter: 1.5 = narrow, 2.5 = open, 3.5 = wide open
 * Tenseness: 0.3 = breathy, 0.6 = normal, 0.9 = pressed/bright
 */
// Pink Trombone default n=44 = adult male tract (~17cm).
// Shorter = female/child. Don't go above 44-46 (unrealistic).
// Source: Modular-Pink-Trombone docs, acoustic phonetics literature.
// Male vocal tract ~17cm, female ~14cm ≈ 38 cells.
const VOICE_PRESETS: Record<TractVoiceId, VoicePreset> = {
  soprano: {
    tractLength: 36,      // short female tract (~14cm)
    transpose: 0,         // C4–C6 — sing at written pitch
    tenseness: 0.7,       // bright, head voice
    tongueIndex: 22,      // mid-front (clear "ah")
    tongueDiameter: 2.2,  // slightly narrow (focused)
    vibratoAmount: 0.006,
    vibratoFrequency: 5.8,
    velumTarget: 0.01,    // closed (pure oral)
    masterGain: 2.5,
  },
  alto: {
    tractLength: 38,      // female tract (~15cm)
    transpose: 0,         // F3–F5 — no shift for alto range songs
    tenseness: 0.55,      // warmer, more relaxed
    tongueIndex: 18,      // mid-back (darker vowel)
    tongueDiameter: 2.5,  // more open
    vibratoAmount: 0.005,
    vibratoFrequency: 5.5,
    velumTarget: 0.05,    // hint of nasal warmth
    masterGain: 2.8,
  },
  tenor: {
    tractLength: 44,      // adult male tract (~17cm) — the Pink Trombone default
    transpose: -12,       // down 1 octave into male range
    tenseness: 0.6,       // clear, solid tone (not breathy)
    tongueIndex: 16,      // back vowel (darker)
    tongueDiameter: 2.8,  // wide open tract
    vibratoAmount: 0.005,
    vibratoFrequency: 5.0,
    velumTarget: 0.08,    // mild nasal resonance
    masterGain: 3.0,
  },
  // Bass: modeled on Onyx-like characteristics (voicerankings.com)
  // F0=98Hz, vocal fry 0.37, minimal breathiness, calm/resonant
  bass: {
    tractLength: 44,      // standard adult male tract
    transpose: -24,       // down 2 octaves — deep male register
    tenseness: 0.6,       // clear, NOT breathy (Onyx = solid tone)
    tongueIndex: 13,      // deep back vowel ("aah")
    tongueDiameter: 2.8,  // open but not maximally
    vibratoAmount: 0.003, // subtle vibrato
    vibratoFrequency: 4.5,
    velumTarget: 0.04,    // mostly closed (clear, not nasal)
    masterGain: 3.5,
  },
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TractEngineOptions {
  /** Voice preset: "soprano", "alto", "tenor", "bass". Default: "soprano". */
  voice?: TractVoiceId;
  /** Maximum intensity for velocity=127. Default: 1.0. */
  maxIntensity?: number;
  /** Enable natural vibrato from Pink Trombone. Default: true. */
  vibrato?: boolean;
  /** Enable Pink Trombone's auto wobble (pitch drift). Default: false. */
  autoWobble?: boolean;
  /** Tongue index override (0–44). Overrides voice preset if set. */
  tongueIndex?: number;
  /** Tongue diameter override (0–3.5). Overrides voice preset if set. */
  tongueDiameter?: number;
  /** Tract length in waveguide cells. 44=female, 50=tenor, 56=bass. Overrides voice preset if set. */
  tractLength?: number;
  /** If true, log note events to debugLog. Default: false. */
  debug?: boolean;
}

export interface TractNoteEvent {
  type: "on" | "off";
  t: number;
  midiNote: number;
  freqHz?: number;
  velocity?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** MIDI note → frequency in Hz. */
function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Lazy Import ──────────────────────────────────────────────────────────

let _AudioContext: any = null;

async function loadAudioContext(): Promise<any> {
  if (!_AudioContext) {
    const mod = await import("node-web-audio-api");
    _AudioContext = mod.AudioContext;
  }
  return _AudioContext;
}

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Create a vocal tract engine powered by Pink Trombone.
 *
 * Monophonic physical model — one glottis + one tract = one voice.
 * Melody priority: tracks all held notes, always sounds the highest.
 * When the highest note releases, falls back to the next highest.
 * Implements VmpkConnector for drop-in use with any playback pipeline.
 */
export function createTractEngine(options?: TractEngineOptions): VmpkConnector & { debugLog: TractNoteEvent[] } {
  const {
    voice = "soprano",
    maxIntensity = 1.0,
    vibrato = true,
    autoWobble = false,
    debug = false,
  } = options ?? {};

  // Resolve voice preset, allow per-parameter overrides
  const preset = VOICE_PRESETS[voice];
  const tongueIndex = options?.tongueIndex ?? preset.tongueIndex;
  const tongueDiameter = options?.tongueDiameter ?? preset.tongueDiameter;
  const tractLength = options?.tractLength ?? preset.tractLength;
  const transpose = preset.transpose;

  const SAMPLE_RATE = 48000;
  // ScriptProcessorNode buffer size — 2048 samples = ~42ms at 48kHz
  // Larger = more latency but safer against underruns
  const BUFFER_SIZE = 2048;

  let ctx: any = null;
  let currentStatus: MidiStatus = "disconnected";
  let compressor: any = null;
  let master: any = null;
  let scriptNode: any = null;
  let synth: any = null;         // Pink Trombone Synthesizer instance
  let connectTime = 0;

  // Voicing state — melody priority (highest note wins)
  const heldNotes = new Map<number, number>();  // MIDI note → velocity
  let soundingNote: number | null = null;       // which note is currently sounding
  let targetGain = 0;                           // 0 = silent, >0 = sounding
  let currentGain = 0;                          // smoothed gain (avoids clicks)
  const GAIN_ATTACK_RATE = 0.005;               // gain increment per sample during attack
  const GAIN_RELEASE_RATE = 0.001;              // gain decrement per sample during release

  /** Find the highest held note and set it as the sounding note. */
  function updateSounding(): void {
    if (heldNotes.size === 0) {
      soundingNote = null;
      targetGain = 0;
      return;
    }
    // Pick the highest MIDI note (melody)
    let highest = -1;
    let highestVel = 0;
    for (const [note, vel] of heldNotes) {
      if (note > highest) {
        highest = note;
        highestVel = vel;
      }
    }
    if (highest !== soundingNote) {
      soundingNote = highest;
      const freq = midiToFreq(highest + transpose);
      synth.glottis.targetFrequency = freq;
    }
    const vel01 = highestVel / 127;
    targetGain = vel01 * maxIntensity;
    synth.glottis.isTouched = true;
  }

  const debugLog: TractNoteEvent[] = [];

  // ── Audio callback: fills buffers from Pink Trombone DSP ──

  function processAudio(event: any): void {
    if (!synth) return;
    const output = event.outputBuffer.getChannelData(0);
    const n = output.length;

    // Synthesize into a temp buffer (Pink Trombone writes mono Float32)
    const raw = new Float32Array(n);
    synth.synthesize(raw);

    // Apply gain envelope (smooth attack/release to avoid clicks)
    for (let i = 0; i < n; i++) {
      if (currentGain < targetGain) {
        currentGain = Math.min(currentGain + GAIN_ATTACK_RATE, targetGain);
      } else if (currentGain > targetGain) {
        currentGain = Math.max(currentGain - GAIN_RELEASE_RATE, targetGain);
      }
      output[i] = raw[i] * currentGain;
    }
  }

  // ── VmpkConnector Implementation ──

  return {
    async connect(): Promise<void> {
      if (currentStatus === "connected") return;
      currentStatus = "connecting";

      try {
        // 1. Create audio context
        const AC = await loadAudioContext();
        ctx = new AC({ sampleRate: SAMPLE_RATE, latencyHint: "playback" });

        // 2. Create Pink Trombone synthesizer
        synth = new Synthesizer(SAMPLE_RATE, tractLength);

        // Configure glottis from voice preset
        synth.glottis.alwaysVoice = true;
        synth.glottis.autoWobble = autoWobble;
        synth.glottis.vibratoAmount = vibrato ? preset.vibratoAmount : 0;
        synth.glottis.vibratoFrequency = preset.vibratoFrequency;
        synth.glottis.targetTenseness = preset.tenseness;
        synth.glottis.targetFrequency = 220; // idle at A3

        // Configure tract shape from voice preset
        synth.tractShaper.tongueIndex = tongueIndex;
        synth.tractShaper.tongueDiameter = tongueDiameter;
        synth.tractShaper.velumTarget = preset.velumTarget;

        // Warm up: run a few silent blocks to get intensity ramped
        const warmup = new Float32Array(512);
        for (let i = 0; i < 40; i++) {
          synth.synthesize(warmup);
        }

        // 3. Master chain: compressor → gain → speakers
        compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -12;
        compressor.knee.value = 10;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        master = ctx.createGain();
        master.gain.value = preset.masterGain;

        // 4. ScriptProcessorNode: bridge Pink Trombone DSP → Web Audio graph
        scriptNode = ctx.createScriptProcessor(BUFFER_SIZE, 0, 1);
        scriptNode.onaudioprocess = processAudio;

        // Chain: scriptNode → compressor → master → speakers
        scriptNode.connect(compressor);
        compressor.connect(master);
        master.connect(ctx.destination);

        connectTime = ctx.currentTime;
        currentStatus = "connected";
        console.error(`Tract engine connected (Pink Trombone ${voice}, ${SAMPLE_RATE}Hz, tract=${tractLength} cells, tenseness=${preset.tenseness})`);
      } catch (err) {
        currentStatus = "error";
        throw new Error(
          `Failed to start tract engine: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },

    async disconnect(): Promise<void> {
      heldNotes.clear();
      soundingNote = null;
      targetGain = 0;
      currentGain = 0;

      if (scriptNode) {
        scriptNode.onaudioprocess = null;
        try { scriptNode.disconnect(); } catch { /* ok */ }
        scriptNode = null;
      }
      if (compressor) {
        try { compressor.disconnect(); } catch { /* ok */ }
        compressor = null;
      }
      if (master) {
        try { master.disconnect(); } catch { /* ok */ }
        master = null;
      }
      if (ctx) {
        try { await ctx.close(); } catch { /* ok */ }
        ctx = null;
      }
      synth = null;
      currentStatus = "disconnected";
    },

    status(): MidiStatus {
      return currentStatus;
    },

    listPorts(): string[] {
      return ["Tract Engine (Pink Trombone)"];
    },

    noteOn(note: number, velocity: number, _channel?: number): void {
      if (!ctx || currentStatus !== "connected" || !synth) return;

      velocity = Math.max(1, Math.min(127, velocity));

      // Track this note as held
      heldNotes.set(note, velocity);

      // Melody priority: re-evaluate which note should sound
      updateSounding();

      if (debug) {
        debugLog.push({
          type: "on",
          t: +(ctx.currentTime - connectTime).toFixed(4),
          midiNote: note,
          freqHz: +midiToFreq(note).toFixed(2),
          velocity,
        });
      }
    },

    noteOff(note: number, _channel?: number): void {
      if (!ctx || currentStatus !== "connected") return;

      // Remove from held notes
      heldNotes.delete(note);

      // Melody priority: re-evaluate (may fall back to next highest, or silence)
      updateSounding();

      if (debug) {
        debugLog.push({
          type: "off",
          t: +(ctx.currentTime - connectTime).toFixed(4),
          midiNote: note,
        });
      }
    },

    allNotesOff(_channel?: number): void {
      heldNotes.clear();
      soundingNote = null;
      targetGain = 0;
      currentGain = 0;
    },

    async playNote(midiNote: MidiNote): Promise<void> {
      if (midiNote.note < 0) {
        await sleep(midiNote.durationMs);
        return;
      }
      this.noteOn(midiNote.note, midiNote.velocity, midiNote.channel);
      await sleep(midiNote.durationMs);
      this.noteOff(midiNote.note, midiNote.channel);
    },

    debugLog,
  };
}
