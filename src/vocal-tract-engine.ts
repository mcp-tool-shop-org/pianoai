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

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TractEngineOptions {
  /** Maximum intensity for velocity=127. Default: 1.0. */
  maxIntensity?: number;
  /** Enable natural vibrato from Pink Trombone. Default: true. */
  vibrato?: boolean;
  /** Enable Pink Trombone's auto wobble (pitch drift). Default: false. */
  autoWobble?: boolean;
  /** Tongue index (0–44). Controls vowel formant. Default: 20 ("aah"). */
  tongueIndex?: number;
  /** Tongue diameter (0–3.5). Controls openness. Default: 2.4 ("aah"). */
  tongueDiameter?: number;
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
    maxIntensity = 1.0,
    vibrato = true,
    autoWobble = false,
    tongueIndex = 20,
    tongueDiameter = 2.4,
    debug = false,
  } = options ?? {};

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
      const freq = midiToFreq(highest);
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
        synth = new Synthesizer(SAMPLE_RATE);

        // Configure glottis
        synth.glottis.alwaysVoice = true;
        synth.glottis.autoWobble = autoWobble;
        synth.glottis.vibratoAmount = vibrato ? 0.005 : 0;
        synth.glottis.vibratoFrequency = 6;
        synth.glottis.targetTenseness = 0.6;
        synth.glottis.targetFrequency = 220; // idle at A3

        // Configure tract shape (vowel "aah")
        synth.tractShaper.tongueIndex = tongueIndex;
        synth.tractShaper.tongueDiameter = tongueDiameter;

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
        master.gain.value = 2.5; // Pink Trombone output is quiet (~0.1–0.2 peak)

        // 4. ScriptProcessorNode: bridge Pink Trombone DSP → Web Audio graph
        scriptNode = ctx.createScriptProcessor(BUFFER_SIZE, 0, 1);
        scriptNode.onaudioprocess = processAudio;

        // Chain: scriptNode → compressor → master → speakers
        scriptNode.connect(compressor);
        compressor.connect(master);
        master.connect(ctx.destination);

        connectTime = ctx.currentTime;
        currentStatus = "connected";
        console.error(`Tract engine connected (Pink Trombone, ${SAMPLE_RATE}Hz, vibrato=${vibrato})`);
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
